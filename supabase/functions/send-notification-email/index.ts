// Edge Function: send-notification-email
// Envía un correo a un usuario interno de MantenPro (admin/supervisor/técnico/vendedor)
// buscando su email en la tabla profiles a partir del profile_id.
//
// Requiere estos secrets configurados en Supabase (Project Settings > Edge Functions > Secrets,
// o vía CLI: supabase secrets set NOMBRE=valor):
//   RESEND_API_KEY            -> tu API key de https://resend.com (tiene plan gratis)
//   RESEND_FROM               -> remitente verificado, ej. "MantenPro <notificaciones@tudominio.com>"
//   SUPABASE_URL              -> ya viene configurado automáticamente por Supabase
//   SUPABASE_SERVICE_ROLE_KEY -> ya viene configurado automáticamente por Supabase

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const { to_profile_id, title, body } = await req.json();
    if (!to_profile_id || !title) {
      return new Response(JSON.stringify({ error: "Faltan datos (to_profile_id, title)" }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, notify_email")
      .eq("id", to_profile_id)
      .single();

    if (profileError || !profile?.email) {
      return new Response(JSON.stringify({ error: "No se encontró el correo de ese usuario" }), { status: 404 });
    }
    if (profile.notify_email === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "Usuario desactivó notificaciones por correo" }), { status: 200 });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM") || "MantenPro <onboarding@resend.dev>";
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "Falta configurar RESEND_API_KEY" }), { status: 500 });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: profile.email,
        subject: title,
        text: body || "",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: `Resend: ${errText}` }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
