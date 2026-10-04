// Pantallas de Ventas y Cuentas por Cobrar.
// Cada componente es el JSX de una pantalla del Dashboard, copiado tal cual. Todo lo que usa
// (estados, funciones y cálculos del Dashboard) le llega por props con el mismo nombre.
// Se carga solo cuando se abre la pantalla (ver lazy.jsx).
import React from "react";
import { supabase } from "../supabaseClient";
import { C, PAYMENT_STATUS_CFG, Pill, QUOTE_STATUS_CFG, SALES_ORDER_STATUS_CFG, cardDetailLine, fmtDate, fmtMoney, iconBtnStyle, invoiceReminderText, listHtml, mailtoLink, printDocument, waLink } from "./base.jsx";
import { CardAcquirersPanel, CashCloseModal, CashOpenModal } from "./lazy.jsx";
import { FileText, Link2, Mail, MessageCircle, Pencil, Plus, Search, Trash2, Wallet } from "lucide-react";

// Pantalla: clients
export function VistaClients({ openClientPortal, canDelete, canEdit, clientSearch, clients, companyName, deleteClient, filteredClients, selectedClients, setClientSearch, setEditingClient, setSelectedClients, setShowAddClient }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>
                  {filteredClients.length}{filteredClients.length !== clients.length ? ` de ${clients.length}` : ""} clientes{selectedClients.size > 0 ? ` · ${selectedClients.size} seleccionados` : ""}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const list = selectedClients.size > 0 ? filteredClients.filter((c) => selectedClients.has(c.id)) : filteredClients;
                      printDocument("Clientes", listHtml("Listado de clientes", companyName, ["Cliente", "RNC/Cédula", "Teléfono", "Correo", "Dirección"], list.map((c) => [c.name, c.rnc_cedula, c.phone, c.email, c.address])));
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text }}
                  >
                    <FileText size={14} /> {selectedClients.size > 0 ? `Imprimir selección (${selectedClients.size})` : "Imprimir lista"}
                  </button>
                  <button onClick={() => setShowAddClient(true)} disabled={!canEdit("clients")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> Agregar cliente
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 mb-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <Search size={14} color={C.muted} />
                <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Buscar por nombre, RNC, teléfono o correo..." className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
              </div>
              {filteredClients.length > 0 && (
                <label className="flex items-center gap-2 text-xs mb-3 cursor-pointer" style={{ color: C.muted }}>
                  <input type="checkbox" checked={selectedClients.size === filteredClients.length} onChange={() => setSelectedClients(selectedClients.size === filteredClients.length ? new Set() : new Set(filteredClients.map((c) => c.id)))} />
                  Seleccionar todos los que se ven ({filteredClients.length})
                </label>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredClients.map((c) => (
                  <div key={c.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <input type="checkbox" checked={selectedClients.has(c.id)} onChange={() => setSelectedClients((prev) => { const next = new Set(prev); next.has(c.id) ? next.delete(c.id) : next.add(c.id); return next; })} />
                        <div className="font-semibold truncate">{c.name}</div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {openClientPortal && <button onClick={() => openClientPortal(c)} title="Portal del cliente" style={iconBtnStyle}><Link2 size={14} /></button>}
                        {canEdit("clients") && <button onClick={() => setEditingClient(c)} style={iconBtnStyle}><Pencil size={14} /></button>}
                        {canDelete("clients") && <button onClick={() => deleteClient(c.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                      </div>
                    </div>
                    <div className="text-xs mt-2 space-y-1" style={{ color: C.muted }}>
                      <div>RNC/Cédula: <span style={{ color: C.text }}>{c.rnc_cedula || "—"}</span></div>
                      <div>Teléfono: <span style={{ color: C.text }}>{c.phone || "—"}</span></div>
                      <div>Correo: <span style={{ color: C.text }}>{c.email || "—"}</span></div>
                      <div>Dirección: <span style={{ color: C.text }}>{c.address || "—"}</span></div>
                    </div>
                  </div>
                ))}
                {filteredClients.length === 0 && (
                  <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>
                    {clients.length === 0 ? "Todavía no hay clientes registrados." : "Ningún cliente coincide con la búsqueda."}
                  </div>
                )}
              </div>
            </div>
  );
}

// Pantalla: salesReports
export function VistaSalesReports({ salesReportData, salesReportDateFrom, salesReportDateTo, setSalesReportDateFrom, setSalesReportDateTo }) {
  return (
          <div>
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <div className="text-xs mb-1" style={{ color: C.muted }}>Desde</div>
                  <input type="date" value={salesReportDateFrom} onChange={(e) => setSalesReportDateFrom(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: C.muted }}>Hasta</div>
                  <input type="date" value={salesReportDateTo} onChange={(e) => setSalesReportDateTo(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mb-6">
                <div className="p-4 flex-1 min-w-[180px]" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>Total facturado</div>
                  <div className="text-xl font-bold font-mono" style={{ color: C.text }}>{fmtMoney(salesReportData.totalInvoiced)}</div>
                  <div className="text-xs mt-1" style={{ color: C.muted }}>{salesReportData.invoicesCount} factura{salesReportData.invoicesCount !== 1 ? "s" : ""}</div>
                </div>
                <div className="p-4 flex-1 min-w-[180px]" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>Cobrado / Pendiente</div>
                  <div className="text-xl font-bold font-mono" style={{ color: C.green }}>{fmtMoney(salesReportData.totalCollected)}</div>
                  <div className="text-xs mt-1 font-mono" style={{ color: salesReportData.totalPending > 0 ? C.amber : C.muted }}>Pendiente: {fmtMoney(salesReportData.totalPending)}</div>
                </div>
                <div className="p-4 flex-1 min-w-[180px]" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>Total cotizado</div>
                  <div className="text-xl font-bold font-mono" style={{ color: C.text }}>{fmtMoney(salesReportData.totalQuoted)}</div>
                  <div className="text-xs mt-1" style={{ color: C.muted }}>{salesReportData.quotesCount} cotización{salesReportData.quotesCount !== 1 ? "es" : ""}</div>
                </div>
                <div className="p-4 flex-1 min-w-[180px]" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>Tasa de conversión</div>
                  <div className="text-xl font-bold font-mono" style={{ color: C.blue }}>{salesReportData.conversionRate === null ? "—" : `${salesReportData.conversionRate.toFixed(0)}%`}</div>
                  <div className="text-xs mt-1" style={{ color: C.muted }}>De cotizaciones ya decididas</div>
                </div>
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Facturación mensual — últimos 6 meses</div>
              <div className="p-4 mb-6 space-y-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                {salesReportData.months.map((m) => (
                  <div key={m.label} className="flex items-center gap-3">
                    <div className="text-xs w-14 flex-shrink-0" style={{ color: C.muted }}>{m.label}</div>
                    <div className="flex-1 h-4" style={{ background: C.panelAlt }}>
                      <div className="h-4" style={{ width: `${(m.total / salesReportData.maxMonthTotal) * 100}%`, background: C.amber }} />
                    </div>
                    <div className="text-xs font-mono w-24 text-right flex-shrink-0" style={{ color: C.text }}>{fmtMoney(m.total)}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Top 5 clientes por facturación (en el rango)</div>
                  <div style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    {salesReportData.topClients.length === 0 && <div className="text-sm text-center py-4" style={{ color: C.muted }}>Sin facturación en este rango.</div>}
                    {salesReportData.topClients.map((c, idx) => (
                      <div key={c.clientId} className="flex items-center justify-between px-3 py-2 text-sm" style={{ borderBottom: idx < salesReportData.topClients.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <span className="truncate">{c.name}</span>
                        <span className="font-mono flex-shrink-0" style={{ color: C.muted }}>{fmtMoney(c.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Cotizaciones por estado (en el rango)</div>
                  <div style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    {Object.keys(salesReportData.quoteStatusCounts).length === 0 && <div className="text-sm text-center py-4" style={{ color: C.muted }}>Sin cotizaciones en este rango.</div>}
                    {Object.entries(salesReportData.quoteStatusCounts).map(([status, count], idx, arr) => {
                      const cfg = QUOTE_STATUS_CFG[status] || QUOTE_STATUS_CFG.pendiente;
                      return (
                        <div key={status} className="flex items-center justify-between px-3 py-2 text-sm" style={{ borderBottom: idx < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                          <Pill label={cfg.label} color={cfg.color} />
                          <span className="font-mono" style={{ color: C.muted }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
  );
}

// Pantalla: receivables
export function VistaReceivables({ clients, companyName, openInvoiceDetail, visibleInvoices }) {
  return (
          <div>
              {(() => {
                const pending = visibleInvoices.filter((inv) => inv.status !== "anulada" && (Number(inv.total) - Number(inv.amount_paid || 0) - Number(inv.credit_applied || 0)) > 0.009)
                  .map((inv) => ({ ...inv, balance: Number(inv.total) - Number(inv.amount_paid || 0) - Number(inv.credit_applied || 0), days: Math.max(0, Math.floor((Date.now() - new Date(inv.invoice_date).getTime()) / 86400000)) }))
                  .sort((a, b) => b.days - a.days);
                const totalPending = pending.reduce((s, inv) => s + inv.balance, 0);
                const bucketOf = (days) => (days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+");
                const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
                pending.forEach((inv) => { buckets[bucketOf(inv.days)] += inv.balance; });
                return (
                  <>
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      {Object.entries(buckets).map(([label, amt]) => (
                        <div key={label} className="p-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                          <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>{label} días</div>
                          <div className="text-lg font-mono" style={{ color: C.text }}>{fmtMoney(amt)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mb-3">
                      <div className="text-sm" style={{ color: C.muted }}>{pending.length} factura{pending.length !== 1 ? "s" : ""} pendiente{pending.length !== 1 ? "s" : ""} de cobro</div>
                      <div className="text-lg font-mono font-bold" style={{ color: C.red }}>{fmtMoney(totalPending)}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {pending.map((inv) => {
                        const cli = clients.find((c) => c.id === inv.client_id);
                        const reminderText = invoiceReminderText(companyName, cli?.name || "Cliente", inv, inv.balance, inv.days);
                        return (
                          <div key={inv.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="min-w-0">
                                <div className="font-semibold truncate">{cli?.name || "—"}</div>
                                <div className="text-xs truncate font-mono" style={{ color: C.muted }}>{inv.invoice_number || inv.ncf}</div>
                              </div>
                              <div className="text-xs flex-shrink-0" style={{ color: inv.days > 60 ? C.red : C.muted }}>{inv.days} días</div>
                            </div>
                            <div className="flex items-center justify-between pt-2 mt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                              <span style={{ color: C.muted }}>{fmtDate(inv.invoice_date)}</span>
                              <span className="font-mono font-semibold" style={{ color: C.red }}>{fmtMoney(inv.balance)}</span>
                            </div>
                            <div className="flex items-center justify-end gap-3 mt-2">
                              {cli?.phone && (
                                <a href={waLink(cli.phone, reminderText)} target="_blank" rel="noreferrer" title="Recordar por WhatsApp" style={{ color: C.green }}><MessageCircle size={15} /></a>
                              )}
                              {cli?.email && (
                                <a href={mailtoLink(cli.email, `Recordatorio de pago — Factura ${inv.ncf || ""}`, reminderText)} title="Recordar por correo (abre tu correo)" style={{ color: C.amber }}><Mail size={15} /></a>
                              )}
                              {cli?.email && (
                                <button
                                  onClick={() => supabase.functions.invoke("send-client-email", { body: { to: cli.email, subject: `Recordatorio de pago — Factura ${inv.ncf || ""}`, text: reminderText } })}
                                  title="Enviar recordatorio automático por correo (sin abrir tu correo)"
                                  className="text-xs px-2 py-1" style={{ border: `1px solid ${C.border}`, color: C.blue }}
                                >
                                  Enviar auto
                                </button>
                              )}
                              <button onClick={() => openInvoiceDetail(inv)} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}><FileText size={13} /> Detalle</button>
                            </div>
                          </div>
                        );
                      })}
                      {pending.length === 0 && (
                        <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>No hay cuentas por cobrar pendientes.</div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
  );
}

// Pantalla: quotes
export function VistaQuotes({ canEdit, clients, companyName, filteredQuotes, openQuoteDetail, quoteSearch, quoteStatusFilter, quotes, selectedQuotes, setQuoteSearch, setQuoteStatusFilter, setSelectedQuotes, setShowAddQuote, visibleQuotes }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>
                  {filteredQuotes.length}{filteredQuotes.length !== visibleQuotes.length ? ` de ${visibleQuotes.length}` : ""} cotizaciones{selectedQuotes.size > 0 ? ` · ${selectedQuotes.size} seleccionadas` : ""}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const list = selectedQuotes.size > 0 ? filteredQuotes.filter((q) => selectedQuotes.has(q.id)) : filteredQuotes;
                      printDocument("Cotizaciones", listHtml("Listado de cotizaciones", companyName, ["No.", "Cliente", "Fecha", "Total", "Estado"], list.map((q) => [q.quote_number, clients.find((c) => c.id === q.client_id)?.name || "—", fmtDate(q.quote_date), fmtMoney(q.total), (QUOTE_STATUS_CFG[q.status] || QUOTE_STATUS_CFG.pendiente)?.label])));
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text }}
                  >
                    <FileText size={14} /> {selectedQuotes.size > 0 ? `Imprimir selección (${selectedQuotes.size})` : "Imprimir lista"}
                  </button>
                  <button onClick={() => setShowAddQuote(true)} disabled={clients.length === 0 || !canEdit("quotes")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> Nueva cotización
                  </button>
                </div>
              </div>
              {clients.length === 0 && <div className="text-sm mb-3" style={{ color: C.muted }}>Agrega al menos un cliente antes de cotizar.</div>}
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-2 px-3 py-2 flex-1 min-w-[220px]" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <Search size={14} color={C.muted} />
                  <input value={quoteSearch} onChange={(e) => setQuoteSearch(e.target.value)} placeholder="Buscar por cliente o número..." className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
                </div>
                <select value={quoteStatusFilter} onChange={(e) => setQuoteStatusFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los estados</option>
                  {Object.entries(QUOTE_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              {filteredQuotes.length > 0 && (
                <label className="flex items-center gap-2 text-xs mb-3 cursor-pointer" style={{ color: C.muted }}>
                  <input type="checkbox" checked={selectedQuotes.size === filteredQuotes.length} onChange={() => setSelectedQuotes(selectedQuotes.size === filteredQuotes.length ? new Set() : new Set(filteredQuotes.map((q) => q.id)))} />
                  Seleccionar todas las que se ven ({filteredQuotes.length})
                </label>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredQuotes.map((q) => {
                  const s = QUOTE_STATUS_CFG[q.status] || QUOTE_STATUS_CFG.pendiente;
                  const cl = clients.find((c) => c.id === q.client_id);
                  return (
                    <div key={q.id} onClick={() => openQuoteDetail(q)} className="p-4 cursor-pointer" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <input type="checkbox" checked={selectedQuotes.has(q.id)} onClick={(e) => e.stopPropagation()} onChange={() => setSelectedQuotes((prev) => { const next = new Set(prev); next.has(q.id) ? next.delete(q.id) : next.add(q.id); return next; })} />
                          <div className="min-w-0">
                            <div className="font-mono text-xs" style={{ color: C.muted }}>{q.quote_number}</div>
                            {q.title && <div className="text-sm truncate" style={{ color: C.text }}>{q.title}</div>}
                          </div>
                        </div>
                        <Pill label={s.label} color={s.color} />
                      </div>
                      <div className="text-sm truncate">{cl?.name || "—"}</div>
                      <div className="text-xs mb-3" style={{ color: C.muted }}>{cl?.rnc_cedula || ""}</div>
                      <div className="flex items-center justify-between pt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted }}>{fmtDate(q.quote_date)}</span>
                        <span className="font-mono font-semibold">{fmtMoney(q.total)}</span>
                      </div>
                    </div>
                  );
                })}
                {filteredQuotes.length === 0 && (
                  <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>
                    {quotes.length === 0 ? "Todavía no hay cotizaciones registradas." : "Ninguna cotización coincide con la búsqueda."}
                  </div>
                )}
              </div>
            </div>
  );
}

// Pantalla: salesOrders
export function VistaSalesOrders({ canDelete, clients, deleteSalesOrder, deleteSalesOrdersBulk, openSalesOrderDetail, salesOrders, selectedSalesOrders, setSelectedSalesOrders }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{salesOrders.length} órdenes de venta{selectedSalesOrders.size > 0 ? ` · ${selectedSalesOrders.size} seleccionadas` : ""}</div>
                {selectedSalesOrders.size > 0 && canDelete("salesOrders") && (
                  <button onClick={() => deleteSalesOrdersBulk([...selectedSalesOrders])} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.red, color: "#2A0A08" }}>
                    <Trash2 size={14} /> Eliminar seleccionadas ({selectedSalesOrders.size})
                  </button>
                )}
              </div>
              <div className="text-xs mb-3" style={{ color: C.muted }}>
                Las órdenes de venta se generan desde una cotización aprobada (botón "Pasar a Orden de Venta") — representan un trabajo o venta ya en ejecución, antes de facturarse. Solo las canceladas se pueden marcar y borrar.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {salesOrders.map((o) => {
                  const s = SALES_ORDER_STATUS_CFG[o.status] || SALES_ORDER_STATUS_CFG.en_proceso;
                  const isCancelled = o.status === "cancelada";
                  const cl = clients.find((c) => c.id === o.client_id);
                  return (
                    <div key={o.id} onClick={() => openSalesOrderDetail(o)} className="p-4 cursor-pointer" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            disabled={!isCancelled}
                            checked={selectedSalesOrders.has(o.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => setSelectedSalesOrders((prev) => { const next = new Set(prev); next.has(o.id) ? next.delete(o.id) : next.add(o.id); return next; })}
                            style={{ opacity: isCancelled ? 1 : 0.3 }}
                          />
                          <div className="min-w-0">
                            <div className="font-mono text-xs" style={{ color: C.muted }}>{o.order_number}</div>
                            {o.title && <div className="text-sm truncate" style={{ color: C.text }}>{o.title}</div>}
                          </div>
                        </div>
                        <Pill label={s.label} color={s.color} />
                      </div>
                      <div className="text-sm truncate">{cl?.name || "—"}</div>
                      <div className="text-xs mb-3" style={{ color: C.muted }}>{cl?.rnc_cedula || ""}</div>
                      <div className="flex items-center justify-between pt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted }}>{fmtDate(o.order_date)}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{fmtMoney(o.total)}</span>
                          {isCancelled && canDelete("salesOrders") && (
                            <button onClick={(e) => { e.stopPropagation(); deleteSalesOrder(o); }} style={iconBtnStyle}><Trash2 size={14} /></button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {salesOrders.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>Todavía no hay órdenes de venta generadas. Aprueba una cotización y dale "Pasar a Orden de Venta".</div>}
              </div>
            </div>
  );
}

// Pantalla: invoices
export function VistaInvoices({ canEdit, clients, filteredInvoices, invoicePaymentFilter, invoiceSearch, invoiceStatusFilter, invoices, isAdmin, ncfSequences, openInvoiceDetail, setInvoicePaymentFilter, setInvoiceSearch, setInvoiceStatusFilter, setShowAddInvoice, setShowStatement, visibleInvoices }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>{filteredInvoices.length}{filteredInvoices.length !== visibleInvoices.length ? ` de ${visibleInvoices.length}` : ""} facturas emitidas</div>
                <div className="flex gap-2">
                  <button onClick={() => setShowStatement(true)} disabled={clients.length === 0} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.text }}>
                    <FileText size={14} /> Estado de cuenta
                  </button>
                  <button onClick={() => setShowAddInvoice(true)} disabled={clients.length === 0 || ncfSequences.length === 0 || !canEdit("invoices")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> Nueva factura
                  </button>
                </div>
              </div>
              {clients.length === 0 && <div className="text-sm mb-3" style={{ color: C.muted }}>Agrega al menos un cliente antes de facturar.</div>}
              {ncfSequences.length === 0 && isAdmin && <div className="text-sm mb-3" style={{ color: C.muted }}>Configura una secuencia NCF antes de facturar.</div>}
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-2 px-3 py-2 flex-1 min-w-[220px]" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <Search size={14} color={C.muted} />
                  <input value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} placeholder="Buscar por cliente, N° factura o NCF..." className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
                </div>
                <select value={invoiceStatusFilter} onChange={(e) => setInvoiceStatusFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los estados</option>
                  <option value="emitida">Emitida</option>
                  <option value="anulada">Anulada</option>
                </select>
                <select value={invoicePaymentFilter} onChange={(e) => setInvoicePaymentFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los estados de cobro</option>
                  {Object.entries(PAYMENT_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredInvoices.map((inv) => {
                  const payCfg = PAYMENT_STATUS_CFG[inv.payment_status] || PAYMENT_STATUS_CFG.pendiente;
                  const cl = clients.find((c) => c.id === inv.client_id);
                  return (
                    <div key={inv.id} onClick={() => openInvoiceDetail(inv)} className="p-4 cursor-pointer" style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${inv.status === "anulada" ? C.red : "transparent"}` }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="font-mono text-xs">{inv.invoice_number || inv.ncf}</div>
                          <div className="text-xs truncate" style={{ color: C.muted }}>NCF: {inv.ncf}</div>
                          {inv.title && <div className="text-sm truncate" style={{ color: C.text }}>{inv.title}</div>}
                        </div>
                        <Pill label={inv.status === "anulada" ? "Anulada" : payCfg.label} color={inv.status === "anulada" ? C.red : payCfg.color} />
                      </div>
                      <div className="text-sm truncate">{cl?.name || "—"}</div>
                      <div className="text-xs mb-3" style={{ color: C.muted }}>{cl?.rnc_cedula || ""}</div>
                      <div className="flex items-center justify-between pt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted }}>{fmtDate(inv.invoice_date)}</span>
                        <span className="font-mono font-semibold">{fmtMoney(inv.total)}</span>
                      </div>
                    </div>
                  );
                })}
                {filteredInvoices.length === 0 && (
                  <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>
                    {invoices.length === 0 ? "Todavía no hay facturas emitidas." : "Ninguna factura coincide con la búsqueda."}
                  </div>
                )}
              </div>
            </div>
  );
}

// Pantalla: caja
export function VistaCaja({ branches, cajaBranch, canEdit, cardAcquirers, cashSessions, closeCashSession, company, invoices, isAdmin, isVendedor, openCashSession, profile, saveCardAcquirer, saving, sessionPayments, setCajaBranch, setShowAcquirers, setShowCloseCaja, setShowOpenCaja, showAcquirers, showCloseCaja, showOpenCaja }) {
  return (
          <div>
              {(() => {
                const activeBranchId = isVendedor ? profile.branch_id : (cajaBranch || branches[0]?.id || "");
                const activeBranchName = branches.find((b) => b.id === activeBranchId)?.name || "—";
                const openSession = cashSessions.find((s) => s.branch_id === activeBranchId && s.status === "abierta");
                const closedSessions = cashSessions.filter((s) => s.branch_id === activeBranchId && s.status === "cerrada").slice(0, 15);

                // Misma regla que close_cash_session: efectivo en RD$ y en US$ por separado; tarjeta y
                // transferencia al valor real del día (monto aplicado + diferencia cambiaria).
                const sumPays = (fn, val) => sessionPayments.filter(fn).reduce((acc, p) => acc + val(p), 0);
                const realRd = (p) => Number(p.amount || 0) + Number(p.fx_difference || 0);
                const cashSoFar = sumPays((p) => p.method === "Efectivo" && (p.currency || "DOP") === "DOP", (p) => Number(p.amount || 0));
                const cashUsdSoFar = sumPays((p) => p.method === "Efectivo" && p.currency === "USD", (p) => Number(p.foreign_amount || 0));
                const cardSoFar = sumPays((p) => p.method === "Tarjeta", realRd);
                const transferSoFar = sumPays((p) => p.method === "Transferencia" || p.method === "Otro", realRd);
                const expected = {
                  cash: Number(openSession?.opening_amount || 0) + cashSoFar,
                  cashUsd: Number(openSession?.opening_amount_usd || 0) + cashUsdSoFar,
                  card: cardSoFar,
                  transfer: transferSoFar,
                };

                if (!openSession && !profile.branch_id && isVendedor) {
                  return <div className="text-sm" style={{ color: C.red }}>Tu usuario no tiene sucursal asignada — pídele a un admin que te la configure para poder abrir caja.</div>;
                }

                return (
                  <>
                    {!isVendedor && (
                      <div className="mb-4">
                        <select value={activeBranchId} onChange={(e) => setCajaBranch(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                    )}

                    {!openSession ? (
                      <div className="p-6 text-center" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                        <div className="text-sm mb-3" style={{ color: C.muted }}>No hay una caja abierta en {activeBranchName}.</div>
                        <button onClick={() => setShowOpenCaja(true)} disabled={!canEdit("caja")} className="flex items-center gap-2 mx-auto px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                          <Wallet size={14} /> Abrir caja
                        </button>
                      </div>
                    ) : (
                      <div className="mb-6 p-4" style={{ background: C.panel, border: `1px solid ${C.amber}60` }}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="text-sm font-semibold" style={{ color: C.text }}>Caja abierta — {activeBranchName}</div>
                            <div className="text-xs" style={{ color: C.muted }}>Desde {new Date(openSession.opened_at).toLocaleString("es-DO")} · Fondo inicial {fmtMoney(openSession.opening_amount)}{Number(openSession.opening_amount_usd || 0) > 0 ? ` + US$ ${Number(openSession.opening_amount_usd).toFixed(2)}` : ""}</div>
                          </div>
                          <button onClick={() => setShowCloseCaja(true)} disabled={!canEdit("caja")} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.red, color: "#fff" }}>
                            <Wallet size={14} /> Cerrar caja
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                            <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Efectivo esperado</div>
                            <div className="text-lg font-mono" style={{ color: C.text }}>{fmtMoney(expected.cash)}</div>
                          </div>
                          <div className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                            <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Tarjeta</div>
                            <div className="text-lg font-mono" style={{ color: C.text }}>{fmtMoney(expected.card)}</div>
                          </div>
                          <div className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                            <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Transferencia/Otro</div>
                            <div className="text-lg font-mono" style={{ color: C.text }}>{fmtMoney(expected.transfer)}</div>
                          </div>
                        </div>
                        {expected.cashUsd > 0 && (
                          <div className="mt-3 p-3" style={{ background: C.panelAlt, border: `1px solid ${C.blue}60` }}>
                            <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Efectivo en dólares esperado</div>
                            <div className="text-lg font-mono" style={{ color: C.text }}>US$ {expected.cashUsd.toFixed(2)}</div>
                            {Number(openSession.opening_amount_usd || 0) > 0 && <div className="text-xs" style={{ color: C.muted }}>Incluye fondo inicial de US$ {Number(openSession.opening_amount_usd).toFixed(2)}</div>}
                          </div>
                        )}
                        {sessionPayments.length > 0 && (
                          <div className="text-xs mt-3" style={{ color: C.muted }}>{sessionPayments.length} cobro{sessionPayments.length !== 1 ? "s" : ""} registrado{sessionPayments.length !== 1 ? "s" : ""} en esta caja.</div>
                        )}
                        {(() => {
                          const cardPays = sessionPayments.filter((p) => p.method === "Tarjeta");
                          if (cardPays.length === 0) return null;
                          const byAcq = {};
                          cardPays.forEach((p) => {
                            const k = p.card?.acquirer_name || "Sin datos de voucher";
                            if (!byAcq[k]) byAcq[k] = { gross: 0, commission: 0, retention: 0, net: 0, count: 0 };
                            const g = Number(p.amount) || 0;
                            byAcq[k].gross += g;
                            byAcq[k].commission += Number(p.card?.commission_amount || 0);
                            byAcq[k].retention += Number(p.card?.retention_amount || 0);
                            byAcq[k].net += p.card ? Number(p.card.net_amount || 0) : g;
                            byAcq[k].count += 1;
                          });
                          return (
                            <div className="mt-4">
                              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Cobros con tarjeta en esta caja</div>
                              <div className="overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
                                <div className="grid grid-cols-12 gap-2 min-w-[720px] px-3 py-2 text-[10px] uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                                  <div className="col-span-4">Adquirente</div>
                                  <div className="col-span-2 text-right">Bruto</div>
                                  <div className="col-span-2 text-right">Comisión</div>
                                  <div className="col-span-2 text-right">Retención</div>
                                  <div className="col-span-2 text-right">Neto a depositar</div>
                                </div>
                                {Object.entries(byAcq).map(([name, t]) => (
                                  <div key={name} className="grid grid-cols-12 gap-2 min-w-[720px] px-3 py-2 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                                    <div className="col-span-4" style={{ color: name === "Sin datos de voucher" ? C.red : C.text }}>{name} <span className="text-xs" style={{ color: C.muted }}>({t.count})</span></div>
                                    <div className="col-span-2 text-right font-mono">{fmtMoney(t.gross)}</div>
                                    <div className="col-span-2 text-right font-mono" style={{ color: C.red }}>-{fmtMoney(t.commission)}</div>
                                    <div className="col-span-2 text-right font-mono" style={{ color: C.red }}>-{fmtMoney(t.retention)}</div>
                                    <div className="col-span-2 text-right font-mono" style={{ color: C.green }}>{fmtMoney(t.net)}</div>
                                  </div>
                                ))}
                                {cardPays.map((p) => (
                                  <div key={p.id} className="grid grid-cols-12 gap-2 min-w-[720px] px-3 py-1.5 text-xs" style={{ color: C.muted, background: C.panelAlt }}>
                                    <div className="col-span-8 truncate">{fmtDate(p.payment_date)} · {invoices.find((i) => i.id === p.invoice_id)?.invoice_number || invoices.find((i) => i.id === p.invoice_id)?.ncf || "Factura"} · {p.card ? cardDetailLine(p.card) : <span style={{ color: C.red }}>sin datos de voucher</span>}</div>
                                    <div className="col-span-4 text-right font-mono">{fmtMoney(p.amount)}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    <div className="mb-6">
                      <button onClick={() => setShowAcquirers((v) => !v)} className="flex items-center gap-2 text-xs uppercase tracking-wide mb-2" style={{ color: C.amber }}>
                        {showAcquirers ? "▾" : "▸"} Adquirentes de tarjeta ({cardAcquirers.filter((a) => a.active).length} activo{cardAcquirers.filter((a) => a.active).length !== 1 ? "s" : ""})
                      </button>
                      {showAcquirers && <CardAcquirersPanel acquirers={cardAcquirers} canManage={isAdmin} onSave={saveCardAcquirer} />}
                    </div>

                    <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Historial de cuadres — {activeBranchName}</div>
                    <div className="overflow-x-auto" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                        <div className="col-span-3">Cierre</div>
                        <div className="col-span-2 text-right">Efectivo</div>
                        <div className="col-span-2 text-right">Tarjeta</div>
                        <div className="col-span-2 text-right">Transf./Otro</div>
                        <div className="col-span-3 text-right">Diferencia total</div>
                      </div>
                      {closedSessions.map((s) => {
                        const diff = Number(s.declared_cash || 0) - Number(s.expected_cash || 0)
                          + Number(s.declared_card || 0) - Number(s.expected_card || 0)
                          + Number(s.declared_transfer || 0) - Number(s.expected_transfer || 0);
                        return (
                          <div key={s.id} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                            <div className="col-span-3" style={{ color: C.muted }}>{s.closed_at ? new Date(s.closed_at).toLocaleString("es-DO") : "—"}</div>
                            <div className="col-span-2 text-right font-mono">{fmtMoney(s.declared_cash)}</div>
                            <div className="col-span-2 text-right font-mono">{fmtMoney(s.declared_card)}</div>
                            <div className="col-span-2 text-right font-mono">{fmtMoney(s.declared_transfer)}</div>
                            <div className="col-span-3 text-right font-mono font-semibold" style={{ color: Math.abs(diff) > 0.01 ? (diff > 0 ? C.blue : C.red) : C.green }}>
                              {diff > 0 ? "+" : ""}{fmtMoney(diff)}
                              {(s.expected_cash_usd != null && (Number(s.expected_cash_usd) > 0 || Number(s.declared_cash_usd) > 0)) && (() => {
                                const du = Number(s.declared_cash_usd || 0) - Number(s.expected_cash_usd || 0);
                                return <div className="text-xs font-normal" style={{ color: Math.abs(du) > 0.01 ? (du > 0 ? C.blue : C.red) : C.muted }}>US$ {Number(s.declared_cash_usd || 0).toFixed(2)} ({du > 0 ? "+" : ""}{du.toFixed(2)})</div>;
                              })()}
                            </div>
                          </div>
                        );
                      })}
                      {closedSessions.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>Todavía no hay cuadres cerrados en esta sucursal.</div>}
                    </div>

                    {showOpenCaja && (
                      <CashOpenModal branchName={activeBranchName} allowUsd={!!company?.accepts_usd_payments} saving={saving} onClose={() => setShowOpenCaja(false)} onSave={(amt, usd) => openCashSession(activeBranchId, amt, usd)} />
                    )}
                    {showCloseCaja && openSession && (
                      <CashCloseModal session={openSession} branchName={activeBranchName} expected={expected} saving={saving} onClose={() => setShowCloseCaja(false)} onSave={(declared) => closeCashSession(openSession, declared)} />
                    )}
                  </>
                );
              })()}
            </div>
  );
}

// Pantalla: creditNotes
export function VistaCreditNotes({ canEdit, clients, creditNotes, invoices, openCreditNoteDetail, setShowAddCreditNote }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{creditNotes.length} notas de crédito</div>
                <button onClick={() => setShowAddCreditNote(true)} disabled={invoices.length === 0 || !canEdit("creditNotes")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Nueva nota de crédito
                </button>
              </div>
              <div className="text-xs mb-3" style={{ color: C.muted }}>
                Una nota de crédito ajusta el saldo de una factura ya emitida (que no se puede editar directamente) — útil para devoluciones o correcciones. Usa el tipo de comprobante B04.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {creditNotes.map((cn) => {
                  const cl = clients.find((c) => c.id === cn.client_id);
                  return (
                    <div key={cn.id} onClick={() => openCreditNoteDetail(cn)} className="p-4 cursor-pointer" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="font-mono text-xs" style={{ color: C.muted }}>{cn.ncf}</div>
                        <div className="font-mono font-semibold">{fmtMoney(cn.total)}</div>
                      </div>
                      <div className="text-sm truncate">{cl?.name || "—"}</div>
                      <div className="text-xs mt-2 pt-2" style={{ color: C.muted, borderTop: `1px solid ${C.border}` }}>
                        <div>Factura original: <span style={{ color: C.text }} className="font-mono">{invoices.find((i) => i.id === cn.invoice_id)?.ncf || "—"}</span></div>
                        <div>Fecha: <span style={{ color: C.text }}>{fmtDate(cn.note_date)}</span></div>
                      </div>
                    </div>
                  );
                })}
                {creditNotes.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>Todavía no hay notas de crédito emitidas.</div>}
              </div>
            </div>
  );
}

// Pantalla: recurringContracts
export function VistaRecurringContracts({ canDelete, canEdit, clients, deleteRecurringContract, dueContracts, generateAllDueContracts, generateOneContractInvoice, recurringContracts, saving, setEditingContract, setShowAddContract, todayStr }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="text-sm" style={{ color: C.muted }}>
                  {recurringContracts.length} contrato{recurringContracts.length !== 1 ? "s" : ""} · {dueContracts.length} pendiente{dueContracts.length !== 1 ? "s" : ""} de facturar
                </div>
                <div className="flex gap-2">
                  {canEdit("recurringContracts") && dueContracts.length > 0 && (
                    <button onClick={generateAllDueContracts} disabled={saving} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.green, color: "#0B1F13" }}>
                      <FileText size={14} /> Generar todas las vencidas ({dueContracts.length})
                    </button>
                  )}
                  {canEdit("recurringContracts") && (
                    <button onClick={() => setShowAddContract(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
                      <Plus size={14} /> Nuevo contrato
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {recurringContracts.map((c) => {
                  const expired = c.end_date && c.end_date < todayStr;
                  const due = c.is_active && c.next_invoice_date <= todayStr && !expired;
                  return (
                    <div key={c.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{clients.find((cl) => cl.id === c.client_id)?.name || "—"}</div>
                          <div className="text-xs truncate" style={{ color: C.muted }}>{c.title}</div>
                        </div>
                        {expired ? <Pill label="Finalizado" color={C.muted} /> : c.is_active ? <Pill label="Activo" color={C.green} /> : <Pill label="Inactivo" color={C.muted} />}
                      </div>
                      <div className="text-xs mt-2 space-y-1" style={{ color: C.muted }}>
                        <div>Monto: <span style={{ color: C.text }} className="font-mono">{c.currency === "USD" ? `US$ ${Number(c.foreign_amount || 0).toFixed(2)} (≈ ${fmtMoney(c.amount)})` : fmtMoney(c.amount)}{c.is_taxable ? " +ITBIS" : ""}</span></div>
                        <div>Frecuencia: <span style={{ color: C.text }}>Cada {c.frequency_days} días{c.end_date ? ` · hasta ${fmtDate(c.end_date)}` : ""}</span></div>
                        <div>Próxima factura: <span style={{ color: due ? C.red : C.text }} className="font-mono">{fmtDate(c.next_invoice_date)}{due ? " (vencido)" : ""}</span></div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-2 mt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                        {canEdit("recurringContracts") && due && (
                          <button onClick={() => generateOneContractInvoice(c)} disabled={saving} className="text-xs px-2 py-1.5 font-semibold disabled:opacity-50" style={{ background: C.green, color: "#0B1F13" }}>
                            Facturar
                          </button>
                        )}
                        {canEdit("recurringContracts") && <button onClick={() => setEditingContract(c)} style={iconBtnStyle}><Pencil size={14} /></button>}
                        {canDelete("recurringContracts") && <button onClick={() => deleteRecurringContract(c.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                      </div>
                    </div>
                  );
                })}
                {recurringContracts.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>Todavía no hay contratos recurrentes. Ideal para clientes con mantenimiento mensual fijo.</div>}
              </div>
            </div>
  );
}
