// Portal del cliente.
// - ClientPortal: la página que abre el cliente con su enlace (?portal=<token>), sin iniciar
//   sesión. Todo pasa por las funciones portal_* de la base de datos (portal-clientes.sql),
//   que revisan el enlace y devuelven solo lo de ese cliente.
// - ClientPortalLinkModal: dentro de la app, para crear, enviar o desactivar el enlace de un cliente.
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, Copy, ExternalLink, FileText, Link2, Mail, MessageCircle, Phone, Receipt, RefreshCw, Wrench } from "lucide-react";
import { supabase } from "../supabaseClient";
import { APP_URL, C, fmtCapacity, Field, INCIDENT_STATUS_CFG, Modal, PAYMENT_STATUS_CFG, Pill, STATUS_CFG, TYPE_CFG, fmtDate, fmtMoney, inputClass, inputStyle, invoiceLikeHtml, printDocument } from "./base.jsx";

export const portalUrl = (token) => `${APP_URL}/?portal=${token}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const openBlank = () => window.open("", "_blank", "width=800,height=900");
const checkMark = (it) => {
  if (it.response_type === "ok_no_ok_na") return it.respuesta === "OK" ? "✓" : it.respuesta === "No OK" ? "✗" : it.respuesta === "N/A" ? "N/A" : "";
  if (it.response_type === "numeric") return it.respuesta !== "" && it.respuesta != null ? "✓" : "";
  if (it.response_type === "photo") return it.photo ? "✓" : "";
  return it.checked ? "✓" : "";
};

function orderReportHtml(company, r) {
  const o = r.order;
  let lastSection = null;
  const rows = (r.checklist || []).map((it) => {
    const head = it.section && it.section !== lastSection ? `<tr><td colspan="4" style="background:#f2f2f2;font-weight:bold">${esc(it.section)}</td></tr>` : "";
    lastSection = it.section || lastSection;
    return `${head}<tr><td style="text-align:center;width:50px">${checkMark(it)}</td><td>${esc(it.text)}</td><td>${it.response_type === "photo" ? (it.photo ? "Foto tomada" : "") : esc([it.respuesta, it.respuesta && it.unit ? it.unit : ""].filter(Boolean).join(" "))}</td><td>${esc(it.observaciones)}</td></tr>`;
  }).join("");
  return `
    <div class="header-row">
      <div>
        ${company.logo_url ? `<img src="${esc(company.logo_url)}" style="max-height:56px;max-width:180px;margin-bottom:6px" alt="">` : ""}
        <h1>${esc(company.name)}</h1>
        <div class="muted">Informe de servicio &middot; Orden ${esc(o.code)}</div>
        ${o.title ? `<div class="muted" style="margin-top:2px">${esc(o.title)}</div>` : ""}
      </div>
      <div class="muted">${fmtDate(o.scheduled)}</div>
    </div>
    <div class="muted" style="margin-bottom:4px">
      ${r.equipment ? `Equipo: ${esc(r.equipment)} &nbsp;&middot;&nbsp; ` : ""}${r.branch ? `Sucursal: ${esc(r.branch)} &nbsp;&middot;&nbsp; ` : ""}Técnico: ${esc(r.technician || "—")}
    </div>
    <div class="muted" style="margin-bottom:12px">
      Tipo: ${esc(TYPE_CFG[o.type]?.label || o.type)} &nbsp;&middot;&nbsp; Estado: ${esc(STATUS_CFG[o.status]?.label || o.status)}
      ${o.completed_at ? ` &nbsp;&middot;&nbsp; Completada: ${fmtDate(String(o.completed_at).slice(0, 10))}` : ""}
      ${o.labor_hours ? ` &nbsp;&middot;&nbsp; Horas trabajadas: ${esc(o.labor_hours)}` : ""}
    </div>
    ${o.resolution_notes ? `<div style="margin-bottom:12px"><b>Trabajo realizado</b><div class="muted" style="margin-top:2px;white-space:pre-wrap">${esc(o.resolution_notes)}</div></div>` : ""}
    ${rows ? `<div style="margin-top:10px;font-weight:bold">Checklist</div><table><thead><tr><th>Cotejo</th><th>Punto revisado</th><th>Respuesta</th><th>Observaciones</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
    ${o.client_signature_name ? `<div style="margin-top:18px;padding-top:10px;border-top:1px solid #ddd" class="muted">Recibido conforme por <b>${esc(o.client_signature_name)}</b>${o.client_signature_at ? " — " + fmtDate(String(o.client_signature_at).slice(0, 10)) : ""}</div>` : ""}
  `;
}

