// Pantallas del Departamento Técnico.
// Cada componente es el JSX de una pantalla del Dashboard, copiado tal cual. Todo lo que usa
// (estados, funciones y cálculos del Dashboard) le llega por props con el mismo nombre.
// Se carga solo cuando se abre la pantalla (ver lazy.jsx).
import React from "react";
import { C, Dot, Field, INCIDENT_STATUS_CFG, KpiCard, LEFTOVER_CONDITIONS, PRIORITY_CFG, PROJECT_STATUS_CFG, Pill, STATUS_CFG, TOOL_STATUS_CFG, TYPE_CFG, addDaysToDateStr, fmtDate, fmtMoney, iconBtnStyle, inputClass, inputStyle, listHtml, printDocument, techWorksAtBranch, todayStrRD } from "./base.jsx";
import { TechnicianToolRow, ToolListCard, UsageQuickUpdate } from "./lazy.jsx";
import { EquipmentExcelButtons } from "./equipos-excel.jsx";
import { printEquipmentQrLabels } from "./equipos-qr.jsx";
import { AlertTriangle, Ban, Boxes, Building2, Clock, ChevronLeft, ChevronRight, ClipboardList, FileText, History, Layers, MapPin, Paperclip, Pencil, Plus, QrCode, RotateCcw, Search, Trash2, Upload, UserCheck, X } from "lucide-react";
import { Bar, BarChart, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Pantalla: agenda
export function VistaAgenda({ agendaTechFilter, agendaViewMode, agendaWeekAnchor, calendarMonth, isTecnico, openOrderDetail, orderDayColor, ordersByDate, overdueOrders, searchedDate, setAgendaTechFilter, setAgendaViewMode, setAgendaWeekAnchor, setCalendarMonth, setSearchedDate, techName, technicians }) {
  return (
          <div>
              {overdueOrders.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-3 mb-4 text-sm" style={{ background: C.redBg, border: `1px solid ${C.red}40`, color: C.red }}>
                  <AlertTriangle size={16} />
                  Tienes {overdueOrders.length} orden{overdueOrders.length !== 1 ? "es" : ""} vencida{overdueOrders.length !== 1 ? "s" : ""} — la fecha programada ya pasó y siguen sin completarse.
                </div>
              )}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center" style={{ border: `1px solid ${C.border}` }}>
                    <button onClick={() => setAgendaViewMode("month")} className="text-xs px-3 py-2 font-semibold" style={{ background: agendaViewMode === "month" ? C.amber : "transparent", color: agendaViewMode === "month" ? "#1A1500" : C.muted }}>Mes</button>
                    <button onClick={() => setAgendaViewMode("week")} className="text-xs px-3 py-2 font-semibold" style={{ background: agendaViewMode === "week" ? C.amber : "transparent", color: agendaViewMode === "week" ? "#1A1500" : C.muted }}>Semana</button>
                  </div>
                  <button
                    onClick={() => {
                      if (agendaViewMode === "month") setCalendarMonth((m) => { const d = new Date(m.year, m.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
                      else setAgendaWeekAnchor((a) => addDaysToDateStr(a, -7));
                    }}
                    className="p-2" style={{ border: `1px solid ${C.border}`, color: C.muted }}
                  ><ChevronLeft size={16} /></button>
                  <div className="text-sm font-semibold" style={{ color: C.text, minWidth: 160, textAlign: "center" }}>
                    {agendaViewMode === "month"
                      ? new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString("es-DO", { month: "long", year: "numeric" })
                      : (() => {
                          const base = new Date(agendaWeekAnchor + "T00:00:00");
                          const monday = new Date(base); monday.setDate(base.getDate() - (base.getDay() === 0 ? 6 : base.getDay() - 1));
                          const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
                          return `${monday.toLocaleDateString("es-DO", { day: "numeric", month: "short" })} – ${sunday.toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" })}`;
                        })()}
                  </div>
                  <button
                    onClick={() => {
                      if (agendaViewMode === "month") setCalendarMonth((m) => { const d = new Date(m.year, m.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
                      else setAgendaWeekAnchor((a) => addDaysToDateStr(a, 7));
                    }}
                    className="p-2" style={{ border: `1px solid ${C.border}`, color: C.muted }}
                  ><ChevronRight size={16} /></button>
                  <button onClick={() => { const t = todayStrRD(); const d = new Date(); setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() }); setAgendaWeekAnchor(t); setSearchedDate(""); }} className="text-xs px-3 py-2" style={{ border: `1px solid ${C.border}`, color: C.amber }}>Hoy</button>
                  <div className="flex items-center gap-2 px-3 py-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <Search size={14} color={C.muted} />
                    <input
                      type="date"
                      value={searchedDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSearchedDate(val);
                        if (val) {
                          const d = new Date(val + "T00:00:00");
                          setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
                          setAgendaWeekAnchor(val);
                        }
                      }}
                      className="bg-transparent outline-none text-sm"
                      style={{ color: C.text }}
                    />
                    {searchedDate && <button onClick={() => setSearchedDate("")} style={iconBtnStyle}><X size={14} /></button>}
                  </div>
                  {!isTecnico && (
                    <select value={agendaTechFilter} onChange={(e) => setAgendaTechFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                      <option value="all">Todos los técnicos</option>
                      {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: C.muted }}>
                  <span className="flex items-center gap-1"><Dot color={C.blue} /> Próxima</span>
                  <span className="flex items-center gap-1"><Dot color={C.amber} /> Hoy</span>
                  <span className="flex items-center gap-1"><Dot color={C.red} /> Vencida</span>
                  <span className="flex items-center gap-1"><Dot color={C.green} /> Completada</span>
                </div>
              </div>
              {agendaViewMode === "month" ? (
                <>
                  <div className="grid grid-cols-7 gap-1 mb-1 text-xs uppercase tracking-wide text-center" style={{ color: C.muted }}>
                    {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => <div key={d}>{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {(() => {
                      const { year, month } = calendarMonth;
                      const firstWeekday = new Date(year, month, 1).getDay();
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const todayStr = todayStrRD();
                      const cells = [];
                      for (let i = 0; i < firstWeekday; i++) cells.push(null);
                      for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                      return cells.map((d, i) => {
                        if (!d) return <div key={i} style={{ minHeight: 96 }} />;
                        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                        const dayOrders = ordersByDate[dateStr] || [];
                        const isToday = dateStr === todayStr;
                        const isSearched = !!searchedDate && dateStr === searchedDate;
                        return (
                          <div key={i} className="p-1.5" style={{ minHeight: 96, background: isToday ? C.panelAlt : C.panel, border: `${isSearched ? "2px" : "1px"} solid ${isSearched ? C.blue : (isToday ? C.amber + "60" : C.border)}` }}>
                            <div className="text-xs mb-1" style={{ color: isSearched ? C.blue : (isToday ? C.amber : C.muted) }}>{d}</div>
                            <div className="space-y-1">
                              {dayOrders.slice(0, 3).map((o) => {
                                const clr = orderDayColor(o);
                                return (
                                  <button key={o.id} onClick={() => openOrderDetail(o)} className="w-full text-left text-[10px] px-1.5 py-1 truncate" style={{ background: clr + "1A", borderLeft: `2px solid ${clr}`, color: C.text }} title={o.title}>
                                    {o.code} · {o.title}
                                  </button>
                                );
                              })}
                              {dayOrders.length > 3 && <div className="text-[10px]" style={{ color: C.muted }}>+{dayOrders.length - 3} más</div>}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const todayStr = todayStrRD();
                    const base = new Date(agendaWeekAnchor + "T00:00:00");
                    const monday = new Date(base); monday.setDate(base.getDate() - (base.getDay() === 0 ? 6 : base.getDay() - 1));
                    const weekDayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
                    return Array.from({ length: 7 }, (_, i) => {
                      const d = new Date(monday); d.setDate(monday.getDate() + i);
                      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                      const dayOrders = (ordersByDate[dateStr] || []).slice().sort((a, b) => (a.title || "").localeCompare(b.title || ""));
                      const isToday = dateStr === todayStr;
                      const isSearched = !!searchedDate && dateStr === searchedDate;
                      return (
                        <div key={dateStr} className="p-1.5" style={{ minHeight: 320, background: isToday ? C.panelAlt : C.panel, border: `${isSearched ? "2px" : "1px"} solid ${isSearched ? C.blue : (isToday ? C.amber + "60" : C.border)}` }}>
                          <div className="text-xs mb-1 font-semibold" style={{ color: isSearched ? C.blue : (isToday ? C.amber : C.muted) }}>{weekDayLabels[i]} {d.getDate()}</div>
                          <div className="space-y-1 overflow-y-auto" style={{ maxHeight: 280 }}>
                            {dayOrders.map((o) => {
                              const clr = orderDayColor(o);
                              return (
                                <button key={o.id} onClick={() => openOrderDetail(o)} className="w-full text-left text-[10px] px-1.5 py-1" style={{ background: clr + "1A", borderLeft: `2px solid ${clr}`, color: C.text }} title={o.title}>
                                  <div className="truncate font-mono" style={{ color: C.muted }}>{o.code}</div>
                                  <div className="truncate">{o.title}</div>
                                  {!isTecnico && <div className="truncate" style={{ color: C.muted }}>{techName(o.technician_id)}</div>}
                                </button>
                              );
                            })}
                            {dayOrders.length === 0 && <div className="text-[10px]" style={{ color: C.muted }}>Sin órdenes</div>}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
  );
}

// Pantalla: orders
export function VistaOrders({ onSiteOrderIds, branchName, canDelete, canEdit, canManage, companyName, deleteOrder, equipName, equipment, filteredOrders, isTecnico, openEditOrder, openOrderDetail, orderAttachmentIds, orderDateFrom, orderDateTo, orderEquipmentFilter, orderTechnicians, orders, search, selectedOrders, setOrderDateFrom, setOrderDateTo, setOrderEquipmentFilter, setOrderStatus, setSearch, setSelectedOrders, setStatusFilter, setTechnicianFilter, setTypeFilter, statusFilter, techName, technicianFilter, technicians, todayStr, typeFilter }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>
                  {filteredOrders.length}{filteredOrders.length !== orders.length ? ` de ${orders.length}` : ""} órdenes{selectedOrders.size > 0 ? ` · ${selectedOrders.size} seleccionadas` : ""}
                </div>
                <button
                  onClick={() => {
                    const list = selectedOrders.size > 0 ? filteredOrders.filter((o) => selectedOrders.has(o.id)) : filteredOrders;
                    printDocument("Órdenes de trabajo", listHtml("Listado de órdenes de trabajo", companyName, ["Código", "Título", "Tipo", "Sucursal", "Técnico", "Prioridad", "Fecha", "Estado"], list.map((o) => [o.code, o.title, TYPE_CFG[o.type]?.label, branchName(o.branch_id), techName(o.technician_id), PRIORITY_CFG[o.priority]?.label, fmtDate(o.scheduled), STATUS_CFG[o.status]?.label])));
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text }}
                >
                  <FileText size={14} /> {selectedOrders.size > 0 ? `Imprimir selección (${selectedOrders.size})` : "Imprimir lista"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2 px-3 py-2 flex-1 min-w-[200px]" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <Search size={14} color={C.muted} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título o código..." className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
                </div>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los tipos</option>
                  {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los estados</option>
                  {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {!isTecnico && (
                  <select value={technicianFilter} onChange={(e) => setTechnicianFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                    <option value="all">Todos los técnicos</option>
                    {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <select value={orderEquipmentFilter} onChange={(e) => setOrderEquipmentFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los equipos</option>
                  {equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Fecha desde</div>
                  <input type="date" value={orderDateFrom} onChange={(e) => setOrderDateFrom(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Fecha hasta</div>
                  <input type="date" value={orderDateTo} onChange={(e) => setOrderDateTo(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                {(orderEquipmentFilter !== "all" || orderDateFrom || orderDateTo) && (
                  <button
                    onClick={() => { setOrderEquipmentFilter("all"); setOrderDateFrom(""); setOrderDateTo(""); }}
                    className="px-3 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
              {filteredOrders.length > 0 && (
                <label className="flex items-center gap-2 text-xs mb-3 cursor-pointer" style={{ color: C.muted }}>
                  <input type="checkbox" checked={selectedOrders.size === filteredOrders.length} onChange={() => setSelectedOrders(selectedOrders.size === filteredOrders.length ? new Set() : new Set(filteredOrders.map((o) => o.id)))} />
                  Seleccionar todas las que se ven ({filteredOrders.length})
                </label>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredOrders.map((o) => {
                  const t = TYPE_CFG[o.type], p = PRIORITY_CFG[o.priority], s = STATUS_CFG[o.status];
                  const extraCount = orderTechnicians.filter((wt) => wt.work_order_id === o.id).length;
                  return (
                    <div key={o.id} onClick={() => openOrderDetail(o)} className="p-4 cursor-pointer" style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${t.color}` }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <input type="checkbox" checked={selectedOrders.has(o.id)} onClick={(e) => e.stopPropagation()} onChange={() => setSelectedOrders((prev) => { const next = new Set(prev); next.has(o.id) ? next.delete(o.id) : next.add(o.id); return next; })} />
                          <div className="min-w-0">
                            <div className="font-mono text-xs" style={{ color: C.muted }}>{o.code}</div>
                            <div className="font-semibold truncate">{o.title}</div>
                          </div>
                        </div>
                        <Pill label={t.label} color={t.color} />
                      </div>
                      <div className="text-xs mb-3" style={{ color: C.muted }}>{equipName(o.equipment_id)}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3" style={{ color: C.muted }}>
                        <div>Sucursal<br /><span style={{ color: C.text }}>{branchName(o.branch_id)}</span></div>
                        <div>
                          Técnico<br />
                          <span style={{ color: C.text }}>{techName(o.technician_id)}</span>
                          {extraCount > 0 && <span className="ml-1" style={{ color: C.amber }}>+{extraCount}</span>}
                        </div>
                        <div>Fecha<br /><span style={{ color: C.text }}>{fmtDate(o.scheduled)}</span></div>
                        <div>
                          Límite<br />
                          <span style={{ color: o.deadline && o.status !== "completada" && o.deadline < todayStr ? C.red : C.text }}>{o.deadline ? fmtDate(o.deadline) : "—"}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Pill label={p.label} color={p.color} />
                          {onSiteOrderIds?.has(o.id) && <Pill label="En sitio" color={C.green} />}
                          {o.status === "completada" ? (
                            <Pill label={s.label} color={s.color} />
                          ) : (
                            <div className="flex items-center overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                              {["pendiente", "en_progreso"].map((st) => {
                                const cfg = STATUS_CFG[st];
                                const active = o.status === st;
                                return (
                                  <button
                                    key={st}
                                    onClick={() => setOrderStatus(o, st)}
                                    title={`Marcar como ${cfg.label}`}
                                    className="text-xs px-2 py-1 font-medium whitespace-nowrap"
                                    style={{ color: active ? "#fff" : cfg.color, background: active ? cfg.color : "transparent" }}
                                  >
                                    {cfg.label}
                                  </button>
                                );
                              })}
                              <button
                                onClick={() => openOrderDetail(o)}
                                title="Completar orden (requiere nota de cierre)"
                                className="text-xs px-2 py-1 font-medium whitespace-nowrap"
                                style={{ color: C.muted, borderLeft: `1px solid ${C.border}` }}
                              >
                                {STATUS_CFG.completada.label}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => openOrderDetail(o)} title={isTecnico && o.status === "completada" ? "Ver nota y foto" : "Nota de cierre y foto"} style={{ color: o.resolution_notes || o.photo_url || orderAttachmentIds.has(o.id) ? C.amber : C.muted }}>
                            {o.photo_url ? <Paperclip size={14} /> : <FileText size={14} />}
                          </button>
                          {canManage && (
                            <>
                              {canEdit("orders") && <button onClick={() => openEditOrder(o)} style={iconBtnStyle}><Pencil size={14} /></button>}
                              {canDelete("orders") && <button onClick={() => deleteOrder(o.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredOrders.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>Ninguna orden coincide con el filtro.</div>}
              </div>
            </div>
  );
}

// Pantalla: incidents
export function VistaIncidents({ branchName, canReportIncident, clients, companyName, equipment, incidentCompletedFrom, incidentCompletedTo, incidentDateFrom, incidentDateTo, incidentEquipmentFilter, incidentTechnicianFilter, incidentsFiltered, isTecnico, selectedIncidents, setIncidentCompletedFrom, setIncidentCompletedTo, setIncidentDateFrom, setIncidentDateTo, setIncidentDetail, setIncidentEquipmentFilter, setIncidentTechnicianFilter, setSelectedIncidents, setShowAddIncident, techName, technicians }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="text-sm" style={{ color: C.muted }}>
                  {incidentsFiltered.length} incidente{incidentsFiltered.length !== 1 ? "s" : ""}{isTecnico ? " asignado" + (incidentsFiltered.length !== 1 ? "s" : "") + " a ti" : ""}{selectedIncidents.size > 0 ? ` · ${selectedIncidents.size} seleccionados` : ""}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {!isTecnico && (
                    <select value={incidentTechnicianFilter} onChange={(e) => setIncidentTechnicianFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                      <option value="all">Todos los técnicos</option>
                      <option value="none">Sin asignar</option>
                      {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                    </select>
                  )}
                  <button
                    onClick={() => {
                      const list = selectedIncidents.size > 0 ? incidentsFiltered.filter((i) => selectedIncidents.has(i.id)) : incidentsFiltered;
                      printDocument("Incidentes", listHtml("Listado de incidentes", companyName, ["Incidente", "Sucursal", "Técnico", "Cliente", "Prioridad", "Fecha", "Estado"], list.map((inc) => [inc.title, branchName(inc.branch_id), techName(inc.technician_id), inc.client_id ? (clients.find((c) => c.id === inc.client_id)?.name || "—") : "—", (PRIORITY_CFG[inc.priority] || PRIORITY_CFG.media)?.label, fmtDate(inc.created_at?.slice(0, 10)), (INCIDENT_STATUS_CFG[inc.status] || INCIDENT_STATUS_CFG.abierto)?.label])));
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text }}
                  >
                    <FileText size={14} /> {selectedIncidents.size > 0 ? `Imprimir selección (${selectedIncidents.size})` : "Imprimir lista"}
                  </button>
                  <button onClick={() => setShowAddIncident(true)} disabled={!canReportIncident} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> Reportar incidente
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <select value={incidentEquipmentFilter} onChange={(e) => setIncidentEquipmentFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los equipos</option>
                  {equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                </select>
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Reportado desde</div>
                  <input type="date" value={incidentDateFrom} onChange={(e) => setIncidentDateFrom(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Reportado hasta</div>
                  <input type="date" value={incidentDateTo} onChange={(e) => setIncidentDateTo(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Completado desde</div>
                  <input type="date" value={incidentCompletedFrom} onChange={(e) => setIncidentCompletedFrom(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Completado hasta</div>
                  <input type="date" value={incidentCompletedTo} onChange={(e) => setIncidentCompletedTo(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                {(incidentEquipmentFilter !== "all" || incidentDateFrom || incidentDateTo || incidentCompletedFrom || incidentCompletedTo) && (
                  <button
                    onClick={() => { setIncidentEquipmentFilter("all"); setIncidentDateFrom(""); setIncidentDateTo(""); setIncidentCompletedFrom(""); setIncidentCompletedTo(""); }}
                    className="px-3 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
              {incidentsFiltered.length > 0 && (
                <label className="flex items-center gap-2 text-xs mb-3 cursor-pointer" style={{ color: C.muted }}>
                  <input type="checkbox" checked={selectedIncidents.size === incidentsFiltered.length} onChange={() => setSelectedIncidents(selectedIncidents.size === incidentsFiltered.length ? new Set() : new Set(incidentsFiltered.map((i) => i.id)))} />
                  Seleccionar todos los que se ven ({incidentsFiltered.length})
                </label>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {incidentsFiltered.map((inc) => {
                  const s = INCIDENT_STATUS_CFG[inc.status] || INCIDENT_STATUS_CFG.abierto;
                  const p = PRIORITY_CFG[inc.priority] || PRIORITY_CFG.media;
                  return (
                    <div key={inc.id} onClick={() => setIncidentDetail(inc)} className="p-4 cursor-pointer" style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${s.color}` }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <input type="checkbox" checked={selectedIncidents.has(inc.id)} onClick={(e) => e.stopPropagation()} onChange={() => setSelectedIncidents((prev) => { const next = new Set(prev); next.has(inc.id) ? next.delete(inc.id) : next.add(inc.id); return next; })} />
                          <div className="font-semibold truncate">{inc.title}</div>
                        </div>
                        <Pill label={s.label} color={s.color} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-2" style={{ color: C.muted }}>
                        <div>Sucursal<br /><span style={{ color: C.text }}>{branchName(inc.branch_id)}</span></div>
                        <div>Técnico<br /><span style={{ color: inc.technician_id ? C.text : C.muted }}>{techName(inc.technician_id)}</span></div>
                        <div>Cliente<br /><span style={{ color: C.text }}>{inc.client_id ? (clients.find((c) => c.id === inc.client_id)?.name || "—") : "—"}</span></div>
                        <div>Fecha<br /><span style={{ color: C.text }}>{fmtDate(inc.created_at?.slice(0, 10))}</span></div>
                      </div>
                      <div className="pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                        <Pill label={p.label} color={p.color} />
                      </div>
                    </div>
                  );
                })}
                {incidentsFiltered.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>{isTecnico ? "No tienes incidentes asignados todavía." : "Todavía no hay incidentes reportados."}</div>}
              </div>
            </div>
  );
}

// Pantalla: projects
export function VistaProjects({ branchName, canEdit, clients, orders, projectMaterials, projectSearch, projectStatusFilter, projectsFiltered, salesOrders, setProjectDetail, setProjectSearch, setProjectStatusFilter, setShowAddProject }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="text-sm" style={{ color: C.muted }}>{projectsFiltered.length} proyecto{projectsFiltered.length !== 1 ? "s" : ""}</div>
                {canEdit("projects") && (
                  <button onClick={() => setShowAddProject(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> Nuevo proyecto
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-2 px-3 py-2 flex-1 min-w-[200px]" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <Search size={14} style={{ color: C.muted }} />
                  <input value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder="Buscar por nombre o cliente..." className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
                </div>
                <select value={projectStatusFilter} onChange={(e) => setProjectStatusFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los estados</option>
                  {Object.entries(PROJECT_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {projectsFiltered.map((p) => {
                  const s = PROJECT_STATUS_CFG[p.status] || PROJECT_STATUS_CFG.activo;
                  const ordersCount = orders.filter((o) => o.project_id === p.id).length;
                  const salesCount = salesOrders.filter((o) => o.project_id === p.id).length;
                  const materialsCount = projectMaterials.filter((pm) => pm.project_id === p.id).length;
                  return (
                    <div key={p.id} onClick={() => setProjectDetail(p)} className="p-4 cursor-pointer" style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${s.color}` }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-semibold truncate">{p.name}</div>
                        <Pill label={s.label} color={s.color} />
                      </div>
                      <div className="text-xs mb-2" style={{ color: C.muted }}>
                        {p.client_id ? (clients.find((c) => c.id === p.client_id)?.name || "—") : "Sin cliente"}
                        {p.branch_id ? ` · ${branchName(p.branch_id)}` : ""}
                      </div>
                      {(p.start_date || p.end_date) && (
                        <div className="text-xs mb-2" style={{ color: C.muted }}>
                          {p.start_date ? fmtDate(p.start_date) : "—"} → {p.end_date ? fmtDate(p.end_date) : "—"}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs pt-2 mt-1" style={{ borderTop: `1px solid ${C.border}`, color: C.muted }}>
                        <span className="flex items-center gap-1"><ClipboardList size={12} /> {ordersCount}</span>
                        <span className="flex items-center gap-1"><Boxes size={12} /> {materialsCount}</span>
                        <span className="flex items-center gap-1"><Layers size={12} /> {salesCount}</span>
                      </div>
                    </div>
                  );
                })}
                {projectsFiltered.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>Todavía no hay proyectos registrados.</div>}
              </div>
            </div>
  );
}

// ---- Impresión de la lista de equipos (operativos, fuera de servicio o todos) ----
const escHtml = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isOutOfService = (eq) => eq.operational_status === "fuera_servicio";

function equipmentPrintHtml({ mode, list, companyName, filtersNote, branchName, locationName, techLabel }) {
  const operativos = list.filter((e) => !isOutOfService(e));
  const fuera = list.filter(isOutOfService);
  const byName = (a, b) => (a.name || "").localeCompare(b.name || "", "es");
  const headers = ["#", "Equipo", "Tipo", "Marca", "Modelo", "Serie", "Ubicación", "Sucursal", "Técnico", "Estado"];
  const table = (rows) => {
    if (rows.length === 0) return `<div class="muted" style="margin-top:8px">No hay equipos en esta lista.</div>`;
    const body = rows.slice().sort(byName).map((e, i) => [
      i + 1, e.name, e.type, e.brand, e.model, e.serial_number, locationName(e.location_id), branchName(e.branch_id), techLabel(e.default_technician_id),
      isOutOfService(e) ? "Fuera de servicio" : "Operativo",
    ].map((c) => `<td>${c === null || c === undefined || c === "" ? "—" : escHtml(c)}</td>`).join(""));
    return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r}</tr>`).join("")}</tbody></table>`;
  };
  const title = mode === "operativos" ? "Equipos operativos" : mode === "fuera" ? "Equipos fuera de servicio" : "Listado de equipos";
  const summary = `<div style="display:flex;gap:24px;margin-top:6px;font-size:13px">
      <div>Operativos: <b>${operativos.length}</b></div>
      <div>Fuera de servicio: <b>${fuera.length}</b></div>
      <div>Total: <b>${list.length}</b></div>
    </div>`;
  let body;
  if (mode === "operativos") body = table(operativos);
  else if (mode === "fuera") body = table(fuera);
  else body = `<h2 style="font-size:15px;margin:18px 0 0">Operativos (${operativos.length})</h2>${table(operativos)}
    <h2 style="font-size:15px;margin:22px 0 0">Fuera de servicio (${fuera.length})</h2>${table(fuera)}
    <div style="margin-top:14px;font-weight:bold;text-align:right">Total de equipos: ${list.length}</div>`;
  return `<div class="header-row"><div><h1>${escHtml(companyName)}</h1><div class="muted">${title}</div>${filtersNote ? `<div class="muted">${escHtml(filtersNote)}</div>` : ""}</div><div class="muted">${new Date().toLocaleDateString("es-DO")}</div></div>
    ${mode === "todos" ? summary : ""}${body}`;
}

// Pantalla: equipment
export function VistaEquipment({ clients = [], companyLogo, openEquipmentCard, branchFilter, branchName, branches, bulkDeleteEquipment, canDelete, canEdit, companyId, companyName, deleteEquipment, equipment, equipmentFiltered, equipmentSearch, equipmentStatusFilter, equipmentTechFilter, equipmentTypeFilter, equipmentTypes, locationName, locations, orders, selectedEquipment, setBranchFilter, setEditingEquipment, setEquipment, setEquipmentSearch, setEquipmentStatusFilter, setEquipmentTechFilter, setEquipmentTypeFilter, setHistoryFor, setLocations, setPendingLocationBranch, setSelectedEquipment, setShowAddEquipment, setShowAddLocation, technicians }) {
  // Imprime lo que se ve en pantalla (filtros aplicados) o, si hay equipos marcados, solo esos.
  const printEquipment = (mode) => {
    const list = selectedEquipment.size > 0 ? equipmentFiltered.filter((e) => selectedEquipment.has(e.id)) : equipmentFiltered;
    const notes = [];
    if (selectedEquipment.size > 0) notes.push(list.length === 1 ? "Solo el equipo seleccionado" : `Solo los ${list.length} equipos seleccionados`);
    if (branchFilter !== "all") notes.push(`Sucursal: ${branchName(branchFilter)}`);
    if (equipmentTechFilter === "none") notes.push("Técnico: sin asignar");
    else if (equipmentTechFilter !== "all") notes.push(`Técnico: ${technicians.find((t) => t.id === equipmentTechFilter)?.name || "—"}`);
    if (equipmentTypeFilter !== "all") notes.push(`Tipo: ${equipmentTypeFilter}`);
    if (equipmentSearch.trim()) notes.push(`Búsqueda: "${equipmentSearch.trim()}"`);
    const techLabel = (id) => (id ? (technicians.find((t) => t.id === id)?.name || "—") : "Sin asignar");
    const title = mode === "operativos" ? "Equipos operativos" : mode === "fuera" ? "Equipos fuera de servicio" : "Equipos";
    printDocument(title, equipmentPrintHtml({ mode, list, companyName, filtersNote: notes.join(" · "), branchName, locationName, techLabel }));
  };
  const opCount = equipmentFiltered.filter((e) => !isOutOfService(e)).length;
  const outCount = equipmentFiltered.length - opCount;

  return (
          <div>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="text-sm" style={{ color: C.muted }}>
                  {equipmentFiltered.length}{equipmentFiltered.length !== equipment.length ? ` de ${equipment.length}` : ""} equipos{selectedEquipment.size > 0 ? ` · ${selectedEquipment.size} seleccionados` : ""}
                  {equipmentFiltered.length > 0 && <span> · <span style={{ color: C.green }}>{opCount} operativo{opCount !== 1 ? "s" : ""}</span> · <span style={{ color: outCount > 0 ? C.red : C.muted }}>{outCount} fuera de servicio</span></span>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {equipmentFiltered.length > 0 && (
                    <button
                      onClick={() => printEquipment(equipmentStatusFilter === "operativo" ? "operativos" : equipmentStatusFilter === "fuera_servicio" ? "fuera" : "todos")}
                      title="Abre la hoja para imprimir. En la ventana de impresión puedes elegir «Guardar como PDF»."
                      className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text }}
                    >
                      <FileText size={14} /> {selectedEquipment.size > 0 ? `Imprimir / PDF selección (${selectedEquipment.size})` : `Imprimir / PDF${equipmentStatusFilter === "operativo" ? " operativos" : equipmentStatusFilter === "fuera_servicio" ? " fuera de servicio" : ""}`}
                    </button>
                  )}
                  {equipmentFiltered.length > 0 && (
                    <button
                      onClick={() => printEquipmentQrLabels({ list: selectedEquipment.size > 0 ? equipmentFiltered.filter((e) => selectedEquipment.has(e.id)) : equipmentFiltered, companyName, companyLogo, branchName, locationName })}
                      title="Etiquetas con código QR para pegar en cada equipo. Al escanearlas se abre la ficha del equipo."
                      className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text }}
                    >
                      <QrCode size={14} /> {selectedEquipment.size > 0 ? `Etiquetas QR (${selectedEquipment.size})` : "Etiquetas QR"}
                    </button>
                  )}
                  <EquipmentExcelButtons
                    canUpload={canEdit("equipment") && branches.length > 0}
                    companyId={companyId}
                    companyName={companyName}
                    equipment={equipment}
                    downloadList={selectedEquipment.size > 0 ? equipmentFiltered.filter((e) => selectedEquipment.has(e.id)) : equipmentFiltered}
                    branches={branches}
                    locations={locations}
                    technicians={technicians}
                    clients={clients}
                    setEquipment={setEquipment}
                    setLocations={setLocations}
                  />
                  {canDelete("equipment") && selectedEquipment.size > 0 && (
                    <button onClick={() => bulkDeleteEquipment(Array.from(selectedEquipment))} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.red, color: "#fff" }}>
                      <Trash2 size={14} /> Eliminar seleccionados ({selectedEquipment.size})
                    </button>
                  )}
                  <button onClick={() => { setPendingLocationBranch(branchFilter !== "all" ? branchFilter : branches[0]?.id); setShowAddLocation(true); }} disabled={branches.length === 0} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.text }}>
                    <Plus size={14} /> Agregar ubicación
                  </button>
                  <button onClick={() => setShowAddEquipment(true)} disabled={branches.length === 0 || !canEdit("equipment")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> Agregar equipo
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-2 px-3 py-2 flex-1 min-w-[200px]" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <Search size={14} style={{ color: C.muted }} />
                  <input value={equipmentSearch} onChange={(e) => setEquipmentSearch(e.target.value)} placeholder="Buscar por nombre, marca, modelo o serie..." className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
                </div>
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todas las sucursales</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={equipmentTechFilter} onChange={(e) => setEquipmentTechFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los técnicos</option>
                  <option value="none">Sin técnico asignado</option>
                  {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={equipmentStatusFilter} onChange={(e) => setEquipmentStatusFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: equipmentStatusFilter === "fuera_servicio" ? C.red : equipmentStatusFilter === "operativo" ? C.green : C.text }}>
                  <option value="all">Todos los estados</option>
                  <option value="operativo">Operativos</option>
                  <option value="fuera_servicio">Fuera de servicio</option>
                </select>
                <select value={equipmentTypeFilter} onChange={(e) => setEquipmentTypeFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los tipos</option>
                  {equipmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {canDelete("equipment") && equipmentFiltered.length > 0 && (
                <label className="flex items-center gap-2 text-xs mb-3 cursor-pointer" style={{ color: C.muted }}>
                  <input
                    type="checkbox"
                    checked={equipmentFiltered.length > 0 && equipmentFiltered.every((e) => selectedEquipment.has(e.id))}
                    onChange={() => setSelectedEquipment((prev) => {
                      const allSelected = equipmentFiltered.every((e) => prev.has(e.id));
                      if (allSelected) return new Set();
                      return new Set(equipmentFiltered.map((e) => e.id));
                    })}
                  />
                  Seleccionar todos los que se ven ({equipmentFiltered.length})
                </label>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {equipmentFiltered.map((eq) => {
                  const openOrders = orders.filter((o) => o.equipment_id === eq.id && o.status !== "completada").length;
                  return (
                    <div key={eq.id} className="p-4" style={{ background: C.panel, border: `1px solid ${selectedEquipment.has(eq.id) ? C.amber : C.border}` }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          {canDelete("equipment") && (
                            <input type="checkbox" checked={selectedEquipment.has(eq.id)} onChange={() => setSelectedEquipment((prev) => { const next = new Set(prev); next.has(eq.id) ? next.delete(eq.id) : next.add(eq.id); return next; })} />
                          )}
                          <div className="font-semibold truncate">{eq.name}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {openOrders > 0 && <Pill label={`${openOrders} abierta${openOrders !== 1 ? "s" : ""}`} color={C.amber} />}
                          {openEquipmentCard && <button onClick={() => openEquipmentCard(eq.id)} title="Ficha del equipo y etiqueta QR" style={iconBtnStyle}><QrCode size={13} /></button>}
                          <button onClick={() => setEditingEquipment(eq)} style={iconBtnStyle}><Pencil size={13} /></button>
                          {canDelete("equipment") && <button onClick={() => deleteEquipment(eq.id)} style={iconBtnStyle}><Trash2 size={13} /></button>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {eq.type && <div className="text-xs" style={{ color: C.muted }}>{eq.type}</div>}
                        <Pill label={eq.operational_status === "fuera_servicio" ? "Fuera de servicio" : "Operativo"} color={eq.operational_status === "fuera_servicio" ? C.red : C.green} />
                      </div>
                      <div className="text-xs mt-3 space-y-1" style={{ color: C.muted }}>
                        {eq.brand && <div>Marca: <span style={{ color: C.text }}>{eq.brand}</span></div>}
                        {eq.model && <div>Modelo: <span style={{ color: C.text }}>{eq.model}</span></div>}
                        {eq.serial_number && <div className="font-mono">S/N: <span style={{ color: C.text }}>{eq.serial_number}</span></div>}
                        {eq.installed_at && <div>Instalado: <span style={{ color: C.text }}>{fmtDate(eq.installed_at)}</span></div>}
                        {locationName(eq.location_id) && <div>Ubicación: <span style={{ color: C.text }}>{locationName(eq.location_id)}</span></div>}
                        {eq.client_id && <div>Cliente: <span style={{ color: C.text }}>{clients.find((c) => c.id === eq.client_id)?.name || "—"}</span></div>}
                        <div>Técnico: <span style={{ color: eq.default_technician_id ? C.text : C.muted }}>{eq.default_technician_id ? (technicians.find((t) => t.id === eq.default_technician_id)?.name || "—") : "Sin asignar"}</span></div>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1 text-xs" style={{ color: C.muted }}><MapPin size={12} /> {branchName(eq.branch_id)}</div>
                        <button onClick={() => setHistoryFor({ title: `Historial de ${eq.name}`, orders: orders.filter((o) => o.equipment_id === eq.id) })} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}>
                          <History size={13} /> Historial
                        </button>
                      </div>
                    </div>
                  );
                })}
                {equipmentFiltered.length === 0 && equipment.length > 0 && <div className="text-sm" style={{ color: C.muted }}>Ningún equipo coincide con los filtros.</div>}
                {equipment.length === 0 && <div className="text-sm" style={{ color: C.muted }}>Todavía no hay equipos registrados.</div>}
                {branches.length === 0 && <div className="text-sm" style={{ color: C.muted }}>Primero crea una sucursal para poder agregar equipos.</div>}
              </div>
            </div>
  );
}

// Pantalla: technicians
export function VistaTechnicians({ openVisits = [], onShowVisitsReport, branchFilter, branchName, branches, canDelete, canEdit, deleteTech, orders, setEditingTech, setShowAddTech, technicians }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{technicians.length} técnicos</div>
                <div className="flex gap-2">
                {onShowVisitsReport && (
                  <button onClick={onShowVisitsReport} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text }}>
                    <Clock size={14} /> Horas en sitio
                  </button>
                )}
                <button onClick={() => setShowAddTech(true)} disabled={branches.length === 0 || !canEdit("technicians")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Agregar técnico
                </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {technicians.filter((t) => branchFilter === "all" || techWorksAtBranch(t, branchFilter)).map((t) => {
                  const active = orders.filter((o) => o.technician_id === t.id && o.status !== "completada").length;
                  const isInactive = t.is_active === false;
                  return (
                    <div key={t.id} className="p-4" style={{ background: C.panel, border: `1px solid ${isInactive ? C.red + "40" : C.border}`, opacity: isInactive ? 0.7 : 1 }}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{t.name}</div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingTech(t)} style={iconBtnStyle}><Pencil size={13} /></button>
                          {canDelete("technicians") && (
                            <button
                              onClick={() => deleteTech(t.id)}
                              title={isInactive ? "Reactivar técnico" : "Eliminar / dar de baja"}
                              style={{ ...iconBtnStyle, color: isInactive ? C.green : iconBtnStyle.color }}
                            >
                              {isInactive ? <RotateCcw size={13} /> : <Trash2 size={13} />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-sm mt-0.5" style={{ color: C.muted }}>{t.specialty}</div>
                      <div className="flex items-center gap-1 text-xs mt-3" style={{ color: C.muted }}>
                        <MapPin size={12} /> {branchName(t.branch_id)}
                        {t.extra_branch_ids?.length > 0 && ` · también en ${t.extra_branch_ids.map((id) => branchName(id)).join(", ")}`}
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {isInactive ? (
                          <div className="text-xs px-2 py-1 inline-block" style={{ background: C.red + "15", color: C.red }}>
                            Dado de baja — no se puede asignar
                          </div>
                        ) : (
                          <div className="text-xs px-2 py-1 inline-block" style={{ background: C.panelAlt, color: active > 0 ? C.amber : C.muted }}>
                            {active} orden{active !== 1 ? "es" : ""} activa{active !== 1 ? "s" : ""}
                          </div>
                        )}
                        {(() => {
                          const ov = openVisits.find((v) => v.technician_id === t.id);
                          if (!ov) return null;
                          const o = orders.find((x) => x.id === ov.work_order_id);
                          return (
                            <div className="text-xs px-2 py-1 inline-flex items-center gap-1" style={{ background: C.green + "1A", color: C.green }}>
                              <MapPin size={11} /> En sitio{o ? ` · ${o.code}` : ""} desde {new Date(ov.check_in_at).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santo_Domingo" })}
                            </div>
                          );
                        })()}
                        {t.can_create_incidents && (
                          <div className="text-xs px-2 py-1 inline-block" style={{ background: C.blue + "1A", color: C.blue }}>
                            Puede reportar incidentes
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {branches.length === 0 && <div className="text-sm" style={{ color: C.muted }}>Primero crea una sucursal para poder agregar técnicos.</div>}
              </div>
            </div>
  );
}

// Pantalla: tools
export function VistaTools({ assignToolsByQuantity, bulkDeleteTools, bulkRetireTools, canDelete, canEdit, confirmToolReceipt, deleteToolList, groupToolsByTechnician, isTecnico, lendTool, profile, renderToolRow, returnTool, returnToolsByQuantity, selectedTools, setEditingToolList, setGroupToolsByTechnician, setSelectedTools, setShowAddTool, setShowAddToolList, setShowBulkTools, setToolSearch, setToolStatusFilter, setToolTechnicianFilter, setToolViewMode, technicianToolGroups, technicians, toolGroups, toolLists, toolLoans, toolSearch, toolStatusFilter, toolTechnicianFilter, toolViewMode, tools, toolsFiltered }) {
  return (
          <div>
              {!isTecnico && (
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setToolViewMode("herramientas")} className="px-3 py-1.5 text-sm font-semibold" style={toolViewMode === "herramientas" ? { background: C.amber, color: "#1A1500" } : { color: C.muted, border: `1px solid ${C.border}` }}>Herramientas</button>
                  <button onClick={() => setToolViewMode("listados")} className="px-3 py-1.5 text-sm font-semibold" style={toolViewMode === "listados" ? { background: C.amber, color: "#1A1500" } : { color: C.muted, border: `1px solid ${C.border}` }}>Listados</button>
                </div>
              )}
              {isTecnico ? (
                <div className="space-y-4">
                  {technicianToolGroups.map((g) => (
                    <div key={g.id}>
                      <div className="flex items-center gap-2 mb-1.5 px-1">
                        <ClipboardList size={14} style={{ color: C.amber }} />
                        <span className="text-sm font-semibold">{g.name}</span>
                        <span className="text-xs" style={{ color: C.muted }}>({g.tools.length})</span>
                      </div>
                      <div style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                        {g.tools.map((t) => (
                          <TechnicianToolRow
                            key={t.id}
                            tool={t}
                            technicians={technicians}
                            myTechnicianId={profile.technician_id}
                            activeLoan={toolLoans.find((l) => l.tool_id === t.id && !l.returned_at) || null}
                            onConfirmReceipt={confirmToolReceipt}
                            onLend={lendTool}
                            onReturn={returnTool}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  {technicianToolGroups.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>No tienes herramientas asignadas todavía.</div>}
                </div>
              ) : toolViewMode === "listados" ? (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-sm" style={{ color: C.muted }}>{toolLists.length} listado{toolLists.length !== 1 ? "s" : ""}</div>
                    {canEdit("tools") && (
                      <button onClick={() => setShowAddToolList(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
                        <Plus size={14} /> Nuevo listado
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {toolLists.map((list) => (
                      <ToolListCard
                        key={list.id}
                        list={list}
                        tools={tools.filter((t) => (list.tool_ids || []).includes(t.id))}
                        technicians={technicians}
                        canEdit={canEdit("tools")}
                        canDelete={canDelete("tools")}
                        onEdit={() => setEditingToolList(list)}
                        onDelete={() => deleteToolList(list.id)}
                        onAssign={assignToolsByQuantity}
                        onReturn={returnToolsByQuantity}
                      />
                    ))}
                    {toolLists.length === 0 && <div className="text-sm col-span-2 text-center py-8" style={{ color: C.muted }}>Todavía no has creado ningún listado. Un listado te permite agrupar varias herramientas (ej. "Kit básico de electricista") y asignarlas todas de una vez a un técnico.</div>}
                  </div>
                </div>
              ) : (
              <>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="text-sm" style={{ color: C.muted }}>
                  {toolsFiltered.length} herramienta{toolsFiltered.length !== 1 ? "s" : ""}{isTecnico ? " asignada" + (toolsFiltered.length !== 1 ? "s" : "") + " a ti" : ""}{selectedTools.size > 0 ? ` · ${selectedTools.size} seleccionadas` : ""}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {canDelete("tools") && selectedTools.size > 0 && (
                    <>
                      <button onClick={() => bulkRetireTools(Array.from(selectedTools))} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.panelAlt, color: C.red, border: `1px solid ${C.red}40` }}>
                        <Ban size={14} /> Dar de baja ({selectedTools.size})
                      </button>
                      <button onClick={() => bulkDeleteTools(Array.from(selectedTools))} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.red, color: "#fff" }}>
                        <Trash2 size={14} /> Eliminar seleccionadas ({selectedTools.size})
                      </button>
                    </>
                  )}
                  <div className="flex items-center gap-2 px-3 py-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <Search size={14} style={{ color: C.muted }} />
                    <input value={toolSearch} onChange={(e) => setToolSearch(e.target.value)} placeholder="Buscar herramienta..." className="bg-transparent outline-none text-sm" style={{ color: C.text, width: 160 }} />
                    {toolSearch && (
                      <button onClick={() => setToolSearch("")} style={{ color: C.muted }}><X size={13} /></button>
                    )}
                  </div>
                  {!isTecnico && (
                    <select value={toolTechnicianFilter} onChange={(e) => setToolTechnicianFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                      <option value="all">Todos los técnicos</option>
                      <option value="none">Sin asignar</option>
                      {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                    </select>
                  )}
                  <select value={toolStatusFilter} onChange={(e) => setToolStatusFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                    <option value="all">Todos los estados</option>
                    {Object.entries(TOOL_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  {!isTecnico && (
                    <label className="flex items-center gap-1.5 text-sm px-3 py-2 cursor-pointer" style={{ border: `1px solid ${C.border}`, color: C.text }}>
                      <input type="checkbox" checked={groupToolsByTechnician} onChange={(e) => setGroupToolsByTechnician(e.target.checked)} />
                      Agrupar por técnico
                    </label>
                  )}
                  {canDelete("tools") && toolsFiltered.length > 0 && (
                    <label className="flex items-center gap-1.5 text-sm px-3 py-2 cursor-pointer" style={{ border: `1px solid ${C.border}`, color: C.text }}>
                      <input
                        type="checkbox"
                        checked={toolsFiltered.length > 0 && toolsFiltered.every((t) => selectedTools.has(t.id))}
                        onChange={() => setSelectedTools((prev) => {
                          const allSelected = toolsFiltered.every((t) => prev.has(t.id));
                          if (allSelected) return new Set();
                          return new Set(toolsFiltered.map((t) => t.id));
                        })}
                      />
                      Seleccionar todas
                    </label>
                  )}
                  {canEdit("tools") && (
                    <button onClick={() => setShowBulkTools(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.panelAlt, color: C.text, border: `1px solid ${C.border}` }}>
                      <Upload size={14} /> Carga masiva
                    </button>
                  )}
                  {canEdit("tools") && (
                    <button onClick={() => setShowAddTool(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
                      <Plus size={14} /> Agregar herramienta
                    </button>
                  )}
                </div>
              </div>

              {groupToolsByTechnician && toolGroups ? (
                <div className="space-y-4">
                  {toolGroups.map((g) => (
                    <div key={g.id}>
                      <div className="flex items-center gap-2 mb-1.5 px-1">
                        <UserCheck size={14} style={{ color: C.amber }} />
                        <span className="text-sm font-semibold">{g.name}</span>
                        <span className="text-xs" style={{ color: C.muted }}>({g.tools.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {g.tools.map(renderToolRow)}
                      </div>
                    </div>
                  ))}
                  {toolGroups.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>No hay herramientas para este filtro.</div>}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {toolsFiltered.map(renderToolRow)}
                  {toolsFiltered.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>{isTecnico ? "No tienes herramientas asignadas todavía." : "Todavía no hay herramientas para este filtro."}</div>}
                </div>
              )}
              </>
              )}
            </div>
  );
}

// Pantalla: materials
export function VistaMaterials({ branchName, canDelete, canEdit, deleteMaterial, lowStockMaterials, materials, materialsLowStockOnly, setEditingMaterial, setMaterialsLowStockOnly, setShowAddMaterial, techUsesProducts, products, productStock, branches, orders, projects }) {
  // Empresa con técnico + comercial: aquí quedan los sobrantes (y los materiales que ya existían);
  // el inventario nuevo vive en Productos y se muestra abajo solo para consulta.
  const techProducts = techUsesProducts ? (products || []).filter((p) => p.tech_available && (p.item_type || "producto") !== "servicio" && !p.is_composite) : [];
  const stockByBranch = (productId) => (productStock || []).filter((r) => r.product_id === productId && Number(r.quantity) !== 0);
  const originLabel = (m) => {
    if (m.source_work_order_id) return `De ${(orders || []).find((o) => o.id === m.source_work_order_id)?.code || "una orden"}`;
    if (m.source_project_id) return `De proyecto ${(projects || []).find((p) => p.id === m.source_project_id)?.name || ""}`.trim();
    return null;
  };
  const sobrantes = materials.filter((m) => m.kind === "sobrante").length;
  return (
          <div>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="text-sm" style={{ color: C.muted }}>
                  {techUsesProducts
                    ? `${sobrantes} sobrante${sobrantes !== 1 ? "s" : ""}${materials.length - sobrantes > 0 ? ` y ${materials.length - sobrantes} material${materials.length - sobrantes !== 1 ? "es" : ""} anterior${materials.length - sobrantes !== 1 ? "es" : ""}` : ""} en el almacén técnico`
                    : `${materials.length} material${materials.length !== 1 ? "es" : ""} en almacén`}
                  {lowStockMaterials.length > 0 && <span style={{ color: C.red }}> &middot; {lowStockMaterials.length} con stock bajo</span>}
                </div>
                <div className="flex items-center gap-3">
                  {lowStockMaterials.length > 0 && (
                    <button onClick={() => setMaterialsLowStockOnly((v) => !v)} className="flex items-center gap-1 text-xs font-semibold" style={{ color: materialsLowStockOnly ? "#1A1500" : C.red, background: materialsLowStockOnly ? C.red : "transparent", border: `1px solid ${C.red}`, padding: "6px 10px" }}>
                      <AlertTriangle size={13} /> {materialsLowStockOnly ? "Ver todos" : `Ver solo bajo stock (${lowStockMaterials.length})`}
                    </button>
                  )}
                  {canEdit("materials") && (
                    <button onClick={() => setShowAddMaterial(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
                      <Plus size={14} /> {techUsesProducts ? "Agregar sobrante" : "Agregar material"}
                    </button>
                  )}
                </div>
              </div>
              {techUsesProducts && (
                <div className="mb-4 p-3 text-xs" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.muted }}>
                  Tu empresa lleva el inventario en <b style={{ color: C.text }}>Productos</b>. Aquí quedan los <b style={{ color: C.text }}>sobrantes</b> (material incompleto, usado o recuperado: sin costo y no se vende) y los materiales que ya estaban cargados antes.
                  Para que un producto se pueda usar en órdenes y proyectos, márcalo como "Disponible para el Departamento Técnico" en Productos.
                  <details className="mt-2">
                    <summary className="cursor-pointer" style={{ color: C.blue }}>Productos disponibles para el técnico ({techProducts.length})</summary>
                    <div className="mt-2 max-h-64 overflow-y-auto">
                      {techProducts.map((p) => (
                        <div key={p.id} className="flex justify-between gap-3 py-1" style={{ borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ color: C.text }}>{p.name}</span>
                          <span className="text-right">
                            <span className="font-mono" style={{ color: C.text }}>{Number(p.stock_qty || 0).toLocaleString("es-DO")} {p.unit || ""}</span>
                            {stockByBranch(p.id).length > 0 && <span className="ml-2">({stockByBranch(p.id).map((r) => `${(branches || []).find((b) => b.id === r.branch_id)?.name || "—"}: ${Number(r.quantity).toLocaleString("es-DO")}`).join(" · ")})</span>}
                          </span>
                        </div>
                      ))}
                      {techProducts.length === 0 && <div>Todavía no hay productos marcados para el Departamento Técnico.</div>}
                    </div>
                  </details>
                </div>
              )}
              <div className="overflow-x-auto" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-12 gap-2 min-w-[1080px] px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-3">{techUsesProducts ? "Material / sobrante" : "Material"}</div>
                  <div className="col-span-2">Código / Nº parte</div>
                  <div className="col-span-2">Ubicación</div>
                  <div className="col-span-1">Sucursal</div>
                  <div className="col-span-2 text-right">Stock (act. / mín. / máx.)</div>
                  <div className="col-span-2 text-right">Acciones</div>
                </div>
                {(materialsLowStockOnly ? lowStockMaterials : materials).map((m) => {
                  const isLow = m.min_quantity != null && Number(m.quantity || 0) <= Number(m.min_quantity);
                  return (
                  <div key={m.id} className="grid grid-cols-12 gap-2 min-w-[1080px] px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}`, background: isLow ? C.red + "15" : "transparent" }}>
                    <div className="col-span-3">
                      <div className="font-medium">{m.name}</div>
                      {techUsesProducts && (
                        <div className="text-[10px] uppercase tracking-wide" style={{ color: m.kind === "sobrante" ? C.amber : C.muted }}>
                          {m.kind === "sobrante" ? `Sobrante · ${LEFTOVER_CONDITIONS[m.condition] || "sin condición"}` : "Material anterior"}{originLabel(m) ? ` · ${originLabel(m)}` : ""}
                        </div>
                      )}
                      {m.description && <div className="text-xs" style={{ color: C.muted }}>{m.description}</div>}
                      {m.notes && <div className="text-xs" style={{ color: C.muted }}>{m.notes}</div>}
                    </div>
                    <div className="col-span-2 text-xs" style={{ color: C.muted }}>
                      {m.part_code && <div>ID: {m.part_code}</div>}
                      {m.part_number && <div>Parte: {m.part_number}</div>}
                      {m.serial_number && <div>Serie: {m.serial_number}</div>}
                      {!m.part_code && !m.part_number && !m.serial_number && "—"}
                    </div>
                    <div className="col-span-2 truncate" style={{ color: C.muted }}>{m.location || "—"}</div>
                    <div className="col-span-1 truncate" style={{ color: C.muted }}>{branchName(m.branch_id)}</div>
                    <div className="col-span-2 text-right font-mono" style={{ color: isLow ? C.red : C.text }}>
                      {Number(m.quantity || 0).toLocaleString("es-DO")} {m.unit || ""}
                      <span style={{ color: C.muted }}> / {m.min_quantity != null ? Number(m.min_quantity).toLocaleString("es-DO") : "—"} / {m.max_quantity != null ? Number(m.max_quantity).toLocaleString("es-DO") : "—"}</span>
                      {isLow && <div className="text-xs font-sans" style={{ color: C.red }}>Stock bajo</div>}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      {canEdit("materials") && <button onClick={() => setEditingMaterial(m)} style={iconBtnStyle}><Pencil size={14} /></button>}
                      {canDelete("materials") && <button onClick={() => deleteMaterial(m.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                    </div>
                  </div>
                  );
                })}
                {materials.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>{techUsesProducts ? "Todavía no hay sobrantes registrados." : "Todavía no hay materiales registrados en el almacén."}</div>}
                {materials.length > 0 && materialsLowStockOnly && lowStockMaterials.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>Ningún material está bajo su stock mínimo.</div>}
              </div>
            </div>
  );
}

// Pantalla: maintenanceSchedule
export function VistaMaintenanceSchedule({ branchName, canEdit, clients, dueClientAssets, dueEquipment, generateAllDueMaintenance, generateOneMaintenanceOrder, saving, techName, todayStr, upcomingClientAssets, upcomingEquipment, updateUsageReading }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="text-sm" style={{ color: C.muted }}>
                  {dueEquipment.length + dueClientAssets.length} pendiente{(dueEquipment.length + dueClientAssets.length) !== 1 ? "s" : ""} de generar
                </div>
                {canEdit("maintenanceSchedule") && (dueEquipment.length + dueClientAssets.length) > 0 && (
                  <button onClick={generateAllDueMaintenance} disabled={saving} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> Generar todas las vencidas ({dueEquipment.length + dueClientAssets.length})
                  </button>
                )}
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Equipos — plan de mantenimiento</div>
              <div className="mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-3">Equipo</div>
                  <div className="col-span-2">Sucursal</div>
                  <div className="col-span-2">Próximo mantenimiento</div>
                  <div className="col-span-2">Técnico por defecto</div>
                  <div className="col-span-1 text-center">Cada</div>
                  <div className="col-span-2 text-right">Acción</div>
                </div>
                {[...dueEquipment, ...upcomingEquipment].map((e) => {
                  const dueByDate = e.next_maintenance_date && e.next_maintenance_date <= todayStr;
                  const dueByUsage = e.usage_unit && e.usage_interval && e.current_usage != null &&
                    (Number(e.current_usage) - Number(e.usage_last_maintenance || 0)) >= Number(e.usage_interval);
                  const isDue = dueByDate || dueByUsage;
                  return (
                    <div key={e.id} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-start text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <div className="col-span-3 truncate">{e.name}</div>
                      <div className="col-span-2 truncate" style={{ color: C.muted }}>{branchName(e.branch_id)}</div>
                      <div className="col-span-2">
                        {e.next_maintenance_date ? (
                          <div className="font-mono" style={{ color: dueByDate ? C.red : C.amber }}>{fmtDate(e.next_maintenance_date)} {dueByDate ? "(vencido)" : "(próximo)"}</div>
                        ) : (
                          <div className="text-xs" style={{ color: C.muted }}>Sin fecha (solo por uso)</div>
                        )}
                        {e.usage_unit && <UsageQuickUpdate item={e} onUpdate={(v) => updateUsageReading(e, "equipment", v)} />}
                      </div>
                      <div className="col-span-2 truncate" style={{ color: C.muted }}>{techName(e.default_technician_id)}</div>
                      <div className="col-span-1 text-center font-mono" style={{ color: C.muted }}>{e.maintenance_frequency_days ? `${e.maintenance_frequency_days}d` : "—"}</div>
                      <div className="col-span-2 text-right">
                        {canEdit("maintenanceSchedule") && (
                          <button onClick={() => generateOneMaintenanceOrder(e, "equipment")} disabled={saving} className="text-xs px-2 py-1.5 font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
                            Generar orden
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {dueEquipment.length === 0 && upcomingEquipment.length === 0 && <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>Ningún equipo tiene mantenimiento vencido o próximo (7 días). Configura la frecuencia desde "Gestión de Equipos".</div>}
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Activos instalados en clientes — plan de mantenimiento</div>
              <div className="overflow-x-auto" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-3">Activo</div>
                  <div className="col-span-2">Cliente</div>
                  <div className="col-span-2">Próximo mantenimiento</div>
                  <div className="col-span-2">Técnico por defecto</div>
                  <div className="col-span-1 text-center">Cada</div>
                  <div className="col-span-2 text-right">Acción</div>
                </div>
                {[...dueClientAssets, ...upcomingClientAssets].map((a) => {
                  const dueByDate = a.next_maintenance_date && a.next_maintenance_date <= todayStr;
                  return (
                    <div key={a.id} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-start text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <div className="col-span-3 truncate">{a.name}</div>
                      <div className="col-span-2 truncate" style={{ color: C.muted }}>{clients.find((c) => c.id === a.client_id)?.name || "—"}</div>
                      <div className="col-span-2">
                        {a.next_maintenance_date ? (
                          <div className="font-mono" style={{ color: dueByDate ? C.red : C.amber }}>{fmtDate(a.next_maintenance_date)} {dueByDate ? "(vencido)" : "(próximo)"}</div>
                        ) : (
                          <div className="text-xs" style={{ color: C.muted }}>Sin fecha (solo por uso)</div>
                        )}
                        {a.usage_unit && <UsageQuickUpdate item={a} onUpdate={(v) => updateUsageReading(a, "client_asset", v)} />}
                      </div>
                      <div className="col-span-2 truncate" style={{ color: C.muted }}>{techName(a.default_technician_id)}</div>
                      <div className="col-span-1 text-center font-mono" style={{ color: C.muted }}>{a.maintenance_frequency_days ? `${a.maintenance_frequency_days}d` : "—"}</div>
                      <div className="col-span-2 text-right">
                        {canEdit("maintenanceSchedule") && (
                          <button onClick={() => generateOneMaintenanceOrder(a, "client_asset")} disabled={saving} className="text-xs px-2 py-1.5 font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
                            Generar orden
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {dueClientAssets.length === 0 && upcomingClientAssets.length === 0 && <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>Ningún activo de cliente tiene mantenimiento vencido o próximo (7 días). Configura la frecuencia desde "Activos en Garantía".</div>}
              </div>
            </div>
  );
}

// Pantalla: branches
export function VistaBranches({ branches, canDelete, canEdit, deleteBranch, equipment, orders, setEditingBranch, setShowAddBranch, technicians }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{branches.length} sucursales</div>
                <button onClick={() => setShowAddBranch(true)} disabled={!canEdit("branches")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Agregar sucursal
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {branches.map((b) => {
                  const techCount = technicians.filter((t) => t.branch_id === b.id).length;
                  const equipCount = equipment.filter((e) => e.branch_id === b.id).length;
                  const openOrders = orders.filter((o) => o.branch_id === b.id && o.status !== "completada").length;
                  return (
                    <div key={b.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold"><Building2 size={16} color={C.amber} /> {b.name}</div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingBranch(b)} style={iconBtnStyle}><Pencil size={13} /></button>
                          {canDelete("branches") && <button onClick={() => deleteBranch(b.id)} style={iconBtnStyle}><Trash2 size={13} /></button>}
                        </div>
                      </div>
                      <div className="text-sm mt-0.5" style={{ color: C.muted }}>{b.city}</div>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                        <div><div className="text-lg font-mono font-bold">{techCount}</div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Técnicos</div></div>
                        <div><div className="text-lg font-mono font-bold">{equipCount}</div><div className="text-[10px] uppercase" style={{ color: C.muted }}>Equipos</div></div>
                        <div><div className="text-lg font-mono font-bold" style={{ color: openOrders > 0 ? C.amber : C.text }}>{openOrders}</div><div className="text-[10px] uppercase" style={{ color: C.muted }}>OT abiertas</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
  );
}

// Pantalla: warranty
export function VistaWarranty({ activeWarrantyAssets, canDelete, canEdit, clients, deleteClientAsset, setEditingAsset, setShowAddAsset }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{activeWarrantyAssets.length} activos vigentes en garantía</div>
                <button onClick={() => setShowAddAsset(true)} disabled={!canEdit("warranty")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Agregar activo
                </button>
              </div>
              <div className="text-xs mb-3" style={{ color: C.muted }}>
                Los activos vencidos salen automáticamente de esta lista (siguen guardados, solo dejan de contar como "en garantía").
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {activeWarrantyAssets.map((a) => (
                  <div key={a.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{a.name}</div>
                        <div className="text-xs truncate" style={{ color: C.muted }}>{[a.brand, a.model].filter(Boolean).join(" · ") || a.serial_number || ""}</div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {canEdit("warranty") && <button onClick={() => setEditingAsset(a)} style={iconBtnStyle}><Pencil size={14} /></button>}
                        {canDelete("warranty") && <button onClick={() => deleteClientAsset(a.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                      </div>
                    </div>
                    <div className="text-sm truncate">{clients.find((c) => c.id === a.client_id)?.name || "—"}</div>
                    <div className="flex items-center justify-between pt-2 mt-2 text-xs" style={{ borderTop: `1px solid ${C.border}`, color: C.muted }}>
                      <span>Instalado: <span style={{ color: C.text }}>{fmtDate(a.install_date)}</span></span>
                      <Pill label={a.daysLeft <= 30 ? `${a.daysLeft} días` : fmtDate(a.warrantyEnd.toISOString().slice(0, 10))} color={a.daysLeft <= 7 ? C.red : a.daysLeft <= 30 ? C.amber : C.green} />
                    </div>
                  </div>
                ))}
                {activeWarrantyAssets.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>No hay activos vigentes en garantía en este momento.</div>}
              </div>
            </div>
  );
}

// Pantalla: checklists
export function VistaChecklists({ canDelete, canEdit, checklistTemplates, deleteChecklistTemplate, downloadChecklistsExcel, importChecklistsFromExcel, importingChecklists, selectedChecklists, setEditingChecklist, setSelectedChecklists, setShowAddChecklist }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>
                  {checklistTemplates.length} checklists configurados{selectedChecklists.size > 0 ? ` · ${selectedChecklists.size} seleccionados` : ""}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadChecklistsExcel(selectedChecklists.size > 0 ? checklistTemplates.filter((t) => selectedChecklists.has(t.id)) : checklistTemplates)}
                    disabled={checklistTemplates.length === 0}
                    className="flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50" style={{ color: C.amber, border: `1px solid ${C.border}` }}
                  >
                    <FileText size={14} /> {selectedChecklists.size > 0 ? `Descargar selección (${selectedChecklists.size})` : "Descargar Excel"}
                  </button>
                  {canEdit("checklists") && (
                    <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer" style={{ color: C.amber, border: `1px solid ${C.border}`, opacity: importingChecklists ? 0.5 : 1 }}>
                      <Upload size={14} /> {importingChecklists ? "Importando..." : "Subir Excel"}
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        disabled={importingChecklists}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) importChecklistsFromExcel(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  <button onClick={() => setShowAddChecklist(true)} disabled={!canEdit("checklists")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> Nuevo checklist
                  </button>
                </div>
              </div>
              <div className="text-xs mb-3" style={{ color: C.muted }}>
                Al abrir una orden preventiva sin checklist, podrás elegir cualquiera de los que tengas aquí, sin importar el tipo de equipo. Marca uno o varios abajo para descargar solo esos en Excel (columnas Tipo de equipo / Nombre del checklist / Tema / Punto a revisar); sin marcar ninguno, se descargan todos. Al subir ese mismo formato: si el tipo + nombre ya existen, se actualizan sus puntos; si no, se crean nuevos.
              </div>
              {checklistTemplates.length > 0 && (
                <label className="flex items-center gap-2 text-xs mb-2 cursor-pointer w-fit" style={{ color: C.muted }}>
                  <input
                    type="checkbox"
                    checked={selectedChecklists.size === checklistTemplates.length}
                    onChange={() => setSelectedChecklists(selectedChecklists.size === checklistTemplates.length ? new Set() : new Set(checklistTemplates.map((t) => t.id)))}
                  />
                  Seleccionar todos
                </label>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {checklistTemplates.map((t) => (
                  <div key={t.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedChecklists.has(t.id)}
                          onChange={() => setSelectedChecklists((prev) => {
                            const next = new Set(prev);
                            next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                            return next;
                          })}
                        />
                        <div>
                          <div className="font-semibold">{t.name}</div>
                          <div className="text-xs" style={{ color: C.muted }}>Tipo: {t.equipment_type}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canEdit("checklists") && <button onClick={() => setEditingChecklist(t)} style={iconBtnStyle}><Pencil size={13} /></button>}
                        {canDelete("checklists") && <button onClick={() => deleteChecklistTemplate(t.id)} style={iconBtnStyle}><Trash2 size={13} /></button>}
                      </div>
                    </div>
                    <div className="text-xs mt-2" style={{ color: C.muted }}>{t.items.length} punto{t.items.length !== 1 ? "s" : ""} a revisar</div>
                  </div>
                ))}
                {checklistTemplates.length === 0 && <div className="text-sm" style={{ color: C.muted }}>Todavía no has creado ningún checklist.</div>}
              </div>
            </div>
  );
}

// Pantalla: reports
export function VistaReports({ avgRepairTime, branchFilter, branchName, checklistCompliance, deadlineCompliance, equipChartData, equipStats, incidentEquipChartData, incidentSlaStats, mtbf, overdueOpenOrders, preventiveCompliance, reopenStats, reportsIncidents, reportsOrders, setHistoryFor, setTechReportDateFrom, setTechReportDateTo, techChartData, techName, techReportDateFrom, techReportDateTo, techStats }) {
  return (
          <div>
              <div className="flex flex-wrap items-end gap-3 mb-4 p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                <div className="text-xs" style={{ color: C.muted }}>
                  Sucursal: <span style={{ color: C.text }}>{branchFilter === "all" ? "Todas" : branchName(branchFilter)}</span> (se cambia arriba, en el filtro general)
                </div>
                <Field label="Desde">
                  <input type="date" className={inputClass} style={inputStyle} value={techReportDateFrom} onChange={(e) => setTechReportDateFrom(e.target.value)} />
                </Field>
                <Field label="Hasta">
                  <input type="date" className={inputClass} style={inputStyle} value={techReportDateTo} onChange={(e) => setTechReportDateTo(e.target.value)} />
                </Field>
                {(techReportDateFrom || techReportDateTo) && (
                  <button onClick={() => { setTechReportDateFrom(""); setTechReportDateTo(""); }} className="px-3 py-2 text-xs" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Quitar fechas</button>
                )}
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Indicadores clave</div>
              <div className="flex flex-wrap gap-3 mb-6">
                <KpiCard
                  label="Cumplimiento del preventivo"
                  value={preventiveCompliance.pct === null ? "—" : `${preventiveCompliance.pct.toFixed(0)}%`}
                  accent={preventiveCompliance.pct === null ? C.muted : preventiveCompliance.pct >= 80 ? C.green : preventiveCompliance.pct >= 50 ? C.amber : C.red}
                  sub={`${preventiveCompliance.done} completadas de ${preventiveCompliance.total} programadas`}
                />
                <KpiCard
                  label="MTTR (tiempo promedio de reparación)"
                  value={avgRepairTime.label}
                  accent={C.blue}
                  sub={`Órdenes correctivas cerradas (${avgRepairTime.n})`}
                />
                <KpiCard
                  label="MTBF (tiempo medio entre fallas)"
                  value={mtbf.label}
                  accent={C.blue}
                  sub={`Promedio entre correctivas de ${mtbf.nEquip} equipo${mtbf.nEquip !== 1 ? "s" : ""} con 2+ fallas`}
                />
                <KpiCard
                  label="Cumplimiento de fecha límite"
                  value={deadlineCompliance.pct === null ? "—" : `${deadlineCompliance.pct.toFixed(0)}%`}
                  accent={deadlineCompliance.pct === null ? C.muted : deadlineCompliance.pct >= 80 ? C.green : deadlineCompliance.pct >= 50 ? C.amber : C.red}
                  sub={`${deadlineCompliance.onTime} a tiempo de ${deadlineCompliance.total} con fecha límite`}
                />
                <KpiCard
                  label="Órdenes vencidas"
                  value={overdueOpenOrders.length}
                  accent={overdueOpenOrders.length === 0 ? C.green : overdueOpenOrders.length <= 3 ? C.amber : C.red}
                  sub="Abiertas y ya pasaron su fecha límite"
                />
                <KpiCard
                  label="Tasa de reapertura"
                  value={reopenStats.pct === null ? "—" : `${reopenStats.pct.toFixed(0)}%`}
                  accent={reopenStats.pct === null ? C.muted : reopenStats.pct <= 5 ? C.green : reopenStats.pct <= 15 ? C.amber : C.red}
                  sub={`${reopenStats.reopened} reabiertas de ${reopenStats.everCompleted} completadas`}
                />
                <KpiCard
                  label="Uso de checklist al cierre"
                  value={checklistCompliance.usagePct === null ? "—" : `${checklistCompliance.usagePct.toFixed(0)}%`}
                  accent={checklistCompliance.usagePct === null ? C.muted : checklistCompliance.usagePct >= 80 ? C.green : checklistCompliance.usagePct >= 50 ? C.amber : C.red}
                  sub={`${checklistCompliance.withChecklist} con checklist de ${checklistCompliance.closedTotal} cerradas`}
                />
                <KpiCard
                  label="Checklist completado al cierre"
                  value={checklistCompliance.completePct === null ? "—" : `${checklistCompliance.completePct.toFixed(0)}%`}
                  accent={checklistCompliance.completePct === null ? C.muted : checklistCompliance.completePct >= 95 ? C.green : checklistCompliance.completePct >= 80 ? C.amber : C.red}
                  sub={`${checklistCompliance.complete} de ${checklistCompliance.withChecklist} con checklist quedaron 100% respondidas`}
                />
              </div>

              {overdueOpenOrders.length > 0 && (
                <>
                  <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Órdenes vencidas — pendientes de cerrar</div>
                  <div className="mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                      <div className="col-span-2">Orden</div>
                      <div className="col-span-4">Título</div>
                      <div className="col-span-2">Técnico</div>
                      <div className="col-span-2">Fecha límite</div>
                      <div className="col-span-2 text-right">Días vencida</div>
                    </div>
                    {overdueOpenOrders.map((o) => (
                      <div key={o.id} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                        <div className="col-span-2 font-mono">{o.code}</div>
                        <div className="col-span-4 truncate">{o.title}</div>
                        <div className="col-span-2">{techName(o.technician_id)}</div>
                        <div className="col-span-2">{fmtDate(o.deadline)}</div>
                        <div className="col-span-2 text-right font-mono" style={{ color: o.daysOverdue > 7 ? C.red : C.amber }}>{o.daysOverdue} día{o.daysOverdue !== 1 ? "s" : ""}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Incidentes — resumen general</div>
              <div className="flex flex-wrap gap-3 mb-6">
                <KpiCard label="Abiertos" value={reportsIncidents.filter((i) => i.status === "abierto").length} accent={C.red} sub="Sin atender aún" />
                <KpiCard label="En revisión" value={reportsIncidents.filter((i) => i.status === "en_revision").length} accent={C.amber} sub="En proceso" />
                <KpiCard label="Completados" value={reportsIncidents.filter((i) => i.status === "resuelto").length} accent={C.green} sub="Con hallazgos registrados" />
                <KpiCard label="Descartados" value={reportsIncidents.filter((i) => i.status === "descartado").length} accent={C.muted} sub="No procedían" />
                <KpiCard label="Total de incidentes" value={reportsIncidents.length} accent={C.blue} sub="Histórico completo" />
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>SLA — tiempos promedio por prioridad</div>
              <div className="mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-3">Prioridad</div>
                  <div className="col-span-4">Tiempo promedio de atención</div>
                  <div className="col-span-5">Tiempo promedio de resolución</div>
                </div>
                {incidentSlaStats.map((s) => (
                  <div key={s.key} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="col-span-3"><Pill label={s.label} color={s.color} /></div>
                    <div className="col-span-4 font-mono">{s.responseLabel} <span className="text-xs" style={{ color: C.muted }}>({s.nResponse})</span></div>
                    <div className="col-span-5 font-mono">{s.resolutionLabel} <span className="text-xs" style={{ color: C.muted }}>({s.nResolution})</span></div>
                  </div>
                ))}
                <div className="px-4 py-2 text-xs" style={{ color: C.muted }}>
                  Atención = desde que se reportó hasta que se marcó "En revisión" (o se completó directo). Resolución = desde que se reportó hasta que se marcó "Completado". El número entre paréntesis es cuántos incidentes se usaron para el promedio.
                </div>
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Desempeño por técnico — por tipo de mantenimiento</div>
              <div className="p-4 mb-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={techChartData} margin={{ left: -20 }}>
                    <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
                    <Tooltip contentStyle={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }} cursor={{ fill: C.panelAlt }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: C.muted }} />
                    <Bar dataKey="Preventivo" stackId="a" fill={C.green} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Correctivo" stackId="a" fill={C.red} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Predictivo" stackId="a" fill={C.blue} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-2">Técnico</div>
                  <div className="col-span-1 text-center">Prev.</div>
                  <div className="col-span-1 text-center">Correc.</div>
                  <div className="col-span-1 text-center">Predic.</div>
                  <div className="col-span-2 text-center">Incidentes</div>
                  <div className="col-span-1 text-center">Total OT</div>
                  <div className="col-span-1 text-center">Reabiertas</div>
                  <div className="col-span-2 text-right">Costo M.O.</div>
                  <div className="col-span-1 text-right">Historial</div>
                </div>
                {techStats.map((t) => (
                  <div key={t.id} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="col-span-2">
                      <div>{t.name}</div>
                      <div className="text-xs" style={{ color: C.muted }}>{t.specialty}</div>
                    </div>
                    <div className="col-span-1 text-center font-mono" style={{ color: C.green }}>{t.preventivo}</div>
                    <div className="col-span-1 text-center font-mono" style={{ color: C.red }}>{t.correctivo}</div>
                    <div className="col-span-1 text-center font-mono" style={{ color: C.blue }}>{t.predictivo}</div>
                    <div className="col-span-2 text-center font-mono">
                      {t.incidentesTotal}
                      {t.incidentesAbiertos > 0 && <span style={{ color: C.amber }}> ({t.incidentesAbiertos} abiertos)</span>}
                    </div>
                    <div className="col-span-1 text-center font-mono">{t.total}</div>
                    <div className="col-span-1 text-center font-mono" style={{ color: t.reopened > 0 ? C.amber : C.muted }}>{t.reopened}</div>
                    <div className="col-span-2 text-right font-mono" style={{ color: C.muted }}>{fmtMoney(t.laborCost)}</div>
                    <div className="col-span-1 text-right">
                      <button onClick={() => setHistoryFor({ title: `Historial de ${t.name}`, orders: reportsOrders.filter((o) => o.technician_id === t.id) })} className="flex items-center gap-1 text-xs ml-auto" style={{ color: C.amber }}>
                        <History size={13} /> Ver
                      </button>
                    </div>
                  </div>
                ))}
                {techStats.length === 0 && <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>Todavía no hay técnicos registrados.</div>}
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Historial por equipo</div>
              <div className="p-4 mb-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="text-xs mb-2" style={{ color: C.muted }}>Equipos con más órdenes correctivas (posibles focos de problemas)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={equipChartData} margin={{ left: -20 }}>
                    <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.border }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
                    <Tooltip contentStyle={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }} cursor={{ fill: C.panelAlt }} />
                    <Bar dataKey="Correctivos" radius={[2, 2, 0, 0]}>
                      {equipChartData.map((_, i) => <Cell key={i} fill={C.red} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {incidentEquipChartData.length > 0 && (
                <div className="p-4 mb-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <div className="text-xs mb-2" style={{ color: C.muted }}>Equipos con más incidentes reportados</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={incidentEquipChartData} margin={{ left: -20 }}>
                      <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.border }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
                      <Tooltip contentStyle={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }} cursor={{ fill: C.panelAlt }} />
                      <Bar dataKey="Incidentes" radius={[2, 2, 0, 0]}>
                        {incidentEquipChartData.map((_, i) => <Cell key={i} fill={C.amber} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="overflow-x-auto" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-3">Equipo</div>
                  <div className="col-span-2 text-center">Abiertas</div>
                  <div className="col-span-1 text-center">Correctivas</div>
                  <div className="col-span-1 text-center">Incidentes</div>
                  <div className="col-span-1 text-center">Total OT</div>
                  <div className="col-span-2 text-right">Costo M.O.</div>
                  <div className="col-span-2 text-right">Historial</div>
                </div>
                {equipStats.map((eq) => (
                  <div key={eq.id} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="col-span-3">
                      <div>{eq.name}</div>
                      <div className="text-xs" style={{ color: C.muted }}>{branchName(eq.branch_id)}</div>
                    </div>
                    <div className="col-span-2 text-center font-mono" style={{ color: eq.open > 0 ? C.amber : C.muted }}>{eq.open}</div>
                    <div className="col-span-1 text-center font-mono" style={{ color: eq.correctivo > 0 ? C.red : C.muted }}>{eq.correctivo}</div>
                    <div className="col-span-1 text-center font-mono" style={{ color: eq.incidentesAbiertos > 0 ? C.amber : C.muted }}>{eq.incidentesTotal}</div>
                    <div className="col-span-1 text-center font-mono">{eq.total}</div>
                    <div className="col-span-2 text-right font-mono" style={{ color: C.muted }}>{fmtMoney(eq.laborCost)}</div>
                    <div className="col-span-2 text-right">
                      <button onClick={() => setHistoryFor({ title: `Historial de ${eq.name}`, orders: reportsOrders.filter((o) => o.equipment_id === eq.id) })} className="flex items-center gap-1 text-xs ml-auto" style={{ color: C.amber }}>
                        <History size={13} /> Ver
                      </button>
                    </div>
                  </div>
                ))}
                {equipStats.length === 0 && <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>Todavía no hay equipos registrados.</div>}
              </div>
            </div>
  );
}
