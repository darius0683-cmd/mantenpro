// Notas de débito (B03): un cargo extra sobre una factura ya emitida (intereses por mora, gastos,
// diferencia de precio). Sube lo que debe el cliente en esa factura y se cobra como cualquier saldo.
// La base de datos asigna el NCF, guarda la nota y actualiza la factura en un solo paso
// (issue_debit_note, ver caja-notas.sql).
import React, { useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { ActivityHistorySection, C, Field, Modal, Pill, SearchSelect, fmtDate, fmtMoney, inputClass, inputStyle, invoiceBalance, invoiceLikeHtml, printDocument, todayStrRD } from "./base.jsx";

// ---------------------------------------------------------------------------
// Pantalla: notas de débito
// ---------------------------------------------------------------------------
export function VistaDebitNotes({ canEdit, clients, debitNotes, invoices, openDebitNoteDetail, setShowAddDebitNote }) {
  const [search, setSearch] = useState("");
  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";
  const list = (debitNotes || []).filter((n) => {
    if (!search.trim()) return true;
    const inv = invoices.find((i) => i.id === n.invoice_id);
    return `${n.ncf} ${inv?.ncf || ""} ${inv?.invoice_number || ""} ${clientName(n.client_id)} ${n.reason || ""}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="text-sm" style={{ color: C.muted }}>{list.length} nota{list.length !== 1 ? "s" : ""} de débito</div>
        <button onClick={() => setShowAddDebitNote(true)} disabled={invoices.length === 0 || !canEdit("debitNotes")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
          <Plus size={14} /> Nueva nota de débito
        </button>
      </div>
      <div className="text-xs mb-3" style={{ color: C.muted }}>
        Una nota de débito agrega un cargo a una factura ya emitida (intereses por mora, gastos, diferencia de precio). Sube lo que debe el cliente en esa factura y se cobra como cualquier saldo. Usa el comprobante B03 y sale en el 607.
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por NCF, factura, cliente o motivo..." className="w-full px-3 py-2 text-sm mb-3" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {list.map((n) => {
          const inv = invoices.find((i) => i.id === n.invoice_id);
          return (
            <div key={n.id} onClick={() => openDebitNoteDetail(n)} className="p-4 cursor-pointer" style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.orange}` }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-mono text-xs" style={{ color: C.muted }}>{n.ncf}</div>
                <div className="font-mono font-semibold">+{fmtMoney(n.total)}</div>
              </div>
              <div className="text-sm truncate">{clientName(n.client_id)}</div>
              {n.reason && <div className="text-xs truncate" style={{ color: C.muted }}>{n.reason}</div>}
              <div className="text-xs mt-2 pt-2" style={{ color: C.muted, borderTop: `1px solid ${C.border}` }}>
                <div>Factura: <span style={{ color: C.text }} className="font-mono">{inv?.ncf || "—"}</span>{inv?.invoice_number ? ` · ${inv.invoice_number}` : ""}</div>
                <div>Fecha: <span style={{ color: C.text }}>{fmtDate(n.note_date)}</span></div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>{(debitNotes || []).length === 0 ? "Todavía no hay notas de débito." : "Ninguna nota coincide con la búsqueda."}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------
export function DebitNoteFormModal({ invoices, clients, ncfSequences, onClose, onSave, saving }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [sequenceId, setSequenceId] = useState("");
  const [reason, setReason] = useState("");
  const [noteDate, setNoteDate] = useState(() => todayStrRD());
  const blank = { description: "", quantity: 1, unit_price: "", is_taxable: true };
  const [lines, setLines] = useState([{ ...blank, key: 1 }]);
  const [err, setErr] = useState("");
  const inv = invoices.find((i) => i.id === invoiceId);
  const exempt = !!inv?.exempt_itbis;
  const b03 = ncfSequences.filter((s) => s.ncf_type === "B03" && s.active && s.next_number <= s.range_end && (!s.expiration_date || s.expiration_date >= todayStrRD()));
  const num = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
  const lineAmount = (l) => Math.round(num(l.quantity) * num(l.unit_price) * 100) / 100;
  const subtotal = lines.reduce((a, l) => a + lineAmount(l), 0);
  const itbis = exempt ? 0 : Math.round(lines.reduce((a, l) => a + (l.is_taxable ? lineAmount(l) * 0.18 : 0), 0) * 100) / 100;
  const total = subtotal + itbis;
  const upd = (key, patch) => setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    setErr("");
    if (!inv) { setErr("Elige la factura."); return; }
    if (!sequenceId) { setErr("Elige la secuencia B03."); return; }
    const valid = lines.filter((l) => l.description.trim() && num(l.quantity) > 0 && num(l.unit_price) > 0);
    if (valid.length === 0) { setErr("Agrega al menos un cargo con descripción, cantidad y precio."); return; }
    if (valid.length !== lines.filter((l) => l.description.trim() || num(l.unit_price)).length) { setErr("Hay renglones incompletos: pon descripción, cantidad y precio, o bórralos."); return; }
    if (!reason.trim()) { setErr("Escribe el motivo (sale impreso en la nota)."); return; }
    onSave({ invoice_id: inv.id, ncf_sequence_id: sequenceId, reason: reason.trim(), note_date: noteDate }, valid.map((l) => ({ description: l.description.trim(), quantity: num(l.quantity), unit_price: num(l.unit_price), is_taxable: !exempt && l.is_taxable })));
  };

  return (
    <Modal title="Nueva nota de débito" onClose={onClose} wide>
      <Field label="Factura a la que se le agrega el cargo">
        <SearchSelect
          items={invoices.filter((i) => i.status !== "anulada")}
          value={invoiceId}
          onChange={setInvoiceId}
          getLabel={(i) => `${[i.invoice_number, i.ncf].filter(Boolean).join(" · ")} — ${clients.find((c) => c.id === i.client_id)?.name || "Cliente"}`}
          placeholder="Buscar factura por NCF o cliente..."
        />
      </Field>
      {inv && (
        <div className="text-xs mb-3" style={{ color: C.muted }}>
          Total de la factura: <span style={{ color: C.text }}>{fmtMoney(inv.total)}</span> · Debe hoy: <span style={{ color: C.text }}>{fmtMoney(invoiceBalance(inv))}</span>
          {inv.currency === "USD" && <span> · factura en US$: los cargos se escriben en RD$</span>}
          {exempt && <span> · factura exenta de ITBIS</span>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Secuencia NCF (B03 — Nota de Débito)">
          <select className={inputClass} style={inputStyle} value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
            <option value="">Selecciona una</option>
            {b03.map((s) => <option key={s.id} value={s.id}>{s.prefix || s.ncf_type} · quedan {s.range_end - s.next_number + 1}</option>)}
          </select>
          {b03.length === 0 && <div className="text-xs mt-1" style={{ color: C.red }}>No hay secuencias B03 disponibles — créala en "Secuencia NCF".</div>}
        </Field>
        <Field label="Fecha"><input type="date" className={inputClass} style={inputStyle} value={noteDate} max={todayStrRD()} onChange={(e) => setNoteDate(e.target.value)} /></Field>
      </div>
      <Field label="Motivo">
        <input className={inputClass} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Intereses por mora, gastos de envío, diferencia de precio" />
      </Field>

      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Cargos</div>
      <div className="overflow-x-auto">
        <div className="space-y-2 mb-2 min-w-[560px]">
          {lines.map((l) => (
            <div key={l.key} className="grid grid-cols-12 gap-2 items-center">
              <input className={`${inputClass} col-span-5`} style={inputStyle} placeholder="Descripción" value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} />
              <input type="text" inputMode="decimal" className={`${inputClass} col-span-1`} style={inputStyle} value={l.quantity} onChange={(e) => upd(l.key, { quantity: e.target.value })} aria-label="Cantidad" />
              <input type="text" inputMode="decimal" className={`${inputClass} col-span-2`} style={inputStyle} placeholder="Precio" value={l.unit_price} onChange={(e) => upd(l.key, { unit_price: e.target.value })} />
              <label className="col-span-2 flex items-center gap-1 text-xs" style={{ color: exempt ? C.muted : C.text }}>
                <input type="checkbox" checked={!exempt && l.is_taxable} disabled={exempt} onChange={(e) => upd(l.key, { is_taxable: e.target.checked })} /> ITBIS
              </label>
              <div className="col-span-1 text-right font-mono text-xs" style={{ color: C.muted }}>{fmtMoney(lineAmount(l))}</div>
              <button onClick={() => setLines((p) => (p.length > 1 ? p.filter((x) => x.key !== l.key) : p))} className="col-span-1 flex justify-center" style={{ color: C.muted }} title="Quitar"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>
      <button onClick={() => setLines((p) => [...p, { ...blank, key: Math.max(0, ...p.map((x) => x.key)) + 1 }])} className="flex items-center gap-1 text-xs mb-3" style={{ color: C.amber }}><Plus size={12} /> Agregar cargo</button>

      <div className="p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(subtotal)}</span></div>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS{exempt ? " (exenta)" : " (18%)"}</span><span className="font-mono">{fmtMoney(itbis)}</span></div>
        <div className="flex justify-between text-base font-bold" style={{ color: C.text }}><span>Total a cargar</span><span className="font-mono">{fmtMoney(total)}</span></div>
        {inv && total > 0 && <div className="text-xs" style={{ color: C.orange }}>La factura pasará a deber {fmtMoney(invoiceBalance(inv) + total)}.</div>}
      </div>
      {err && <div className="text-xs mt-2" style={{ color: C.red }}>{err}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving || b03.length === 0} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{saving ? "Emitiendo..." : "Emitir nota de débito"}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detalle e impresión
// ---------------------------------------------------------------------------
export function DebitNoteDetailModal({ note, items, invoice, clientName, clientRnc, companyName, company, onClose }) {
  const doPrint = () => {
    const html = invoiceLikeHtml({
      docLabel: "Nota de Débito", code: note.ncf, companyName, clientName, clientRnc,
      companyLogo: company?.logo_url, companyRnc: company?.rnc, companyAddress: company?.address, companyPhone: company?.phone,
      dateLabel: "Fecha", dateValue: fmtDate(note.note_date), extraMeta: invoice ? `<br/>Factura que modifica: ${invoice.ncf}` : "",
      items, subtotal: note.subtotal, itbis: note.itbis, total: note.total,
      notes: note.reason ? `Motivo: ${note.reason}` : "",
    });
    printDocument(`Nota de Débito ${note.ncf}`, html);
  };
  return (
    <Modal title={`Nota de Débito ${note.ncf}`} onClose={onClose} wide>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm" style={{ color: C.muted }}>Cliente: <span style={{ color: C.text }}>{clientName}</span>{clientRnc && <span> · RNC/Cédula: {clientRnc}</span>}</div>
        <Pill label="Emitida" color={C.orange} />
      </div>
      {invoice && (
        <div className="text-xs mb-2 px-3 py-2" style={{ background: C.panelAlt, color: C.muted }}>
          Factura que modifica: <span className="font-mono" style={{ color: C.text }}>{invoice.ncf}</span>{invoice.invoice_number ? ` · ${invoice.invoice_number}` : ""} · debe hoy <span style={{ color: C.text }}>{fmtMoney(invoiceBalance(invoice))}</span>
        </div>
      )}
      {note.reason && <div className="text-sm mb-3" style={{ color: C.text }}>Motivo: {note.reason}</div>}
      <div className="text-xs mb-4" style={{ color: C.muted }}>Fecha<br /><span style={{ color: C.text }}>{fmtDate(note.note_date)}</span></div>
      <div className="space-y-1 mb-3">
        {(items || []).map((it) => (
          <div key={it.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt }}>
            <div>{it.description} {it.is_taxable && <span className="text-xs" style={{ color: C.muted }}>(ITBIS)</span>}</div>
            <div className="font-mono" style={{ color: C.muted }}>{it.quantity} × {fmtMoney(it.unit_price)} = {fmtMoney(it.subtotal)}</div>
          </div>
        ))}
      </div>
      <div className="p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(note.subtotal)}</span></div>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS</span><span className="font-mono">{fmtMoney(note.itbis)}</span></div>
        <div className="flex justify-between text-base font-bold" style={{ color: C.text }}><span>Total</span><span className="font-mono">{fmtMoney(note.total)}</span></div>
      </div>
      <ActivityHistorySection tableName="debit_notes" recordId={note.id} title="Historial de esta nota de débito" resolvers={{ client_id: () => clientName }} />
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={doPrint} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.amber, border: `1px solid ${C.border}` }}><FileText size={14} /> Imprimir</button>
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Cerrar</button>
      </div>
    </Modal>
  );
}
