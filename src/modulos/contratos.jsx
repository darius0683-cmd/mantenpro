// Contratos de servicio con SLA (Departamento Técnico) — ver contratos-servicio.sql
// - VistaServiceContracts: lista de contratos con lo que va del mes.
// - ServiceContractFormModal: crear / editar (cliente, iguala, equipos, visitas incluidas, SLA).
// - ServiceContractDetailModal: reporte del mes para el cliente (imprimir / PDF).
//
// El contrato cubre preventivos, predictivos y emergencias (averías). Los correctivos NO entran:
// sus órdenes quedan como "fuera de contrato" para cobrarlas aparte.
import React, { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, FileText, Pencil, Plus, Printer, ScrollText, Trash2 } from "lucide-react";
import { C, Field, Modal, Pill, SearchSelect, fmtDate, fmtMoney, inputClass, inputStyle, printDocument, todayStrRD } from "./base.jsx";
import { SLA_PRIORITIES, fmtDueRD, fmtSpan, incidentSla, useNow } from "./sla.jsx";

export const CONTRACT_STATUS_CFG = {
  activo: { label: "Activo", color: C.green },
  pausado: { label: "Pausado", color: C.orange },
  terminado: { label: "Terminado", color: C.muted },
};
const DEFAULT_SLA = { critica: { response: 2, resolution: 8 }, alta: { response: 4, resolution: 24 }, media: { response: 8, resolution: 48 }, baja: { response: 24, resolution: 72 } };

