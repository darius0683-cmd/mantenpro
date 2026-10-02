// Ventas: clientes, cotizaciones, órdenes de venta, facturas, notas de crédito, contratos y caja.
// Se carga solo cuando se usa (ver lazy.jsx).

import React from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { X, Pencil, Plus, GripVertical, BadgeCheck, FileText, Trash2, ImageIcon, Ban, Layers, Copy, Receipt, ClipboardList } from "lucide-react";
import { ActivityHistorySection, C, ClientSearchSelect, Field, MOTIVOS_ANULACION_608, Modal, PAYMENT_STATUS_CFG, Pill, ProductSearchSelect, QUOTE_STATUS_CFG, SALES_ORDER_STATUS_CFG, SearchSelect, cardDetailLine, fmtDate, fmtMoney, groupItemsByChapter, iconBtnStyle, inputClass, inputStyle, invoiceLikeHtml, isRetentionMethod, printDocument, todayStrRD } from "./base.jsx";

export function ClientFormModal({ initial, onClose, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [rnc, setRnc] = useState(initial?.rnc_cedula || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [dgiiMatch, setDgiiMatch] = useState(null);
  const [dgiiLookupDismissed, setDgiiLookupDismissed] = useState(false);
  const [dgiiSearched, setDgiiSearched] = useState(false);
  // Búsqueda por nombre en el catálogo DGII importado — para cuando el
  // vendedor no tiene el RNC a mano y solo conoce el nombre de la empresa.
  // Al elegir un resultado se llenan Nombre y RNC de una vez.
  const [dgiiNameQuery, setDgiiNameQuery] = useState("");
  const [dgiiNameResults, setDgiiNameResults] = useState([]);
  const [dgiiNameSearching, setDgiiNameSearching] = useState(false);

  useEffect(() => {
    const digits = rnc.replace(/\D/g, "");
    setDgiiLookupDismissed(false);
    setDgiiSearched(false);
    if (digits.length !== 9 && digits.length !== 11) { setDgiiMatch(null); return; }
    let active = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.from("dgii_rnc_catalog").select("name, commercial_name").eq("rnc", digits).maybeSingle();
      if (active) { setDgiiMatch(data || null); setDgiiSearched(true); }
    }, 400);
    return () => { active = false; clearTimeout(t); };
  }, [rnc]);

  useEffect(() => {
    const q = dgiiNameQuery.trim();
    if (q.length < 3) { setDgiiNameResults([]); setDgiiNameSearching(false); return; }
    let active = true;
    setDgiiNameSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from("dgii_rnc_catalog").select("rnc, name, commercial_name")
        .or(`name.ilike.%${q}%,commercial_name.ilike.%${q}%`).limit(8);
      if (active) { setDgiiNameResults(data || []); setDgiiNameSearching(false); }
    }, 400);
    return () => { active = false; clearTimeout(t); };
  }, [dgiiNameQuery]);

  const pickDgiiResult = (r) => {
    setName(r.name);
    setRnc(r.rnc);
    setDgiiNameQuery("");
    setDgiiNameResults([]);
  };

  const submit = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), rnc_cedula: rnc.trim() || null, phone: phone.trim() || null, email: email.trim() || null, address: address.trim() || null });
  };

  return (
    <Modal title={initial ? "Editar cliente" : "Agregar cliente"} onClose={onClose} wide>
      {!initial && (
        <div className="relative mb-3">
          <Field label="Buscar empresa en el catálogo DGII (opcional)">
            <input
              className={inputClass}
              style={inputStyle}
              value={dgiiNameQuery}
              onChange={(e) => setDgiiNameQuery(e.target.value)}
              placeholder="Escribe el nombre de la empresa (mín. 3 letras)..."
            />
          </Field>
          {dgiiNameQuery.trim().length >= 3 && (
            <div className="absolute left-0 right-0 z-10 max-h-56 overflow-y-auto" style={{ background: C.panel, border: `1px solid ${C.border}`, top: "100%" }}>
              {dgiiNameSearching ? (
                <div className="px-3 py-2 text-xs" style={{ color: C.muted }}>Buscando...</div>
              ) : dgiiNameResults.length === 0 ? (
                <div className="px-3 py-2 text-xs" style={{ color: C.muted }}>Sin coincidencias en tu catálogo DGII importado.</div>
              ) : (
                dgiiNameResults.map((r) => (
                  <button
                    key={r.rnc}
                    type="button"
                    onClick={() => pickDgiiResult(r)}
                    className="w-full text-left px-3 py-2 text-sm"
                    style={{ borderBottom: `1px solid ${C.border}`, background: "transparent" }}
                  >
                    <div style={{ color: C.text }}>{r.name}{r.commercial_name ? ` (${r.commercial_name})` : ""}</div>
                    <div className="text-xs font-mono" style={{ color: C.muted }}>RNC {r.rnc}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre / razón social">
          <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Supermercado La Ideal" />
        </Field>
        <Field label="RNC / Cédula">
          <input className={inputClass} style={inputStyle} value={rnc} onChange={(e) => setRnc(e.target.value)} placeholder="Ej. 101-01234-5" />
        </Field>
      </div>
      {dgiiMatch && !dgiiLookupDismissed && dgiiMatch.name.trim().toLowerCase() !== name.trim().toLowerCase() && (
        <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 text-sm" style={{ background: C.amber + "15", border: `1px solid ${C.amber}40` }}>
          <div className="min-w-0">
            <div className="text-xs" style={{ color: C.muted }}>Encontrado en el catálogo DGII:</div>
            <div className="truncate" style={{ color: C.text }}>{dgiiMatch.name}{dgiiMatch.commercial_name ? ` (${dgiiMatch.commercial_name})` : ""}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => { setName(dgiiMatch.name); setDgiiLookupDismissed(true); }} className="text-xs px-2 py-1 font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Usar</button>
            <button onClick={() => setDgiiLookupDismissed(true)} style={{ color: C.muted }}><X size={14} /></button>
          </div>
        </div>
      )}
      {dgiiSearched && !dgiiMatch && !dgiiLookupDismissed && (
        <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <div className="text-xs" style={{ color: C.muted }}>No está en tu catálogo DGII importado — puede ser una persona registrada sin fines de contribuyente (esas no tienen archivo descargable).</div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href={`https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ciudadanos.aspx`} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 font-semibold whitespace-nowrap" style={{ border: `1px solid ${C.border}`, color: C.amber }}>Buscar en DGII</a>
            <button onClick={() => setDgiiLookupDismissed(true)} style={{ color: C.muted }}><X size={14} /></button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono">
          <input className={inputClass} style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej. 809-555-1234" />
        </Field>
        <Field label="Correo">
          <input className={inputClass} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ej. contacto@cliente.com" />
        </Field>
      </div>
      <Field label="Dirección">
        <input className={inputClass} style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ej. Av. 27 de Febrero, Santo Domingo" />
      </Field>
      {initial && <ActivityHistorySection tableName="clients" recordId={initial.id} title="Historial de este cliente" />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar cliente"}
        </button>
      </div>
    </Modal>
  );
}

// Convierte líneas ya guardadas (planas, con .chapter) en bloques editables (capítulo + líneas) para el formulario de edición
export function itemsToBlocks(items, blankItem) {
  let n = 0;
  const blocks = [];
  let currentChapter = "";
  (items || []).forEach((it) => {
    const ch = (it.chapter || "").trim();
    if (ch !== currentChapter) {
      if (ch) blocks.push({ id: n++, kind: "chapter", name: ch });
      currentChapter = ch;
    }
    const { chapter, ...rest } = it;
    blocks.push({ id: n++, kind: "item", ...rest });
  });
  if (blocks.length === 0) blocks.push({ id: n++, kind: "item", ...blankItem });
  return blocks;
}

// Recibo de ingreso de un cobro (se imprime desde el detalle de la factura)
export function receiptHtml({ company, companyName, clientName, clientRnc, invoice, payment, balanceAfter }) {
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const number = payment.receipt_number || `REC-${String(payment.id || "").slice(0, 8).toUpperCase()}`;
  const companyMeta = [company?.rnc ? `RNC: ${company.rnc}` : null, company?.address || null, company?.phone ? `Tel: ${company.phone}` : null].filter(Boolean).map(esc).join(" · ");
  const usd = payment.currency === "USD"
    ? `<div><span>Recibido en dólares</span><span>US$ ${Number(payment.foreign_amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (tasa RD$ ${esc(payment.payment_rate)})</span></div>`
    : "";
  const card = payment.card ? `<div class="muted" style="margin-top:4px">Tarjeta: ${esc(cardDetailLine(payment.card))}</div>` : "";
  return `
    <div class="header-row">
      <div style="display:flex;gap:12px;align-items:flex-start">
        ${company?.logo_url ? `<img src="${esc(company.logo_url)}" style="width:56px;height:56px;object-fit:contain;flex-shrink:0" />` : ""}
        <div>
          <h1>${esc(companyName)}</h1>
          ${companyMeta ? `<div class="muted" style="font-size:11px">${companyMeta}</div>` : ""}
          <div class="muted">Recibo de ingreso · ${esc(number)}</div>
        </div>
      </div>
      <div class="muted" style="text-align:right">Fecha: ${esc(fmtDate(payment.payment_date))}</div>
    </div>
    <div class="muted">Recibimos de: <b style="color:#111">${esc(clientName)}</b>${clientRnc ? ` · RNC/Cédula: <b style="color:#111">${esc(clientRnc)}</b>` : ""}</div>
    <div class="muted" style="margin-top:2px">Por concepto de: pago de la factura ${esc(invoice.invoice_number || "")} · NCF ${esc(invoice.ncf || "")}${invoice.title ? ` — ${esc(invoice.title)}` : ""}</div>
    <div class="totals" style="width:340px">
      <div><span>Forma de pago</span><span>${esc(payment.method || "—")}</span></div>
      ${usd}
      <div><span>Total factura</span><span>${fmtMoney(invoice.total)}</span></div>
      <div class="total"><span>Monto recibido</span><span>${fmtMoney(payment.amount)}</span></div>
      <div><span>Saldo pendiente</span><span>${fmtMoney(balanceAfter)}</span></div>
    </div>
    ${card}
    ${payment.notes ? `<div class="muted" style="margin-top:10px">Notas: ${esc(payment.notes)}</div>` : ""}
    <div style="display:flex;justify-content:space-between;gap:40px;margin-top:60px">
      <div style="flex:1;border-top:1px solid #333;padding-top:4px;text-align:center" class="muted">Recibido por</div>
      <div style="flex:1;border-top:1px solid #333;padding-top:4px;text-align:center" class="muted">Entregado por</div>
    </div>
  `;
}

export function statementHtml(companyName, clientName, invoicesList) {
  const rows = invoicesList.map((inv) => {
    const balance = Number(inv.total) - Number(inv.amount_paid || 0);
    const payCfg = PAYMENT_STATUS_CFG[inv.payment_status] || PAYMENT_STATUS_CFG.pendiente;
    return `<tr><td>${inv.ncf}</td><td>${fmtDate(inv.invoice_date)}</td><td style="text-align:right">${fmtMoney(inv.total)}</td><td style="text-align:right">${fmtMoney(inv.amount_paid || 0)}</td><td style="text-align:right">${fmtMoney(balance)}</td><td>${payCfg.label}</td></tr>`;
  }).join("");
  const totalFacturado = invoicesList.reduce((s, i) => s + Number(i.total), 0);
  const totalCobrado = invoicesList.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const saldo = totalFacturado - totalCobrado;
  return `
    <div class="header-row">
      <div><h1>${companyName}</h1><div class="muted">Estado de cuenta</div></div>
      <div class="muted" style="text-align:right">Fecha: ${new Date().toLocaleDateString("es-DO")}</div>
    </div>
    <div class="muted">Cliente: <b style="color:#111">${clientName}</b></div>
    <table><thead><tr><th>NCF</th><th>Fecha</th><th style="text-align:right">Total</th><th style="text-align:right">Cobrado</th><th style="text-align:right">Saldo</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals">
      <div><span>Total facturado</span><span>${fmtMoney(totalFacturado)}</span></div>
      <div><span>Total cobrado</span><span>${fmtMoney(totalCobrado)}</span></div>
      <div class="total"><span>Saldo pendiente</span><span>${fmtMoney(saldo)}</span></div>
    </div>
  `;
}

export function CashOpenModal({ branchName, allowUsd, onClose, onSave, saving }) {
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingUsd, setOpeningUsd] = useState("");
  return (
    <Modal title={`Abrir caja${branchName ? " — " + branchName : ""}`} onClose={onClose}>
      <div className={`grid ${allowUsd ? "grid-cols-2" : "grid-cols-1"} gap-3`}>
        <Field label="Fondo inicial en pesos (RD$)">
          <input type="number" step="0.01" className={inputClass} style={inputStyle} value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} placeholder="0.00" />
        </Field>
        {allowUsd && (
          <Field label="Fondo inicial en dólares (US$)">
            <input type="number" step="0.01" className={inputClass} style={inputStyle} value={openingUsd} onChange={(e) => setOpeningUsd(e.target.value)} placeholder="0.00" />
          </Field>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => onSave(Number(openingAmount) || 0, Number(openingUsd) || 0)} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Abriendo..." : "Abrir caja"}
        </button>
      </div>
    </Modal>
  );
}

export function CardAcquirersPanel({ acquirers, canManage, onSave }) {
  const [draft, setDraft] = useState({ name: "", commission_pct: "", retention_pct: "" });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (row, after) => {
    setBusy(true);
    const ok = await onSave(row);
    setBusy(false);
    if (ok && after) after();
  };
  return (
    <div className="p-4 space-y-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="text-xs" style={{ color: C.muted }}>
        Empresas que procesan tus cobros con tarjeta (el Verifone). La comisión y la retención se descuentan del monto cobrado para calcular el neto que te depositan — úsalo para cuadrar la conciliación bancaria. Confirma los porcentajes con tu contrato y tu contador.
      </div>
      {(acquirers || []).map((a) => editing?.id === a.id ? (
        <div key={a.id} className="grid grid-cols-12 gap-2 items-center">
          <input className={`${inputClass} col-span-4`} style={inputStyle} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <input type="number" step="0.01" min="0" className={`${inputClass} col-span-2`} style={inputStyle} value={editing.commission_pct} onChange={(e) => setEditing({ ...editing, commission_pct: e.target.value })} title="Comisión %" />
          <input type="number" step="0.01" min="0" className={`${inputClass} col-span-2`} style={inputStyle} value={editing.retention_pct} onChange={(e) => setEditing({ ...editing, retention_pct: e.target.value })} title="Retención %" />
          <div className="col-span-4 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-2 py-1 text-xs" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
            <button disabled={busy} onClick={() => save(editing, () => setEditing(null))} className="px-2 py-1 text-xs font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>Guardar</button>
          </div>
        </div>
      ) : (
        <div key={a.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt, opacity: a.active ? 1 : 0.5 }}>
          <div>
            <span style={{ color: C.text }}>{a.name}</span>
            <span className="text-xs ml-2" style={{ color: C.muted }}>Comisión {Number(a.commission_pct)}%{Number(a.retention_pct) > 0 ? ` · Retención ${Number(a.retention_pct)}%` : ""}{a.active ? "" : " · Inactivo"}</span>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <button onClick={() => setEditing({ ...a })} style={iconBtnStyle}><Pencil size={13} /></button>
              <button disabled={busy} onClick={() => save({ ...a, active: !a.active })} className="text-xs" style={{ color: a.active ? C.red : C.green }}>{a.active ? "Desactivar" : "Activar"}</button>
            </div>
          )}
        </div>
      ))}
      {(acquirers || []).length === 0 && <div className="text-sm" style={{ color: C.muted }}>Todavía no hay adquirentes configurados.</div>}
      {canManage && (
        <div className="grid grid-cols-12 gap-2 items-end pt-2">
          <div className="col-span-4"><Field label="Nombre"><input className={inputClass} style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ej. Azul, CardNET" /></Field></div>
          <div className="col-span-3"><Field label="Comisión %"><input type="number" step="0.01" min="0" className={inputClass} style={inputStyle} value={draft.commission_pct} onChange={(e) => setDraft({ ...draft, commission_pct: e.target.value })} placeholder="Ej. 3.5" /></Field></div>
          <div className="col-span-3"><Field label="Retención % (opcional)"><input type="number" step="0.01" min="0" className={inputClass} style={inputStyle} value={draft.retention_pct} onChange={(e) => setDraft({ ...draft, retention_pct: e.target.value })} placeholder="0" /></Field></div>
          <div className="col-span-2 pb-3">
            <button disabled={busy || !draft.name.trim()} onClick={() => save(draft, () => setDraft({ name: "", commission_pct: "", retention_pct: "" }))} className="w-full flex items-center justify-center gap-1 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}><Plus size={14} /> Agregar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CashCloseModal({ session, branchName, expected, onClose, onSave, saving }) {
  const [declaredCash, setDeclaredCash] = useState(expected.cash.toFixed(2));
  const [declaredCard, setDeclaredCard] = useState(expected.card.toFixed(2));
  const [declaredTransfer, setDeclaredTransfer] = useState(expected.transfer.toFixed(2));
  const [declaredCashUsd, setDeclaredCashUsd] = useState((expected.cashUsd || 0).toFixed(2));
  const [notes, setNotes] = useState("");
  const diffCashUsd = Number(declaredCashUsd || 0) - (expected.cashUsd || 0);
  const showUsd = (expected.cashUsd || 0) > 0 || Number(session.opening_amount_usd || 0) > 0;
  const diffCash = Number(declaredCash || 0) - expected.cash;
  const diffCard = Number(declaredCard || 0) - expected.card;
  const diffTransfer = Number(declaredTransfer || 0) - expected.transfer;
  const hasDiff = Math.abs(diffCash) > 0.01 || Math.abs(diffCard) > 0.01 || Math.abs(diffTransfer) > 0.01 || Math.abs(diffCashUsd) > 0.01;
  const diffRow = (label, diff) => (
    <div className="flex justify-between text-xs" style={{ color: Math.abs(diff) > 0.01 ? (diff > 0 ? C.blue : C.red) : C.muted }}>
      <span>Diferencia {label}</span><span className="font-mono">{diff > 0 ? "+" : ""}{fmtMoney(diff)}</span>
    </div>
  );
  return (
    <Modal title={`Cerrar caja${branchName ? " — " + branchName : ""}`} onClose={onClose}>
      <div className="text-xs mb-3" style={{ color: C.muted }}>Fondo inicial: <span className="font-mono" style={{ color: C.text }}>{fmtMoney(session.opening_amount)}</span></div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Efectivo contado">
          <input type="number" step="0.01" className={inputClass} style={inputStyle} value={declaredCash} onChange={(e) => setDeclaredCash(e.target.value)} />
          <div className="text-xs mt-1" style={{ color: C.muted }}>Esperado: {fmtMoney(expected.cash)}</div>
          {diffRow("", diffCash)}
        </Field>
        <Field label="Tarjeta">
          <input type="number" step="0.01" className={inputClass} style={inputStyle} value={declaredCard} onChange={(e) => setDeclaredCard(e.target.value)} />
          <div className="text-xs mt-1" style={{ color: C.muted }}>Esperado: {fmtMoney(expected.card)}</div>
          {diffRow("", diffCard)}
        </Field>
        <Field label="Transferencia/Otro">
          <input type="number" step="0.01" className={inputClass} style={inputStyle} value={declaredTransfer} onChange={(e) => setDeclaredTransfer(e.target.value)} />
          <div className="text-xs mt-1" style={{ color: C.muted }}>Esperado: {fmtMoney(expected.transfer)}</div>
          {diffRow("", diffTransfer)}
        </Field>
      </div>
      {showUsd && (
        <Field label="Efectivo en dólares contado (US$)">
          <input type="number" step="0.01" className={inputClass} style={inputStyle} value={declaredCashUsd} onChange={(e) => setDeclaredCashUsd(e.target.value)} />
          <div className="text-xs mt-1" style={{ color: C.muted }}>Esperado: US$ {(expected.cashUsd || 0).toFixed(2)} (fondo US$ {Number(session.opening_amount_usd || 0).toFixed(2)})</div>
          <div className="flex justify-between text-xs" style={{ color: Math.abs(diffCashUsd) > 0.01 ? (diffCashUsd > 0 ? C.blue : C.red) : C.muted }}>
            <span>Diferencia</span><span className="font-mono">{diffCashUsd > 0 ? "+" : ""}US$ {diffCashUsd.toFixed(2)}</span>
          </div>
        </Field>
      )}
      <Field label={`Notas${hasDiff ? " (explica el descuadre)" : " (opcional)"}`}>
        <textarea rows={2} className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Faltante por cambio mal dado, sobrante sin explicación..." />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button
          onClick={() => onSave({ cash: Number(declaredCash) || 0, cashUsd: Number(declaredCashUsd) || 0, card: Number(declaredCard) || 0, transfer: Number(declaredTransfer) || 0, notes: notes.trim() || null })}
          disabled={saving || (hasDiff && !notes.trim())}
          className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}
        >
          {saving ? "Cerrando..." : "Cerrar caja"}
        </button>
      </div>
    </Modal>
  );
}
export const TIPOS_INGRESO_607 = [
  { code: "01", label: "01 · Ingresos por operaciones (no financieros)" },
  { code: "02", label: "02 · Ingresos financieros" },
  { code: "03", label: "03 · Ingresos extraordinarios" },
  { code: "04", label: "04 · Ingresos por arrendamientos" },
  { code: "05", label: "05 · Ingresos por venta de activo depreciable" },
  { code: "06", label: "06 · Otros ingresos" },
];

export function InvoiceFormModal({ clients, products, ncfSequences, branches, bankAccounts, defaultBranchId, prefill, maxDiscountPct, onClose, onSave, saving, onRequestNewClient, autoSelectClientId, autoSelectToken }) {
  const [title, setTitle] = useState(prefill?.title || "");
  const [clientId, setClientId] = useState(prefill?.client_id || clients[0]?.id || "");
  // Si desde este formulario se creó un cliente nuevo con el "+", lo selecciona
  // solo en cuanto se guarda — ver nota en ClientAssetFormModal.
  const appliedAutoSelectTokenRef = useRef(autoSelectToken);
  useEffect(() => {
    if (autoSelectToken !== appliedAutoSelectTokenRef.current && autoSelectClientId) {
      setClientId(autoSelectClientId);
      appliedAutoSelectTokenRef.current = autoSelectToken;
    }
  }, [autoSelectToken, autoSelectClientId]);
  const [sequenceId, setSequenceId] = useState("");
  const [branchId, setBranchId] = useState(prefill?.branch_id || defaultBranchId || branches?.[0]?.id || "");
  const [invoiceDate, setInvoiceDate] = useState(() => todayStrRD());
  const [discountPct, setDiscountPct] = useState(prefill?.discount_pct ?? 0);
  const [applyNorma0205, setApplyNorma0205] = useState(false);
  const [exemptItbis, setExemptItbis] = useState(false);
  const [currency, setCurrency] = useState(prefill?.currency || "DOP");
  const [exchangeRate, setExchangeRate] = useState(prefill?.exchange_rate ?? 1);
  const [paymentTerms, setPaymentTerms] = useState(prefill?.payment_terms || "");
  const [incomeType, setIncomeType] = useState(prefill?.income_type || "01");
  const [bankAccountId, setBankAccountId] = useState(prefill?.bank_account_id || (bankAccounts || []).find((a) => a.is_default)?.id || "");
  const [notes, setNotes] = useState(prefill?.notes || "");
  const blankItem = { product_id: "", description: "", quantity: 1, unit_price: 0, is_taxable: true, register_asset: false, asset_serial: "", asset_warranty_months: 12 };
  const [blocks, setBlocks] = useState(() => {
    if (prefill?.items?.length) return itemsToBlocks(prefill.items, blankItem);
    return [{ id: 0, kind: "item", ...blankItem }];
  });
  const newBlockId = () => Date.now() + Math.random();

  // Mismas reglas que create_invoice: activa, con números, no vencida a la fecha de la factura y
  // nunca B04 (esas son solo para notas de crédito).
  const usableSequences = ncfSequences.filter((s) => s.active && s.next_number <= s.range_end && s.ncf_type !== "B04" && (!s.expiration_date || s.expiration_date >= invoiceDate));

  const updateBlock = (id, patch) => setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const addItemRow = () => setBlocks((prev) => [...prev, { id: newBlockId(), kind: "item", ...blankItem }]);
  const addChapterRow = () => setBlocks((prev) => [...prev, { id: newBlockId(), kind: "chapter", name: "" }]);
  const removeBlock = (id) => setBlocks((prev) => prev.filter((b) => b.id !== id));
  const reorderBlocks = (draggedId, targetId) => setBlocks((prev) => {
    if (String(draggedId) === String(targetId)) return prev;
    const dragIdx = prev.findIndex((b) => String(b.id) === String(draggedId));
    const targetIdx = prev.findIndex((b) => String(b.id) === String(targetId));
    if (dragIdx === -1 || targetIdx === -1) return prev;
    const next = [...prev];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    return next;
  });

  const onProductPick = (id, productId) => {
    const prod = products.find((p) => p.id === productId);
    updateBlock(id, { product_id: productId, description: prod?.name || "", unit_price: prod?.unit_price || 0, is_taxable: prod?.is_taxable ?? true });
  };

  const onDiscountChange = (v) => {
    const n = Math.max(0, Math.min(maxDiscountPct, Number(v) || 0));
    setDiscountPct(n);
  };

  const resolvedItems = useMemo(() => {
    let current = "";
    const result = [];
    blocks.forEach((b) => {
      if (b.kind === "chapter") current = b.name.trim();
      else result.push({ ...b, chapter: current });
    });
    return result;
  }, [blocks]);

  const itemAmount = (it) => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
  const grossSubtotal = resolvedItems.reduce((sum, it) => sum + itemAmount(it), 0);
  const grossTaxable = resolvedItems.reduce((sum, it) => sum + (it.is_taxable ? itemAmount(it) : 0), 0);
  const discountFactor = 1 - (Number(discountPct) || 0) / 100;
  const discountAmount = grossSubtotal * (1 - discountFactor);
  const subtotal = grossSubtotal * discountFactor;
  const itbis = exemptItbis ? 0 : grossTaxable * discountFactor * 0.18;
  const itbisRetained = applyNorma0205 ? itbis * 0.30 : 0;
  const total = subtotal + itbis - itbisRetained;
  const rate = currency === "USD" ? (Number(exchangeRate) || 1) : 1;
  const chapterGroups = groupItemsByChapter(resolvedItems, itemAmount);
  const hasChapters = chapterGroups.length > 1 || (chapterGroups[0] && chapterGroups[0].chapter !== "General");
  const chapterSubtotal = (name) => chapterGroups.find((g) => g.chapter === (name.trim() || "General"))?.subtotal || 0;

  const submit = () => {
    const validItems = resolvedItems.filter((it) => it.description.trim() && Number(it.quantity) > 0);
    if (!clientId || !sequenceId || validItems.length === 0) return;
    onSave({
      title: title.trim() || null, client_id: clientId, ncf_sequence_id: sequenceId, branch_id: branchId || null, invoice_date: invoiceDate, discount_pct: discountPct,
      subtotal: subtotal * rate, itbis: itbis * rate, exempt_itbis: exemptItbis, applies_norma_0205: applyNorma0205, itbis_retained: itbisRetained * rate, total: total * rate,
      currency, exchange_rate: rate, payment_terms: paymentTerms || null, bank_account_id: bankAccountId || null, notes: notes.trim() || null,
      income_type: incomeType || "01",
      foreign_subtotal: currency === "USD" ? subtotal : null,
      foreign_itbis: currency === "USD" ? itbis : null,
      foreign_total: currency === "USD" ? total : null,
    }, validItems);
  };

  return (
    <Modal title="Nueva factura" onClose={onClose} wide>
      <Field label="Título de la factura (opcional)">
        <input className={inputClass} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Instalación de A/C - Oficina Principal" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Cliente">
          <div className="flex gap-2">
            <div className="flex-1"><SearchSelect items={clients} value={clientId} onChange={setClientId} placeholder="Buscar cliente..." getLabel={(c) => c.name} /></div>
            <button type="button" onClick={onRequestNewClient} className="px-3 flex-shrink-0" style={{ border: `1px solid ${C.border}`, color: C.amber }}><Plus size={14} /></button>
          </div>
        </Field>
        <Field label="Secuencia NCF">
          <select className={inputClass} style={inputStyle} value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
            <option value="">Selecciona una</option>
            {usableSequences.map((s) => (
              <option key={s.id} value={s.id}>{s.ncf_type} · quedan {s.range_end - s.next_number + 1}</option>
            ))}
          </select>
          {usableSequences.length === 0 && <div className="text-xs mt-1" style={{ color: C.red }}>No hay secuencias NCF disponibles — créala en "Secuencias NCF".</div>}
        </Field>
        <Field label="Fecha">
          <input type="date" className={inputClass} style={inputStyle} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Sucursal">
        <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">Sin asignar</option>
          {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field label="Forma de pago (opcional)">
        <select className={inputClass} style={inputStyle} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
          <option value="">Sin especificar</option>
          <option value="Efectivo">Efectivo</option>
          <option value="Transferencia">Transferencia</option>
          <option value="Tarjeta">Tarjeta</option>
          <option value="Cheque">Cheque</option>
          <option value="Crédito 15 días">Crédito 15 días</option>
          <option value="Crédito 30 días">Crédito 30 días</option>
          <option value="Crédito 45 días">Crédito 45 días</option>
          <option value="Crédito 60 días">Crédito 60 días</option>
        </select>
      </Field>
      <Field label="Tipo de ingreso (607)">
        <select className={inputClass} style={inputStyle} value={incomeType} onChange={(e) => setIncomeType(e.target.value)}>
          {TIPOS_INGRESO_607.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
      </Field>
      {bankAccounts && bankAccounts.length > 0 && (
        <Field label="Cuenta bancaria a mostrar (opcional)">
          <select className={inputClass} style={inputStyle} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
            <option value="">No mostrar ninguna</option>
            {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.bank_name} — {a.account_type ? `${a.account_type} ` : ""}{a.account_number}{a.is_default ? " (predeterminada)" : ""}</option>)}
          </select>
        </Field>
      )}
      <Field label="Observaciones (opcional — sale en el impreso)">
        <textarea className={inputClass} style={{ ...inputStyle, minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Se recibió un adelanto de RD$ 10,000 el 10/09." />
      </Field>
      <Field label={`Descuento (% — máximo permitido: ${maxDiscountPct}%)`}>
        <input type="number" min="0" max={maxDiscountPct} step="0.5" className={inputClass} style={inputStyle} value={discountPct} onChange={(e) => onDiscountChange(e.target.value)} disabled={maxDiscountPct <= 0} />
        {maxDiscountPct <= 0 && <div className="text-xs mt-1" style={{ color: C.muted }}>No tienes permiso para aplicar descuentos — pídele a un admin que te asigne un límite.</div>}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Moneda">
          <select className={inputClass} style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="DOP">Pesos (RD$)</option>
            <option value="USD">Dólares (US$)</option>
          </select>
        </Field>
        {currency === "USD" && (
          <Field label="Tasa de cambio (RD$ por US$1)">
            <input type="number" min="0" step="0.01" className={inputClass} style={inputStyle} value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="Ej. 60.50" />
          </Field>
        )}
      </div>
      {currency === "USD" && (
        <div className="text-xs mb-3 -mt-1" style={{ color: C.muted }}>Los precios de los renglones se interpretan en US$. El NCF y los reportes fiscales siempre usan el equivalente en pesos.</div>
      )}

      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Productos / servicios</div>
      <div className="grid grid-cols-12 gap-2 min-w-[860px] text-[10px] uppercase tracking-wide mb-1 px-1" style={{ color: C.muted }}>
        <div className="col-span-4">Producto</div>
        <div className="col-span-3">Descripción</div>
        <div className="col-span-1">Cantidad</div>
        <div className="col-span-2">Precio</div>
        <div className="col-span-1">ITBIS</div>
        <div className="col-span-1"></div>
      </div>
      <div className="space-y-2 mb-3">
        {blocks.map((b) =>
          b.kind === "chapter" ? (
            <div key={b.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); reorderBlocks(e.dataTransfer.getData("text/plain"), b.id); }}
              className="flex items-center gap-2 pt-2"
            >
              <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(b.id))} className="cursor-grab flex-shrink-0 touch-none" style={{ color: C.muted }} title="Arrastrar para reordenar">
                <GripVertical size={16} />
              </div>
              <input className={inputClass} style={{ ...inputStyle, fontWeight: 600, color: C.amber, borderColor: C.amber + "60" }} value={b.name} onChange={(e) => updateBlock(b.id, { name: e.target.value })} placeholder="Nombre del capítulo — ej. Mano de obra, Materiales" />
              <div className="text-sm font-mono flex-shrink-0" style={{ color: C.amber, minWidth: 100, textAlign: "right" }}>{fmtMoney(chapterSubtotal(b.name))}</div>
              <button onClick={() => removeBlock(b.id)} style={iconBtnStyle}><X size={16} /></button>
            </div>
          ) : (
            <div key={b.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); reorderBlocks(e.dataTransfer.getData("text/plain"), b.id); }}
            >
              <div className="grid grid-cols-12 gap-2 min-w-[860px] items-center">
                <div className="col-span-4 flex items-center gap-1">
                  <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(b.id))} className="cursor-grab flex-shrink-0 touch-none" style={{ color: C.muted }} title="Arrastrar para reordenar">
                    <GripVertical size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <ProductSearchSelect products={products} value={b.product_id} onChange={(id) => onProductPick(b.id, id)} placeholder="Buscar producto o servicio..." />
                  </div>
                </div>
                <input className={`${inputClass} col-span-3`} style={{ ...inputStyle, ...(!b.product_id ? { borderColor: C.amber + "60" } : {}) }} value={b.description} onChange={(e) => updateBlock(b.id, { description: e.target.value })} placeholder={b.product_id ? "Descripción" : "👈 Escribe aquí la descripción del trabajo"} />
                <input type="text" inputMode="decimal" className={`${inputClass} col-span-1`} style={inputStyle} value={b.quantity} onChange={(e) => updateBlock(b.id, { quantity: e.target.value })} placeholder="Cant." />
                <input type="text" inputMode="decimal" className={`${inputClass} col-span-2`} style={inputStyle} value={b.unit_price} onChange={(e) => updateBlock(b.id, { unit_price: e.target.value })} placeholder="Precio" />
                <label className="col-span-1 flex items-center gap-1 text-xs" style={{ color: C.muted }}>
                  <input type="checkbox" checked={b.is_taxable} onChange={(e) => updateBlock(b.id, { is_taxable: e.target.checked })} /> ITBIS
                </label>
                <button onClick={() => removeBlock(b.id)} className="col-span-1" style={iconBtnStyle}><X size={16} /></button>
              </div>
              <label className="flex items-center gap-2 text-xs mt-1 ml-1" style={{ color: C.muted }}>
                <input type="checkbox" checked={!!b.register_asset} onChange={(e) => updateBlock(b.id, { register_asset: e.target.checked })} />
                <BadgeCheck size={12} color={C.amber} /> Registrar este renglón como activo en garantía
              </label>
              {b.register_asset && (
                <div className="grid grid-cols-12 gap-2 min-w-[860px] items-center mt-1 ml-1">
                  <input className={`${inputClass} col-span-6`} style={inputStyle} value={b.asset_serial} onChange={(e) => updateBlock(b.id, { asset_serial: e.target.value })} placeholder="Número de serie (opcional)" />
                  <div className="col-span-6 flex items-center gap-2">
                    <input type="number" className={inputClass} style={inputStyle} value={b.asset_warranty_months} onChange={(e) => updateBlock(b.id, { asset_warranty_months: e.target.value })} placeholder="Meses de garantía" />
                    <span className="text-xs flex-shrink-0" style={{ color: C.muted }}>meses de garantía</span>
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
      <div className="flex gap-4 mb-4">
        <button onClick={addItemRow} className="flex items-center gap-2 text-sm" style={{ color: C.amber }}><Plus size={14} /> Agregar línea</button>
        <button onClick={addChapterRow} className="flex items-center gap-2 text-sm" style={{ color: C.text }}><Plus size={14} /> Agregar capítulo</button>
      </div>

      {hasChapters && (
        <div className="mb-3 p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>Subtotales por capítulo</div>
          {chapterGroups.map((g) => (
            <div key={g.chapter} className="flex justify-between text-sm" style={{ color: C.text }}><span>{g.chapter}</span><span className="font-mono">{fmtMoney(g.subtotal)}</span></div>
          ))}
        </div>
      )}

      <div className="p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        {discountPct > 0 && <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal bruto</span><span className="font-mono">{currency === "USD" ? `US$ ${grossSubtotal.toFixed(2)}` : fmtMoney(grossSubtotal)}</span></div>}
        {discountPct > 0 && <div className="flex justify-between text-sm" style={{ color: C.red }}><span>Descuento ({discountPct}%)</span><span className="font-mono">-{currency === "USD" ? `US$ ${discountAmount.toFixed(2)}` : fmtMoney(discountAmount)}</span></div>}
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{currency === "USD" ? `US$ ${subtotal.toFixed(2)}` : fmtMoney(subtotal)}</span></div>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS{exemptItbis ? " (exenta)" : " (18%)"}</span><span className="font-mono">{currency === "USD" ? `US$ ${itbis.toFixed(2)}` : fmtMoney(itbis)}</span></div>
        {applyNorma0205 && <div className="flex justify-between text-sm" style={{ color: C.red }}><span>Retención ITBIS 30% (Norma 02-05)</span><span className="font-mono">-{currency === "USD" ? `US$ ${itbisRetained.toFixed(2)}` : fmtMoney(itbisRetained)}</span></div>}
        <div className="flex justify-between text-base font-bold" style={{ color: C.text }}><span>Total</span><span className="font-mono">{currency === "USD" ? `US$ ${total.toFixed(2)}` : fmtMoney(total)}</span></div>
        {currency === "USD" && <div className="flex justify-between text-xs" style={{ color: C.muted }}><span>Equivalente (para el NCF)</span><span className="font-mono">{fmtMoney(total * rate)}</span></div>}
      </div>

      <label className="flex items-center gap-2 text-sm mt-3 p-3" style={{ color: C.text, background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <input type="checkbox" checked={exemptItbis} onChange={(e) => setExemptItbis(e.target.checked)} />
        <div>
          <div>Exenta de ITBIS (factura completa)</div>
          <div className="text-xs" style={{ color: C.muted }}>Quita el ITBIS de toda la factura, sin importar el cotejo "ITBIS" de cada renglón.</div>
        </div>
      </label>
      <label className="flex items-center gap-2 text-sm mt-2 p-3" style={{ color: C.text, background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <input type="checkbox" checked={applyNorma0205} onChange={(e) => setApplyNorma0205(e.target.checked)} disabled={exemptItbis} />
        <div>
          <div>Retención ITBIS 30% (Norma 02-05)</div>
          <div className="text-xs" style={{ color: C.muted }}>El cliente retiene el 30% del ITBIS y lo declara directamente a la DGII. La factura mostrará esta nota impresa.</div>
        </div>
      </label>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving || usableSequences.length === 0} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Emitiendo..." : "Emitir factura"}
        </button>
      </div>
    </Modal>
  );
}

export const CARD_BRANDS = ["Visa", "Mastercard", "American Express", "Discover", "Diners Club", "Otra"];

export function InvoiceDetailModal({ invoice, items, payments, clientName, clientRnc, clientAddress, companyName, company, bankAccounts, cardAcquirers, canEdit, canDelete, isAdmin, onClose, onVoid, onRegisterPayment, onDeletePayment, onDeletePaymentAttachment }) {
  const statusColor = invoice.status === "anulada" ? C.red : C.green;
  const payCfg = PAYMENT_STATUS_CFG[invoice.payment_status] || PAYMENT_STATUS_CFG.pendiente;
  const balance = Number(invoice.total) - Number(invoice.amount_paid || 0) - Number(invoice.credit_applied || 0);
  const chapterGroups = groupItemsByChapter(items, (it) => Number(it.subtotal) || 0);
  const showChapters = chapterGroups.length > 1 || (chapterGroups[0] && chapterGroups[0].chapter !== "General");
  const isImage = (name) => /\.(png|jpe?g|gif|webp)$/i.test(name || "");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payAmount, setPayAmount] = useState(balance > 0 ? balance.toFixed(2) : "");
  const [payDate, setPayDate] = useState(() => todayStrRD());
  const [payMethod, setPayMethod] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paymentFiles, setPaymentFiles] = useState([]);
  // Cobro en dólares: los US$ cancelan una factura en US$ a la tasa de la factura; la diferencia
  // con la tasa del día se guarda como diferencia cambiaria (lo calcula register_invoice_payment).
  const invIsUsd = invoice.currency === "USD";
  const invRate = Number(invoice.exchange_rate) || 1;
  const allowUsd = !!company?.accepts_usd_payments;
  const [payCurrency, setPayCurrency] = useState("DOP");
  const [payUsd, setPayUsd] = useState(() => (invIsUsd && balance > 0 ? (balance / invRate).toFixed(2) : ""));
  const [payRate, setPayRate] = useState(invIsUsd ? String(invoice.exchange_rate || "") : "");
  const usdNum = Number(payUsd) || 0;
  const rateNum = Number(payRate) || 0;
  const [payBankAccountId, setPayBankAccountId] = useState("");
  const accountsForCurrency = (bankAccounts || []).filter((a) => (a.currency || "DOP") === payCurrency);
  const needsBankAccount = payMethod === "Transferencia" && accountsForCurrency.length > 0;
  // Si hay una sola cuenta de esa moneda, se elige sola; si la elegida ya no aplica, se limpia.
  useEffect(() => {
    if (payMethod !== "Transferencia") { if (payBankAccountId) setPayBankAccountId(""); return; }
    if (accountsForCurrency.length === 1) { if (payBankAccountId !== accountsForCurrency[0].id) setPayBankAccountId(accountsForCurrency[0].id); return; }
    if (payBankAccountId && !accountsForCurrency.some((a) => a.id === payBankAccountId)) setPayBankAccountId("");
    // eslint-disable-next-line
  }, [payMethod, payCurrency, bankAccounts]);
  const usdApplied = payCurrency === "USD" ? Math.round(usdNum * (invIsUsd ? invRate : rateNum) * 100) / 100 : 0;
  const usdFx = payCurrency === "USD" && invIsUsd ? Math.round(usdNum * (rateNum - invRate) * 100) / 100 : 0;
  const activeAcquirers = (cardAcquirers || []).filter((a) => a.active);
  const [cardAcquirerId, setCardAcquirerId] = useState("");
  const [cardBrand, setCardBrand] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardAuthCode, setCardAuthCode] = useState("");
  const [cardBatch, setCardBatch] = useState("");
  const [cardError, setCardError] = useState("");
  const isCardPayment = payMethod === "Tarjeta";
  const selectedAcquirer = activeAcquirers.find((a) => a.id === cardAcquirerId) || null;
  // Valor real en RD$ del cobro (en US$ = dólares × tasa del día), base de la comisión de tarjeta
  const cardGross = payCurrency === "USD" ? Math.round(usdNum * rateNum * 100) / 100 : (Number(payAmount) || 0);
  const cardCommission = selectedAcquirer ? Math.round(cardGross * Number(selectedAcquirer.commission_pct || 0)) / 100 : 0;
  const cardRetention = selectedAcquirer ? Math.round(cardGross * Number(selectedAcquirer.retention_pct || 0)) / 100 : 0;
  const cardNet = cardGross - cardCommission - cardRetention;
  const resetCardFields = () => { setCardAcquirerId(""); setCardBrand(""); setCardLast4(""); setCardAuthCode(""); setCardBatch(""); setCardError(""); };

  const selectedBankAccount = (bankAccounts || []).find((a) => a.id === invoice.bank_account_id) || null;
  const doPrint = () => {
    const html = invoiceLikeHtml({
      docLabel: "Factura", code: invoice.invoice_number || invoice.ncf, docTitle: invoice.title, companyName, clientName, clientRnc, clientAddress,
      companyLogo: company?.logo_url, companyRnc: company?.rnc, companyAddress: company?.address, companyPhone: company?.phone,
      companyBankName: selectedBankAccount?.bank_name, companyBankAccountType: selectedBankAccount?.account_type, companyBankAccountNumber: selectedBankAccount?.account_number,
      dateLabel: "Fecha", dateValue: fmtDate(invoice.invoice_date), extraMeta: `<br/>NCF: ${invoice.ncf}`, paymentTerms: invoice.payment_terms, notes: invoice.notes,
      // En US$ se imprimen los precios en dólares de cada renglón (los totales siguen en RD$ con el ≈ US$).
      items: invoice.currency === "USD"
        ? items.map((it) => ({ ...it, unit_price: it.foreign_unit_price ?? it.unit_price, subtotal: it.foreign_subtotal ?? it.subtotal }))
        : items,
      subtotal: invoice.subtotal, itbis: invoice.itbis, total: invoice.total, discountPct: invoice.discount_pct,
      retainedLabel: "Retención ITBIS 30% (Norma 02-05)", retainedAmount: invoice.itbis_retained || 0,
      legalNote: [invoice.exempt_itbis ? "Factura exenta de ITBIS." : null, invoice.applies_norma_0205 ? "Aplica Norma 02-05 — Retención del 30% del ITBIS." : null].filter(Boolean).join(" ") || null,
      currency: invoice.currency, foreignTotal: invoice.foreign_total, exchangeRate: invoice.exchange_rate,
    });
    printDocument(`Factura ${invoice.invoice_number || invoice.ncf}`, html);
  };

  const [payError, setPayError] = useState("");
  // Saldo que quedó después de cada cobro (en orden de fecha), para mostrarlo en el recibo
  const printReceipt = (payment) => {
    const ordered = (payments || []).slice().sort((a, b) => (a.payment_date || "").localeCompare(b.payment_date || "") || (a.created_at || "").localeCompare(b.created_at || ""));
    let paidUpTo = 0;
    for (const pmt of ordered) { paidUpTo += Number(pmt.amount || 0); if (pmt.id === payment.id) break; }
    const balanceAfter = Math.max(Number(invoice.total || 0) - paidUpTo - Number(invoice.credit_applied || 0), 0);
    printDocument(`Recibo ${payment.receipt_number || ""}`, receiptHtml({ company, companyName, clientName, clientRnc, invoice, payment, balanceAfter }));
  };
  const submitPayment = () => {
    setPayError("");
    let amt = Number(payAmount);
    if (payCurrency === "USD") {
      if (usdNum <= 0) { setPayError("Escribe el monto recibido en dólares."); return; }
      if (rateNum <= 0) { setPayError("Escribe la tasa del día."); return; }
      amt = usdApplied;
    }
    if (!amt || amt <= 0) return;
    if (amt > balance + 0.05) { setPayError(`El pago (${fmtMoney(amt)}) es mayor que el saldo pendiente (${fmtMoney(balance)}).`); return; }
    if (needsBankAccount && !payBankAccountId) { setPayError("Elige la cuenta bancaria a la que llegó la transferencia."); return; }
    let card = null;
    if (isCardPayment) {
      if (!selectedAcquirer) { setCardError("Selecciona el adquirente (Azul, CardNET...) del voucher."); return; }
      if (!cardAuthCode.trim()) { setCardError("Escribe el número de aprobación que aparece en el voucher."); return; }
      if (cardLast4 && !/^\d{4}$/.test(cardLast4)) { setCardError("Los últimos dígitos de la tarjeta deben ser exactamente 4 números."); return; }
      card = {
        acquirer_id: selectedAcquirer.id,
        acquirer_name: selectedAcquirer.name,
        card_brand: cardBrand || null,
        last4: cardLast4 || null,
        auth_code: cardAuthCode.trim(),
        batch_number: cardBatch.trim() || null,
        commission_pct: Number(selectedAcquirer.commission_pct || 0),
        commission_amount: cardCommission,
        retention_pct: Number(selectedAcquirer.retention_pct || 0),
        retention_amount: cardRetention,
        net_amount: cardNet,
      };
    }
    onRegisterPayment(invoice, {
      amount: amt, payment_date: payDate, method: payMethod.trim() || null, notes: payNotes.trim() || null, card,
      currency: payCurrency, foreign_amount: payCurrency === "USD" ? usdNum : null, payment_rate: payCurrency === "USD" ? rateNum : null,
      bank_account_id: payMethod === "Transferencia" ? (payBankAccountId || null) : null,
    }, paymentFiles);
    setShowPaymentForm(false);
    setPayNotes("");
    setPaymentFiles([]);
    resetCardFields();
  };

  return (
    <Modal title={`Factura ${invoice.invoice_number || invoice.ncf}`} onClose={onClose} wide>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-bold text-base" style={{ color: C.text }}>{companyName}</div>
          {invoice.invoice_number && <div className="text-xs" style={{ color: C.muted }}>Factura: <span className="font-mono" style={{ color: C.text }}>{invoice.invoice_number}</span></div>}
          <div className="text-xs" style={{ color: C.muted }}>NCF: <span className="font-mono">{invoice.ncf}</span></div>
        </div>
        <Pill label={invoice.status === "anulada" ? "Anulada" : "Emitida"} color={statusColor} />
      </div>
      {invoice.status === "anulada" && (invoice.void_reason_code || invoice.void_reason) && (
        <div className="text-xs mb-2 px-2 py-1" style={{ background: C.redBg, color: C.red }}>
          Anulada{invoice.voided_at ? ` el ${new Date(invoice.voided_at).toLocaleDateString("es-DO")}` : ""} · {MOTIVOS_ANULACION_608.find((m) => m.code === invoice.void_reason_code)?.label || "sin motivo"}{invoice.void_reason ? ` — ${invoice.void_reason}` : ""}
        </div>
      )}
      {invoice.currency === "USD" && (
        <div className="text-xs mb-2 px-2 py-1 inline-block" style={{ background: C.blue + "1A", color: C.blue }}>
          Cotizada en US$ — tasa RD$ {invoice.exchange_rate} · Total ≈ US$ {Number(invoice.foreign_total || 0).toFixed(2)}
        </div>
      )}
      {invoice.title && <div className="text-sm mb-2" style={{ color: C.text }}>{invoice.title}</div>}
      {invoice.applies_norma_0205 && <div className="text-xs mb-2 font-semibold" style={{ color: C.amber }}>Aplica Norma 02-05 — Retención del 30% del ITBIS.</div>}
      <div className="mb-4"><Pill label={payCfg.label} color={payCfg.color} /></div>
      <div className="grid grid-cols-2 gap-3 text-xs mb-4" style={{ color: C.muted }}>
        <div>Cliente<br /><span style={{ color: C.text }}>{clientName}</span>{clientRnc && <span style={{ color: C.muted }}> · RNC/Cédula: {clientRnc}</span>}{clientAddress && <><br /><span style={{ color: C.muted }}>{clientAddress}</span></>}</div>
        <div>
          <div>Fecha<br /><span style={{ color: C.text }}>{fmtDate(invoice.invoice_date)}</span></div>
          {invoice.payment_terms && <div className="mt-2">Forma de pago<br /><span style={{ color: C.text }}>{invoice.payment_terms}</span></div>}
          {selectedBankAccount && <div className="mt-2">Cuenta bancaria<br /><span style={{ color: C.text }}>{selectedBankAccount.bank_name} — {selectedBankAccount.account_number}</span></div>}
        </div>
      </div>
      {invoice.notes && (
        <div className="text-xs mb-4 px-3 py-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
          <div className="uppercase tracking-wide mb-1" style={{ color: C.muted }}>Observaciones</div>
          {invoice.notes}
        </div>
      )}
      <div className="space-y-1 mb-3">
        {showChapters ? chapterGroups.map((g) => (
          <div key={g.chapter}>
            <div className="flex items-center justify-between text-xs uppercase tracking-wide px-3 py-1" style={{ color: C.amber }}>
              <span>{g.chapter}</span><span className="font-mono">{fmtMoney(g.subtotal)}</span>
            </div>
            {g.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt }}>
                <div>{it.description} {it.is_taxable && <span className="text-xs" style={{ color: C.muted }}>(ITBIS)</span>}</div>
                <div className="font-mono" style={{ color: C.muted }}>{it.quantity} × {fmtMoney(it.unit_price)} = {fmtMoney(it.subtotal)}</div>
              </div>
            ))}
          </div>
        )) : items.map((it) => (
          <div key={it.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt }}>
            <div>{it.description} {it.is_taxable && <span className="text-xs" style={{ color: C.muted }}>(ITBIS)</span>}</div>
            <div className="font-mono" style={{ color: C.muted }}>{it.quantity} × {fmtMoney(it.unit_price)} = {fmtMoney(it.subtotal)}</div>
          </div>
        ))}
      </div>
      <div className="p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        {invoice.discount_pct > 0 && <div className="flex justify-between text-sm" style={{ color: C.red }}><span>Descuento aplicado</span><span className="font-mono">{invoice.discount_pct}%</span></div>}
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(invoice.subtotal)}</span></div>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS{invoice.exempt_itbis ? " (exenta)" : ""}</span><span className="font-mono">{fmtMoney(invoice.itbis)}</span></div>
        {invoice.applies_norma_0205 && <div className="flex justify-between text-sm" style={{ color: C.red }}><span>Retención ITBIS 30% (Norma 02-05)</span><span className="font-mono">-{fmtMoney(invoice.itbis_retained || 0)}</span></div>}
        <div className="flex justify-between text-base font-bold" style={{ color: C.text }}><span>Total</span><span className="font-mono">{fmtMoney(invoice.total)}</span></div>
        <div className="flex justify-between text-sm" style={{ color: C.green }}><span>Cobrado</span><span className="font-mono">{fmtMoney(invoice.amount_paid || 0)}</span></div>
        {Number(invoice.credit_applied || 0) > 0 && <div className="flex justify-between text-sm" style={{ color: C.blue }}><span>Crédito aplicado</span><span className="font-mono">{fmtMoney(invoice.credit_applied)}</span></div>}
        <div className="flex justify-between text-sm font-semibold" style={{ color: balance > 0 ? C.red : C.muted }}><span>Saldo pendiente</span><span className="font-mono">{fmtMoney(balance)}</span></div>
      </div>

      {payments?.length > 0 && (
        <div className="mt-3">
          <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>Pagos registrados</div>
          <div className="space-y-1">
            {payments.map((p) => (
              <div key={p.id} className="px-3 py-2" style={{ background: C.panelAlt }}>
                <div className="flex items-center justify-between text-sm">
                  <div>{fmtDate(p.payment_date)} {p.method && <span style={{ color: isRetentionMethod(p.method) ? C.orange : C.muted }}>· {p.method}</span>}{p.receipt_number && <span className="font-mono text-xs" style={{ color: C.muted }}> · {p.receipt_number}</span>}</div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono" style={{ color: C.green }}>{fmtMoney(p.amount)}</span>
                    {!isRetentionMethod(p.method) && (
                      <button title="Imprimir recibo de ingreso" onClick={() => printReceipt(p)} style={iconBtnStyle}><FileText size={13} /></button>
                    )}
                    {canDelete && <button onClick={() => onDeletePayment(p, invoice)} style={iconBtnStyle}><Trash2 size={13} /></button>}
                  </div>
                </div>
                {p.currency === "USD" && (
                  <div className="text-xs mt-1" style={{ color: C.blue }}>
                    Recibido US$ {Number(p.foreign_amount || 0).toFixed(2)} · tasa del día RD$ {Number(p.payment_rate || 0)}
                    {Math.abs(Number(p.fx_difference || 0)) >= 0.01 && <> · {Number(p.fx_difference) > 0 ? "ganancia" : "pérdida"} cambiaria <span className="font-mono">{Number(p.fx_difference) > 0 ? "+" : ""}{fmtMoney(p.fx_difference)}</span></>}
                  </div>
                )}
                {p.card && (
                  <div className="text-xs mt-1" style={{ color: C.text }}>
                    {cardDetailLine(p.card)}
                    <div style={{ color: C.muted }}>
                      Comisión {Number(p.card.commission_pct)}%: -{fmtMoney(p.card.commission_amount)}
                      {Number(p.card.retention_amount) > 0 && <> · Retención {Number(p.card.retention_pct)}%: -{fmtMoney(p.card.retention_amount)}</>}
                      {" · "}Neto a depositar: <span style={{ color: C.green }}>{fmtMoney(p.card.net_amount)}</span>
                    </div>
                  </div>
                )}
                {p.notes && <div className="text-xs mt-1" style={{ color: C.muted }}>{p.notes}</div>}
                {p.attachments && p.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {p.attachments.map((a) => (
                      <div key={a.id} className="flex items-center gap-1 px-2 py-1 text-xs" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                        {isImage(a.file_name) ? <ImageIcon size={12} color={C.amber} /> : <FileText size={12} color={C.amber} />}
                        <a href={a.file_url} target="_blank" rel="noreferrer" className="truncate max-w-[140px]" style={{ color: C.amber }}>{a.file_name || "Comprobante"}</a>
                        {canDelete && <button type="button" onClick={() => onDeletePaymentAttachment(a, p)} style={iconBtnStyle}><X size={12} /></button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showPaymentForm && invoice.status !== "anulada" && (
        <div className="mt-3 p-3 space-y-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <div className="grid grid-cols-2 gap-2">
            {allowUsd && !isRetentionMethod(payMethod) ? (
              <Field label="Moneda recibida">
                <select className={inputClass} style={inputStyle} value={payCurrency} onChange={(e) => { setPayCurrency(e.target.value); setPayError(""); }}>
                  <option value="DOP">Pesos (RD$)</option>
                  <option value="USD">Dólares (US$)</option>
                </select>
              </Field>
            ) : <div />}
            <Field label="Fecha del pago">
              <input type="date" className={inputClass} style={inputStyle} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </Field>
          </div>
          {payCurrency === "DOP" ? (
            <Field label="Monto pagado (RD$)">
              <input type="number" step="0.01" className={inputClass} style={inputStyle} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </Field>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Monto recibido (US$)">
                  <input type="number" step="0.01" className={inputClass} style={inputStyle} value={payUsd} onChange={(e) => setPayUsd(e.target.value)} />
                </Field>
                <Field label="Tasa del día (RD$ por US$1)">
                  <input type="number" step="0.01" className={inputClass} style={inputStyle} value={payRate} onChange={(e) => setPayRate(e.target.value)} placeholder="Ej. 61.25" />
                </Field>
              </div>
              {usdNum > 0 && (invIsUsd || rateNum > 0) && (
                <div className="text-xs space-y-0.5 px-1" style={{ color: C.muted }}>
                  <div className="flex justify-between"><span>Se aplica a la factura{invIsUsd ? ` (tasa de la factura RD$ ${invoice.exchange_rate})` : ""}</span><span className="font-mono" style={{ color: C.text }}>{fmtMoney(usdApplied)}</span></div>
                  {invIsUsd && rateNum > 0 && Math.abs(usdFx) >= 0.01 && (
                    <div className="flex justify-between"><span>{usdFx > 0 ? "Ganancia" : "Pérdida"} cambiaria (tasa del día RD$ {rateNum})</span><span className="font-mono" style={{ color: usdFx > 0 ? C.green : C.red }}>{usdFx > 0 ? "+" : ""}{fmtMoney(usdFx)}</span></div>
                  )}
                  {!invIsUsd && <div>Factura en pesos: los dólares se convierten a la tasa del día, sin diferencia cambiaria.</div>}
                </div>
              )}
            </>
          )}
          <Field label="Método (opcional)">
            <select className={inputClass} style={inputStyle} value={payMethod} onChange={(e) => { setPayMethod(e.target.value); setCardError(""); if (isRetentionMethod(e.target.value)) setPayCurrency("DOP"); }}>
              <option value="">Selecciona un método</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Otro">Otro</option>
              <option value="Retención ISR (cliente)">Retención ISR hecha por el cliente</option>
            </select>
          </Field>
          {isRetentionMethod(payMethod) && (
            <div className="text-xs" style={{ color: C.muted }}>El cliente retuvo ISR y te pagó menos: esto rebaja el saldo de la factura, pero no es dinero en caja (no exige caja abierta ni lleva recibo). Va al 607 como "Retención Renta por Terceros". Adjunta abajo el certificado de retención cuando el cliente lo entregue.</div>
          )}
          {payMethod === "Transferencia" && accountsForCurrency.length > 0 && (
            <Field label={`Cuenta a la que llegó (${payCurrency === "USD" ? "US$" : "RD$"})`}>
              <select className={inputClass} style={inputStyle} value={payBankAccountId} onChange={(e) => setPayBankAccountId(e.target.value)}>
                {accountsForCurrency.length > 1 && <option value="">Selecciona</option>}
                {accountsForCurrency.map((a) => <option key={a.id} value={a.id}>{a.bank_name} — {a.account_number}</option>)}
              </select>
            </Field>
          )}
          {payMethod === "Transferencia" && payCurrency === "USD" && accountsForCurrency.length === 0 && (
            <div className="text-xs" style={{ color: C.orange }}>No hay cuentas en dólares registradas (Perfil de la empresa → Cuentas bancarias). El cobro se guarda igual, pero no se podrá conciliar por cuenta.</div>
          )}
          {payError && <div className="text-xs" style={{ color: C.red }}>{payError}</div>}
          {isCardPayment && (
            <div className="p-3 space-y-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Datos del voucher</div>
              {activeAcquirers.length === 0 && (
                <div className="text-xs" style={{ color: C.red }}>No hay adquirentes configurados — un admin debe agregarlos en Caja → "Adquirentes de tarjeta".</div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Adquirente">
                  <select className={inputClass} style={inputStyle} value={cardAcquirerId} onChange={(e) => setCardAcquirerId(e.target.value)}>
                    <option value="">Selecciona</option>
                    {activeAcquirers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </Field>
                <Field label="Marca (opcional)">
                  <select className={inputClass} style={inputStyle} value={cardBrand} onChange={(e) => setCardBrand(e.target.value)}>
                    <option value="">—</option>
                    {CARD_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <Field label="No. de aprobación">
                  <input className={inputClass} style={inputStyle} value={cardAuthCode} onChange={(e) => setCardAuthCode(e.target.value)} placeholder="Ej. 045821" />
                </Field>
                <Field label="Últimos 4 dígitos (opcional)">
                  <input inputMode="numeric" maxLength={4} className={inputClass} style={inputStyle} value={cardLast4} onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1234" />
                </Field>
                <Field label="Lote / referencia (opcional)">
                  <input className={inputClass} style={inputStyle} value={cardBatch} onChange={(e) => setCardBatch(e.target.value)} placeholder="Ej. 000123" />
                </Field>
              </div>
              {selectedAcquirer && cardGross > 0 && (
                <div className="text-xs space-y-0.5" style={{ color: C.muted }}>
                  <div className="flex justify-between"><span>Comisión {Number(selectedAcquirer.commission_pct)}%</span><span className="font-mono">-{fmtMoney(cardCommission)}</span></div>
                  {cardRetention > 0 && <div className="flex justify-between"><span>Retención {Number(selectedAcquirer.retention_pct)}%</span><span className="font-mono">-{fmtMoney(cardRetention)}</span></div>}
                  <div className="flex justify-between font-semibold" style={{ color: C.green }}><span>Neto que depositará {selectedAcquirer.name}</span><span className="font-mono">{fmtMoney(cardNet)}</span></div>
                </div>
              )}
              <div className="text-xs" style={{ color: C.muted }}>Puedes adjuntar la foto del voucher abajo en "Comprobantes de pago".</div>
              {cardError && <div className="text-xs" style={{ color: C.red }}>{cardError}</div>}
            </div>
          )}
          <Field label="Notas (opcional)">
            <textarea rows={2} className={inputClass} style={inputStyle} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Ej. Referencia de transferencia, banco, número de cheque..." />
          </Field>
          <Field label="Comprobantes de pago (opcional)">
            <input type="file" multiple accept="image/*,.pdf" onChange={(e) => setPaymentFiles(Array.from(e.target.files || []))} className={inputClass} style={inputStyle} />
            {paymentFiles.length > 0 && <div className="text-xs mt-1" style={{ color: C.muted }}>{paymentFiles.length} archivo{paymentFiles.length !== 1 ? "s" : ""} seleccionado{paymentFiles.length !== 1 ? "s" : ""} (se subirán al guardar)</div>}
          </Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowPaymentForm(false); setPayNotes(""); setPaymentFiles([]); resetCardFields(); }} className="px-3 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
            <button onClick={submitPayment} className="px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Guardar pago</button>
          </div>
        </div>
      )}

      <ActivityHistorySection
        tableName="invoices"
        recordId={invoice.id}
        title="Historial de esta factura"
        resolvers={{ client_id: () => clientName }}
        statusLabels={Object.fromEntries(Object.entries(PAYMENT_STATUS_CFG).map(([k, v]) => [k, v.label]))}
      />

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        {canEdit && invoice.status !== "anulada" && balance > 0 && !showPaymentForm && (
          <button onClick={() => setShowPaymentForm(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold" style={{ background: C.green, color: "#0A1F12" }}>
            Registrar pago
          </button>
        )}
        {isAdmin && invoice.status !== "anulada" && (
          <button onClick={() => onVoid(invoice)} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.red, border: `1px solid ${C.red}40` }}>
            <Ban size={14} /> Anular factura
          </button>
        )}
        <button onClick={doPrint} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.amber, border: `1px solid ${C.border}` }}><FileText size={14} /> Imprimir</button>
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Cerrar</button>
      </div>
    </Modal>
  );
}

export function VoidInvoiceModal({ invoice, onClose, onConfirm, saving }) {
  const [reasonCode, setReasonCode] = useState("04");
  const [reason, setReason] = useState("");
  const hasMoney = Number(invoice.amount_paid || 0) > 0 || Number(invoice.credit_applied || 0) > 0;
  return (
    <Modal title={`Anular factura ${invoice.invoice_number || invoice.ncf}`} onClose={onClose}>
      <div className="text-sm mb-3" style={{ color: C.text }}>
        El NCF <span className="font-mono">{invoice.ncf}</span> queda consumido y se reportará en el 608 con el motivo que elijas. El inventario de los productos se devuelve.
      </div>
      {hasMoney && (
        <div className="text-xs mb-3 p-2" style={{ background: C.redBg, color: C.red }}>
          Esta factura tiene cobros o notas de crédito aplicadas: el sistema no la dejará anular. Elimina los cobros primero, o emite una nota de crédito.
        </div>
      )}
      <Field label="Motivo de anulación (608)">
        <select className={inputClass} style={inputStyle} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
          {MOTIVOS_ANULACION_608.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
        </select>
      </Field>
      <Field label="Detalle (opcional)">
        <textarea rows={2} className={inputClass} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Se facturó al cliente equivocado" />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => onConfirm(invoice, reasonCode, reason.trim())} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.red, color: "#fff" }}>
          <Ban size={14} /> {saving ? "Anulando..." : "Anular factura"}
        </button>
      </div>
    </Modal>
  );
}

export function CreditNoteFormModal({ invoices, clients, ncfSequences, onClose, onSave, saving }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [reason, setReason] = useState("");
  const [sequenceId, setSequenceId] = useState("");
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const selectedInvoice = invoices.find((i) => i.id === invoiceId);
  const b04Sequences = ncfSequences.filter((s) => s.ncf_type === "B04" && s.active && s.next_number <= s.range_end);
  const invoiceBalance = selectedInvoice ? Number(selectedInvoice.total) - Number(selectedInvoice.amount_paid || 0) - Number(selectedInvoice.credit_applied || 0) : 0;

  useEffect(() => {
    if (!invoiceId) { setItems([]); return; }
    setLoadingItems(true);
    (async () => {
      const { data } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId);
      setItems((data || []).map((it) => ({ ...it, selected: true })));
      setLoadingItems(false);
    })();
  }, [invoiceId]);

  const updateItem = (id, patch) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const itemAmount = (it) => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
  const selectedItems = items.filter((it) => it.selected);
  // Los renglones de la factura están en RD$. Se aplica el mismo descuento de la factura para no
  // acreditar (ni revertir ITBIS) por encima de lo que realmente se facturó.
  const discountFactor = 1 - (Number(selectedInvoice?.discount_pct) || 0) / 100;
  const subtotal = selectedItems.reduce((sum, it) => sum + itemAmount(it), 0) * discountFactor;
  const itbis = selectedInvoice?.exempt_itbis ? 0 : selectedItems.reduce((sum, it) => sum + (it.is_taxable ? itemAmount(it) * 0.18 : 0), 0) * discountFactor;
  const total = subtotal + itbis;
  // Factura en US$: la nota usa la tasa de la factura original (revierte exactamente lo reportado).
  const isUsdNote = selectedInvoice?.currency === "USD";
  const noteRate = isUsdNote ? (Number(selectedInvoice.exchange_rate) || 1) : 1;

  const submit = () => {
    if (!invoiceId || !sequenceId || selectedItems.length === 0) return;
    onSave(
      {
        invoice_id: invoiceId, client_id: selectedInvoice.client_id, ncf_sequence_id: sequenceId, reason: reason.trim() || null, subtotal, itbis, total,
        currency: isUsdNote ? "USD" : "DOP",
        exchange_rate: noteRate,
        foreign_subtotal: isUsdNote ? subtotal / noteRate : null,
        foreign_itbis: isUsdNote ? itbis / noteRate : null,
        foreign_total: isUsdNote ? total / noteRate : null,
      },
      selectedItems.map((it) => ({ ...it, noteRate: isUsdNote ? noteRate : null }))
    );
  };

  return (
    <Modal title="Nueva nota de crédito" onClose={onClose} wide>
      <Field label="Factura a acreditar">
        <SearchSelect
          items={invoices.filter((i) => i.status !== "anulada")}
          value={invoiceId}
          onChange={setInvoiceId}
          getLabel={(i) => `${i.invoice_number || i.ncf} — ${clients.find((c) => c.id === i.client_id)?.name || "Cliente"}`}
          placeholder="Buscar factura por NCF o cliente..."
        />
      </Field>
      {selectedInvoice && (
        <div className="text-xs mb-3" style={{ color: C.muted }}>
          Total de la factura: <span style={{ color: C.text }}>{fmtMoney(selectedInvoice.total)}</span> · Saldo disponible para acreditar: <span style={{ color: C.text }}>{fmtMoney(invoiceBalance)}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Secuencia NCF (B04 — Nota de Crédito)">
          <select className={inputClass} style={inputStyle} value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
            <option value="">Selecciona una</option>
            {b04Sequences.map((s) => (
              <option key={s.id} value={s.id}>{s.ncf_type} · quedan {s.range_end - s.next_number + 1}</option>
            ))}
          </select>
          {b04Sequences.length === 0 && <div className="text-xs mt-1" style={{ color: C.red }}>No hay secuencias B04 disponibles — créala en "Secuencias NCF".</div>}
        </Field>
        <Field label="Motivo (opcional)">
          <input className={inputClass} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Devolución de mercancía, error en factura" />
        </Field>
      </div>

      {invoiceId && (
        <>
          <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Líneas a acreditar (desmarca las que no apliquen)</div>
          {loadingItems && <div className="text-sm" style={{ color: C.muted }}>Cargando líneas de la factura...</div>}
          <div className="space-y-2 mb-3">
            {items.map((it) => (
              <div key={it.id} className="grid grid-cols-12 gap-2 min-w-[860px] items-center">
                <label className="col-span-1 flex justify-center">
                  <input type="checkbox" checked={it.selected} onChange={(e) => updateItem(it.id, { selected: e.target.checked })} />
                </label>
                <div className="col-span-4 text-sm truncate">{it.description}</div>
                <input type="text" inputMode="decimal" className={`${inputClass} col-span-2`} style={inputStyle} value={it.quantity} onChange={(e) => updateItem(it.id, { quantity: e.target.value })} disabled={!it.selected} />
                <input type="text" inputMode="decimal" className={`${inputClass} col-span-3`} style={inputStyle} value={it.unit_price} onChange={(e) => updateItem(it.id, { unit_price: e.target.value })} disabled={!it.selected} />
                <div className="col-span-2 text-right font-mono text-sm" style={{ color: C.muted }}>{fmtMoney(itemAmount(it))}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(subtotal)}</span></div>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS</span><span className="font-mono">{fmtMoney(itbis)}</span></div>
        <div className="flex justify-between text-base font-bold" style={{ color: C.text }}><span>Total a acreditar</span><span className="font-mono">{fmtMoney(total)}</span></div>
        {Number(selectedInvoice?.discount_pct) > 0 && <div className="text-xs" style={{ color: C.muted }}>Incluye el descuento de {selectedInvoice.discount_pct}% de la factura.</div>}
        {isUsdNote && <div className="text-xs" style={{ color: C.blue }}>Factura en US$: montos en RD$ a la tasa de la factura (RD$ {noteRate}) · ≈ US$ {(total / noteRate).toFixed(2)}</div>}
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving || b04Sequences.length === 0} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Emitiendo..." : "Emitir nota de crédito"}
        </button>
      </div>
    </Modal>
  );
}

export function ExchangeRatePromptModal({ contracts, onClose, onConfirm, saving }) {
  const usdContracts = contracts.filter((c) => c.currency === "USD");
  const [rate, setRate] = useState(usdContracts[0]?.exchange_rate ?? "");
  const isBatch = contracts.length > 1;
  const submit = () => {
    if (!(Number(rate) > 0)) return;
    onConfirm(Number(rate));
  };
  return (
    <Modal title="Tasa de cambio de hoy" onClose={onClose}>
      <div className="text-sm mb-3" style={{ color: C.muted }}>
        {isBatch
          ? `${usdContracts.length} de los ${contracts.length} contrato${contracts.length !== 1 ? "s" : ""} a facturar está${usdContracts.length !== 1 ? "n" : ""} en USD. Indica la tasa de hoy para que sus facturas queden con el valor correcto en RD$ — los contratos en RD$ no la necesitan y se generan igual.`
          : "Este contrato está en USD. Indica la tasa de hoy para que la factura quede con el valor correcto en RD$."}
      </div>
      <div className="mb-3 space-y-1">
        {usdContracts.map((c) => (
          <div key={c.id} className="text-xs" style={{ color: C.muted }}>{c.title} — US$ {Number(c.foreign_amount || 0).toFixed(2)}/ciclo</div>
        ))}
      </div>
      <Field label="Tasa de cambio (RD$ por US$1)">
        <input type="number" min="0" step="0.01" autoFocus className={inputClass} style={inputStyle} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ej. 60.50" />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving || !(Number(rate) > 0)} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Generando..." : "Generar factura" + (isBatch ? "s" : "")}
        </button>
      </div>
    </Modal>
  );
}

export function RecurringContractFormModal({ clients, branches, ncfSequences, initial, onClose, onSave, saving }) {
  const [clientId, setClientId] = useState(initial?.client_id || clients[0]?.id || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || "");
  const [ncfSequenceId, setNcfSequenceId] = useState(initial?.ncf_sequence_id || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  // El monto que se muestra/edita aquí es en la moneda elegida (currency); amount en la
  // base de datos siempre queda en RD$ (regla fiscal), así que si el contrato ya existía
  // en USD, el campo se rellena con foreign_amount (el monto original en US$), no con
  // amount (que sería el equivalente en RD$).
  const [amount, setAmount] = useState((initial?.currency === "USD" ? initial?.foreign_amount : initial?.amount) ?? "");
  const [currency, setCurrency] = useState(initial?.currency || "DOP");
  const [exchangeRate, setExchangeRate] = useState(initial?.exchange_rate ?? 1);
  const [isTaxable, setIsTaxable] = useState(initial?.is_taxable ?? true);
  const [frequencyDays, setFrequencyDays] = useState(initial?.frequency_days ?? 30);
  const [nextInvoiceDate, setNextInvoiceDate] = useState(initial?.next_invoice_date || todayStrRD());
  const [endDate, setEndDate] = useState(initial?.end_date || "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [notes, setNotes] = useState(initial?.notes || "");

  const [appliesNorma0205, setAppliesNorma0205] = useState(!!initial?.applies_norma_0205);
  // Cualquier secuencia válida para facturar (B01, B02, B14, B15...), nunca B04 ni las de compras/gastos
  const contractSequences = ncfSequences.filter((s) => s.active && s.next_number <= s.range_end && !["B03", "B04", "B11", "B13", "B17"].includes(s.ncf_type));
  const selectedClient = clients.find((c) => c.id === clientId);
  const selectedSeq = ncfSequences.find((s) => s.id === ncfSequenceId);
  const b01WithoutRnc = selectedSeq?.ncf_type === "B01" && ![9, 11].includes((selectedClient?.rnc_cedula || "").replace(/\D/g, "").length);
  const rate = currency === "USD" ? (Number(exchangeRate) || 1) : 1;

  const submit = () => {
    if (!clientId || !title.trim() || !amount || !frequencyDays || !nextInvoiceDate) return;
    if (endDate && endDate < nextInvoiceDate) return;
    onSave({
      client_id: clientId, branch_id: branchId || null, ncf_sequence_id: ncfSequenceId || null,
      title: title.trim(), description: description.trim() || null,
      amount: Number(amount) * rate, // siempre en RD$, ver nota de más arriba
      currency, exchange_rate: rate,
      foreign_amount: currency === "USD" ? Number(amount) : null,
      is_taxable: isTaxable,
      applies_norma_0205: isTaxable && appliesNorma0205,
      frequency_days: Number(frequencyDays), next_invoice_date: nextInvoiceDate, end_date: endDate || null, is_active: isActive, notes: notes.trim() || null,
    });
  };

  return (
    <Modal title={initial ? "Editar contrato recurrente" : "Nuevo contrato recurrente"} onClose={onClose} wide>
      <Field label="Cliente">
        <SearchSelect items={clients} value={clientId} onChange={setClientId} placeholder="Buscar cliente..." getLabel={(c) => c.name} />
      </Field>
      <Field label="Título del servicio">
        <input className={inputClass} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Mantenimiento preventivo mensual" />
      </Field>
      <Field label="Descripción para la factura (opcional)">
        <input className={inputClass} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Se usa como descripción del renglón en la factura" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Moneda">
          <select className={inputClass} style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="DOP">Pesos (RD$)</option>
            <option value="USD">Dólares (US$)</option>
          </select>
        </Field>
        {currency === "USD" && (
          <Field label="Tasa de cambio (RD$ por US$1)">
            <input type="number" min="0" step="0.01" className={inputClass} style={inputStyle} value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="Ej. 60.50" />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={currency === "USD" ? "Monto (US$, antes de ITBIS)" : "Monto (RD$, antes de ITBIS)"}>
          <input type="number" step="0.01" min="0" className={inputClass} style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Cada cuántos días facturar">
          <input type="number" min="1" className={inputClass} style={inputStyle} value={frequencyDays} onChange={(e) => setFrequencyDays(e.target.value)} placeholder="Ej. 30" />
        </Field>
      </div>
      {currency === "USD" && (
        <div className="text-xs mb-3 -mt-1" style={{ color: C.muted }}>Cada factura generada por este contrato saldrá en US$. El NCF y los reportes fiscales siempre usan el equivalente en pesos, con la tasa de cambio que tenga el contrato en ese momento.</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sucursal (opcional)">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Sin especificar</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Secuencia NCF">
          <select className={inputClass} style={inputStyle} value={ncfSequenceId} onChange={(e) => setNcfSequenceId(e.target.value)}>
            <option value="">Sin asignar</option>
            {contractSequences.map((s) => <option key={s.id} value={s.id}>{s.ncf_type} · {s.prefix} (disp. {s.range_end - s.next_number + 1})</option>)}
          </select>
          {b01WithoutRnc && <div className="text-xs mt-1" style={{ color: C.red }}>B01 exige que el cliente tenga RNC o cédula — agrégaselo o la factura no se podrá emitir.</div>}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Próxima fecha de facturación">
          <input type="date" className={inputClass} style={inputStyle} value={nextInvoiceDate} onChange={(e) => setNextInvoiceDate(e.target.value)} />
        </Field>
        <Field label="Fecha de término del contrato (opcional)">
          <input type="date" className={inputClass} style={inputStyle} value={endDate} min={nextInvoiceDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      {endDate && <div className="text-xs mb-3" style={{ color: C.muted }}>Después de esta fecha el contrato no generará más facturas automáticamente, aunque siga marcado como activo.</div>}
      <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer" style={{ color: C.text }}>
        <input type="checkbox" checked={isTaxable} onChange={(e) => setIsTaxable(e.target.checked)} /> Aplica ITBIS (18%)
      </label>
      {isTaxable && (
        <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer" style={{ color: C.text }}>
          <input type="checkbox" checked={appliesNorma0205} onChange={(e) => setAppliesNorma0205(e.target.checked)} /> El cliente retiene el 30% del ITBIS (Norma 02-05)
        </label>
      )}
      <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer" style={{ color: C.text }}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Contrato activo (si se desmarca, deja de generar facturas)
      </label>
      <Field label="Notas internas (opcional)">
        <input className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalles del acuerdo" />
      </Field>
      {initial && <ActivityHistorySection tableName="recurring_contracts" recordId={initial.id} title="Historial de este contrato" resolvers={{ client_id: (id) => clients.find((c) => c.id === id)?.name, branch_id: (id) => branches.find((b) => b.id === id)?.name }} />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Crear contrato"}
        </button>
      </div>
    </Modal>
  );
}

export function CreditNoteDetailModal({ note, items, invoice, clientName, clientRnc, companyName, company, onClose }) {
  const doPrint = () => {
    const html = invoiceLikeHtml({
      docLabel: "Nota de Crédito", code: note.ncf, companyName, clientName, clientRnc,
      companyLogo: company?.logo_url, companyRnc: company?.rnc, companyAddress: company?.address, companyPhone: company?.phone,
      dateLabel: "Fecha", dateValue: fmtDate(note.note_date), extraMeta: invoice ? `<br/>Factura original: ${invoice.ncf}` : "",
      items, subtotal: note.subtotal, itbis: note.itbis, total: note.total,
      notes: note.reason ? `Motivo: ${note.reason}` : "",
    });
    printDocument(`Nota de Crédito ${note.ncf}`, html);
  };
  return (
    <Modal title={`Nota de Crédito ${note.ncf}`} onClose={onClose} wide>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm" style={{ color: C.muted }}>Cliente: <span style={{ color: C.text }}>{clientName}</span>{clientRnc && <span> · RNC/Cédula: {clientRnc}</span>}</div>
        <Pill label="Emitida" color={C.blue} />
      </div>
      {invoice && <div className="text-xs mb-2 px-3 py-2" style={{ background: C.panelAlt, color: C.muted }}>Factura original: <span className="font-mono" style={{ color: C.text }}>{invoice.ncf}</span></div>}
      {note.reason && <div className="text-sm mb-3" style={{ color: C.text }}>Motivo: {note.reason}</div>}
      <div className="text-xs mb-4" style={{ color: C.muted }}>Fecha<br /><span style={{ color: C.text }}>{fmtDate(note.note_date)}</span></div>
      <div className="space-y-1 mb-3">
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt }}>
            <div>{it.description}</div>
            <div className="font-mono" style={{ color: C.muted }}>{it.quantity} × {fmtMoney(it.unit_price)} = {fmtMoney(it.subtotal)}</div>
          </div>
        ))}
      </div>
      <div className="p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(note.subtotal)}</span></div>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS</span><span className="font-mono">{fmtMoney(note.itbis)}</span></div>
        <div className="flex justify-between text-base font-bold" style={{ color: C.text }}><span>Total</span><span className="font-mono">{fmtMoney(note.total)}</span></div>
      </div>
      <ActivityHistorySection
        tableName="credit_notes"
        recordId={note.id}
        title="Historial de esta nota de crédito"
        resolvers={{ client_id: () => clientName }}
      />
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={doPrint} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.amber, border: `1px solid ${C.border}` }}><FileText size={14} /> Imprimir</button>
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Cerrar</button>
      </div>
    </Modal>
  );
}

export function QuoteFormModal({ clients, products, branches, defaultBranchId, prefill, initial, initialItems, maxDiscountPct, onClose, onSave, saving, onRequestNewClient, onCreateClientFromDgii, autoSelectClientId, autoSelectToken }) {
  const [title, setTitle] = useState(initial?.title || prefill?.title || "");
  const [clientId, setClientId] = useState(initial?.client_id || prefill?.client_id || clients[0]?.id || "");
  // Si desde este formulario se creó un cliente nuevo con el "+", lo selecciona
  // solo en cuanto se guarda — ver nota en ClientAssetFormModal.
  const appliedAutoSelectTokenRef = useRef(autoSelectToken);
  useEffect(() => {
    if (autoSelectToken !== appliedAutoSelectTokenRef.current && autoSelectClientId) {
      setClientId(autoSelectClientId);
      appliedAutoSelectTokenRef.current = autoSelectToken;
    }
  }, [autoSelectToken, autoSelectClientId]);
  const [branchId, setBranchId] = useState(initial?.branch_id || prefill?.branch_id || defaultBranchId || branches?.[0]?.id || "");
  const [quoteDate, setQuoteDate] = useState(initial?.quote_date || (() => todayStrRD())());
  const [validUntil, setValidUntil] = useState(initial?.valid_until || "");
  const [discountPct, setDiscountPct] = useState(initial?.discount_pct ?? 0);
  const [currency, setCurrency] = useState(initial?.currency || "DOP");
  const [exchangeRate, setExchangeRate] = useState(initial?.exchange_rate ?? 1);
  const [notes, setNotes] = useState(initial?.notes || "");
  const blankItem = { product_id: "", description: "", quantity: 1, unit_price: 0, is_taxable: true };
  const [blocks, setBlocks] = useState(() => {
    if (initial) return itemsToBlocks(initialItems, blankItem);
    if (prefill?.items?.length) return itemsToBlocks(prefill.items, blankItem);
    return [{ id: 0, kind: "item", ...blankItem }];
  });
  const newBlockId = () => Date.now() + Math.random();

  const updateBlock = (id, patch) => setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const addItemRow = () => setBlocks((prev) => [...prev, { id: newBlockId(), kind: "item", ...blankItem }]);
  const addChapterRow = () => setBlocks((prev) => [...prev, { id: newBlockId(), kind: "chapter", name: "" }]);
  const removeBlock = (id) => setBlocks((prev) => prev.filter((b) => b.id !== id));
  const reorderBlocks = (draggedId, targetId) => setBlocks((prev) => {
    if (String(draggedId) === String(targetId)) return prev;
    const dragIdx = prev.findIndex((b) => String(b.id) === String(draggedId));
    const targetIdx = prev.findIndex((b) => String(b.id) === String(targetId));
    if (dragIdx === -1 || targetIdx === -1) return prev;
    const next = [...prev];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    return next;
  });

  const onProductPick = (id, productId) => {
    const prod = products.find((p) => p.id === productId);
    updateBlock(id, { product_id: productId, description: prod?.name || "", unit_price: prod?.unit_price || 0, is_taxable: prod?.is_taxable ?? true });
  };

  const onDiscountChange = (v) => {
    const n = Math.max(0, Math.min(maxDiscountPct, Number(v) || 0));
    setDiscountPct(n);
  };

  // Asigna a cada línea el nombre del capítulo bajo el que aparece
  const resolvedItems = useMemo(() => {
    let current = "";
    const result = [];
    blocks.forEach((b) => {
      if (b.kind === "chapter") current = b.name.trim();
      else result.push({ ...b, chapter: current });
    });
    return result;
  }, [blocks]);

  const itemAmount = (it) => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
  const grossSubtotal = resolvedItems.reduce((sum, it) => sum + itemAmount(it), 0);
  const grossTaxable = resolvedItems.reduce((sum, it) => sum + (it.is_taxable ? itemAmount(it) : 0), 0);
  const discountFactor = 1 - (Number(discountPct) || 0) / 100;
  const discountAmount = grossSubtotal * (1 - discountFactor);
  const subtotal = grossSubtotal * discountFactor;
  const itbis = grossTaxable * discountFactor * 0.18;
  const total = subtotal + itbis;
  const rate = currency === "USD" ? (Number(exchangeRate) || 1) : 1;
  const chapterGroups = groupItemsByChapter(resolvedItems, itemAmount);
  const hasChapters = chapterGroups.length > 1 || (chapterGroups[0] && chapterGroups[0].chapter !== "General");
  const chapterSubtotal = (name) => chapterGroups.find((g) => g.chapter === (name.trim() || "General"))?.subtotal || 0;

  const submit = () => {
    const validItems = resolvedItems.filter((it) => it.description.trim() && Number(it.quantity) > 0);
    if (!clientId || validItems.length === 0) return;
    onSave({
      title: title.trim() || null, client_id: clientId, branch_id: branchId || null, quote_date: quoteDate, valid_until: validUntil || null, discount_pct: discountPct,
      subtotal: subtotal * rate, itbis: itbis * rate, total: total * rate,
      currency, exchange_rate: rate, notes: notes.trim() || null,
      foreign_subtotal: currency === "USD" ? subtotal : null,
      foreign_itbis: currency === "USD" ? itbis : null,
      foreign_total: currency === "USD" ? total : null,
    }, validItems);
  };

  return (
    <Modal title={initial ? "Editar cotización" : "Nueva cotización"} onClose={onClose} wide>
      <Field label="Título de la cotización (opcional)">
        <input className={inputClass} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Instalación de A/C - Oficina Principal" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Cliente">
          <div className="flex gap-2">
            <div className="flex-1"><ClientSearchSelect clients={clients} value={clientId} onChange={setClientId} onCreateFromDgii={onCreateClientFromDgii} placeholder="Buscar cliente o empresa (DGII)..." /></div>
            <button type="button" onClick={onRequestNewClient} className="px-3 flex-shrink-0" style={{ border: `1px solid ${C.border}`, color: C.amber }}><Plus size={14} /></button>
          </div>
        </Field>
        <Field label="Fecha">
          <input type="date" className={inputClass} style={inputStyle} value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
        </Field>
        <Field label="Válida hasta (opcional)">
          <input type="date" className={inputClass} style={inputStyle} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
      </div>
      <Field label="Sucursal">
        <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">Sin asignar</option>
          {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field label={`Descuento (% — máximo permitido: ${maxDiscountPct}%)`}>
        <input type="number" min="0" max={maxDiscountPct} step="0.5" className={inputClass} style={inputStyle} value={discountPct} onChange={(e) => onDiscountChange(e.target.value)} disabled={maxDiscountPct <= 0} />
        {maxDiscountPct <= 0 && <div className="text-xs mt-1" style={{ color: C.muted }}>No tienes permiso para aplicar descuentos — pídele a un admin que te asigne un límite.</div>}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Moneda">
          <select className={inputClass} style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="DOP">Pesos (RD$)</option>
            <option value="USD">Dólares (US$)</option>
          </select>
        </Field>
        {currency === "USD" && (
          <Field label="Tasa de cambio (RD$ por US$1)">
            <input type="number" min="0" step="0.01" className={inputClass} style={inputStyle} value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="Ej. 60.50" />
          </Field>
        )}
      </div>
      {currency === "USD" && (
        <div className="text-xs mb-3 -mt-1" style={{ color: C.muted }}>Los precios de los renglones se interpretan en US$. El total en pesos (obligatorio para fines fiscales) se calcula con la tasa indicada.</div>
      )}

      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Productos / servicios</div>
      <div className="grid grid-cols-12 gap-2 min-w-[860px] text-[10px] uppercase tracking-wide mb-1 px-1" style={{ color: C.muted }}>
        <div className="col-span-4">Producto</div>
        <div className="col-span-3">Descripción</div>
        <div className="col-span-1">Cantidad</div>
        <div className="col-span-2">Precio</div>
        <div className="col-span-1">ITBIS</div>
        <div className="col-span-1"></div>
      </div>
      <div className="space-y-2 mb-3">
        {blocks.map((b) =>
          b.kind === "chapter" ? (
            <div key={b.id}
              draggable={false}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); reorderBlocks(e.dataTransfer.getData("text/plain"), b.id); }}
              className="flex items-center gap-2 pt-2"
            >
              <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(b.id))} className="cursor-grab flex-shrink-0 touch-none" style={{ color: C.muted }} title="Arrastrar para reordenar">
                <GripVertical size={16} />
              </div>
              <input className={inputClass} style={{ ...inputStyle, fontWeight: 600, color: C.amber, borderColor: C.amber + "60" }} value={b.name} onChange={(e) => updateBlock(b.id, { name: e.target.value })} placeholder="Nombre del capítulo — ej. Mano de obra, Materiales" />
              <div className="text-sm font-mono flex-shrink-0" style={{ color: C.amber, minWidth: 100, textAlign: "right" }}>{fmtMoney(chapterSubtotal(b.name))}</div>
              <button onClick={() => removeBlock(b.id)} style={iconBtnStyle}><X size={16} /></button>
            </div>
          ) : (
            <div key={b.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); reorderBlocks(e.dataTransfer.getData("text/plain"), b.id); }}
              className="grid grid-cols-12 gap-2 min-w-[860px] items-center"
            >
              <div className="col-span-4 flex items-center gap-1">
                <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(b.id))} className="cursor-grab flex-shrink-0 touch-none" style={{ color: C.muted }} title="Arrastrar para reordenar">
                  <GripVertical size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <ProductSearchSelect products={products} value={b.product_id} onChange={(id) => onProductPick(b.id, id)} placeholder="Buscar producto o servicio..." />
                </div>
              </div>
              <input className={`${inputClass} col-span-3`} style={{ ...inputStyle, ...(!b.product_id ? { borderColor: C.amber + "60" } : {}) }} value={b.description} onChange={(e) => updateBlock(b.id, { description: e.target.value })} placeholder={b.product_id ? "Descripción" : "👈 Escribe aquí la descripción del trabajo"} />
              <input type="text" inputMode="decimal" className={`${inputClass} col-span-1`} style={inputStyle} value={b.quantity} onChange={(e) => updateBlock(b.id, { quantity: e.target.value })} placeholder="Cant." />
              <input type="text" inputMode="decimal" className={`${inputClass} col-span-2`} style={inputStyle} value={b.unit_price} onChange={(e) => updateBlock(b.id, { unit_price: e.target.value })} placeholder="Precio" />
              <label className="col-span-1 flex items-center gap-1 text-xs" style={{ color: C.muted }}>
                <input type="checkbox" checked={b.is_taxable} onChange={(e) => updateBlock(b.id, { is_taxable: e.target.checked })} /> ITBIS
              </label>
              <button onClick={() => removeBlock(b.id)} className="col-span-1" style={iconBtnStyle}><X size={16} /></button>
            </div>
          )
        )}
      </div>
      <div className="flex gap-4 mb-4">
        <button onClick={addItemRow} className="flex items-center gap-2 text-sm" style={{ color: C.amber }}><Plus size={14} /> Agregar línea</button>
        <button onClick={addChapterRow} className="flex items-center gap-2 text-sm" style={{ color: C.text }}><Plus size={14} /> Agregar capítulo</button>
      </div>

      {hasChapters && (
        <div className="mb-3 p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>Subtotales por capítulo</div>
          {chapterGroups.map((g) => (
            <div key={g.chapter} className="flex justify-between text-sm" style={{ color: C.text }}><span>{g.chapter}</span><span className="font-mono">{fmtMoney(g.subtotal)}</span></div>
          ))}
        </div>
      )}

      <Field label="Observaciones (opcional — sale en el impreso)">
        <textarea className={inputClass} style={{ ...inputStyle, minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Se requiere un adelanto del 50% para iniciar el trabajo." />
      </Field>

      <div className="p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        {discountPct > 0 && <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal bruto</span><span className="font-mono">{currency === "USD" ? `US$ ${grossSubtotal.toFixed(2)}` : fmtMoney(grossSubtotal)}</span></div>}
        {discountPct > 0 && <div className="flex justify-between text-sm" style={{ color: C.red }}><span>Descuento ({discountPct}%)</span><span className="font-mono">-{currency === "USD" ? `US$ ${discountAmount.toFixed(2)}` : fmtMoney(discountAmount)}</span></div>}
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{currency === "USD" ? `US$ ${subtotal.toFixed(2)}` : fmtMoney(subtotal)}</span></div>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS (18%)</span><span className="font-mono">{currency === "USD" ? `US$ ${itbis.toFixed(2)}` : fmtMoney(itbis)}</span></div>
        <div className="flex justify-between text-base font-bold" style={{ color: C.text }}><span>Total</span><span className="font-mono">{currency === "USD" ? `US$ ${total.toFixed(2)}` : fmtMoney(total)}</span></div>
        {currency === "USD" && <div className="flex justify-between text-xs" style={{ color: C.muted }}><span>Equivalente (para fines fiscales)</span><span className="font-mono">{fmtMoney(total * rate)}</span></div>}
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Crear cotización"}
        </button>
      </div>
    </Modal>
  );
}

export function QuoteDetailModal({ quote, items, clientName, clientRnc, clientAddress, companyName, company, bankAccounts, orderInfo, canEdit, canDelete, onClose, onMarkStatus, onConvertToOrder, onEdit, onDuplicate, onDelete }) {
  const defaultBankAccount = (bankAccounts || []).find((a) => a.is_default) || null;
  const s = QUOTE_STATUS_CFG[quote.status] || QUOTE_STATUS_CFG.pendiente;
  const chapterGroups = groupItemsByChapter(items, (it) => Number(it.subtotal) || 0);
  const showChapters = chapterGroups.length > 1 || (chapterGroups[0] && chapterGroups[0].chapter !== "General");
  const doPrint = () => {
    const html = invoiceLikeHtml({
      docLabel: "Cotización", code: quote.quote_number, docTitle: quote.title, companyName, clientName, clientRnc, clientAddress,
      companyLogo: company?.logo_url, companyRnc: company?.rnc, companyAddress: company?.address, companyPhone: company?.phone,
      companyBankName: defaultBankAccount?.bank_name, companyBankAccountType: defaultBankAccount?.account_type, companyBankAccountNumber: defaultBankAccount?.account_number,
      dateLabel: "Fecha", dateValue: fmtDate(quote.quote_date),
      extraMeta: quote.valid_until ? `<br/>Válida hasta: ${fmtDate(quote.valid_until)}` : "",
      items, subtotal: quote.subtotal, itbis: quote.itbis, total: quote.total, discountPct: quote.discount_pct,
      currency: quote.currency, foreignTotal: quote.foreign_total, exchangeRate: quote.exchange_rate, notes: quote.notes,
    });
    printDocument(`Cotización ${quote.quote_number || ""}`, html);
  };
  const doPrintProforma = () => {
    const html = invoiceLikeHtml({
      docLabel: "FACTURA PRO-FORMA", code: quote.quote_number, docTitle: quote.title, companyName, clientName, clientRnc, clientAddress,
      companyLogo: company?.logo_url, companyRnc: company?.rnc, companyAddress: company?.address, companyPhone: company?.phone,
      companyBankName: defaultBankAccount?.bank_name, companyBankAccountType: defaultBankAccount?.account_type, companyBankAccountNumber: defaultBankAccount?.account_number,
      dateLabel: "Fecha", dateValue: fmtDate(quote.quote_date),
      extraMeta: quote.valid_until ? `<br/>Válida hasta: ${fmtDate(quote.valid_until)}` : "",
      items, subtotal: quote.subtotal, itbis: quote.itbis, total: quote.total, discountPct: quote.discount_pct,
      notes: [quote.notes, "Este documento es una Factura Pro-Forma sin valor fiscal — únicamente para fines informativos, no constituye un comprobante válido ante la DGII."].filter(Boolean).join(" — "),
      currency: quote.currency, foreignTotal: quote.foreign_total, exchangeRate: quote.exchange_rate,
    });
    printDocument(`Factura Pro-Forma ${quote.quote_number || ""}`, html);
  };
  return (
    <Modal title={`Cotización ${quote.quote_number || ""}`} onClose={onClose} wide>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm" style={{ color: C.muted }}>Cliente: <span style={{ color: C.text }}>{clientName}</span>{clientRnc && <span> · RNC/Cédula: {clientRnc}</span>}</div>
        <Pill label={s.label} color={s.color} />
      </div>
      {quote.currency === "USD" && (
        <div className="text-xs mb-2 px-2 py-1 inline-block" style={{ background: C.blue + "1A", color: C.blue }}>
          Cotizada en US$ — tasa RD$ {quote.exchange_rate} · Total ≈ US$ {Number(quote.foreign_total || 0).toFixed(2)}
        </div>
      )}
      {quote.title && <div className="text-sm font-semibold mb-2" style={{ color: C.text }}>{quote.title}</div>}
      {orderInfo && <div className="text-xs mb-2 px-3 py-2" style={{ background: C.panelAlt, color: C.blue }}>Orden de venta generada: <span className="font-mono">{orderInfo.order_number}</span></div>}
      <div className="grid grid-cols-2 gap-3 text-xs mb-4" style={{ color: C.muted }}>
        <div>Fecha<br /><span style={{ color: C.text }}>{fmtDate(quote.quote_date)}</span></div>
        <div>Válida hasta<br /><span style={{ color: C.text }}>{quote.valid_until ? fmtDate(quote.valid_until) : "Sin definir"}</span></div>
      </div>
      {quote.notes && (
        <div className="text-xs mb-4 px-3 py-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
          <div className="uppercase tracking-wide mb-1" style={{ color: C.muted }}>Observaciones</div>
          {quote.notes}
        </div>
      )}
      <div className="space-y-1 mb-3">
        {showChapters ? chapterGroups.map((g) => (
          <div key={g.chapter}>
            <div className="flex items-center justify-between text-xs uppercase tracking-wide px-3 py-1" style={{ color: C.amber }}>
              <span>{g.chapter}</span><span className="font-mono">{fmtMoney(g.subtotal)}</span>
            </div>
            {g.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt }}>
                <div>{it.description}</div>
                <div className="font-mono" style={{ color: C.muted }}>{it.quantity} × {fmtMoney(it.unit_price)} = {fmtMoney(it.subtotal)}</div>
              </div>
            ))}
          </div>
        )) : items.map((it) => (
          <div key={it.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt }}>
            <div>{it.description}</div>
            <div className="font-mono" style={{ color: C.muted }}>{it.quantity} × {fmtMoney(it.unit_price)} = {fmtMoney(it.subtotal)}</div>
          </div>
        ))}
      </div>
      <div className="p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        {quote.discount_pct > 0 && <div className="flex justify-between text-sm" style={{ color: C.red }}><span>Descuento aplicado</span><span className="font-mono">{quote.discount_pct}%</span></div>}
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(quote.subtotal)}</span></div>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS</span><span className="font-mono">{fmtMoney(quote.itbis)}</span></div>
        <div className="flex justify-between text-base font-bold" style={{ color: C.text }}><span>Total</span><span className="font-mono">{fmtMoney(quote.total)}</span></div>
      </div>
      <ActivityHistorySection
        tableName="quotes"
        recordId={quote.id}
        title="Historial de esta cotización"
        resolvers={{ client_id: () => clientName }}
        statusLabels={Object.fromEntries(Object.entries(QUOTE_STATUS_CFG).map(([k, v]) => [k, v.label]))}
      />
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        {canEdit && quote.status === "pendiente" && (
          <>
            <button onClick={() => onMarkStatus(quote, "rechazada")} className="px-4 py-2 text-sm" style={{ color: C.red, border: `1px solid ${C.red}40` }}>Marcar rechazada</button>
            <button onClick={() => onMarkStatus(quote, "aprobada")} className="px-4 py-2 text-sm" style={{ color: C.green, border: `1px solid ${C.green}40` }}>Marcar aprobada</button>
          </>
        )}
        {canEdit && quote.status === "aprobada" && (
          <button onClick={() => onConvertToOrder(quote, items)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold" style={{ background: C.blue, color: "#08202E" }}>
            <Layers size={14} /> Pasar a Orden de Venta
          </button>
        )}
        {canEdit && quote.status !== "convertida" && quote.status !== "en_orden" && (
          <button onClick={() => onEdit(quote, items)} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.text, border: `1px solid ${C.border}` }}><Pencil size={14} /> Editar</button>
        )}
        {canEdit && <button onClick={() => onDuplicate(quote, items)} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.text, border: `1px solid ${C.border}` }}><Copy size={14} /> Duplicar</button>}
        {canEdit && quote.status !== "convertida" && quote.status !== "en_orden" && quote.status !== "parcial" && canDelete && (
          <button onClick={() => onDelete(quote)} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.red, border: `1px solid ${C.red}40` }}><Trash2 size={14} /> Eliminar</button>
        )}
        <button onClick={doPrintProforma} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.blue, border: `1px solid ${C.border}` }}><Receipt size={14} /> Imprimir Pro-Forma</button>
        <button onClick={doPrint} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.amber, border: `1px solid ${C.border}` }}><FileText size={14} /> Imprimir</button>
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cerrar</button>
      </div>
    </Modal>
  );
}

