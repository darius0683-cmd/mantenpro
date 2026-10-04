// Piezas compartidas por toda la app: colores/tema, formatos, constantes, componentes
// pequeños reutilizables (Modal, Field, buscadores...) y generadores de impresión.
// Se carga siempre al abrir la app.

import React from "react";
import { Moon, Sun, X, Loader2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useState, useEffect } from "react";

// Dominio real de producción. Los links que se le envían a alguien de FUERA de la app
// (invitación a un usuario nuevo, correo de "olvidé mi contraseña") NO deben depender de
// window.location.origin — si quien genera el link tenía la app abierta en localhost
// (probando en su máquina), el link saldría apuntando a localhost y la otra persona no
// podría abrirlo. Por eso estos dos casos siempre usan APP_URL a propósito, en vez del
// origin actual.
export const APP_URL = "https://app.manticrd.com";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
// Ventana (en días) para sugerir coincidencias automáticas en conciliación bancaria.
// Se amplió de 5 a 45 días porque hay créditos a clientes/proveedores de hasta 45 días
// entre la fecha de la factura y la fecha real del pago.
export const BANK_MATCH_WINDOW_DAYS = 45;
// ---- Tema claro / oscuro ----
// Los colores viven en el objeto C, que se usa en todo el archivo (incluyendo mezclas tipo
// C.amber + "60" para transparencias, por eso todos los valores son hex de 6 dígitos).
// El tema se elige por dispositivo (localStorage) y se aplica al cargar; al cambiarlo se
// recarga la página — la sección abierta se conserva porque va en la URL (?view=).
export const THEMES = {
  dark: {
    bg: "#12151A",
    panel: "#1B1F27",
    panelAlt: "#20242D",
    border: "#2A2F3A",
    text: "#EDEBE6",
    muted: "#8B92A0",
    // Color de marca/acento (botones primarios, portada, resaltados). Se deja la clave
    // "amber" (se usa en más de 250 lugares) aunque hoy el color es verde claro.
    amber: "#8FD14F",
    green: "#4CAF6D",
    red: "#E8654F",
    blue: "#4FA8D8",
    orange: "#F2A93B",
    redBg: "#3A2020",
  },
  light: {
    bg: "#F3F5F8",
    panel: "#FFFFFF",
    panelAlt: "#EEF1F5",
    border: "#D5DBE3",
    text: "#1B2230",
    muted: "#5C6878",
    amber: "#3F8A14",
    green: "#23804A",
    red: "#C5412B",
    blue: "#1F6FA3",
    orange: "#B56A00",
    redBg: "#FDECEA",
  },
};
export const THEME_KEY = "mantenpro-theme";
export const CURRENT_THEME = (() => {
  try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
})();
export const C = { ...THEMES[CURRENT_THEME] };

(() => {
  try {
    document.documentElement.style.colorScheme = CURRENT_THEME; // selects, calendarios y scrollbars nativos
    document.body.style.background = C.bg;
    document.body.style.color = C.text;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", C.bg);
  } catch { /* sin DOM: no pasa nada */ }
})();

export function toggleTheme() {
  try { localStorage.setItem(THEME_KEY, CURRENT_THEME === "light" ? "dark" : "light"); } catch { /* sin almacenamiento: no se puede recordar */ }
  window.location.reload();
}

export function ThemeToggleButton() {
  const isLight = CURRENT_THEME === "light";
  return (
    <button onClick={toggleTheme} className="flex items-center gap-2 text-xs mb-2" style={{ color: C.muted }}>
      {isLight ? <Moon size={13} /> : <Sun size={13} />} {isLight ? "Tema oscuro" : "Tema claro"}
    </button>
  );
}

// ---- Consultas sin límite de filas ----
// Supabase (PostgREST) devuelve como máximo 1,000 filas por consulta. Estas funciones piden los
// datos por páginas hasta traerlos todos, para que listas y reportes no se queden cortos sin aviso.
// Se agrega "id" como segundo orden para que la paginación sea estable (sin filas repetidas ni saltadas).
export const PAGE_SIZE = 1000;
export async function fetchAllRows(build) {
  const all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().order("id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) return { data: all.length ? all : null, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}
// Para filtros .in("columna", ids) con muchos ids: se parte en grupos (la URL tiene límite de largo)
// y cada grupo se trae completo con fetchAllRows.
export async function fetchByIdChunks(ids, buildForChunk, chunkSize = 150) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const all = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await fetchAllRows(() => buildForChunk(chunk));
    if (error) return { data: all.length ? all : null, error };
    all.push(...(data || []));
  }
  return { data: all, error: null };
}

export const TYPE_CFG = {
  preventivo: { label: "Preventivo", color: C.green },
  correctivo: { label: "Correctivo", color: C.red },
  predictivo: { label: "Predictivo", color: C.blue },
};

export const STATUS_CFG = {
  pendiente: { label: "Pendiente", color: C.muted },
  en_progreso: { label: "En progreso", color: C.blue },
  completada: { label: "Completada", color: C.green },
};

export const ACTIVITY_TABLE_LABELS = {
  work_orders: "Órdenes de trabajo",
  incidents: "Incidentes",
  equipment: "Equipos",
  technicians: "Técnicos",
  locations: "Ubicaciones",
  clients: "Clientes",
  products: "Productos",
  client_assets: "Activos en garantía",
  suppliers: "Proveedores",
  purchases: "Facturas de proveedor",
  other_expenses: "Otros gastos",
  chart_of_accounts: "Catálogo de cuentas",
  tax_rates: "Tasas impositivas",
  cash_sessions: "Caja",
  ncf_sequences: "Secuencia NCF",
  invoices: "Facturación",
  credit_notes: "Notas de crédito",
  quotes: "Cotizaciones",
  sales_orders: "Órdenes de venta",
  tools: "Herramientas",
  inventory_materials: "Almacén",
  projects: "Proyectos",
  branches: "Sucursales",
  checklist_templates: "Checklists",
  profiles: "Usuarios",
  invites: "Invitaciones",
};
export const ACTIVITY_ACTION_LABELS = {
  INSERT: { label: "Creado", color: "#4CAF6D" },
  UPDATE: { label: "Actualizado", color: C.orange },
  DELETE: { label: "Eliminado", color: "#E8654F" },
};

