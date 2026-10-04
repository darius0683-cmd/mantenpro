// Edge Function: portal-notify
// Cuando un cliente reporta una avería desde su portal (sin iniciar sesión), avisa por
// correo y push a los administradores y supervisores de la empresa.
//
// No necesita sesión: recibe el enlace del portal (token) y el id del incidente, y solo
// avisa si el incidente vino de ESE enlace, es de los últimos 15 minutos y todavía no se
// avisó (columna incidents.portal_notified_at). Así nadie puede usarla para mandar correos.
//
// Secrets (los mismos que ya usan send-notification-email y send-web-push):
//   RESEND_API_KEY, RESEND_FROM, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
//   APP_URL (opcional, por defecto https://app.manticrd.com)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY -> automáticos

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { token, incident_id } = await req.json();
    if (!token || typeof token !== "string" || token.length < 32 || !incident_id) return json({ error: "Faltan datos" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: link } = await supabase.from("client_portal_links").select("id, company_id, client_id").eq("token", token).is("revoked_at", null).maybeSingle();
    if (!link) return json({ error: "Enlace no válido" }, 403);

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    // Se marca como avisado en el mismo paso: si dos llamadas llegan juntas, solo una avisa.
    const { data: marked } = await supabase.from("incidents")
      .update({ portal_notified_at: new Date().toISOString() })
      .eq("id", incident_id).eq("portal_link_id", link.id).is("portal_notified_at", null).gte("created_at", since)
      .select("id, title, description, reported_by, equipment_id");
    const inc = marked?.[0];
    if (!inc) return json({ skipped: true });

    const [{ data: client }, { data: company }, { data: eq }, { data: staff }] = await Promise.all([
      supabase.from("clients").select("name").eq("id", link.client_id).maybeSingle(),
      supabase.from("companies").select("name").eq("id", link.company_id).maybeSingle(),
      inc.equipment_id ? supabase.from("equipment").select("name").eq("id", inc.equipment_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("profiles").select("id, email, notify_email, notify_push, is_active, role").eq("company_id", link.company_id).in("role", ["admin", "supervisor"]),
    ]);
    const people = (staff || []).filter((p) => p.is_active !== false);
    const clientName = client?.name || "Un cliente";
    const title = `Avería reportada por ${clientName}`;
    const appUrl = Deno.env.get("APP_URL") || "https://app.manticrd.com";
    const lines = [
      `${clientName} reportó una avería desde su portal.`,
      "",
      `Qué pasa: ${inc.title}`,
      eq?.name ? `Equipo: ${eq.name}` : null,
      inc.description ? `Detalles: ${inc.description}` : null,
      inc.reported_by ? `Reportado por: ${inc.reported_by.replace(/^Portal( — )?/, "") || "—"}` : null,
      "",
      `Ver en MantenPro: ${appUrl}/?view=incidents`,
      "",
      `— ${company?.name || "MantenPro"}`,
    ].filter((l) => l !== null).join("\n");

    let emails = 0, pushes = 0;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM") || "MantenPro <onboarding@resend.dev>";
    if (resendKey) {
      await Promise.allSettled(people.filter((p) => p.email && p.notify_email !== false).map(async (p) => {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: p.email, subject: `${title}: ${inc.title}`, text: lines }),
        });
        if (r.ok) emails++;
      }));
    }

    const vapidPub = Deno.env.get("VAPID_PUBLIC_KEY"), vapidPriv = Deno.env.get("VAPID_PRIVATE_KEY");
    const pushIds = people.filter((p) => p.notify_push !== false).map((p) => p.id);
    if (vapidPub && vapidPriv && pushIds.length) {
      webpush.setVapidDetails("mailto:soporte@manticrd.com", vapidPub, vapidPriv);
      const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").in("profile_id", pushIds);
      const payload = JSON.stringify({ title, body: inc.title });
      const res = await Promise.allSettled((subs || []).map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)));
      pushes = res.filter((r) => r.status === "fulfilled").length;
    }

    // Marca los avisos de la campana de este incidente como enviados por correo
    if (emails > 0) {
      await supabase.from("notifications").update({ email_status: "sent" })
        .eq("company_id", link.company_id).eq("category", "incident_portal").eq("body", inc.title).gte("created_at", since).is("email_status", null);
    }
    return json({ ok: true, emails, pushes });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
