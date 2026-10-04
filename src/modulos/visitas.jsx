// Llegada y salida del técnico (visitas a la orden de trabajo).
// - OrderVisitsSection: dentro del detalle de la orden. El técnico asignado marca "Llegué" y
//   "Terminé"; se guarda la hora del servidor y la ubicación del celular (visitas-tecnicos.sql).
// - VisitsReportModal: horas en sitio por técnico en un rango de fechas (para nómina / costos),
//   con detalle, impresión y Excel.
import React, { useEffect, useMemo, useState } from "react";
import { Clock, Download, LogIn, LogOut, MapPin, Printer, Trash2, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { C, Field, Modal, addDaysToDateStr, fmtDate, inputClass, inputStyle, loadXlsx, printDocument, todayStrRD } from "./base.jsx";

// Ubicación del celular. Si no hay permiso o no responde, se sigue sin ubicación.
export function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ error: "Este dispositivo no da la ubicación" });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      (err) => resolve({ error: err.code === 1 ? "No diste permiso de ubicación" : "No se pudo obtener la ubicación" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

export const visitMs = (v, now = Date.now()) => Math.max(0, (v.check_out_at ? new Date(v.check_out_at).getTime() : now) - new Date(v.check_in_at).getTime());
export const msToHours = (ms) => ms / 3600000;
export const roundQuarter = (h) => Math.round(h * 4) / 4;
export function fmtDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santo_Domingo" }) : "—");
const dayRD = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" });
const mapUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

function Where({ lat, lng, accuracy, label }) {
  if (lat == null || lng == null) return <span className="text-[11px]" style={{ color: C.orange }}>{label}: sin ubicación</span>;
  return (
    <a href={mapUrl(lat, lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11px]" style={{ color: C.amber }}>
      <MapPin size={11} /> {label}{accuracy > 100 ? ` (±${accuracy} m)` : ""}
    </a>
  );
}

export function OrderVisitsSection({ order, techName, myTechnicianId, assignedTechIds, canManage, readOnly, onApplyHours, onOrderStatusChange, onVisitsChanged }) {
  const [visits, setVisits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    const { data, error } = await supabase.from("work_order_visits").select("*").eq("work_order_id", order.id).order("check_in_at");
    if (error) { setVisits([]); if (/work_order_visits/.test(error.message)) setErr("Falta correr visitas-tecnicos.sql en Supabase."); return; }
    setVisits(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [order.id]);
  const hasOpen = (visits || []).some((v) => !v.check_out_at);
  useEffect(() => {
    if (!hasOpen) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [hasOpen]);

  const assigned = myTechnicianId && (assignedTechIds || []).includes(myTechnicianId);
  const myOpen = (visits || []).find((v) => v.technician_id === myTechnicianId && !v.check_out_at);

  const mark = async (kind) => {
    setBusy(true); setErr(""); setMsg("Obteniendo tu ubicación…");
    const pos = await getPosition();
    setMsg(kind === "in" ? "Marcando llegada…" : "Marcando salida…");
    const fn = kind === "in" ? "visit_check_in" : "visit_check_out";
    const { data, error } = await supabase.rpc(fn, { p_order: order.id, p_lat: pos.lat ?? null, p_lng: pos.lng ?? null, p_accuracy: pos.accuracy ?? null });
    setBusy(false);
    if (error) { setMsg(""); setErr(error.message); return; }
    setMsg(pos.error ? `${kind === "in" ? "Llegada" : "Salida"} marcada, pero ${pos.error.toLowerCase()}.` : `${kind === "in" ? "Llegada" : "Salida"} marcada con tu ubicación.`);
    if (kind === "in" && data?.order_status && data.order_status !== order.status) onOrderStatusChange && onOrderStatusChange(order, data.order_status);
    await load();
    onVisitsChanged && onVisitsChanged();
  };

  const closeManually = async (v) => {
    const suggested = new Date().toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Santo_Domingo" });
    const answer = window.prompt(`¿A qué hora salió ${techName(v.technician_id)}? (formato 24 h, del día ${fmtDate(dayRD(v.check_in_at))})`, suggested);
    if (!answer) return;
    const mt = answer.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!mt) { setErr("Escribe la hora así: 17:30"); return; }
    const out = new Date(`${dayRD(v.check_in_at)}T${mt[1].padStart(2, "0")}:${mt[2]}:00-04:00`);
    if (isNaN(out) || out < new Date(v.check_in_at) || out > new Date()) { setErr("La hora de salida tiene que ser después de la llegada y no puede ser futura."); return; }
    const { error } = await supabase.from("work_order_visits").update({ check_out_at: out.toISOString(), manual_out: true }).eq("id", v.id);
    if (error) { setErr(error.message); return; }
    await load(); onVisitsChanged && onVisitsChanged();
  };
  const remove = async (v) => {
    if (!window.confirm(`¿Borrar esta visita de ${techName(v.technician_id)}?`)) return;
    const { error } = await supabase.from("work_order_visits").delete().eq("id", v.id);
    if (error) { setErr(error.message); return; }
    await load(); onVisitsChanged && onVisitsChanged();
  };

  const totals = useMemo(() => {
    const m = new Map();
    (visits || []).forEach((v) => m.set(v.technician_id, (m.get(v.technician_id) || 0) + visitMs(v, now)));
    return [...m.entries()].map(([techId, ms]) => ({ techId, ms, hours: roundQuarter(msToHours(ms)) }));
  }, [visits, now]);
  const allClosed = (visits || []).length > 0 && !hasOpen;

  if (visits === null) return null;
  if (!assigned && visits.length === 0 && !err) return null;

  return (
    <div className="mb-4 p-3" style={{ background: C.panelAlt, border: `1px solid ${myOpen ? C.green : C.border}` }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs uppercase tracking-wide flex items-center gap-1.5" style={{ color: C.muted }}><Clock size={13} /> Llegada y salida</div>
        {myOpen && <div className="text-xs font-semibold" style={{ color: C.green }}>En sitio · {fmtDuration(visitMs(myOpen, now))}</div>}
      </div>

      {assigned && order.status !== "completada" && (
        myOpen ? (
          <button onClick={() => mark("out")} disabled={busy} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold mb-2 disabled:opacity-60" style={{ background: C.red, color: "#fff" }}>
            <LogOut size={17} /> {busy ? msg || "…" : `Terminé (llegaste a las ${fmtTime(myOpen.check_in_at)})`}
          </button>
        ) : (
          <button onClick={() => mark("in")} disabled={busy} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold mb-2 disabled:opacity-60" style={{ background: C.green, color: "#0B1F13" }}>
            <LogIn size={17} /> {busy ? msg || "…" : "Llegué"}
          </button>
        )
      )}
      {!busy && msg && <div className="text-xs mb-2" style={{ color: /pero/.test(msg) ? C.orange : C.green }}>{msg}</div>}
      {err && <div className="text-xs mb-2" style={{ color: C.red }}>{err}</div>}

      {visits.length > 0 && (
        <div className="space-y-1">
          {visits.map((v) => (
            <div key={v.id} className="flex items-center gap-2 px-2 py-1.5 text-xs flex-wrap" style={{ background: C.panel }}>
              <div className="font-semibold" style={{ color: C.text, minWidth: 90 }}>{techName(v.technician_id)}</div>
              <div style={{ color: C.muted }}>{fmtDate(dayRD(v.check_in_at))} · {fmtTime(v.check_in_at)} → {v.check_out_at ? fmtTime(v.check_out_at) : <span style={{ color: C.green }}>en sitio</span>}</div>
              <div className="font-mono" style={{ color: C.text }}>{fmtDuration(visitMs(v, now))}</div>
              {v.manual_out && <span style={{ color: C.orange }}>salida puesta a mano</span>}
              <div className="flex items-center gap-2 ml-auto">
                <Where lat={v.check_in_lat} lng={v.check_in_lng} accuracy={v.check_in_accuracy} label="llegada" />
                {v.check_out_at && !v.manual_out && <Where lat={v.check_out_lat} lng={v.check_out_lng} accuracy={v.check_out_accuracy} label="salida" />}
                {canManage && !v.check_out_at && <button onClick={() => closeManually(v)} className="text-[11px] underline" style={{ color: C.orange }}>poner salida</button>}
                {canManage && <button onClick={() => remove(v)} title="Borrar visita" style={{ color: C.muted }}><Trash2 size={12} /></button>}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
            <div className="text-xs" style={{ color: C.muted }}>
              Horas en sitio: {totals.map((t) => <span key={t.techId} className="mr-2"><span style={{ color: C.text }}>{techName(t.techId)}</span> {t.hours} h</span>)}
            </div>
            {allClosed && onApplyHours && !readOnly && (
              <button onClick={() => onApplyHours(totals)} className="text-xs font-semibold" style={{ color: C.amber }}>Usar estas horas en mano de obra</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reporte: horas en sitio por técnico
// ---------------------------------------------------------------------------
export function VisitsReportModal({ technicians, orders, companyName, onClose }) {
  const [from, setFrom] = useState(() => addDaysToDateStr(todayStrRD(), -14));
  const [to, setTo] = useState(() => todayStrRD());
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const techName = (id) => technicians.find((t) => t.id === id)?.name || "—";
  const orderOf = (id) => orders.find((o) => o.id === id);

  useEffect(() => {
    let active = true;
    setRows(null); setErr("");
    // Rango en hora de RD (UTC-4)
    supabase.from("work_order_visits").select("*")
      .gte("check_in_at", `${from}T00:00:00-04:00`).lte("check_in_at", `${to}T23:59:59-04:00`).order("check_in_at")
      .then(({ data, error }) => { if (!active) return; if (error) { setErr(error.message); setRows([]); } else setRows(data || []); });
    return () => { active = false; };
  }, [from, to]);

  const byTech = useMemo(() => {
    const m = new Map();
    (rows || []).forEach((v) => {
      const cur = m.get(v.technician_id) || { techId: v.technician_id, ms: 0, visits: 0, open: 0, noGps: 0, days: new Set() };
      if (v.check_out_at) cur.ms += visitMs(v); else cur.open++;
      cur.visits++; cur.days.add(dayRD(v.check_in_at));
      if (v.check_in_lat == null) cur.noGps++;
      m.set(v.technician_id, cur);
    });
    return [...m.values()].sort((a, b) => techName(a.techId).localeCompare(techName(b.techId), "es"));
    // eslint-disable-next-line
  }, [rows]);

  const detail = (rows || []).map((v) => {
    const o = orderOf(v.work_order_id);
    return {
      "Técnico": techName(v.technician_id), "Fecha": dayRD(v.check_in_at), "Orden": o?.code || "", "Trabajo": o?.title || "",
      "Llegada": fmtTime(v.check_in_at), "Salida": v.check_out_at ? fmtTime(v.check_out_at) : "(abierta)",
      "Horas": v.check_out_at ? Math.round(msToHours(visitMs(v)) * 100) / 100 : "",
      "Ubicación llegada": v.check_in_lat != null ? mapUrl(v.check_in_lat, v.check_in_lng) : "sin ubicación",
      "Salida a mano": v.manual_out ? "Sí" : "",
    };
  });

  const exportExcel = async () => {
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    const resumen = byTech.map((t) => ({ "Técnico": techName(t.techId), "Días con visitas": t.days.size, "Visitas": t.visits, "Horas en sitio": Math.round(msToHours(t.ms) * 100) / 100, "Visitas sin cerrar": t.open, "Sin ubicación": t.noGps }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Detalle");
    XLSX.writeFile(wb, `horas-en-sitio-${from}-a-${to}.xlsx`);
  };
  const print = () => {
    const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const resumen = byTech.map((t) => `<tr><td>${esc(techName(t.techId))}</td><td style="text-align:right">${t.days.size}</td><td style="text-align:right">${t.visits}</td><td style="text-align:right"><b>${(Math.round(msToHours(t.ms) * 100) / 100).toFixed(2)}</b></td><td style="text-align:right">${t.open || ""}</td></tr>`).join("");
    const det = detail.map((d) => `<tr><td>${esc(d["Técnico"])}</td><td>${fmtDate(d["Fecha"])}</td><td>${esc(d["Orden"])}</td><td>${esc(d["Llegada"])}</td><td>${esc(d["Salida"])}</td><td style="text-align:right">${d["Horas"] === "" ? "" : Number(d["Horas"]).toFixed(2)}</td></tr>`).join("");
    printDocument("Horas en sitio", `<h1>${esc(companyName)}</h1><div class="muted">Horas en sitio por técnico · ${fmtDate(from)} al ${fmtDate(to)}</div>
      <table><thead><tr><th>Técnico</th><th>Días</th><th>Visitas</th><th>Horas</th><th>Sin cerrar</th></tr></thead><tbody>${resumen}</tbody></table>
      <div style="margin-top:16px;font-weight:bold">Detalle</div>
      <table><thead><tr><th>Técnico</th><th>Fecha</th><th>Orden</th><th>Llegada</th><th>Salida</th><th>Horas</th></tr></thead><tbody>${det}</tbody></table>`);
  };

  return (
    <Modal title="Horas en sitio por técnico" onClose={onClose} wide>
      <div className="text-xs mb-3" style={{ color: C.muted }}>Sale de las llegadas y salidas que marcan los técnicos en cada orden. Sirve para la nómina (horas trabajadas) y para revisar visitas.</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde"><input type="date" className={inputClass} style={inputStyle} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><input type="date" className={inputClass} style={inputStyle} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {err && <div className="text-xs mb-2" style={{ color: C.red }}>{/work_order_visits/.test(err) ? "Falta correr visitas-tecnicos.sql en Supabase." : err}</div>}
      {rows === null ? <div className="text-sm py-4" style={{ color: C.muted }}>Cargando…</div> : (
        <>
          <div className="overflow-x-auto mb-3" style={{ border: `1px solid ${C.border}` }}>
            <div className="grid grid-cols-12 gap-2 min-w-[520px] px-3 py-2 text-[11px] uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
              <div className="col-span-4">Técnico</div><div className="col-span-2 text-right">Días</div><div className="col-span-2 text-right">Visitas</div><div className="col-span-2 text-right">Horas</div><div className="col-span-2 text-right">Sin cerrar</div>
            </div>
            {byTech.map((t) => (
              <div key={t.techId} className="grid grid-cols-12 gap-2 min-w-[520px] px-3 py-2 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                <div className="col-span-4 truncate">{techName(t.techId)}{t.noGps > 0 && <span className="text-[11px] ml-1" style={{ color: C.orange }}>({t.noGps} sin ubicación)</span>}</div>
                <div className="col-span-2 text-right font-mono">{t.days.size}</div>
                <div className="col-span-2 text-right font-mono">{t.visits}</div>
                <div className="col-span-2 text-right font-mono font-semibold">{(Math.round(msToHours(t.ms) * 100) / 100).toFixed(2)}</div>
                <div className="col-span-2 text-right font-mono" style={{ color: t.open ? C.orange : C.muted }}>{t.open || "—"}</div>
              </div>
            ))}
            {byTech.length === 0 && <div className="px-3 py-6 text-center text-sm" style={{ color: C.muted }}>No hay visitas en esas fechas.</div>}
          </div>
          {byTech.some((t) => t.open) && <div className="text-xs mb-3" style={{ color: C.orange }}>Las visitas sin cerrar no suman horas. Un supervisor puede ponerles la salida desde la orden.</div>}
        </>
      )}
      <div className="flex justify-end gap-2 flex-wrap">
        <button onClick={print} disabled={!rows?.length} className="flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.text }}><Printer size={14} /> Imprimir</button>
        <button onClick={exportExcel} disabled={!rows?.length} className="flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.text }}><Download size={14} /> Excel</button>
        <button onClick={onClose} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}><X size={14} /> Cerrar</button>
      </div>
    </Modal>
  );
}
