// Edge Function: sla-monitor
// La llama la base de datos cada 10 minutos (pg_cron, ver la parte 6 de contratos-servicio.sql).
// Revisa las averías con contrato de servicio cuyo SLA está por vencer o vencido; la base de datos
// (sla_collect_alerts) crea los avisos de la campanita y marca lo avisado para no repetirlo, y
// esta función manda la notificación push y el correo a cada persona.
//
// Secrets: SLA_CRON_SECRET (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY automáticos)
// Publicar con:  supabase functions deploy sla-monitor --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const secret = Deno.env.get("SLA_CRON_SECRET") || "";
  // Solo el reloj de la base de datos (con la clave secreta) o el sistema (clave de servicio)
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const cronOk = secret.length >= 16 && req.headers.get("x-cron-secret") === secret;
  if (!cronOk && bearer !== service) return json({ error: "No autorizado" }, 401);

  try {
    const supabase = createClient(url, service);
    const { data, error } = await supabase.rpc("sla_collect_alerts");
    if (error) return json({ error: error.message }, 500);
    const rows: { notification_id: string; profile_id: string; title: string; body: string }[] = data || [];
    if (rows.length === 0) return json({ ok: true, alerts: 0 });

    const ids = [...new Set(rows.map((r) => r.profile_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, notify_push, notify_email").in("id", ids);
    const pref = new Map((profiles || []).map((p: { id: string; notify_push: boolean | null; notify_email: boolean | null }) => [p.id, p]));

    // "sent" | "skipped" (sin dispositivos o lo tiene apagado) | "failed"
    const callFn = (name: string, body: unknown) =>
      fetch(`${url}/functions/v1/${name}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(async (r) => {
        if (!r.ok) return "failed";
        const j = await r.json().catch(() => ({}));
        return j?.skipped ? "skipped" : "sent";
      }).catch(() => "failed");

    await Promise.allSettled(rows.map(async (r) => {
      const p = pref.get(r.profile_id);
      const patch: Record<string, string> = {};
      if (p?.notify_push !== false) {
        patch.push_status = await callFn("send-web-push", { profile_id: r.profile_id, title: r.title, body: r.body });
      }
      if (p?.notify_email !== false) {
        patch.email_status = await callFn("send-notification-email", { notification_id: r.notification_id, to_profile_id: r.profile_id, title: r.title, body: r.body });
      }
      if (Object.keys(patch).length) await supabase.from("notifications").update(patch).eq("id", r.notification_id);
    }));
    return json({ ok: true, alerts: rows.length });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
