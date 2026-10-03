// Pantallas de Administración (usuarios e historial).
// Cada componente es el JSX de una pantalla del Dashboard, copiado tal cual. Todo lo que usa
// (estados, funciones y cálculos del Dashboard) le llega por props con el mismo nombre.
// Se carga solo cuando se abre la pantalla (ver lazy.jsx).
import React from "react";
import { ACTIVITY_ACTION_LABELS, ACTIVITY_TABLE_LABELS, C, Pill, ROLE_CFG, fmtDate, iconBtnStyle, inputStyle, listHtml, printDocument } from "./base.jsx";
import { Ban, FileText, Mail, RotateCcw, Trash2 } from "lucide-react";

// Registros borrados que se pueden restaurar desde el historial (misma lista que
// restore_deleted_record en restaurar-registros.sql; el servidor vuelve a validar todo).
const RESTORABLE_TABLES = new Set(["branches", "clients", "suppliers", "technicians", "equipment", "locations", "client_assets", "tools", "inventory_materials", "incidents", "chart_of_accounts", "tax_rates"]);

// Pantalla: users
export function VistaUsers({ branches, canDelete, canEdit, cancelInvite, invites, profiles, setEditingPermissionsFor, setShowInvite, toggleUserActive, updateMaxDiscount }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{profiles.length} usuarios · {invites.length} invitaciones pendientes</div>
                <button onClick={() => setShowInvite(true)} disabled={!canEdit("users")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Mail size={14} /> Invitar usuario
                </button>
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Miembros de la empresa</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
                {profiles.map((p) => (
                  <div key={p.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}`, opacity: (p.is_active ?? true) ? 1 : 0.5 }}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{p.full_name || p.email}</div>
                        <div className="text-xs truncate" style={{ color: C.muted }}>{p.email}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Pill label={ROLE_CFG[p.role]?.label || p.role} color={ROLE_CFG[p.role]?.color || C.muted} />
                        {!(p.is_active ?? true) && <Pill label="Inactivo" color={C.red} />}
                      </div>
                    </div>
                    <div className="text-xs mb-2" style={{ color: C.muted }}>
                      Sucursal: <span style={{ color: C.text }}>{branches.find((b) => b.id === p.branch_id)?.name || "Sin fijar (varias)"}</span>
                      {p.extra_branch_ids?.length > 0 && <span> · también en {p.extra_branch_ids.map((id) => branches.find((b) => b.id === id)?.name).filter(Boolean).join(", ")}</span>}
                    </div>
                    <div className="flex items-center justify-between pt-2 mt-1" style={{ borderTop: `1px solid ${C.border}` }}>
                      {p.role === "supervisor" ? (
                        <label className="flex items-center gap-1 text-xs" style={{ color: C.muted }}>
                          Descuento máx.
                          <input
                            type="number" min="0" max="100" step="1" defaultValue={p.max_discount_pct ?? 0}
                            onBlur={(e) => updateMaxDiscount(p.id, e.target.value)}
                            className="w-16 px-2 py-1 text-xs" style={{ ...inputStyle }}
                          />%
                        </label>
                      ) : <span />}
                      {p.role !== "admin" && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleUserActive(p)}
                            className="flex items-center gap-1 text-xs px-2 py-1"
                            style={{ border: `1px solid ${(p.is_active ?? true) ? C.red + "40" : C.green + "40"}`, color: (p.is_active ?? true) ? C.red : C.green }}
                          >
                            {(p.is_active ?? true) ? <><Ban size={12} /> Desactivar</> : <><RotateCcw size={12} /> Reactivar</>}
                          </button>
                          <button onClick={() => setEditingPermissionsFor(p)} className="text-xs px-2 py-1" style={{ border: `1px solid ${C.border}`, color: C.amber }}>Gestionar</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Invitaciones pendientes</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {invites.map((i) => (
                  <div key={i.id} className="p-4 flex items-center justify-between" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div>
                      <div>{i.email}</div>
                      <div className="text-xs" style={{ color: C.muted }}>Pendiente de aceptar</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Pill label={ROLE_CFG[i.role]?.label || i.role} color={ROLE_CFG[i.role]?.color || C.muted} />
                      {canDelete("users") && <button onClick={() => cancelInvite(i.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                    </div>
                  </div>
                ))}
                {invites.length === 0 && <div className="col-span-full px-4 py-6 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>No hay invitaciones pendientes.</div>}
              </div>
            </div>
  );
}

// Pantalla: activityLog
export function VistaActivityLog({ canRestore, onRestoreDeleted, activityActionFilter, activityDateFrom, activityDateTo, activityLogFiltered, activityTableFilter, activityTablesPresent, activityUserFilter, activityUserName, activityUsers, companyName, describeActivityEntry, loadingActivityLog, setActivityActionFilter, setActivityDateFrom, setActivityDateTo, setActivityTableFilter, setActivityUserFilter }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="text-sm" style={{ color: C.muted }}>
                  {loadingActivityLog ? "Cargando..." : `${activityLogFiltered.length} registro${activityLogFiltered.length !== 1 ? "s" : ""}`}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const rows = activityLogFiltered.map((l) => {
                        const dt = new Date(l.changed_at);
                        return [
                          `${dt.toLocaleDateString("es-DO")} ${dt.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}`,
                          ACTIVITY_TABLE_LABELS[l.table_name] || l.table_name,
                          ACTIVITY_ACTION_LABELS[l.action]?.label || l.action,
                          activityUserName(l.changed_by_email),
                          describeActivityEntry(l) || "—",
                        ];
                      });
                      printDocument("Historial de actividad", listHtml(`Historial de actividad — ${fmtDate(activityDateFrom)} a ${fmtDate(activityDateTo)}`, companyName, ["Fecha y hora", "Módulo", "Acción", "Usuario", "Detalle"], rows));
                    }}
                    disabled={activityLogFiltered.length === 0}
                    className="flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.text }}
                  >
                    <FileText size={14} /> Descargar PDF
                  </button>
                  <button
                    onClick={() => {
                      const header = ["Fecha", "Hora", "Módulo", "Acción", "Usuario", "Detalle"];
                      const rows = activityLogFiltered.map((l) => {
                        const dt = new Date(l.changed_at);
                        return [
                          dt.toLocaleDateString("es-DO"),
                          dt.toLocaleTimeString("es-DO"),
                          ACTIVITY_TABLE_LABELS[l.table_name] || l.table_name,
                          ACTIVITY_ACTION_LABELS[l.action]?.label || l.action,
                          activityUserName(l.changed_by_email),
                          describeActivityEntry(l),
                        ];
                      });
                      const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
                      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = `historial-actividad_${activityDateFrom}_a_${activityDateTo}.csv`; a.click();
                      URL.revokeObjectURL(url);
                    }}
                    disabled={activityLogFiltered.length === 0}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}
                  >
                    <FileText size={14} /> Descargar historial (CSV)
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Desde</div>
                  <input type="date" value={activityDateFrom} onChange={(e) => setActivityDateFrom(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Hasta</div>
                  <input type="date" value={activityDateTo} onChange={(e) => setActivityDateTo(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                <select value={activityTableFilter} onChange={(e) => setActivityTableFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los módulos</option>
                  {activityTablesPresent.map((tn) => <option key={tn} value={tn}>{ACTIVITY_TABLE_LABELS[tn] || tn}</option>)}
                </select>
                <select value={activityActionFilter} onChange={(e) => setActivityActionFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todas las acciones</option>
                  {Object.entries(ACTIVITY_ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={activityUserFilter} onChange={(e) => setActivityUserFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los usuarios</option>
                  {activityUsers.map((email) => <option key={email} value={email}>{activityUserName(email)}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                {(() => {
                  // Último "Creado" de cada registro: si es posterior al borrado, ya se restauró.
                  const lastInsertAt = {};
                  activityLogFiltered.forEach((x) => { if (x.action === "INSERT" && x.record_id && (!lastInsertAt[x.record_id] || x.changed_at > lastInsertAt[x.record_id])) lastInsertAt[x.record_id] = x.changed_at; });
                  return activityLogFiltered.map((l) => {
                  const restorable = canRestore && l.action === "DELETE" && RESTORABLE_TABLES.has(l.table_name) && l.old_data;
                  const alreadyRestored = restorable && lastInsertAt[l.record_id] && lastInsertAt[l.record_id] > l.changed_at;
                  const a = ACTIVITY_ACTION_LABELS[l.action] || { label: l.action, color: C.muted };
                  const dt = new Date(l.changed_at);
                  return (
                    <div key={l.id} className="p-3" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <Pill label={a.label} color={a.color} />
                          <span className="text-sm font-medium">{ACTIVITY_TABLE_LABELS[l.table_name] || l.table_name}</span>
                        </div>
                        <div className="text-xs flex-shrink-0" style={{ color: C.muted }}>{dt.toLocaleDateString("es-DO")} · {dt.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <div className="text-xs" style={{ color: C.muted }}>{describeActivityEntry(l) || "—"}</div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="text-xs" style={{ color: C.muted }}>Por: <span style={{ color: C.text }}>{activityUserName(l.changed_by_email)}</span></div>
                        {restorable && (alreadyRestored ? (
                          <span className="text-xs" style={{ color: C.green }}>Restaurado</span>
                        ) : (
                          <button onClick={() => onRestoreDeleted(l)} className="flex items-center gap-1 text-xs px-2 py-1" style={{ border: `1px solid ${C.amber}`, color: C.amber }}>
                            <RotateCcw size={12} /> Restaurar
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                  });
                })()}
                {!loadingActivityLog && activityLogFiltered.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>No hay actividad registrada en este rango.</div>}
              </div>
            </div>
  );
}