const monthRD = (iso) => (iso ? (iso.length <= 10 ? iso.slice(0, 7) : new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" }).slice(0, 7)) : "");
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthLabel = (ym) => { const [y, m] = (ym || "").split("-").map(Number); return y && m ? `${MONTHS[m - 1]} ${y}` : ""; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Lo del mes de un contrato
export function contractMonthStats(contract, orders, incidents, month, now = Date.now()) {
  const ords = (orders || []).filter((o) => o.service_contract_id === contract.id);
  const doneIn = (o) => o.status === "completada" && monthRD(o.completed_at || o.scheduled) === month;
  const plannedIn = (o) => monthRD(o.scheduled || o.created_at) === month;
  // Las órdenes que salieron de una avería cuentan como emergencia, no como visita
  const byType = (t) => ({
    done: ords.filter((o) => o.type === t && o.contract_coverage === "incluido" && doneIn(o)),
    planned: ords.filter((o) => o.type === t && o.contract_coverage === "incluido" && plannedIn(o)),
  });
  const incs = (incidents || []).filter((i) => i.service_contract_id === contract.id && monthRD(i.created_at) === month && i.status !== "descartado");
  const tally = (key) => {
    const r = { met: 0, missed: 0, pending: 0, late: 0 };
    incs.forEach((i) => {
      const p = incidentSla(i, now)?.[key];
      if (!p) return;
      if (p.state === "met") r.met++;
      else if (p.state === "missed") r.missed++;
      else if (p.state === "late") { r.late++; r.missed++; }
      else r.pending++;
    });
    r.pct = r.met + r.missed > 0 ? Math.round((r.met / (r.met + r.missed)) * 100) : null;
    return r;
  };
  const outside = ords.filter((o) => o.contract_coverage === "fuera" && monthRD(o.completed_at || o.scheduled || o.created_at) === month);
  const emergencies = incs.length;
  const extra = contract.emergencies_per_month != null ? Math.max(0, emergencies - contract.emergencies_per_month) : 0;
  return { preventive: byType("preventivo"), predictive: byType("predictivo"), incidents: incs, emergencies, extra, response: tally("response"), resolution: tally("resolution"), outside };
}

// Averías abiertas del contrato por vencer / vencidas
function openAlerts(contract, incidents, now) {
  let warn = 0, late = 0;
  (incidents || []).forEach((i) => {
    if (i.service_contract_id !== contract.id) return;
    const s = incidentSla(i, now);
    [s?.response, s?.resolution].forEach((p) => { if (p?.state === "warn") warn++; if (p?.state === "late") late++; });
  });
  return { warn, late };
}

const slaSummary = (sla) => SLA_PRIORITIES
  .filter(([k]) => sla?.[k]?.response || sla?.[k]?.resolution)
  .map(([k, l]) => `${l}: ${sla[k].response ? `${sla[k].response} h` : "—"} / ${sla[k].resolution ? `${sla[k].resolution} h` : "—"}`);

// ---------------------------------------------------------------------------
// Pantalla: contratos de servicio
// ---------------------------------------------------------------------------
export function VistaServiceContracts({ contracts, contractEquipment, clients, equipment, orders, incidents, canEdit, canDelete, onNew, onEdit, onDelete, onOpen }) {
  const now = useNow();
  const month = todayStrRD().slice(0, 7);
  const [statusFilter, setStatusFilter] = useState("activo");
  const [search, setSearch] = useState("");
  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";
  const list = (contracts || [])
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => !search.trim() || `${c.code} ${c.name} ${clientName(c.client_id)}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  return (
    <div>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="text-sm" style={{ color: C.muted }}>{list.length} contrato{list.length !== 1 ? "s" : ""} · lo que va de {monthLabel(month)}</div>
        {canEdit("serviceContracts") && (
          <button onClick={onNew} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
            <Plus size={14} /> Nuevo contrato
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, nombre o código..." className="px-3 py-2 text-sm flex-1 min-w-[200px]" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
          <option value="activo">Activos</option>
          <option value="pausado">Pausados</option>
          <option value="terminado">Terminados</option>
          <option value="all">Todos</option>
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {list.map((c) => {
          const st = CONTRACT_STATUS_CFG[c.status] || CONTRACT_STATUS_CFG.activo;
          const m = contractMonthStats(c, orders, incidents, month, now);
          const al = openAlerts(c, incidents, now);
          const nEq = c.covers_all_equipment ? equipment.filter((e) => e.client_id === c.client_id).length : (contractEquipment || []).filter((x) => x.contract_id === c.id).length;
          const quota = (done, per) => `${done}${per ? ` de ${per}` : ""}`;
          return (
            <div key={c.id} className="p-4 cursor-pointer" onClick={() => onOpen(c)} style={{ background: C.panel, border: `1px solid ${al.late ? C.red + "90" : C.border}`, borderLeft: `3px solid ${st.color}` }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <div className="text-[11px] font-mono" style={{ color: C.muted }}>{c.code}</div>
                  <div className="font-semibold truncate">{clientName(c.client_id)}</div>
                  <div className="text-xs truncate" style={{ color: C.muted }}>{c.name}</div>
                </div>
                <Pill label={st.label} color={st.color} />
              </div>
              <div className="text-xs mb-2" style={{ color: C.muted }}>
                Desde {fmtDate(c.start_date)}{c.end_date ? ` hasta ${fmtDate(c.end_date)}` : " · sin fecha de fin"} · {c.covers_all_equipment ? `todos sus equipos (${nEq})` : `${nEq} equipo${nEq !== 1 ? "s" : ""}`}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                <div className="p-2" style={{ background: C.panelAlt }}><div style={{ color: C.muted }}>Preventivos</div><div className="font-semibold" style={{ color: c.preventive_per_month && m.preventive.done.length < c.preventive_per_month ? C.orange : C.text }}>{quota(m.preventive.done.length, c.preventive_per_month)}</div></div>
                <div className="p-2" style={{ background: C.panelAlt }}><div style={{ color: C.muted }}>Predictivos</div><div className="font-semibold" style={{ color: c.predictive_per_month && m.predictive.done.length < c.predictive_per_month ? C.orange : C.text }}>{quota(m.predictive.done.length, c.predictive_per_month)}</div></div>
                <div className="p-2" style={{ background: C.panelAlt }}><div style={{ color: C.muted }}>Emergencias</div><div className="font-semibold" style={{ color: m.extra ? C.red : C.text }}>{quota(m.emergencies, c.emergencies_per_month)}</div></div>
              </div>
              <div className="text-xs" style={{ color: C.muted }}>
                SLA del mes: llegar <b style={{ color: m.response.pct == null ? C.muted : m.response.pct >= 90 ? C.green : C.red }}>{m.response.pct == null ? "—" : `${m.response.pct}%`}</b>
                {" · "}solucionar <b style={{ color: m.resolution.pct == null ? C.muted : m.resolution.pct >= 90 ? C.green : C.red }}>{m.resolution.pct == null ? "—" : `${m.resolution.pct}%`}</b>
                {m.outside.length > 0 && <span> · {m.outside.length} fuera de contrato</span>}
              </div>
              {(al.warn > 0 || al.late > 0) && (
                <div className="mt-2 text-xs font-semibold flex items-center gap-1" style={{ color: al.late ? C.red : C.orange }}>
                  <AlertTriangle size={12} /> {al.late ? `${al.late} vencido${al.late !== 1 ? "s" : ""}` : ""}{al.late && al.warn ? " · " : ""}{al.warn ? `${al.warn} por vencer` : ""}
                </div>
              )}
              {(canEdit("serviceContracts") || canDelete("serviceContracts")) && (
                <div className="flex gap-3 mt-3 pt-2 text-xs" style={{ borderTop: `1px solid ${C.border}` }} onClick={(e) => e.stopPropagation()}>
                  {canEdit("serviceContracts") && <button onClick={() => onEdit(c)} className="flex items-center gap-1" style={{ color: C.amber }}><Pencil size={12} /> Editar</button>}
                  {canDelete("serviceContracts") && <button onClick={() => onDelete(c)} className="flex items-center gap-1" style={{ color: C.muted }}><Trash2 size={12} /> Eliminar</button>}
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>
            <ScrollText size={22} className="mx-auto mb-2" />
            {(contracts || []).length === 0 ? "Todavía no hay contratos de servicio. Crea uno para medir los tiempos de respuesta (SLA) y las visitas incluidas de cada cliente." : "No hay contratos con ese filtro."}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------
export function ServiceContractFormModal({ initial, initialEquipmentIds, clients, equipment, recurringContracts, showIguala, onClose, onSave, saving }) {
  const [clientId, setClientId] = useState(initial?.client_id || "");
  const [name, setName] = useState(initial?.name || "");
  const [status, setStatus] = useState(initial?.status || "activo");
  const [startDate, setStartDate] = useState(initial?.start_date || todayStrRD().slice(0, 8) + "01");
  const [endDate, setEndDate] = useState(initial?.end_date || "");
  const [recurringId, setRecurringId] = useState(initial?.recurring_contract_id || "");
  const [coversAll, setCoversAll] = useState(initial ? initial.covers_all_equipment !== false : true);
  const [eqIds, setEqIds] = useState(() => new Set(initialEquipmentIds || []));
  const [prev, setPrev] = useState(initial?.preventive_per_month ?? 1);
  const [pred, setPred] = useState(initial?.predictive_per_month ?? 0);
  const [emerg, setEmerg] = useState(initial?.emergencies_per_month ?? "");
  const [fee, setFee] = useState(initial?.monthly_fee ?? "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [sla, setSla] = useState(() => {
    const base = initial ? (initial.sla || {}) : DEFAULT_SLA;
    return Object.fromEntries(SLA_PRIORITIES.map(([k]) => [k, { response: base[k]?.response ?? "", resolution: base[k]?.resolution ?? "" }]));
  });
  const [err, setErr] = useState("");
  const clientEquipment = useMemo(() => (equipment || []).filter((e) => e.client_id === clientId), [equipment, clientId]);
  const clientIgualas = (recurringContracts || []).filter((r) => r.client_id === clientId);
  const client = clients.find((c) => c.id === clientId);

  const num = (v) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));
  const submit = () => {
    setErr("");
    if (!clientId) { setErr("Elige el cliente."); return; }
    if (!startDate) { setErr("Pon la fecha de inicio."); return; }
    if (endDate && endDate < startDate) { setErr("La fecha de fin tiene que ser después del inicio."); return; }
    if (!coversAll && eqIds.size === 0) { setErr("Marca al menos un equipo, o elige \"todos los equipos del cliente\"."); return; }
    const cleanSla = {};
    for (const [k, l] of SLA_PRIORITIES) {
      const r = num(sla[k].response), s = num(sla[k].resolution);
      if ((r != null && !(r > 0)) || (s != null && !(s > 0))) { setErr(`Las horas de prioridad ${l} tienen que ser mayores que 0.`); return; }
      if (r != null && s != null && s < r) { setErr(`En prioridad ${l}, el tiempo para solucionar no puede ser menor que el de llegar.`); return; }
      if (r != null || s != null) cleanSla[k] = { ...(r != null ? { response: r } : {}), ...(s != null ? { resolution: s } : {}) };
    }
    onSave({
      client_id: clientId,
      name: name.trim() || `Mantenimiento mensual — ${client?.name || ""}`.trim(),
      status, start_date: startDate, end_date: endDate || null,
      recurring_contract_id: recurringId || null,
      covers_all_equipment: coversAll,
      preventive_per_month: Math.max(0, Math.floor(num(prev) || 0)),
      predictive_per_month: Math.max(0, Math.floor(num(pred) || 0)),
      emergencies_per_month: emerg === "" ? null : Math.max(0, Math.floor(num(emerg) || 0)),
      monthly_fee: num(fee),
      sla: cleanSla,
      notes: notes.trim() || null,
    }, coversAll ? [] : [...eqIds]);
  };

  return (
    <Modal title={initial ? `Editar contrato ${initial.code || ""}` : "Nuevo contrato de servicio"} onClose={onClose} wide>
      <div className="text-xs mb-3 p-2" style={{ background: C.panelAlt, color: C.muted }}>
        Cubre <b style={{ color: C.text }}>preventivos, predictivos y emergencias</b>. Los <b style={{ color: C.text }}>correctivos no entran</b>: sus órdenes salen como "fuera de contrato" para cobrarlas aparte.
      </div>
      <Field label="Cliente">
        <SearchSelect items={clients} value={clientId} onChange={(id) => { setClientId(id); setEqIds(new Set()); setRecurringId(""); }} placeholder="Buscar cliente..." getLabel={(c) => c.name} />
      </Field>
      <Field label="Nombre del contrato">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={client ? `Mantenimiento mensual — ${client.name}` : "Mantenimiento mensual"} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Estado">
          <select className={inputClass} style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(CONTRACT_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Desde"><input type="date" className={inputClass} style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Hasta (opcional)"><input type="date" className={inputClass} style={inputStyle} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {showIguala ? (
          <Field label="Iguala que se factura (Comercial)">
            <select className={inputClass} style={inputStyle} value={recurringId} onChange={(e) => setRecurringId(e.target.value)} disabled={!clientId}>
              <option value="">{clientIgualas.length ? "Sin enlazar" : "Este cliente no tiene iguala"}</option>
              {clientIgualas.map((r) => <option key={r.id} value={r.id}>{r.title || r.description || "Iguala"}{r.amount ? ` · ${fmtMoney(r.amount)}` : ""}</option>)}
            </select>
          </Field>
        ) : <div />}
        <Field label="Cuota mensual (opcional)">
          <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={fee ?? ""} onChange={(e) => setFee(e.target.value)} placeholder="Solo de referencia" />
        </Field>
      </div>

      <div className="text-xs uppercase tracking-wide mt-2 mb-2" style={{ color: C.muted }}>Equipos cubiertos</div>
      <label className="flex items-center gap-2 text-sm mb-1 cursor-pointer"><input type="radio" checked={coversAll} onChange={() => setCoversAll(true)} /> Todos los equipos del cliente {clientId ? `(${clientEquipment.length})` : ""}</label>
      <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer"><input type="radio" checked={!coversAll} onChange={() => setCoversAll(false)} /> Solo estos equipos:</label>
      {!coversAll && (
        <div className="mb-3 max-h-40 overflow-y-auto p-2" style={{ border: `1px solid ${C.border}` }}>
          {clientEquipment.length === 0 && <div className="text-xs" style={{ color: C.muted }}>{clientId ? "Este cliente no tiene equipos registrados (se ponen en Gestión de Equipos → Cliente)." : "Primero elige el cliente."}</div>}
          {clientEquipment.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
              <input type="checkbox" checked={eqIds.has(e.id)} onChange={() => setEqIds((prev) => { const n = new Set(prev); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; })} />
              {e.name}{e.serial_number ? <span className="text-xs" style={{ color: C.muted }}>· {e.serial_number}</span> : null}
            </label>
          ))}
        </div>
      )}

      <div className="text-xs uppercase tracking-wide mt-4 mb-2" style={{ color: C.muted }}>Incluido cada mes</div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Visitas preventivas"><input type="number" min="0" className={inputClass} style={inputStyle} value={prev} onChange={(e) => setPrev(e.target.value)} /></Field>
        <Field label="Visitas predictivas"><input type="number" min="0" className={inputClass} style={inputStyle} value={pred} onChange={(e) => setPred(e.target.value)} /></Field>
        <Field label="Emergencias"><input type="number" min="0" className={inputClass} style={inputStyle} value={emerg} onChange={(e) => setEmerg(e.target.value)} placeholder="Sin límite" /></Field>
      </div>

      <div className="text-xs uppercase tracking-wide mt-2 mb-1" style={{ color: C.muted }}>Tiempos de respuesta (SLA), en horas desde que se reporta la avería</div>
      <div className="text-[11px] mb-2" style={{ color: C.muted }}>Llegar = el técnico atiende la avería o marca "Llegué" en su orden. Solucionar = la avería se completa o su orden se cierra. Deja en blanco lo que no aplique.</div>
      <div className="overflow-x-auto mb-3" style={{ border: `1px solid ${C.border}` }}>
        <div className="grid grid-cols-3 gap-2 px-3 py-2 text-[11px] uppercase tracking-wide min-w-[360px]" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
          <div>Prioridad</div><div>Llegar en (h)</div><div>Solucionar en (h)</div>
        </div>
        {SLA_PRIORITIES.map(([k, l]) => (
          <div key={k} className="grid grid-cols-3 gap-2 px-3 py-1.5 items-center min-w-[360px]">
            <div className="text-sm">{l}</div>
            <input type="text" inputMode="decimal" aria-label={`Llegar ${l}`} className={inputClass} style={inputStyle} value={sla[k].response} onChange={(e) => setSla((p) => ({ ...p, [k]: { ...p[k], response: e.target.value } }))} />
            <input type="text" inputMode="decimal" aria-label={`Solucionar ${l}`} className={inputClass} style={inputStyle} value={sla[k].resolution} onChange={(e) => setSla((p) => ({ ...p, [k]: { ...p[k], resolution: e.target.value } }))} />
          </div>
        ))}
      </div>
      <Field label="Notas"><textarea rows={2} className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condiciones, exclusiones, contacto del cliente..." /></Field>
      {err && <div className="text-xs mb-2" style={{ color: C.red }}>{err}</div>}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{saving ? "Guardando..." : "Guardar contrato"}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detalle + reporte del mes
// ---------------------------------------------------------------------------
export function ServiceContractDetailModal({ contract, contractEquipment, clients, equipment, orders, incidents, recurringContracts, companyName, companyLogo, techName, equipName, canEdit, onEdit, onOpenOrder, onOpenIncident, onClose }) {
  const now = useNow();
  const [month, setMonth] = useState(todayStrRD().slice(0, 7));
  const client = clients.find((c) => c.id === contract.client_id);
  const st = CONTRACT_STATUS_CFG[contract.status] || CONTRACT_STATUS_CFG.activo;
  const m = contractMonthStats(contract, orders, incidents, month, now);
  const iguala = (recurringContracts || []).find((r) => r.id === contract.recurring_contract_id);
  const eqList = contract.covers_all_equipment
    ? (equipment || []).filter((e) => e.client_id === contract.client_id)
    : (contractEquipment || []).filter((x) => x.contract_id === contract.id).map((x) => (equipment || []).find((e) => e.id === x.equipment_id)).filter(Boolean);
  const pctTxt = (r) => (r.pct == null ? "—" : `${r.pct}%`);
  const stateTxt = (p) => (!p ? "—" : p.state === "met" ? `A tiempo (${fmtSpan(p.ms)})` : p.state === "missed" ? `Fuera de tiempo (${fmtSpan(p.ms ?? 0)})` : p.state === "late" ? `Vencido hace ${fmtSpan(p.msOver)}` : `Faltan ${fmtSpan(p.msLeft)}`);
  const stateColor = (p) => (!p ? C.muted : p.state === "met" ? C.green : p.state === "ok" ? C.text : p.state === "warn" ? C.orange : C.red);
  const visitsRows = [...m.preventive.planned, ...m.predictive.planned].sort((a, b) => (a.scheduled || "").localeCompare(b.scheduled || ""));

  const print = () => {
    const sec = (t, head, rows, empty) => `<div style="margin-top:16px;font-weight:bold">${t}</div>${rows ? `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>` : `<div class="muted">${empty}</div>`}`;
    const visits = visitsRows.map((o) => `<tr><td>${esc(o.code)}</td><td>${o.type === "preventivo" ? "Preventivo" : "Predictivo"}</td><td>${esc(o.title)}</td><td>${esc(equipName(o.equipment_id))}</td><td>${fmtDate(o.scheduled)}</td><td>${o.status === "completada" ? "Hecha" : "Pendiente"}</td></tr>`).join("");
    const incs = m.incidents.map((i) => { const s = incidentSla(i, now); return `<tr><td>${fmtDueRD(i.created_at)}</td><td>${esc(i.title)}</td><td>${esc(i.priority || "media")}</td><td>${esc(stateTxt(s?.response))}</td><td>${esc(stateTxt(s?.resolution))}</td></tr>`; }).join("");
    const outs = m.outside.map((o) => `<tr><td>${esc(o.code)}</td><td>${esc(o.title)}</td><td>${esc(equipName(o.equipment_id))}</td><td>${fmtDate(o.scheduled)}</td><td>${o.status === "completada" ? "Completada" : "Abierta"}</td></tr>`).join("");
    printDocument(`Contrato ${contract.code} · ${monthLabel(month)}`, `
      <div class="header-row"><div>${companyLogo ? `<img src="${companyLogo}" style="max-height:48px;margin-bottom:6px" /><br/>` : ""}<h1>${esc(companyName)}</h1>
      <div class="muted">Reporte mensual del contrato de servicio · ${esc(monthLabel(month))}</div></div>
      <div style="text-align:right"><b>${esc(contract.code)}</b><div class="muted">${esc(client?.name || "")}</div></div></div>
      <div class="muted">${esc(contract.name)} · vigente desde ${fmtDate(contract.start_date)}${contract.end_date ? ` hasta ${fmtDate(contract.end_date)}` : ""}</div>
      <table><thead><tr><th>Incluido en el mes</th><th>Hecho</th><th>Incluido</th></tr></thead><tbody>
        <tr><td>Visitas preventivas</td><td>${m.preventive.done.length}</td><td>${contract.preventive_per_month || "—"}</td></tr>
        <tr><td>Visitas predictivas</td><td>${m.predictive.done.length}</td><td>${contract.predictive_per_month || "—"}</td></tr>
        <tr><td>Emergencias atendidas</td><td>${m.emergencies}</td><td>${contract.emergencies_per_month ?? "Sin límite"}</td></tr>
      </tbody></table>
      <table><thead><tr><th>SLA del mes</th><th>A tiempo</th><th>Fuera de tiempo</th><th>Cumplimiento</th></tr></thead><tbody>
        <tr><td>Llegar a la avería</td><td>${m.response.met}</td><td>${m.response.missed}</td><td><b>${pctTxt(m.response)}</b></td></tr>
        <tr><td>Solucionar la avería</td><td>${m.resolution.met}</td><td>${m.resolution.missed}</td><td><b>${pctTxt(m.resolution)}</b></td></tr>
      </tbody></table>
      ${sec("Visitas del mes", ["Orden", "Tipo", "Trabajo", "Equipo", "Fecha", "Estado"], visits, "No hay visitas programadas en este mes.")}
      ${sec("Averías / emergencias", ["Reportada", "Avería", "Prioridad", "Llegada", "Solución"], incs, "No hubo averías en este mes.")}
      ${sec("Trabajos fuera de contrato (correctivos)", ["Orden", "Trabajo", "Equipo", "Fecha", "Estado"], outs, "No hubo trabajos fuera de contrato.")}
    `);
  };

  return (
    <Modal title={`Contrato ${contract.code || ""}`} onClose={onClose} wide>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-semibold">{client?.name || "—"}</div>
          <div className="text-xs" style={{ color: C.muted }}>{contract.name}</div>
          <div className="text-xs" style={{ color: C.muted }}>Desde {fmtDate(contract.start_date)}{contract.end_date ? ` hasta ${fmtDate(contract.end_date)}` : " · sin fecha de fin"}{iguala ? ` · iguala: ${iguala.title || "enlazada"}` : ""}{contract.monthly_fee ? ` · cuota ${fmtMoney(contract.monthly_fee)}` : ""}</div>
        </div>
        <Pill label={st.label} color={st.color} />
      </div>
      <div className="text-xs mb-3" style={{ color: C.muted }}>
        <b style={{ color: C.text }}>SLA (llegar / solucionar):</b> {slaSummary(contract.sla).join(" · ") || "sin tiempos definidos"}
        <br /><b style={{ color: C.text }}>Equipos:</b> {contract.covers_all_equipment ? "todos los del cliente" : ""} {eqList.map((e) => e.name).join(", ") || (contract.covers_all_equipment ? "(sin equipos registrados)" : "—")}
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <CalendarDays size={14} color={C.muted} />
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="px-2 py-1.5 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }} />
        <button onClick={print} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ml-auto" style={{ border: `1px solid ${C.border}`, color: C.amber }}><Printer size={13} /> Imprimir / PDF para el cliente</button>
        {canEdit && <button onClick={() => onEdit(contract)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.border}`, color: C.text }}><Pencil size={13} /> Editar</button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
        <div className="p-2" style={{ background: C.panelAlt }}><div style={{ color: C.muted }}>Preventivos</div><div className="text-base font-semibold">{m.preventive.done.length}<span className="text-xs" style={{ color: C.muted }}> de {contract.preventive_per_month || 0}</span></div></div>
        <div className="p-2" style={{ background: C.panelAlt }}><div style={{ color: C.muted }}>Predictivos</div><div className="text-base font-semibold">{m.predictive.done.length}<span className="text-xs" style={{ color: C.muted }}> de {contract.predictive_per_month || 0}</span></div></div>
        <div className="p-2" style={{ background: C.panelAlt }}><div style={{ color: C.muted }}>Emergencias</div><div className="text-base font-semibold" style={{ color: m.extra ? C.red : C.text }}>{m.emergencies}<span className="text-xs" style={{ color: C.muted }}> de {contract.emergencies_per_month ?? "∞"}</span></div>{m.extra > 0 && <div style={{ color: C.red }}>{m.extra} de más</div>}</div>
        <div className="p-2" style={{ background: C.panelAlt }}><div style={{ color: C.muted }}>SLA llegar / solucionar</div><div className="text-base font-semibold">{pctTxt(m.response)} / {pctTxt(m.resolution)}</div></div>
      </div>

      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>Averías del mes</div>
      <div className="mb-3 space-y-1">
        {m.incidents.length === 0 && <div className="text-xs" style={{ color: C.muted }}>No hubo averías en {monthLabel(month)}.</div>}
        {m.incidents.map((i) => {
          const s = incidentSla(i, now);
          return (
            <button key={i.id} onClick={() => onOpenIncident && onOpenIncident(i)} className="w-full text-left px-3 py-2 text-xs" style={{ background: C.panelAlt }}>
              <div className="flex justify-between gap-2"><span className="font-semibold" style={{ color: C.text }}>{i.title}</span><span style={{ color: C.muted }}>{fmtDueRD(i.created_at)}</span></div>
              <div className="flex gap-3 flex-wrap mt-0.5">
                <span>Llegar: <b style={{ color: stateColor(s?.response) }}>{stateTxt(s?.response)}</b></span>
                <span>Solucionar: <b style={{ color: stateColor(s?.resolution) }}>{stateTxt(s?.resolution)}</b></span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>Visitas del mes</div>
      <div className="mb-3 space-y-1">
        {visitsRows.length === 0 && <div className="text-xs" style={{ color: C.muted }}>No hay visitas preventivas ni predictivas programadas en {monthLabel(month)}. Créalas desde Mantenimiento programado o Nueva orden.</div>}
        {visitsRows.map((o) => (
          <button key={o.id} onClick={() => onOpenOrder && onOpenOrder(o)} className="w-full text-left px-3 py-2 text-xs flex justify-between gap-2" style={{ background: C.panelAlt }}>
            <span><span className="font-mono" style={{ color: C.muted }}>{o.code}</span> <span style={{ color: C.text }}>{o.title}</span> <span style={{ color: C.muted }}>· {o.type === "preventivo" ? "Preventivo" : "Predictivo"} · {fmtDate(o.scheduled)}</span></span>
            <span style={{ color: o.status === "completada" ? C.green : C.orange }}>{o.status === "completada" ? "Hecha" : "Pendiente"}</span>
          </button>
        ))}
      </div>

      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>Fuera de contrato (para cobrar)</div>
      <div className="mb-2 space-y-1">
        {m.outside.length === 0 && <div className="text-xs" style={{ color: C.muted }}>No hubo trabajos correctivos en {monthLabel(month)}.</div>}
        {m.outside.map((o) => (
          <button key={o.id} onClick={() => onOpenOrder && onOpenOrder(o)} className="w-full text-left px-3 py-2 text-xs flex justify-between gap-2" style={{ background: C.panelAlt }}>
            <span><span className="font-mono" style={{ color: C.muted }}>{o.code}</span> <span style={{ color: C.text }}>{o.title}</span> <span style={{ color: C.muted }}>· {techName(o.technician_id)} · {fmtDate(o.scheduled)}</span></span>
            <span style={{ color: C.red }}><FileText size={11} className="inline" /> cobrar</span>
          </button>
        ))}
      </div>
      {contract.notes && <div className="text-xs mt-3 p-2" style={{ background: C.panelAlt, color: C.muted, whiteSpace: "pre-wrap" }}>{contract.notes}</div>}
    </Modal>
  );
}
