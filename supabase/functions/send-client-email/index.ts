// Edge Function: send-client-email
// Envía un correo directo a la dirección indicada (recordatorios de pago desde Cuentas por
// Cobrar, informe de servicio de una orden). Solo la puede usar alguien con sesión en MantenPro.
//
// Secrets: RESEND_API_KEY, RESEND_FROM (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY automáticos)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { to, subject, text, html } = await req.json();
    if (!to || !subject) return json({ error: "Faltan datos (to, subject)" }, 400);
    // Un solo destinatario, con forma de correo
    if (typeof to !== "string" || to.length > 200 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to.trim())) return json({ error: "Correo de destino no válido" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const caller = await getCaller(req, supabase);
    if (!caller) return json({ error: "No autorizado" }, 401);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM") || "MantenPro <onboarding@resend.dev>";
    if (!resendKey) return json({ error: "Falta configurar RESEND_API_KEY" }, 500);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: to.trim(), subject: String(subject).slice(0, 200), text: String(text || ""), ...(html ? { html: String(html) } : {}) }),
    });
    if (!res.ok) return json({ error: `Resend: ${await res.text()}` }, 502);
    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