export const TOOL_STATUS_CFG = {
  disponible: { label: "Disponible", color: C.green },
  asignada: { label: "Asignada", color: C.blue },
  mantenimiento: { label: "En mantenimiento", color: C.amber },
  baja: { label: "Dada de baja", color: C.red },
};

export const PROJECT_STATUS_CFG = {
  activo: { label: "Activo", color: C.green },
  pausado: { label: "Pausado", color: C.amber },
  completado: { label: "Completado", color: C.blue },
  cancelado: { label: "Cancelado", color: C.red },
};

export const PRIORITY_CFG = {
  baja: { label: "Baja", color: C.muted },
  media: { label: "Media", color: C.amber },
  alta: { label: "Alta", color: "#E8894C" },
  critica: { label: "Crítica", color: C.red },
};

export const ROLE_CFG = {
  admin: { label: "Admin", color: C.amber },
  supervisor: { label: "Supervisor", color: C.blue },
  vendedor: { label: "Vendedor", color: C.green },
  tecnico: { label: "Técnico", color: C.muted },
};

// Un técnico puede tener una sucursal principal (branch_id) y trabajar también
// en sucursales adicionales (extra_branch_ids). Esta función centraliza esa
// comprobación para no repetirla en cada pantalla.
export const techWorksAtBranch = (t, branchId) => t.branch_id === branchId || (t.extra_branch_ids || []).includes(branchId);

export const ROLE_DEFAULT_PERMISSIONS = {
  supervisor: {
    ...Object.fromEntries(["dashboard", "agenda", "orders", "projects", "incidents", "equipment", "reports", "checklists", "technicians", "tools", "materials", "maintenanceSchedule", "serviceContracts", "clients", "products", "services", "warranty", "suppliers", "purchaseOrders", "deliveryNotes", "purchases", "supplierReceipts", "otherExpenses", "purchaseLedger", "quotes", "salesOrders", "invoices", "creditNotes", "recurringContracts", "caja", "branches", "salesReports"].map((k) => [k, "edit"])),
    activityLog: "view",
  },
  vendedor: { dashboard: "edit", agenda: "edit", orders: "edit", quotes: "edit", invoices: "edit", caja: "edit" },
  tecnico: { dashboard: "edit", agenda: "edit", orders: "edit", tools: "view", incidents: "view" },
};

export const PERMISSION_CATALOG = [
  { section: "General", items: [
    { key: "dashboard", label: "Panel" },
    { key: "agenda", label: "Agenda" },
    { key: "orders", label: "Órdenes de trabajo" },
  ] },
  { section: "Departamento Técnico", items: [
    { key: "projects", label: "Proyectos" },
    { key: "incidents", label: "Incidentes" },
    { key: "equipment", label: "Gestión de Equipos" },
    { key: "checklists", label: "Checklists" },
    { key: "technicians", label: "Técnicos" },
    { key: "tools", label: "Herramientas" },
    { key: "materials", label: "Almacén" },
    { key: "maintenanceSchedule", label: "Mantenimiento programado" },
    { key: "serviceContracts", label: "Contratos de servicio (SLA)" },
  ] },
  { section: "Catálogo", items: [
    { key: "clients", label: "Clientes" },
    { key: "products", label: "Productos" },
    { key: "services", label: "Servicios" },
    { key: "warranty", label: "Activos en Garantía" },
  ] },
  { section: "Compras", items: [
    { key: "suppliers", label: "Proveedores" },
    { key: "purchaseOrders", label: "Pedidos a Proveedores" },
    { key: "deliveryNotes", label: "Nota de entrega proveedores" },
    { key: "purchases", label: "Factura de proveedor" },
    { key: "supplierReceipts", label: "Recibos de proveedor" },
    { key: "otherExpenses", label: "Otros gastos" },
    { key: "purchaseLedger", label: "Libro de facturas recibidas" },
  ] },
  { section: "Ventas", items: [
    { key: "quotes", label: "Cotizaciones" },
    { key: "salesOrders", label: "Órdenes de Venta" },
    { key: "invoices", label: "Facturación" },
    { key: "creditNotes", label: "Notas de Crédito" },
    { key: "recurringContracts", label: "Contratos recurrentes" },
    { key: "caja", label: "Caja" },
  ] },
  { section: "Informes", items: [
    { key: "reports", label: "Departamento Técnico" },
    { key: "salesReports", label: "Comercial / Ventas" },
    { key: "financialReports", label: "Financieros" },
    { key: "fiscalReports", label: "Fiscales (DGII)" },
  ] },
  { section: "Recursos Humanos", items: [
    { key: "payroll", label: "Nómina (salarios, TSS, ISR)" },
  ] },
  { section: "Administración / Contable", items: [
    { key: "branches", label: "Sucursales" },
    { key: "chartOfAccounts", label: "Catálogo de cuentas" },
    { key: "receivables", label: "Cuentas por Cobrar" },
    { key: "payables", label: "Cuentas por Pagar" },
    { key: "taxRates", label: "Tasas impositivas" },
    { key: "ncf", label: "Secuencia NCF" },
    { key: "users", label: "Usuarios" },
    { key: "companyProfile", label: "Perfil de la empresa" },
    { key: "activityLog", label: "Historial de actividad" },
    { key: "dataExport", label: "Exportar datos de la empresa" },
    { key: "bankReconciliation", label: "Conciliación bancaria" },
    { key: "dgiiCatalog", label: "Catálogo RNC (DGII)" },
  ] },
];

