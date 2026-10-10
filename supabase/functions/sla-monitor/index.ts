// Edge Function: sla-monitor
// La llama la base de datos cada 10 minutos (pg_cron, ver la parte 6 de contratos-servicio.sql).
// Revisa las averías con contrato de servicio cuyo SLA está por vencer o vencido; la base de datos
// (sla_collect_alerts) crea los avisos de la campanita y marca lo avisado para no repetirlo, y
// esta función manda la notificación push y el correo a cada persona.
//
// Además, una vez al día (desde las 6:00 hora RD) llama a mp_daily_tasks (parte-b-mantenimiento-
// automatico.sql): crea las órdenes de mantenimiento vencidas y manda los avisos de órdenes nuevas,
// atrasadas y el resumen del día. La base de datos lleva la cuenta de si ya corrió hoy.
//
// También avisa a los administradores de las pymes en prueba gratis cuando faltan 5 días y
// cuando la prueba termina (mp_collect_trial_notices, pyme-edicion.sql).
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
    type Row = { notification_id: string; profile_id: string; title: string; body: string };
    const rows: Row[] = data || [];
    // Tarea del día: si todavía no existe (falta correr el SQL) o falla, el SLA sigue igual
    let dailyError: string | null = null;
    const daily = await supabase.rpc("mp_daily_tasks");
    if (daily.error) dailyError = daily.error.message;
    else rows.push(...((daily.data || []) as Row[]));
    // Avisos de material anotado por técnicos (parte-c): ya están en la campanita, faltan push y correo
    const pend = await supabase.rpc("mp_collect_pending_push");
    if (!pend.error) rows.push(...((pend.data || []) as Row[]));
    // Prueba gratis de la edición Pyme (pyme-edicion.sql): aviso a 5 días de vencer y al vencer
    const trial = await supabase.rpc("mp_collect_trial_notices");
    if (!trial.error) rows.push(...((trial.data || []) as Row[]));
    if (rows.length === 0) return json({ ok: true, alerts: 0, dailyError });

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
      patch.push_status = p?.notify_push !== false
        ? await callFn("send-web-push", { profile_id: r.profile_id, title: r.title, body: r.body })
        : "skipped";
      patch.email_status = p?.notify_email !== false
        ? await callFn("send-notification-email", { notification_id: r.notification_id, to_profile_id: r.profile_id, title: r.title, body: r.body })
        : "skipped";
      if (Object.keys(patch).length) await supabase.from("notifications").update(patch).eq("id", r.notification_id);
    }));
    return json({ ok: true, alerts: rows.length, dailyError });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