function Stat({ label, value, color }) {
  return (
    <div className="p-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: C.muted }}>{label}</div>
      <div className="text-base sm:text-xl font-bold font-mono mt-1 break-words" style={{ color: color || C.text }}>{value}</div>
    </div>
  );
}

// Enlaces de portal abiertos en este teléfono (el más reciente primero). Sirven para que, al
// escanear el QR de un equipo sin sesión de empleado, se abra directo con el portal del cliente.
const PORTAL_LINKS_KEY = "mp-portal-links";
function rememberPortalLink(token, d) {
  try {
    const list = JSON.parse(localStorage.getItem(PORTAL_LINKS_KEY) || "[]").filter((x) => x && x.token && x.token !== token);
    list.unshift({ token, client: d?.client?.name || "", company: d?.company?.name || "", at: new Date().toISOString() });
    localStorage.setItem(PORTAL_LINKS_KEY, JSON.stringify(list.slice(0, 5)));
  } catch { /* sin almacenamiento */ }
}
function forgetPortalLink(token) {
  try {
    const list = JSON.parse(localStorage.getItem(PORTAL_LINKS_KEY) || "[]").filter((x) => x && x.token !== token);
    localStorage.setItem(PORTAL_LINKS_KEY, JSON.stringify(list));
  } catch { /* sin almacenamiento */ }
}

