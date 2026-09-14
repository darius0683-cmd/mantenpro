// Edge Function: send-web-push
// Envía una notificación push del navegador a todos los dispositivos que ese
// usuario tenga activados (tabla push_subscriptions).
//
// Requiere estos secrets:
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   (genera el par con: npx web-push generate-vapid-keys)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY -> automáticos

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

webpush.setVapidDetails(
  "mailto:soporte@tudominio.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

Deno.serve(async (req) => {
  try {
    const { profile_id, title, body } = await req.json();
    if (!profile_id || !title) {
      return new Response(JSON.stringify({ error: "Faltan datos (profile_id, title)" }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await supabase.from("profiles").select("notify_push").eq("id", profile_id).single();
    if (profile?.notify_push === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "Usuario desactivó notificaciones push" }), { status: 200 });
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("profile_id", profile_id);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "Sin dispositivos suscritos" }), { status: 200 });
    }

    const payload = JSON.stringify({ title, body: body || "" });
    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        )
      )
    );

    return new Response(JSON.stringify({ ok: true, sent: results.length }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