export function PermissionChecklist({ value, onChange }) {
  const setLevel = (key, level) => {
    const next = { ...value };
    if (level === "none") delete next[key];
    else next[key] = level;
    onChange(next);
  };
  const LEVELS = [["none", "Sin acceso"], ["view", "Ver"], ["edit_no_delete", "Editar (sin eliminar)"], ["edit", "Editar y eliminar"]];
  return (
    <div className="space-y-4">
      {PERMISSION_CATALOG.map((group) => (
        <div key={group.section}>
          <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>{group.section}</div>
          <div className="space-y-1">
            {group.items.map((it) => {
              const level = value[it.key] || "none";
              return (
                <div key={it.key} className="flex items-center justify-between gap-2 text-sm py-1" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text }}>{it.label}</span>
                  <div className="flex gap-1 flex-shrink-0">
                    {LEVELS.map(([lvl, lbl]) => (
                      <button
                        key={lvl} type="button" onClick={() => setLevel(it.key, lvl)}
                        className="px-2 py-1 text-xs"
                        style={{ background: level === lvl ? C.amber : "transparent", color: level === lvl ? "#1A1500" : C.muted, border: `1px solid ${C.border}` }}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export const fmtDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// Fecha de "hoy" en la hora de República Dominicana (America/Santo_Domingo, UTC-4, sin horario de verano).
// Usar esto en vez de new Date().toISOString().slice(0,10), que da la fecha en UTC y se adelanta
// un día después de las 8:00 pm hora RD.
export const todayStrRD = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" });
// Suma/resta días de calidad a una fecha "YYYY-MM-DD" sin pasar por la hora local del navegador
// (evita que el resultado se corra un día cuando el equipo no está en horario de RD).
export const addDaysToDateStr = (dateStr, days) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + Number(days))).toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
export function Dot({ color }) {
  return <span style={{ background: color }} className="inline-block w-2 h-2 rounded-full flex-shrink-0" />;
}

export function Pill({ label, color }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1" style={{ color, background: color + "1A", border: `1px solid ${color}40` }}>
      <Dot color={color} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Historial de actividad por registro (reutilizable en cualquier modal)
// ---------------------------------------------------------------------------
export const HISTORY_FIELD_LABELS = {
  status: "Estado", payment_status: "Estado de pago", technician_id: "Técnico", branch_id: "Sucursal",
  client_id: "Cliente", supplier_id: "Proveedor", equipment_id: "Equipo", location_id: "Ubicación",
  priority: "Prioridad", findings: "Hallazgos", solution: "Solución", notes: "Notas",
  amount: "Monto", amount_paid: "Monto pagado", total: "Total", subtotal: "Subtotal",
  quantity: "Cantidad", price: "Precio", category: "Categoría", item_type: "Tipo",
  name: "Nombre", title: "Título", description: "Descripción", email: "Correo", role: "Rol",
  specialty: "Especialidad", can_create_incidents: "Puede reportar incidentes", serial_number: "No. de serie",
  quote_id: "Cotización vinculada", work_order_id: "Orden vinculada", invoice_id: "Factura vinculada",
  is_active: "Activo", account_type: "Tipo de cuenta", code: "Código", rnc: "RNC/Cédula", phone: "Teléfono",
  address: "Dirección", warranty_until: "Garantía hasta", unit: "Unidad", reported_by: "Reportado por",
};

export const summarizeHistoryEntry = (l, resolvers = {}, statusLabels = {}) => {
  if (l.action === "INSERT") return "Creado";
  if (l.action === "DELETE") return "Eliminado";
  const before = l.old_data || {};
  const after = l.new_data || {};
  const skip = new Set(["updated_at", "created_at", "id", "company_id"]);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changed = keys.filter((k) => !skip.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (changed.length === 0) return "Actualizado";
  return changed.slice(0, 3).map((k) => {
    const label = HISTORY_FIELD_LABELS[k] || k;
    let val = after[k];
    if (k === "status" && statusLabels[val]) val = statusLabels[val];
    else if (resolvers[k]) val = resolvers[k](val);
    if (val === null || val === undefined || val === "") val = "—";
    if (typeof val === "boolean") val = val ? "Sí" : "No";
    return `${label}: ${val}`;
  }).join(" · ");
};

// Cache en memoria (compartido por todos los ActivityHistorySection abiertos en la sesión)
// para no repetir la consulta de perfiles cada vez que se abre un historial.
export let _activityProfileNameCache = null;
export async function getActivityProfileNameMap() {
  if (_activityProfileNameCache) return _activityProfileNameCache;
  const { data } = await supabase.from("profiles").select("email, full_name");
  const map = {};
  (data || []).forEach((p) => { if (p.email) map[p.email] = p.full_name || p.email; });
  _activityProfileNameCache = map;
  return map;
}

export function ActivityHistorySection({ tableName, recordId, resolvers, statusLabels, title }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nameMap, setNameMap] = useState({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase.from("activity_log").select("*").eq("table_name", tableName).eq("record_id", recordId)
      .order("changed_at", { ascending: false }).limit(50)
      .then(({ data, error }) => {
        if (!active) return;
        if (!error) setHistory(data || []);
        setLoading(false);
      });
    getActivityProfileNameMap().then((map) => { if (active) setNameMap(map); });
    return () => { active = false; };
  }, [tableName, recordId]);

  return (
    <div className="mt-2 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
      <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>{title || "Historial"}</div>
      {loading ? (
        <div className="text-xs" style={{ color: C.muted }}>Cargando...</div>
      ) : history.length === 0 ? (
        <div className="text-xs" style={{ color: C.muted }}>Sin actividad registrada todavía.</div>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {history.map((l) => {
            const dt = new Date(l.changed_at);
            return (
              <div key={l.id} className="text-xs flex items-start gap-2" style={{ color: C.muted }}>
                <span className="flex-shrink-0 font-mono" style={{ color: C.text }}>{dt.toLocaleDateString("es-DO")} {dt.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}</span>
                <span>· {(l.changed_by_email && nameMap[l.changed_by_email]) || l.changed_by_email || "—"} · {summarizeHistoryEntry(l, resolvers, statusLabels)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function KpiCard({ label, value, accent, sub }) {
  return (
    <div className="p-4 flex-1 min-w-[150px]" style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeftWidth: 3, borderLeftColor: accent }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>{label}</div>
      <div className="text-3xl font-bold mt-1 font-mono" style={{ color: C.text }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

export function PushSetupInline({ onEnable }) {
  const [activating, setActivating] = useState(false);
  const activate = async () => {
    setActivating(true);
    await onEnable(VAPID_PUBLIC_KEY);
    setActivating(false);
  };
  return (
    <div>
      <div className="text-xs mb-2" style={{ color: C.muted }}>Recibe avisos aunque no tengas la app abierta (nueva orden asignada, incidente, etc.) en este dispositivo.</div>
      <button
        onClick={activate}
        disabled={activating}
        className="text-xs px-3 py-1.5 font-semibold disabled:opacity-50"
        style={{ background: C.amber, color: "#1A1500" }}
      >
        {activating ? "Activando..." : "Activar notificaciones push"}
      </button>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[85vh] overflow-y-auto`} style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <h3 className="font-semibold text-base" style={{ color: C.text }}>{title}</h3>
          {onClose && <button onClick={onClose} className="p-1" style={{ color: C.muted }}><X size={18} /></button>}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <div className="text-xs mb-1 uppercase tracking-wide" style={{ color: C.muted }}>{label}</div>
      {children}
    </label>
  );
}

export const inputStyle = { background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text };
export const inputClass = "w-full px-3 py-2 text-sm outline-none focus:ring-1";
export const iconBtnStyle = { color: C.muted };

export function FullScreenLoader({ label }) {
  return (
    <div className="w-full min-h-[720px] flex items-center justify-center gap-3" style={{ background: C.bg, color: C.muted }}>
      <Loader2 size={20} className="animate-spin" /> {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cambiar contraseña — reutilizado tanto para el cambio voluntario (desde el
// menú lateral, con sesión normal) como para el enlace de "olvidé mi
// contraseña" (con sesión de recuperación).
// ---------------------------------------------------------------------------
export function ChangePasswordModal({ onClose, onDone, title }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (password !== confirmPassword) { setError("Las contraseñas no coinciden."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    onDone();
  };

  return (
    <Modal title={title || "Cambiar contraseña"} onClose={onClose}>
      <Field label="Nueva contraseña">
        <input className={inputClass} style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
      </Field>
      <Field label="Confirmar nueva contraseña">
        <input className={inputClass} style={inputStyle} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repite la contraseña" />
      </Field>
      {error && <div className="text-xs mb-3" style={{ color: C.red }}>{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        {onClose && <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>}
        <button onClick={submit} disabled={loading} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {loading ? "Guardando..." : "Guardar contraseña"}
        </button>
      </div>
    </Modal>
  );
}

export const fmtMoney = (n) => `RD$ ${Number(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Clave pública VAPID del servidor de notificaciones push — es la misma para toda la
// plataforma multi-empresa (identifica al servidor que envía, no a una empresa o usuario).
// No es secreta; es seguro dejarla fija aquí.
export const VAPID_PUBLIC_KEY = "BBtlXeiE7ztiQ_3JsP0kQsF2Mfrb2b19ZEhrkQxZ5G8pcYLnDbQQgNKkYa01KiSvynyaAnLT7DSZ9hI5MOKmFtk";

export const waLink = (phone, text) => {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10) digits = `1${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};
export const mailtoLink = (email, subject, text) => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

// Comprime fotos en el navegador antes de subirlas a Supabase Storage (bucket "evidence"),
// para no gastar el plan de storage/bandwidth con fotos de cámara sin redimensionar (4-8MB
// cada una). Redimensiona al lado más largo a maxDimension y reconvierte a JPEG. Si el
// archivo no es una imagen (PDF, Word, Excel), o ya es pequeño, o algo falla, devuelve el
// archivo original tal cual — nunca bloquea la subida por un error de compresión.
export async function compressImage(file, { maxDimension = 1600, quality = 0.82 } = {}) {
  if (!file || !file.type || !file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  if (file.size <= 400 * 1024) return file; // ya es liviana, no vale la pena reprocesarla
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const targetW = Math.max(1, Math.round(bitmap.width * scale));
    const targetH = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, targetW, targetH);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // si no mejoró nada, sube la original
    const newName = file.name.replace(/\.[^./]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
// Logo de la empresa: se guarda como imagen pequeña dentro del propio registro de la empresa
// (data URL). Así sale siempre en facturas, cotizaciones, recibos e informes, sin depender de
// enlaces de almacenamiento que vencen o que no se pueden abrir desde la ventana de impresión.
export async function logoToDataUrl(file, maxDimension = 320) {
  const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("No se pudo leer la imagen"));
    r.readAsDataURL(blob);
  });
  if (!file || !file.type || !file.type.startsWith("image/")) throw new Error("El logo debe ser una imagen (PNG, JPG o SVG).");
  if (file.type === "image/svg+xml") {
    if (file.size > 150 * 1024) throw new Error("El logo SVG es muy pesado (máximo 150 KB).");
    return readAsDataUrl(file);
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();
  // PNG conserva el fondo transparente; si queda pesado, se prueba WebP
  let url = canvas.toDataURL("image/png");
  if (url.length > 180 * 1024) {
    const webp = canvas.toDataURL("image/webp", 0.9);
    if (webp.startsWith("data:image/webp") && webp.length < url.length) url = webp;
  }
  if (url.length > 300 * 1024) throw new Error("El logo es muy pesado incluso reducido. Prueba con una imagen más simple.");
  return url;
}
export const invoiceReminderText = (companyName, clientName, inv, balance, days) =>
  `Hola ${clientName}, le saluda ${companyName}. Le recordamos que tiene un saldo pendiente de ${fmtMoney(balance)} correspondiente a la factura NCF ${inv.ncf || inv.id} con fecha ${fmtDate(inv.invoice_date)} (${days} días de emitida). Agradecemos su pronto pago. Cualquier duda, quedamos atentos.`;

// Agrupa las líneas de un documento por "capítulo" (sección), calculando el subtotal de cada grupo
export function groupItemsByChapter(items, getAmount) {
  const map = new Map();
  const order = [];
  items.forEach((it) => {
    const ch = (it.chapter || "").trim() || "General";
    if (!map.has(ch)) { map.set(ch, []); order.push(ch); }
    map.get(ch).push(it);
  });
  return order.map((ch) => ({ chapter: ch, items: map.get(ch), subtotal: map.get(ch).reduce((s, it) => s + getAmount(it), 0) }));
}

// ---------------------------------------------------------------------------
// Buscador con autocompletado (para elegir producto por nombre/SKU en vez de una lista larga)
// ---------------------------------------------------------------------------
export function ProductSearchSelect({ products, value, onChange, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value);

  const filtered = (query.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || (p.sku || "").toLowerCase().includes(query.toLowerCase()))
    : products
  ).slice(0, 30);

  return (
    <div className="relative">
      <input
        className={inputClass}
        style={inputStyle}
        value={open ? query : selected ? selected.name : ""}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "Buscar producto..."}
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 max-h-56 overflow-y-auto" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <button type="button" onMouseDown={() => { onChange(""); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm font-semibold" style={{ color: C.amber, borderBottom: `1px solid ${C.border}` }}>
            + Trabajo / renglón libre (describe y pon el monto — no descuenta inventario)
          </button>
          {filtered.map((p) => (
            <button key={p.id} type="button" onMouseDown={() => { onChange(p.id); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm flex justify-between" style={{ color: C.text }}>
              <span>{p.name}</span>
              {p.sku && <span className="text-xs font-mono" style={{ color: C.muted }}>{p.sku}</span>}
            </button>
          ))}
          {filtered.length === 0 && <div className="px-3 py-2 text-sm" style={{ color: C.muted }}>Sin resultados</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Impresión: abre una ventana nueva con el documento formateado y lanza el diálogo de imprimir
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Buscador genérico (para elegir cliente/proveedor por nombre en vez de una lista larga)
// ---------------------------------------------------------------------------
export function SearchSelect({ items, value, onChange, placeholder, getLabel, getSub }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.id === value);

  const filtered = (query.trim()
    ? items.filter((i) => getLabel(i).toLowerCase().includes(query.toLowerCase()) || (getSub ? (getSub(i) || "").toLowerCase().includes(query.toLowerCase()) : false))
    : items
  ).slice(0, 30);

  return (
    <div className="relative">
      <input
        className={inputClass}
        style={inputStyle}
        value={open ? query : selected ? getLabel(selected) : ""}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "Buscar..."}
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 max-h-56 overflow-y-auto" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          {filtered.map((i) => (
            <button key={i.id} type="button" onMouseDown={() => { onChange(i.id); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm flex justify-between" style={{ color: C.text }}>
              <span>{getLabel(i)}</span>
              {getSub && <span className="text-xs" style={{ color: C.muted }}>{getSub(i)}</span>}
            </button>
          ))}
          {filtered.length === 0 && <div className="px-3 py-2 text-sm" style={{ color: C.muted }}>Sin resultados</div>}
        </div>
      )}
    </div>
  );
}

// Igual que SearchSelect pero, además de los clientes ya registrados,
// mientras el vendedor escribe también busca en el catálogo DGII importado
// (dgii_rnc_catalog). Si el vendedor no encuentra la empresa entre sus
// clientes, puede elegirla directamente de ahí — onCreateFromDgii la crea en
// Clientes al vuelo y la deja seleccionada, sin salir del formulario ni pasar
// por el botón "+".
export function ClientSearchSelect({ clients, value, onChange, onCreateFromDgii, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dgiiResults, setDgiiResults] = useState([]);
  const [dgiiSearching, setDgiiSearching] = useState(false);
  const [creatingRnc, setCreatingRnc] = useState(null);
  const selected = clients.find((c) => c.id === value);

  const filteredClients = (query.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || (c.rnc_cedula || "").includes(query.trim()))
    : clients
  ).slice(0, 30);

  useEffect(() => {
    const q = query.trim();
    if (!onCreateFromDgii || q.length < 3) { setDgiiResults([]); setDgiiSearching(false); return; }
    let active = true;
    setDgiiSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from("dgii_rnc_catalog").select("rnc, name, commercial_name")
        .or(`name.ilike.%${q}%,commercial_name.ilike.%${q}%`).limit(6);
      if (active) {
        const existingRncs = new Set(clients.map((c) => (c.rnc_cedula || "").replace(/\D/g, "")).filter(Boolean));
        setDgiiResults((data || []).filter((r) => !existingRncs.has(r.rnc)));
        setDgiiSearching(false);
      }
    }, 400);
    return () => { active = false; clearTimeout(t); };
  }, [query, onCreateFromDgii, clients]);

  const pickDgii = async (row) => {
    setCreatingRnc(row.rnc);
    const created = await onCreateFromDgii(row);
    setCreatingRnc(null);
    if (created) { onChange(created.id); setOpen(false); setQuery(""); }
  };

  return (
    <div className="relative">
      <input
        className={inputClass}
        style={inputStyle}
        value={open ? query : selected ? selected.name : ""}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "Buscar cliente..."}
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 max-h-64 overflow-y-auto" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          {filteredClients.map((c) => (
            <button key={c.id} type="button" onMouseDown={() => { onChange(c.id); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm flex justify-between" style={{ color: C.text }}>
              <span>{c.name}</span>
              {c.rnc_cedula && <span className="text-xs" style={{ color: C.muted }}>{c.rnc_cedula}</span>}
            </button>
          ))}
          {filteredClients.length === 0 && <div className="px-3 py-2 text-sm" style={{ color: C.muted }}>Sin resultados entre tus clientes</div>}
          {onCreateFromDgii && query.trim().length >= 3 && (
            <>
              <div className="px-3 py-1 text-xs uppercase tracking-wide" style={{ color: C.muted, borderTop: `1px solid ${C.border}` }}>Catálogo DGII</div>
              {dgiiSearching ? (
                <div className="px-3 py-2 text-xs" style={{ color: C.muted }}>Buscando...</div>
              ) : dgiiResults.length === 0 ? (
                <div className="px-3 py-2 text-xs" style={{ color: C.muted }}>Sin coincidencias.</div>
              ) : (
                dgiiResults.map((r) => (
                  <button
                    key={r.rnc}
                    type="button"
                    onMouseDown={() => pickDgii(r)}
                    disabled={creatingRnc === r.rnc}
                    className="w-full text-left px-3 py-2 text-sm flex justify-between items-center gap-2 disabled:opacity-50"
                    style={{ color: C.text }}
                  >
                    <span className="truncate">{r.name}{r.commercial_name ? ` (${r.commercial_name})` : ""}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: C.amber }}>{creatingRnc === r.rnc ? "Agregando..." : `+ Agregar (${r.rnc})`}</span>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// openedWindow: ventana ya abierta en el mismo clic (cuando antes hay que esperar datos del
// servidor; si se abre después de esperar, Safari/iPhone la bloquea).
export function printDocument(title, bodyHtml, openedWindow) {
  const win = openedWindow || window.open("", "_blank", "width=800,height=900");
  if (!win) { alert("Tu navegador bloqueó la ventana emergente. Permite las ventanas emergentes para poder imprimir."); return; }
  if (openedWindow) win.document.open();
  win.document.write(`<html><head><title>${title}</title><style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 28px; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .muted { color: #666; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 13px; }
    th { background: #f2f2f2; }
    .totals { margin-top: 12px; width: 280px; margin-left: auto; }
    .totals div { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
    .totals .total { font-weight: bold; font-size: 15px; border-top: 1px solid #333; margin-top: 4px; padding-top: 6px; }
    .header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  </style></head><body>${bodyHtml}<script>window.onload = () => setTimeout(() => window.print(), 200);</script></body></html>`);
  win.document.close();
  win.focus();
}

export function invoiceLikeHtml({ docLabel, code, docTitle, companyName, companyLogo, companyRnc, companyAddress, companyPhone, companyBankName, companyBankAccountType, companyBankAccountNumber, partyLabel, clientName, clientRnc, clientAddress, dateLabel, dateValue, extraMeta, paymentTerms, items, subtotal, itbis, total, discountPct, notes, retainedLabel, retainedAmount, legalNote, currency, foreignTotal, exchangeRate }) {
  const isUsd = currency === "USD";
  const fmtItem = (n) => isUsd ? `US$ ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : fmtMoney(n);
  const groups = groupItemsByChapter(items, (it) => Number(it.subtotal ?? it.quantity * (it.unit_price ?? it.unit_cost) ?? 0));
  const showChapters = groups.length > 1 || (groups[0] && groups[0].chapter !== "General");
  const rowHtml = (it) => `<tr><td>${it.description || ""}${it.is_taxable ? " <span class='muted'>(ITBIS)</span>" : ""}</td><td style="text-align:right">${it.quantity}</td><td style="text-align:right">${fmtItem(it.unit_price ?? it.unit_cost)}</td><td style="text-align:right">${fmtItem((it.subtotal ?? it.quantity * (it.unit_price ?? it.unit_cost)))}</td></tr>`;
  const rows = showChapters
    ? groups.map((g) => `<tr><td colspan="4" style="background:#f2f2f2;font-weight:bold">${g.chapter} <span style="font-weight:normal;float:right">${fmtItem(g.subtotal)}</span></td></tr>${g.items.map(rowHtml).join("")}`).join("")
    : items.map(rowHtml).join("");
  const companyMeta = [companyRnc ? `RNC: ${companyRnc}` : null, companyAddress || null, companyPhone ? `Tel: ${companyPhone}` : null].filter(Boolean).join(" · ");
  return `
    <div class="header-row">
      <div style="display:flex;gap:12px;align-items:flex-start">
        ${companyLogo ? `<img src="${companyLogo}" style="width:56px;height:56px;object-fit:contain;flex-shrink:0" />` : ""}
        <div>
          <h1>${companyName}</h1>
          ${companyMeta ? `<div class="muted" style="font-size:11px">${companyMeta}</div>` : ""}
          <div class="muted">${docLabel}${code ? " · " + code : ""}</div>${docTitle ? `<div class="muted" style="margin-top:2px">${docTitle}</div>` : ""}
        </div>
      </div>
      <div class="muted" style="text-align:right">${dateLabel}: ${dateValue}${extraMeta || ""}</div>
    </div>
    <div class="muted">${partyLabel || "Cliente"}: <b style="color:#111">${clientName}</b>${clientRnc ? ` · RNC/Cédula: <b style="color:#111">${clientRnc}</b>` : ""}</div>
    ${clientAddress ? `<div class="muted" style="margin-top:2px">Dirección: ${clientAddress}</div>` : ""}
    ${paymentTerms ? `<div class="muted" style="margin-top:2px">Forma de pago: ${paymentTerms}</div>` : ""}
    <table><thead><tr><th>Descripción</th><th style="text-align:right">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals">
      ${discountPct > 0 ? `<div><span>Descuento aplicado</span><span>${discountPct}%</span></div>` : ""}
      <div><span>Subtotal</span><span>${fmtMoney(subtotal)}</span></div>
      <div><span>ITBIS</span><span>${fmtMoney(itbis)}</span></div>
      ${retainedAmount ? `<div><span>${retainedLabel}</span><span>-${fmtMoney(retainedAmount)}</span></div>` : ""}
      <div class="total"><span>Total</span><span>${fmtMoney(total)}</span></div>
      ${isUsd && foreignTotal ? `<div class="muted" style="text-align:right;margin-top:2px">≈ US$ ${Number(foreignTotal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (tasa RD$ ${exchangeRate} por US$1)</div>` : ""}
    </div>
    ${legalNote ? `<div class="muted" style="margin-top:6px;font-weight:bold">${legalNote}</div>` : ""}
    ${notes ? `<div class="muted" style="margin-top:14px">Notas: ${notes}</div>` : ""}
    ${(companyBankName || companyBankAccountNumber) ? `<div class="muted" style="margin-top:14px;padding-top:8px;border-top:1px solid #ddd">Pagos por transferencia: ${[companyBankName, companyBankAccountType, companyBankAccountNumber ? `Cuenta ${companyBankAccountNumber}` : null].filter(Boolean).join(" · ")}</div>` : ""}
  `;
}

export function listHtml(title, companyName, headers, rows) {
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? "—"}</td>`).join("")}</tr>`).join("");
  return `<div class="header-row"><div><h1>${companyName}</h1><div class="muted">${title}</div></div><div class="muted">${new Date().toLocaleDateString("es-DO")}</div></div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// Condición de un sobrante del almacén técnico
export const LEFTOVER_CONDITIONS = { incompleto: "Incompleto", usado: "Usado", recuperado: "Recuperado de equipo" };

// Devolver todo o parte de un renglón: todo = se quita el renglón; parte = baja la cantidad.
// La base devuelve la diferencia a su origen (Productos de esa sucursal o almacén técnico).
export async function returnMaterialLine(table, line) {
  const dest = line.product_id ? "Productos" : "el almacén técnico";
  const input = window.prompt(`¿Cuánto devuelves a ${dest}?\n${line.name || "Material"}: ${Number(line.quantity).toLocaleString("es-DO")} ${line.unit || ""} en uso.\n(Si devuelves todo, el renglón se quita.)`, String(line.quantity));
  if (input === null) return null;
  const qty = Number(String(input).replace(",", "."));
  if (!(qty > 0) || qty > Number(line.quantity)) { window.alert(`Escribe una cantidad entre 0 y ${Number(line.quantity).toLocaleString("es-DO")}.`); return null; }
  if (qty === Number(line.quantity)) {
    const { error } = await supabase.from(table).delete().eq("id", line.id);
    if (error) { window.alert(error.message); return null; }
    return { removed: true };
  }
  const { data, error } = await supabase.from(table).update({ quantity: Number(line.quantity) - qty }).eq("id", line.id).select().single();
  if (error) { window.alert(error.message); return null; }
  return { updated: data };
}

export const isRetentionMethod = (m) => /^Retención/.test(m || "");


export const addMonths = (dateStr, months) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
};
export const daysBetween = (a, b) => Math.ceil((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
export const TIPOS_RETENCION_ISR_606 = [
  { code: "01", label: "01 · Alquileres" },
  { code: "02", label: "02 · Honorarios por servicios independientes" },
  { code: "03", label: "03 · Otras rentas" },
  { code: "04", label: "04 · Otras rentas (rentas presuntas)" },
  { code: "05", label: "05 · Intereses pagados a personas jurídicas residentes" },
  { code: "06", label: "06 · Intereses pagados a personas físicas residentes" },
  { code: "07", label: "07 · Retención por proveedores del Estado" },
  { code: "08", label: "08 · Juegos telefónicos de premios" },
];

// Secuencias que la empresa puede emitir ella misma para un tipo dado (B11 compras, B13 gastos menores)
export function issuableSequences(ncfSequences, type, onDate) {
  return (ncfSequences || []).filter((s) => s.ncf_type === type && s.active && s.next_number <= s.range_end && (!s.expiration_date || !onDate || s.expiration_date >= onDate));
}

// Deducir la forma de pago del 606 a partir de los pagos registrados (texto libre en
// purchase_payments.method): sin pagos = a crédito; varios métodos distintos = mixto.
export function formaPago606FromPayments(payments) {
  if (!payments || payments.length === 0) return "04";
  const codes = new Set(payments.map((p) => {
    const m = (p.method || "").toLowerCase();
    if (m.includes("efectivo")) return "01";
    if (m.includes("tarjeta")) return "03";
    if (m.includes("permuta")) return "05";
    if (m.includes("nota de cr")) return "06";
    return "02"; // transferencia, cheque, depósito u otro medio bancario
  }));
  return codes.size === 1 ? [...codes][0] : "07";
}

export const PURCHASE_ORDER_STATUS_CFG = {
  pendiente: { label: "Pendiente", color: C.amber },
  parcial: { label: "Recibido parcial", color: C.blue },
  recibido: { label: "Recibido completo", color: C.green },
  cancelado: { label: "Cancelado", color: C.muted },
};

export const NCF_TYPES = [
  { code: "B01", label: "B01 · Crédito Fiscal" },
  { code: "B02", label: "B02 · Consumo" },
  { code: "B04", label: "B04 · Nota de Crédito" },
  { code: "B14", label: "B14 · Régimen Especial" },
  { code: "B15", label: "B15 · Gubernamental" },
  { code: "B03", label: "B03 · Nota de Débito" },
  { code: "B11", label: "B11 · Comprobante de Compras (proveedores informales)" },
  { code: "B13", label: "B13 · Gastos Menores" },
  { code: "B16", label: "B16 · Exportaciones" },
  { code: "B17", label: "B17 · Pagos al Exterior" },
];

export function NCFSequenceFormModal({ initial, onClose, onSave, saving }) {
  const [ncfType, setNcfType] = useState(initial?.ncf_type || "B02");
  const [rangeStart, setRangeStart] = useState(initial?.range_start ?? "");
  const [rangeEnd, setRangeEnd] = useState(initial?.range_end ?? "");
  const [expiration, setExpiration] = useState(initial?.expiration_date || "");

  const submit = () => {
    if (!rangeStart || !rangeEnd || Number(rangeEnd) < Number(rangeStart)) return;
    onSave({
      ncf_type: ncfType,
      prefix: ncfType,
      range_start: Number(rangeStart),
      range_end: Number(rangeEnd),
      next_number: initial?.next_number ?? Number(rangeStart),
      expiration_date: expiration || null,
    });
  };

  return (
    <Modal title={initial ? "Editar secuencia NCF" : "Agregar secuencia NCF"} onClose={onClose}>
      <Field label="Tipo de comprobante">
        <select className={inputClass} style={inputStyle} value={ncfType} onChange={(e) => setNcfType(e.target.value)} disabled={!!initial}>
          {NCF_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde el número">
          <input type="number" className={inputClass} style={inputStyle} value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} placeholder="Ej. 1" disabled={!!initial} />
        </Field>
        <Field label="Hasta el número">
          <input type="number" className={inputClass} style={inputStyle} value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} placeholder="Ej. 500" />
        </Field>
      </div>
      <Field label="Fecha de vencimiento (opcional)">
        <input type="date" className={inputClass} style={inputStyle} value={expiration} onChange={(e) => setExpiration(e.target.value)} />
      </Field>
      <div className="text-xs mb-3" style={{ color: C.muted }}>Estos rangos son los que la DGII te autorizó — cárgalos exactamente como aparecen en tu autorización.</div>
      {initial && <ActivityHistorySection tableName="ncf_sequences" recordId={initial.id} title="Historial de esta secuencia" />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar secuencia"}
        </button>
      </div>
    </Modal>
  );
}

// Resumen en una línea de los datos del voucher de un pago con tarjeta
export function cardDetailLine(card) {
  if (!card) return "";
  return [
    card.acquirer_name,
    [card.card_brand, card.last4 ? `••${card.last4}` : null].filter(Boolean).join(" "),
    card.auth_code ? `Aprob. ${card.auth_code}` : null,
    card.batch_number ? `Lote ${card.batch_number}` : null,
  ].filter(Boolean).join(" · ");
}

// Tipos de anulación del formato 608 de la DGII
export const MOTIVOS_ANULACION_608 = [
  { code: "01", label: "01 · Deterioro de factura preimpresa" },
  { code: "02", label: "02 · Errores de impresión (factura preimpresa)" },
  { code: "03", label: "03 · Impresión defectuosa" },
  { code: "04", label: "04 · Corrección de la información" },
  { code: "05", label: "05 · Cambio de productos" },
  { code: "06", label: "06 · Devolución de productos" },
  { code: "07", label: "07 · Omisión de productos" },
  { code: "08", label: "08 · Errores en secuencia de NCF" },
  { code: "09", label: "09 · Por cese de operaciones" },
  { code: "10", label: "10 · Pérdida o hurto de talonarios" },
];

export const PAYMENT_STATUS_CFG = {
  pendiente: { label: "Pendiente de cobro", color: "#E8654F" },
  parcial: { label: "Parcialmente cobrada", color: C.orange },
  cobrada: { label: "Cobrada", color: "#4CAF6D" },
};

export const PAYABLE_STATUS_CFG = {
  pendiente: { label: "Pendiente de pago", color: "#E8654F" },
  parcial: { label: "Parcialmente pagada", color: C.orange },
  pagada: { label: "Pagada", color: "#4CAF6D" },
};

export const CREDIT_NOTE_STATUS_CFG = {
  emitida: { label: "Emitida", color: "#4FA8D8" },
};

export const QUOTE_STATUS_CFG = {
  pendiente: { label: "Pendiente", color: C.muted },
  aprobada: { label: "Aprobada", color: "#4CAF6D" },
  rechazada: { label: "Rechazada", color: "#E8654F" },
  en_orden: { label: "En orden de venta", color: "#4FA8D8" },
  parcial: { label: "Facturada parcialmente", color: "#4FA8D8" },
  convertida: { label: "Convertida en factura", color: C.orange },
};

export const SALES_ORDER_STATUS_CFG = {
  en_proceso: { label: "En proceso", color: "#4FA8D8" },
  facturada: { label: "Facturada", color: "#4CAF6D" },
  cancelada: { label: "Cancelada", color: "#E8654F" },
};

export const INCIDENT_STATUS_CFG = {
  abierto: { label: "Abierto", color: "#E8654F" },
  en_revision: { label: "En revisión", color: C.orange },
  resuelto: { label: "Completado", color: "#4CAF6D" },
  descartado: { label: "Descartado", color: C.muted },
  convertido: { label: "Convertido", color: "#4FA8D8" },
};

// ---- Librerías pesadas: se descargan solo cuando de verdad se usan ----
// Leer un PDF (checklists, facturas de proveedor) carga pdfjs en ese momento.
export async function extractChecklistItemsFromPdf(file) {
  const m = await import("./pdf.js");
  return m.extractChecklistItemsFromPdf(file);
}
export async function extractInvoiceDataFromPdf(file) {
  const m = await import("./pdf.js");
  return m.extractInvoiceDataFromPdf(file);
}
// Excel (SheetJS) para importar/exportar: const XLSX = await loadXlsx();
export const loadXlsx = () => import("xlsx");
