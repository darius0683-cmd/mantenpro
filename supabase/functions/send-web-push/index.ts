// Edge Function: send-web-push
// Envía una notificación push del navegador a todos los dispositivos que ese
// usuario tenga activados (tabla push_subscriptions).
// Solo la puede usar alguien con sesión en MantenPro, y solo para avisar a gente de su empresa.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY automáticos)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

webpush.setVapidDetails(
  "mailto:soporte@manticrd.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Quién llama: un usuario con sesión y perfil activo en MantenPro (o el sistema con la clave
// de servicio). Antes la función no lo revisaba y cualquiera con la clave pública de la app
// podía usarla para mandar correos/avisos.
// deno-lint-ignore no-explicit-any
async function getCaller(req: Request, supabase: any) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  if (jwt === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return { system: true, company_id: null };
  const { data } = await supabase.auth.getUser(jwt);
  if (!data?.user) return null;
  const { data: me } = await supabase.from("profiles").select("id, company_id, is_active").eq("id", data.user.id).maybeSingle();
  if (!me || me.is_active === false) return null;
  return { system: false, company_id: me.company_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { profile_id, title, body } = await req.json();
    if (!profile_id || !title) return json({ error: "Faltan datos (profile_id, title)" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const caller = await getCaller(req, supabase);
    if (!caller) return json({ error: "No autorizado" }, 401);

    const { data: profile } = await supabase.from("profiles").select("notify_push, company_id").eq("id", profile_id).maybeSingle();
    if (!profile) return json({ error: "Usuario no encontrado" }, 404);
    if (!caller.system && profile.company_id !== caller.company_id) return json({ error: "No autorizado" }, 403);
    if (profile.notify_push === false) return json({ skipped: true, reason: "Usuario desactivó notificaciones push" });

    const { data: subs, error } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("profile_id", profile_id);
    if (error) return json({ error: error.message }, 500);
    if (!subs || subs.length === 0) return json({ skipped: true, reason: "Sin dispositivos suscritos" });

    const payload = JSON.stringify({ title: String(title).slice(0, 200), body: String(body || "").slice(0, 500) });
    const results = await Promise.allSettled(
      subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload))
    );
    return json({ ok: true, sent: results.filter((r) => r.status === "fulfilled").length });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
