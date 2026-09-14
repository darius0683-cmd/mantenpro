// Edge Function: send-client-email
// Envía un correo directo a la dirección indicada (usado para recordatorios de
// pago a clientes desde Cuentas por Cobrar). No busca nada en la base de datos,
// solo reenvía lo que la app ya preparó.
//
// Requiere los mismos secrets que send-notification-email:
//   RESEND_API_KEY
//   RESEND_FROM

Deno.serve(async (req) => {
  try {
    const { to, subject, text } = await req.json();
    if (!to || !subject) {
      return new Response(JSON.stringify({ error: "Faltan datos (to, subject)" }), { status: 400 });
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
      body: JSON.stringify({ from, to, subject, text: text || "" }),
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
