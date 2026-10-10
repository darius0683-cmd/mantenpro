// Modo Soporte (solo el administrador de la plataforma). Se carga solo cuando se usa.

import React from "react";
import { Users2, Users, Boxes, ClipboardList, FileText, ShoppingCart, Receipt, Truck, Hash, Wallet, ShieldCheck, Search, Building2, LogOut, CheckCircle2, X } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { C, Dot, Field, KpiCard, Pill, ROLE_CFG, ThemeToggleButton, fetchAllRows, fmtDate, fmtMoney, inputClass, inputStyle } from "./base.jsx";

// ---------------------------------------------------------------------------
// Modo Soporte (solo lectura) — para el admin de la plataforma, diagnóstico
// entre empresas. Nunca llama funciones de escritura.
// ---------------------------------------------------------------------------
export function GenericTable({ rows }) {
  if (!rows || rows.length === 0) return <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>Sin registros.</div>;
  const cols = Object.keys(rows[0]);
  const isDateCol = (c) => /(_at|_date)$/i.test(c) || c === "scheduled" || c === "deadline";
  const isMoneyCol = (c) => /(price|cost|amount|total|subtotal|itbis|rate|budget|balance)/i.test(c) && c !== "max_discount_pct";
  const STATUS_COLOR_HINTS = {
    pendiente: C.amber, abierto: C.amber, en_proceso: C.blue, asignada: C.blue, disponible: C.green,
    completada: C.green, pagada: C.green, emitida: C.green, activo: C.green, aprobada: C.green, sent: C.green, verificado: C.green,
    cancelada: C.red, vencida: C.red, rechazada: C.red, fallido: C.red, failed: C.red, baja: C.red, inactivo: C.red,
  };
  const renderCell = (col, val) => {
    if (val === null || val === undefined) return <span style={{ color: C.muted }}>—</span>;
    if (col === "role" && ROLE_CFG[val]) return <Pill label={ROLE_CFG[val].label} color={ROLE_CFG[val].color} />;
    if (typeof val === "boolean") return <span style={{ color: val ? C.green : C.muted }}>{val ? "Sí" : "No"}</span>;
    if (typeof val === "object") {
      const json = JSON.stringify(val);
      return <span title={json} className="font-mono" style={{ color: C.muted }}>{json.length > 40 ? json.slice(0, 40) + "…" : json}</span>;
    }
    if ((col === "status" || col.endsWith("_status")) && typeof val === "string") {
      return <Pill label={val.replace(/_/g, " ")} color={STATUS_COLOR_HINTS[val] || C.muted} />;
    }
    if (isMoneyCol(col) && !isNaN(Number(val))) return <span className="font-mono">{fmtMoney(val)}</span>;
    if (isDateCol(col) && typeof val === "string" && val.length >= 8) return fmtDate(val.slice(0, 10));
    return String(val);
  };
  return (
    <div className="overflow-auto" style={{ maxHeight: 480, border: `1px solid ${C.border}` }}>
      <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.panelAlt }}>
            {cols.map((c) => <th key={c} className="text-left px-2 py-1.5 whitespace-nowrap" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} style={{ borderBottom: `1px solid ${C.border}` }}>
              {cols.map((c) => (
                <td key={c} className="px-2 py-1.5 whitespace-nowrap" style={{ color: C.text }}>
                  {renderCell(c, r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const SUPPORT_TABS = [
  { key: "profiles", label: "Usuarios", Icon: Users2 },
  { key: "clients", label: "Clientes", Icon: Users },
  { key: "products", label: "Catálogo", Icon: Boxes },
  { key: "orders", label: "Órdenes de trabajo", Icon: ClipboardList },
  { key: "quotes", label: "Cotizaciones", Icon: FileText },
  { key: "salesOrders", label: "Órdenes de Venta", Icon: ShoppingCart },
  { key: "invoices", label: "Facturas", Icon: Receipt },
  { key: "purchases", label: "Compras", Icon: Truck },
  { key: "ncf", label: "Secuencias NCF", Icon: Hash },
  { key: "cashSessions", label: "Caja", Icon: Wallet },
];

export function SupportViewer({ onSignOut }) {
  const [companies, setCompanies] = useState([]);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [tab, setTab] = useState("profiles");
  const [data, setData] = useState({});
  const [error, setError] = useState("");
  const [billingNoteDraft, setBillingNoteDraft] = useState("");
  const [savingBilling, setSavingBilling] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingCompany, setDeletingCompany] = useState(false);
  const [savingModules, setSavingModules] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: comps, error: err } = await fetchAllRows(() => supabase.from("companies").select("*").order("name"));
      if (err) setError(err.message);
      setCompanies(comps || []);
      setLoadingCompanies(false);
    })();
  }, []);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;
  const companiesFiltered = companies.filter((c) => (c.name || "").toLowerCase().includes(companySearch.toLowerCase()));

  const loadCompanyData = async (companyId) => {
    setSelectedCompanyId(companyId);
    setData({});
    setTab("profiles");
    setBillingNoteDraft(companies.find((c) => c.id === companyId)?.billing_note || "");
    setDeleteConfirmText("");
    if (!companyId) return;
    setLoadingData(true);
    const [profs, cli, prod, ord, qts, sord, inv, purch, ncf, cash] = await Promise.all([
      fetchAllRows(() => supabase.from("profiles").select("*").eq("company_id", companyId).order("created_at")),
      fetchAllRows(() => supabase.from("clients").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("products").select("*").eq("company_id", companyId).order("name")),
      supabase.from("work_orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(200),
      supabase.from("quotes").select("*").eq("company_id", companyId).order("quote_date", { ascending: false }).limit(200),
      supabase.from("sales_orders").select("*").eq("company_id", companyId).order("order_date", { ascending: false }).limit(200),
      supabase.from("invoices").select("*").eq("company_id", companyId).order("invoice_date", { ascending: false }).limit(200),
      supabase.from("purchases").select("*").eq("company_id", companyId).order("purchase_date", { ascending: false }).limit(200),
      fetchAllRows(() => supabase.from("ncf_sequences").select("*").eq("company_id", companyId)),
      supabase.from("cash_sessions").select("*").eq("company_id", companyId).order("opened_at", { ascending: false }).limit(50),
    ]);
    setData({
      profiles: profs.data || [], clients: cli.data || [], products: prod.data || [], orders: ord.data || [],
      quotes: qts.data || [], salesOrders: sord.data || [], invoices: inv.data || [], purchases: purch.data || [],
      ncf: ncf.data || [], cashSessions: cash.data || [],
    });
    setLoadingData(false);
  };

  const totalFacturado = (data.invoices || []).reduce((s, inv) => s + (Number(inv.total) || 0), 0);

  // Suspender/reactivar el acceso de una empresa por cobro. Solo puede hacerse desde
  // aquí (Modo Soporte): la app bloquea del lado del servidor (trigger
  // protect_company_billing_status) que un admin de empresa cambie estas columnas
  // desde su propio panel, así que este es el único lugar donde de verdad surte efecto.
  const toggleBillingStatus = async (companyId, nextStatus) => {
    setSavingBilling(true);
    setError("");
    const { data: updated, error: err } = await supabase
      .from("companies")
      .update({ billing_status: nextStatus, billing_note: billingNoteDraft.trim() || null, billing_status_updated_at: new Date().toISOString() })
      .eq("id", companyId)
      .select()
      .maybeSingle();
    setSavingBilling(false);
    if (err) { setError(err.message); return; }
    if (!updated) { setError("No se pudo actualizar el estado de cobro."); return; }
    setCompanies((prev) => prev.map((c) => (c.id === companyId ? updated : c)));
  };

  // Venta por módulos: prende/apaga un módulo para la empresa. El candado real está en
  // RLS (company_has_module, ver venta-por-modulos.sql) — esto solo decide qué módulos
  // tiene contratados; el frontend de la empresa (hasPerm) lo usa para ocultar el menú.
  const toggleCompanyModule = async (companyId, mod) => {
    const current = companies.find((c) => c.id === companyId)?.enabled_modules || [];
    const turningOn = !current.includes(mod);
    let next = turningOn ? [...current, mod] : current.filter((m) => m !== mod);
    // Dependencias de las piezas del técnico: una pieza necesita el Técnico base, y
    // Mantenimiento programado / Análisis necesitan Gestión de equipos.
    const deps = {
      equipos: ["tecnico"], checklists: ["tecnico"], inventario: ["tecnico"], preventivo: ["tecnico", "equipos"], analisis: ["tecnico", "equipos"],
      recurrentes: ["comercial"], ventas_avanzado: ["comercial"], compras_avanzado: ["comercial"], auditoria: ["administracion"],
    };
    if (turningOn) (deps[mod] || []).forEach((d) => { if (!next.includes(d)) next.push(d); });
    else next = next.filter((m) => !(deps[m] || []).includes(mod));
    setSavingModules(true);
    setError("");
    const { data: updated, error: err } = await supabase
      .from("companies")
      .update({ enabled_modules: next })
      .eq("id", companyId)
      .select()
      .maybeSingle();
    setSavingModules(false);
    if (err) { setError(err.message); return; }
    if (!updated) { setError("No se pudo actualizar los módulos."); return; }
    setCompanies((prev) => prev.map((c) => (c.id === companyId ? updated : c)));
  };

  // Edición (pyme / industrial) y prueba gratis. Solo el admin de la plataforma puede cambiar
  // estas columnas (trigger protect_company_plan, pyme-edicion.sql).
  const updateCompanyPlan = async (companyId, patch) => {
    setSavingModules(true);
    setError("");
    const { data: updated, error: err } = await supabase.from("companies").update(patch).eq("id", companyId).select().maybeSingle();
    setSavingModules(false);
    if (err) { setError(err.message); return; }
    if (!updated) { setError("No se pudo actualizar la empresa."); return; }
    setCompanies((prev) => prev.map((c) => (c.id === companyId ? updated : c)));
  };
  const extendTrial = (company, days) => {
    const base = Math.max(Date.now(), company.trial_ends_at ? new Date(company.trial_ends_at).getTime() : 0);
    updateCompanyPlan(company.id, { trial_ends_at: new Date(base + days * 86400000).toISOString() });
  };

  // Candado del lado del cliente: refleja lo mismo que la función del servidor va a
  // verificar de todos modos (platform_admin_delete_empty_company revisa las 8 tablas
  // completas, incluidas credit_notes e incidents que aquí no se cargan). Esto solo
  // decide si mostrar el formulario de borrado o el aviso de "ya tiene actividad";
  // el candado real está en la base de datos, no aquí.
  const companyHasHistory = (data.orders || []).length > 0 || (data.quotes || []).length > 0 ||
    (data.salesOrders || []).length > 0 || (data.invoices || []).length > 0 ||
    (data.purchases || []).length > 0 || (data.cashSessions || []).length > 0;

  const doDeleteCompany = async (companyToDelete) => {
    if (deleteConfirmText.trim() !== companyToDelete.name) return;
    if (!window.confirm(`¿Borrar "${companyToDelete.name}" por completo? Esto no se puede deshacer.`)) return;
    setDeletingCompany(true);
    setError("");
    const { error: err } = await supabase.rpc("platform_admin_delete_empty_company", {
      p_company_id: companyToDelete.id,
      p_company_name_confirm: deleteConfirmText.trim(),
    });
    setDeletingCompany(false);
    if (err) { setError(err.message); return; }
    setCompanies((prev) => prev.filter((c) => c.id !== companyToDelete.id));
    setSelectedCompanyId("");
    setData({});
    setDeleteConfirmText("");
    window.alert(`"${companyToDelete.name}" fue borrada. Falta un paso manual: borra el login de sus usuarios desde Authentication → Users en el panel de Supabase (eso no se puede hacer por SQL).`);
  };

  return (
    <div className="w-full min-h-screen flex" style={{ background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="w-64 flex-shrink-0 flex flex-col" style={{ background: C.panel, borderRight: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <ShieldCheck size={18} color={C.amber} />
          <div>
            <div className="font-bold text-sm leading-none">MantenPro</div>
            <div className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: C.amber }}>Modo Soporte</div>
          </div>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
            <Search size={14} style={{ color: C.muted }} />
            <input value={companySearch} onChange={(e) => setCompanySearch(e.target.value)} placeholder="Buscar empresa..." className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto">
          {loadingCompanies ? (
            <div className="px-5 py-4 text-sm" style={{ color: C.muted }}>Cargando empresas...</div>
          ) : companiesFiltered.length === 0 ? (
            <div className="px-5 py-4 text-sm" style={{ color: C.muted }}>Ninguna empresa coincide.</div>
          ) : companiesFiltered.map((c) => (
            <button
              key={c.id} onClick={() => loadCompanyData(c.id)}
              className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left"
              style={{ color: selectedCompanyId === c.id ? C.text : C.muted, background: selectedCompanyId === c.id ? C.panelAlt : "transparent", borderLeft: `2px solid ${selectedCompanyId === c.id ? C.amber : "transparent"}` }}
            >
              <Building2 size={16} />
              <span className="truncate flex-1">{c.name}</span>
              {c.billing_status === "suspendida" && <Dot color={C.red} />}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <ThemeToggleButton />
          <button onClick={onSignOut} className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
            <LogOut size={13} /> Cerrar sesión
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {error && (
          <div className="px-4 py-2 text-xs" style={{ background: C.redBg, color: C.red }}>Error: {error}</div>
        )}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedCompany ? (
            <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: C.muted }}>
              Selecciona una empresa a la izquierda para inspeccionar sus datos.
            </div>
          ) : (
            <>
              <div className="mb-5">
                <div className="flex items-center gap-3">
                  <div className="text-xl font-bold">{selectedCompany.name}</div>
                  <Pill label={selectedCompany.billing_status === "suspendida" ? "Suspendida" : "Al día"} color={selectedCompany.billing_status === "suspendida" ? C.red : C.green} />
                </div>
                <div className="text-xs mt-1" style={{ color: C.muted }}>
                  {selectedCompany.created_at && `Creada el ${fmtDate((selectedCompany.created_at || "").slice(0, 10))}`}
                  {selectedCompany.rnc && ` · RNC ${selectedCompany.rnc}`}
                  <span className="font-mono"> · {selectedCompany.id}</span>
                </div>
              </div>

              <div className="mb-6 p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: C.muted }}>Cobro / suscripción</div>
                <textarea
                  value={billingNoteDraft}
                  onChange={(e) => setBillingNoteDraft(e.target.value)}
                  placeholder="Nota opcional (motivo de suspensión, referencia de pago, etc.) — se muestra a la empresa si está suspendida."
                  className="w-full text-sm mb-3 p-2"
                  style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text, minHeight: 60 }}
                />
                {selectedCompany.billing_status === "suspendida" ? (
                  <button
                    disabled={savingBilling}
                    onClick={() => toggleBillingStatus(selectedCompany.id, "al_dia")}
                    className="px-3 py-2 text-xs font-semibold"
                    style={{ background: C.green, color: "#08210F", opacity: savingBilling ? 0.6 : 1 }}
                  >
                    Reactivar acceso
                  </button>
                ) : (
                  <button
                    disabled={savingBilling}
                    onClick={() => toggleBillingStatus(selectedCompany.id, "suspendida")}
                    className="px-3 py-2 text-xs font-semibold"
                    style={{ background: C.red, color: "#fff", opacity: savingBilling ? 0.6 : 1 }}
                  >
                    Suspender acceso
                  </button>
                )}
                {selectedCompany.billing_status_updated_at && (
                  <div className="text-xs mt-2" style={{ color: C.muted }}>Último cambio: {fmtDate((selectedCompany.billing_status_updated_at || "").slice(0, 10))}</div>
                )}
              </div>

              <div className="mb-6 p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: C.muted }}>Edición y prueba</div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {[["pyme", "Pyme"], ["industrial", "Industrial"]].map(([key, label]) => {
                    const on = (selectedCompany.edition || "industrial") === key;
                    return (
                      <button key={key} disabled={savingModules || on} onClick={() => updateCompanyPlan(selectedCompany.id, { edition: key })}
                        className="px-3 py-2 text-xs font-semibold"
                        style={{ background: on ? C.amber + "20" : C.panelAlt, color: on ? C.amber : C.muted, border: `1px solid ${on ? C.amber + "60" : C.border}`, opacity: savingModules ? 0.6 : 1 }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                {selectedCompany.trial_ends_at ? (
                  <div className="mb-5">
                    <div className="text-sm mb-2" style={{ color: new Date(selectedCompany.trial_ends_at).getTime() <= Date.now() ? C.red : C.text }}>
                      {new Date(selectedCompany.trial_ends_at).getTime() <= Date.now() ? "Prueba vencida el " : "En prueba gratis hasta el "}<b>{fmtDate(selectedCompany.trial_ends_at.slice(0, 10))}</b>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button disabled={savingModules} onClick={() => { if (window.confirm(`¿Activar la suscripción de ${selectedCompany.name}? Se quita la fecha de fin de prueba y queda con los módulos marcados abajo.`)) updateCompanyPlan(selectedCompany.id, { trial_ends_at: null }); }}
                        className="px-3 py-2 text-xs font-semibold" style={{ background: C.green, color: "#fff", opacity: savingModules ? 0.6 : 1 }}>
                        Activar suscripción (quitar prueba)
                      </button>
                      <button disabled={savingModules} onClick={() => extendTrial(selectedCompany, 15)}
                        className="px-3 py-2 text-xs font-semibold" style={{ background: C.panelAlt, color: C.text, border: `1px solid ${C.border}`, opacity: savingModules ? 0.6 : 1 }}>
                        Dar 15 días más
                      </button>
                    </div>
                    <div className="text-xs mt-2" style={{ color: C.muted }}>Antes de activar, desmarca abajo las piezas que no contrató.</div>
                  </div>
                ) : (
                  <div className="text-xs mb-5" style={{ color: C.muted }}>Sin prueba: suscripción activa.</div>
                )}
                <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: C.muted }}>Módulos contratados</div>
                <div className="text-xs mb-3" style={{ color: C.muted }}>Lo que desmarques aquí desaparece del menú de la empresa y queda bloqueado por RLS, aunque alguien llame la API directo.</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "tecnico", label: "Técnico base" },
                    { key: "equipos", label: "+ Gestión de equipos" },
                    { key: "checklists", label: "+ Checklists" },
                    { key: "inventario", label: "+ Herramientas" },
                    { key: "preventivo", label: "+ Mantenimiento programado" },
                    { key: "analisis", label: "+ Análisis de equipos" },
                    { key: "comercial", label: "Comercial (facturación e inventario)" },
                    { key: "recurrentes", label: "+ Contratos recurrentes" },
                    { key: "sucursales", label: "+ Varias sucursales" },
                    { key: "ventas_avanzado", label: "Órdenes de venta y notas de débito (Industrial)" },
                    { key: "compras_avanzado", label: "Pedidos, notas de entrega y recibos de proveedor (Industrial)" },
                    { key: "administracion", label: "Administración" },
                    { key: "auditoria", label: "Historial de actividad (Industrial)" },
                    { key: "contable", label: "Gestión Contable" },
                    { key: "nomina", label: "Nómina" },
                  ].map((m) => {
                    const on = (selectedCompany.enabled_modules || []).includes(m.key);
                    return (
                      <button
                        key={m.key}
                        disabled={savingModules}
                        onClick={() => toggleCompanyModule(selectedCompany.id, m.key)}
                        className="px-3 py-2 text-xs font-semibold flex items-center gap-2"
                        style={{ background: on ? C.green + "20" : C.panelAlt, color: on ? C.green : C.muted, border: `1px solid ${on ? C.green + "60" : C.border}`, opacity: savingModules ? 0.6 : 1 }}
                      >
                        {on ? <CheckCircle2 size={13} /> : <X size={13} />} {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {loadingData ? (
                <div className="text-sm" style={{ color: C.muted }}>Cargando datos...</div>
              ) : (
                <>
                  <div className="mb-6 p-4" style={{ background: C.panel, border: `1px solid ${C.red}60` }}>
                    <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: C.red }}>Zona de peligro</div>
                    {companyHasHistory ? (
                      <div className="text-sm" style={{ color: C.muted }}>
                        Esta empresa ya tiene actividad registrada (órdenes, cotizaciones, órdenes de venta, facturas, compras o sesiones de caja), así que no se puede borrar. Si dejó de pagar, usa "Suspender acceso" arriba — borrar destruiría facturas con NCF que hay que conservar para la DGII.
                      </div>
                    ) : (
                      <>
                        <div className="text-sm mb-3" style={{ color: C.muted }}>
                          Esta empresa no tiene ninguna operación registrada todavía (sirve para limpiar una empresa de prueba o creada por error). Borrarla es permanente y no se puede deshacer.
                        </div>
                        <Field label={`Para confirmar, escribe el nombre exacto de la empresa: "${selectedCompany.name}"`}>
                          <input className={inputClass} style={inputStyle} value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder={selectedCompany.name} />
                        </Field>
                        <button
                          disabled={deletingCompany || deleteConfirmText.trim() !== selectedCompany.name}
                          onClick={() => doDeleteCompany(selectedCompany)}
                          className="px-3 py-2 text-xs font-semibold disabled:opacity-40"
                          style={{ background: C.red, color: "#fff" }}
                        >
                          {deletingCompany ? "Borrando..." : "Eliminar empresa"}
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex gap-3 flex-wrap mb-6">
                    <KpiCard label="Usuarios" value={(data.profiles || []).length} accent={C.blue} />
                    <KpiCard label="Clientes" value={(data.clients || []).length} accent={C.green} />
                    <KpiCard label="Órdenes de trabajo" value={(data.orders || []).length} accent={C.amber} />
                    <KpiCard label="Facturado" value={fmtMoney(totalFacturado)} accent={C.muted} sub={`${(data.invoices || []).length} factura${(data.invoices || []).length !== 1 ? "s" : ""}`} />
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {SUPPORT_TABS.map((t) => (
                      <button
                        key={t.key} onClick={() => setTab(t.key)}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold"
                        style={{ background: tab === t.key ? C.amber : C.panel, color: tab === t.key ? "#1A1500" : C.muted, border: `1px solid ${tab === t.key ? C.amber : C.border}` }}
                      >
                        <t.Icon size={13} />
                        {t.label}{data[t.key] ? ` (${data[t.key].length})` : ""}
                      </button>
                    ))}
                  </div>
                  <GenericTable rows={data[tab]} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