export function SalesOrderDetailModal({ order, items, clientName, clientRnc, companyName, company, workOrderInfo, canEdit, canDelete, onClose, onGenerateInvoice, onGenerateWorkOrder, onCancel, onDelete, onUpdateNotes }) {
  const s = SALES_ORDER_STATUS_CFG[order.status] || SALES_ORDER_STATUS_CFG.en_proceso;
  const chapterGroups = groupItemsByChapter(items, (it) => Number(it.subtotal) || 0);
  const showChapters = chapterGroups.length > 1 || (chapterGroups[0] && chapterGroups[0].chapter !== "General");
  const [notes, setNotes] = useState(order.notes || "");
  const doPrint = () => {
    const html = invoiceLikeHtml({
      docLabel: "Orden de venta", code: order.order_number, docTitle: order.title, companyName, clientName, clientRnc,
      companyLogo: company?.logo_url, companyRnc: company?.rnc, companyAddress: company?.address, companyPhone: company?.phone,
      dateLabel: "Fecha", dateValue: fmtDate(order.order_date), notes: order.notes,
      items, subtotal: order.subtotal, itbis: order.itbis, total: order.total,
    });
    printDocument(`Orden de venta ${order.order_number || ""}`, html);
  };
  return (
    <Modal title={`Orden de venta ${order.order_number || ""}`} onClose={onClose} wide>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm" style={{ color: C.muted }}>Cliente: <span style={{ color: C.text }}>{clientName}</span>{clientRnc && <span> · RNC/Cédula: {clientRnc}</span>}</div>
        <Pill label={s.label} color={s.color} />
      </div>
      {order.title && <div className="text-sm font-semibold mb-2" style={{ color: C.text }}>{order.title}</div>}
      {workOrderInfo && <div className="text-xs mb-2 px-3 py-2" style={{ background: C.panelAlt, color: C.blue }}>Orden de trabajo generada: <span className="font-mono">{workOrderInfo.code}</span></div>}
      {order.status !== "en_proceso" && (
        <div className="text-xs mb-2 px-3 py-2" style={{ background: C.panelAlt, color: C.muted, border: `1px solid ${C.border}` }}>
          {order.status === "facturada" ? "Esta orden ya fue facturada y no se puede modificar." : "Esta orden está cancelada y no se puede modificar."}
        </div>
      )}
      <div className="text-xs mb-4" style={{ color: C.muted }}>Fecha<br /><span style={{ color: C.text }}>{fmtDate(order.order_date)}</span></div>
      <div className="space-y-1 mb-3">
        {showChapters ? chapterGroups.map((g) => (
          <div key={g.chapter}>
            <div className="flex items-center justify-between text-xs uppercase tracking-wide px-3 py-1" style={{ color: C.amber }}>
              <span>{g.chapter}</span><span className="font-mono">{fmtMoney(g.subtotal)}</span>
            </div>
            {g.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt }}>
                <div>{it.description}</div>
                <div className="font-mono" style={{ color: C.muted }}>{it.quantity} × {fmtMoney(it.unit_price)} = {fmtMoney(it.subtotal)}</div>
              </div>
            ))}
          </div>
        )) : items.map((it) => (
          <div key={it.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt }}>
            <div>{it.description}</div>
            <div className="font-mono" style={{ color: C.muted }}>{it.quantity} × {fmtMoney(it.unit_price)} = {fmtMoney(it.subtotal)}</div>
          </div>
        ))}
      </div>
      <div className="p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(order.subtotal)}</span></div>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS</span><span className="font-mono">{fmtMoney(order.itbis)}</span></div>
        <div className="flex justify-between text-base font-bold" style={{ color: C.text }}><span>Total</span><span className="font-mono">{fmtMoney(order.total)}</span></div>
      </div>
      <div className="mt-3">
        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>Observaciones (opcional — sale en el impreso)</div>
        <textarea className={inputClass} style={{ ...inputStyle, minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder="Ej. Se solicitó un adelanto del 50% antes de iniciar el trabajo." />
        {canEdit && notes !== (order.notes || "") && (
          <div className="flex justify-end mt-1">
            <button onClick={() => onUpdateNotes(order, notes)} className="text-xs px-3 py-1.5 font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Guardar observaciones</button>
          </div>
        )}
      </div>
      <ActivityHistorySection
        tableName="sales_orders"
        recordId={order.id}
        title="Historial de esta orden de venta"
        resolvers={{ client_id: () => clientName }}
        statusLabels={Object.fromEntries(Object.entries(SALES_ORDER_STATUS_CFG).map(([k, v]) => [k, v.label]))}
      />
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        {canEdit && order.status === "en_proceso" && !workOrderInfo && (
          <button onClick={() => onGenerateWorkOrder(order)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold" style={{ background: C.blue, color: "#08202E" }}>
            <ClipboardList size={14} /> Generar orden de trabajo
          </button>
        )}
        {canEdit && order.status === "en_proceso" && (
          <>
            <button onClick={() => onCancel(order)} className="px-4 py-2 text-sm" style={{ color: C.red, border: `1px solid ${C.red}40` }}>Cancelar orden</button>
            <button onClick={() => onGenerateInvoice(order, items)} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Generar factura</button>
          </>
        )}
        {canDelete && order.status === "cancelada" && (
          <button onClick={() => onDelete(order)} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.red, border: `1px solid ${C.red}40` }}><Trash2 size={14} /> Eliminar orden</button>
        )}
        <button onClick={doPrint} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.amber, border: `1px solid ${C.border}` }}><FileText size={14} /> Imprimir</button>
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cerrar</button>
      </div>
    </Modal>
  );
}

