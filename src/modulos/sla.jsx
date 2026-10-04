// SLA de las averías con contrato de servicio (contratos-servicio.sql).
// La base de datos guarda en cada avería: hora límite para llegar (sla_response_due) y para
// solucionar (sla_resolution_due), y cuándo se llegó (sla_responded_at) y se solucionó (sla_resolved_at).
import React, { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { C } from "./base.jsx";

export const SLA_PRIORITIES = [["critica", "Crítica"], ["alta", "Alta"], ["media", "Media"], ["baja", "Baja"]];

export function fmtSpan(ms) {
  const min = Math.max(0, Math.round(Math.abs(ms) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d} d ${hh} h` : `${d} d`;
}
export const fmtDueRD = (iso) => (iso ? new Date(iso).toLocaleString("es-DO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Santo_Domingo" }) : "—");

// Una parte del SLA (llegar o solucionar):
//   ok (en tiempo) · warn (queda menos del 25 %) · late (vencido, sin hacer) · met (cumplido) · missed (se hizo tarde)
export function slaPart(due, doneAt, startAt, now = Date.now()) {
  if (!due) return null;
  const d = new Date(due).getTime();
  if (doneAt) {
    const t = new Date(doneAt).getTime();
    return { state: t <= d ? "met" : "missed", due, doneAt, ms: t - new Date(startAt).getTime() };
  }
  const s = new Date(startAt || due).getTime();
  if (now > d) return { state: "late", due, msOver: now - d };
  if (now >= d - (d - s) * 0.25) return { state: "warn", due, msLeft: d - now };
  return { state: "ok", due, msLeft: d - now };
}

export function incidentSla(inc, now = Date.now()) {
  if (!inc?.service_contract_id) return null;
  // Pasada a cotización (convertida sin orden) también cierra el SLA
  const closed = ["resuelto", "descartado"].includes(inc.status) || (inc.status === "convertido" && !inc.work_order_id);
  const response = slaPart(inc.sla_response_due, inc.sla_responded_at || (closed ? inc.completed_at || inc.sla_resolved_at : null), inc.created_at, now);
  const resolution = inc.status === "descartado" ? null : slaPart(inc.sla_resolution_due, inc.sla_resolved_at, inc.created_at, now);
  return { response, resolution };
}

export const SLA_COLOR = { ok: C.green, warn: C.orange, late: C.red, met: C.green, missed: C.red };

export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

function partText(label, p) {
  if (!p) return null;
  if (p.state === "met") return `${label}: a tiempo`;
  if (p.state === "missed") return `${label}: fuera de tiempo`;
  if (p.state === "late") return `${label}: vencido hace ${fmtSpan(p.msOver)}`;
  return `${label}: faltan ${fmtSpan(p.msLeft)}`;
}

// Etiqueta corta para la tarjeta de la avería: muestra lo más urgente que falta
export function SlaBadge({ incident }) {
  const now = useNow();
  const sla = incidentSla(incident, now);
  if (!sla || (!sla.response && !sla.resolution)) return null;
  const pending = [["Llegar", sla.response], ["Solucionar", sla.resolution]].find(([, p]) => p && ["ok", "warn", "late"].includes(p.state));
  let text, color;
  if (pending) { text = partText(pending[0], pending[1]); color = SLA_COLOR[pending[1].state]; }
  else {
    const missed = [sla.response, sla.resolution].some((p) => p?.state === "missed");
    text = missed ? "SLA incumplido" : "SLA cumplido"; color = missed ? C.red : C.green;
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold" style={{ color, border: `1px solid ${color}60`, background: color + "14" }}>
      <Timer size={11} /> {text}
    </span>
  );
}

// Detalle en la ficha de la avería
export function SlaDetail({ incident, contractLabel }) {
  const now = useNow();
  const sla = incidentSla(incident, now);
  if (!sla) return null;
  const row = (label, p, doneLabel) => (
    <div className="flex items-center justify-between gap-2 py-1">
      <div style={{ color: C.muted }}>{label}</div>
      {!p ? <div style={{ color: C.muted }}>sin tiempo definido</div> : (
        <div className="text-right">
          <span className="font-semibold" style={{ color: SLA_COLOR[p.state] }}>
            {p.state === "met" ? "A tiempo" : p.state === "missed" ? "Fuera de tiempo" : p.state === "late" ? `Vencido hace ${fmtSpan(p.msOver)}` : `Faltan ${fmtSpan(p.msLeft)}`}
          </span>
          <div className="text-[11px]" style={{ color: C.muted }}>
            límite {fmtDueRD(p.due)}{p.doneAt ? ` · ${doneLabel} ${fmtDueRD(p.doneAt)}` : ""}
          </div>
        </div>
      )}
    </div>
  );
  return (
    <div className="mb-4 p-3 text-xs" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-1.5 uppercase tracking-wide mb-1" style={{ color: C.muted }}><Timer size={13} /> SLA del contrato {contractLabel || ""}</div>
      {row("Llegar", sla.response, "llegó")}
      {incident.status !== "descartado" && row("Solucionar", sla.resolution, "solucionada")}
    </div>
  );
}
