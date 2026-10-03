// Pantallas de Gestión Contable y reportes fiscales/financieros.
// Cada componente es el JSX de una pantalla del Dashboard, copiado tal cual. Todo lo que usa
// (estados, funciones y cálculos del Dashboard) le llega por props con el mismo nombre.
// Se carga solo cuando se abre la pantalla (ver lazy.jsx).
import React from "react";
import { supabase } from "../supabaseClient";
import { C, KpiCard, MOTIVOS_ANULACION_608, Pill, TIPOS_RETENCION_ISR_606, fetchByIdChunks, fmtDate, fmtMoney, formaPago606FromPayments, iconBtnStyle, isRetentionMethod, todayStrRD } from "./base.jsx";
import { FileText, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Pantalla: chartOfAccounts
export function VistaChartOfAccounts({ canDelete, canEdit, chartOfAccounts, deleteAccount, setEditingAccount, setShowAddAccount }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>{chartOfAccounts.length} cuenta{chartOfAccounts.length !== 1 ? "s" : ""}</div>
                <button onClick={() => setShowAddAccount(true)} disabled={!canEdit("chartOfAccounts")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Agregar cuenta
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {chartOfAccounts.map((a) => (
                  <div key={a.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <div className="font-mono text-xs" style={{ color: C.muted }}>{a.code}</div>
                        <div className="font-semibold truncate">{a.name}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        {canEdit("chartOfAccounts") && <button onClick={() => setEditingAccount(a)} style={iconBtnStyle}><Pencil size={14} /></button>}
                        {canDelete("chartOfAccounts") && <button onClick={() => deleteAccount(a.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 mt-2 text-xs" style={{ borderTop: `1px solid ${C.border}`, color: C.muted }}>
                      <span>{a.account_type}</span>
                      <span style={{ color: a.is_active ? C.green : C.muted }}>{a.is_active ? "Activa" : "Inactiva"}</span>
                    </div>
                  </div>
                ))}
                {chartOfAccounts.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>Todavía no hay cuentas en el catálogo.</div>}
              </div>
            </div>
  );
}

// Pantalla: taxRates
export function VistaTaxRates({ canDelete, canEdit, deleteTaxRate, setEditingTaxRate, setShowAddTaxRate, taxRates }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>{taxRates.length} tasa{taxRates.length !== 1 ? "s" : ""} configurada{taxRates.length !== 1 ? "s" : ""}</div>
                <button onClick={() => setShowAddTaxRate(true)} disabled={!canEdit("taxRates")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Agregar tasa
                </button>
              </div>
              <div className="text-xs mb-3" style={{ color: C.muted }}>Catálogo informativo — las cotizaciones y facturas siguen calculando ITBIS al 18% de forma fija.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {taxRates.map((t) => (
                  <div key={t.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-semibold truncate">{t.name}</div>
                      <div className="flex items-center gap-1">
                        {canEdit("taxRates") && <button onClick={() => setEditingTaxRate(t)} style={iconBtnStyle}><Pencil size={14} /></button>}
                        {canDelete("taxRates") && <button onClick={() => deleteTaxRate(t.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 mt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                      <span className="font-mono font-semibold">{Number(t.rate_pct)}%</span>
                      <span className="text-xs" style={{ color: t.is_default ? C.amber : C.muted }}>{t.is_default ? "Por defecto" : ""}</span>
                    </div>
                  </div>
                ))}
                {taxRates.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>Todavía no hay tasas configuradas.</div>}
              </div>

            </div>
  );
}

// Pantalla: fiscalReports
export function VistaFiscalReports({ clients, company, creditNotes, invoices, otherExpenses, products, purchases, setErrorMsg, setTaxReportPeriod, suppliers, taxReportPeriod }) {
  return (
          <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="text-sm font-semibold" style={{ color: C.text }}>Reportes DGII 606 (Compras) / 607 (Ventas) / 608 (Anulados)</div>
                <input type="month" value={taxReportPeriod} onChange={(e) => setTaxReportPeriod(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
              </div>
              <div className="text-xs mb-3" style={{ color: C.muted }}>Las columnas coinciden con las plantillas oficiales de la DGII (606 y 607). El 606 incluye las compras y los otros gastos que tengan NCF; si falta algún dato, aparece la lista de lo que hay que completar. El 607 incluye las facturas y las notas de crédito del mes; la forma de venta sale de los cobros registrados hasta el cierre del mes (lo pendiente va a "Venta a Crédito").</div>
              {(() => {
                const periodPurchases = purchases.filter((pu) => (pu.purchase_date || "").slice(0, 7) === taxReportPeriod);
                // Otros gastos con NCF también van al 606 (luz, teléfono, combustible, alquiler...)
                const periodExpenses = otherExpenses.filter((ex) => ex.ncf && (ex.expense_date || "").slice(0, 7) === taxReportPeriod);
                const supplierOf = (id) => suppliers.find((sp) => sp.id === id);
                const issues606 = [];
                periodPurchases.forEach((pu) => {
                  const sup = supplierOf(pu.supplier_id);
                  const ref = `Compra ${pu.invoice_number || "sin NCF"} (${sup?.name || "sin proveedor"})`;
                  if (!pu.invoice_number) issues606.push(`${ref}: falta el NCF del proveedor`);
                  if (!(sup?.rnc || "").trim()) issues606.push(`${ref}: el proveedor no tiene RNC`);
                  if (!pu.tipo_bien_servicio) issues606.push(`${ref}: falta el tipo de bien o servicio (ábrela y completa "Datos para el 606")`);
                });
                const isB13 = (ex) => /^B13/i.test(ex.ncf || "");
                periodExpenses.forEach((ex) => {
                  const sup = supplierOf(ex.supplier_id);
                  const ref = `Gasto ${ex.ncf} (${ex.description})`;
                  if (!isB13(ex) && !(sup?.rnc || "").trim()) issues606.push(`${ref}: el proveedor no tiene RNC`);
                  if (isB13(ex) && !(sup?.rnc || company?.rnc || "").trim()) issues606.push(`${ref}: B13 sin proveedor y la empresa no tiene RNC en su perfil`);
                  if (!ex.tipo_bien_servicio) issues606.push(`${ref}: falta el tipo de bien o servicio`);
                  if (!ex.forma_pago) issues606.push(`${ref}: falta la forma de pago`);
                });
                const periodInvoices = invoices.filter((inv) => inv.status !== "anulada" && (inv.invoice_date || "").slice(0, 7) === taxReportPeriod);
                // Notas de crédito (B04) del período: van al 607 con el NCF de la factura que modifican
                const periodCreditNotes = creditNotes.filter((cn) => cn.status !== "anulada" && (cn.note_date || "").slice(0, 10).slice(0, 7) === taxReportPeriod);
                const issues607 = [];
                periodInvoices.forEach((inv) => {
                  const cli = clients.find((c) => c.id === inv.client_id);
                  if ((inv.ncf || "").toUpperCase().startsWith("B01") && !(cli?.rnc_cedula || "").replace(/\D/g, "")) {
                    issues607.push(`Factura ${inv.ncf} (${cli?.name || "sin cliente"}): es B01 y el cliente no tiene RNC/cédula`);
                  }
                });
                periodCreditNotes.forEach((cn) => {
                  if (!invoices.find((i) => i.id === cn.invoice_id)?.ncf) issues607.push(`Nota de crédito ${cn.ncf}: no se encontró el NCF de la factura que modifica`);
                });
                const purchTotals = periodPurchases.reduce((acc, pu) => {
                  acc.subtotal += Number(pu.service_value ?? pu.total ?? 0);
                  acc.itbis += Number(pu.itbis_amount || 0);
                  acc.itbisRet += Number(pu.itbis_retained || 0);
                  acc.isrRet += Number(pu.isr_retained || 0);
                  acc.total += Number(pu.total || 0);
                  return acc;
                }, { subtotal: 0, itbis: 0, itbisRet: 0, isrRet: 0, total: 0 });
                periodExpenses.forEach((ex) => {
                  purchTotals.subtotal += Number(ex.amount || 0) - Number(ex.itbis_amount || 0);
                  purchTotals.itbis += Number(ex.itbis_amount || 0);
                  purchTotals.total += Number(ex.amount || 0);
                });
                const salesTotals = periodInvoices.reduce((acc, inv) => {
                  acc.subtotal += Number(inv.subtotal || 0);
                  acc.itbis += Number(inv.itbis || 0);
                  acc.itbisRet += Number(inv.itbis_retained || 0);
                  acc.total += Number(inv.total || 0);
                  return acc;
                }, { subtotal: 0, itbis: 0, itbisRet: 0, total: 0 });
                periodCreditNotes.forEach((cn) => {
                  salesTotals.subtotal -= Number(cn.subtotal || 0);
                  salesTotals.itbis -= Number(cn.itbis || 0);
                  salesTotals.total -= Number(cn.total || 0);
                });

                const downloadCsv = (filename, header, rows) => {
                  const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
                  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = filename; a.click();
                  URL.revokeObjectURL(url);
                };

                const tipoId = (rnc) => {
                  const digits = (rnc || "").replace(/\D/g, "");
                  if (digits.length === 9) return "1";
                  if (digits.length === 11) return "2";
                  return "";
                };

                const download606 = async () => {
                  const header = [
                    "Líneas", "RNC o Cédula", "Tipo Id", "Tipo Bienes y Servicios Comprados", "NCF", "NCF ó Documento Modificado",
                    "Fecha Comprobante", "Fecha Pago", "Monto Facturado en Servicios", "Monto Facturado en Bienes", "Total Monto Facturado",
                    "ITBIS Facturado", "ITBIS Retenido", "ITBIS sujeto a Proporcionalidad (Art. 349)", "ITBIS llevado al Costo",
                    "ITBIS por Adelantar", "ITBIS percibido en compras", "Tipo de Retención en ISR", "Monto Retención Renta",
                    "ISR Percibido en compras", "Impuesto Selectivo al Consumo", "Otros Impuesto/Tasas", "Monto Propina Legal",
                    "Forma de Pago", "Estatus",
                  ];
                  // Renglones (para separar bienes de servicios según el tipo de producto) y pagos
                  // (para la fecha y la forma de pago) de las compras del período.
                  const ids = periodPurchases.map((pu) => pu.id);
                  let itemsByPurchase = new Map();
                  let paysByPurchase = new Map();
                  if (ids.length > 0) {
                    const [{ data: itemRows, error: itErr }, { data: payRows, error: payErr }] = await Promise.all([
                      fetchByIdChunks(ids, (chunk) => supabase.from("purchase_items").select("purchase_id, product_id, subtotal").in("purchase_id", chunk)),
                      fetchByIdChunks(ids, (chunk) => supabase.from("purchase_payments").select("purchase_id, method, payment_date").in("purchase_id", chunk)),
                    ]);
                    if (itErr || payErr) { setErrorMsg(`No se pudo preparar el 606: ${(itErr || payErr).message}`); return; }
                    (itemRows || []).forEach((r) => { if (!itemsByPurchase.has(r.purchase_id)) itemsByPurchase.set(r.purchase_id, []); itemsByPurchase.get(r.purchase_id).push(r); });
                    (payRows || []).forEach((r) => { if (!paysByPurchase.has(r.purchase_id)) paysByPurchase.set(r.purchase_id, []); paysByPurchase.get(r.purchase_id).push(r); });
                  }
                  const ymd = (d) => (d || "").replaceAll("-", "");
                  const rows = [];
                  periodPurchases.forEach((pu) => {
                    const sup = supplierOf(pu.supplier_id);
                    const itbisAmount = Number(pu.itbis_amount || 0);
                    const itbisRetained = Number(pu.itbis_retained || 0);
                    const isrRetained = Number(pu.isr_retained || 0);
                    const base = Number(pu.service_value ?? pu.total ?? 0);
                    const its = itemsByPurchase.get(pu.id) || [];
                    let montoServicios;
                    if (its.length > 0) {
                      montoServicios = its.reduce((sum, it) => {
                        const prod = products.find((pr) => pr.id === it.product_id);
                        return sum + ((prod?.item_type || "producto") === "servicio" ? Number(it.subtotal || 0) : 0);
                      }, 0);
                      montoServicios = Math.min(montoServicios, base);
                    } else {
                      montoServicios = pu.applies_254_06 ? base : 0;
                    }
                    const montoBienes = base - montoServicios;
                    const pays = (paysByPurchase.get(pu.id) || []).slice().sort((a, b) => (a.payment_date || "").localeCompare(b.payment_date || ""));
                    const lastPayDate = pays.length > 0 ? pays[pays.length - 1].payment_date : "";
                    rows.push([
                      "", sup?.rnc || "", tipoId(sup?.rnc), pu.tipo_bien_servicio || "", pu.invoice_number || "", "",
                      ymd(pu.purchase_date), ymd(lastPayDate), montoServicios.toFixed(2), montoBienes.toFixed(2), base.toFixed(2),
                      itbisAmount.toFixed(2), itbisRetained.toFixed(2), "", "",
                      itbisAmount.toFixed(2), "", isrRetained > 0 ? (pu.isr_retention_type || "02") : "", isrRetained.toFixed(2),
                      "", "", "", "",
                      pu.forma_pago || formaPago606FromPayments(pays), "",
                    ]);
                  });
                  periodExpenses.forEach((ex) => {
                    const sup = supplierOf(ex.supplier_id);
                    // B13 (gasto menor): si no hay proveedor, se usa el RNC de la propia empresa
                    const rncLinea = isB13(ex) && !(sup?.rnc || "").trim() ? (company?.rnc || "") : (sup?.rnc || "");
                    const itbisAmount = Number(ex.itbis_amount || 0);
                    const base = Math.max(Number(ex.amount || 0) - itbisAmount, 0);
                    const isService = (ex.expense_kind || "servicios") === "servicios";
                    rows.push([
                      "", rncLinea, tipoId(rncLinea), ex.tipo_bien_servicio || "", ex.ncf || "", "",
                      ymd(ex.expense_date), ymd(ex.payment_date || ex.expense_date), (isService ? base : 0).toFixed(2), (isService ? 0 : base).toFixed(2), base.toFixed(2),
                      itbisAmount.toFixed(2), "0.00", "", "",
                      itbisAmount.toFixed(2), "", "", "0.00",
                      "", "", "", "",
                      ex.forma_pago || "", "",
                    ]);
                  });
                  rows.forEach((r, idx) => { r[0] = idx + 1; });
                  downloadCsv(`606_${taxReportPeriod}.csv`, header, rows);
                };
                // 608: NCF anulados. Se toman por la fecha de anulación (o la de la factura en las
                // anuladas antes de que se guardara esa fecha).
                const periodVoided = invoices.filter((inv) => inv.status === "anulada" && ((inv.voided_at || inv.invoice_date || "").slice(0, 7) === taxReportPeriod));
                const voidedWithoutReason = periodVoided.filter((inv) => !inv.void_reason_code);
                const download608 = () => {
                  const header = ["Número de Comprobante Fiscal", "Fecha de Comprobante", "Tipo de Anulación"];
                  const rows = periodVoided.map((inv) => [inv.ncf || "", (inv.invoice_date || "").replaceAll("-", ""), inv.void_reason_code || ""]);
                  downloadCsv(`608_${taxReportPeriod}.csv`, header, rows);
                };

                const download607 = async () => {
                  const header = [
                    "No", "RNC/Cédula o Pasaporte", "Tipo Identificación", "Número Comprobante Fiscal", "Número Comprobante Fiscal Modificado",
                    "Tipo de Ingreso", "Fecha Comprobante", "Fecha de Retención", "Monto Facturado", "ITBIS Facturado", "ITBIS Retenido por Terceros",
                    "ITBIS Percibido", "Retención Renta por Terceros", "ISR Percibido", "Impuesto Selectivo al Consumo", "Otros Impuestos/Tasas",
                    "Monto Propina Legal", "Efectivo", "Cheque/ Transferencia/ Depósito", "Tarjeta Débito/Crédito", "Venta a Crédito",
                    "Bonos o Certificados de Regalo", "Permuta", "Otras Formas de Ventas", "Estatus",
                  ];
                  // Cobros de las facturas del período para repartir la forma de venta. Solo cuentan los
                  // cobros hechos hasta el cierre del mes; lo que falte por cobrar va a "Venta a Crédito".
                  const ids = periodInvoices.map((inv) => inv.id);
                  const paysByInvoice = new Map();
                  if (ids.length > 0) {
                    const { data: payRows, error: payErr } = await fetchByIdChunks(ids, (chunk) => supabase.from("invoice_payments").select("invoice_id, amount, method, payment_date").in("invoice_id", chunk));
                    if (payErr) { setErrorMsg(`No se pudo preparar el 607: ${payErr.message}`); return; }
                    (payRows || []).forEach((r) => { if (!paysByInvoice.has(r.invoice_id)) paysByInvoice.set(r.invoice_id, []); paysByInvoice.get(r.invoice_id).push(r); });
                  }
                  const [py, pm] = taxReportPeriod.split("-").map(Number);
                  const periodEnd = `${taxReportPeriod}-${String(new Date(py, pm, 0).getDate()).padStart(2, "0")}`;
                  const ymd = (d) => (d || "").slice(0, 10).replaceAll("-", "");
                  const pendingRetentions = [];
                  const rows = [];
                  periodInvoices.forEach((inv) => {
                    const cli = clients.find((c) => c.id === inv.client_id);
                    const subtotal = Number(inv.subtotal || 0);
                    const itbis = Number(inv.itbis || 0);
                    const retained = Number(inv.itbis_retained || 0);
                    const pays = (paysByInvoice.get(inv.id) || []).slice().sort((a, b) => (a.payment_date || "").localeCompare(b.payment_date || ""));
                    const paidInPeriod = pays.filter((p) => (p.payment_date || "") <= periodEnd);
                    const sumBy = (fn) => paidInPeriod.filter(fn).reduce((sum, p) => sum + Number(p.amount || 0), 0);
                    const efectivo = sumBy((p) => p.method === "Efectivo");
                    const tarjeta = sumBy((p) => p.method === "Tarjeta");
                    const banco = sumBy((p) => p.method !== "Efectivo" && p.method !== "Tarjeta" && !isRetentionMethod(p.method));
                    // Retención de ISR hecha por el cliente (cualquier fecha): va a "Retención Renta por Terceros"
                    const isrRetPays = pays.filter((p) => p.method === "Retención ISR (cliente)");
                    const isrRetenido = isrRetPays.reduce((sum, p) => sum + Number(p.amount || 0), 0);
                    const credito = Math.max(Number(inv.total || 0) - efectivo - tarjeta - banco - isrRetenido, 0);
                    // La retención de la Norma 02-05 la hace el cliente al pagar: fecha = primer cobro.
                    let fechaRetencion = "";
                    let itbisRetenido = 0;
                    if (inv.applies_norma_0205 && retained > 0) {
                      if (pays.length > 0) { fechaRetencion = ymd(pays[0].payment_date); itbisRetenido = retained; }
                      else pendingRetentions.push(inv.ncf);
                    }
                    if (isrRetPays.length > 0 && !fechaRetencion) fechaRetencion = ymd(isrRetPays[0].payment_date);
                    rows.push([
                      "", cli?.rnc_cedula || "", tipoId(cli?.rnc_cedula), inv.ncf || "", "",
                      inv.income_type || "01", ymd(inv.invoice_date), fechaRetencion, subtotal.toFixed(2), itbis.toFixed(2), itbisRetenido.toFixed(2),
                      "", isrRetenido > 0 ? isrRetenido.toFixed(2) : "", "", "", "",
                      "", efectivo.toFixed(2), banco.toFixed(2), tarjeta.toFixed(2), credito.toFixed(2),
                      "", "", "", "",
                    ]);
                  });
                  periodCreditNotes.forEach((cn) => {
                    const cli = clients.find((c) => c.id === cn.client_id);
                    const inv = invoices.find((i) => i.id === cn.invoice_id);
                    rows.push([
                      "", cli?.rnc_cedula || "", tipoId(cli?.rnc_cedula), cn.ncf || "", inv?.ncf || "",
                      inv?.income_type || "01", ymd(cn.note_date), "", Number(cn.subtotal || 0).toFixed(2), Number(cn.itbis || 0).toFixed(2), "0.00",
                      "", "", "", "", "",
                      "", "0.00", "0.00", "0.00", "0.00",
                      "", "", "", "",
                    ]);
                  });
                  rows.forEach((r, idx) => { r[0] = idx + 1; });
                  downloadCsv(`607_${taxReportPeriod}.csv`, header, rows);
                  if (pendingRetentions.length > 0) {
                    setErrorMsg(`607 descargado. Aviso: ${pendingRetentions.length} factura(s) con Norma 02-05 todavía sin cobrar (${pendingRetentions.slice(0, 5).join(", ")}${pendingRetentions.length > 5 ? "…" : ""}) — su ITBIS retenido salió en 0; cuando el cliente pague habrá que reenviar el 607 de este mes.`);
                  }
                };

                return (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>606 · Compras ({periodPurchases.length}) y gastos con NCF ({periodExpenses.length})</div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(purchTotals.subtotal)}</span></div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS facturado</span><span className="font-mono">{fmtMoney(purchTotals.itbis)}</span></div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS retenido</span><span className="font-mono">{fmtMoney(purchTotals.itbisRet)}</span></div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ISR retenido</span><span className="font-mono">{fmtMoney(purchTotals.isrRet)}</span></div>
                        <div className="flex justify-between text-sm font-semibold mt-1" style={{ color: C.text }}><span>Total</span><span className="font-mono">{fmtMoney(purchTotals.total)}</span></div>
                        {issues606.length > 0 && (
                          <details className="mt-2 text-xs" style={{ color: C.orange }}>
                            <summary className="cursor-pointer">{issues606.length} dato{issues606.length !== 1 ? "s" : ""} por completar antes de enviar</summary>
                            <ul className="mt-1 space-y-0.5 list-disc pl-4" style={{ color: C.text }}>
                              {issues606.slice(0, 30).map((t, i) => <li key={i}>{t}</li>)}
                              {issues606.length > 30 && <li>…y {issues606.length - 30} más</li>}
                            </ul>
                          </details>
                        )}
                        <button onClick={download606} disabled={periodPurchases.length === 0 && periodExpenses.length === 0} className="flex items-center gap-2 mt-3 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                          <FileText size={13} /> Descargar 606 (CSV)
                        </button>
                      </div>
                      <div className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>607 · Ventas ({periodInvoices.length}) y notas de crédito ({periodCreditNotes.length})</div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(salesTotals.subtotal)}</span></div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS facturado</span><span className="font-mono">{fmtMoney(salesTotals.itbis)}</span></div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS retenido</span><span className="font-mono">{fmtMoney(salesTotals.itbisRet)}</span></div>
                        <div className="flex justify-between text-sm font-semibold mt-1" style={{ color: C.text }}><span>Total</span><span className="font-mono">{fmtMoney(salesTotals.total)}</span></div>
                        {issues607.length > 0 && (
                          <details className="mt-2 text-xs" style={{ color: C.orange }}>
                            <summary className="cursor-pointer">{issues607.length} dato{issues607.length !== 1 ? "s" : ""} por revisar antes de enviar</summary>
                            <ul className="mt-1 space-y-0.5 list-disc pl-4" style={{ color: C.text }}>
                              {issues607.slice(0, 30).map((t, i) => <li key={i}>{t}</li>)}
                              {issues607.length > 30 && <li>…y {issues607.length - 30} más</li>}
                            </ul>
                          </details>
                        )}
                        <button onClick={download607} disabled={periodInvoices.length === 0 && periodCreditNotes.length === 0} className="flex items-center gap-2 mt-3 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                          <FileText size={13} /> Descargar 607 (CSV)
                        </button>
                      </div>
                    </div>
                    <div className="p-3 mb-4" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>608 · Comprobantes anulados ({periodVoided.length})</div>
                      {periodVoided.length > 0 ? (
                        <div className="space-y-0.5 mb-2">
                          {periodVoided.slice(0, 8).map((inv) => (
                            <div key={inv.id} className="flex justify-between text-xs" style={{ color: C.text }}>
                              <span className="font-mono">{inv.ncf}</span>
                              <span style={{ color: inv.void_reason_code ? C.muted : C.orange }}>{inv.void_reason_code ? (MOTIVOS_ANULACION_608.find((m) => m.code === inv.void_reason_code)?.label || inv.void_reason_code) : "sin motivo"}</span>
                            </div>
                          ))}
                          {periodVoided.length > 8 && <div className="text-xs" style={{ color: C.muted }}>…y {periodVoided.length - 8} más</div>}
                        </div>
                      ) : <div className="text-xs mb-2" style={{ color: C.muted }}>No hay facturas anuladas en este mes.</div>}
                      {voidedWithoutReason.length > 0 && (
                        <div className="text-xs mb-2" style={{ color: C.orange }}>{voidedWithoutReason.length} anulada{voidedWithoutReason.length !== 1 ? "s" : ""} antes de que existiera el motivo: la columna "Tipo de Anulación" sale vacía y hay que completarla a mano.</div>
                      )}
                      <button onClick={download608} disabled={periodVoided.length === 0} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                        <FileText size={13} /> Descargar 608 (CSV)
                      </button>
                    </div>
                    {(() => {
                      // ---- Resumen IT-1 (ITBIS) ----
                      const itbisVentas = periodInvoices.reduce((sum, inv) => sum + Number(inv.itbis || 0), 0);
                      const itbisNC = periodCreditNotes.reduce((sum, cn) => sum + Number(cn.itbis || 0), 0);
                      const ventasTotales = periodInvoices.reduce((sum, inv) => sum + Number(inv.subtotal || 0), 0) - periodCreditNotes.reduce((sum, cn) => sum + Number(cn.subtotal || 0), 0);
                      // Base gravada = ITBIS / 18%; lo demás del subtotal es exento
                      const ventasGravadas = (itbisVentas - itbisNC) / 0.18;
                      const ventasExentas = Math.max(ventasTotales - ventasGravadas, 0);
                      // Norma 02-05: el cliente retiene al pagar; cuenta solo si ya hubo cobro
                      const retenidoPorClientes = periodInvoices.filter((inv) => inv.applies_norma_0205 && Number(inv.amount_paid || 0) > 0).reduce((sum, inv) => sum + Number(inv.itbis_retained || 0), 0);
                      const retencionPendiente = periodInvoices.filter((inv) => inv.applies_norma_0205 && Number(inv.amount_paid || 0) <= 0).reduce((sum, inv) => sum + Number(inv.itbis_retained || 0), 0);
                      const itbisAdelantado = purchTotals.itbis; // compras + gastos con NCF
                      const itbisRetenidoAProveedores = purchTotals.itbisRet;
                      const saldoItbis = itbisVentas - itbisNC - itbisAdelantado - retenidoPorClientes;
                      // ---- Resumen IR-17 (ISR retenido a proveedores, por tipo) ----
                      const ir17 = {};
                      periodPurchases.filter((pu) => Number(pu.isr_retained || 0) > 0).forEach((pu) => {
                        const code = pu.isr_retention_type || "02";
                        if (!ir17[code]) ir17[code] = { count: 0, base: 0, retenido: 0 };
                        ir17[code].count += 1;
                        ir17[code].base += Number(pu.service_value || 0);
                        ir17[code].retenido += Number(pu.isr_retained || 0);
                      });
                      const ir17IsrTotal = Object.values(ir17).reduce((sum, r) => sum + r.retenido, 0);
                      const ir17ItbisCount = periodPurchases.filter((pu) => Number(pu.itbis_retained || 0) > 0).length;
                      const ir17Total = ir17IsrTotal + itbisRetenidoAProveedores;
                      const row = (label, value, opts = {}) => (
                        <div className={`flex justify-between text-sm ${opts.bold ? "font-bold mt-1 pt-1" : ""}`} style={{ color: opts.bold ? C.text : C.muted, borderTop: opts.bold ? `1px solid ${C.border}` : "none" }}>
                          <span>{label}</span><span className="font-mono" style={opts.color ? { color: opts.color } : undefined}>{value}</span>
                        </div>
                      );
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.amber}60` }}>
                            <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.amber }}>Resumen para la IT-1 (ITBIS)</div>
                            {row("Ventas del mes (neto de notas de crédito)", fmtMoney(ventasTotales))}
                            {row("· Gravadas", fmtMoney(ventasGravadas))}
                            {row("· Exentas", fmtMoney(ventasExentas))}
                            {row("ITBIS facturado en ventas", fmtMoney(itbisVentas))}
                            {itbisNC > 0 && row("ITBIS de notas de crédito", `-${fmtMoney(itbisNC)}`)}
                            {row("ITBIS adelantado (compras y gastos con NCF)", `-${fmtMoney(itbisAdelantado)}`)}
                            {retenidoPorClientes > 0 && row("ITBIS retenido por clientes (Norma 02-05)", `-${fmtMoney(retenidoPorClientes)}`)}
                            {row(saldoItbis >= 0 ? "ITBIS a pagar" : "Saldo a favor", fmtMoney(Math.abs(saldoItbis)), { bold: true, color: saldoItbis >= 0 ? C.text : C.green })}
                            {retencionPendiente > 0 && (
                              <div className="text-xs mt-1" style={{ color: C.orange }}>{fmtMoney(retencionPendiente)} de retención 02-05 todavía sin cobrar — no se resta hasta que el cliente pague.</div>
                            )}
                          </div>
                          <div className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.amber}60` }}>
                            <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.amber }}>Resumen para la IR-17 (retenciones a terceros)</div>
                            {Object.keys(ir17).length === 0 && itbisRetenidoAProveedores <= 0 ? (
                              <div className="text-sm" style={{ color: C.muted }}>No hay retenciones a proveedores en este mes.</div>
                            ) : (
                              <>
                                {Object.entries(ir17).sort(([a], [b]) => a.localeCompare(b)).map(([code, r]) => (
                                  <div key={code} className="mb-1">
                                    {row(`ISR · ${TIPOS_RETENCION_ISR_606.find((t) => t.code === code)?.label || code}`, fmtMoney(r.retenido))}
                                    <div className="text-xs" style={{ color: C.muted }}>{r.count} compra{r.count !== 1 ? "s" : ""} · base {fmtMoney(r.base)}</div>
                                  </div>
                                ))}
                                {itbisRetenidoAProveedores > 0 && (
                                  <div className="mb-1">
                                    {row("ITBIS retenido a proveedores (254-06)", fmtMoney(itbisRetenidoAProveedores))}
                                    <div className="text-xs" style={{ color: C.muted }}>{ir17ItbisCount} compra{ir17ItbisCount !== 1 ? "s" : ""}</div>
                                  </div>
                                )}
                                {row("Total retenido a pagar", fmtMoney(ir17Total), { bold: true })}
                              </>
                            )}
                            <div className="text-xs mt-2" style={{ color: C.muted }}>Sale de las compras del mes con retención de ISR y/o ITBIS.</div>
                          </div>
                          <div className="md:col-span-2 text-xs" style={{ color: C.muted }}>
                            Son resúmenes de apoyo para llenar las declaraciones en la Oficina Virtual — revísalos con tu contador antes de presentar. No incluyen anticipos de ISR, saldos a favor de meses anteriores ni retenciones de nómina.
                          </div>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
            </div>
  );
}

// Pantalla: financialReports
export function VistaFinancialReports({ companyHasModule, financialCashFlow, financialDateFrom, financialDateTo, financialMonthlyChart, financialPnl, loadingFinancial, setFinancialDateFrom, setFinancialDateTo }) {
  return (
          <div>
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Desde</div>
                  <input type="date" value={financialDateFrom} onChange={(e) => setFinancialDateFrom(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Hasta</div>
                  <input type="date" value={financialDateTo} onChange={(e) => setFinancialDateTo(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                {loadingFinancial && <div className="text-sm" style={{ color: C.muted }}>Calculando flujo de caja...</div>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <div className="text-sm font-semibold mb-3">Estado de resultados (devengado)</div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span style={{ color: C.muted }}>Ingresos por facturación</span><span className="font-mono">{fmtMoney(financialPnl.revenue)}</span></div>
                    {financialPnl.creditNotesTotal > 0 && (
                      <div className="flex justify-between"><span style={{ color: C.muted }}>Notas de crédito</span><span className="font-mono" style={{ color: C.red }}>-{fmtMoney(financialPnl.creditNotesTotal)}</span></div>
                    )}
                    <div className="flex justify-between font-semibold pt-1" style={{ borderTop: `1px solid ${C.border}` }}><span>Ingresos netos</span><span className="font-mono">{fmtMoney(financialPnl.netRevenue)}</span></div>
                    <div className="flex justify-between pt-2"><span style={{ color: C.muted }}>Costo de venta (productos vendidos)</span><span className="font-mono" style={{ color: C.red }}>-{fmtMoney(financialPnl.costOfSales)}</span></div>
                    <div className="flex justify-between font-semibold pt-1" style={{ borderTop: `1px solid ${C.border}` }}><span>Utilidad bruta</span><span className="font-mono">{fmtMoney(financialPnl.netRevenue - financialPnl.costOfSales)}</span></div>
                    <div className="flex justify-between pt-2"><span style={{ color: C.muted }}>Compras de servicios y gastos</span><span className="font-mono" style={{ color: C.red }}>-{fmtMoney(financialPnl.expensePurchases)}</span></div>
                    <div className="flex justify-between"><span style={{ color: C.muted }}>Otros gastos</span><span className="font-mono" style={{ color: C.red }}>-{fmtMoney(financialPnl.otherExpensesCost)}</span></div>
                    {financialPnl.payrollCost > 0 && (
                      <div className="flex justify-between"><span style={{ color: C.muted }}>Nómina (salarios + aportes patronales)</span><span className="font-mono" style={{ color: C.red }}>-{fmtMoney(financialPnl.payrollCost)}</span></div>
                    )}
                    {financialPnl.cardCommissions > 0 && (
                      <div className="flex justify-between"><span style={{ color: C.muted }}>Comisiones de tarjeta</span><span className="font-mono" style={{ color: C.red }}>-{fmtMoney(financialPnl.cardCommissions)}</span></div>
                    )}
                    {Math.abs(financialPnl.fxDifference) >= 0.01 && (
                      <div className="flex justify-between"><span style={{ color: C.muted }}>Diferencia cambiaria ({financialPnl.fxDifference > 0 ? "ganancia" : "pérdida"})</span><span className="font-mono" style={{ color: financialPnl.fxDifference > 0 ? C.green : C.red }}>{financialPnl.fxDifference > 0 ? "+" : ""}{fmtMoney(financialPnl.fxDifference)}</span></div>
                    )}
                    <div className="flex justify-between font-bold text-base pt-2" style={{ borderTop: `1px solid ${C.border}`, color: financialPnl.netIncome >= 0 ? C.green : C.red }}>
                      <span>Utilidad neta</span><span className="font-mono">{fmtMoney(financialPnl.netIncome)}</span>
                    </div>
                  </div>
                  <div className="text-xs mt-3" style={{ color: C.muted }}>
                    Montos sin ITBIS. Las compras de productos de inventario ({fmtMoney(financialPnl.inventoryPurchases)} en el período) no se restan como gasto: entran al inventario y pasan a costo de venta cuando se venden. No incluye mano de obra ni materiales consumidos en órdenes (eso se ve por orden en Departamento Técnico).{companyHasModule("nomina") && " La nómina entra solo cuando está cerrada, por su fecha de pago; si antes registrabas los sueldos en «Otros gastos», no los vuelvas a registrar ahí."}
                    {financialPnl.linesWithoutCost > 0 && <div className="mt-1" style={{ color: C.orange }}>{financialPnl.linesWithoutCost} renglón(es) vendido(s) antes del costo promedio no tienen costo guardado: el costo de venta de este período sale menor de lo real.</div>}
                  </div>
                </div>

                <div className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <div className="text-sm font-semibold mb-3">Flujo de caja (efectivo real)</div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span style={{ color: C.muted }}>Entradas (cobros de facturas)</span><span className="font-mono" style={{ color: C.green }}>{fmtMoney(financialCashFlow.cashIn)}</span></div>
                    <div className="flex justify-between pt-2"><span style={{ color: C.muted }}>Salidas — pagos a proveedores</span><span className="font-mono" style={{ color: C.red }}>-{fmtMoney(financialCashFlow.cashOutSuppliers)}</span></div>
                    <div className="flex justify-between"><span style={{ color: C.muted }}>Salidas — otros gastos</span><span className="font-mono" style={{ color: C.red }}>-{fmtMoney(financialCashFlow.cashOutExpenses)}</span></div>
                    <div className="flex justify-between font-bold text-base pt-2" style={{ borderTop: `1px solid ${C.border}`, color: financialCashFlow.net >= 0 ? C.green : C.red }}>
                      <span>Flujo neto</span><span className="font-mono">{fmtMoney(financialCashFlow.net)}</span>
                    </div>
                  </div>
                  <div className="text-xs mt-3" style={{ color: C.muted }}>Basado en pagos realmente cobrados/pagados en el rango, sin importar cuándo se emitió la factura o compra.</div>
                </div>
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Ingresos vs. gastos — últimos 6 meses</div>
              <div className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={financialMonthlyChart} margin={{ left: -20 }}>
                    <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
                    <YAxis tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
                    <Tooltip contentStyle={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }} cursor={{ fill: C.panelAlt }} formatter={(v) => fmtMoney(v)} />
                    <Legend wrapperStyle={{ fontSize: 12, color: C.muted }} />
                    <Bar dataKey="Ingresos" fill={C.green} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Gastos" fill={C.red} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
  );
}

// Pantalla: bankReconciliation
export function VistaBankReconciliation({ bankAccountFilter, bankImportMsg, bankMatchCandidate, bankTransactions, canDelete, canEdit, companyBankAccounts, deleteBankTransaction, financialDateFrom, financialDateTo, importBankStatement, importingBankStatement, loadingFinancial, reconcileTransaction, setBankAccountFilter, setFinancialDateFrom, setFinancialDateTo, unreconcileTransaction }) {
  return (
          <div>
              {(() => {
                const inRange = (d) => d >= financialDateFrom && d <= financialDateTo;
                const selectedAccount = companyBankAccounts.find((a) => a.id === bankAccountFilter) || null;
                const txInRange = bankTransactions.filter((t) => inRange(t.transaction_date) && (!bankAccountFilter || t.bank_account_id === bankAccountFilter));
                const fmtTx = (amt, t) => {
                  const cur = companyBankAccounts.find((a) => a.id === t.bank_account_id)?.currency || "DOP";
                  return cur === "USD" ? `US$ ${Number(amt).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : fmtMoney(amt);
                };
                const reconciled = txInRange.filter((t) => t.is_reconciled);
                const pending = txInRange.filter((t) => !t.is_reconciled);
                const totalBank = txInRange.reduce((s, t) => s + Number(t.amount), 0);
                return (
                  <>
                    <div className="flex flex-wrap items-end gap-3 mb-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Desde</div>
                        <input type="date" value={financialDateFrom} onChange={(e) => setFinancialDateFrom(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Hasta</div>
                        <input type="date" value={financialDateTo} onChange={(e) => setFinancialDateTo(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                      </div>
                      {companyBankAccounts.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Cuenta bancaria</div>
                          <select value={bankAccountFilter} onChange={(e) => setBankAccountFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                            <option value="">Todas las cuentas</option>
                            {companyBankAccounts.map((a) => <option key={a.id} value={a.id}>{a.bank_name} — {a.account_number}{a.currency === "USD" ? " (US$)" : ""}</option>)}
                          </select>
                        </div>
                      )}
                      {canEdit("bankReconciliation") && (
                        <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer" style={{ border: `1px solid ${C.border}`, color: C.amber }}>
                          <Upload size={14} /> {importingBankStatement ? "Importando..." : "Importar estado de cuenta"}
                          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" disabled={importingBankStatement} onChange={(e) => { if (e.target.files?.[0]) importBankStatement(e.target.files[0]); e.target.value = ""; }} />
                        </label>
                      )}
                      {loadingFinancial && <div className="text-sm" style={{ color: C.muted }}>Buscando posibles coincidencias...</div>}
                    </div>
                    <div className="text-xs mb-4" style={{ color: C.muted }}>
                      Elige la cuenta bancaria y sube su estado de cuenta exportado del banco (CSV o Excel) con columnas de Fecha, Descripción y Monto (o Crédito/Débito por separado). El sistema busca automáticamente un cobro, pago o gasto registrado con el mismo monto y una fecha cercana. Si subes el mismo archivo (o rangos de fechas superpuestos) dos veces, los movimientos repetidos se detectan y no se duplican.
                    </div>
                    {bankImportMsg && (
                      <div className="text-xs mb-4" style={{ color: C.green }}>{bankImportMsg}</div>
                    )}

                    <div className="flex gap-3 flex-wrap mb-6">
                      <KpiCard label="Movimientos del banco" value={txInRange.length} accent={C.blue} sub={selectedAccount?.currency === "USD" ? `US$ ${totalBank.toFixed(2)}` : (bankAccountFilter || !companyBankAccounts.some((a) => a.currency === "USD") ? fmtMoney(totalBank) : "Varias monedas — elige una cuenta")} />
                      <KpiCard label="Conciliados" value={reconciled.length} accent={C.green} sub="Ya vinculados al sistema" />
                      <KpiCard label="Pendientes" value={pending.length} accent={C.amber} sub="Necesitan revisión" />
                    </div>

                    <div className="overflow-x-auto" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                        <div className="col-span-2">Fecha</div>
                        <div className="col-span-3">Descripción</div>
                        <div className="col-span-2 text-right">Monto</div>
                        <div className="col-span-3">Coincidencia</div>
                        <div className="col-span-2 text-right">Acciones</div>
                      </div>
                      {txInRange.map((tx) => {
                        const candidate = !tx.is_reconciled ? bankMatchCandidate(tx) : null;
                        return (
                          <div key={tx.id} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                            <div className="col-span-2" style={{ color: C.muted }}>{fmtDate(tx.transaction_date)}</div>
                            <div className="col-span-3 truncate">{tx.description || "—"}</div>
                            <div className="col-span-2 text-right font-mono" style={{ color: tx.amount >= 0 ? C.green : C.red }}>{fmtTx(tx.amount, tx)}</div>
                            <div className="col-span-3">
                              {tx.is_reconciled ? (
                                <Pill label="Conciliado" color={C.green} />
                              ) : candidate ? (
                                <div className="text-xs" style={{ color: C.amber }}>{candidate.label}</div>
                              ) : (
                                <div className="text-xs" style={{ color: C.muted }}>Sin coincidencia</div>
                              )}
                            </div>
                            <div className="col-span-2 flex items-center justify-end gap-2">
                              {canEdit("bankReconciliation") && !tx.is_reconciled && candidate && (
                                <button onClick={() => reconcileTransaction(tx, candidate.type, candidate.id)} className="text-xs px-2 py-1.5 font-semibold" style={{ background: C.green, color: "#0B1F13" }}>
                                  Conciliar
                                </button>
                              )}
                              {canEdit("bankReconciliation") && !tx.is_reconciled && !candidate && (
                                <button onClick={() => reconcileTransaction(tx, "manual", null)} className="text-xs px-2 py-1.5" style={{ border: `1px solid ${C.border}`, color: C.text }}>
                                  Marcar conciliado
                                </button>
                              )}
                              {canEdit("bankReconciliation") && tx.is_reconciled && (
                                <button onClick={() => unreconcileTransaction(tx)} className="text-xs px-2 py-1.5" style={{ border: `1px solid ${C.border}`, color: C.muted }}>
                                  Deshacer
                                </button>
                              )}
                              {canDelete("bankReconciliation") && <button onClick={() => deleteBankTransaction(tx.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                            </div>
                          </div>
                        );
                      })}
                      {txInRange.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>No hay movimientos importados en este rango. Sube un estado de cuenta para comenzar.</div>}
                    </div>
                  </>
                );
              })()}
            </div>
  );
}

// Pantalla: ncf
export function VistaNcf({ canDelete, canEdit, deleteNcfSequence, ncfSequences, setEditingNcf, setShowAddNcf, toggleNcfActive }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{ncfSequences.length} secuencias configuradas</div>
                <button onClick={() => setShowAddNcf(true)} disabled={!canEdit("ncf")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Agregar secuencia
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {ncfSequences.map((s) => {
                  const remaining = s.range_end - s.next_number + 1;
                  const total = s.range_end - s.range_start + 1;
                  // Avisos: pocos números (≤ 10% del rango o ≤ 20) o vencimiento en ≤ 30 días
                  const lowStock = s.active && remaining > 0 && (remaining <= 20 || remaining <= total * 0.1);
                  const daysToExpire = s.expiration_date ? Math.floor((new Date(`${s.expiration_date}T00:00:00`) - new Date(`${todayStrRD()}T00:00:00`)) / 86400000) : null;
                  const expired = daysToExpire !== null && daysToExpire < 0;
                  const expiringSoon = daysToExpire !== null && daysToExpire >= 0 && daysToExpire <= 30;
                  const exhausted = remaining <= 0;
                  const alertColor = (expired || exhausted) ? C.red : (lowStock || expiringSoon) ? C.orange : null;
                  return (
                    <div key={s.id} className="p-4" style={{ background: C.panel, border: `1px solid ${alertColor ? alertColor + "90" : C.border}` }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="font-mono font-semibold">{s.ncf_type}</div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => toggleNcfActive(s)}>
                            <Pill label={s.active ? "Activa" : "Inactiva"} color={s.active ? C.green : C.muted} />
                          </button>
                          {canEdit("ncf") && <button onClick={() => setEditingNcf(s)} style={iconBtnStyle}><Pencil size={14} /></button>}
                          {canDelete("ncf") && <button onClick={() => deleteNcfSequence(s.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                        </div>
                      </div>
                      <div className="text-xs font-mono mb-2" style={{ color: C.muted }}>{s.prefix ? `${s.prefix} · ` : ""}{s.range_start} – {s.range_end}{s.expiration_date ? ` · vence ${fmtDate(s.expiration_date)}` : ""}</div>
                      {(expired || exhausted || lowStock || expiringSoon) && (
                        <div className="text-xs mb-2" style={{ color: alertColor }}>
                          {exhausted ? "Sin números disponibles — solicita una nueva secuencia a la DGII." : expired ? "Vencida — ya no se puede usar para facturar." : [lowStock ? `Quedan pocos números (${remaining})` : null, expiringSoon ? `vence en ${daysToExpire} día${daysToExpire !== 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") + " — solicita la próxima a tiempo."}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                        <div className="text-xs" style={{ color: C.muted }}>Próximo: <span className="font-mono" style={{ color: C.text }}>{s.next_number}</span></div>
                        <div className="text-xs font-mono" style={{ color: remaining <= 10 ? C.red : C.muted }}>{Math.max(0, remaining)} restantes</div>
                      </div>
                    </div>
                  );
                })}
                {ncfSequences.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>Todavía no has configurado ninguna secuencia NCF.</div>}
              </div>
            </div>
  );
}

// Pantalla: dgiiCatalog
export function VistaDgiiCatalog({ canEdit, dgiiCatalogCount, dgiiCatalogUpdatedAt, dgiiImportProgress, dgiiImporting, importDgiiCatalogFile }) {
  return (
          <div className="max-w-2xl">
              <div className="text-sm mb-1" style={{ color: C.text }}>Catálogo de RNC de la DGII</div>
              <div className="text-xs mb-4" style={{ color: C.muted }}>
                La DGII no ofrece una consulta automática en tiempo real. Este catálogo se llena importando el listado oficial que la DGII publica periódicamente — una vez importado, el sistema lo usa para sugerir el nombre del cliente cuando escribes un RNC que todavía no tienes registrado.
              </div>

              <div className="p-4 mb-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="flex justify-between text-sm mb-1">
                  <span style={{ color: C.muted }}>RNC cargados actualmente</span>
                  <span className="font-mono font-semibold">{dgiiCatalogCount === null ? "…" : dgiiCatalogCount.toLocaleString("es-DO")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: C.muted }}>Última importación</span>
                  <span>{dgiiCatalogUpdatedAt ? fmtDate(dgiiCatalogUpdatedAt.slice(0, 10)) : "Nunca"}</span>
                </div>
              </div>

              <div className="p-4" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Cómo actualizar el catálogo</div>
                <ol className="text-sm space-y-1 mb-4 list-decimal list-inside" style={{ color: C.text }}>
                  <li>Descarga el archivo oficial: <a href="https://dgii.gov.do/app/WebApps/Consultas/RNC/DGII_RNC.zip" target="_blank" rel="noreferrer" style={{ color: C.amber }}>DGII_RNC.zip</a></li>
                  <li>Descomprímelo en tu computadora (obtendrás un archivo <span className="font-mono text-xs">DGII_RNC.TXT</span>)</li>
                  <li>Selecciona ese archivo aquí abajo — la importación puede tardar varios minutos porque trae cientos de miles de registros. No cierres esta pantalla mientras corre.</li>
                </ol>
                <label className="flex items-center gap-2 px-4 py-2 text-sm font-semibold cursor-pointer w-fit" style={{ background: dgiiImporting ? C.panel : C.amber, color: dgiiImporting ? C.muted : "#1A1500" }}>
                  <Upload size={14} /> {dgiiImporting ? "Importando..." : "Seleccionar archivo DGII_RNC.TXT"}
                  <input type="file" accept=".txt" className="hidden" disabled={dgiiImporting || !canEdit("dgiiCatalog")} onChange={(e) => { const f = e.target.files?.[0]; if (f) importDgiiCatalogFile(f); e.target.value = ""; }} />
                </label>
                {dgiiImportProgress && (
                  <div className="mt-3">
                    <div className="text-xs mb-1" style={{ color: C.muted }}>{dgiiImportProgress.phase} {dgiiImportProgress.total > 0 ? `(${dgiiImportProgress.done.toLocaleString("es-DO")} de ${dgiiImportProgress.total.toLocaleString("es-DO")})` : ""}</div>
                    <div className="h-2" style={{ background: C.panel }}>
                      <div className="h-2" style={{ width: dgiiImportProgress.total > 0 ? `${(dgiiImportProgress.done / dgiiImportProgress.total) * 100}%` : "5%", background: C.amber }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
  );
}