export function StatementModal({ clients, invoices, companyName, onClose }) {
  const [clientId, setClientId] = useState("");
  const [paymentFilters, setPaymentFilters] = useState(new Set());
  const client = clients.find((c) => c.id === clientId);
  const clientInvoicesAll = invoices.filter((inv) => inv.client_id === clientId && inv.status !== "anulada");
  const clientInvoices = paymentFilters.size === 0 ? clientInvoicesAll : clientInvoicesAll.filter((inv) => paymentFilters.has(inv.payment_status || "pendiente"));
  const totalFacturado = clientInvoices.reduce((s, i) => s + Number(i.total), 0);
  const totalCobrado = clientInvoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const saldo = totalFacturado - totalCobrado;
  const togglePaymentFilter = (key) => setPaymentFilters((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const filterLabel = paymentFilters.size === 0 || paymentFilters.size === 3 ? "" : ` — ${[...paymentFilters].map((k) => PAYMENT_STATUS_CFG[k]?.label).join(", ")}`;

  const doPrint = () => {
    if (!client) return;
    printDocument(`Estado de cuenta - ${client.name}`, statementHtml(companyName, client.name + filterLabel, clientInvoices));
  };

  return (
    <Modal title="Estado de cuenta" onClose={onClose} wide>
      <Field label="Cliente">
        <SearchSelect items={clients} value={clientId} onChange={setClientId} placeholder="Buscar cliente..." getLabel={(c) => c.name} />
      </Field>
      <Field label="Filtrar por estado de cobro (deja todo sin marcar para ver todas)">
        <div className="flex flex-wrap gap-3">
          {Object.entries(PAYMENT_STATUS_CFG).map(([k, v]) => (
            <label key={k} className="flex items-center gap-2 text-sm px-3 py-2 cursor-pointer" style={{ border: `1px solid ${C.border}`, color: paymentFilters.has(k) ? v.color : C.muted }}>
              <input type="checkbox" checked={paymentFilters.has(k)} onChange={() => togglePaymentFilter(k)} />
              {v.label}
            </label>
          ))}
        </div>
      </Field>

      {client && (
        <>
          <div className="space-y-1 mt-3 mb-3">
            <div className="grid grid-cols-12 gap-2 min-w-[860px] px-3 py-1 text-xs uppercase tracking-wide" style={{ color: C.muted }}>
              <div className="col-span-3">NCF</div>
              <div className="col-span-2">Fecha</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-2 text-right">Cobrado</div>
              <div className="col-span-1 text-right">Saldo</div>
              <div className="col-span-2 text-right">Estado</div>
            </div>
            {clientInvoices.map((inv) => {
              const balance = Number(inv.total) - Number(inv.amount_paid || 0);
              const payCfg = PAYMENT_STATUS_CFG[inv.payment_status] || PAYMENT_STATUS_CFG.pendiente;
              return (
                <div key={inv.id} className="grid grid-cols-12 gap-2 min-w-[860px] items-center text-sm px-3 py-2" style={{ background: C.panelAlt }}>
                  <div className="col-span-3 font-mono text-xs">{inv.invoice_number || inv.ncf}</div>
                  <div className="col-span-2" style={{ color: C.muted }}>{fmtDate(inv.invoice_date)}</div>
                  <div className="col-span-2 text-right font-mono">{fmtMoney(inv.total)}</div>
                  <div className="col-span-2 text-right font-mono" style={{ color: C.green }}>{fmtMoney(inv.amount_paid || 0)}</div>
                  <div className="col-span-1 text-right font-mono" style={{ color: balance > 0 ? C.red : C.muted }}>{fmtMoney(balance)}</div>
                  <div className="col-span-2 text-right"><Pill label={payCfg.label} color={payCfg.color} /></div>
                </div>
              );
            })}
            {clientInvoices.length === 0 && (
              <div className="text-sm text-center py-6" style={{ color: C.muted }}>
                {clientInvoicesAll.length === 0 ? "Este cliente no tiene facturas emitidas." : "Ninguna factura coincide con el filtro de estado elegido."}
              </div>
            )}
          </div>

          {clientInvoices.length > 0 && (
            <div className="p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Total facturado</span><span className="font-mono">{fmtMoney(totalFacturado)}</span></div>
              <div className="flex justify-between text-sm" style={{ color: C.green }}><span>Total cobrado</span><span className="font-mono">{fmtMoney(totalCobrado)}</span></div>
              <div className="flex justify-between text-base font-bold" style={{ color: saldo > 0 ? C.red : C.text }}><span>Saldo pendiente</span><span className="font-mono">{fmtMoney(saldo)}</span></div>
            </div>
          )}
        </>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cerrar</button>
        {client && clientInvoices.length > 0 && (
          <button onClick={doPrint} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
            <FileText size={14} /> Imprimir estado de cuenta
          </button>
        )}
      </div>
    </Modal>
  );
}