export function ClientPortal({ token }) {
  const [data, setData] = useState(undefined); // undefined = cargando, null = enlace inválido
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState(null);
  // Equipo abierto en la pestaña Equipos (también al llegar escaneando su QR: ?eq=)
  const [qrEqId] = useState(() => new URLSearchParams(window.location.search).get("eq"));
  const [selectedEqId, setSelectedEqId] = useState(null);
  const [qrHandled, setQrHandled] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [docError, setDocError] = useState("");
  // formulario de avería
  const [eqId, setEqId] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [who, setWho] = useState(() => { try { return localStorage.getItem("mp-portal-who") || ""; } catch { return ""; } });
  const [phone, setPhone] = useState(() => { try { return localStorage.getItem("mp-portal-phone") || ""; } catch { return ""; } });
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState(null);
  const [formError, setFormError] = useState("");

  const load = async () => {
    setLoadError("");
    const { data: d, error } = await supabase.rpc("portal_data", { p_token: token });
    if (error) { setLoadError("No se pudo cargar el portal. Revisa tu conexión e intenta de nuevo."); setData((prev) => (prev === undefined ? null : prev)); return; }
    setData(d || null);
    if (d) rememberPortalLink(token, d); else forgetPortalLink(token);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);
  useEffect(() => { if (data?.company?.name) document.title = `Portal · ${data.company.name}`; }, [data]);

  const mods = data?.modules || [];
  const hasTec = mods.includes("tecnico");
  const hasCom = mods.includes("comercial");
  const tabs = useMemo(() => [
    hasTec && { key: "reportar", label: "Reportar avería", Icon: AlertTriangle },
    hasTec && { key: "ordenes", label: "Trabajos", Icon: ClipboardList },
    hasTec && ((data?.equipment || []).length + (data?.assets || []).length > 0) && { key: "equipos", label: "Equipos", Icon: Wrench },
    hasCom && { key: "facturas", label: "Facturas", Icon: Receipt },
  ].filter(Boolean), [hasTec, hasCom, data]);
  const current = tab && tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;
  // Llegó escaneando un QR: abre ese equipo (si es de este portal)
  useEffect(() => {
    if (!data || qrHandled || !qrEqId) return;
    setQrHandled(true);
    if ((data.equipment || []).some((e) => e.id === qrEqId)) { setSelectedEqId(qrEqId); setTab("equipos"); }
    else setDocError("Ese equipo no aparece en tu portal (puede ser de otra sede o de otro cliente).");
    // eslint-disable-next-line
  }, [data]);

  if (data === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: C.bg, color: C.muted }}>{loadError || "Cargando portal..."}</div>;
  }
  if (data === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: C.bg }}>
        <div className="max-w-sm p-6 text-center" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <Ban size={28} color={C.red} className="mx-auto mb-3" />
          <div className="font-semibold mb-1" style={{ color: C.text }}>Este enlace no está disponible</div>
          <div className="text-sm" style={{ color: C.muted }}>{loadError || "Puede que lo hayan desactivado. Pide un enlace nuevo a la empresa que te da servicio."}</div>
        </div>
      </div>
    );
  }

  const company = data.company || {};
  const incidents = data.incidents || [];
  const orders = data.orders || [];
  const invoices = data.invoices || [];
  const openIncidents = incidents.filter((i) => ["abierto", "en_revision"].includes(i.status)).length;
  const activeOrders = orders.filter((o) => o.status !== "completada").length;
  const balance = invoices.reduce((s, v) => s + Number(v.balance || 0), 0);

  const submitReport = async () => {
    setFormError("");
    if (title.trim().length < 3) { setFormError("Escribe en pocas palabras qué está pasando."); return; }
    setSending(true);
    const { data: res, error } = await supabase.rpc("portal_report_incident", { p_token: token, p_equipment_id: eqId || null, p_title: title.trim(), p_description: desc.trim() || null, p_reported_by: who.trim() || null, p_phone: phone.trim() || null });
    setSending(false);
    if (error) { setFormError(error.message || "No se pudo enviar el reporte."); return; }
    // Aviso por correo y push a administradores y supervisores (si falla, el reporte igual quedó guardado y avisado en la campana)
    if (res?.id) supabase.functions.invoke("portal-notify", { body: { token, incident_id: res.id } }).catch(() => {});
    try { localStorage.setItem("mp-portal-who", who.trim()); localStorage.setItem("mp-portal-phone", phone.trim()); } catch { /* sin almacenamiento */ }
    setSentAt(res?.created_at || new Date().toISOString());
    setTitle(""); setDesc(""); setEqId("");
    load();
  };

  const printOrder = async (o) => {
    setDocError(""); setBusyId(o.id);
    const win = openBlank();
    const { data: r, error } = await supabase.rpc("portal_order", { p_token: token, p_order_id: o.id });
    setBusyId(null);
    if (error || !r) { win?.close(); setDocError("No se pudo abrir el informe."); return; }
    printDocument(`Informe de servicio ${r.order.code}`, orderReportHtml(company, r), win);
  };

  const printInvoice = async (v) => {
    setDocError(""); setBusyId(v.id);
    const win = openBlank();
    const { data: r, error } = await supabase.rpc("portal_invoice", { p_token: token, p_invoice_id: v.id });
    setBusyId(null);
    if (error || !r) { win?.close(); setDocError("No se pudo abrir la factura."); return; }
    const inv = r.invoice, items = r.items || [];
    const html = invoiceLikeHtml({
      docLabel: "Factura", code: inv.invoice_number || inv.ncf, docTitle: inv.title, companyName: company.name, clientName: r.client?.name, clientRnc: r.client?.rnc, clientAddress: r.client?.address,
      companyLogo: company.logo_url, companyRnc: company.rnc, companyAddress: company.address, companyPhone: company.phone,
      companyBankName: r.bank?.bank_name, companyBankAccountType: r.bank?.account_type, companyBankAccountNumber: r.bank?.account_number,
      dateLabel: "Fecha", dateValue: fmtDate(inv.invoice_date), extraMeta: inv.ncf ? `<br/>NCF: ${esc(inv.ncf)}` : "", paymentTerms: inv.payment_terms, notes: inv.notes,
      items: inv.currency === "USD" ? items.map((it) => ({ ...it, unit_price: it.foreign_unit_price ?? it.unit_price, subtotal: it.foreign_subtotal ?? it.subtotal })) : items,
      subtotal: inv.subtotal, itbis: inv.itbis, total: inv.total, discountPct: inv.discount_pct,
      retainedLabel: "Retención ITBIS 30% (Norma 02-05)", retainedAmount: inv.itbis_retained || 0,
      legalNote: [inv.exempt_itbis ? "Factura exenta de ITBIS." : null, inv.applies_norma_0205 ? "Aplica Norma 02-05 — Retención del 30% del ITBIS." : null].filter(Boolean).join(" ") || null,
      currency: inv.currency, foreignTotal: inv.foreign_total, exchangeRate: inv.exchange_rate,
    });
    printDocument(`Factura ${inv.invoice_number || inv.ncf || ""}`, html, win);
  };

  const card = { background: C.panel, border: `1px solid ${C.border}` };

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      <header className="px-4 py-4" style={{ background: C.panel, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {company.logo_url && <img src={company.logo_url} alt="" className="h-10 w-auto max-w-[120px] object-contain" />}
          <div className="min-w-0 flex-1">
            <div className="font-bold truncate">{company.name}</div>
            <div className="text-xs truncate" style={{ color: C.muted }}>
              Portal de {data.client?.name}
              {data.scope?.branches?.length > 0 && <span style={{ color: C.text }}> · {data.scope.branches.join(", ")}</span>}
            </div>
          </div>
          <button onClick={load} title="Actualizar" className="p-2" style={{ color: C.muted }}><RefreshCw size={18} /></button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5">
        <div className={`grid gap-2 mb-5 ${hasTec && hasCom ? "grid-cols-3" : "grid-cols-2"}`}>
          {hasTec && <Stat label="Averías abiertas" value={openIncidents} color={openIncidents ? C.red : C.green} />}
          {hasTec && <Stat label="Trabajos en curso" value={activeOrders} color={activeOrders ? C.amber : C.text} />}
          {hasCom && <Stat label="Saldo pendiente" value={fmtMoney(balance)} color={balance > 0.009 ? C.red : C.green} />}
        </div>

        <div className="flex gap-1 mb-4 overflow-x-auto" style={{ borderBottom: `1px solid ${C.border}` }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); if (t.key === "equipos") setSelectedEqId(null); }} className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap"
              style={{ color: current === t.key ? C.text : C.muted, borderBottom: `2px solid ${current === t.key ? C.amber : "transparent"}`, fontWeight: current === t.key ? 600 : 400 }}>
              <t.Icon size={15} /> {t.label}
            </button>
          ))}
        </div>
        {docError && <div className="text-sm mb-3" style={{ color: C.red }}>{docError}</div>}

        {current === "reportar" && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4" style={card}>
              <div className="font-semibold mb-3">¿Algo no funciona? Repórtalo aquí</div>
              {sentAt && (
                <div className="flex items-start gap-2 p-3 mb-3 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.green}` }}>
                  <CheckCircle2 size={18} color={C.green} className="flex-shrink-0 mt-0.5" />
                  <div>Recibido. Tu reporte quedó registrado y la empresa ya fue avisada. Puedes seguir su estado aquí al lado.</div>
                </div>
              )}
              {(data.equipment || []).length > 0 && (
                <Field label="Equipo">
                  <select className={inputClass} style={inputStyle} value={eqId} onChange={(e) => setEqId(e.target.value)}>
                    <option value="">Otro / no estoy seguro</option>
                    {data.equipment.map((e) => <option key={e.id} value={e.id}>{e.name}{e.location ? ` — ${e.location}` : ""}</option>)}
                  </select>
                </Field>
              )}
              <Field label="¿Qué está pasando?">
                <input className={inputClass} style={inputStyle} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. El aire del lobby no enfría" />
              </Field>
              <Field label="Detalles (opcional)">
                <textarea rows={3} className={inputClass} style={inputStyle} value={desc} maxLength={2000} onChange={(e) => setDesc(e.target.value)} placeholder="Desde cuándo, qué ruido hace, dónde está…" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tu nombre">
                  <input className={inputClass} style={inputStyle} value={who} maxLength={100} onChange={(e) => setWho(e.target.value)} placeholder="Ej. Juan Pérez" />
                </Field>
                <Field label="Teléfono de contacto">
                  <input className={inputClass} style={inputStyle} value={phone} maxLength={40} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="809-000-0000" />
                </Field>
              </div>
              {formError && <div className="text-xs mb-2" style={{ color: C.red }}>{formError}</div>}
              <button onClick={submitReport} disabled={sending} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold disabled:opacity-50" style={{ background: C.red, color: "#fff" }}>
                <AlertTriangle size={16} /> {sending ? "Enviando..." : "Enviar reporte"}
              </button>
              {(company.phone || company.email) && (
                <div className="text-xs mt-3 flex flex-wrap gap-x-4 gap-y-1" style={{ color: C.muted }}>
                  <span>¿Es urgente?</span>
                  {company.phone && <a href={`tel:${company.phone}`} className="flex items-center gap-1" style={{ color: C.amber }}><Phone size={12} /> {company.phone}</a>}
                  {company.email && <a href={`mailto:${company.email}`} className="flex items-center gap-1" style={{ color: C.amber }}><Mail size={12} /> {company.email}</a>}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Tus reportes</div>
              <div className="space-y-2">
                {incidents.map((i) => {
                  const s = INCIDENT_STATUS_CFG[i.status] || INCIDENT_STATUS_CFG.abierto;
                  return (
                    <div key={i.id} className="p-3" style={card}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm min-w-0">{i.title}</div>
                        <Pill label={s.label} color={s.color} />
                      </div>
                      <div className="text-xs mt-1" style={{ color: C.muted }}>{fmtDate(String(i.created_at).slice(0, 10))}{i.equipment ? ` · ${i.equipment}` : ""}</div>
                    </div>
                  );
                })}
                {incidents.length === 0 && <div className="text-sm p-4 text-center" style={{ ...card, color: C.muted }}>Todavía no has reportado averías.</div>}
              </div>
            </div>
          </div>
        )}

        {current === "ordenes" && (
          <div className="space-y-2">
            {orders.map((o) => {
              const t = TYPE_CFG[o.type] || { label: o.type, color: C.muted }, s = STATUS_CFG[o.status] || { label: o.status, color: C.muted };
              return (
                <div key={o.id} className="p-3" style={{ ...card, borderLeft: `3px solid ${t.color}` }}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-mono text-xs" style={{ color: C.muted }}>{o.code} · {fmtDate(o.scheduled)}</div>
                    <div className="flex gap-2"><Pill label={t.label} color={t.color} /><Pill label={s.label} color={s.color} /></div>
                  </div>
                  <div className="text-sm mt-1">{o.title}</div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <div className="text-xs" style={{ color: C.muted }}>{[o.equipment, o.technician && `Técnico: ${o.technician}`].filter(Boolean).join(" · ")}</div>
                    {o.status === "completada" && (
                      <button onClick={() => printOrder(o)} disabled={busyId === o.id} className="flex items-center gap-1 text-xs flex-shrink-0 disabled:opacity-50" style={{ color: C.amber }}><FileText size={13} /> {busyId === o.id ? "Abriendo..." : "Informe"}</button>
                    )}
                  </div>
                </div>
              );
            })}
            {orders.length === 0 && <div className="text-sm p-6 text-center" style={{ ...card, color: C.muted }}>Todavía no hay trabajos registrados.</div>}
          </div>
        )}

        {current === "equipos" && selectedEqId && (() => {
          const e = (data.equipment || []).find((x) => x.id === selectedEqId);
          if (!e) return null;
          const out = e.operational_status === "fuera_servicio";
          const eqOrders = orders.filter((o) => o.equipment_id === e.id);
          const eqIncidents = incidents.filter((i) => i.equipment_id === e.id);
          return (
            <div>
              <button onClick={() => setSelectedEqId(null)} className="text-xs mb-3" style={{ color: C.amber }}>← Todos los equipos</button>
              <div className="p-4 mb-3" style={card}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{e.name}</div>
                  <Pill label={out ? "Fuera de servicio" : "Operativo"} color={out ? C.red : C.green} />
                </div>
                <div className="text-xs mt-1 space-y-0.5" style={{ color: C.muted }}>
                  {[e.type, fmtCapacity(e), e.brand, e.model].filter(Boolean).length > 0 && <div>{[e.type, fmtCapacity(e), e.brand, e.model].filter(Boolean).join(" · ")}</div>}
                  {e.serial_number && <div className="font-mono">S/N: {e.serial_number}</div>}
                  {e.location && <div>Ubicación: {e.location}</div>}
                  {e.next_maintenance_date && <div>Próximo mantenimiento: <span style={{ color: C.text }}>{fmtDate(e.next_maintenance_date)}</span></div>}
                </div>
                {hasTec && (
                  <button onClick={() => { setEqId(e.id); setTab("reportar"); setSentAt(null); }} className="mt-3 flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.red, color: "#fff" }}>
                    <AlertTriangle size={15} /> Reportar avería de este equipo
                  </button>
                )}
              </div>
              {eqIncidents.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Averías reportadas</div>
                  <div className="space-y-2">
                    {eqIncidents.map((i) => {
                      const st = INCIDENT_STATUS_CFG[i.status] || INCIDENT_STATUS_CFG.abierto;
                      return (
                        <div key={i.id} className="p-3 flex items-start justify-between gap-2" style={card}>
                          <div className="text-sm min-w-0">{i.title}<div className="text-xs" style={{ color: C.muted }}>{fmtDate(String(i.created_at).slice(0, 10))}</div></div>
                          <Pill label={st.label} color={st.color} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Trabajos de este equipo ({eqOrders.length})</div>
              <div className="space-y-2">
                {eqOrders.map((o) => {
                  const t = TYPE_CFG[o.type] || { label: o.type, color: C.muted }, s2 = STATUS_CFG[o.status] || { label: o.status, color: C.muted };
                  return (
                    <div key={o.id} className="p-3" style={{ ...card, borderLeft: `3px solid ${t.color}` }}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="font-mono text-xs" style={{ color: C.muted }}>{o.code} · {fmtDate(o.scheduled)}</div>
                        <div className="flex gap-2"><Pill label={t.label} color={t.color} /><Pill label={s2.label} color={s2.color} /></div>
                      </div>
                      <div className="text-sm mt-1">{o.title}</div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="text-xs" style={{ color: C.muted }}>{o.technician ? `Técnico: ${o.technician}` : ""}</div>
                        {o.status === "completada" && (
                          <button onClick={() => printOrder(o)} disabled={busyId === o.id} className="flex items-center gap-1 text-xs flex-shrink-0 disabled:opacity-50" style={{ color: C.amber }}><FileText size={13} /> {busyId === o.id ? "Abriendo..." : "Informe"}</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {eqOrders.length === 0 && <div className="text-sm p-6 text-center" style={{ ...card, color: C.muted }}>Este equipo todavía no tiene trabajos registrados.</div>}
              </div>
            </div>
          );
        })()}

        {current === "equipos" && !selectedEqId && (
          <div className="grid sm:grid-cols-2 gap-2">
            {(data.equipment || []).map((e) => {
              const out = e.operational_status === "fuera_servicio";
              const n = orders.filter((o) => o.equipment_id === e.id).length;
              return (
                <button key={e.id} onClick={() => setSelectedEqId(e.id)} className="p-3 text-left" style={card}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-sm">{e.name}</div>
                    <Pill label={out ? "Fuera de servicio" : "Operativo"} color={out ? C.red : C.green} />
                  </div>
                  <div className="text-xs mt-1 space-y-0.5" style={{ color: C.muted }}>
                    {[e.type, fmtCapacity(e), e.brand, e.model].filter(Boolean).length > 0 && <div>{[e.type, fmtCapacity(e), e.brand, e.model].filter(Boolean).join(" · ")}</div>}
                    {e.serial_number && <div className="font-mono">S/N: {e.serial_number}</div>}
                    {e.location && <div>Ubicación: {e.location}</div>}
                    {e.next_maintenance_date && <div>Próximo mantenimiento: <span style={{ color: C.text }}>{fmtDate(e.next_maintenance_date)}</span></div>}
                    <div style={{ color: C.amber }}>{n} trabajo{n !== 1 ? "s" : ""} · ver historial →</div>
                  </div>
                </button>
              );
            })}
            {(data.assets || []).map((a) => (
              <div key={a.id} className="p-3" style={card}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm">{a.name}</div>
                  <Pill label="En garantía" color={C.blue} />
                </div>
                <div className="text-xs mt-1" style={{ color: C.muted }}>{[a.brand, a.model].filter(Boolean).join(" · ")}{a.serial_number ? ` · S/N ${a.serial_number}` : ""}</div>
              </div>
            ))}
          </div>
        )}

        {current === "facturas" && (
          <div className="space-y-2">
            {invoices.map((v) => {
              const ps = PAYMENT_STATUS_CFG[v.payment_status] || PAYMENT_STATUS_CFG.pendiente;
              return (
                <div key={v.id} className="p-3 flex items-center justify-between gap-3" style={card}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{v.invoice_number || v.ncf}{v.title ? <span className="font-normal" style={{ color: C.muted }}> · {v.title}</span> : null}</div>
                    <div className="text-xs mt-0.5" style={{ color: C.muted }}>{fmtDate(v.invoice_date)}{v.ncf && v.invoice_number ? ` · NCF ${v.ncf}` : ""}</div>
                    <div className="mt-1"><Pill label={ps.label} color={ps.color} /></div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-sm">{fmtMoney(v.total)}</div>
                    {Number(v.balance) > 0.009 && <div className="font-mono text-xs" style={{ color: C.red }}>Debe {fmtMoney(v.balance)}</div>}
                    <button onClick={() => printInvoice(v)} disabled={busyId === v.id} className="flex items-center gap-1 text-xs mt-1 ml-auto disabled:opacity-50" style={{ color: C.amber }}><FileText size={13} /> {busyId === v.id ? "Abriendo..." : "Ver / imprimir"}</button>
                  </div>
                </div>
              );
            })}
            {invoices.length === 0 && <div className="text-sm p-6 text-center" style={{ ...card, color: C.muted }}>No hay facturas.</div>}
          </div>
        )}

        <div className="text-[11px] text-center mt-10" style={{ color: C.muted }}>Portal de clientes · MantenPro</div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dentro de la app: crear / enviar / desactivar el enlace de un cliente.
// ---------------------------------------------------------------------------
export function ClientPortalLinkModal({ client, companyId, companyName, canManage, branches = [], onClose }) {
  // Un cliente puede tener varios enlaces: uno general (todas sus sedes) y otros por sede
  // (sucursal). Cada enlace de sede solo muestra lo de esas sucursales (parte-e-portal-por-sede.sql).
  const [links, setLinks] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAll, setNewAll] = useState(true);
  const [newBranches, setNewBranches] = useState([]);

  const load = async () => {
    const { data, error: e } = await supabase.from("client_portal_links").select("*").eq("client_id", client.id).is("revoked_at", null).order("created_at", { ascending: true });
    if (e) { setError(e.message.includes("client_portal_links") ? "Falta correr el archivo portal-clientes.sql en Supabase." : e.message); setLinks([]); return; }
    setLinks(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [client.id]);

  const branchNames = (ids) => (ids || []).map((id) => branches.find((b) => b.id === id)?.name || "—").join(", ");
  const toggleBranch = (id) => setNewBranches((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = async () => {
    if (!newAll && newBranches.length === 0) { setError("Elige al menos una sucursal, o marca \"Todas las sedes\"."); return; }
    setBusy(true); setError("");
    const row = { company_id: companyId, client_id: client.id, label: newLabel.trim() || null };
    if (!newAll) row.branch_ids = newBranches;
    const { error: e } = await supabase.from("client_portal_links").insert(row);
    setBusy(false);
    if (e) { setError(/branch_ids|label/.test(e.message) ? "Falta correr parte-e-portal-por-sede.sql en Supabase para los enlaces por sede." : e.message); return; }
    setShowNew(false); setNewLabel(""); setNewAll(true); setNewBranches([]);
    load();
  };
  const renew = async (link) => {
    if (!window.confirm("Este enlace dejará de funcionar y se creará uno nuevo con las mismas sedes. ¿Continuar?")) return;
    setBusy(true); setError("");
    const { error: e1 } = await supabase.from("client_portal_links").update({ revoked_at: new Date().toISOString() }).eq("id", link.id);
    if (e1) { setBusy(false); setError(e1.message); return; }
    const row = { company_id: companyId, client_id: client.id };
    if (link.label) row.label = link.label;
    if (link.branch_ids) row.branch_ids = link.branch_ids;
    const { error: e2 } = await supabase.from("client_portal_links").insert(row);
    setBusy(false);
    if (e2) { setError(e2.message); return; }
    load();
  };
  const revoke = async (link) => {
    if (!window.confirm(`¿Desactivar este enlace${link.label ? ` (${link.label})` : ""}? Dejará de funcionar.`)) return;
    setBusy(true);
    const { error: e } = await supabase.from("client_portal_links").update({ revoked_at: new Date().toISOString() }).eq("id", link.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    load();
  };

  const digits = String(client.phone || "").replace(/\D/g, "");
  const waNumber = digits.length === 10 ? `1${digits}` : digits;
  const copy = async (link) => {
    const url = portalUrl(link.token);
    try { await navigator.clipboard.writeText(url); setCopiedId(link.id); setTimeout(() => setCopiedId(null), 2000); } catch { window.prompt("Copia el enlace:", url); }
  };
  const btn = { border: `1px solid ${C.border}`, color: C.text };

  return (
    <Modal title={`Portal de ${client.name}`} onClose={onClose} wide>
      <div className="text-sm mb-4" style={{ color: C.muted }}>
        Con el enlace el cliente reporta averías y ve sus trabajos, sus equipos y sus facturas, sin usuario ni contraseña.
        Puedes tener un enlace general (todas sus sedes) y enlaces por sede para cada encargado: cada uno solo ve lo de sus sucursales.
      </div>
      {links === undefined && <div className="text-sm" style={{ color: C.muted }}>Cargando...</div>}
      {links && links.length === 0 && !showNew && (
        <div className="text-sm text-center py-3" style={{ color: C.muted }}>Este cliente todavía no tiene portal.</div>
      )}
      <div className="space-y-3">
        {(links || []).map((link) => {
          const url = portalUrl(link.token);
          const scopeText = link.branch_ids ? `Solo: ${branchNames(link.branch_ids)}` : "Todas las sedes";
          const message = `Hola, le compartimos el portal de ${client.name}${link.branch_ids ? ` (${branchNames(link.branch_ids)})` : ""} con ${companyName}. Desde aquí puede reportar averías y ver sus trabajos${link.branch_ids ? "" : " y facturas"}: ${url}`;
          return (
            <div key={link.id} className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="text-sm font-semibold">{link.label || (link.branch_ids ? "Enlace de sede" : "Enlace general")}</div>
                <span className="text-[11px] px-1.5 py-0.5" style={{ color: link.branch_ids ? C.blue : C.green, border: `1px solid ${link.branch_ids ? C.blue : C.green}60` }}>{scopeText}</span>
              </div>
              <div className="flex gap-2 mb-2">
                <input readOnly value={url} onFocus={(e) => e.target.select()} className={`${inputClass} font-mono text-xs`} style={inputStyle} />
                <button onClick={() => copy(link)} className="flex items-center gap-1 px-3 text-sm flex-shrink-0" style={btn}><Copy size={14} /> {copiedId === link.id ? "¡Copiado!" : "Copiar"}</button>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold" style={{ background: "#25D366", color: "#062E16" }}><MessageCircle size={15} /> WhatsApp</a>
                <a href={`mailto:${client.email || ""}?subject=${encodeURIComponent(`Portal de servicio — ${companyName}`)}&body=${encodeURIComponent(message)}`} className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm" style={btn}><Mail size={15} /> Correo</a>
                <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm" style={btn}><ExternalLink size={15} /> Abrir</a>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs" style={{ color: C.muted }}>
                  Creado el {fmtDate(String(link.created_at).slice(0, 10))} · {link.last_used_at ? `Último acceso: ${fmtDate(String(link.last_used_at).slice(0, 10))}` : "Todavía no lo han abierto"}
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <button onClick={() => renew(link)} disabled={busy} className="flex items-center gap-1 px-2 py-1 text-xs disabled:opacity-50" style={btn} title="Si el enlace se filtró: el anterior deja de funcionar"><RefreshCw size={12} /> Cambiar enlace</button>
                    <button onClick={() => revoke(link)} disabled={busy} className="flex items-center gap-1 px-2 py-1 text-xs disabled:opacity-50" style={{ color: C.red, border: `1px solid ${C.red}60` }}><Ban size={12} /> Desactivar</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canManage && links !== undefined && !showNew && (
        <button onClick={() => { setShowNew(true); setError(""); }} className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
          <Link2 size={15} /> {links && links.length > 0 ? "Crear otro enlace" : "Crear enlace del portal"}
        </button>
      )}
      {showNew && (
        <div className="mt-3 p-3" style={{ border: `1px dashed ${C.amber}` }}>
          <Field label="Nombre del enlace (opcional, para identificarlo)">
            <input className={inputClass} style={inputStyle} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ej. Encargado de mantenimiento Bávaro" maxLength={80} />
          </Field>
          <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
            <input type="checkbox" checked={newAll} onChange={(e) => setNewAll(e.target.checked)} /> Todas las sedes (enlace general)
          </label>
          {!newAll && (
            <div className="flex flex-wrap gap-2 mb-2">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-1.5 text-sm px-3 py-1.5 cursor-pointer" style={{ border: `1px solid ${C.border}`, background: newBranches.includes(b.id) ? C.panelAlt : "transparent" }}>
                  <input type="checkbox" checked={newBranches.includes(b.id)} onChange={() => toggleBranch(b.id)} /> {b.name}
                </label>
              ))}
            </div>
          )}
          {!newAll && <div className="text-xs mb-2" style={{ color: C.muted }}>Este enlace solo verá los equipos, trabajos, averías y facturas de las sucursales marcadas.</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-3 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
            <button onClick={create} disabled={busy} className="px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{busy ? "Creando..." : "Crear enlace"}</button>
          </div>
        </div>
      )}
      <div className="text-xs p-3 mt-3" style={{ background: C.panelAlt, color: C.muted }}>
        Quien tenga un enlace puede ver la información que ese enlace muestra: compártelo solo con la persona indicada. Si se filtra, usa "Cambiar enlace" y el anterior deja de funcionar.
      </div>
      {error && <div className="text-xs mt-3" style={{ color: C.red }}>{error}</div>}
      <div className="flex justify-end mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Cerrar</button>
      </div>
    </Modal>
  );
}
