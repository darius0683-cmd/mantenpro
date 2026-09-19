import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  LayoutDashboard, ClipboardList, Users, Building2, Plus, X, Search,
  CheckCircle2, MapPin, Wrench, Trash2, ArrowRight, Loader2, LogOut,
  Settings2, Pencil, ShieldCheck, Copy, Mail, FileText, Paperclip, ImageIcon, BarChart3, History, Users2, Boxes, Truck, ShoppingCart, Receipt, Hash, Ban, BadgeCheck, ClipboardCheck, AlertTriangle, Layers, RotateCcw, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, GripVertical, Upload, Wallet, Package, UserCheck, MessageCircle, Bell, BellOff, Menu, FolderKanban, Link2, Unlink
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend
} from "recharts";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as XLSX from "xlsx";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ---------------------------------------------------------------------------
// Lee un PDF y devuelve un arreglo de líneas de texto (una por punto de checklist)
// ---------------------------------------------------------------------------
async function extractChecklistItemsFromPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const lines = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const rowsMap = new Map();
    textContent.items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      if (!rowsMap.has(y)) rowsMap.set(y, []);
      rowsMap.get(y).push(item.str);
    });
    const sortedYs = Array.from(rowsMap.keys()).sort((a, b) => b - a);
    sortedYs.forEach((y) => lines.push(rowsMap.get(y).join(" ").trim()));
  }
  const cleanLines = lines.map((l) => l.trim()).filter(Boolean);

  // Una línea con casilla ("[ ]", "☐", etc.) es un punto a revisar; cualquier otra línea
  // se toma como el nombre del tema (sección) que agrupa los puntos que le siguen.
  const checkboxPattern = /^(\[\s*[xX]?\s*\]|☐|☑|✓|□|▢)\s*/;
  const result = [];
  let currentSection = "";
  cleanLines.forEach((line) => {
    if (checkboxPattern.test(line)) {
      const text = line.replace(checkboxPattern, "").trim();
      if (text) result.push({ text, section: currentSection });
    } else {
      currentSection = line;
    }
  });
  // Si el PDF no tenía ninguna casilla, trátalo como antes: cada línea es un punto suelto sin tema
  if (result.length === 0) {
    return cleanLines.map((text) => ({ text, section: "" }));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Lee un PDF de factura de proveedor e intenta detectar No. de factura, fecha y total
// ---------------------------------------------------------------------------
async function extractInvoiceDataFromPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map((it) => it.str).join(" ") + "\n";
  }

  const invoiceNumberMatch = fullText.match(/(?:n[uú]mero de factura|factura\s*(?:no\.?|n[uú]m\.?|#)?|ncf)[:\s#]*([A-Z]?\d[A-Z0-9\-]{3,20})/i);
  const invoiceNumber = invoiceNumberMatch ? invoiceNumberMatch[1].trim() : "";

  const dateMatch = fullText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  let isoDate = "";
  if (dateMatch) {
    let [, d, m, y] = dateMatch;
    if (y.length === 2) y = "20" + y;
    if (Number(d) > 12 && Number(m) <= 12) { /* d/m/y ya asumido */ }
    isoDate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const totalMatches = [...fullText.matchAll(/total[^\d]{0,15}(?:rd\$|us\$|\$)?\s*([\d.,]+\d)/gi)];
  let total = null;
  if (totalMatches.length > 0) {
    const raw = totalMatches[totalMatches.length - 1][1].replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isNaN(n)) total = n;
  }

  return { fullText: fullText.trim(), invoiceNumber, isoDate, total };
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
// Ventana (en días) para sugerir coincidencias automáticas en conciliación bancaria.
// Se amplió de 5 a 45 días porque hay créditos a clientes/proveedores de hasta 45 días
// entre la fecha de la factura y la fecha real del pago.
const BANK_MATCH_WINDOW_DAYS = 45;
const C = {
  bg: "#12151A",
  panel: "#1B1F27",
  panelAlt: "#20242D",
  border: "#2A2F3A",
  text: "#EDEBE6",
  muted: "#8B92A0",
  amber: "#F2A93B",
  green: "#4CAF6D",
  red: "#E8654F",
  blue: "#4FA8D8",
};

const TYPE_CFG = {
  preventivo: { label: "Preventivo", color: C.green },
  correctivo: { label: "Correctivo", color: C.red },
  predictivo: { label: "Predictivo", color: C.blue },
};

const STATUS_CFG = {
  pendiente: { label: "Pendiente", color: C.muted },
  en_progreso: { label: "En progreso", color: C.blue },
  completada: { label: "Completada", color: C.green },
};

const ACTIVITY_TABLE_LABELS = {
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
const ACTIVITY_ACTION_LABELS = {
  INSERT: { label: "Creado", color: "#4CAF6D" },
  UPDATE: { label: "Actualizado", color: "#F2A93B" },
  DELETE: { label: "Eliminado", color: "#E8654F" },
};

const TOOL_STATUS_CFG = {
  disponible: { label: "Disponible", color: C.green },
  asignada: { label: "Asignada", color: C.blue },
  mantenimiento: { label: "En mantenimiento", color: C.amber },
  baja: { label: "Dada de baja", color: C.red },
};

const PROJECT_STATUS_CFG = {
  activo: { label: "Activo", color: C.green },
  pausado: { label: "Pausado", color: C.amber },
  completado: { label: "Completado", color: C.blue },
  cancelado: { label: "Cancelado", color: C.red },
};

const PRIORITY_CFG = {
  baja: { label: "Baja", color: C.muted },
  media: { label: "Media", color: C.amber },
  alta: { label: "Alta", color: "#E8894C" },
  critica: { label: "Crítica", color: C.red },
};

const ROLE_CFG = {
  admin: { label: "Admin", color: C.amber },
  supervisor: { label: "Supervisor", color: C.blue },
  vendedor: { label: "Vendedor", color: C.green },
  tecnico: { label: "Técnico", color: C.muted },
};

// Un técnico puede tener una sucursal principal (branch_id) y trabajar también
// en sucursales adicionales (extra_branch_ids). Esta función centraliza esa
// comprobación para no repetirla en cada pantalla.
const techWorksAtBranch = (t, branchId) => t.branch_id === branchId || (t.extra_branch_ids || []).includes(branchId);

const ROLE_DEFAULT_PERMISSIONS = {
  supervisor: {
    ...Object.fromEntries(["dashboard", "agenda", "orders", "projects", "incidents", "equipment", "reports", "checklists", "technicians", "tools", "materials", "maintenanceSchedule", "clients", "products", "services", "warranty", "suppliers", "purchaseOrders", "deliveryNotes", "purchases", "supplierReceipts", "otherExpenses", "purchaseLedger", "quotes", "salesOrders", "invoices", "creditNotes", "recurringContracts", "caja", "branches", "salesReports"].map((k) => [k, "edit"])),
    activityLog: "view",
  },
  vendedor: { dashboard: "edit", agenda: "edit", orders: "edit", quotes: "edit", invoices: "edit", caja: "edit" },
  tecnico: { dashboard: "edit", agenda: "edit", orders: "edit", tools: "view", incidents: "view" },
};

const PERMISSION_CATALOG = [
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
    { key: "bankReconciliation", label: "Conciliación bancaria" },
    { key: "dgiiCatalog", label: "Catálogo RNC (DGII)" },
  ] },
];

function PermissionChecklist({ value, onChange }) {
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

const fmtDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function Dot({ color }) {
  return <span style={{ background: color }} className="inline-block w-2 h-2 rounded-full flex-shrink-0" />;
}

function Pill({ label, color }) {
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
const HISTORY_FIELD_LABELS = {
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

const summarizeHistoryEntry = (l, resolvers = {}, statusLabels = {}) => {
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
let _activityProfileNameCache = null;
async function getActivityProfileNameMap() {
  if (_activityProfileNameCache) return _activityProfileNameCache;
  const { data } = await supabase.from("profiles").select("email, full_name");
  const map = {};
  (data || []).forEach((p) => { if (p.email) map[p.email] = p.full_name || p.email; });
  _activityProfileNameCache = map;
  return map;
}

function ActivityHistorySection({ tableName, recordId, resolvers, statusLabels, title }) {
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

function CompanyProfileForm({ company, bankAccounts, onSave, onSaveBankAccount, onDeleteBankAccount, onSetDefaultBankAccount, saving }) {
  const [name, setName] = useState(company?.name || "");
  const [rnc, setRnc] = useState(company?.rnc || "");
  const [address, setAddress] = useState(company?.address || "");
  const [phone, setPhone] = useState(company?.phone || "");
  const [email, setEmail] = useState(company?.email || "");
  const [website, setWebsite] = useState(company?.website || "");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(company?.logo_url || "");

  const onLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(), rnc: rnc.trim() || null, address: address.trim() || null,
      phone: phone.trim() || null, email: email.trim() || null, website: website.trim() || null,
    }, logoFile);
  };

  return (
    <div className="max-w-2xl">
      <div className="text-sm mb-4" style={{ color: C.muted }}>
        Esta información aparece en tus facturas, cotizaciones y demás documentos impresos.
      </div>
      <div className="p-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <Field label="Logo de la empresa">
          <div className="flex items-center gap-4">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="w-20 h-20 object-contain" style={{ background: "#fff", border: `1px solid ${C.border}` }} />
            ) : (
              <div className="w-20 h-20 flex items-center justify-center text-xs text-center" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.muted }}>Sin logo</div>
            )}
            <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer" style={{ border: `1px solid ${C.border}`, color: C.amber }}>
              <ImageIcon size={14} /> {logoPreview ? "Cambiar logo" : "Subir logo"}
              <input type="file" accept="image/*" className="hidden" onChange={onLogoChange} />
            </label>
          </div>
        </Field>
        <Field label="Nombre de la empresa">
          <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Mantic Mantenimiento Ingeniería & Outsourcing SRL" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="RNC">
            <input className={inputClass} style={inputStyle} value={rnc} onChange={(e) => setRnc(e.target.value)} placeholder="Ej. 1-31-45678-9" />
          </Field>
          <Field label="Teléfono">
            <input className={inputClass} style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej. 809-555-1234" />
          </Field>
        </div>
        <Field label="Dirección">
          <input className={inputClass} style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ej. Av. Independencia #123, San Pedro de Macorís" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Correo (opcional)">
            <input className={inputClass} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ej. info@tuempresa.com" />
          </Field>
          <Field label="Sitio web (opcional)">
            <input className={inputClass} style={inputStyle} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Ej. www.tuempresa.com" />
          </Field>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
      <BankAccountsManager accounts={bankAccounts} onSave={onSaveBankAccount} onDelete={onDeleteBankAccount} onSetDefault={onSetDefaultBankAccount} saving={saving} />
    </div>
  );
}

function BankAccountsManager({ accounts, onSave, onDelete, onSetDefault, saving }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [makeDefault, setMakeDefault] = useState(accounts.length === 0);

  const openNew = () => {
    setEditingId(null); setBankName(""); setAccountType(""); setAccountNumber(""); setHolderName(""); setMakeDefault(accounts.length === 0);
    setShowForm(true);
  };
  const openEdit = (acc) => {
    setEditingId(acc.id); setBankName(acc.bank_name || ""); setAccountType(acc.account_type || ""); setAccountNumber(acc.account_number || ""); setHolderName(acc.holder_name || ""); setMakeDefault(!!acc.is_default);
    setShowForm(true);
  };

  const submit = async () => {
    if (!bankName.trim() || !accountNumber.trim()) return;
    await onSave({
      bank_name: bankName.trim(), account_type: accountType.trim() || null, account_number: accountNumber.trim(),
      holder_name: holderName.trim() || null, is_default: makeDefault || accounts.length === 0,
    }, editingId);
    setShowForm(false);
  };

  return (
    <div className="mt-5 p-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Cuentas bancarias (para pagos por transferencia)</div>
        {!showForm && (
          <button onClick={openNew} className="flex items-center gap-1 text-xs px-2 py-1" style={{ border: `1px solid ${C.border}`, color: C.amber }}><Plus size={12} /> Agregar cuenta</button>
        )}
      </div>
      <div className="text-xs mb-3" style={{ color: C.muted }}>Puedes agregar varias — al hacer una factura eliges cuál mostrar como referencia de pago.</div>

      {accounts.length === 0 && !showForm && (
        <div className="text-sm text-center py-3" style={{ color: C.muted }}>Todavía no has agregado ninguna cuenta bancaria.</div>
      )}

      <div className="space-y-2 mb-3">
        {accounts.map((acc) => (
          <div key={acc.id} className="flex items-center justify-between px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold truncate">{acc.bank_name}</span>
                {acc.is_default && <Pill label="Predeterminada" color={C.green} />}
              </div>
              <div className="text-xs truncate" style={{ color: C.muted }}>
                {[acc.account_type, `Cuenta ${acc.account_number}`, acc.holder_name].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!acc.is_default && <button onClick={() => onSetDefault(acc.id)} title="Marcar como predeterminada" className="text-xs px-2 py-1" style={{ border: `1px solid ${C.border}`, color: C.muted }}>Predeterminar</button>}
              <button onClick={() => openEdit(acc)} style={iconBtnStyle}><Pencil size={13} /></button>
              <button onClick={() => onDelete(acc.id)} style={iconBtnStyle}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Banco">
              <input className={inputClass} style={inputStyle} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Ej. Banreservas" />
            </Field>
            <Field label="Tipo de cuenta (opcional)">
              <input className={inputClass} style={inputStyle} value={accountType} onChange={(e) => setAccountType(e.target.value)} placeholder="Ej. Cuenta Corriente" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Número de cuenta">
              <input className={inputClass} style={inputStyle} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Ej. 1234567890" />
            </Field>
            <Field label="A nombre de (opcional)">
              <input className={inputClass} style={inputStyle} value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Ej. Mantic Mantenimiento SRL" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer" style={{ color: C.text }}>
            <input type="checkbox" checked={makeDefault} disabled={accounts.length === 0 && !editingId} onChange={(e) => setMakeDefault(e.target.checked)} /> Usar como cuenta predeterminada al facturar
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
            <button onClick={submit} disabled={saving} className="px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
              {editingId ? "Guardar cambios" : "Agregar cuenta"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, accent, sub }) {
  return (
    <div className="p-4 flex-1 min-w-[150px]" style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeftWidth: 3, borderLeftColor: accent }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>{label}</div>
      <div className="text-3xl font-bold mt-1 font-mono" style={{ color: C.text }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

function PushSetupInline({ onEnable }) {
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

function UsageQuickUpdate({ item, onUpdate }) {
  const [value, setValue] = useState(item.current_usage ?? "");
  const [saving, setSaving] = useState(false);
  const dueByUsage = item.usage_interval && item.current_usage != null &&
    (Number(item.current_usage) - Number(item.usage_last_maintenance || 0)) >= Number(item.usage_interval);
  const save = async () => {
    if (value === "") return;
    setSaving(true);
    await onUpdate(Number(value));
    setSaving(false);
  };
  return (
    <div className="flex items-center gap-2 mt-1 flex-wrap">
      <span className="text-xs" style={{ color: dueByUsage ? C.red : C.muted }}>
        {item.current_usage ?? 0} / próx. {Number(item.usage_last_maintenance || 0) + Number(item.usage_interval || 0)} {item.usage_unit}
        {dueByUsage ? " (vencido por uso)" : ""}
      </span>
      <input type="number" step="0.1" value={value} onChange={(e) => setValue(e.target.value)} className="w-20 px-1.5 py-1 text-xs" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }} placeholder="Lectura" />
      <button onClick={save} disabled={saving} className="text-xs px-2 py-1 disabled:opacity-50" style={{ border: `1px solid ${C.border}`, color: C.amber }}>Actualizar</button>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
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

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <div className="text-xs mb-1 uppercase tracking-wide" style={{ color: C.muted }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle = { background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text };
const inputClass = "w-full px-3 py-2 text-sm outline-none focus:ring-1";
const iconBtnStyle = { color: C.muted };

function FullScreenLoader({ label }) {
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
function ChangePasswordModal({ onClose, onDone, title }) {
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

// ---------------------------------------------------------------------------
// Pantalla de acceso (login / crear cuenta)
// ---------------------------------------------------------------------------
function AuthScreen({ inviteInfo }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(inviteInfo?.email || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const submit = async () => {
    setError("");
    if (!email.trim() || !password) { setError("Completa correo y contraseña."); return; }
    setLoading(true);
    const action = mode === "login"
      ? supabase.auth.signInWithPassword({ email: email.trim(), password })
      : supabase.auth.signUp({ email: email.trim(), password });
    const { error } = await action;
    setLoading(false);
    if (error) setError(error.message);
  };

  const sendReset = async () => {
    setError("");
    if (!email.trim()) { setError("Escribe tu correo para poder enviarte el enlace."); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setResetSent(true);
  };

  if (mode === "forgot") {
    return (
      <div className="w-full min-h-[720px] flex items-center justify-center" style={{ background: C.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div className="w-full max-w-sm p-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 flex items-center justify-center" style={{ background: C.amber }}>
              <Wrench size={18} color="#1A1500" />
            </div>
            <div>
              <div className="font-bold text-base leading-none" style={{ color: C.text }}>MantenPro</div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Recuperar contraseña</div>
            </div>
          </div>
          {resetSent ? (
            <div className="text-sm mb-4" style={{ color: C.text }}>
              Si <b>{email}</b> tiene una cuenta con nosotros, te enviamos un correo con un enlace para poner una contraseña nueva. Revisa también la carpeta de spam.
            </div>
          ) : (
            <>
              <div className="text-xs mb-4" style={{ color: C.muted }}>Escribe tu correo y te enviamos un enlace para poner una contraseña nueva.</div>
              <Field label="Correo electrónico">
                <input className={inputClass} style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" />
              </Field>
              {error && <div className="text-xs mb-3" style={{ color: C.red }}>{error}</div>}
              <button onClick={sendReset} disabled={loading} className="w-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
                {loading ? "Enviando..." : "Enviar enlace de recuperación"}
              </button>
            </>
          )}
          <button onClick={() => { setMode("login"); setError(""); setResetSent(false); }} className="w-full text-xs mt-4" style={{ color: C.muted }}>
            ← Volver a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[720px] flex items-center justify-center" style={{ background: C.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="w-full max-w-sm p-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 flex items-center justify-center" style={{ background: C.amber }}>
            <Wrench size={18} color="#1A1500" />
          </div>
          <div>
            <div className="font-bold text-base leading-none" style={{ color: C.text }}>MantenPro</div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>Multi-empresa</div>
          </div>
        </div>

        {inviteInfo && (
          <div className="text-xs mb-4 px-3 py-2" style={{ background: C.panelAlt, color: C.amber, border: `1px solid ${C.border}` }}>
            Te invitaron a unirte a <b>{inviteInfo.companyName}</b> como {ROLE_CFG[inviteInfo.role]?.label || inviteInfo.role}. Inicia sesión o crea tu cuenta con el correo <b>{inviteInfo.email}</b>.
          </div>
        )}

        <div className="flex mb-5" style={{ borderBottom: `1px solid ${C.border}` }}>
          {[["login", "Iniciar sesión"], ["signup", "Crear cuenta"]].map(([key, label]) => (
            <button key={key} onClick={() => { setMode(key); setError(""); }}
              className="flex-1 text-sm py-2 font-medium"
              style={{ color: mode === key ? C.amber : C.muted, borderBottom: `2px solid ${mode === key ? C.amber : "transparent"}` }}>
              {label}
            </button>
          ))}
        </div>

        <Field label="Correo electrónico">
          <input className={inputClass} style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" />
        </Field>
        <Field label="Contraseña">
          <input className={inputClass} style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>

        {mode === "login" && (
          <button onClick={() => { setMode("forgot"); setError(""); }} className="text-xs mb-3" style={{ color: C.amber }}>
            ¿Olvidaste tu contraseña?
          </button>
        )}

        {error && <div className="text-xs mb-3" style={{ color: C.red }}>{error}</div>}

        <button onClick={submit} disabled={loading} className="w-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {loading ? "Un momento..." : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pantalla de bienvenida: crear la empresa la primera vez (sin invitación)
// ---------------------------------------------------------------------------
function OnboardingScreen({ userId, userEmail, onDone }) {
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!companyName.trim()) { setError("Escribe el nombre de tu empresa."); return; }
    setLoading(true);
    setError("");
    const { data: company, error: companyError } = await supabase
      .from("companies").insert({ name: companyName.trim() }).select().single();
    if (companyError) { setLoading(false); setError(companyError.message); return; }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId, company_id: company.id, full_name: fullName.trim() || null, role: "admin", email: userEmail,
    });
    setLoading(false);
    if (profileError) { setError(profileError.message); return; }
    onDone();
  };

  return (
    <div className="w-full min-h-[720px] flex items-center justify-center" style={{ background: C.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="w-full max-w-sm p-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="font-bold text-base mb-1" style={{ color: C.text }}>Configura tu empresa</div>
        <div className="text-xs mb-5" style={{ color: C.muted }}>Este será tu espacio de trabajo — nadie fuera de tu empresa podrá verlo.</div>

        <Field label="Nombre de la empresa">
          <input className={inputClass} style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ej. Grupo Frío RD" />
        </Field>
        <Field label="Tu nombre (opcional)">
          <input className={inputClass} style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. Darius Peña" />
        </Field>

        {error && <div className="text-xs mb-3" style={{ color: C.red }}>{error}</div>}

        <button onClick={submit} disabled={loading} className="w-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {loading ? "Creando..." : "Comenzar"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modo Soporte (solo lectura) — para el admin de la plataforma, diagnóstico
// entre empresas. Nunca llama funciones de escritura.
// ---------------------------------------------------------------------------
function GenericTable({ rows }) {
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

const SUPPORT_TABS = [
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

function SupportViewer({ onSignOut }) {
  const [companies, setCompanies] = useState([]);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [tab, setTab] = useState("profiles");
  const [data, setData] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data: comps, error: err } = await supabase.from("companies").select("*").order("name");
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
    if (!companyId) return;
    setLoadingData(true);
    const [profs, cli, prod, ord, qts, sord, inv, purch, ncf, cash] = await Promise.all([
      supabase.from("profiles").select("*").eq("company_id", companyId).order("created_at"),
      supabase.from("clients").select("*").eq("company_id", companyId).order("name"),
      supabase.from("products").select("*").eq("company_id", companyId).order("name"),
      supabase.from("work_orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(200),
      supabase.from("quotes").select("*").eq("company_id", companyId).order("quote_date", { ascending: false }).limit(200),
      supabase.from("sales_orders").select("*").eq("company_id", companyId).order("order_date", { ascending: false }).limit(200),
      supabase.from("invoices").select("*").eq("company_id", companyId).order("invoice_date", { ascending: false }).limit(200),
      supabase.from("purchases").select("*").eq("company_id", companyId).order("purchase_date", { ascending: false }).limit(200),
      supabase.from("ncf_sequences").select("*").eq("company_id", companyId),
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
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </nav>
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <button onClick={onSignOut} className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
            <LogOut size={13} /> Cerrar sesión
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {error && (
          <div className="px-4 py-2 text-xs" style={{ background: "#3A2020", color: C.red }}>Error: {error}</div>
        )}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedCompany ? (
            <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: C.muted }}>
              Selecciona una empresa a la izquierda para inspeccionar sus datos.
            </div>
          ) : (
            <>
              <div className="mb-5">
                <div className="text-xl font-bold">{selectedCompany.name}</div>
                <div className="text-xs mt-1" style={{ color: C.muted }}>
                  {selectedCompany.created_at && `Creada el ${fmtDate((selectedCompany.created_at || "").slice(0, 10))}`}
                  {selectedCompany.rnc && ` · RNC ${selectedCompany.rnc}`}
                  <span className="font-mono"> · {selectedCompany.id}</span>
                </div>
              </div>

              {loadingData ? (
                <div className="text-sm" style={{ color: C.muted }}>Cargando datos...</div>
              ) : (
                <>
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

// ---------------------------------------------------------------------------
// Pantalla de aceptación de invitación
// ---------------------------------------------------------------------------
function InviteAcceptScreen({ session, inviteInfo, onDone, onSignOut }) {
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const emailMatches = session.user.email?.toLowerCase() === inviteInfo.email.toLowerCase();

  const accept = async () => {
    setLoading(true);
    setError("");
    const { error: profErr } = await supabase.from("profiles").insert({
      id: session.user.id,
      company_id: inviteInfo.company_id,
      role: inviteInfo.role,
      technician_id: inviteInfo.technician_id || null,
      branch_id: inviteInfo.branch_id || null,
      permissions: inviteInfo.permissions || null,
      full_name: fullName.trim() || null,
      email: session.user.email,
    });
    if (profErr) { setLoading(false); setError(profErr.message); return; }
    await supabase.from("invites").update({ used: true }).eq("id", inviteInfo.id);
    setLoading(false);
    onDone();
  };

  return (
    <div className="w-full min-h-[720px] flex items-center justify-center" style={{ background: C.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="w-full max-w-sm p-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="font-bold text-base mb-1" style={{ color: C.text }}>Únete a {inviteInfo.companyName}</div>

        {!emailMatches ? (
          <>
            <div className="text-xs mt-3 mb-4" style={{ color: C.red }}>
              Esta invitación es para <b>{inviteInfo.email}</b>, pero iniciaste sesión como <b>{session.user.email}</b>. Cierra sesión y entra con el correo correcto.
            </div>
            <button onClick={onSignOut} className="w-full px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Cerrar sesión</button>
          </>
        ) : (
          <>
            <div className="text-xs mb-5" style={{ color: C.muted }}>
              Te invitaron como <b style={{ color: C.text }}>{ROLE_CFG[inviteInfo.role]?.label}</b>.
            </div>
            <Field label="Tu nombre (opcional)">
              <input className={inputClass} style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. José Pérez" />
            </Field>
            {error && <div className="text-xs mb-3" style={{ color: C.red }}>{error}</div>}
            <button onClick={accept} disabled={loading} className="w-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
              {loading ? "Uniéndote..." : "Unirme a la empresa"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modales: sucursal / técnico / equipo / ubicación (con soporte de edición)
// ---------------------------------------------------------------------------
function OrderFormModal({ branches, equipment, technicians, initial, initialExtraTechIds, attachments, onDeleteAttachment, onClose, onSave, saving }) {
  const [branchId, setBranchId] = useState(initial?.branch_id || branches[0]?.id || "");
  const [type, setType] = useState(initial?.type || "preventivo");
  const [priority, setPriority] = useState(initial?.priority || "media");
  const [title, setTitle] = useState(initial?.title || "");
  const [equipmentId, setEquipmentId] = useState(initial?.equipment_id || "");
  const [technicianId, setTechnicianId] = useState(initial?.technician_id || "");
  const [extraTechIds, setExtraTechIds] = useState(initialExtraTechIds || []);
  const [scheduled, setScheduled] = useState(initial?.scheduled || "");
  const [deadline, setDeadline] = useState(initial?.deadline || "");
  const [files, setFiles] = useState([]);

  const branchEquip = equipment.filter((e) => e.branch_id === branchId);
  const branchTechs = technicians.filter((t) => techWorksAtBranch(t, branchId) && (t.is_active !== false || t.id === technicianId || extraTechIds.includes(t.id)));
  const isImage = (name) => /\.(png|jpe?g|gif|webp)$/i.test(name || "");

  const toggleExtraTech = (id) => setExtraTechIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const submit = () => {
    if (!title.trim() || !branchId || !scheduled) return;
    if (deadline && deadline < scheduled) return;
    onSave({ branch_id: branchId, equipment_id: equipmentId || null, technician_id: technicianId || null, type, priority, title: title.trim(), scheduled, deadline: deadline || null }, files, extraTechIds.filter((id) => id !== technicianId));
  };

  return (
    <Modal title={initial?.id ? "Editar orden de trabajo" : "Nueva orden de trabajo"} onClose={onClose} wide>
      <Field label="Título / descripción breve">
        <input className={inputClass} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Ruido anormal en compresor" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Tipo de mantenimiento">
          <select className={inputClass} style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Prioridad">
          <select className={inputClass} style={inputStyle} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Fecha programada">
          <input type="date" className={inputClass} style={inputStyle} value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Fecha límite / deadline (opcional)">
          <input type="date" className={inputClass} style={inputStyle} value={deadline} min={scheduled || undefined} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Sucursal">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => { setBranchId(e.target.value); setEquipmentId(""); setTechnicianId(""); setExtraTechIds([]); }}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Equipo">
          <select className={inputClass} style={inputStyle} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
            <option value="">Sin especificar</option>
            {branchEquip.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
          </select>
        </Field>
        <Field label="Técnico principal">
          <select className={inputClass} style={inputStyle} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
            <option value="">Sin asignar</option>
            {branchTechs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      {branchTechs.length > 0 && (
        <Field label="Técnicos adicionales (opcional)">
          <div className="flex flex-wrap gap-2">
            {branchTechs.filter((t) => t.id !== technicianId).map((t) => (
              <label key={t.id} className="flex items-center gap-1.5 text-sm px-3 py-1.5 cursor-pointer" style={{ border: `1px solid ${C.border}`, background: extraTechIds.includes(t.id) ? C.panelAlt : "transparent", color: C.text }}>
                <input type="checkbox" checked={extraTechIds.includes(t.id)} onChange={() => toggleExtraTech(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
        </Field>
      )}
      {initial?.id && attachments && attachments.length > 0 && (
        <Field label="Archivos de apoyo actuales">
          <div className="grid grid-cols-2 gap-2">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                {isImage(a.file_name) ? <ImageIcon size={14} color={C.amber} /> : <FileText size={14} color={C.amber} />}
                <a href={a.file_url} target="_blank" rel="noreferrer" className="truncate flex-1" style={{ color: C.amber }}>{a.file_name || "Archivo"}</a>
                <button type="button" onClick={() => onDeleteAttachment(a)} style={iconBtnStyle}><X size={14} /></button>
              </div>
            ))}
          </div>
        </Field>
      )}
      <Field label={initial?.id ? "Agregar más archivos o imágenes de apoyo (opcional)" : "Archivos o imágenes de apoyo para el técnico (opcional)"}>
        <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setFiles(Array.from(e.target.files || []))} className={inputClass} style={inputStyle} />
        {files.length > 0 && <div className="text-xs mt-1" style={{ color: C.muted }}>{files.length} archivo{files.length !== 1 ? "s" : ""} seleccionado{files.length !== 1 ? "s" : ""} (se subirán al guardar)</div>}
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial?.id ? "Guardar cambios" : "Crear orden"}
        </button>
      </div>
    </Modal>
  );
}

function BranchFormModal({ initial, onClose, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [city, setCity] = useState(initial?.city || "");
  return (
    <Modal title={initial ? "Editar sucursal" : "Agregar sucursal"} onClose={onClose}>
      <Field label="Nombre de la sucursal">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Bávaro" />
      </Field>
      <Field label="Ciudad">
        <input className={inputClass} style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ej. Punta Cana" />
      </Field>
      {initial && <ActivityHistorySection tableName="branches" recordId={initial.id} title="Historial de esta sucursal" />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => name.trim() && onSave(name.trim(), city.trim())} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}

function TechFormModal({ branches, initial, onClose, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [specialty, setSpecialty] = useState(initial?.specialty || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || branches[0]?.id || "");
  const [extraBranchIds, setExtraBranchIds] = useState(initial?.extra_branch_ids || []);
  const [canCreateIncidents, setCanCreateIncidents] = useState(initial?.can_create_incidents || false);
  const [hourlyRate, setHourlyRate] = useState(initial?.hourly_rate ?? "");
  const toggleExtraBranch = (id) => setExtraBranchIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const otherBranches = branches.filter((b) => b.id !== branchId);
  return (
    <Modal title={initial ? "Editar técnico" : "Agregar técnico"} onClose={onClose}>
      <Field label="Nombre completo">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. José Manuel Cruz" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Especialidad">
          <input className={inputClass} style={inputStyle} value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Ej. Refrigeración industrial" />
        </Field>
        <Field label="Tarifa por hora (RD$, opcional)">
          <input type="number" step="0.01" min="0" className={inputClass} style={inputStyle} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="Ej. 350" />
        </Field>
      </div>
      <Field label="Sucursal principal">
        <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => { setBranchId(e.target.value); setExtraBranchIds((prev) => prev.filter((id) => id !== e.target.value)); }}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      {otherBranches.length > 0 && (
        <Field label="Sucursales adicionales (opcional)">
          <div className="flex flex-wrap gap-2">
            {otherBranches.map((b) => (
              <label key={b.id} className="flex items-center gap-1.5 text-sm px-3 py-1.5 cursor-pointer" style={{ border: `1px solid ${C.border}`, background: extraBranchIds.includes(b.id) ? C.panelAlt : "transparent", color: C.text }}>
                <input type="checkbox" checked={extraBranchIds.includes(b.id)} onChange={() => toggleExtraBranch(b.id)} />
                {b.name}
              </label>
            ))}
          </div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>Podrá ser asignado a órdenes, equipos y herramientas también en estas sucursales, además de la principal.</div>
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer" style={{ color: C.text }}>
        <input type="checkbox" checked={canCreateIncidents} onChange={(e) => setCanCreateIncidents(e.target.checked)} />
        Puede reportar incidentes desde la app
      </label>
      {initial && <ActivityHistorySection tableName="technicians" recordId={initial.id} title="Historial de este técnico" resolvers={{ branch_id: (id) => branches.find((b) => b.id === id)?.name }} />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => name.trim() && branchId && onSave(name.trim(), specialty.trim(), branchId, canCreateIncidents, hourlyRate === "" ? null : Number(hourlyRate), extraBranchIds)} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}

function EquipmentFormModal({ branches, locations, technicians, initial, onClose, onSave, saving, onRequestNewLocation }) {
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.type || "");
  const [brand, setBrand] = useState(initial?.brand || "");
  const [model, setModel] = useState(initial?.model || "");
  const [serial, setSerial] = useState(initial?.serial_number || "");
  const [installedAt, setInstalledAt] = useState(initial?.installed_at || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || branches[0]?.id || "");
  const [locationId, setLocationId] = useState(initial?.location_id || "");
  const [maintenanceFreq, setMaintenanceFreq] = useState(initial?.maintenance_frequency_days ?? "");
  const [nextMaintenance, setNextMaintenance] = useState(initial?.next_maintenance_date || "");
  const [defaultTechId, setDefaultTechId] = useState(initial?.default_technician_id || "");
  const [usageUnit, setUsageUnit] = useState(initial?.usage_unit || "");
  const [currentUsage, setCurrentUsage] = useState(initial?.current_usage ?? "");
  const [usageInterval, setUsageInterval] = useState(initial?.usage_interval ?? "");

  const branchLocations = locations.filter((l) => l.branch_id === branchId);
  const branchTechs = technicians.filter((t) => techWorksAtBranch(t, branchId) && (t.is_active !== false || t.id === defaultTechId));

  const submit = () => {
    if (!name.trim() || !branchId) return;
    onSave({
      name: name.trim(), type: type.trim() || null, brand: brand.trim() || null, model: model.trim() || null,
      serial_number: serial.trim() || null, installed_at: installedAt || null, branch_id: branchId, location_id: locationId || null,
      maintenance_frequency_days: maintenanceFreq === "" ? null : Number(maintenanceFreq),
      next_maintenance_date: nextMaintenance || null,
      default_technician_id: defaultTechId || null,
      usage_unit: usageUnit || null,
      current_usage: currentUsage === "" ? null : Number(currentUsage),
      usage_interval: usageInterval === "" ? null : Number(usageInterval),
      usage_last_maintenance: initial?.usage_last_maintenance ?? null,
    });
  };

  return (
    <Modal title={initial ? "Editar equipo" : "Agregar equipo"} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre / identificador">
          <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Compresor Scroll 15Ton" />
        </Field>
        <Field label="Tipo de equipo">
          <input className={inputClass} style={inputStyle} value={type} onChange={(e) => setType(e.target.value)} placeholder="Ej. Compresor, Chiller, AC Central" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca">
          <input className={inputClass} style={inputStyle} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej. Danfoss" />
        </Field>
        <Field label="Modelo">
          <input className={inputClass} style={inputStyle} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ej. SH120A3ALC" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Número de serie">
          <input className={inputClass} style={inputStyle} value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Ej. LC2504679408" />
        </Field>
        <Field label="Fecha de instalación">
          <input type="date" className={inputClass} style={inputStyle} value={installedAt} onChange={(e) => setInstalledAt(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sucursal">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => { setBranchId(e.target.value); setLocationId(""); }}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Ubicación dentro de la sucursal">
          <div className="flex gap-2">
            <select className={inputClass} style={inputStyle} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Sin especificar</option>
              {branchLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button type="button" onClick={() => onRequestNewLocation(branchId)} className="px-3 text-sm flex-shrink-0" style={{ border: `1px solid ${C.border}`, color: C.amber }}>
              <Plus size={14} />
            </button>
          </div>
        </Field>
      </div>
      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Plan de mantenimiento preventivo (opcional)</div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Frecuencia (días)">
          <input type="number" min="1" className={inputClass} style={inputStyle} value={maintenanceFreq} onChange={(e) => setMaintenanceFreq(e.target.value)} placeholder="Ej. 30, 90, 180" />
        </Field>
        <Field label="Próximo mantenimiento">
          <input type="date" className={inputClass} style={inputStyle} value={nextMaintenance} onChange={(e) => setNextMaintenance(e.target.value)} />
        </Field>
        <Field label="Técnico por defecto">
          <select className={inputClass} style={inputStyle} value={defaultTechId} onChange={(e) => setDefaultTechId(e.target.value)}>
            <option value="">Sin asignar</option>
            {branchTechs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="text-xs mb-3 -mt-1" style={{ color: C.muted }}>Si dejas la frecuencia en blanco, este equipo no aparecerá en "Mantenimiento programado".</div>
      <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Mantenimiento por uso (horómetro / kilometraje, opcional)</div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Unidad de uso">
          <select className={inputClass} style={inputStyle} value={usageUnit} onChange={(e) => setUsageUnit(e.target.value)}>
            <option value="">Sin seguimiento por uso</option>
            <option value="horas">Horas (horómetro)</option>
            <option value="km">Kilómetros</option>
          </select>
        </Field>
        <Field label={`Lectura actual${usageUnit ? ` (${usageUnit})` : ""}`}>
          <input type="number" min="0" step="0.1" disabled={!usageUnit} className={inputClass} style={inputStyle} value={currentUsage} onChange={(e) => setCurrentUsage(e.target.value)} placeholder="Ej. 1250" />
        </Field>
        <Field label="Cada cuántas unidades">
          <input type="number" min="1" disabled={!usageUnit} className={inputClass} style={inputStyle} value={usageInterval} onChange={(e) => setUsageInterval(e.target.value)} placeholder="Ej. 500" />
        </Field>
      </div>
      {initial?.usage_last_maintenance != null && usageUnit && (
        <div className="text-xs mb-3 -mt-1" style={{ color: C.muted }}>Último mantenimiento generado a las/los {initial.usage_last_maintenance} {usageUnit}. Próximo a las/los {Number(initial.usage_last_maintenance) + (Number(usageInterval) || 0)} {usageUnit}.</div>
      )}
      {initial && <ActivityHistorySection tableName="equipment" recordId={initial.id} title="Historial de este equipo" resolvers={{ branch_id: (id) => branches.find((b) => b.id === id)?.name, default_technician_id: (id) => branchTechs.find((t) => t.id === id)?.name }} />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar equipo"}
        </button>
      </div>
    </Modal>
  );
}

function LocationFormModal({ branches, defaultBranchId, onClose, onSave, saving }) {
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "");
  return (
    <Modal title="Agregar ubicación" onClose={onClose}>
      <Field label="Nombre de la ubicación">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Oficina 2, Planta baja, Torre A" />
      </Field>
      <Field label="Sucursal">
        <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => name.trim() && branchId && onSave(name.trim(), branchId)} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Agregando..." : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}

function ClientFormModal({ initial, onClose, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [rnc, setRnc] = useState(initial?.rnc_cedula || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [dgiiMatch, setDgiiMatch] = useState(null);
  const [dgiiLookupDismissed, setDgiiLookupDismissed] = useState(false);
  const [dgiiSearched, setDgiiSearched] = useState(false);

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

  const submit = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), rnc_cedula: rnc.trim() || null, phone: phone.trim() || null, email: email.trim() || null, address: address.trim() || null });
  };

  return (
    <Modal title={initial ? "Editar cliente" : "Agregar cliente"} onClose={onClose} wide>
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

const fmtMoney = (n) => `RD$ ${Number(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Clave pública VAPID del servidor de notificaciones push — es la misma para toda la
// plataforma multi-empresa (identifica al servidor que envía, no a una empresa o usuario).
// No es secreta; es seguro dejarla fija aquí.
const VAPID_PUBLIC_KEY = "BBtlXeiE7ztiQ_3JsP0kQsF2Mfrb2b19ZEhrkQxZ5G8pcYLnDbQQgNKkYa01KiSvynyaAnLT7DSZ9hI5MOKmFtk";

const waLink = (phone, text) => {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10) digits = `1${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};
const mailtoLink = (email, subject, text) => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
const invoiceReminderText = (companyName, clientName, inv, balance, days) =>
  `Hola ${clientName}, le saluda ${companyName}. Le recordamos que tiene un saldo pendiente de ${fmtMoney(balance)} correspondiente a la factura NCF ${inv.ncf || inv.id} con fecha ${fmtDate(inv.invoice_date)} (${days} días de emitida). Agradecemos su pronto pago. Cualquier duda, quedamos atentos.`;

// Agrupa las líneas de un documento por "capítulo" (sección), calculando el subtotal de cada grupo
function groupItemsByChapter(items, getAmount) {
  const map = new Map();
  const order = [];
  items.forEach((it) => {
    const ch = (it.chapter || "").trim() || "General";
    if (!map.has(ch)) { map.set(ch, []); order.push(ch); }
    map.get(ch).push(it);
  });
  return order.map((ch) => ({ chapter: ch, items: map.get(ch), subtotal: map.get(ch).reduce((s, it) => s + getAmount(it), 0) }));
}

// Convierte líneas ya guardadas (planas, con .chapter) en bloques editables (capítulo + líneas) para el formulario de edición
function itemsToBlocks(items, blankItem) {
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

// Agrupa puntos de checklist por "tema" (sección), preservando el orden de aparición
function groupChecklistItemsBySection(items) {
  const map = new Map();
  const order = [];
  (items || []).forEach((it) => {
    const sec = (it.section || "").trim() || "General";
    if (!map.has(sec)) { map.set(sec, []); order.push(sec); }
    map.get(sec).push(it);
  });
  return order.map((sec) => ({ section: sec, items: map.get(sec) }));
}

// Convierte puntos ya guardados (planos, con .section) en bloques editables (tema + puntos) para el formulario de checklist
function checklistItemsToBlocks(items) {
  let n = 0;
  const blocks = [];
  let currentSection = "";
  (items || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0)).forEach((it) => {
    const sec = (it.section || "").trim();
    if (sec !== currentSection) {
      if (sec) blocks.push({ id: n++, kind: "section", name: sec });
      currentSection = sec;
    }
    blocks.push({ id: n++, kind: "item", text: it.text });
  });
  if (blocks.length === 0) blocks.push({ id: n++, kind: "item", text: "" });
  return blocks;
}

// ---------------------------------------------------------------------------
// Buscador con autocompletado (para elegir producto por nombre/SKU en vez de una lista larga)
// ---------------------------------------------------------------------------
function ProductSearchSelect({ products, value, onChange, placeholder }) {
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
function SearchSelect({ items, value, onChange, placeholder, getLabel, getSub }) {
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

function printDocument(title, bodyHtml) {
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) { alert("Tu navegador bloqueó la ventana emergente. Permite las ventanas emergentes para poder imprimir."); return; }
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

function checklistPrintHtml({ companyName, order, branchName, equipName, techName, checklistItems }) {
  const groups = groupChecklistItemsBySection(checklistItems || []);
  const showSections = groups.length > 1 || (groups[0] && groups[0].section !== "General");
  const itemRow = (it) => `
    <tr>
      <td style="text-align:center;width:60px;">${it.checked ? "✓" : ""}</td>
      <td>${it.text || ""}</td>
      <td>${it.respuesta || ""}</td>
      <td>${it.observaciones || ""}</td>
    </tr>`;
  const rows = showSections
    ? groups.map((g) => `<tr><td colspan="4" style="background:#f2f2f2;font-weight:bold">${g.section}</td></tr>${g.items.map(itemRow).join("")}`).join("")
    : groups.map((g) => g.items.map(itemRow).join("")).join("");
  return `
    <div class="header-row">
      <div>
        <h1>${companyName || ""}</h1>
        <div class="muted">Checklist de mantenimiento &middot; Orden ${order.code}</div>
        ${order.title ? `<div class="muted" style="margin-top:2px">${order.title}</div>` : ""}
      </div>
      <div class="muted">${fmtDate(order.scheduled)}</div>
    </div>
    <div class="muted" style="margin-bottom:10px;">
      Sucursal: ${branchName(order.branch_id)} &nbsp;&middot;&nbsp;
      Equipo: ${equipName(order.equipment_id)} &nbsp;&middot;&nbsp;
      Técnico: ${techName(order.technician_id)}
    </div>
    <table>
      <thead><tr><th>Cotejo</th><th>Punto a revisar</th><th>Respuesta</th><th>Observaciones</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function invoiceLikeHtml({ docLabel, code, docTitle, companyName, companyLogo, companyRnc, companyAddress, companyPhone, companyBankName, companyBankAccountType, companyBankAccountNumber, partyLabel, clientName, clientRnc, clientAddress, dateLabel, dateValue, extraMeta, paymentTerms, items, subtotal, itbis, total, discountPct, notes, retainedLabel, retainedAmount, legalNote, currency, foreignTotal, exchangeRate }) {
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

function listHtml(title, companyName, headers, rows) {
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? "—"}</td>`).join("")}</tr>`).join("");
  return `<div class="header-row"><div><h1>${companyName}</h1><div class="muted">${title}</div></div><div class="muted">${new Date().toLocaleDateString("es-DO")}</div></div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function statementHtml(companyName, clientName, invoicesList) {
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


const addMonths = (dateStr, months) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
};
const daysBetween = (a, b) => Math.ceil((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));

function ClientAssetFormModal({ clients, branches, technicians, initial, onClose, onSave, saving, onRequestNewClient }) {
  const [clientId, setClientId] = useState(initial?.client_id || clients[0]?.id || "");
  const [name, setName] = useState(initial?.name || "");
  const [brand, setBrand] = useState(initial?.brand || "");
  const [model, setModel] = useState(initial?.model || "");
  const [serial, setSerial] = useState(initial?.serial_number || "");
  const [installDate, setInstallDate] = useState(initial?.install_date || new Date().toISOString().slice(0, 10));
  const [warrantyMonths, setWarrantyMonths] = useState(initial?.warranty_months ?? 12);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || "");
  const [maintenanceFreq, setMaintenanceFreq] = useState(initial?.maintenance_frequency_days ?? "");
  const [nextMaintenance, setNextMaintenance] = useState(initial?.next_maintenance_date || "");
  const [defaultTechId, setDefaultTechId] = useState(initial?.default_technician_id || "");
  const [usageUnit, setUsageUnit] = useState(initial?.usage_unit || "");
  const [currentUsage, setCurrentUsage] = useState(initial?.current_usage ?? "");
  const [usageInterval, setUsageInterval] = useState(initial?.usage_interval ?? "");

  const branchTechs = technicians.filter((t) => techWorksAtBranch(t, branchId) && (t.is_active !== false || t.id === defaultTechId));

  const submit = () => {
    if (!clientId || !name.trim() || !installDate) return;
    onSave({
      client_id: clientId, name: name.trim(), brand: brand.trim() || null, model: model.trim() || null,
      serial_number: serial.trim() || null, install_date: installDate, warranty_months: Number(warrantyMonths) || 0, notes: notes.trim() || null,
      branch_id: branchId || null,
      maintenance_frequency_days: maintenanceFreq === "" ? null : Number(maintenanceFreq),
      next_maintenance_date: nextMaintenance || null,
      default_technician_id: defaultTechId || null,
      usage_unit: usageUnit || null,
      current_usage: currentUsage === "" ? null : Number(currentUsage),
      usage_interval: usageInterval === "" ? null : Number(usageInterval),
      usage_last_maintenance: initial?.usage_last_maintenance ?? null,
    });
  };

  return (
    <Modal title={initial ? "Editar activo instalado" : "Agregar activo instalado"} onClose={onClose} wide>
      <Field label="Cliente">
        <div className="flex gap-2">
          <select className={inputClass} style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Selecciona uno</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" onClick={onRequestNewClient} className="px-3 flex-shrink-0" style={{ border: `1px solid ${C.border}`, color: C.amber }}><Plus size={14} /></button>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre / identificador del activo">
          <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Aire Split 24000 BTU" />
        </Field>
        <Field label="Número de serie">
          <input className={inputClass} style={inputStyle} value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Ej. LC2504679408" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca">
          <input className={inputClass} style={inputStyle} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej. Danfoss" />
        </Field>
        <Field label="Modelo">
          <input className={inputClass} style={inputStyle} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ej. SH120A3ALC" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de instalación">
          <input type="date" className={inputClass} style={inputStyle} value={installDate} onChange={(e) => setInstallDate(e.target.value)} />
        </Field>
        <Field label="Garantía (meses)">
          <input type="number" className={inputClass} style={inputStyle} value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} placeholder="Ej. 12" />
        </Field>
      </div>
      <Field label="Notas (opcional)">
        <input className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalles de la instalación" />
      </Field>
      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Plan de mantenimiento preventivo (opcional)</div>
      <div className="text-xs mb-2" style={{ color: C.muted }}>Para que este activo pueda generar órdenes de trabajo, indica qué sucursal le da seguimiento.</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sucursal responsable">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => { setBranchId(e.target.value); setDefaultTechId(""); }}>
            <option value="">Sin asignar</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Técnico por defecto">
          <select className={inputClass} style={inputStyle} value={defaultTechId} onChange={(e) => setDefaultTechId(e.target.value)} disabled={!branchId}>
            <option value="">Sin asignar</option>
            {branchTechs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frecuencia (días)">
          <input type="number" min="1" className={inputClass} style={inputStyle} value={maintenanceFreq} onChange={(e) => setMaintenanceFreq(e.target.value)} placeholder="Ej. 30, 90, 180" />
        </Field>
        <Field label="Próximo mantenimiento">
          <input type="date" className={inputClass} style={inputStyle} value={nextMaintenance} onChange={(e) => setNextMaintenance(e.target.value)} />
        </Field>
      </div>
      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Mantenimiento por uso (horómetro / kilometraje, opcional)</div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Unidad de uso">
          <select className={inputClass} style={inputStyle} value={usageUnit} onChange={(e) => setUsageUnit(e.target.value)}>
            <option value="">Sin seguimiento por uso</option>
            <option value="horas">Horas (horómetro)</option>
            <option value="km">Kilómetros</option>
          </select>
        </Field>
        <Field label={`Lectura actual${usageUnit ? ` (${usageUnit})` : ""}`}>
          <input type="number" min="0" step="0.1" disabled={!usageUnit} className={inputClass} style={inputStyle} value={currentUsage} onChange={(e) => setCurrentUsage(e.target.value)} placeholder="Ej. 1250" />
        </Field>
        <Field label="Cada cuántas unidades">
          <input type="number" min="1" disabled={!usageUnit} className={inputClass} style={inputStyle} value={usageInterval} onChange={(e) => setUsageInterval(e.target.value)} placeholder="Ej. 500" />
        </Field>
      </div>
      {initial?.usage_last_maintenance != null && usageUnit && (
        <div className="text-xs mb-3 -mt-1" style={{ color: C.muted }}>Último mantenimiento generado a las/los {initial.usage_last_maintenance} {usageUnit}. Próximo a las/los {Number(initial.usage_last_maintenance) + (Number(usageInterval) || 0)} {usageUnit}.</div>
      )}
      {initial && <ActivityHistorySection tableName="client_assets" recordId={initial.id} title="Historial de este activo" />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar activo"}
        </button>
      </div>
    </Modal>
  );
}

function ProductFormModal({ initial, existingProducts, allProducts, initialComponents, defaultItemType, branches, restrictToBranchIds, onClose, onSave, saving }) {
  const [itemType, setItemType] = useState(initial?.item_type || defaultItemType || "producto");
  const [sku, setSku] = useState(initial?.sku || "");
  const [skuManual, setSkuManual] = useState(!!initial?.sku);
  const [category, setCategory] = useState(initial?.category || "");
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [unit, setUnit] = useState(initial?.unit || "unidad");
  const [costPrice, setCostPrice] = useState(initial?.cost_price ?? "");
  const [unitPrice, setUnitPrice] = useState(initial?.unit_price ?? "");
  const [marginPct, setMarginPct] = useState(() => {
    const c = Number(initial?.cost_price) || 0, u = Number(initial?.unit_price) || 0;
    return c > 0 ? (((u - c) / c) * 100).toFixed(2) : "";
  });
  const [stockQty, setStockQty] = useState(initial?.stock_qty ?? "");
  const [branchId, setBranchId] = useState(initial?.branch_id || (restrictToBranchIds && restrictToBranchIds[0]) || "");
  const [isTaxable, setIsTaxable] = useState(initial?.is_taxable ?? true);
  const [isComposite, setIsComposite] = useState(initial?.is_composite ?? false);
  const [components, setComponents] = useState(() => (initialComponents || []).map((c) => ({ component_product_id: c.component_product_id, quantity: c.quantity })));
  const [newComponentId, setNewComponentId] = useState("");
  const [newComponentQty, setNewComponentQty] = useState(1);
  const isService = itemType === "servicio";

  const componentCandidates = (allProducts || []).filter((p) => !p.is_composite && p.id !== initial?.id);

  const addComponent = () => {
    if (!newComponentId) return;
    setComponents((prev) => {
      const existing = prev.find((c) => c.component_product_id === newComponentId);
      if (existing) return prev.map((c) => (c.component_product_id === newComponentId ? { ...c, quantity: Number(c.quantity) + Number(newComponentQty || 1) } : c));
      return [...prev, { component_product_id: newComponentId, quantity: Number(newComponentQty) || 1 }];
    });
    setNewComponentId("");
    setNewComponentQty(1);
  };
  const removeComponent = (id) => setComponents((prev) => prev.filter((c) => c.component_product_id !== id));
  const updateComponentQty = (id, qty) => setComponents((prev) => prev.map((c) => (c.component_product_id === id ? { ...c, quantity: Math.max(0.01, Number(qty) || 1) } : c)));
  const estimatedCost = components.reduce((sum, c) => {
    const p = (allProducts || []).find((x) => x.id === c.component_product_id);
    return sum + (p ? Number(p.cost_price || 0) * Number(c.quantity || 0) : 0);
  }, 0);

  const existingCategories = [...new Set((existingProducts || []).map((p) => p.category).filter(Boolean))];

  const slugPrefix = (cat) => {
    const clean = cat.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toUpperCase();
    return clean.slice(0, 3) || "GEN";
  };
  const generateSku = (cat) => {
    if (!cat.trim()) return "";
    const prefix = slugPrefix(cat.trim());
    const count = (existingProducts || []).filter((p) => (p.category || "").trim().toLowerCase() === cat.trim().toLowerCase() && (!initial || p.id !== initial.id)).length;
    return `${prefix}-${String(count + 1).padStart(3, "0")}`;
  };

  const onCategoryChange = (v) => {
    setCategory(v);
    if (!skuManual) setSku(generateSku(v));
  };
  const onSkuChange = (v) => {
    setSku(v);
    setSkuManual(true);
  };
  const regenerateSku = () => {
    setSkuManual(false);
    setSku(generateSku(category));
  };

  const priceFromMargin = (cost, margin) => {
    const c = Number(cost) || 0, m = Number(margin) || 0;
    return c > 0 || m !== 0 ? (c * (1 + m / 100)).toFixed(2) : "";
  };
  const marginFromPrice = (cost, price) => {
    const c = Number(cost) || 0, p = Number(price) || 0;
    return c > 0 ? (((p - c) / c) * 100).toFixed(2) : "";
  };

  const onCostChange = (v) => {
    setCostPrice(v);
    if (marginPct !== "") setUnitPrice(priceFromMargin(v, marginPct));
  };
  const onMarginChange = (v) => {
    setMarginPct(v);
    setUnitPrice(priceFromMargin(costPrice, v));
  };
  const onUnitPriceChange = (v) => {
    setUnitPrice(v);
    setMarginPct(marginFromPrice(costPrice, v));
  };

  const submit = () => {
    if (!name.trim() || unitPrice === "") return;
    if (isComposite && components.length === 0) return;
    onSave({
      item_type: itemType,
      sku: sku.trim() || null,
      category: category.trim() || null,
      name: name.trim(),
      description: description.trim() || null,
      unit: unit.trim() || "unidad",
      cost_price: Number(costPrice) || 0,
      unit_price: Number(unitPrice) || 0,
      stock_qty: (isService || isComposite) ? 0 : Number(stockQty) || 0,
      branch_id: isService ? null : (branchId || null),
      is_taxable: isTaxable,
      is_composite: isComposite,
    }, components);
  };

  return (
    <Modal title={initial ? (isService ? "Editar servicio" : "Editar producto") : (isService ? "Agregar servicio" : "Agregar producto")} onClose={onClose} wide>
      <Field label="Tipo">
        <div className="flex gap-2">
          <button type="button" onClick={() => setItemType("producto")} className="flex-1 px-3 py-2 text-sm" style={{ background: !isService ? C.amber : "transparent", color: !isService ? "#1A1500" : C.muted, border: `1px solid ${C.border}` }}>Producto</button>
          <button type="button" onClick={() => setItemType("servicio")} className="flex-1 px-3 py-2 text-sm" style={{ background: isService ? C.amber : "transparent", color: isService ? "#1A1500" : C.muted, border: `1px solid ${C.border}` }}>Servicio</button>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={isService ? "Nombre del servicio" : "Nombre del producto"}>
          <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={isService ? "Ej. Mantenimiento preventivo" : "Ej. Filtro deshidratador"} />
        </Field>
        <Field label="Categoría">
          <input className={inputClass} style={inputStyle} value={category} onChange={(e) => onCategoryChange(e.target.value)} placeholder="Ej. Filtros, Refrigerantes, Eléctrico" list="product-categories" />
          <datalist id="product-categories">
            {existingCategories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
      </div>
      <Field label="SKU / Código (se genera solo según la categoría)">
        <div className="flex gap-2">
          <input className={inputClass} style={inputStyle} value={sku} onChange={(e) => onSkuChange(e.target.value)} placeholder="Se genera automáticamente" />
          <button type="button" onClick={regenerateSku} title="Regenerar a partir de la categoría" className="px-3 flex-shrink-0" style={{ border: `1px solid ${C.border}`, color: C.amber }}>
            <History size={14} />
          </button>
        </div>
      </Field>
      <Field label="Descripción (opcional)">
        <input className={inputClass} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalle breve" />
      </Field>
      <div className={isService ? "grid grid-cols-2 gap-3" : "grid grid-cols-3 gap-3"}>
        <Field label="Unidad">
          <input className={inputClass} style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unidad, gal, lb" />
        </Field>
        <Field label="Costo (RD$)">
          <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={costPrice} onChange={(e) => onCostChange(e.target.value)} placeholder="0.00" />
        </Field>
        {!isService && !isComposite && (
          <Field label="Cantidad en stock">
            <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={stockQty} onChange={(e) => setStockQty(e.target.value)} placeholder="0" />
          </Field>
        )}
      </div>
      {!isService && (
        <Field label={restrictToBranchIds ? "Sucursal / dónde está guardado" : "Sucursal / dónde está guardado (opcional)"}>
          {restrictToBranchIds && restrictToBranchIds.length === 1 ? (
            <div className={inputClass} style={{ ...inputStyle, color: C.muted, cursor: "not-allowed" }}>
              {(branches || []).find((b) => b.id === branchId)?.name || "Tu sucursal"}
              {initial && initial.branch_id && !restrictToBranchIds.includes(initial.branch_id) && (
                <span style={{ color: C.amber }}> (asignado por un administrador — no lo puedes cambiar)</span>
              )}
            </div>
          ) : restrictToBranchIds ? (
            <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {(branches || []).filter((b) => restrictToBranchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : (
            <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Sin especificar</option>
              {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </Field>
      )}
      {!isService && (
        <label className="flex items-center gap-2 text-sm mb-3 p-3 cursor-pointer" style={{ color: C.text, background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <input type="checkbox" checked={isComposite} onChange={(e) => setIsComposite(e.target.checked)} />
          <div>
            <div>Este es un producto compuesto (kit / equipo armado)</div>
            <div className="text-xs" style={{ color: C.muted }}>Se cotiza y factura como un solo renglón, pero al facturarlo se descuenta del almacén cada componente por separado — no lleva stock propio.</div>
          </div>
        </label>
      )}
      {isComposite && (
        <div className="mb-3 p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Componentes de este kit</div>
          <div className="flex gap-2 mb-2">
            <div className="flex-1"><SearchSelect items={componentCandidates} value={newComponentId} onChange={setNewComponentId} placeholder="Buscar producto a agregar..." getLabel={(p) => `${p.name}${p.sku ? ` (${p.sku})` : ""}`} /></div>
            <input type="text" inputMode="decimal" value={newComponentQty} onChange={(e) => setNewComponentQty(e.target.value)} className={inputClass} style={{ ...inputStyle, width: 90 }} />
            <button type="button" onClick={addComponent} disabled={!newComponentId} className="px-3 flex-shrink-0 disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.amber }}><Plus size={14} /></button>
          </div>
          {components.length === 0 ? (
            <div className="text-xs text-center py-2" style={{ color: C.muted }}>Todavía no has agregado componentes.</div>
          ) : (
            <div className="space-y-1">
              {components.map((c) => {
                const p = (allProducts || []).find((x) => x.id === c.component_product_id);
                return (
                  <div key={c.component_product_id} className="flex items-center gap-2 text-sm px-2 py-1.5" style={{ background: C.panel }}>
                    <div className="flex-1 truncate">{p?.name || "Producto eliminado"}</div>
                    <input type="text" inputMode="decimal" value={c.quantity} onChange={(e) => updateComponentQty(c.component_product_id, e.target.value)} className={inputClass} style={{ ...inputStyle, width: 80 }} />
                    <div className="text-xs w-14 text-right" style={{ color: C.muted }}>{p?.unit || ""}</div>
                    <button type="button" onClick={() => removeComponent(c.component_product_id)} style={{ color: C.red }}><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
          {components.length > 0 && <div className="text-xs mt-2" style={{ color: C.muted }}>Costo estimado de los componentes: {fmtMoney(estimatedCost)} — sirve de referencia para poner el precio de venta del kit abajo.</div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 items-end">
        <Field label="% de ganancia sobre el costo">
          <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={marginPct} onChange={(e) => onMarginChange(e.target.value)} placeholder="Ej. 30" />
        </Field>
        <Field label="Precio de venta (RD$)">
          <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={unitPrice} onChange={(e) => onUnitPriceChange(e.target.value)} placeholder="0.00" />
        </Field>
      </div>
      <div className="text-xs mb-3 -mt-1" style={{ color: C.muted }}>
        Escribe el % de ganancia y el precio se calcula solo — o edita el precio directamente y el % se ajusta.
      </div>
      <label className="flex items-center gap-2 text-sm mb-3" style={{ color: C.text }}>
        <input type="checkbox" checked={isTaxable} onChange={(e) => setIsTaxable(e.target.checked)} />
        Aplica ITBIS (18%) al facturar
      </label>
      {initial && <ActivityHistorySection tableName="products" recordId={initial.id} title={isService ? "Historial de este servicio" : "Historial de este producto"} />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : (isService ? "Agregar servicio" : "Agregar producto")}
        </button>
      </div>
    </Modal>
  );
}

function SupplierFormModal({ initial, onClose, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [rnc, setRnc] = useState(initial?.rnc || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");

  return (
    <Modal title={initial ? "Editar proveedor" : "Agregar proveedor"} onClose={onClose}>
      <Field label="Nombre / razón social">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Refrigeración Import SRL" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="RNC (opcional)">
          <input className={inputClass} style={inputStyle} value={rnc} onChange={(e) => setRnc(e.target.value)} placeholder="Ej. 130-01234-6" />
        </Field>
        <Field label="Teléfono">
          <input className={inputClass} style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej. 809-555-9876" />
        </Field>
      </div>
      <Field label="Correo (opcional)">
        <input className={inputClass} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ej. ventas@proveedor.com" />
      </Field>
      {initial && <ActivityHistorySection tableName="suppliers" recordId={initial.id} title="Historial de este proveedor" />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => name.trim() && onSave({ name: name.trim(), rnc: rnc.trim() || null, phone: phone.trim() || null, email: email.trim() || null })} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}

function CashOpenModal({ branchName, onClose, onSave, saving }) {
  const [openingAmount, setOpeningAmount] = useState("");
  return (
    <Modal title={`Abrir caja${branchName ? " — " + branchName : ""}`} onClose={onClose}>
      <Field label="Monto inicial en efectivo (fondo de caja)">
        <input type="number" step="0.01" className={inputClass} style={inputStyle} value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} placeholder="0.00" />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => onSave(Number(openingAmount) || 0)} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Abriendo..." : "Abrir caja"}
        </button>
      </div>
    </Modal>
  );
}

function CashCloseModal({ session, branchName, expected, onClose, onSave, saving }) {
  const [declaredCash, setDeclaredCash] = useState(expected.cash.toFixed(2));
  const [declaredCard, setDeclaredCard] = useState(expected.card.toFixed(2));
  const [declaredTransfer, setDeclaredTransfer] = useState(expected.transfer.toFixed(2));
  const [notes, setNotes] = useState("");
  const diffCash = Number(declaredCash || 0) - expected.cash;
  const diffCard = Number(declaredCard || 0) - expected.card;
  const diffTransfer = Number(declaredTransfer || 0) - expected.transfer;
  const hasDiff = Math.abs(diffCash) > 0.01 || Math.abs(diffCard) > 0.01 || Math.abs(diffTransfer) > 0.01;
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
      <Field label={`Notas${hasDiff ? " (explica el descuadre)" : " (opcional)"}`}>
        <textarea rows={2} className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Faltante por cambio mal dado, sobrante sin explicación..." />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button
          onClick={() => onSave({ cash: Number(declaredCash) || 0, card: Number(declaredCard) || 0, transfer: Number(declaredTransfer) || 0, notes: notes.trim() || null })}
          disabled={saving || (hasDiff && !notes.trim())}
          className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}
        >
          {saving ? "Cerrando..." : "Cerrar caja"}
        </button>
      </div>
    </Modal>
  );
}

function UserPermissionsModal({ user, branches, onClose, onSave, onUpdateBranch, onUpdateRole, onToggleActive, saving }) {
  const [role, setRole] = useState(user.role);
  const [permissions, setPermissions] = useState((user.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)) ? user.permissions : (ROLE_DEFAULT_PERMISSIONS[user.role] || {}));
  const [branchId, setBranchId] = useState(user.branch_id || "");
  const [extraBranchIds, setExtraBranchIds] = useState(user.extra_branch_ids || []);
  const [localError, setLocalError] = useState("");
  const isActive = user.is_active ?? true;
  const toggleExtraBranch = (id) => setExtraBranchIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const otherBranches = (branches || []).filter((b) => b.id !== branchId);
  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setPermissions(ROLE_DEFAULT_PERMISSIONS[newRole] || {});
  };
  const handleSave = async () => {
    setLocalError("");
    if (role !== user.role) {
      const roleResult = await onUpdateRole(user.id, role);
      if (roleResult !== true) { setLocalError(`No se pudo cambiar el rol. Error de Supabase: ${roleResult}`); return; }
    }
    const nextExtra = branchId ? extraBranchIds : [];
    if (branchId !== (user.branch_id || "") || JSON.stringify(nextExtra) !== JSON.stringify(user.extra_branch_ids || [])) {
      await onUpdateBranch(user.id, branchId, nextExtra);
    }
    const result = await onSave(user.id, permissions);
    if (result === true) onClose();
    else setLocalError(`No se pudieron guardar los permisos. Error de Supabase: ${result}`);
  };
  return (
    <Modal title={`Gestionar a ${user.full_name || user.email}`} onClose={onClose} wide>
      {!isActive && (
        <div className="text-xs mb-3 px-3 py-2" style={{ background: C.red + "15", border: `1px solid ${C.red}40`, color: C.red }}>
          Este usuario está desactivado — no puede entrar al sistema hasta que lo reactives.
        </div>
      )}
      <Field label="Rol">
        <select className={inputClass} style={inputStyle} value={role} onChange={(e) => handleRoleChange(e.target.value)}>
          <option value="tecnico">Técnico (solo ve y actualiza sus propias órdenes)</option>
          <option value="vendedor">Vendedor (cotiza/factura y controla la caja de su sucursal)</option>
          <option value="supervisor">Supervisor (puede crear y editar todo, menos invitar usuarios)</option>
          <option value="admin">Admin (control total)</option>
        </select>
      </Field>
      {role !== user.role && (
        <div className="text-xs mb-3 px-3 py-2" style={{ background: C.amber + "15", border: `1px solid ${C.amber}40`, color: C.amber }}>
          Vas a cambiar el rol de {ROLE_CFG[user.role]?.label || user.role} a {ROLE_CFG[role]?.label || role}. Sus permisos se van a reiniciar a los que trae ese rol por defecto{role !== "admin" ? " (los puedes ajustar abajo antes de guardar)" : ""}. Este cambio se aplica al hacer clic en "Guardar cambios".
        </div>
      )}
      <Field label="Sucursal fija (opcional)">
        <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => { setBranchId(e.target.value); if (!e.target.value) setExtraBranchIds([]); }}>
          <option value="">Sin sucursal fija (ve/opera en todas)</option>
          {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      {branchId && otherBranches.length > 0 && (
        <Field label="Sucursales adicionales (opcional)">
          <div className="flex flex-wrap gap-2">
            {otherBranches.map((b) => (
              <label key={b.id} className="flex items-center gap-1.5 text-sm px-3 py-1.5 cursor-pointer" style={{ border: `1px solid ${C.border}`, background: extraBranchIds.includes(b.id) ? C.panelAlt : "transparent", color: C.text }}>
                <input type="checkbox" checked={extraBranchIds.includes(b.id)} onChange={() => toggleExtraBranch(b.id)} />
                {b.name}
              </label>
            ))}
          </div>
        </Field>
      )}
      <div className="text-xs mb-3" style={{ color: C.muted }}>Si le pones una sucursal fija, este usuario solo podrá operar (asignar productos y otras cosas restringidas por sucursal) en esa sucursal y en las adicionales que marques. Sin ninguna sucursal fija, opera en todas sin restricción.</div>
      {role === "admin" ? (
        <div className="text-xs mb-3 px-3 py-2" style={{ background: C.panelAlt, color: C.muted }}>
          Los administradores tienen acceso total a todas las secciones — no necesitan permisos individuales.
        </div>
      ) : (
        <>
          <div className="text-xs mb-2" style={{ color: C.muted }}>Estas casillas controlan exactamente qué secciones puede ver y usar.</div>
          <PermissionChecklist value={permissions} onChange={setPermissions} />
        </>
      )}
      {localError && <div className="text-xs mt-3" style={{ color: C.red }}>{localError}</div>}
      <div className="flex justify-between items-center gap-2 mt-4">
        <button onClick={async () => { await onToggleActive(user); onClose(); }} className="px-4 py-2 text-sm font-semibold" style={{ background: isActive ? C.red + "15" : C.green + "15", color: isActive ? C.red : C.green, border: `1px solid ${isActive ? C.red : C.green}40` }}>
          {isActive ? "Desactivar usuario" : "Reactivar usuario"}
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ExpenseFormModal({ suppliers, initial, onClose, onSave, saving }) {
  const [expenseDate, setExpenseDate] = useState(initial?.expense_date || (() => new Date().toISOString().slice(0, 10))());
  const [category, setCategory] = useState(initial?.category || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [supplierId, setSupplierId] = useState(initial?.supplier_id || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const submit = () => {
    if (!description.trim() || !amount) return;
    onSave({ expense_date: expenseDate, category: category.trim() || null, description: description.trim(), amount: Number(amount), supplier_id: supplierId || null, notes: notes.trim() || null });
  };
  return (
    <Modal title={initial ? "Editar gasto" : "Registrar gasto"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha">
          <input type="date" className={inputClass} style={inputStyle} value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
        </Field>
        <Field label="Categoría (opcional)">
          <input className={inputClass} style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ej. Combustible, Alquiler, Servicios" />
        </Field>
      </div>
      <Field label="Descripción">
        <input className={inputClass} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalle del gasto" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto (RD$)">
          <input type="number" step="0.01" className={inputClass} style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Proveedor (opcional)">
          <select className={inputClass} style={inputStyle} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notas (opcional)">
        <input className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones" />
      </Field>
      {initial && <ActivityHistorySection tableName="other_expenses" recordId={initial.id} title="Historial de este gasto" resolvers={{ supplier_id: (id) => suppliers.find((s) => s.id === id)?.name }} />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Registrar gasto"}
        </button>
      </div>
    </Modal>
  );
}

function ToolFormModal({ branches, technicians, initial, onClose, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [serial, setSerial] = useState(initial?.serial_number || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || branches[0]?.id || "");
  const [technicianId, setTechnicianId] = useState(initial?.technician_id || "");
  const [status, setStatus] = useState(initial?.status || "disponible");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [quantity, setQuantity] = useState(1);
  const submit = () => {
    if (!name.trim()) return;
    const base = {
      name: name.trim(),
      category: category.trim() || null,
      branch_id: branchId || null,
      technician_id: technicianId || null,
      status: technicianId ? (status === "disponible" ? "asignada" : status) : status,
      notes: notes.trim() || null,
    };
    if (initial) {
      onSave({ ...base, serial_number: serial.trim() || null });
    } else {
      const qty = Math.max(1, Number(quantity) || 1);
      if (qty === 1) {
        onSave({ ...base, serial_number: serial.trim() || null });
      } else {
        // Varias unidades idénticas a la vez — cada una queda como una
        // herramienta independiente (para poder asignarlas por separado y
        // llevar el historial de cada una), sin número de serie (se pueden
        // editar después una por una si necesitas ponerle serie a cada una).
        onSave(Array.from({ length: qty }, () => ({ ...base, serial_number: null })));
      }
    }
  };
  return (
    <Modal title={initial ? "Editar herramienta" : "Agregar herramienta"} onClose={onClose}>
      <Field label="Nombre">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Taladro inalámbrico" />
      </Field>
      <div className={initial ? "grid grid-cols-2 gap-3" : "grid grid-cols-3 gap-3"}>
        <Field label="Categoría (opcional)">
          <input className={inputClass} style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ej. Eléctrica, Manual, Medición" />
        </Field>
        {!initial && (
          <Field label="Cantidad">
            <input type="text" inputMode="numeric" className={inputClass} style={inputStyle} value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))} placeholder="1" />
          </Field>
        )}
        <Field label="No. de serie (opcional)">
          <input className={inputClass} style={inputStyle} value={serial} onChange={(e) => setSerial(e.target.value)} disabled={!initial && Number(quantity) > 1} placeholder={!initial && Number(quantity) > 1 ? "No aplica para varias unidades" : ""} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sucursal">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Sin asignar</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Estado">
          <select className={inputClass} style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(TOOL_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Asignar a técnico (opcional)">
        <select className={inputClass} style={inputStyle} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
          <option value="">Sin asignar</option>
          {technicians.filter((t) => t.is_active !== false || t.id === technicianId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <Field label="Notas (opcional)">
        <input className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones" />
      </Field>
      {initial && (
        <ActivityHistorySection
          tableName="tools"
          recordId={initial.id}
          title="Historial de esta herramienta"
          resolvers={{ technician_id: (id) => technicians.find((t) => t.id === id)?.name, branch_id: (id) => branches.find((b) => b.id === id)?.name }}
          statusLabels={Object.fromEntries(Object.entries(TOOL_STATUS_CFG).map(([k, v]) => [k, v.label]))}
        />
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}

const MATERIAL_UNITS = ["unidad", "pieza", "metro", "kg", "litro", "galón", "caja", "rollo"];

function ToolListFormModal({ tools, technicians, initial, onClose, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [toolIds, setToolIds] = useState(initial?.tool_ids || []);
  const [search, setSearch] = useState("");

  const toggleTool = (id) => setToolIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const filteredTools = tools.filter((t) => (t.name || "").toLowerCase().includes(search.toLowerCase()));
  const selectedTools = tools.filter((t) => toolIds.includes(t.id));

  const submit = () => {
    if (!name.trim() || toolIds.length === 0) return;
    onSave({ name: name.trim(), tool_ids: toolIds }, initial?.id || null);
  };

  return (
    <Modal title={initial ? "Editar listado" : "Nuevo listado de herramientas"} onClose={onClose} wide>
      <Field label="Nombre del listado">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Kit básico de electricista" />
      </Field>
      <div className="text-xs mb-3" style={{ color: C.muted }}>Después de crear el listado, podrás asignar cantidades de cada herramienta a técnicos específicos desde la tarjeta del listado.</div>
      {selectedTools.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedTools.map((t) => (
            <span key={t.id} className="flex items-center gap-1 text-xs px-2 py-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
              {t.name}
              <button type="button" onClick={() => toggleTool(t.id)} style={{ color: C.red }}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <Field label={`Herramientas del listado (${toolIds.length} seleccionadas)`}>
        <input className={inputClass} style={{ ...inputStyle, marginBottom: 6 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar herramienta..." />
        <div className="max-h-52 overflow-y-auto" style={{ border: `1px solid ${C.border}` }}>
          {filteredTools.length === 0 && <div className="text-sm text-center py-4" style={{ color: C.muted }}>Sin resultados.</div>}
          {filteredTools.map((t) => (
            <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer" style={{ borderBottom: `1px solid ${C.border}`, color: C.text }}>
              <input type="checkbox" checked={toolIds.includes(t.id)} onChange={() => toggleTool(t.id)} />
              <span className="flex-1 truncate">{t.name}</span>
              {t.technician_id && <span className="text-xs flex-shrink-0" style={{ color: C.muted }}>{technicians.find((tc) => tc.id === t.technician_id)?.name}</span>}
            </label>
          ))}
        </div>
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Crear listado"}
        </button>
      </div>
    </Modal>
  );
}

function ToolListCard({ list, tools, technicians, canEdit, canDelete, onEdit, onDelete, onAssign, onReturn }) {
  const groups = useMemo(() => {
    const map = {};
    tools.forEach((t) => {
      if (!map[t.name]) map[t.name] = { name: t.name, total: 0, available: 0, byTech: {} };
      map[t.name].total++;
      if (t.technician_id) map[t.name].byTech[t.technician_id] = (map[t.name].byTech[t.technician_id] || 0) + 1;
      else map[t.name].available++;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [tools]);
  const [inputs, setInputs] = useState({});
  const getInput = (name) => inputs[name] || { qty: "1", techId: "" };
  const setInput = (name, patch) => setInputs((prev) => ({ ...prev, [name]: { ...getInput(name), ...patch } }));

  return (
    <div className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between mb-1">
        <div className="font-semibold">{list.name}</div>
        <div className="flex items-center gap-1">
          {canEdit && <button onClick={onEdit} style={iconBtnStyle}><Pencil size={13} /></button>}
          {canDelete && <button onClick={onDelete} style={iconBtnStyle}><Trash2 size={13} /></button>}
        </div>
      </div>
      <div className="text-xs mb-3" style={{ color: C.muted }}>{tools.length} herramienta{tools.length !== 1 ? "s" : ""}</div>
      <div className="space-y-3">
        {groups.map((g) => {
          const input = getInput(g.name);
          return (
            <div key={g.name} className="p-2" style={{ background: C.panelAlt }}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-semibold">{g.name}</span>
                <span className="text-xs" style={{ color: C.muted }}>{g.total} en total · {g.available} disponible{g.available !== 1 ? "s" : ""}</span>
              </div>
              {Object.entries(g.byTech).map(([techId, count]) => (
                <div key={techId} className="flex items-center justify-between text-xs px-2 py-1" style={{ color: C.text }}>
                  <span>{technicians.find((t) => t.id === techId)?.name || "Técnico"}: {count}</span>
                  {canEdit && <button onClick={() => onReturn(list, g.name, techId, count)} className="text-xs px-2 py-0.5" style={{ color: C.amber, border: `1px solid ${C.amber}40` }}>Devolver</button>}
                </div>
              ))}
              {canEdit && g.available > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <input type="text" inputMode="numeric" value={input.qty} onChange={(e) => setInput(g.name, { qty: e.target.value.replace(/[^0-9]/g, "") })} className="w-12 px-2 py-1 text-xs" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
                  <select value={input.techId} onChange={(e) => setInput(g.name, { techId: e.target.value })} className="flex-1 px-2 py-1 text-xs" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                    <option value="">Elegir técnico...</option>
                    {technicians.filter((t) => t.is_active !== false).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button
                    onClick={() => {
                      const qty = Math.min(g.available, Math.max(1, Number(input.qty) || 1));
                      if (input.techId) { onAssign(list, g.name, qty, input.techId); setInput(g.name, { qty: "1", techId: "" }); }
                    }}
                    disabled={!input.techId}
                    className="text-xs px-2 py-1 font-semibold disabled:opacity-40"
                    style={{ background: C.amber, color: "#1A1500" }}
                  >
                    Asignar
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && <div className="text-sm text-center py-3" style={{ color: C.muted }}>Este listado no tiene herramientas.</div>}
      </div>
    </div>
  );
}

function TechnicianToolRow({ tool, technicians, myTechnicianId, activeLoan, onConfirmReceipt, onLend, onReturn }) {
  const [showLendForm, setShowLendForm] = useState(false);
  const [lendTo, setLendTo] = useState("");
  const st = TOOL_STATUS_CFG[tool.status] || TOOL_STATUS_CFG.disponible;
  const isMine = tool.technician_id === myTechnicianId;
  const isLoanedToMe = activeLoan && activeLoan.to_technician_id === myTechnicianId;
  const lenderName = isLoanedToMe ? (technicians.find((t) => t.id === activeLoan.from_technician_id)?.name || "otro técnico") : null;
  const otherTechnicians = technicians.filter((t) => t.id !== myTechnicianId && t.is_active !== false);

  return (
    <div className="px-4 py-3 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="truncate">{tool.name}</div>
          {(tool.category || tool.serial_number) && (
            <div className="text-xs truncate" style={{ color: C.muted }}>{[tool.category, tool.serial_number ? `S/N ${tool.serial_number}` : null].filter(Boolean).join(" · ")}</div>
          )}
          {isLoanedToMe && <div className="text-[11px] mt-1" style={{ color: C.amber }}>Prestada por: {lenderName}</div>}
          {tool.received_at ? (
            <div className="text-[10px] mt-1" style={{ color: C.green }}>✓ Confirmada {fmtDate(tool.received_at.slice(0, 10))}</div>
          ) : (
            <button onClick={() => onConfirmReceipt(tool.id)} className="mt-1 flex items-center gap-1 text-[11px] px-2 py-1" style={{ background: C.green + "20", color: C.green, border: `1px solid ${C.green}40` }}>
              <CheckCircle2 size={12} /> Confirmar recepción
            </button>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <Pill label={st.label} color={st.color} />
          {isMine && isLoanedToMe && (
            <button onClick={() => onReturn(tool)} className="text-[11px] px-2 py-1" style={{ border: `1px solid ${C.amber}`, color: C.amber }}>Devolver</button>
          )}
          {isMine && (
            <button onClick={() => setShowLendForm((v) => !v)} className="text-[11px] px-2 py-1" style={{ border: `1px solid ${C.border}`, color: C.text }}>Prestar</button>
          )}
        </div>
      </div>
      {showLendForm && (
        <div className="flex items-center gap-1.5 mt-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
          <select value={lendTo} onChange={(e) => setLendTo(e.target.value)} className="flex-1 px-2 py-1.5 text-xs" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
            <option value="">Elegir técnico...</option>
            {otherTechnicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button
            onClick={() => { if (lendTo) { onLend(tool, lendTo); setShowLendForm(false); setLendTo(""); } }}
            disabled={!lendTo}
            className="text-xs px-2 py-1.5 font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}
          >
            Confirmar préstamo
          </button>
        </div>
      )}
    </div>
  );
}

function BulkToolFormModal({ branches, technicians, onClose, onSave, saving }) {
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  const [categoryDefault, setCategoryDefault] = useState("");
  const [commonTechnicianId, setCommonTechnicianId] = useState("");
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState([]);

  const generateRows = () => {
    const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setRows((prev) => [
      ...prev,
      ...lines.map((name) => ({
        tempId: `${Date.now()}-${Math.random()}`,
        name,
        category: categoryDefault,
        serial_number: "",
        branch_id: branchId,
        technician_id: commonTechnicianId,
      })),
    ]);
    setRawText("");
  };

  const updateRow = (tempId, patch) => setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
  const removeRow = (tempId) => setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  const applyTechnicianToAll = () => setRows((prev) => prev.map((r) => ({ ...r, technician_id: commonTechnicianId })));

  const submit = () => {
    const valid = rows.filter((r) => r.name.trim());
    if (valid.length === 0) return;
    onSave(valid);
  };

  return (
    <Modal title="Carga masiva de herramientas" onClose={onClose} wide>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Sucursal (para las herramientas nuevas)">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Sin asignar</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Categoría por defecto (opcional)">
          <input className={inputClass} style={inputStyle} value={categoryDefault} onChange={(e) => setCategoryDefault(e.target.value)} placeholder="Ej. Eléctrica" />
        </Field>
        <Field label="Asignar todas a este técnico (opcional)">
          <select className={inputClass} style={inputStyle} value={commonTechnicianId} onChange={(e) => setCommonTechnicianId(e.target.value)}>
            <option value="">Sin asignar</option>
            {technicians.filter((t) => t.is_active !== false).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Pega la lista de herramientas (una por línea)">
        <textarea
          className={inputClass} style={{ ...inputStyle, minHeight: 100 }}
          value={rawText} onChange={(e) => setRawText(e.target.value)}
          placeholder={"Taladro Bosch\nJuego de llaves 1/4\"\nMultímetro Fluke\nEscalera de 6 pies"}
        />
      </Field>
      <div className="flex justify-end gap-2 mb-3">
        {rows.length > 0 && (
          <button onClick={applyTechnicianToAll} disabled={!commonTechnicianId} className="px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: "transparent", color: C.amber, border: `1px solid ${C.amber}40` }}>
            Aplicar técnico a las {rows.length} filas
          </button>
        )}
        <button onClick={generateRows} disabled={!rawText.trim()} className="px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.panelAlt, color: C.text, border: `1px solid ${C.border}` }}>
          Agregar a la lista
        </button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>{rows.length} herramienta{rows.length !== 1 ? "s" : ""} lista{rows.length !== 1 ? "s" : ""} para guardar</div>
          <div className="space-y-2 mb-3 max-h-80 overflow-y-auto pr-1">
            {rows.map((r) => (
              <div key={r.tempId} className="grid grid-cols-12 gap-2 min-w-[860px] items-center">
                <input className={`${inputClass} col-span-3`} style={inputStyle} value={r.name} onChange={(e) => updateRow(r.tempId, { name: e.target.value })} placeholder="Nombre" />
                <input className={`${inputClass} col-span-2`} style={inputStyle} value={r.category} onChange={(e) => updateRow(r.tempId, { category: e.target.value })} placeholder="Categoría" />
                <input className={`${inputClass} col-span-2`} style={inputStyle} value={r.serial_number} onChange={(e) => updateRow(r.tempId, { serial_number: e.target.value })} placeholder="No. serie" />
                <select className={`${inputClass} col-span-2`} style={inputStyle} value={r.branch_id} onChange={(e) => updateRow(r.tempId, { branch_id: e.target.value })}>
                  <option value="">Sin sucursal</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select className={`${inputClass} col-span-2`} style={inputStyle} value={r.technician_id} onChange={(e) => updateRow(r.tempId, { technician_id: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {technicians.filter((t) => t.is_active !== false || t.id === r.technician_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button onClick={() => removeRow(r.tempId)} className="col-span-1 flex justify-center" style={iconBtnStyle}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving || rows.length === 0} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : `Guardar ${rows.length || ""} herramienta${rows.length !== 1 ? "s" : ""}`}
        </button>
      </div>
    </Modal>
  );
}


function MaterialFormModal({ branches, initial, onClose, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || branches[0]?.id || "");
  const [quantity, setQuantity] = useState(initial?.quantity ?? "");
  const [unit, setUnit] = useState(initial?.unit || MATERIAL_UNITS[0]);
  const [notes, setNotes] = useState(initial?.notes || "");
  const submit = () => {
    if (!name.trim() || quantity === "") return;
    onSave({ name: name.trim(), branch_id: branchId || null, quantity: Number(quantity), unit, notes: notes.trim() || null });
  };
  return (
    <Modal title={initial ? "Editar material" : "Agregar material al almacén"} onClose={onClose}>
      <Field label="Nombre del material">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tubería PVC 1/2, cable THHN #12" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cantidad">
          <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Unidad">
          <select className={inputClass} style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {MATERIAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Sucursal">
        <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">Sin asignar</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field label="Notas (opcional)">
        <input className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="De qué orden sobró, condición, etc." />
      </Field>
      {initial && <ActivityHistorySection tableName="inventory_materials" recordId={initial.id} title="Historial de este material" resolvers={{ branch_id: (id) => branches.find((b) => b.id === id)?.name }} />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}

function ProjectFormModal({ branches, clients, technicians, initial, onClose, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [clientId, setClientId] = useState(initial?.client_id || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || "");
  const [leadTechnicianId, setLeadTechnicianId] = useState(initial?.lead_technician_id || "");
  const [status, setStatus] = useState(initial?.status || "activo");
  const [budget, setBudget] = useState(initial?.budget ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date || "");
  const [endDate, setEndDate] = useState(initial?.end_date || "");
  const [description, setDescription] = useState(initial?.description || "");
  const submit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      client_id: clientId || null,
      branch_id: branchId || null,
      lead_technician_id: leadTechnicianId || null,
      status,
      budget: budget === "" ? null : Number(budget),
      start_date: startDate || null,
      end_date: endDate || null,
      description: description.trim() || null,
    });
  };
  return (
    <Modal title={initial ? "Editar proyecto" : "Nuevo proyecto"} onClose={onClose} wide>
      <Field label="Nombre del proyecto">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Remodelación planta eléctrica — Hotel Faro" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cliente (opcional)">
          <SearchSelect items={clients} value={clientId} onChange={setClientId} placeholder="Buscar cliente..." getLabel={(c) => c.name} />
        </Field>
        <Field label="Sucursal">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Sin asignar</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Técnico responsable (opcional)">
          <select className={inputClass} style={inputStyle} value={leadTechnicianId} onChange={(e) => setLeadTechnicianId(e.target.value)}>
            <option value="">Sin asignar</option>
            {technicians.filter((t) => t.is_active !== false || t.id === leadTechnicianId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        {initial && (
          <Field label="Estado">
            <select className={inputClass} style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(PROJECT_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Presupuesto (opcional)">
          <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Fecha de inicio">
          <input type="date" className={inputClass} style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Fecha estimada de fin">
          <input type="date" className={inputClass} style={inputStyle} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Descripción / notas (opcional)">
        <textarea className={inputClass} style={{ ...inputStyle, minHeight: 80 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Alcance del proyecto, detalles relevantes..." />
      </Field>
      {initial && <ActivityHistorySection tableName="projects" recordId={initial.id} title="Historial de este proyecto" resolvers={{ client_id: (id) => clients.find((c) => c.id === id)?.name, branch_id: (id) => branches.find((b) => b.id === id)?.name, lead_technician_id: (id) => technicians.find((t) => t.id === id)?.name }} />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Crear proyecto"}
        </button>
      </div>
    </Modal>
  );
}

function ProjectDetailModal({
  project, clients, branches, technicians, orders, salesOrders, materials, projectMaterials,
  canEditProjects, canDeleteProjects, onClose, onEdit, onDelete, onSetStatus,
  onLinkOrder, onUnlinkOrder, onLinkSalesOrder, onUnlinkSalesOrder, onAddMaterial, onRemoveMaterial, saving,
}) {
  const [pickOrderId, setPickOrderId] = useState("");
  const [pickSalesOrderId, setPickSalesOrderId] = useState("");
  const [pickMaterialId, setPickMaterialId] = useState("");
  const [pickMaterialQty, setPickMaterialQty] = useState("");
  const [pickMaterialNotes, setPickMaterialNotes] = useState("");

  const linkedOrders = orders.filter((o) => o.project_id === project.id);
  const availableOrders = orders.filter((o) => !o.project_id);
  const linkedSalesOrders = salesOrders.filter((o) => o.project_id === project.id);
  const availableSalesOrders = salesOrders.filter((o) => !o.project_id);
  const linkedMaterials = projectMaterials.filter((pm) => pm.project_id === project.id);
  const availableMaterials = materials.filter((m) => Number(m.quantity || 0) > 0);

  const clientName = clients.find((c) => c.id === project.client_id)?.name || "—";
  const branchNameStr = branches.find((b) => b.id === project.branch_id)?.name || "—";
  const leadTechName = technicians.find((t) => t.id === project.lead_technician_id)?.name || "Sin asignar";

  return (
    <Modal title={project.name} onClose={onClose} wide>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Pill label={PROJECT_STATUS_CFG[project.status]?.label || "Activo"} color={PROJECT_STATUS_CFG[project.status]?.color || C.green} />
          {canEditProjects && (
            <select value={project.status} onChange={(e) => onSetStatus(project, e.target.value)} className="px-2 py-1.5 text-xs" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
              {Object.entries(PROJECT_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
        </div>
        {(canEditProjects || canDeleteProjects) && (
          <div className="flex items-center gap-2">
            {canEditProjects && <button onClick={() => onEdit(project)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ border: `1px solid ${C.border}`, color: C.text }}><Pencil size={12} /> Editar</button>}
            {canDeleteProjects && <button onClick={() => onDelete(project)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ background: C.red, color: "#fff" }}><Trash2 size={12} /> Eliminar</button>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
        <div><div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Cliente</div><div>{clientName}</div></div>
        <div><div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Sucursal</div><div>{branchNameStr}</div></div>
        <div><div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Responsable</div><div>{leadTechName}</div></div>
        <div><div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Presupuesto</div><div>{project.budget != null ? Number(project.budget).toLocaleString("es-DO", { style: "currency", currency: "DOP" }) : "—"}</div></div>
        <div><div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Inicio</div><div>{project.start_date ? fmtDate(project.start_date) : "—"}</div></div>
        <div><div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Fin estimado</div><div>{project.end_date ? fmtDate(project.end_date) : "—"}</div></div>
      </div>
      {project.description && <div className="text-sm mb-4 p-3" style={{ background: C.panelAlt, color: C.muted }}>{project.description}</div>}

      {/* Órdenes de trabajo */}
      <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-sm font-semibold mb-2">Órdenes de trabajo vinculadas ({linkedOrders.length})</div>
        <div className="space-y-2 mb-3">
          {linkedOrders.map((o) => (
            <div key={o.id} className="flex items-center justify-between px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <div>
                <span className="font-mono text-xs mr-2" style={{ color: C.muted }}>{o.code}</span>
                {o.title}
                <span className="ml-2 text-xs" style={{ color: C.muted }}>{STATUS_CFG[o.status]?.label}</span>
              </div>
              {canEditProjects && <button onClick={() => onUnlinkOrder(o.id)} style={iconBtnStyle} title="Quitar del proyecto"><Unlink size={14} /></button>}
            </div>
          ))}
          {linkedOrders.length === 0 && <div className="text-xs" style={{ color: C.muted }}>Todavía no hay órdenes de trabajo vinculadas.</div>}
        </div>
        {canEditProjects && (
          <div className="flex gap-2">
            <div className="flex-1"><SearchSelect items={availableOrders} value={pickOrderId} onChange={setPickOrderId} placeholder="Buscar orden de trabajo sin proyecto..." getLabel={(o) => `${o.code} — ${o.title}`} /></div>
            <button onClick={() => { if (pickOrderId) { onLinkOrder(project.id, pickOrderId); setPickOrderId(""); } }} disabled={!pickOrderId} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}><Link2 size={12} /> Vincular</button>
          </div>
        )}
      </div>

      {/* Materiales */}
      <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-sm font-semibold mb-2">Materiales asignados ({linkedMaterials.length})</div>
        <div className="space-y-2 mb-3">
          {linkedMaterials.map((pm) => {
            const mat = materials.find((m) => m.id === pm.material_id);
            return (
              <div key={pm.id} className="flex items-center justify-between px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                <div>
                  {mat?.name || "Material eliminado"} <span className="text-xs" style={{ color: C.muted }}>× {Number(pm.quantity).toLocaleString("es-DO")} {mat?.unit || ""}</span>
                  {pm.notes && <div className="text-xs" style={{ color: C.muted }}>{pm.notes}</div>}
                </div>
                {canDeleteProjects && <button onClick={() => onRemoveMaterial(pm)} style={iconBtnStyle} title="Quitar y devolver al inventario"><Trash2 size={14} /></button>}
              </div>
            );
          })}
          {linkedMaterials.length === 0 && <div className="text-xs" style={{ color: C.muted }}>Todavía no hay materiales asignados a este proyecto.</div>}
        </div>
        {canEditProjects && (
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[160px]"><SearchSelect items={availableMaterials} value={pickMaterialId} onChange={setPickMaterialId} placeholder="Buscar material sobrante..." getLabel={(m) => `${m.name} (disp. ${Number(m.quantity).toLocaleString("es-DO")} ${m.unit || ""})`} /></div>
            <input type="text" inputMode="decimal" className="px-3 py-2 text-sm w-24" style={inputStyle} value={pickMaterialQty} onChange={(e) => setPickMaterialQty(e.target.value)} placeholder="Cant." />
            <input type="text" className="px-3 py-2 text-sm flex-1 min-w-[120px]" style={inputStyle} value={pickMaterialNotes} onChange={(e) => setPickMaterialNotes(e.target.value)} placeholder="Notas (opcional)" />
            <button
              onClick={() => { if (pickMaterialId && pickMaterialQty) { onAddMaterial(project.id, pickMaterialId, pickMaterialQty, pickMaterialNotes); setPickMaterialId(""); setPickMaterialQty(""); setPickMaterialNotes(""); } }}
              disabled={!pickMaterialId || !pickMaterialQty || saving}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}
            ><Plus size={12} /> Descontar y asignar</button>
          </div>
        )}
      </div>

      {/* Órdenes de venta */}
      <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-sm font-semibold mb-2">Órdenes de venta vinculadas ({linkedSalesOrders.length})</div>
        <div className="space-y-2 mb-3">
          {linkedSalesOrders.map((o) => (
            <div key={o.id} className="flex items-center justify-between px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <div>
                <span className="font-mono text-xs mr-2" style={{ color: C.muted }}>{o.order_number}</span>
                {o.title}
                <span className="ml-2 text-xs" style={{ color: C.muted }}>{Number(o.total || 0).toLocaleString("es-DO", { style: "currency", currency: "DOP" })}</span>
              </div>
              {canEditProjects && <button onClick={() => onUnlinkSalesOrder(o.id)} style={iconBtnStyle} title="Quitar del proyecto"><Unlink size={14} /></button>}
            </div>
          ))}
          {linkedSalesOrders.length === 0 && <div className="text-xs" style={{ color: C.muted }}>Todavía no hay órdenes de venta vinculadas.</div>}
        </div>
        {canEditProjects && (
          <div className="flex gap-2">
            <div className="flex-1"><SearchSelect items={availableSalesOrders} value={pickSalesOrderId} onChange={setPickSalesOrderId} placeholder="Buscar orden de venta sin proyecto..." getLabel={(o) => `${o.order_number} — ${o.title}`} /></div>
            <button onClick={() => { if (pickSalesOrderId) { onLinkSalesOrder(project.id, pickSalesOrderId); setPickSalesOrderId(""); } }} disabled={!pickSalesOrderId} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}><Link2 size={12} /> Vincular</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

const ACCOUNT_TYPES = ["Activo", "Pasivo", "Patrimonio", "Ingreso", "Gasto"];

function AccountFormModal({ initial, onClose, onSave, saving }) {
  const [code, setCode] = useState(initial?.code || "");
  const [name, setName] = useState(initial?.name || "");
  const [accountType, setAccountType] = useState(initial?.account_type || "Gasto");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const submit = () => {
    if (!code.trim() || !name.trim()) return;
    onSave({ code: code.trim(), name: name.trim(), account_type: accountType, is_active: isActive });
  };
  return (
    <Modal title={initial ? "Editar cuenta" : "Agregar cuenta"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Código">
          <input className={inputClass} style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej. 4010" />
        </Field>
        <Field label="Tipo">
          <select className={inputClass} style={inputStyle} value={accountType} onChange={(e) => setAccountType(e.target.value)}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Nombre de la cuenta">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ventas de servicios" />
      </Field>
      <label className="flex items-center gap-2 text-sm mt-2" style={{ color: C.muted }}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Cuenta activa
      </label>
      {initial && <ActivityHistorySection tableName="chart_of_accounts" recordId={initial.id} title="Historial de esta cuenta" />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar cuenta"}
        </button>
      </div>
    </Modal>
  );
}

function TaxRateFormModal({ initial, onClose, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [ratePct, setRatePct] = useState(initial?.rate_pct ?? "");
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
  const submit = () => {
    if (!name.trim() || ratePct === "") return;
    onSave({ name: name.trim(), rate_pct: Number(ratePct), is_default: isDefault });
  };
  return (
    <Modal title={initial ? "Editar tasa impositiva" : "Agregar tasa impositiva"} onClose={onClose}>
      <Field label="Nombre">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. ITBIS, Exento" />
      </Field>
      <Field label="Tasa (%)">
        <input type="number" step="0.01" className={inputClass} style={inputStyle} value={ratePct} onChange={(e) => setRatePct(e.target.value)} placeholder="18" />
      </Field>
      <label className="flex items-center gap-2 text-sm mt-2" style={{ color: C.muted }}>
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Usar como tasa por defecto
      </label>
      <div className="text-xs mt-2" style={{ color: C.muted }}>Este catálogo es informativo por ahora — las cotizaciones y facturas siguen calculando ITBIS al 18% de forma fija.</div>
      {initial && <ActivityHistorySection tableName="tax_rates" recordId={initial.id} title="Historial de esta tasa" />}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}

function PurchaseFormModal({ suppliers, products, onClose, onSave, saving, onRequestNewSupplier, onEnsureGenericProduct }) {
  const [title, setTitle] = useState("");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [blocks, setBlocks] = useState([{ id: 0, kind: "item", product_id: "", quantity: 1, unit_cost: 0, is_taxable: true }]);
  const [retainItbis, setRetainItbis] = useState(false);
  const [retainIsr, setRetainIsr] = useState(false);
  const [pdfDetectedTotal, setPdfDetectedTotal] = useState(null);
  const [readingPdf, setReadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const newBlockId = () => Date.now() + Math.random();

  const handlePdfUpload = async (file) => {
    if (!file) return;
    setReadingPdf(true);
    setPdfError("");
    setPdfDetectedTotal(null);
    try {
      const { fullText, invoiceNumber: detectedNumber, isoDate, total } = await extractInvoiceDataFromPdf(file);
      if (detectedNumber) setInvoiceNumber(detectedNumber);
      if (isoDate) setPurchaseDate(isoDate);
      if (total != null) setPdfDetectedTotal(total);

      const matchedSupplier = suppliers.find((s) => s.name && fullText.toLowerCase().includes(s.name.toLowerCase()));
      if (matchedSupplier) setSupplierId(matchedSupplier.id);

      if (total != null) {
        const generic = await onEnsureGenericProduct();
        if (generic) {
          setBlocks([{ id: newBlockId(), kind: "item", product_id: generic.id, quantity: 1, unit_cost: total, is_taxable: true }]);
        }
      }

      const notices = [];
      if (!detectedNumber) notices.push("No se detectó No. de factura");
      if (!isoDate) notices.push("no se detectó fecha");
      if (total == null) notices.push("no se detectó el total (agrega los renglones manualmente)");
      if (!matchedSupplier) notices.push("no se identificó un proveedor ya registrado (selecciónalo manualmente)");
      if (notices.length > 0) setPdfError(notices.join(", ") + ".");
    } catch (err) {
      setPdfError("No se pudo leer el PDF: " + err.message);
    }
    setReadingPdf(false);
  };

  const updateBlock = (id, patch) => setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const addItemRow = () => setBlocks((prev) => [...prev, { id: newBlockId(), kind: "item", product_id: "", quantity: 1, unit_cost: 0, is_taxable: true }]);
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
    updateBlock(id, { product_id: productId, unit_cost: prod ? prod.cost_price : 0, is_taxable: prod?.is_taxable ?? true });
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

  const itemAmount = (it) => (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0);
  const serviceValue = resolvedItems.reduce((sum, it) => sum + itemAmount(it), 0);
  const taxableValue = resolvedItems.reduce((sum, it) => sum + (it.is_taxable ? itemAmount(it) : 0), 0);
  const apply254_06 = retainItbis || retainIsr;
  const itbisAmount = taxableValue * 0.18;
  const isrRetained = retainIsr ? serviceValue * 0.10 : 0;
  const itbisRetained = retainItbis ? itbisAmount : 0;
  const total = serviceValue + itbisAmount - isrRetained - itbisRetained;
  const chapterGroups = groupItemsByChapter(resolvedItems, itemAmount);
  const hasChapters = chapterGroups.length > 1 || (chapterGroups[0] && chapterGroups[0].chapter !== "General");
  const chapterSubtotal = (name) => chapterGroups.find((g) => g.chapter === (name.trim() || "General"))?.subtotal || 0;

  const submit = () => {
    const validItems = resolvedItems.filter((it) => it.product_id && Number(it.quantity) > 0);
    if (!supplierId || validItems.length === 0) return;
    onSave({
      title: title.trim() || null, supplier_id: supplierId, invoice_number: invoiceNumber.trim() || null, purchase_date: purchaseDate, notes: notes.trim() || null,
      applies_254_06: apply254_06, retains_itbis: retainItbis, retains_isr: retainIsr,
      service_value: serviceValue, itbis_amount: itbisAmount, isr_retained: isrRetained, itbis_retained: itbisRetained,
      total,
    }, validItems);
  };

  return (
    <Modal title="Registrar compra" onClose={onClose} wide>
      <div className="mb-3 p-3" style={{ background: C.panelAlt, border: `1px solid ${C.amber}60` }}>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: C.amber }}>
          <Upload size={14} />
          {readingPdf ? "Leyendo PDF..." : "Subir factura en PDF (autocompleta proveedor, No., fecha y total)"}
          <input type="file" accept="application/pdf" className="hidden" disabled={readingPdf} onChange={(e) => handlePdfUpload(e.target.files?.[0])} />
        </label>
        {pdfDetectedTotal != null && (
          <div className="text-xs mt-1" style={{ color: C.muted }}>
            Total detectado: <span className="font-mono" style={{ color: C.text }}>{fmtMoney(pdfDetectedTotal)}</span> — se creó un renglón por ese monto. Revisa y presiona "Registrar compra"; puedes editar el renglón si lo necesitas.
          </div>
        )}
        {pdfError && <div className="text-xs mt-1" style={{ color: C.red }}>{pdfError}</div>}
      </div>
      <Field label="Título de la compra (opcional)">
        <input className={inputClass} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Reposición de inventario trimestral" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Proveedor">
          <div className="flex gap-2">
            <div className="flex-1"><SearchSelect items={suppliers} value={supplierId} onChange={setSupplierId} placeholder="Buscar proveedor..." getLabel={(s) => s.name} /></div>
            <button type="button" onClick={onRequestNewSupplier} className="px-3 flex-shrink-0" style={{ border: `1px solid ${C.border}`, color: C.amber }}><Plus size={14} /></button>
          </div>
        </Field>
        <Field label="No. de factura del proveedor (opcional)">
          <input className={inputClass} style={inputStyle} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ej. F-00123" />
        </Field>
        <Field label="Fecha de compra">
          <input type="date" className={inputClass} style={inputStyle} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </Field>
      </div>

      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Productos comprados</div>
      <div className="grid grid-cols-12 gap-2 min-w-[860px] text-[10px] uppercase tracking-wide mb-1 px-1" style={{ color: C.muted }}>
        <div className="col-span-4">Producto</div>
        <div className="col-span-1">Cantidad</div>
        <div className="col-span-2">Costo unitario</div>
        <div className="col-span-1">ITBIS</div>
        <div className="col-span-3 text-right">Subtotal</div>
        <div className="col-span-1"></div>
      </div>
      <div className="space-y-2 mb-3">
        {blocks.map((b) => {
          if (b.kind === "chapter") {
            return (
              <div key={b.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); reorderBlocks(e.dataTransfer.getData("text/plain"), b.id); }}
                className="flex items-center gap-2 pt-2"
              >
                <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(b.id))} className="cursor-grab flex-shrink-0 touch-none" style={{ color: C.muted }} title="Arrastrar para reordenar">
                  <GripVertical size={16} />
                </div>
                <input className={inputClass} style={{ ...inputStyle, fontWeight: 600, color: C.amber, borderColor: C.amber + "60" }} value={b.name} onChange={(e) => updateBlock(b.id, { name: e.target.value })} placeholder="Nombre del capítulo — ej. Repuestos, Consumibles" />
                <div className="text-sm font-mono flex-shrink-0" style={{ color: C.amber, minWidth: 100, textAlign: "right" }}>{fmtMoney(chapterSubtotal(b.name))}</div>
                <button onClick={() => removeBlock(b.id)} style={iconBtnStyle}><X size={16} /></button>
              </div>
            );
          }
          const prod = products.find((p) => p.id === b.product_id);
          return (
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
                  <ProductSearchSelect products={products} value={b.product_id} onChange={(id) => onProductPick(b.id, id)} placeholder="Buscar producto..." />
                </div>
              </div>
              <input type="text" inputMode="decimal" className={`${inputClass} col-span-1`} style={inputStyle} value={b.quantity} onChange={(e) => updateBlock(b.id, { quantity: e.target.value })} placeholder="Cant." />
              <input type="text" inputMode="decimal" className={`${inputClass} col-span-2`} style={inputStyle} value={b.unit_cost} onChange={(e) => updateBlock(b.id, { unit_cost: e.target.value })} placeholder="Costo unit." />
              <label className="col-span-1 flex items-center gap-1 text-xs" style={{ color: C.muted }}>
                <input type="checkbox" checked={b.is_taxable} onChange={(e) => updateBlock(b.id, { is_taxable: e.target.checked })} /> ITBIS
              </label>
              <div className="col-span-3 text-sm font-mono text-right" style={{ color: C.muted }}>{fmtMoney((Number(b.quantity) || 0) * (Number(b.unit_cost) || 0))}</div>
              <button onClick={() => removeBlock(b.id)} className="col-span-1" style={iconBtnStyle}><X size={16} /></button>
              {prod && <div className="col-span-12 text-xs -mt-1" style={{ color: C.muted }}>Stock actual: {prod.stock_qty} {prod.unit}</div>}
            </div>
          );
        })}
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

      <label className="flex items-center gap-2 text-sm mt-3 p-3" style={{ color: C.text, background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <input type="checkbox" checked={retainItbis} onChange={(e) => setRetainItbis(e.target.checked)} />
        <div>
          <div>Retener ITBIS 100%</div>
          <div className="text-xs" style={{ color: C.muted }}>Servicio de persona física (profesional independiente) — Reglamento 254-06.</div>
        </div>
      </label>
      <label className="flex items-center gap-2 text-sm mt-2 p-3" style={{ color: C.text, background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <input type="checkbox" checked={retainIsr} onChange={(e) => setRetainIsr(e.target.checked)} />
        <div>
          <div>Retener ISR 10%</div>
          <div className="text-xs" style={{ color: C.muted }}>Sobre el valor del servicio — Reglamento 254-06. Actívalo independientemente del ITBIS; hay casos donde no aplica retención de ISR.</div>
        </div>
      </label>

      <Field label="Notas (opcional)">
        <input className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones de la compra" />
      </Field>

      <div className="mt-2 mb-4 p-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(serviceValue)}</span></div>
        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS (18%)</span><span className="font-mono">{fmtMoney(itbisAmount)}</span></div>
        {retainItbis && <div className="flex justify-between text-sm" style={{ color: C.red }}><span>Retención ITBIS 100%</span><span className="font-mono">-{fmtMoney(itbisRetained)}</span></div>}
        {retainIsr && <div className="flex justify-between text-sm" style={{ color: C.red }}><span>Retención ISR 10%</span><span className="font-mono">-{fmtMoney(isrRetained)}</span></div>}
        <div className="flex justify-between text-base font-bold" style={{ color: C.text }}><span>{apply254_06 ? "Neto a pagar al proveedor" : "Total de la compra"}</span><span className="font-mono">{fmtMoney(total)}</span></div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : "Registrar compra"}
        </button>
      </div>
    </Modal>
  );
}

function PurchaseDetailModal({ purchase, items, payments, supplierName, supplierRnc, companyName, company, canEdit, canDelete, onClose, onRegisterPayment, onDeletePayment }) {
  const chapterGroups = groupItemsByChapter(items, (it) => Number(it.subtotal) || 0);
  const showChapters = chapterGroups.length > 1 || (chapterGroups[0] && chapterGroups[0].chapter !== "General");
  const balance = Number(purchase.total) - Number(purchase.amount_paid || 0);
  const payCfg = PAYABLE_STATUS_CFG[purchase.payment_status] || PAYABLE_STATUS_CFG.pendiente;
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payAmount, setPayAmount] = useState(balance > 0 ? balance.toFixed(2) : "");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const submitPayment = () => {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return;
    onRegisterPayment(purchase, { amount: amt, payment_date: payDate, method: payMethod.trim() || null, notes: payNotes.trim() || null });
    setShowPaymentForm(false);
    setPayNotes("");
  };
  const doPrint = () => {
    const html = invoiceLikeHtml({
      docLabel: "Orden de compra", code: purchase.invoice_number, docTitle: purchase.title, companyName,
      companyLogo: company?.logo_url, companyRnc: company?.rnc, companyAddress: company?.address, companyPhone: company?.phone,
      partyLabel: "Proveedor", clientName: supplierName, clientRnc: supplierRnc, dateLabel: "Fecha", dateValue: fmtDate(purchase.purchase_date),
      items: items.map((it) => ({ description: it.productName, quantity: it.quantity, unit_price: it.unit_cost, subtotal: it.subtotal, is_taxable: false, chapter: it.chapter })),
      subtotal: purchase.service_value ?? purchase.total,
      itbis: purchase.itbis_amount || 0,
      total: purchase.total, notes: purchase.notes,
      retainedLabel: "Retención" + (purchase.retains_itbis ? " ITBIS 100%" : "") + (purchase.retains_itbis && purchase.retains_isr ? " +" : "") + (purchase.retains_isr ? " ISR 10%" : ""),
      retainedAmount: purchase.applies_254_06 ? Number(purchase.itbis_retained || 0) + Number(purchase.isr_retained || 0) : 0,
      legalNote: purchase.applies_254_06 ? "Aplica Reglamento 254-06." : null,
    });
    printDocument(`Compra ${purchase.invoice_number || ""}`, html);
  };
  return (
    <Modal title={`Compra${purchase.invoice_number ? " · " + purchase.invoice_number : ""}`} onClose={onClose} wide>
      {purchase.title && <div className="text-sm font-semibold mb-2" style={{ color: C.text }}>{purchase.title}</div>}
      {purchase.applies_254_06 && <div className="text-xs mb-2 font-semibold" style={{ color: C.amber }}>Aplica Reglamento 254-06.</div>}
      <div className="grid grid-cols-4 gap-3 text-xs mb-4" style={{ color: C.muted }}>
        <div>Proveedor<br /><span style={{ color: C.text }}>{supplierName}</span>{supplierRnc && <span style={{ color: C.muted }}> · RNC: {supplierRnc}</span>}</div>
        <div>Fecha<br /><span style={{ color: C.text }}>{fmtDate(purchase.purchase_date)}</span></div>
        <div>Total<br /><span style={{ color: C.text }}>{fmtMoney(purchase.total)}</span></div>
        <div>Estado<br /><span style={{ color: payCfg.color }}>{payCfg.label}</span></div>
      </div>
      {(purchase.itbis_amount > 0 || purchase.applies_254_06) && (
        <div className="p-3 mb-3 space-y-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(purchase.service_value)}</span></div>
          <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS (18%)</span><span className="font-mono">{fmtMoney(purchase.itbis_amount)}</span></div>
          {purchase.retains_itbis && <div className="flex justify-between text-sm" style={{ color: C.red }}><span>Retención ITBIS 100%</span><span className="font-mono">-{fmtMoney(purchase.itbis_retained)}</span></div>}
          {purchase.retains_isr && <div className="flex justify-between text-sm" style={{ color: C.red }}><span>Retención ISR 10%</span><span className="font-mono">-{fmtMoney(purchase.isr_retained)}</span></div>}
          <div className="flex justify-between text-sm font-semibold" style={{ color: C.text }}><span>{purchase.applies_254_06 ? "Neto pagado al proveedor" : "Total"}</span><span className="font-mono">{fmtMoney(purchase.total)}</span></div>
        </div>
      )}
      <div className="space-y-1">
        {showChapters ? chapterGroups.map((g) => (
          <div key={g.chapter}>
            <div className="flex items-center justify-between text-xs uppercase tracking-wide px-3 py-1" style={{ color: C.amber }}>
              <span>{g.chapter}</span><span className="font-mono">{fmtMoney(g.subtotal)}</span>
            </div>
            {g.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt }}>
                <div>{it.productName}</div>
                <div className="font-mono" style={{ color: C.muted }}>{it.quantity} × {fmtMoney(it.unit_cost)} = {fmtMoney(it.subtotal)}</div>
              </div>
            ))}
          </div>
        )) : items.map((it) => (
          <div key={it.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt }}>
            <div>{it.productName}</div>
            <div className="font-mono" style={{ color: C.muted }}>{it.quantity} × {fmtMoney(it.unit_cost)} = {fmtMoney(it.subtotal)}</div>
          </div>
        ))}
      </div>
      {purchase.notes && <div className="text-xs mt-3" style={{ color: C.muted }}>Notas: <span style={{ color: C.text }}>{purchase.notes}</span></div>}

      <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Pagos a proveedor</div>
          <div className="text-sm" style={{ color: C.muted }}>Saldo pendiente: <span className="font-mono" style={{ color: balance > 0 ? C.red : C.green }}>{fmtMoney(balance)}</span></div>
        </div>
        {payments.length > 0 && (
          <div className="mb-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt }}>
                <div>{fmtDate(p.payment_date)} {p.method && <span style={{ color: C.muted }}>· {p.method}</span>}{p.notes && <div className="text-xs" style={{ color: C.muted }}>{p.notes}</div>}</div>
                <div className="flex items-center gap-3">
                  <span className="font-mono" style={{ color: C.green }}>{fmtMoney(p.amount)}</span>
                  {canDelete && <button onClick={() => onDeletePayment(p, purchase)} style={iconBtnStyle}><Trash2 size={13} /></button>}
                </div>
              </div>
            ))}
          </div>
        )}
        {canEdit && balance > 0 && !showPaymentForm && (
          <button onClick={() => setShowPaymentForm(true)} className="flex items-center gap-2 text-sm" style={{ color: C.amber }}><Plus size={14} /> Registrar pago</button>
        )}
        {showPaymentForm && (
          <div className="p-3 space-y-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monto">
                <input type="number" step="0.01" className={inputClass} style={inputStyle} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </Field>
              <Field label="Fecha">
                <input type="date" className={inputClass} style={inputStyle} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Método (opcional)">
              <input className={inputClass} style={inputStyle} value={payMethod} onChange={(e) => setPayMethod(e.target.value)} placeholder="Ej. Transferencia, Efectivo, Cheque" />
            </Field>
            <Field label="Notas (opcional)">
              <textarea rows={2} className={inputClass} style={inputStyle} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Ej. Referencia de transferencia, banco..." />
            </Field>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowPaymentForm(false); setPayNotes(""); }} className="px-3 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
              <button onClick={submitPayment} className="px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Guardar pago</button>
            </div>
          </div>
        )}
      </div>

      <ActivityHistorySection
        tableName="purchases"
        recordId={purchase.id}
        title="Historial de esta compra"
        resolvers={{ supplier_id: () => supplierName }}
        statusLabels={Object.fromEntries(Object.entries(PAYABLE_STATUS_CFG).map(([k, v]) => [k, v.label]))}
      />

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={doPrint} className="flex items-center gap-2 px-4 py-2 text-sm" style={{ color: C.amber, border: `1px solid ${C.border}` }}><FileText size={14} /> Imprimir</button>
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Cerrar</button>
      </div>
    </Modal>
  );
}

const NCF_TYPES = [
  { code: "B01", label: "B01 · Crédito Fiscal" },
  { code: "B02", label: "B02 · Consumo" },
  { code: "B04", label: "B04 · Nota de Crédito" },
  { code: "B14", label: "B14 · Régimen Especial" },
  { code: "B15", label: "B15 · Gubernamental" },
];

function NCFSequenceFormModal({ initial, onClose, onSave, saving }) {
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

function InvoiceFormModal({ clients, products, ncfSequences, branches, bankAccounts, defaultBranchId, prefill, maxDiscountPct, onClose, onSave, saving, onRequestNewClient }) {
  const [title, setTitle] = useState(prefill?.title || "");
  const [clientId, setClientId] = useState(prefill?.client_id || clients[0]?.id || "");
  const [sequenceId, setSequenceId] = useState("");
  const [branchId, setBranchId] = useState(prefill?.branch_id || defaultBranchId || branches?.[0]?.id || "");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [discountPct, setDiscountPct] = useState(prefill?.discount_pct ?? 0);
  const [applyNorma0205, setApplyNorma0205] = useState(false);
  const [exemptItbis, setExemptItbis] = useState(false);
  const [currency, setCurrency] = useState(prefill?.currency || "DOP");
  const [exchangeRate, setExchangeRate] = useState(prefill?.exchange_rate ?? 1);
  const [paymentTerms, setPaymentTerms] = useState(prefill?.payment_terms || "");
  const [bankAccountId, setBankAccountId] = useState(prefill?.bank_account_id || (bankAccounts || []).find((a) => a.is_default)?.id || "");
  const [notes, setNotes] = useState(prefill?.notes || "");
  const blankItem = { product_id: "", description: "", quantity: 1, unit_price: 0, is_taxable: true, register_asset: false, asset_serial: "", asset_warranty_months: 12 };
  const [blocks, setBlocks] = useState(() => {
    if (prefill?.items?.length) return itemsToBlocks(prefill.items, blankItem);
    return [{ id: 0, kind: "item", ...blankItem }];
  });
  const newBlockId = () => Date.now() + Math.random();

  const usableSequences = ncfSequences.filter((s) => s.active && s.next_number <= s.range_end);

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

function InvoiceDetailModal({ invoice, items, payments, clientName, clientRnc, clientAddress, companyName, company, bankAccounts, canEdit, canDelete, isAdmin, onClose, onVoid, onRegisterPayment, onDeletePayment, onDeletePaymentAttachment }) {
  const statusColor = invoice.status === "anulada" ? C.red : C.green;
  const payCfg = PAYMENT_STATUS_CFG[invoice.payment_status] || PAYMENT_STATUS_CFG.pendiente;
  const balance = Number(invoice.total) - Number(invoice.amount_paid || 0) - Number(invoice.credit_applied || 0);
  const chapterGroups = groupItemsByChapter(items, (it) => Number(it.subtotal) || 0);
  const showChapters = chapterGroups.length > 1 || (chapterGroups[0] && chapterGroups[0].chapter !== "General");
  const isImage = (name) => /\.(png|jpe?g|gif|webp)$/i.test(name || "");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payAmount, setPayAmount] = useState(balance > 0 ? balance.toFixed(2) : "");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paymentFiles, setPaymentFiles] = useState([]);

  const selectedBankAccount = (bankAccounts || []).find((a) => a.id === invoice.bank_account_id) || null;
  const doPrint = () => {
    const html = invoiceLikeHtml({
      docLabel: "Factura", code: invoice.invoice_number || invoice.ncf, docTitle: invoice.title, companyName, clientName, clientRnc, clientAddress,
      companyLogo: company?.logo_url, companyRnc: company?.rnc, companyAddress: company?.address, companyPhone: company?.phone,
      companyBankName: selectedBankAccount?.bank_name, companyBankAccountType: selectedBankAccount?.account_type, companyBankAccountNumber: selectedBankAccount?.account_number,
      dateLabel: "Fecha", dateValue: fmtDate(invoice.invoice_date), extraMeta: `<br/>NCF: ${invoice.ncf}`, paymentTerms: invoice.payment_terms, notes: invoice.notes,
      items, subtotal: invoice.subtotal, itbis: invoice.itbis, total: invoice.total, discountPct: invoice.discount_pct,
      retainedLabel: "Retención ITBIS 30% (Norma 02-05)", retainedAmount: invoice.itbis_retained || 0,
      legalNote: [invoice.exempt_itbis ? "Factura exenta de ITBIS." : null, invoice.applies_norma_0205 ? "Aplica Norma 02-05 — Retención del 30% del ITBIS." : null].filter(Boolean).join(" ") || null,
      currency: invoice.currency, foreignTotal: invoice.foreign_total, exchangeRate: invoice.exchange_rate,
    });
    printDocument(`Factura ${invoice.invoice_number || invoice.ncf}`, html);
  };

  const submitPayment = () => {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return;
    onRegisterPayment(invoice, { amount: amt, payment_date: payDate, method: payMethod.trim() || null, notes: payNotes.trim() || null }, paymentFiles);
    setShowPaymentForm(false);
    setPayNotes("");
    setPaymentFiles([]);
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
                  <div>{fmtDate(p.payment_date)} {p.method && <span style={{ color: C.muted }}>· {p.method}</span>}</div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono" style={{ color: C.green }}>{fmtMoney(p.amount)}</span>
                    {canDelete && <button onClick={() => onDeletePayment(p, invoice)} style={iconBtnStyle}><Trash2 size={13} /></button>}
                  </div>
                </div>
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
            <Field label="Monto pagado">
              <input type="number" step="0.01" className={inputClass} style={inputStyle} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </Field>
            <Field label="Fecha del pago">
              <input type="date" className={inputClass} style={inputStyle} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Método (opcional)">
            <select className={inputClass} style={inputStyle} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option value="">Selecciona un método</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Otro">Otro</option>
            </select>
          </Field>
          <Field label="Notas (opcional)">
            <textarea rows={2} className={inputClass} style={inputStyle} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Ej. Referencia de transferencia, banco, número de cheque..." />
          </Field>
          <Field label="Comprobantes de pago (opcional)">
            <input type="file" multiple accept="image/*,.pdf" onChange={(e) => setPaymentFiles(Array.from(e.target.files || []))} className={inputClass} style={inputStyle} />
            {paymentFiles.length > 0 && <div className="text-xs mt-1" style={{ color: C.muted }}>{paymentFiles.length} archivo{paymentFiles.length !== 1 ? "s" : ""} seleccionado{paymentFiles.length !== 1 ? "s" : ""} (se subirán al guardar)</div>}
          </Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowPaymentForm(false); setPayNotes(""); setPaymentFiles([]); }} className="px-3 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
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

const PAYMENT_STATUS_CFG = {
  pendiente: { label: "Pendiente de cobro", color: "#E8654F" },
  parcial: { label: "Parcialmente cobrada", color: "#F2A93B" },
  cobrada: { label: "Cobrada", color: "#4CAF6D" },
};

const PAYABLE_STATUS_CFG = {
  pendiente: { label: "Pendiente de pago", color: "#E8654F" },
  parcial: { label: "Parcialmente pagada", color: "#F2A93B" },
  pagada: { label: "Pagada", color: "#4CAF6D" },
};

function CreditNoteFormModal({ invoices, clients, ncfSequences, onClose, onSave, saving }) {
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
  const subtotal = selectedItems.reduce((sum, it) => sum + itemAmount(it), 0);
  const itbis = selectedItems.reduce((sum, it) => sum + (it.is_taxable ? itemAmount(it) * 0.18 : 0), 0);
  const total = subtotal + itbis;

  const submit = () => {
    if (!invoiceId || !sequenceId || selectedItems.length === 0) return;
    onSave(
      { invoice_id: invoiceId, client_id: selectedInvoice.client_id, ncf_sequence_id: sequenceId, reason: reason.trim() || null, subtotal, itbis, total },
      selectedItems
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

const CREDIT_NOTE_STATUS_CFG = {
  emitida: { label: "Emitida", color: "#4FA8D8" },
};

function RecurringContractFormModal({ clients, branches, ncfSequences, initial, onClose, onSave, saving }) {
  const [clientId, setClientId] = useState(initial?.client_id || clients[0]?.id || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || "");
  const [ncfSequenceId, setNcfSequenceId] = useState(initial?.ncf_sequence_id || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [isTaxable, setIsTaxable] = useState(initial?.is_taxable ?? true);
  const [frequencyDays, setFrequencyDays] = useState(initial?.frequency_days ?? 30);
  const [nextInvoiceDate, setNextInvoiceDate] = useState(initial?.next_invoice_date || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(initial?.end_date || "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [notes, setNotes] = useState(initial?.notes || "");

  const b02Sequences = ncfSequences.filter((s) => s.ncf_type === "B02" && s.next_number <= s.range_end);

  const submit = () => {
    if (!clientId || !title.trim() || !amount || !frequencyDays || !nextInvoiceDate) return;
    if (endDate && endDate < nextInvoiceDate) return;
    onSave({
      client_id: clientId, branch_id: branchId || null, ncf_sequence_id: ncfSequenceId || null,
      title: title.trim(), description: description.trim() || null, amount: Number(amount), is_taxable: isTaxable,
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
        <Field label="Monto (RD$, antes de ITBIS)">
          <input type="number" step="0.01" min="0" className={inputClass} style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Cada cuántos días facturar">
          <input type="number" min="1" className={inputClass} style={inputStyle} value={frequencyDays} onChange={(e) => setFrequencyDays(e.target.value)} placeholder="Ej. 30" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sucursal (opcional)">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Sin especificar</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Secuencia NCF (B02)">
          <select className={inputClass} style={inputStyle} value={ncfSequenceId} onChange={(e) => setNcfSequenceId(e.target.value)}>
            <option value="">Sin asignar</option>
            {b02Sequences.map((s) => <option key={s.id} value={s.id}>{s.prefix} (disp. {s.range_end - s.next_number + 1})</option>)}
          </select>
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

function CreditNoteDetailModal({ note, items, invoice, clientName, clientRnc, companyName, company, onClose }) {
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

const QUOTE_STATUS_CFG = {
  pendiente: { label: "Pendiente", color: "#8B92A0" },
  aprobada: { label: "Aprobada", color: "#4CAF6D" },
  rechazada: { label: "Rechazada", color: "#E8654F" },
  en_orden: { label: "En orden de venta", color: "#4FA8D8" },
  parcial: { label: "Facturada parcialmente", color: "#4FA8D8" },
  convertida: { label: "Convertida en factura", color: "#F2A93B" },
};

const SALES_ORDER_STATUS_CFG = {
  en_proceso: { label: "En proceso", color: "#4FA8D8" },
  facturada: { label: "Facturada", color: "#4CAF6D" },
  cancelada: { label: "Cancelada", color: "#E8654F" },
};

function QuoteFormModal({ clients, products, prefill, initial, initialItems, maxDiscountPct, onClose, onSave, saving, onRequestNewClient }) {
  const [title, setTitle] = useState(initial?.title || prefill?.title || "");
  const [clientId, setClientId] = useState(initial?.client_id || prefill?.client_id || clients[0]?.id || "");
  const [quoteDate, setQuoteDate] = useState(initial?.quote_date || (() => new Date().toISOString().slice(0, 10))());
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
      title: title.trim() || null, client_id: clientId, quote_date: quoteDate, valid_until: validUntil || null, discount_pct: discountPct,
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
            <div className="flex-1"><SearchSelect items={clients} value={clientId} onChange={setClientId} placeholder="Buscar cliente..." getLabel={(c) => c.name} /></div>
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

function QuoteDetailModal({ quote, items, clientName, clientRnc, clientAddress, companyName, company, bankAccounts, orderInfo, canEdit, canDelete, onClose, onMarkStatus, onConvertToOrder, onEdit, onDuplicate, onDelete }) {
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

function SalesOrderDetailModal({ order, items, clientName, clientRnc, companyName, company, workOrderInfo, canEdit, canDelete, onClose, onGenerateInvoice, onGenerateWorkOrder, onCancel, onDelete, onUpdateNotes }) {
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

const INCIDENT_STATUS_CFG = {
  abierto: { label: "Abierto", color: "#E8654F" },
  en_revision: { label: "En revisión", color: "#F2A93B" },
  resuelto: { label: "Completado", color: "#4CAF6D" },
  descartado: { label: "Descartado", color: "#8B92A0" },
  convertido: { label: "Convertido", color: "#4FA8D8" },
};

function IncidentFormModal({ branches, equipment, clients, technicians, initial, onClose, onSave, saving, onRequestNewClient }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || "");
  const [equipmentId, setEquipmentId] = useState(initial?.equipment_id || "");
  const [clientId, setClientId] = useState(initial?.client_id || "");
  const [reportedBy, setReportedBy] = useState(initial?.reported_by || "");
  const [priority, setPriority] = useState(initial?.priority || "media");
  const [technicianId, setTechnicianId] = useState(initial?.technician_id || "");

  const branchEquip = equipment.filter((e) => e.branch_id === branchId);

  const submit = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(), description: description.trim() || null, branch_id: branchId || null,
      equipment_id: equipmentId || null, client_id: clientId || null, reported_by: reportedBy.trim() || null, priority,
      technician_id: technicianId || null,
    });
  };

  return (
    <Modal title={initial ? "Editar incidente" : "Reportar incidente"} onClose={onClose} wide>
      <Field label="Título del incidente">
        <input className={inputClass} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Fuga de refrigerante en cámara fría" />
      </Field>
      <Field label="Descripción (opcional)">
        <textarea rows={3} className={inputClass} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalles de lo ocurrido" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reportado por (opcional)">
          <input className={inputClass} style={inputStyle} value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Nombre de quien reporta" />
        </Field>
        <Field label="Prioridad">
          <select className={inputClass} style={inputStyle} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Asignar a técnico (opcional)">
        <select className={inputClass} style={inputStyle} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
          <option value="">Sin asignar</option>
          {technicians.filter((t) => t.is_active !== false || t.id === technicianId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Vincular a (opcional)</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sucursal / equipo interno">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => { setBranchId(e.target.value); setEquipmentId(""); }}>
            <option value="">Sin especificar</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Equipo">
          <select className={inputClass} style={inputStyle} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} disabled={!branchId}>
            <option value="">Sin especificar</option>
            {branchEquip.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Cliente relacionado">
        <div className="flex gap-2">
          <div className="flex-1"><SearchSelect items={clients} value={clientId} onChange={setClientId} placeholder="Buscar cliente (opcional)..." getLabel={(c) => c.name} /></div>
          <button type="button" onClick={onRequestNewClient} className="px-3 flex-shrink-0" style={{ border: `1px solid ${C.border}`, color: C.amber }}><Plus size={14} /></button>
        </div>
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Reportar incidente"}
        </button>
      </div>
    </Modal>
  );
}

function IncidentDetailModal({ incident, branchName, equipName, clientName, techName, technicians, orders, quotes, canEdit, canDelete, isTecnico, onClose, onMarkStatus, onConvertOrder, onConvertQuote, onDelete, onSaveProgress, onComplete, onEdit, onAssignTechnician, onReopen }) {
  const s = INCIDENT_STATUS_CFG[incident.status] || INCIDENT_STATUS_CFG.abierto;
  const p = PRIORITY_CFG[incident.priority] || PRIORITY_CFG.media;
  const linkedOrder = incident.work_order_id ? orders.find((o) => o.id === incident.work_order_id) : null;
  const linkedQuote = incident.quote_id ? quotes.find((q) => q.id === incident.quote_id) : null;

  // El rol técnico solo puede llenar "Lo encontrado" mientras el incidente no esté completado ni descartado —
  // no puede crear, borrar, convertir, completar ni editar la solución, sin importar el permiso configurado.
  // Admin/Supervisor siempre pueden editar hallazgos y solución, en cualquier estado, incluido "Convertido".
  const canManage = canEdit && !isTecnico; // descartar / reabrir / convertir
  const canManageDelete = canDelete && !isTecnico; // eliminar
  const canEditBasics = canEdit && !isTecnico; // editar título, descripción, etc.
  const canEditFull = canEdit && !isTecnico; // hallazgos + solución + marcar completado (admin/supervisor)
  const techCanEditFindings = isTecnico && incident.status !== "resuelto" && incident.status !== "descartado";
  const canEditFindingsField = canEditFull || techCanEditFindings;

  const [findings, setFindings] = useState(incident.findings || "");
  const [savingProgress, setSavingProgress] = useState(false);

  const saveProgress = async () => {
    setSavingProgress(true);
    await onSaveProgress(incident, findings.trim() || null);
    setSavingProgress(false);
  };
  const complete = async () => {
    setSavingProgress(true);
    await onComplete(incident, findings.trim() || null);
    setSavingProgress(false);
    onClose();
  };
  const discard = () => {
    onMarkStatus(incident, "descartado");
    onClose();
  };
  const reopen = () => onReopen(incident);

  return (
    <Modal title={incident.title} onClose={onClose} wide>
      <div className="flex flex-wrap gap-2 mb-4">
        <Pill label={s.label} color={s.color} />
        <Pill label={p.label} color={p.color} />
      </div>
      {incident.description && <div className="text-sm mb-3" style={{ color: C.text }}>{incident.description}</div>}
      <div className="grid grid-cols-2 gap-3 text-xs mb-4" style={{ color: C.muted }}>
        <div>Reportado por<br /><span style={{ color: C.text }}>{incident.reported_by || "Sin especificar"}</span></div>
        <div>Fecha<br /><span style={{ color: C.text }}>{fmtDate(incident.created_at?.slice(0, 10))}</span></div>
        <div>Sucursal / equipo<br /><span style={{ color: C.text }}>{branchName(incident.branch_id)}{incident.equipment_id ? ` · ${equipName(incident.equipment_id)}` : ""}</span></div>
        <div>Cliente<br /><span style={{ color: C.text }}>{incident.client_id ? clientName(incident.client_id) : "Sin especificar"}</span></div>
        <div>
          Técnico asignado<br />
          {canManage ? (
            <select value={incident.technician_id || ""} onChange={(e) => onAssignTechnician(incident.id, e.target.value)} className="mt-1 px-2 py-1.5 text-xs" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
              <option value="">Sin asignar</option>
              {technicians.filter((t) => t.is_active !== false || t.id === incident.technician_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <span style={{ color: C.text }}>{techName(incident.technician_id)}</span>
          )}
        </div>
      </div>

      {(incident.attended_at || incident.completed_at) && (
        <div className="flex gap-4 text-xs mb-4" style={{ color: C.muted }}>
          {incident.attended_at && <div>Atendido en <span style={{ color: C.text }}>{((new Date(incident.attended_at) - new Date(incident.created_at)) / 3600000).toFixed(1)} h</span></div>}
          {incident.completed_at && <div>Resuelto en <span style={{ color: C.text }}>{((new Date(incident.completed_at) - new Date(incident.created_at)) / 3600000).toFixed(1)} h</span></div>}
        </div>
      )}

      {linkedOrder && <div className="text-xs mb-2 px-3 py-2" style={{ background: C.panelAlt, color: C.blue }}>Orden vinculada: <span className="font-mono">{linkedOrder.code}</span></div>}
      {linkedQuote && <div className="text-xs mb-2 px-3 py-2" style={{ background: C.panelAlt, color: C.blue }}>Cotización vinculada: <span className="font-mono">{linkedQuote.quote_number}</span></div>}

      <div className="mt-2 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Hallazgos</div>
        <Field label="Lo encontrado">
          {canEditFindingsField ? (
            <textarea rows={3} className={inputClass} style={inputStyle} value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="Qué se encontró al revisar el incidente" />
          ) : (
            <div className="text-sm px-3 py-2" style={{ background: C.panelAlt, color: findings ? C.text : C.muted }}>{findings || "Sin registrar"}</div>
          )}
        </Field>
        {canEditFindingsField && (
          <div className="flex justify-end gap-2 mt-1">
            <button onClick={saveProgress} disabled={savingProgress} className="px-3 py-2 text-sm disabled:opacity-50" style={{ color: C.text, border: `1px solid ${C.border}` }}>
              Guardar avance
            </button>
            <button onClick={complete} disabled={savingProgress} className="px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.green, color: "#0E1512" }}>
              Marcar como completado
            </button>
          </div>
        )}
      </div>

      <ActivityHistorySection
        tableName="incidents"
        recordId={incident.id}
        title="Historial de este incidente"
        resolvers={{ technician_id: techName }}
        statusLabels={Object.fromEntries(Object.entries(INCIDENT_STATUS_CFG).map(([k, v]) => [k, v.label]))}
      />

      <div className="flex flex-wrap justify-end gap-2 mt-4 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        {canEdit && !isTecnico && incident.status === "abierto" && (
          <button onClick={() => onMarkStatus(incident, "en_revision")} className="px-4 py-2 text-sm" style={{ color: C.amber, border: `1px solid ${C.amber}40` }}>Marcar en revisión</button>
        )}
        {canManage && incident.status === "abierto" && (
          <button onClick={discard} className="px-4 py-2 text-sm" style={{ color: C.red, border: `1px solid ${C.red}40` }}>Descartar</button>
        )}
        {canManage && (incident.status === "resuelto" || incident.status === "descartado") && (
          <button onClick={reopen} className="px-4 py-2 text-sm" style={{ color: C.blue, border: `1px solid ${C.blue}40` }}>Reabrir incidente</button>
        )}
        {canManage && !incident.work_order_id && (
          <button onClick={() => onConvertOrder(incident)} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Convertir en orden de trabajo</button>
        )}
        {canManage && !incident.quote_id && (
          <button onClick={() => onConvertQuote(incident)} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Convertir en cotización</button>
        )}
        {canEditBasics && <button onClick={() => onEdit(incident)} className="px-4 py-2 text-sm" style={{ color: C.text, border: `1px solid ${C.border}` }}>Editar datos</button>}
        {canManageDelete && <button onClick={() => onDelete(incident.id)} style={iconBtnStyle}><Trash2 size={16} /></button>}
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cerrar</button>
      </div>
    </Modal>
  );
}

function StatementModal({ clients, invoices, companyName, onClose }) {
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

function InviteFormModal({ technicians, branches, saving, generatedLink, onClose, onSave, onCloseAfterLink }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("tecnico");
  const [technicianId, setTechnicianId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [permissions, setPermissions] = useState(ROLE_DEFAULT_PERMISSIONS.tecnico || {});

  if (generatedLink) {
    return (
      <Modal title="Invitación creada" onClose={onCloseAfterLink}>
        <div className="text-sm mb-3" style={{ color: C.text }}>Comparte este enlace con la persona que quieres invitar:</div>
        <div className="flex gap-2">
          <input readOnly className={inputClass} style={inputStyle} value={generatedLink} onClick={(e) => e.target.select()} />
          <button onClick={() => navigator.clipboard.writeText(generatedLink)} className="px-3" style={{ border: `1px solid ${C.border}`, color: C.amber }}>
            <Copy size={14} />
          </button>
        </div>
        <div className="text-xs mt-3" style={{ color: C.muted }}>El enlace deja de funcionar una vez la persona acepte la invitación.</div>
        <div className="flex justify-end mt-4">
          <button onClick={onCloseAfterLink} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Listo</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Invitar usuario" onClose={onClose} wide>
      <Field label="Correo electrónico">
        <input className={inputClass} style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@correo.com" />
      </Field>
      <Field label="Rol">
        <select className={inputClass} style={inputStyle} value={role} onChange={(e) => { setRole(e.target.value); setTechnicianId(""); setBranchId(""); setPermissions(ROLE_DEFAULT_PERMISSIONS[e.target.value] || {}); }}>
          <option value="tecnico">Técnico (solo ve y actualiza sus propias órdenes)</option>
          <option value="vendedor">Vendedor (cotiza/factura y controla la caja de su sucursal)</option>
          <option value="supervisor">Supervisor (puede crear y editar todo, menos invitar usuarios)</option>
          <option value="admin">Admin (control total)</option>
        </select>
      </Field>
      {role === "tecnico" && (
        <Field label="Vincular a un técnico existente (opcional)">
          <select className={inputClass} style={inputStyle} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
            <option value="">Sin vincular</option>
            {technicians.filter((t) => t.is_active !== false).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      )}
      {role === "vendedor" && (
        <Field label="Sucursal asignada">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Selecciona una sucursal</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      )}
      {role !== "admin" && (
        <Field label="Acceso a secciones (puedes ajustar lo que marcó el rol)">
          <PermissionChecklist value={permissions} onChange={setPermissions} />
        </Field>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => email.trim() && onSave(email.trim(), role, technicianId || null, branchId || null, role === "admin" ? null : permissions)} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Creando..." : "Crear invitación"}
        </button>
      </div>
    </Modal>
  );
}

function ChecklistTemplateFormModal({ initial, onClose, onSave, saving }) {
  const [equipmentType, setEquipmentType] = useState(initial?.equipment_type || "");
  const [name, setName] = useState(initial?.name || "");
  const [blocks, setBlocks] = useState(() => checklistItemsToBlocks(initial?.items));
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const newBlockId = () => Date.now() + Math.random();

  const updateBlock = (id, patch) => setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const addItemRow = () => setBlocks((prev) => [...prev, { id: newBlockId(), kind: "item", text: "" }]);
  const addSectionRow = () => setBlocks((prev) => [...prev, { id: newBlockId(), kind: "section", name: "" }]);
  const removeBlock = (id) => setBlocks((prev) => prev.filter((b) => b.id !== id));

  const resolvedItems = useMemo(() => {
    let current = "";
    const result = [];
    blocks.forEach((b) => {
      if (b.kind === "section") current = b.name.trim();
      else result.push({ text: b.text, section: current });
    });
    return result;
  }, [blocks]);

  const onPdfChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfError("");
    setExtractingPdf(true);
    try {
      const extracted = await extractChecklistItemsFromPdf(file);
      if (extracted.length === 0) {
        setPdfError("No se encontró texto en el PDF. Si es un PDF escaneado (imagen), no se puede leer así.");
      } else {
        setBlocks((prev) => {
          const existing = prev.filter((b) => b.kind === "section" ? b.name.trim() : b.text.trim());
          const newBlocks = [];
          let lastSection = "";
          extracted.forEach((it) => {
            const sec = (it.section || "").trim();
            if (sec && sec !== lastSection) {
              newBlocks.push({ id: newBlockId(), kind: "section", name: sec });
              lastSection = sec;
            }
            newBlocks.push({ id: newBlockId(), kind: "item", text: it.text });
          });
          return [...existing, ...newBlocks];
        });
      }
    } catch (err) {
      setPdfError("No se pudo leer el PDF: " + err.message);
    } finally {
      setExtractingPdf(false);
      e.target.value = "";
    }
  };

  const submit = () => {
    const cleanItems = resolvedItems.map((it) => ({ text: it.text.trim(), section: it.section })).filter((it) => it.text);
    if (!equipmentType.trim() || !name.trim() || cleanItems.length === 0) return;
    onSave({ equipment_type: equipmentType.trim(), name: name.trim() }, cleanItems);
  };

  return (
    <Modal title={initial ? "Editar checklist" : "Nuevo checklist"} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo de equipo (debe coincidir con el 'Tipo' del equipo)">
          <input className={inputClass} style={inputStyle} value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)} placeholder="Ej. Compresor, Chiller, AC Central" />
        </Field>
        <Field label="Nombre del checklist">
          <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Mantenimiento preventivo mensual" />
        </Field>
      </div>

      <Field label="Cargar temas y puntos desde un PDF (línea sin casilla = tema; línea con '[ ]' = punto)">
        <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer w-fit" style={{ border: `1px solid ${C.border}`, color: C.amber, opacity: extractingPdf ? 0.5 : 1 }}>
          <Upload size={14} /> {extractingPdf ? "Leyendo PDF..." : "Elegir PDF"}
          <input type="file" accept="application/pdf" className="hidden" onChange={onPdfChange} disabled={extractingPdf} />
        </label>
        {pdfError && <div className="text-xs mt-1" style={{ color: C.red }}>{pdfError}</div>}
        <div className="text-xs mt-1" style={{ color: C.muted }}>Se agregan al final de la lista de abajo; puedes editarlos o borrarlos después.</div>
      </Field>

      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Temas y puntos a revisar</div>
      <div className="space-y-2 mb-3">
        {blocks.map((b) => (
          b.kind === "section" ? (
            <div key={b.id} className="flex items-center gap-2 pt-2">
              <input className={inputClass} style={{ ...inputStyle, fontWeight: 600, color: C.amber, borderColor: C.amber + "60" }} value={b.name} onChange={(e) => updateBlock(b.id, { name: e.target.value })} placeholder="Nombre del tema — ej. Detección de la fuga" />
              <button onClick={() => removeBlock(b.id)} style={iconBtnStyle}><X size={16} /></button>
            </div>
          ) : (
            <div key={b.id} className="flex gap-2">
              <input className={inputClass} style={inputStyle} value={b.text} onChange={(e) => updateBlock(b.id, { text: e.target.value })} placeholder="Punto a revisar" />
              <button onClick={() => removeBlock(b.id)} style={iconBtnStyle}><X size={16} /></button>
            </div>
          )
        ))}
      </div>
      <div className="flex items-center gap-4 mb-4">
        <button onClick={addItemRow} className="flex items-center gap-2 text-sm" style={{ color: C.amber }}><Plus size={14} /> Agregar punto</button>
        <button onClick={addSectionRow} className="flex items-center gap-2 text-sm" style={{ color: C.text }}><Layers size={14} /> Agregar tema</button>
      </div>
      {initial && <ActivityHistorySection tableName="checklist_templates" recordId={initial.id} title="Historial de este checklist" />}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Crear checklist"}
        </button>
      </div>
    </Modal>
  );
}

function BulkOrderFormModal({ branches, equipment, technicians, onClose, onSave, saving }) {
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  const [weekAnchor, setWeekAnchor] = useState(() => {
    const d = new Date();
    const diff = d.getDay() === 0 ? 1 : 8 - d.getDay();
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  });
  const [commonType, setCommonType] = useState("preventivo");
  const [commonPriority, setCommonPriority] = useState("media");
  const [commonTechnicianId, setCommonTechnicianId] = useState("");
  const [pool, setPool] = useState([]);

  const branchEquip = equipment.filter((e) => e.branch_id === branchId);
  const branchTechs = technicians.filter((t) => techWorksAtBranch(t, branchId) && (t.is_active !== false || t.id === commonTechnicianId || pool.some((p) => p.technician_id === t.id)));
  const dayLabels = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  const weekDates = useMemo(() => {
    const base = new Date(weekAnchor + "T00:00:00");
    const mondayOffset = base.getDay() === 0 ? -6 : 1 - base.getDay();
    const monday = new Date(base);
    monday.setDate(base.getDate() + mondayOffset);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  }, [weekAnchor]);

  const onBranchChange = (id) => { setBranchId(id); setPool([]); };

  const toggleEquip = (eq) => {
    setPool((prev) => {
      const exists = prev.find((p) => p.equipment_id === eq.id);
      if (exists) return prev.filter((p) => p.equipment_id !== eq.id);
      return [...prev, { equipment_id: eq.id, title: `Mantenimiento — ${eq.name}`, day: 0, technician_id: commonTechnicianId }];
    });
  };
  const updatePoolRow = (equipmentId, patch) => setPool((prev) => prev.map((p) => (p.equipment_id === equipmentId ? { ...p, ...patch } : p)));

  const submit = () => {
    if (pool.length === 0) return;
    const rows = pool.map((p) => ({
      branch_id: branchId,
      equipment_id: p.equipment_id,
      title: p.title.trim() || "Mantenimiento",
      type: commonType,
      priority: commonPriority,
      technician_id: p.technician_id || null,
      scheduled: weekDates[p.day].toISOString().slice(0, 10),
    }));
    onSave(rows);
  };

  return (
    <Modal title="Crear varias órdenes a la vez" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sucursal">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => onBranchChange(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Semana (cualquier fecha de esa semana)">
          <input type="date" className={inputClass} style={inputStyle} value={weekAnchor} onChange={(e) => setWeekAnchor(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Tipo de mantenimiento (para todas)">
          <select className={inputClass} style={inputStyle} value={commonType} onChange={(e) => setCommonType(e.target.value)}>
            {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Prioridad (para todas)">
          <select className={inputClass} style={inputStyle} value={commonPriority} onChange={(e) => setCommonPriority(e.target.value)}>
            {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Técnico por defecto">
          <select className={inputClass} style={inputStyle} value={commonTechnicianId} onChange={(e) => setCommonTechnicianId(e.target.value)}>
            <option value="">Sin asignar</option>
            {branchTechs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Selecciona los equipos que necesitan una orden</div>
      <div className="grid grid-cols-2 gap-2 mb-3 max-h-40 overflow-y-auto p-1" style={{ border: `1px solid ${C.border}` }}>
        {branchEquip.map((eq) => (
          <label key={eq.id} className="flex items-center gap-2 text-sm px-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={pool.some((p) => p.equipment_id === eq.id)} onChange={() => toggleEquip(eq)} />
            {eq.name}
          </label>
        ))}
        {branchEquip.length === 0 && <div className="text-sm px-2 py-1.5" style={{ color: C.muted }}>Esta sucursal no tiene equipos registrados.</div>}
      </div>

      {pool.length > 0 && (
        <>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Asigna día y técnico para cada orden ({pool.length})</div>
          <div className="space-y-2 mb-3">
            {pool.map((p) => (
              <div key={p.equipment_id} className="grid grid-cols-12 gap-2 min-w-[860px] items-center">
                <input className={`${inputClass} col-span-4`} style={inputStyle} value={p.title} onChange={(e) => updatePoolRow(p.equipment_id, { title: e.target.value })} />
                <select className={`${inputClass} col-span-4`} style={inputStyle} value={p.day} onChange={(e) => updatePoolRow(p.equipment_id, { day: Number(e.target.value) })}>
                  {dayLabels.map((lbl, i) => <option key={i} value={i}>{lbl} · {fmtDate(weekDates[i].toISOString().slice(0, 10))}</option>)}
                </select>
                <select className={`${inputClass} col-span-4`} style={inputStyle} value={p.technician_id} onChange={(e) => updatePoolRow(p.equipment_id, { technician_id: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {branchTechs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving || pool.length === 0} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Creando..." : `Crear ${pool.length} orden${pool.length !== 1 ? "es" : ""}`}
        </button>
      </div>
    </Modal>
  );
}

function SignaturePad({ onSave, saving }) {
  const canvasRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const drawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setIsEmpty(false);
  };
  const end = () => { drawing.current = false; };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };
  const save = () => {
    if (isEmpty) return;
    onSave(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        style={{ background: "#fff", touchAction: "none", width: "100%", maxWidth: 500, display: "block", border: `1px solid ${C.border}` }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={clear} className="px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.border}`, color: C.muted }}>Limpiar</button>
        <button type="button" onClick={save} disabled={isEmpty || saving} className="px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : "Guardar firma"}
        </button>
      </div>
    </div>
  );
}

function OrderDetailModal({ order, attachments, checklistItems, checklistTemplates, companyName, branchName, equipName, techName, technicians, extraTechnicianIds, materials, onConsumeMaterial, canManageWarehouse, onSaveSignature, onClose, onSave, saving, readOnly, isTecnico, onLoadChecklist, onToggleChecklistItem, onChecklistFieldChange, onChecklistFieldBlur, onClearChecklist }) {
  const [notes, setNotes] = useState(order.resolution_notes || "");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(order.photo_url || "");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const t = TYPE_CFG[order.type], p = PRIORITY_CFG[order.priority], s = STATUS_CFG[order.status];

  const technician = technicians.find((tc) => tc.id === order.technician_id);
  const [laborHours, setLaborHours] = useState(order.labor_hours ?? "");
  const [laborRate, setLaborRate] = useState(order.labor_rate_used ?? (technician?.hourly_rate ?? ""));

  const [usedMaterials, setUsedMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [pickMaterialId, setPickMaterialId] = useState("");
  const [pickMaterialQty, setPickMaterialQty] = useState("");
  const [materialErr, setMaterialErr] = useState("");
  const [savingMaterial, setSavingMaterial] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingMaterials(true);
    supabase.from("work_order_materials").select("*").eq("work_order_id", order.id).order("created_at")
      .then(({ data, error }) => {
        if (!active) return;
        if (!error) setUsedMaterials(data || []);
        setLoadingMaterials(false);
      });
    return () => { active = false; };
  }, [order.id]);

  const availableWarehouseStock = materials.filter((m) => Number(m.quantity || 0) > 0);

  const addUsedMaterial = async () => {
    setMaterialErr("");
    const mat = materials.find((m) => m.id === pickMaterialId);
    const qty = Number(pickMaterialQty);
    if (!mat || !qty) return;
    if (qty > Number(mat.quantity || 0)) { setMaterialErr("No hay suficiente cantidad disponible en el almacén."); return; }
    setSavingMaterial(true);
    const payload = {
      work_order_id: order.id,
      material_id: mat.id,
      name: mat.name,
      quantity: qty,
      unit: mat.unit || null,
    };
    const { data, error } = await supabase.from("work_order_materials").insert(payload).select().single();
    setSavingMaterial(false);
    if (error) { setMaterialErr(error.message); return; }
    setUsedMaterials((prev) => [...prev, data]);
    onConsumeMaterial(mat.id, qty);
    setPickMaterialId(""); setPickMaterialQty("");
  };
  const removeUsedMaterial = async (m) => {
    if (!window.confirm(`¿Quitar ${m.name} de esta orden? La cantidad regresará al almacén.`)) return;
    const { error } = await supabase.from("work_order_materials").delete().eq("id", m.id);
    if (error) return;
    if (m.material_id) onConsumeMaterial(m.material_id, -Number(m.quantity || 0));
    setUsedMaterials((prev) => prev.filter((x) => x.id !== m.id));
  };

  const laborCost = (Number(laborHours) || 0) * (Number(laborRate) || 0);

  const [signerName, setSignerName] = useState(order.client_signature_name || "");
  const [resigning, setResigning] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const handleSaveSignature = async (dataUrl) => {
    if (!signerName.trim()) return;
    setSavingSignature(true);
    await onSaveSignature(order, dataUrl, signerName.trim());
    setSavingSignature(false);
    setResigning(false);
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const isImage = (name) => /\.(png|jpe?g|gif|webp)$/i.test(name || "");
  const checkedCount = (checklistItems || []).filter((it) => it.checked).length;
  const checklistGroups = groupChecklistItemsBySection(checklistItems || []);
  const showChecklistSections = checklistGroups.length > 1 || (checklistGroups[0] && checklistGroups[0].section !== "General");
  const canRemoveChecklist = order.status !== "completada";

  const doPrintChecklist = () => {
    const html = checklistPrintHtml({ companyName, order, branchName, equipName, techName, checklistItems });
    printDocument(`Checklist ${order.code}`, html);
  };

  return (
    <Modal title={`Orden ${order.code}`} onClose={onClose} wide>
      <div className="flex flex-wrap gap-2 mb-4">
        <Pill label={t.label} color={t.color} />
        <Pill label={p.label} color={p.color} />
        <Pill label={s.label} color={s.color} />
      </div>
      <div className="text-sm font-semibold mb-1" style={{ color: C.text }}>{order.title}</div>
      <div className="grid grid-cols-3 gap-3 text-xs mb-4" style={{ color: C.muted }}>
        <div>Sucursal<br /><span style={{ color: C.text }}>{branchName(order.branch_id)}</span></div>
        <div>Equipo<br /><span style={{ color: C.text }}>{equipName(order.equipment_id)}</span></div>
        <div>
          Técnico(s)<br />
          <span style={{ color: C.text }}>{techName(order.technician_id)}</span>
          {extraTechnicianIds && extraTechnicianIds.length > 0 && (
            <span style={{ color: C.muted }}> + {extraTechnicianIds.map((id) => techName(id)).join(", ")}</span>
          )}
        </div>
        <div>Fecha programada<br /><span style={{ color: C.text }}>{fmtDate(order.scheduled)}</span></div>
        {order.deadline && (
          <div>Fecha límite (deadline)<br /><span style={{ color: order.status !== "completada" && order.deadline < new Date().toISOString().slice(0, 10) ? C.red : C.text }}>{fmtDate(order.deadline)}</span></div>
        )}
      </div>

      {!isTecnico && !readOnly && checklistItems && checklistItems.length === 0 && checklistTemplates && checklistTemplates.length > 0 && (
        <div className="mb-4 px-3 py-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <div className="text-xs mb-2" style={{ color: C.muted }}>Elige un checklist para cargar en esta orden:</div>
          <div className="flex items-center gap-2">
            <select className={inputClass} style={inputStyle} value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
              <option value="">Selecciona un checklist...</option>
              {checklistTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name} — {tpl.equipment_type}</option>
              ))}
            </select>
            <button
              onClick={() => {
                const tpl = checklistTemplates.find((tp) => tp.id === selectedTemplateId);
                if (tpl) onLoadChecklist(order, tpl);
              }}
              disabled={!selectedTemplateId}
              className="text-xs px-3 py-2 font-semibold whitespace-nowrap disabled:opacity-50"
              style={{ background: C.amber, color: "#1A1500" }}
            >
              Cargar checklist
            </button>
          </div>
        </div>
      )}

      {checklistItems && checklistItems.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Checklist ({checkedCount}/{checklistItems.length})</div>
            <div className="flex items-center gap-3">
              {!isTecnico && (
                <button onClick={doPrintChecklist} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}><FileText size={13} /> Imprimir checklist</button>
              )}
              {!isTecnico && canRemoveChecklist && !readOnly && (
                <button onClick={() => onClearChecklist(order)} className="flex items-center gap-1 text-xs" style={{ color: C.red }}><Trash2 size={13} /> Quitar checklist</button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {checklistGroups.map((g) => (
              <div key={g.section}>
                {showChecklistSections && (
                  <div className="text-xs font-semibold uppercase tracking-wide px-1 pt-2 pb-1" style={{ color: C.amber }}>{g.section}</div>
                )}
                <div className="space-y-2">
                  {g.items.map((it) => (
                    <div key={it.id} className="px-3 py-2" style={{ background: C.panelAlt }}>
                      <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                        <input type="checkbox" checked={it.checked} onChange={(e) => onToggleChecklistItem(it, e.target.checked)} disabled={readOnly} />
                        <span style={{ color: it.checked ? C.muted : C.text, textDecoration: it.checked ? "line-through" : "none" }}>{it.text}</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className={inputClass}
                          style={inputStyle}
                          placeholder="Respuesta / lectura"
                          value={it.respuesta || ""}
                          onChange={(e) => onChecklistFieldChange(it, "respuesta", e.target.value)}
                          onBlur={(e) => onChecklistFieldBlur(it, "respuesta", e.target.value)}
                          disabled={readOnly}
                        />
                        <input
                          className={inputClass}
                          style={inputStyle}
                          placeholder="Observaciones"
                          value={it.observaciones || ""}
                          onChange={(e) => onChecklistFieldChange(it, "observaciones", e.target.value)}
                          onBlur={(e) => onChecklistFieldBlur(it, "observaciones", e.target.value)}
                          disabled={readOnly}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {attachments && attachments.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Archivos de apoyo</div>
          <div className="grid grid-cols-2 gap-2">
            {attachments.map((a) => (
              <a key={a.id} href={a.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.amber }}>
                {isImage(a.file_name) ? <ImageIcon size={14} /> : <FileText size={14} />}
                <span className="truncate">{a.file_name || "Archivo"}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {readOnly && (
        <div className="text-xs mb-3 px-3 py-2" style={{ background: C.panelAlt, color: C.muted, border: `1px solid ${C.border}` }}>
          Esta orden ya está completada — no se puede editar la nota ni la foto.
        </div>
      )}

      <Field label="Nota de solución / cierre">
        <textarea rows={4} disabled={readOnly} className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qué se hizo, repuestos usados, observaciones..." />
      </Field>

      <Field label="Foto de evidencia">
        {photoPreview && <img src={photoPreview} alt="Evidencia" className="w-full max-h-56 object-cover mb-2" style={{ border: `1px solid ${C.border}` }} />}
        {!readOnly && (
          <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer w-fit" style={{ border: `1px solid ${C.border}`, color: C.amber }}>
            <ImageIcon size={14} /> {photoPreview ? "Cambiar foto" : "Subir foto"}
            <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          </label>
        )}
      </Field>

      <div className="mt-2 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Materiales retirados del almacén</div>
        {!loadingMaterials && usedMaterials.length > 0 && (
          <div className="mb-2 space-y-1">
            {usedMaterials.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm px-3 py-1.5" style={{ background: C.panelAlt }}>
                <span>{m.name} — {m.quantity} {m.unit || ""}</span>
                {!readOnly && canManageWarehouse && <button onClick={() => removeUsedMaterial(m)} style={iconBtnStyle}><X size={13} /></button>}
              </div>
            ))}
          </div>
        )}
        {!loadingMaterials && usedMaterials.length === 0 && <div className="text-xs mb-2" style={{ color: C.muted }}>Todavía no se ha retirado ningún material del almacén para esta orden.</div>}
        {!readOnly && canManageWarehouse && (
          <div>
            <div className="grid grid-cols-12 gap-2 min-w-[500px] items-end">
              <div className="col-span-7"><SearchSelect items={availableWarehouseStock} value={pickMaterialId} onChange={setPickMaterialId} placeholder="Buscar material del almacén..." getLabel={(m) => `${m.name} (disp. ${Number(m.quantity).toLocaleString("es-DO")} ${m.unit || ""})`} /></div>
              <input type="number" step="0.01" className={`${inputClass} col-span-2 text-xs`} style={inputStyle} value={pickMaterialQty} onChange={(e) => setPickMaterialQty(e.target.value)} placeholder="Cant." />
              <button onClick={addUsedMaterial} disabled={savingMaterial || !pickMaterialId || !pickMaterialQty} className="col-span-3 px-2 py-2 text-xs font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
                <Plus size={13} className="inline" /> Retirar
              </button>
            </div>
            {materialErr && <div className="text-xs mt-1" style={{ color: "#E05252" }}>{materialErr}</div>}
          </div>
        )}
        {!readOnly && !canManageWarehouse && (
          <div className="text-xs" style={{ color: C.muted }}>Solo un supervisor o administrador puede retirar materiales del almacén.</div>
        )}
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Mano de obra</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Horas trabajadas">
            <input type="number" step="0.25" min="0" disabled={readOnly} className={inputClass} style={inputStyle} value={laborHours} onChange={(e) => setLaborHours(e.target.value)} placeholder="Ej. 2.5" />
          </Field>
          <Field label="Tarifa por hora (RD$)">
            <input type="number" step="0.01" min="0" disabled={readOnly} className={inputClass} style={inputStyle} value={laborRate} onChange={(e) => setLaborRate(e.target.value)} placeholder={technician?.hourly_rate ? String(technician.hourly_rate) : "0.00"} />
          </Field>
        </div>
      </div>

      <div className="mt-2 p-3 flex justify-between items-center text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <span style={{ color: C.muted }}>Costo de mano de obra</span>
        <div className="font-mono font-bold">{fmtMoney(laborCost)}</div>
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Firma del cliente</div>
        {order.client_signature_url && !resigning ? (
          <div>
            <img src={order.client_signature_url} alt="Firma del cliente" className="mb-2" style={{ background: "#fff", maxWidth: 300, border: `1px solid ${C.border}` }} />
            <div className="text-xs" style={{ color: C.muted }}>
              Firmado por <span style={{ color: C.text }}>{order.client_signature_name}</span> — {fmtDate(order.client_signature_at?.slice(0, 10))} {order.client_signature_at ? new Date(order.client_signature_at).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" }) : ""}
            </div>
            {!readOnly && (
              <button onClick={() => setResigning(true)} className="mt-2 text-xs px-3 py-1.5" style={{ border: `1px solid ${C.border}`, color: C.amber }}>Firmar de nuevo</button>
            )}
          </div>
        ) : !readOnly ? (
          <div>
            <Field label="Nombre de quien firma">
              <input className={inputClass} style={inputStyle} value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Nombre del cliente o encargado" />
            </Field>
            {signerName.trim() ? (
              <SignaturePad onSave={handleSaveSignature} saving={savingSignature} />
            ) : (
              <div className="text-xs" style={{ color: C.muted }}>Escribe el nombre de quien va a firmar para habilitar el cuadro de firma.</div>
            )}
            {resigning && <button onClick={() => setResigning(false)} className="mt-2 text-xs px-3 py-1.5" style={{ border: `1px solid ${C.border}`, color: C.muted }}>Cancelar</button>}
          </div>
        ) : (
          <div className="text-xs" style={{ color: C.muted }}>Sin firma registrada.</div>
        )}
      </div>

      <ActivityHistorySection
        tableName="work_orders"
        recordId={order.id}
        title="Historial de esta orden"
        resolvers={{ technician_id: techName, branch_id: branchName, equipment_id: equipName }}
        statusLabels={Object.fromEntries(Object.entries(STATUS_CFG).map(([k, v]) => [k, v.label]))}
      />

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>{readOnly ? "Cerrar" : "Cancelar"}</button>
        {!readOnly && (
          <button onClick={() => onSave(order, notes, photoFile, undefined, laborHours, laborRate)} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        )}
        {!readOnly && order.status !== "completada" && (
          <button
            onClick={() => {
              if (!window.confirm("¿Cerrar esta orden de trabajo? Se guardará la nota y la foto, y quedará marcada como Completada.")) return;
              onSave(order, notes, photoFile, "completada", laborHours, laborRate);
            }}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: C.green, color: "#0B1F13" }}
          >
            <CheckCircle2 size={14} /> {saving ? "Cerrando..." : "Cerrar orden"}
          </button>
        )}
      </div>
    </Modal>
  );
}

function HistoryModal({ title, orders, branchName, equipName, techName, onClose }) {
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {orders.map((o) => {
          const t = TYPE_CFG[o.type], s = STATUS_CFG[o.status];
          return (
            <div key={o.id} className="p-3" style={{ background: C.panelAlt, borderLeft: `3px solid ${t.color}` }}>
              <div className="flex items-center justify-between mb-1">
                <div className="font-mono text-xs" style={{ color: C.muted }}>{o.code} · {fmtDate(o.scheduled)}</div>
                <div className="flex gap-2">
                  <Pill label={t.label} color={t.color} />
                  <Pill label={s.label} color={s.color} />
                </div>
              </div>
              <div className="text-sm" style={{ color: C.text }}>{o.title}</div>
              <div className="text-xs mt-1" style={{ color: C.muted }}>{branchName(o.branch_id)} · {equipName(o.equipment_id)} · {techName(o.technician_id)}</div>
              {o.resolution_notes && <div className="text-xs mt-2" style={{ color: C.muted }}>Nota: <span style={{ color: C.text }}>{o.resolution_notes}</span></div>}
              {o.photo_url && <img src={o.photo_url} alt="Evidencia" className="mt-2 max-h-32 object-cover" style={{ border: `1px solid ${C.border}` }} />}
            </div>
          );
        })}
        {orders.length === 0 && <div className="text-sm text-center py-8" style={{ color: C.muted }}>No hay órdenes registradas todavía.</div>}
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Cerrar</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Aplicación principal (una vez ya hay sesión + empresa)
// ---------------------------------------------------------------------------
function Dashboard({ session, profile, company, onUpdateCompany, onSignOut }) {
  const companyName = company?.name || "Tu empresa";
  const companyId = profile.company_id;
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const canManage = profile.role === "admin" || profile.role === "supervisor";
  const isAdmin = profile.role === "admin";
  const isTecnico = profile.role === "tecnico";
  const isVendedor = profile.role === "vendedor";
  const canUseCaja = isAdmin || profile.role === "supervisor" || isVendedor;
  const effectivePermissions = (profile.permissions && typeof profile.permissions === "object" && !Array.isArray(profile.permissions)) ? profile.permissions : (ROLE_DEFAULT_PERMISSIONS[profile.role] || {});
  const hasPerm = (key) => isAdmin || !!effectivePermissions[key];
  const canEdit = (key) => isAdmin || effectivePermissions[key] === "edit" || effectivePermissions[key] === "edit_no_delete";
  const canDelete = (key) => isAdmin || effectivePermissions[key] === "edit";
  const maxDiscountPct = isAdmin ? 100 : Number(profile.max_discount_pct) || 0;

  const [loadingScope, setLoadingScope] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [branches, setBranches] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [locations, setLocations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderTechnicians, setOrderTechnicians] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [invites, setInvites] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [productComponents, setProductComponents] = useState([]);
  const [clientAssets, setClientAssets] = useState([]);
  const [checklistTemplates, setChecklistTemplates] = useState([]);
  const [importingChecklists, setImportingChecklists] = useState(false);
  const [selectedChecklists, setSelectedChecklists] = useState(new Set());
  const [selectedClients, setSelectedClients] = useState(new Set());
  const [clientSearch, setClientSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [selectedSuppliers, setSelectedSuppliers] = useState(new Set());
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [productBranchFilter, setProductBranchFilter] = useState("all");
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [purchaseSupplierFilter, setPurchaseSupplierFilter] = useState("all");
  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteStatusFilter, setQuoteStatusFilter] = useState("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const [invoicePaymentFilter, setInvoicePaymentFilter] = useState("all");
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [otherExpenses, setOtherExpenses] = useState([]);
  const [tools, setTools] = useState([]);
  const [toolLists, setToolLists] = useState([]);
  const [toolLoans, setToolLoans] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectMaterials, setProjectMaterials] = useState([]);
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [cashSessions, setCashSessions] = useState([]);
  const [allPurchasePayments, setAllPurchasePayments] = useState([]);
  const [ncfSequences, setNcfSequences] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [creditNotes, setCreditNotes] = useState([]);
  const [recurringContracts, setRecurringContracts] = useState([]);
  const [bankTransactions, setBankTransactions] = useState([]);
  const [companyBankAccounts, setCompanyBankAccounts] = useState([]);
  const [importingBankStatement, setImportingBankStatement] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [selectedSalesOrders, setSelectedSalesOrders] = useState(new Set());
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [selectedIncidents, setSelectedIncidents] = useState(new Set());
  const [incidentTechnicianFilter, setIncidentTechnicianFilter] = useState("all");
  const [activityLog, setActivityLog] = useState([]);
  const [loadingActivityLog, setLoadingActivityLog] = useState(false);
  const [activityTableFilter, setActivityTableFilter] = useState("all");
  const [activityActionFilter, setActivityActionFilter] = useState("all");
  const [activityUserFilter, setActivityUserFilter] = useState("all");
  const [activityDateFrom, setActivityDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [activityDateTo, setActivityDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [financialDateFrom, setFinancialDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [financialDateTo, setFinancialDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [salesReportDateFrom, setSalesReportDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [salesReportDateTo, setSalesReportDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoicePaymentsAll, setInvoicePaymentsAll] = useState([]);
  const [purchasePaymentsAll, setPurchasePaymentsAll] = useState([]);
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const [incidentEquipmentFilter, setIncidentEquipmentFilter] = useState("all");
  const [incidentDateFrom, setIncidentDateFrom] = useState("");
  const [incidentDateTo, setIncidentDateTo] = useState("");
  const [incidentCompletedFrom, setIncidentCompletedFrom] = useState("");
  const [incidentCompletedTo, setIncidentCompletedTo] = useState("");
  const [selectedQuotes, setSelectedQuotes] = useState(new Set());
  const [incidents, setIncidents] = useState([]);

  const [branchFilter, setBranchFilter] = useState("all");
  const [equipmentTechFilter, setEquipmentTechFilter] = useState("all");
  const [equipmentTypeFilter, setEquipmentTypeFilter] = useState("all");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState(new Set());
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [searchedDate, setSearchedDate] = useState("");
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get("view") || "dashboard");
  const changeView = (key) => {
    setView(key);
    setShowMobileMenu(false);
    const url = new URL(window.location.href);
    url.searchParams.set("view", key);
    window.history.replaceState(null, "", url);
  };

  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showBulkOrders, setShowBulkOrders] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingOrderAttachments, setEditingOrderAttachments] = useState([]);
  const [detailOrder, setDetailOrder] = useState(null);
  const [detailOrderAttachments, setDetailOrderAttachments] = useState([]);
  const [detailOrderChecklist, setDetailOrderChecklist] = useState([]);
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [editingChecklist, setEditingChecklist] = useState(null);
  const [orderAttachmentIds, setOrderAttachmentIds] = useState(new Set());
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [showAddTech, setShowAddTech] = useState(false);
  const [editingTech, setEditingTech] = useState(null);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [pendingLocationBranch, setPendingLocationBranch] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [historyFor, setHistoryFor] = useState(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [purchaseDetail, setPurchaseDetail] = useState(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [showAddTool, setShowAddTool] = useState(false);
  const [showBulkTools, setShowBulkTools] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const [toolStatusFilter, setToolStatusFilter] = useState("all");
  const [toolTechnicianFilter, setToolTechnicianFilter] = useState("all");
  const [toolSearch, setToolSearch] = useState("");
  const [groupToolsByTechnician, setGroupToolsByTechnician] = useState(false);
  const [selectedTools, setSelectedTools] = useState(new Set());
  const [toolViewMode, setToolViewMode] = useState("herramientas");
  const [showAddProject, setShowAddProject] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [projectStatusFilter, setProjectStatusFilter] = useState("all");
  const [projectSearch, setProjectSearch] = useState("");
  const [showAddToolList, setShowAddToolList] = useState(false);
  const [editingToolList, setEditingToolList] = useState(null);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [showAddTaxRate, setShowAddTaxRate] = useState(false);
  const [dgiiImporting, setDgiiImporting] = useState(false);
  const [dgiiImportProgress, setDgiiImportProgress] = useState(null);
  const [dgiiCatalogCount, setDgiiCatalogCount] = useState(null);
  const [dgiiCatalogUpdatedAt, setDgiiCatalogUpdatedAt] = useState(null);
  const [taxReportPeriod, setTaxReportPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [cajaBranch, setCajaBranch] = useState("");
  const [showOpenCaja, setShowOpenCaja] = useState(false);
  const [editingPermissionsFor, setEditingPermissionsFor] = useState(null);
  const [showCloseCaja, setShowCloseCaja] = useState(false);
  const [sessionPayments, setSessionPayments] = useState([]);
  const [editingTaxRate, setEditingTaxRate] = useState(null);
  const [showAddNcf, setShowAddNcf] = useState(false);
  const [editingNcf, setEditingNcf] = useState(null);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [showAddContract, setShowAddContract] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [showStatement, setShowStatement] = useState(false);
  const [invoiceDetail, setInvoiceDetail] = useState(null);
  const [invoicePrefill, setInvoicePrefill] = useState(null);
  const [showAddCreditNote, setShowAddCreditNote] = useState(false);
  const [creditNoteDetail, setCreditNoteDetail] = useState(null);
  const [showAddQuote, setShowAddQuote] = useState(false);
  const [quoteDetail, setQuoteDetail] = useState(null);
  const [editingQuote, setEditingQuote] = useState(null);
  const [editingQuoteItems, setEditingQuoteItems] = useState(null);
  const [salesOrderDetail, setSalesOrderDetail] = useState(null);
  const [showAddIncident, setShowAddIncident] = useState(false);
  const [editingIncident, setEditingIncident] = useState(null);
  const [incidentDetail, setIncidentDetail] = useState(null);
  const [orderFromIncident, setOrderFromIncident] = useState(null);
  const [orderFromSalesOrder, setOrderFromSalesOrder] = useState(null);
  const [quotePrefill, setQuotePrefill] = useState(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [orderEquipmentFilter, setOrderEquipmentFilter] = useState("all");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");

  const loadAll = async () => {
    setLoadingScope(true);
    const [br, tech, eq, loc, ord, woa, cktpl, ckitems, profs, inv, cli, prod, pcomp, ast, sup, purch, ncf, invc, cnotes, qts, sord, inc, oexp, coa, txr, csess, tls, tlists, tloans, mats, wot, rcon, banktx, cba, projs, projmats] = await Promise.all([
      supabase.from("branches").select("*").eq("company_id", companyId).order("name"),
      supabase.from("technicians").select("*").eq("company_id", companyId).order("name"),
      supabase.from("equipment").select("*").eq("company_id", companyId).order("name"),
      supabase.from("locations").select("*").eq("company_id", companyId).order("name"),
      supabase.from("work_orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("work_order_attachments").select("work_order_id"),
      supabase.from("checklist_templates").select("*").eq("company_id", companyId).order("equipment_type"),
      supabase.from("checklist_template_items").select("*").order("position"),
      supabase.from("profiles").select("*").eq("company_id", companyId).order("created_at"),
      isAdmin ? supabase.from("invites").select("*").eq("company_id", companyId).eq("used", false).order("created_at") : Promise.resolve({ data: [] }),
      supabase.from("clients").select("*").eq("company_id", companyId).order("name"),
      supabase.from("products").select("*").eq("company_id", companyId).order("name"),
      supabase.from("product_components").select("*").eq("company_id", companyId),
      supabase.from("client_assets").select("*").eq("company_id", companyId).order("install_date"),
      supabase.from("suppliers").select("*").eq("company_id", companyId).order("name"),
      supabase.from("purchases").select("*").eq("company_id", companyId).order("purchase_date", { ascending: false }),
      supabase.from("ncf_sequences").select("*").eq("company_id", companyId).order("created_at"),
      supabase.from("invoices").select("*").eq("company_id", companyId).order("invoice_date", { ascending: false }),
      supabase.from("credit_notes").select("*").eq("company_id", companyId).order("note_date", { ascending: false }),
      supabase.from("quotes").select("*").eq("company_id", companyId).order("quote_date", { ascending: false }),
      supabase.from("sales_orders").select("*").eq("company_id", companyId).order("order_date", { ascending: false }),
      supabase.from("incidents").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("other_expenses").select("*").eq("company_id", companyId).order("expense_date", { ascending: false }),
      supabase.from("chart_of_accounts").select("*").eq("company_id", companyId).order("code"),
      supabase.from("tax_rates").select("*").eq("company_id", companyId).order("name"),
      supabase.from("cash_sessions").select("*").eq("company_id", companyId).order("opened_at", { ascending: false }),
      supabase.from("tools").select("*").eq("company_id", companyId).order("name"),
      supabase.from("tool_lists").select("*").eq("company_id", companyId).order("created_at"),
      supabase.from("tool_loans").select("*").eq("company_id", companyId).order("loaned_at", { ascending: false }),
      supabase.from("inventory_materials").select("*").eq("company_id", companyId).order("name"),
      supabase.from("work_order_technicians").select("*").eq("company_id", companyId),
      supabase.from("recurring_contracts").select("*").eq("company_id", companyId).order("next_invoice_date"),
      supabase.from("bank_transactions").select("*").eq("company_id", companyId).order("transaction_date", { ascending: false }),
      supabase.from("company_bank_accounts").select("*").eq("company_id", companyId).order("created_at"),
      supabase.from("projects").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("project_materials").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    ]);
    if (br.error) setErrorMsg(br.error.message);
    setBranches(br.data || []);
    setTechnicians(tech.data || []);
    setEquipment(eq.data || []);
    setLocations(loc.data || []);
    setOrders(ord.data || []);
    setOrderAttachmentIds(new Set((woa.data || []).map((r) => r.work_order_id)));
    setChecklistTemplates((cktpl.data || []).map((t) => ({ ...t, items: (ckitems.data || []).filter((it) => it.template_id === t.id) })));
    setProfiles(profs.data || []);
    setInvites(inv.data || []);
    setClients(cli.data || []);
    setProducts(prod.data || []);
    setProductComponents(pcomp.data || []);
    setClientAssets(ast.data || []);
    setSuppliers(sup.data || []);
    setPurchases(purch.data || []);
    setNcfSequences(ncf.data || []);
    setInvoices(invc.data || []);
    setCreditNotes(cnotes.data || []);
    setQuotes(qts.data || []);
    setSalesOrders(sord.data || []);
    setIncidents(inc.data || []);
    setOtherExpenses(oexp.data || []);
    setChartOfAccounts(coa.data || []);
    setTaxRates(txr.data || []);
    setCashSessions(csess.data || []);
    setTools(tls.data || []);
    setToolLists(tlists.data || []);
    setToolLoans(tloans.data || []);
    setMaterials(mats.data || []);
    setOrderTechnicians(wot.data || []);
    setRecurringContracts(rcon.data || []);
    setBankTransactions(banktx.data || []);
    setCompanyBankAccounts(cba.data || []);
    setProjects(projs.data || []);
    setProjectMaterials(projmats.data || []);
    setLoadingScope(false);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [companyId]);

  useEffect(() => {
    if (view === "dgiiCatalog") loadDgiiCatalogStats();
    /* eslint-disable-next-line */
  }, [view]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* silencioso: la app funciona igual sin esto */ });
    }
  }, []);

  const loadNotifications = async () => {
    if (!profile?.id) return;
    const { data } = await supabase.from("notifications").select("*").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(50);
    setNotifications(data || []);
  };
  useEffect(() => { loadNotifications(); /* eslint-disable-next-line */ }, [profile?.id, companyId]);

  useEffect(() => {
    (async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        setPushSubscribed(!!sub);
      } catch { /* silencioso */ }
    })();
  }, []);

  const createNotification = async (targetProfileId, { title, body, link_view, category }) => {
    if (!targetProfileId) return;
    const { data, error } = await supabase.from("notifications").insert({
      company_id: companyId, profile_id: targetProfileId, title, body: body || null, link_view: link_view || null, category: category || "general",
    }).select().single();
    if (error || !data) return;
    if (targetProfileId === profile.id) setNotifications((prev) => [data, ...prev]);
    try {
      const targetProfile = profiles.find((p) => p.id === targetProfileId);
      if (targetProfile?.notify_email !== false) {
        supabase.functions.invoke("send-notification-email", { body: { notification_id: data.id, to_profile_id: targetProfileId, title, body: body || "" } })
          .then(({ error: fnError }) => supabase.from("notifications").update({ email_status: fnError ? "failed" : "sent" }).eq("id", data.id))
          .catch(() => supabase.from("notifications").update({ email_status: "failed" }).eq("id", data.id));
      }
      if (targetProfile?.notify_push !== false) {
        supabase.functions.invoke("send-web-push", { body: { profile_id: targetProfileId, title, body: body || "" } })
          .then(({ error: fnError }) => supabase.from("notifications").update({ push_status: fnError ? "failed" : "sent" }).eq("id", data.id))
          .catch(() => supabase.from("notifications").update({ push_status: "failed" }).eq("id", data.id));
      }
    } catch { /* el envío real es best-effort; la notificación ya quedó visible en la app */ }
  };

  const notifyManyTechnicians = async (technicianIds, payload) => {
    const uniqueIds = Array.from(new Set(technicianIds.filter(Boolean)));
    for (const techId of uniqueIds) {
      const targetProfile = profiles.find((p) => p.technician_id === techId);
      if (targetProfile) await createNotification(targetProfile.id, payload);
    }
  };

  const markNotificationRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  };
  const markAllNotificationsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
  };

  const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  };

  const enablePushNotifications = async (vapidPublicKey) => {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setErrorMsg("Este navegador no soporta notificaciones push.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setErrorMsg("No se concedió permiso de notificaciones."); return; }
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
      const json = sub.toJSON();
      await supabase.from("push_subscriptions").upsert({
        company_id: companyId, profile_id: profile.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
      }, { onConflict: "endpoint" });
      setPushSubscribed(true);
    } catch (err) {
      setErrorMsg("No se pudo activar el push: " + err.message);
    }
  };
  const disablePushNotifications = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setPushSubscribed(false);
    } catch { /* silencioso */ }
  };

  const loadActivityLog = async () => {
    setLoadingActivityLog(true);
    let query = supabase.from("activity_log").select("*").eq("company_id", companyId).order("changed_at", { ascending: false }).limit(2000);
    if (activityDateFrom) query = query.gte("changed_at", `${activityDateFrom}T00:00:00`);
    if (activityDateTo) query = query.lte("changed_at", `${activityDateTo}T23:59:59`);
    const { data, error } = await query;
    setLoadingActivityLog(false);
    if (error) { setErrorMsg(error.message); return; }
    setActivityLog(data || []);
  };
  useEffect(() => {
    if (view === "activityLog" && hasPerm("activityLog")) loadActivityLog();
    // eslint-disable-next-line
  }, [view, activityDateFrom, activityDateTo, companyId]);

  const activityLogFiltered = useMemo(() => activityLog.filter((l) =>
    (activityTableFilter === "all" || l.table_name === activityTableFilter) &&
    (activityActionFilter === "all" || l.action === activityActionFilter) &&
    (activityUserFilter === "all" || l.changed_by_email === activityUserFilter)
  ), [activityLog, activityTableFilter, activityActionFilter, activityUserFilter]);

  const activityUsers = useMemo(() => Array.from(new Set(activityLog.map((l) => l.changed_by_email).filter(Boolean))).sort(), [activityLog]);
  const activityTablesPresent = useMemo(() => Array.from(new Set(activityLog.map((l) => l.table_name))).sort(), [activityLog]);
  const activityUserName = useMemo(() => {
    const map = Object.fromEntries(profiles.map((p) => [p.email, p.full_name || p.email]));
    return (email) => (email ? map[email] || email : "—");
  }, [profiles]);

  const describeActivityEntry = (l) => {
    const d = l.new_data || l.old_data || {};
    return d.title || d.name || d.quote_number || d.invoice_number || d.code || d.number || "";
  };

  const loadFinancialData = async () => {
    setLoadingFinancial(true);
    const fromIso = `${financialDateFrom}T00:00:00`;
    const toIso = `${financialDateTo}T23:59:59`;
    const [ip, pp] = await Promise.all([
      supabase.from("invoice_payments").select("id, amount, method, payment_date, invoice_id").gte("payment_date", fromIso).lte("payment_date", toIso),
      supabase.from("purchase_payments").select("id, amount, payment_date, purchase_id").gte("payment_date", fromIso).lte("payment_date", toIso),
    ]);
    setLoadingFinancial(false);
    if (ip.error) { setErrorMsg(ip.error.message); return; }
    if (pp.error) { setErrorMsg(pp.error.message); return; }
    setInvoicePaymentsAll(ip.data || []);
    setPurchasePaymentsAll(pp.data || []);
  };
  useEffect(() => {
    if ((view === "financialReports" || view === "bankReconciliation") && (hasPerm("financialReports") || hasPerm("bankReconciliation"))) loadFinancialData();
    // eslint-disable-next-line
  }, [view, financialDateFrom, financialDateTo, companyId]);

  const financialPnl = useMemo(() => {
    const inRange = (dateStr) => dateStr && dateStr >= financialDateFrom && dateStr <= financialDateTo;
    const revenue = invoices.filter((i) => i.status !== "anulada" && inRange(i.invoice_date)).reduce((sum, i) => sum + Number(i.subtotal || 0), 0);
    const creditNotesTotal = creditNotes.filter((n) => inRange(n.note_date)).reduce((sum, n) => sum + Number(n.subtotal || 0), 0);
    const netRevenue = revenue - creditNotesTotal;
    const purchasesCost = purchases.filter((p) => inRange(p.purchase_date)).reduce((sum, p) => sum + (Number(p.total || 0) - Number(p.itbis_amount || 0)), 0);
    const otherExpensesCost = otherExpenses.filter((e) => inRange(e.expense_date)).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const netIncome = netRevenue - purchasesCost - otherExpensesCost;
    return { revenue, creditNotesTotal, netRevenue, purchasesCost, otherExpensesCost, netIncome };
  }, [invoices, creditNotes, purchases, otherExpenses, financialDateFrom, financialDateTo]);

  const financialCashFlow = useMemo(() => {
    const cashIn = invoicePaymentsAll.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const cashOutSuppliers = purchasePaymentsAll.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const inRange = (dateStr) => dateStr && dateStr >= financialDateFrom && dateStr <= financialDateTo;
    const cashOutExpenses = otherExpenses.filter((e) => inRange(e.expense_date)).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const cashOut = cashOutSuppliers + cashOutExpenses;
    return { cashIn, cashOutSuppliers, cashOutExpenses, cashOut, net: cashIn - cashOut };
  }, [invoicePaymentsAll, purchasePaymentsAll, otherExpenses, financialDateFrom, financialDateTo]);

  const salesReportData = useMemo(() => {
    const inRange = (d) => d && d >= salesReportDateFrom && d <= salesReportDateTo;
    const invoicesInRange = invoices.filter((i) => i.status !== "anulada" && inRange(i.invoice_date));
    const quotesInRange = quotes.filter((q) => inRange(q.quote_date));
    const totalInvoiced = invoicesInRange.reduce((sum, i) => sum + Number(i.total || 0), 0);
    const totalCollected = invoicesInRange.reduce((sum, i) => sum + Number(i.amount_paid || 0) + Number(i.credit_applied || 0), 0);
    const totalPending = totalInvoiced - totalCollected;
    const totalQuoted = quotesInRange.reduce((sum, q) => sum + Number(q.total || 0), 0);
    const quotesDecided = quotesInRange.filter((q) => q.status !== "pendiente");
    const quotesWon = quotesInRange.filter((q) => ["aprobada", "en_orden", "parcial", "convertida"].includes(q.status));
    const conversionRate = quotesDecided.length > 0 ? (quotesWon.length / quotesDecided.length) * 100 : null;
    const quoteStatusCounts = quotesInRange.reduce((acc, q) => { acc[q.status] = (acc[q.status] || 0) + 1; return acc; }, {});

    const byClient = {};
    invoicesInRange.forEach((i) => { byClient[i.client_id] = (byClient[i.client_id] || 0) + Number(i.total || 0); });
    const topClients = Object.entries(byClient)
      .map(([clientId, total]) => ({ clientId, total, name: clients.find((c) => c.id === clientId)?.name || "Cliente eliminado" }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const monthKey = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("es-DO", { month: "short", year: "2-digit" });
      const total = invoices.filter((inv) => inv.status !== "anulada" && (inv.invoice_date || "").slice(0, 7) === monthKey).reduce((sum, inv) => sum + Number(inv.total || 0), 0);
      months.push({ label, total });
    }
    const maxMonthTotal = Math.max(1, ...months.map((m) => m.total));

    return { totalInvoiced, totalCollected, totalPending, totalQuoted, conversionRate, quotesCount: quotesInRange.length, invoicesCount: invoicesInRange.length, quoteStatusCounts, topClients, months, maxMonthTotal };
  }, [invoices, quotes, clients, salesReportDateFrom, salesReportDateTo]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const dueContracts = useMemo(
    () => recurringContracts.filter((c) => c.is_active && c.next_invoice_date <= todayStr && (!c.end_date || c.end_date >= todayStr))
      .sort((a, b) => (a.next_invoice_date || "").localeCompare(b.next_invoice_date || "")),
    [recurringContracts, todayStr]
  );

  const overdueReceivables = useMemo(() => {
    const pending = invoices.filter((inv) => inv.status !== "anulada" && (Number(inv.total) - Number(inv.amount_paid || 0) - Number(inv.credit_applied || 0)) > 0.009)
      .map((inv) => ({ ...inv, balance: Number(inv.total) - Number(inv.amount_paid || 0) - Number(inv.credit_applied || 0), days: Math.max(0, Math.floor((Date.now() - new Date(inv.invoice_date).getTime()) / 86400000)) }));
    const overdue = pending.filter((inv) => inv.days > 30);
    return { count: overdue.length, total: overdue.reduce((s, inv) => s + inv.balance, 0) };
  }, [invoices]);

  const financialMonthlyChart = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("es-DO", { month: "short", year: "2-digit" }) });
    }
    return months.map((m) => {
      const rev = invoices.filter((i) => i.status !== "anulada" && (i.invoice_date || "").slice(0, 7) === m.key).reduce((sum, i) => sum + Number(i.subtotal || 0), 0);
      const exp = purchases.filter((p) => (p.purchase_date || "").slice(0, 7) === m.key).reduce((sum, p) => sum + (Number(p.total || 0) - Number(p.itbis_amount || 0)), 0)
        + otherExpenses.filter((e) => (e.expense_date || "").slice(0, 7) === m.key).reduce((sum, e) => sum + Number(e.amount || 0), 0);
      return { name: m.label, Ingresos: rev, Gastos: exp };
    });
  }, [invoices, purchases, otherExpenses]);

  const myOrderIdsAsSecondary = useMemo(
    () => new Set(orderTechnicians.filter((wt) => wt.technician_id === profile.technician_id).map((wt) => wt.work_order_id)),
    [orderTechnicians, profile.technician_id]
  );
  const visibleOrders = useMemo(
    () => isTecnico ? orders.filter((o) => o.technician_id === profile.technician_id || myOrderIdsAsSecondary.has(o.id)) : orders,
    [orders, isTecnico, profile.technician_id, myOrderIdsAsSecondary]
  );
  const scopedOrders = useMemo(() => visibleOrders.filter((o) => branchFilter === "all" || o.branch_id === branchFilter), [visibleOrders, branchFilter]);

  const visibleIncidents = useMemo(
    () => isTecnico ? incidents.filter((i) => i.technician_id === profile.technician_id) : incidents,
    [incidents, isTecnico, profile.technician_id]
  );
  const incidentsFiltered = useMemo(() => visibleIncidents.filter((i) =>
    (incidentTechnicianFilter === "all" || (incidentTechnicianFilter === "none" ? !i.technician_id : i.technician_id === incidentTechnicianFilter)) &&
    (incidentEquipmentFilter === "all" || i.equipment_id === incidentEquipmentFilter) &&
    (!incidentDateFrom || (i.created_at && i.created_at.slice(0, 10) >= incidentDateFrom)) &&
    (!incidentDateTo || (i.created_at && i.created_at.slice(0, 10) <= incidentDateTo)) &&
    (!incidentCompletedFrom || (i.completed_at && i.completed_at.slice(0, 10) >= incidentCompletedFrom)) &&
    (!incidentCompletedTo || (i.completed_at && i.completed_at.slice(0, 10) <= incidentCompletedTo))
  ), [visibleIncidents, incidentTechnicianFilter, incidentEquipmentFilter, incidentDateFrom, incidentDateTo, incidentCompletedFrom, incidentCompletedTo]);
  // Un técnico solo puede reportar incidentes si su ficha de técnico tiene esa casilla activada;
  // admin/supervisor siguen controlados por el permiso general de la sección.
  const canReportIncident = isTecnico
    ? !!technicians.find((t) => t.id === profile.technician_id)?.can_create_incidents
    : canEdit("incidents");

  const visibleTools = useMemo(
    () => isTecnico ? tools.filter((t) => t.technician_id === profile.technician_id) : tools,
    [tools, isTecnico, profile.technician_id]
  );
  const toolsFiltered = useMemo(() => visibleTools.filter((t) => {
    if (toolStatusFilter !== "all" && t.status !== toolStatusFilter) return false;
    if (toolTechnicianFilter !== "all" && (toolTechnicianFilter === "none" ? t.technician_id : t.technician_id !== toolTechnicianFilter)) return false;
    if (toolSearch.trim()) {
      const q = toolSearch.toLowerCase();
      if (!((t.name || "").toLowerCase().includes(q) || (t.serial_number || "").toLowerCase().includes(q) || (t.category || "").toLowerCase().includes(q))) return false;
    }
    return true;
  }), [visibleTools, toolStatusFilter, toolTechnicianFilter, toolSearch]);

  const projectsFiltered = useMemo(() => projects.filter((p) => {
    if (projectStatusFilter !== "all" && p.status !== projectStatusFilter) return false;
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      const clientNameStr = (clients.find((c) => c.id === p.client_id)?.name || "").toLowerCase();
      if (!((p.name || "").toLowerCase().includes(q) || clientNameStr.includes(q))) return false;
    }
    return true;
  }), [projects, projectStatusFilter, projectSearch, clients]);
  const toolGroups = useMemo(() => {
    if (!groupToolsByTechnician) return null;
    const map = new Map();
    technicians.forEach((tech) => map.set(tech.id, { id: tech.id, name: tech.name, tools: [] }));
    map.set("none", { id: "none", name: "Sin asignar", tools: [] });
    toolsFiltered.forEach((t) => {
      const key = t.technician_id && map.has(t.technician_id) ? t.technician_id : "none";
      map.get(key).tools.push(t);
    });
    return Array.from(map.values()).filter((g) => g.tools.length > 0);
  }, [groupToolsByTechnician, toolsFiltered, technicians]);

  // Vista del técnico: sus herramientas agrupadas por "Listado" (kit) al que
  // pertenecen, para que las vea organizadas igual que se las asignaron,
  // en vez de una tabla plana con columnas que no le sirven (sucursal, etc.)
  const technicianToolGroups = useMemo(() => {
    if (!isTecnico) return null;
    const groups = [];
    toolLists.forEach((list) => {
      const mine = toolsFiltered.filter((t) => (list.tool_ids || []).includes(t.id));
      if (mine.length > 0) groups.push({ id: list.id, name: list.name, tools: mine });
    });
    const idsInAnyList = new Set(toolLists.flatMap((l) => l.tool_ids || []));
    const loose = toolsFiltered.filter((t) => !idsInAnyList.has(t.id));
    if (loose.length > 0) groups.push({ id: "sueltas", name: "Otras herramientas asignadas", tools: loose });
    return groups;
  }, [isTecnico, toolsFiltered, toolLists]);

  const equipmentTypes = useMemo(() => Array.from(new Set(equipment.map((e) => e.type).filter(Boolean))).sort(), [equipment]);
  const equipmentFiltered = useMemo(() => equipment.filter((e) => {
    if (branchFilter !== "all" && e.branch_id !== branchFilter) return false;
    if (equipmentTechFilter === "none" && e.default_technician_id) return false;
    if (equipmentTechFilter !== "all" && equipmentTechFilter !== "none" && e.default_technician_id !== equipmentTechFilter) return false;
    if (equipmentTypeFilter !== "all" && e.type !== equipmentTypeFilter) return false;
    if (equipmentSearch) {
      const q = equipmentSearch.toLowerCase();
      if (![e.name, e.brand, e.model, e.serial_number].some((v) => (v || "").toLowerCase().includes(q))) return false;
    }
    return true;
  }), [equipment, branchFilter, equipmentTechFilter, equipmentTypeFilter, equipmentSearch]);

  const ordersByDate = useMemo(() => {
    const map = {};
    scopedOrders.forEach((o) => {
      if (!o.scheduled) return;
      if (!map[o.scheduled]) map[o.scheduled] = [];
      map[o.scheduled].push(o);
    });
    return map;
  }, [scopedOrders]);

  const overdueOrders = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return visibleOrders.filter((o) => o.status !== "completada" && o.scheduled && new Date(o.scheduled + "T00:00:00") < today);
  }, [visibleOrders]);

  const pastDeadlineOrders = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return visibleOrders.filter((o) => o.status !== "completada" && o.deadline && new Date(o.deadline + "T00:00:00") < today);
  }, [visibleOrders]);

  const orderDayColor = (o) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sched = new Date(o.scheduled + "T00:00:00");
    if (o.status === "completada") return C.green;
    if (sched < today) return C.red;
    if (sched.getTime() === today.getTime()) return C.amber;
    return C.blue;
  };
  const filteredOrders = useMemo(() => scopedOrders.filter((o) => {
    // Un técnico ya no ve sus propias órdenes completadas en el listado por defecto
    // (para no sobrecargar su sensación de carga de trabajo pendiente); puede seguir
    // revisándolas a propósito eligiendo "Completada" en el filtro de estado.
    if (isTecnico && statusFilter === "all" && o.status === "completada") return false;
    if (typeFilter !== "all" && o.type !== typeFilter) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (technicianFilter !== "all" && o.technician_id !== technicianFilter) return false;
    if (orderEquipmentFilter !== "all" && o.equipment_id !== orderEquipmentFilter) return false;
    if (orderDateFrom && (!o.scheduled || o.scheduled < orderDateFrom)) return false;
    if (orderDateTo && (!o.scheduled || o.scheduled > orderDateTo)) return false;
    if (search && !o.title.toLowerCase().includes(search.toLowerCase()) && !(o.code || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [scopedOrders, typeFilter, statusFilter, technicianFilter, orderEquipmentFilter, orderDateFrom, orderDateTo, search]);

  const kpi = useMemo(() => {
    const pend = scopedOrders.filter((o) => o.status === "pendiente").length;
    const prog = scopedOrders.filter((o) => o.status === "en_progreso").length;
    const done = scopedOrders.filter((o) => o.status === "completada").length;
    const prev = scopedOrders.filter((o) => o.type === "preventivo" && o.status !== "completada").length;
    return { pend, prog, done, prev, total: scopedOrders.length };
  }, [scopedOrders]);

  const chartData = useMemo(() => Object.entries(TYPE_CFG).map(([key, cfg]) => ({
    name: cfg.label, value: scopedOrders.filter((o) => o.type === key).length, color: cfg.color,
  })), [scopedOrders]);

  const branchName = (id) => branches.find((b) => b.id === id)?.name || "—";
  const techName = (id) => technicians.find((t) => t.id === id)?.name || "Sin asignar";
  const equipName = (id) => equipment.find((e) => e.id === id)?.name || "—";
  const locationName = (id) => locations.find((l) => l.id === id)?.name || null;

  const techStats = useMemo(() => technicians.map((t) => {
    const own = orders.filter((o) => o.technician_id === t.id);
    const ownIncidents = incidents.filter((i) => i.technician_id === t.id);
    return {
      ...t,
      total: own.length,
      active: own.filter((o) => o.status !== "completada").length,
      completed: own.filter((o) => o.status === "completada").length,
      preventivo: own.filter((o) => o.type === "preventivo").length,
      correctivo: own.filter((o) => o.type === "correctivo").length,
      predictivo: own.filter((o) => o.type === "predictivo").length,
      incidentesTotal: ownIncidents.length,
      incidentesAbiertos: ownIncidents.filter((i) => i.status === "abierto" || i.status === "en_revision").length,
      incidentesCompletados: ownIncidents.filter((i) => i.status === "resuelto").length,
    };
  }), [technicians, orders, incidents]);

  const equipStats = useMemo(() => equipment.map((eq) => {
    const own = orders.filter((o) => o.equipment_id === eq.id);
    const ownIncidents = incidents.filter((i) => i.equipment_id === eq.id);
    return {
      ...eq,
      total: own.length,
      correctivo: own.filter((o) => o.type === "correctivo").length,
      open: own.filter((o) => o.status !== "completada").length,
      incidentesTotal: ownIncidents.length,
      incidentesAbiertos: ownIncidents.filter((i) => i.status === "abierto" || i.status === "en_revision").length,
    };
  }), [equipment, orders, incidents]);

  const techChartData = useMemo(() => techStats.map((t) => ({ name: t.name.split(" ")[0], Preventivo: t.preventivo, Correctivo: t.correctivo, Predictivo: t.predictivo })), [techStats]);
  const equipChartData = useMemo(
    () => [...equipStats].sort((a, b) => b.correctivo - a.correctivo).slice(0, 8).map((eq) => ({ name: eq.name, Correctivos: eq.correctivo })),
    [equipStats]
  );
  const incidentEquipChartData = useMemo(
    () => [...equipStats].sort((a, b) => b.incidentesTotal - a.incidentesTotal).slice(0, 8).filter((eq) => eq.incidentesTotal > 0).map((eq) => ({ name: eq.name, Incidentes: eq.incidentesTotal })),
    [equipStats]
  );

  const incidentSlaStats = useMemo(() => {
    const hoursBetween = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60);
    const byPriority = {};
    Object.keys(PRIORITY_CFG).forEach((k) => { byPriority[k] = { responseHours: [], resolutionHours: [] }; });
    incidents.forEach((i) => {
      const bucket = byPriority[i.priority] || (byPriority[i.priority] = { responseHours: [], resolutionHours: [] });
      if (i.attended_at && i.created_at) bucket.responseHours.push(hoursBetween(i.created_at, i.attended_at));
      if (i.completed_at && i.created_at) bucket.resolutionHours.push(hoursBetween(i.created_at, i.completed_at));
    });
    const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const fmtHours = (h) => h === null ? "—" : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} días`;
    return Object.entries(byPriority).map(([key, v]) => ({
      key,
      label: PRIORITY_CFG[key]?.label || key,
      color: PRIORITY_CFG[key]?.color || C.muted,
      avgResponseHours: avg(v.responseHours),
      avgResolutionHours: avg(v.resolutionHours),
      responseLabel: fmtHours(avg(v.responseHours)),
      resolutionLabel: fmtHours(avg(v.resolutionHours)),
      nResponse: v.responseHours.length,
      nResolution: v.resolutionHours.length,
    }));
  }, [incidents]);

  const isDueByUsage = (item) => item.usage_unit && item.usage_interval && item.current_usage != null &&
    (Number(item.current_usage) - Number(item.usage_last_maintenance || 0)) >= Number(item.usage_interval);
  const isDueByDate = (item) => item.maintenance_frequency_days && item.next_maintenance_date && item.next_maintenance_date <= todayStr;

  const dueEquipment = useMemo(
    () => equipment.filter((e) => isDueByDate(e) || isDueByUsage(e))
      .sort((a, b) => (a.next_maintenance_date || "").localeCompare(b.next_maintenance_date || "")),
    [equipment, todayStr]
  );
  const dueClientAssets = useMemo(
    () => clientAssets.filter((a) => isDueByDate(a) || isDueByUsage(a))
      .sort((a, b) => (a.next_maintenance_date || "").localeCompare(b.next_maintenance_date || "")),
    [clientAssets, todayStr]
  );
  const upcomingEquipment = useMemo(() => {
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in7Str = in7.toISOString().slice(0, 10);
    return equipment.filter((e) => !isDueByDate(e) && !isDueByUsage(e) && e.maintenance_frequency_days && e.next_maintenance_date && e.next_maintenance_date > todayStr && e.next_maintenance_date <= in7Str);
  }, [equipment, todayStr]);
  const upcomingClientAssets = useMemo(() => {
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in7Str = in7.toISOString().slice(0, 10);
    return clientAssets.filter((a) => !isDueByDate(a) && !isDueByUsage(a) && a.maintenance_frequency_days && a.next_maintenance_date && a.next_maintenance_date > todayStr && a.next_maintenance_date <= in7Str);
  }, [clientAssets, todayStr]);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => [c.name, c.rnc_cedula, c.phone, c.email, c.address].some((v) => (v || "").toLowerCase().includes(q)));
  }, [clients, clientSearch]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter((s) => [s.name, s.rnc, s.phone, s.email].some((v) => (v || "").toLowerCase().includes(q)));
  }, [suppliers, supplierSearch]);

  const isServicesView = view === "services";
  const productCategories = useMemo(() => [...new Set(products.filter((p) => (p.item_type || "producto") === (isServicesView ? "servicio" : "producto")).map((p) => p.category).filter(Boolean))].sort(), [products, isServicesView]);
  const filteredProducts = useMemo(() => products.filter((p) => {
    if ((p.item_type || "producto") !== (isServicesView ? "servicio" : "producto")) return false;
    if (productCategoryFilter !== "all" && (p.category || "") !== productCategoryFilter) return false;
    if (productBranchFilter === "none" && p.branch_id) return false;
    if (productBranchFilter !== "all" && productBranchFilter !== "none" && p.branch_id !== productBranchFilter) return false;
    if (productSearch && !p.name.toLowerCase().includes(productSearch.toLowerCase()) && !(p.sku || "").toLowerCase().includes(productSearch.toLowerCase())) return false;
    return true;
  }), [products, productCategoryFilter, productBranchFilter, productSearch, isServicesView]);

  const filteredPurchases = useMemo(() => purchases.filter((pu) => {
    const supplierName = suppliers.find((s) => s.id === pu.supplier_id)?.name || "";
    if (purchaseSupplierFilter !== "all" && pu.supplier_id !== purchaseSupplierFilter) return false;
    if (purchaseSearch && !supplierName.toLowerCase().includes(purchaseSearch.toLowerCase()) && !(pu.invoice_number || "").toLowerCase().includes(purchaseSearch.toLowerCase())) return false;
    return true;
  }), [purchases, suppliers, purchaseSupplierFilter, purchaseSearch]);

  const filteredQuotes = useMemo(() => quotes.filter((q) => {
    const clientNameStr = clients.find((c) => c.id === q.client_id)?.name || "";
    if (quoteStatusFilter !== "all" && q.status !== quoteStatusFilter) return false;
    if (quoteSearch && !clientNameStr.toLowerCase().includes(quoteSearch.toLowerCase()) && !(q.quote_number || "").toLowerCase().includes(quoteSearch.toLowerCase())) return false;
    return true;
  }), [quotes, clients, quoteStatusFilter, quoteSearch]);

  const filteredInvoices = useMemo(() => invoices.filter((inv) => {
    const clientNameStr = clients.find((c) => c.id === inv.client_id)?.name || "";
    if (invoiceStatusFilter !== "all" && inv.status !== invoiceStatusFilter) return false;
    if (invoicePaymentFilter !== "all" && (inv.payment_status || "pendiente") !== invoicePaymentFilter) return false;
    if (invoiceSearch && !clientNameStr.toLowerCase().includes(invoiceSearch.toLowerCase()) && !(inv.ncf || "").toLowerCase().includes(invoiceSearch.toLowerCase()) && !(inv.invoice_number || "").toLowerCase().includes(invoiceSearch.toLowerCase())) return false;
    return true;
  }), [invoices, clients, invoiceStatusFilter, invoicePaymentFilter, invoiceSearch]);

  const activeWarrantyAssets = useMemo(() => {
    const today = new Date();
    return clientAssets
      .map((a) => {
        const end = addMonths(a.install_date, a.warranty_months);
        return { ...a, warrantyEnd: end, daysLeft: daysBetween(end, today) };
      })
      .filter((a) => a.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [clientAssets]);

  // ---- Órdenes ----
  const syncOrderTechnicians = async (workOrderId, techIds) => {
    await supabase.from("work_order_technicians").delete().eq("work_order_id", workOrderId);
    setOrderTechnicians((prev) => prev.filter((wt) => wt.work_order_id !== workOrderId));
    if (techIds && techIds.length > 0) {
      const rows = techIds.map((technician_id) => ({ company_id: companyId, work_order_id: workOrderId, technician_id }));
      const { data, error } = await supabase.from("work_order_technicians").insert(rows).select();
      if (!error && data) setOrderTechnicians((prev) => [...prev, ...data]);
    }
  };

  const createOrder = async (payload, files, extraTechIds, linkedIncidentId, linkedSalesOrderId) => {
    setSaving(true);
    const code = `OT-${String(orders.length + 1).padStart(4, "0")}`;
    const { data, error } = await supabase.from("work_orders").insert({ ...payload, code, company_id: companyId, status: "pendiente" }).select().single();
    if (error) { setSaving(false); setErrorMsg(error.message); return; }
    setOrders((prev) => [data, ...prev]);
    setShowOrderForm(false);
    setOrderFromIncident(null);
    setOrderFromSalesOrder(null);
    if (extraTechIds && extraTechIds.length > 0) await syncOrderTechnicians(data.id, extraTechIds);
    await notifyManyTechnicians([data.technician_id, ...(extraTechIds || [])], {
      title: `Nueva orden asignada: ${data.code}`,
      body: data.title,
      link_view: "orders",
      category: "order_assigned",
    });
    if (linkedIncidentId) {
      await supabase.from("incidents").update({ work_order_id: data.id, status: "convertido" }).eq("id", linkedIncidentId);
      setIncidents((prev) => prev.map((i) => (i.id === linkedIncidentId ? { ...i, work_order_id: data.id, status: "convertido" } : i)));
    }
    if (linkedSalesOrderId) {
      await supabase.from("sales_orders").update({ work_order_id: data.id }).eq("id", linkedSalesOrderId);
      setSalesOrders((prev) => prev.map((o) => (o.id === linkedSalesOrderId ? { ...o, work_order_id: data.id } : o)));
    }
    if (files && files.length > 0) {
      for (const file of files) {
        const ext = file.name.split(".").pop();
        const path = `support/${companyId}/${data.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upError } = await supabase.storage.from("evidence").upload(path, file);
        if (upError) { setErrorMsg(`No se pudo subir ${file.name}: ${upError.message}`); continue; }
        const { data: pub } = supabase.storage.from("evidence").getPublicUrl(path);
        const { error: attError } = await supabase.from("work_order_attachments").insert({ work_order_id: data.id, file_url: pub.publicUrl, file_name: file.name });
        if (attError) setErrorMsg(`Se subió ${file.name} pero no se pudo vincular a la orden: ${attError.message}`);
        else setOrderAttachmentIds((prev) => new Set(prev).add(data.id));
      }
    }
    setSaving(false);
  };

  const createBulkOrders = async (rows) => {
    setSaving(true);
    let counter = orders.length;
    const inserted = [];
    for (const row of rows) {
      counter += 1;
      const code = `OT-${String(counter).padStart(4, "0")}`;
      const { data, error } = await supabase.from("work_orders").insert({
        company_id: companyId, branch_id: row.branch_id, equipment_id: row.equipment_id || null,
        technician_id: row.technician_id || null, type: row.type, priority: row.priority,
        title: row.title, scheduled: row.scheduled, code, status: "pendiente",
      }).select().single();
      if (error) { setErrorMsg(`No se pudo crear la orden "${row.title}": ${error.message}`); continue; }
      inserted.push(data);
    }
    setOrders((prev) => [...inserted, ...prev]);
    setSaving(false);
    setShowBulkOrders(false);
  };

  const openEditOrder = async (order) => {
    const { data, error } = await supabase.from("work_order_attachments").select("*").eq("work_order_id", order.id).order("uploaded_at");
    if (error) { setErrorMsg(error.message); return; }
    setEditingOrderAttachments(data || []);
    setEditingOrder(order);
  };

  const deleteOrderAttachment = async (attachment) => {
    if (!window.confirm(`¿Quitar "${attachment.file_name || "este archivo"}" de la orden?`)) return;
    const { data, error } = await supabase.from("work_order_attachments").delete().eq("id", attachment.id).select();
    if (error) { setErrorMsg(error.message); return; }
    if (!data || data.length === 0) {
      setErrorMsg("No se pudo quitar el archivo: la base de datos no eliminó ningún registro (probablemente falta un permiso DELETE en work_order_attachments).");
      return;
    }
    setEditingOrderAttachments((prev) => {
      const next = prev.filter((a) => a.id !== attachment.id);
      if (next.length === 0) {
        setOrderAttachmentIds((ids) => { const s = new Set(ids); s.delete(attachment.work_order_id); return s; });
      }
      return next;
    });
  };

  const updateOrder = async (payload, files, extraTechIds) => {
    setSaving(true);
    const previousTechnicianId = editingOrder.technician_id;
    const { data, error } = await supabase.from("work_orders").update(payload).eq("id", editingOrder.id).select().single();
    if (error) { setSaving(false); setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    await syncOrderTechnicians(editingOrder.id, extraTechIds || []);
    if (data.technician_id && data.technician_id !== previousTechnicianId) {
      await notifyManyTechnicians([data.technician_id], {
        title: `Te asignaron la orden ${data.code}`,
        body: data.title,
        link_view: "orders",
        category: "order_assigned",
      });
    }
    if (files && files.length > 0) {
      for (const file of files) {
        const ext = file.name.split(".").pop();
        const path = `support/${companyId}/${data.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upError } = await supabase.storage.from("evidence").upload(path, file);
        if (upError) { setErrorMsg(`No se pudo subir ${file.name}: ${upError.message}`); continue; }
        const { data: pub } = supabase.storage.from("evidence").getPublicUrl(path);
        const { data: attRow, error: attError } = await supabase.from("work_order_attachments").insert({ work_order_id: data.id, file_url: pub.publicUrl, file_name: file.name }).select().single();
        if (attError) { setErrorMsg(`Se subió ${file.name} pero no se pudo vincular a la orden: ${attError.message}`); continue; }
        setOrderAttachmentIds((prev) => new Set(prev).add(data.id));
        setEditingOrderAttachments((prev) => [...prev, attRow]);
      }
    }
    setSaving(false);
    setEditingOrder(null);
    setEditingOrderAttachments([]);
  };

  const cycleStatus = async (order) => {
    const seq = ["pendiente", "en_progreso", "completada"];
    const next = seq[(seq.indexOf(order.status) + 1) % seq.length];
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    const { error } = await supabase.from("work_orders").update({ status: next }).eq("id", order.id);
    if (error) setErrorMsg(error.message);
  };

  const deleteOrder = async (orderId) => {
    if (!window.confirm("¿Eliminar esta orden de trabajo?")) return;
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    const { error } = await supabase.from("work_orders").delete().eq("id", orderId);
    if (error) setErrorMsg(error.message);
  };

  const openOrderDetail = async (order) => {
    const { data: attachments } = await supabase.from("work_order_attachments").select("*").eq("work_order_id", order.id).order("uploaded_at");
    const { data: checklist } = await supabase.from("work_order_checklist_items").select("*").eq("work_order_id", order.id).order("position");
    setDetailOrderAttachments(attachments || []);
    setDetailOrderChecklist(checklist || []);
    setDetailOrder(order);
  };

  const loadChecklistFromTemplate = async (order, template) => {
    const sortedItems = (template.items || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
    const rows = sortedItems.map((it, i) => ({ work_order_id: order.id, text: it.text, section: it.section || null, checked: false, position: i }));
    const { data, error } = await supabase.from("work_order_checklist_items").insert(rows).select();
    if (error) { setErrorMsg(error.message); return; }
    setDetailOrderChecklist(data || []);
  };

  const toggleChecklistItem = async (item, checked) => {
    setDetailOrderChecklist((prev) => prev.map((it) => (it.id === item.id ? { ...it, checked } : it)));
    const { error } = await supabase.from("work_order_checklist_items").update({ checked }).eq("id", item.id);
    if (error) setErrorMsg(error.message);
  };

  const editChecklistItemField = (item, field, value) => {
    setDetailOrderChecklist((prev) => prev.map((it) => (it.id === item.id ? { ...it, [field]: value } : it)));
  };

  const saveChecklistItemField = async (item, field, value) => {
    const { error } = await supabase.from("work_order_checklist_items").update({ [field]: value }).eq("id", item.id);
    if (error) setErrorMsg(error.message);
  };

  const clearOrderChecklist = async (order) => {
    if (order.status === "completada") return;
    if (!window.confirm("¿Quitar el checklist de esta orden? Se perderán los cotejos, respuestas y observaciones ya registradas, y podrás cargar otro checklist.")) return;
    const { data, error } = await supabase.from("work_order_checklist_items").delete().eq("work_order_id", order.id).select();
    if (error) { setErrorMsg(error.message); return; }
    if (!data || data.length === 0) {
      setErrorMsg("No se pudo quitar el checklist: la base de datos no eliminó ningún registro. Probablemente falta un permiso (política RLS) de DELETE en la tabla work_order_checklist_items. No cargues otro checklist hasta corregir esto, o se van a duplicar los puntos.");
      return;
    }
    setDetailOrderChecklist([]);
  };

  const saveOrderDetail = async (order, notes, photoFile, newStatus, laborHours, laborRate) => {
    setSaving(true);
    let photo_url = order.photo_url || null;
    if (photoFile) {
      const ext = photoFile.name.split(".").pop();
      const path = `${companyId}/${order.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("evidence").upload(path, photoFile, { upsert: true });
      if (uploadError) { setSaving(false); setErrorMsg(uploadError.message); return; }
      const { data: pub } = supabase.storage.from("evidence").getPublicUrl(path);
      photo_url = pub.publicUrl;
    }
    const payload = { resolution_notes: notes, photo_url };
    if (newStatus) payload.status = newStatus;
    if (laborHours !== undefined) payload.labor_hours = laborHours === "" ? null : Number(laborHours);
    if (laborRate !== undefined) payload.labor_rate_used = laborRate === "" ? null : Number(laborRate);
    const { data, error } = await supabase.from("work_orders").update(payload).eq("id", order.id).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setDetailOrder(null);
  };

  const saveClientSignature = async (order, dataUrl, signerName) => {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `signatures/${companyId}/${order.id}-${Date.now()}.png`;
    const { error: upError } = await supabase.storage.from("evidence").upload(path, blob, { contentType: "image/png", upsert: true });
    if (upError) { setErrorMsg(upError.message); return; }
    const { data: pub } = supabase.storage.from("evidence").getPublicUrl(path);
    const { data, error } = await supabase.from("work_orders").update({
      client_signature_url: pub.publicUrl,
      client_signature_name: signerName,
      client_signature_at: new Date().toISOString(),
    }).eq("id", order.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setDetailOrder((prev) => (prev ? data : prev));
  };

  // ---- Perfil de la empresa ----
  const saveCompanyProfile = async (payload, logoFile) => {
    setSaving(true);
    let logo_url = company?.logo_url || null;
    if (logoFile) {
      const ext = logoFile.name.split(".").pop();
      const path = `logos/${companyId}/logo-${Date.now()}.${ext}`;
      const { error: upError } = await supabase.storage.from("evidence").upload(path, logoFile, { upsert: true });
      if (upError) { setSaving(false); setErrorMsg(upError.message); return; }
      const { data: pub } = supabase.storage.from("evidence").getPublicUrl(path);
      logo_url = pub.publicUrl;
    }
    const { data, error } = await supabase.from("companies").update({ ...payload, logo_url }).eq("id", companyId).select().maybeSingle();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    if (!data) { setErrorMsg("No se pudo guardar el perfil de la empresa: la base de datos no permitió la actualización (revisa los permisos/RLS de la tabla 'companies'). No se perdieron tus datos, puedes reintentar."); return; }
    onUpdateCompany(data);
  };

  // ---- Cuentas bancarias de la empresa (para elegir en las facturas) ----
  const saveBankAccount = async (payload, editingId) => {
    setSaving(true);
    if (editingId) {
      const { data, error } = await supabase.from("company_bank_accounts").update(payload).eq("id", editingId).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setCompanyBankAccounts((prev) => prev.map((a) => (a.id === data.id ? data : a)));
    } else {
      const { data, error } = await supabase.from("company_bank_accounts").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setCompanyBankAccounts((prev) => [...prev, data]);
    }
  };

  const deleteBankAccount = async (id) => {
    if (!window.confirm("¿Eliminar esta cuenta bancaria? Ya no aparecerá como opción al facturar.")) return;
    const { error } = await supabase.from("company_bank_accounts").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setCompanyBankAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  const setDefaultBankAccount = async (id) => {
    await supabase.from("company_bank_accounts").update({ is_default: false }).eq("company_id", companyId).neq("id", id);
    const { data, error } = await supabase.from("company_bank_accounts").update({ is_default: true }).eq("id", id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setCompanyBankAccounts((prev) => prev.map((a) => (a.id === id ? data : { ...a, is_default: false })));
  };

  // ---- Sucursales ----
  const saveBranch = async (name, city) => {
    setSaving(true);
    if (editingBranch) {
      const { data, error } = await supabase.from("branches").update({ name, city }).eq("id", editingBranch.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setBranches((prev) => prev.map((b) => (b.id === data.id ? data : b)));
      setEditingBranch(null);
    } else {
      const { data, error } = await supabase.from("branches").insert({ company_id: companyId, name, city }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setBranches((prev) => [...prev, data]);
      setShowAddBranch(false);
    }
  };

  const deleteBranch = async (id) => {
    if (!window.confirm("¿Eliminar esta sucursal? También se eliminarán sus técnicos, equipos y órdenes.")) return;
    const { error } = await supabase.from("branches").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    loadAll();
  };

  // ---- Clientes ----
  const saveClient = async (payload) => {
    setSaving(true);
    if (editingClient) {
      const { data, error } = await supabase.from("clients").update(payload).eq("id", editingClient.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setClients((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      setEditingClient(null);
    } else {
      const { data, error } = await supabase.from("clients").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setClients((prev) => [...prev, data]);
      setShowAddClient(false);
    }
  };

  const deleteClient = async (id) => {
    if (!window.confirm("¿Eliminar este cliente?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  // ---- Activos instalados en clientes (garantía) ----
  const saveClientAsset = async (payload) => {
    setSaving(true);
    if (editingAsset) {
      const { data, error } = await supabase.from("client_assets").update(payload).eq("id", editingAsset.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setClientAssets((prev) => prev.map((a) => (a.id === data.id ? data : a)));
      setEditingAsset(null);
    } else {
      const { data, error } = await supabase.from("client_assets").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setClientAssets((prev) => [...prev, data]);
      setShowAddAsset(false);
    }
  };

  const deleteClientAsset = async (id) => {
    if (!window.confirm("¿Eliminar este activo instalado?")) return;
    const { error } = await supabase.from("client_assets").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setClientAssets((prev) => prev.filter((a) => a.id !== id));
  };

  // ---- Mantenimiento preventivo recurrente ----
  const generateMaintenanceOrder = async (source, sourceType, code) => {
    const isEquip = sourceType === "equipment";
    if (!source.branch_id) {
      setErrorMsg(`"${source.name}" no tiene sucursal responsable asignada. Edítalo primero para indicarla.`);
      return false;
    }
    const payload = {
      company_id: companyId,
      branch_id: source.branch_id,
      equipment_id: isEquip ? source.id : null,
      client_asset_id: isEquip ? null : source.id,
      client_id: isEquip ? null : source.client_id,
      technician_id: source.default_technician_id || null,
      type: "preventivo",
      priority: "media",
      title: `Mantenimiento preventivo — ${source.name}`,
      scheduled: todayStr,
      code,
      status: "pendiente",
    };
    const { data, error } = await supabase.from("work_orders").insert(payload).select().single();
    if (error) { setErrorMsg(error.message); return false; }
    setOrders((prev) => [data, ...prev]);

    const updatePayload = {};
    if (source.maintenance_frequency_days && source.next_maintenance_date) {
      const nextDate = new Date(`${todayStr}T00:00:00`);
      nextDate.setDate(nextDate.getDate() + Number(source.maintenance_frequency_days));
      updatePayload.next_maintenance_date = nextDate.toISOString().slice(0, 10);
    }
    if (source.usage_unit && source.usage_interval && source.current_usage != null) {
      updatePayload.usage_last_maintenance = source.current_usage;
    }
    const table = isEquip ? "equipment" : "client_assets";
    const { data: updated, error: updError } = await supabase.from(table).update(updatePayload).eq("id", source.id).select().single();
    if (!updError && updated) {
      if (isEquip) setEquipment((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      else setClientAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    }
    return true;
  };

  const generateOneMaintenanceOrder = async (source, sourceType) => {
    setSaving(true);
    const code = `OT-${String(orders.length + 1).padStart(4, "0")}`;
    await generateMaintenanceOrder(source, sourceType, code);
    setSaving(false);
  };

  const generateAllDueMaintenance = async () => {
    setSaving(true);
    let counter = orders.length;
    for (const eq of dueEquipment) {
      counter += 1;
      await generateMaintenanceOrder(eq, "equipment", `OT-${String(counter).padStart(4, "0")}`);
    }
    for (const asset of dueClientAssets) {
      counter += 1;
      await generateMaintenanceOrder(asset, "client_asset", `OT-${String(counter).padStart(4, "0")}`);
    }
    setSaving(false);
  };

  const updateUsageReading = async (source, sourceType, newValue) => {
    const table = sourceType === "equipment" ? "equipment" : "client_assets";
    const { data, error } = await supabase.from(table).update({ current_usage: newValue }).eq("id", source.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    if (sourceType === "equipment") setEquipment((prev) => prev.map((e) => (e.id === data.id ? data : e)));
    else setClientAssets((prev) => prev.map((a) => (a.id === data.id ? data : a)));
  };

  // ---- Catálogo de productos ----
  const syncProductComponents = async (parentProductId, components) => {
    await supabase.from("product_components").delete().eq("parent_product_id", parentProductId);
    setProductComponents((prev) => prev.filter((c) => c.parent_product_id !== parentProductId));
    if (components && components.length > 0) {
      const rows = components.map((c) => ({ company_id: companyId, parent_product_id: parentProductId, component_product_id: c.component_product_id, quantity: Number(c.quantity) || 1 }));
      const { data, error } = await supabase.from("product_components").insert(rows).select();
      if (error) { setErrorMsg(`El producto se guardó, pero no se pudieron guardar sus componentes: ${error.message}`); return; }
      if (data) setProductComponents((prev) => [...prev, ...data]);
    }
  };

  const saveProduct = async (payload, components) => {
    setSaving(true);
    if (editingProduct) {
      const { data, error } = await supabase.from("products").update(payload).eq("id", editingProduct.id).select().single();
      if (error) { setSaving(false); setErrorMsg(error.message); return; }
      setProducts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      if (payload.is_composite) await syncProductComponents(data.id, components);
      setSaving(false);
      setEditingProduct(null);
    } else {
      const { data, error } = await supabase.from("products").insert({ ...payload, company_id: companyId }).select().single();
      if (error) { setSaving(false); setErrorMsg(error.message); return; }
      setProducts((prev) => [...prev, data]);
      if (payload.is_composite) await syncProductComponents(data.id, components);
      setSaving(false);
      setShowAddProduct(false);
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm("¿Eliminar este producto del catálogo?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setProductComponents((prev) => prev.filter((c) => c.parent_product_id !== id));
  };

  // ---- Proveedores ----
  const saveSupplier = async (payload) => {
    setSaving(true);
    if (editingSupplier) {
      const { data, error } = await supabase.from("suppliers").update(payload).eq("id", editingSupplier.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setSuppliers((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      setEditingSupplier(null);
    } else {
      const { data, error } = await supabase.from("suppliers").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setSuppliers((prev) => [...prev, data]);
      setShowAddSupplier(false);
    }
  };

  const deleteSupplier = async (id) => {
    if (!window.confirm("¿Eliminar este proveedor?")) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
  };

  // ---- Otros gastos ----
  const saveExpense = async (payload) => {
    setSaving(true);
    if (editingExpense) {
      const { data, error } = await supabase.from("other_expenses").update(payload).eq("id", editingExpense.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setOtherExpenses((prev) => prev.map((e) => (e.id === data.id ? data : e)));
      setEditingExpense(null);
    } else {
      const { data, error } = await supabase.from("other_expenses").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setOtherExpenses((prev) => [data, ...prev]);
      setShowAddExpense(false);
    }
  };
  const deleteExpense = async (id) => {
    if (!window.confirm("¿Eliminar este gasto?")) return;
    const { error } = await supabase.from("other_expenses").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setOtherExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  // ---- Inventario: Herramientas ----
  const saveTool = async (payload) => {
    setSaving(true);
    if (editingTool) {
      const technicianChanged = (payload.technician_id || null) !== (editingTool.technician_id || null);
      const finalPayload = technicianChanged ? { ...payload, received_at: null } : payload;
      const { data, error } = await supabase.from("tools").update(finalPayload).eq("id", editingTool.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTools((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      setEditingTool(null);
    } else if (Array.isArray(payload)) {
      // Varias unidades idénticas a la vez (campo "Cantidad" del formulario).
      const { data, error } = await supabase.from("tools").insert(payload.map((p) => ({ ...p, company_id: companyId }))).select();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTools((prev) => [...(data || []), ...prev]);
      setShowAddTool(false);
    } else {
      const { data, error } = await supabase.from("tools").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTools((prev) => [data, ...prev]);
      setShowAddTool(false);
    }
  };
  const deleteTool = async (id) => {
    if (!window.confirm("¿Eliminar esta herramienta?")) return;
    const { error } = await supabase.from("tools").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.filter((t) => t.id !== id));
  };

  const bulkDeleteTools = async (ids) => {
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar ${ids.length} herramienta${ids.length !== 1 ? "s" : ""} seleccionada${ids.length !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("tools").delete().in("id", ids);
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.filter((t) => !ids.includes(t.id)));
    setSelectedTools(new Set());
  };

  const bulkRetireTools = async (ids) => {
    if (ids.length === 0) return;
    if (!window.confirm(`¿Dar de baja ${ids.length} herramienta${ids.length !== 1 ? "s" : ""} seleccionada${ids.length !== 1 ? "s" : ""}? Dejarán de aparecer como disponibles para asignar, pero no se borran.`)) return;
    const { data, error } = await supabase.from("tools").update({ status: "baja" }).in("id", ids).select();
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.map((t) => (ids.includes(t.id) ? (data.find((d) => d.id === t.id) || t) : t)));
    setSelectedTools(new Set());
  };

  // ---- Inventario: Listados de herramientas (kits asignables a un técnico) ----
  const saveToolList = async (payload, editingId) => {
    setSaving(true);
    if (editingId) {
      const { data, error } = await supabase.from("tool_lists").update(payload).eq("id", editingId).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setToolLists((prev) => prev.map((l) => (l.id === data.id ? data : l)));
      setEditingToolList(null);
    } else {
      const { data, error } = await supabase.from("tool_lists").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setToolLists((prev) => [...prev, data]);
      setShowAddToolList(false);
    }
  };

  const deleteToolList = async (id) => {
    if (!window.confirm("¿Eliminar este listado? Las herramientas que contiene NO se eliminan, solo el listado.")) return;
    const { error } = await supabase.from("tool_lists").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setToolLists((prev) => prev.filter((l) => l.id !== id));
  };

  const assignToolsByQuantity = async (list, toolName, qty, technicianId) => {
    setSaving(true);
    const candidates = tools.filter((t) => (list.tool_ids || []).includes(t.id) && t.name === toolName && !t.technician_id).slice(0, qty);
    if (candidates.length === 0) { setSaving(false); return; }
    const { data, error } = await supabase.from("tools").update({ technician_id: technicianId, status: "asignada" }).in("id", candidates.map((t) => t.id)).select();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.map((t) => data.find((u) => u.id === t.id) || t));
  };

  const returnToolsByQuantity = async (list, toolName, technicianId, qty) => {
    setSaving(true);
    const candidates = tools.filter((t) => (list.tool_ids || []).includes(t.id) && t.name === toolName && t.technician_id === technicianId).slice(0, qty);
    if (candidates.length === 0) { setSaving(false); return; }
    const { data, error } = await supabase.from("tools").update({ technician_id: null, status: "disponible" }).in("id", candidates.map((t) => t.id)).select();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.map((t) => data.find((u) => u.id === t.id) || t));
  };
  const createBulkTools = async (rows) => {
    if (rows.length === 0) return;
    setSaving(true);
    const payload = rows.map((r) => ({
      company_id: companyId,
      name: r.name.trim(),
      category: r.category?.trim() || null,
      serial_number: r.serial_number?.trim() || null,
      branch_id: r.branch_id || null,
      technician_id: r.technician_id || null,
      status: r.technician_id ? "asignada" : "disponible",
    }));
    const { data, error } = await supabase.from("tools").insert(payload).select();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => [...(data || []), ...prev]);
    setShowBulkTools(false);
  };
  const assignTool = async (id, technicianId) => {
    const { data, error } = await supabase.from("tools")
      .update({ technician_id: technicianId || null, status: technicianId ? "asignada" : "disponible", received_at: null })
      .eq("id", id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.map((t) => (t.id === data.id ? data : t)));
  };
  const confirmToolReceipt = async (id) => {
    const { data, error } = await supabase.from("tools")
      .update({ received_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setTools((prev) => prev.map((t) => (t.id === data.id ? data : t)));
  };

  // ---- Préstamos de herramientas entre técnicos ----
  const lendTool = async (tool, toTechnicianId, notes) => {
    if (!toTechnicianId || toTechnicianId === tool.technician_id) return;
    setSaving(true);
    const { data: loan, error: loanError } = await supabase.from("tool_loans").insert({
      company_id: companyId, tool_id: tool.id, from_technician_id: tool.technician_id || null, to_technician_id: toTechnicianId, notes: notes?.trim() || null,
    }).select().single();
    if (loanError) { setSaving(false); setErrorMsg(loanError.message); return; }
    const { data: updatedTool, error: toolError } = await supabase.from("tools")
      .update({ technician_id: toTechnicianId, status: "asignada", received_at: null })
      .eq("id", tool.id).select().single();
    setSaving(false);
    if (toolError) { setErrorMsg(`Se registró el préstamo pero no se pudo actualizar la herramienta: ${toolError.message}`); return; }
    setTools((prev) => prev.map((t) => (t.id === updatedTool.id ? updatedTool : t)));
    setToolLoans((prev) => [loan, ...prev]);
  };

  const returnTool = async (tool) => {
    const activeLoan = toolLoans.find((l) => l.tool_id === tool.id && !l.returned_at);
    if (!activeLoan) return;
    setSaving(true);
    const { data: updatedLoan, error: loanError } = await supabase.from("tool_loans")
      .update({ returned_at: new Date().toISOString() }).eq("id", activeLoan.id).select().single();
    if (loanError) { setSaving(false); setErrorMsg(loanError.message); return; }
    const { data: updatedTool, error: toolError } = await supabase.from("tools")
      .update({ technician_id: activeLoan.from_technician_id, status: activeLoan.from_technician_id ? "asignada" : "disponible", received_at: null })
      .eq("id", tool.id).select().single();
    setSaving(false);
    if (toolError) { setErrorMsg(`Se registró la devolución pero no se pudo actualizar la herramienta: ${toolError.message}`); return; }
    setTools((prev) => prev.map((t) => (t.id === updatedTool.id ? updatedTool : t)));
    setToolLoans((prev) => prev.map((l) => (l.id === updatedLoan.id ? updatedLoan : l)));
  };

  // ---- Inventario: Materiales sobrantes ----
  const saveMaterial = async (payload) => {
    setSaving(true);
    if (editingMaterial) {
      const { data, error } = await supabase.from("inventory_materials").update(payload).eq("id", editingMaterial.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setMaterials((prev) => prev.map((m) => (m.id === data.id ? data : m)));
      setEditingMaterial(null);
    } else {
      const { data, error } = await supabase.from("inventory_materials").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setMaterials((prev) => [data, ...prev]);
      setShowAddMaterial(false);
    }
  };
  const deleteMaterial = async (id) => {
    if (!window.confirm("¿Eliminar este material?")) return;
    const { error } = await supabase.from("inventory_materials").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  };
  const consumeMaterialStock = async (materialId, quantityUsed) => {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) return;
    const newQty = Math.max(0, Number(mat.quantity || 0) - Number(quantityUsed || 0));
    const { data, error } = await supabase.from("inventory_materials").update({ quantity: newQty }).eq("id", materialId).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setMaterials((prev) => prev.map((m) => (m.id === data.id ? data : m)));
  };

  // ---- Proyectos ----
  const saveProject = async (payload) => {
    setSaving(true);
    if (editingProject) {
      const { data, error } = await supabase.from("projects").update(payload).eq("id", editingProject.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setProjects((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      setEditingProject(null);
      setProjectDetail((prev) => (prev && prev.id === data.id ? data : prev));
    } else {
      const { status, ...rest } = payload;
      const { data, error } = await supabase.from("projects").insert({ ...rest, company_id: companyId, status: "activo" }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setProjects((prev) => [data, ...prev]);
      setShowAddProject(false);
    }
  };
  const deleteProject = async (project) => {
    if (!window.confirm(`¿Eliminar el proyecto "${project.name}"? Las órdenes, materiales y órdenes de venta vinculados quedarán sin proyecto asignado.`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) { setErrorMsg(error.message); return; }
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    setProjectMaterials((prev) => prev.filter((pm) => pm.project_id !== project.id));
    setOrders((prev) => prev.map((o) => (o.project_id === project.id ? { ...o, project_id: null } : o)));
    setSalesOrders((prev) => prev.map((o) => (o.project_id === project.id ? { ...o, project_id: null } : o)));
    setProjectDetail(null);
  };
  const setProjectStatus = async (project, status) => {
    const { data, error } = await supabase.from("projects").update({ status }).eq("id", project.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setProjects((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    setProjectDetail((prev) => (prev && prev.id === data.id ? data : prev));
  };
  const linkOrderToProject = async (projectId, orderId) => {
    const { data, error } = await supabase.from("work_orders").update({ project_id: projectId }).eq("id", orderId).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
  };
  const unlinkOrderFromProject = async (orderId) => {
    const { data, error } = await supabase.from("work_orders").update({ project_id: null }).eq("id", orderId).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
  };
  const linkSalesOrderToProject = async (projectId, salesOrderId) => {
    const { data, error } = await supabase.from("sales_orders").update({ project_id: projectId }).eq("id", salesOrderId).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
  };
  const unlinkSalesOrderFromProject = async (salesOrderId) => {
    const { data, error } = await supabase.from("sales_orders").update({ project_id: null }).eq("id", salesOrderId).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
  };
  const addProjectMaterial = async (projectId, materialId, quantity, notes) => {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) return;
    const qty = Number(quantity || 0);
    if (!qty || qty <= 0) { setErrorMsg("La cantidad debe ser mayor a cero."); return; }
    if (qty > Number(mat.quantity || 0)) { setErrorMsg("No hay suficiente cantidad disponible en materiales sobrantes."); return; }
    setSaving(true);
    const { data, error } = await supabase.from("project_materials").insert({ company_id: companyId, project_id: projectId, material_id: materialId, quantity: qty, notes: (notes || "").trim() || null }).select().single();
    if (error) { setSaving(false); setErrorMsg(error.message); return; }
    await consumeMaterialStock(materialId, qty);
    setSaving(false);
    setProjectMaterials((prev) => [data, ...prev]);
  };
  const removeProjectMaterial = async (pm) => {
    if (!window.confirm("¿Quitar este material del proyecto? La cantidad regresará al inventario de materiales sobrantes.")) return;
    const { error } = await supabase.from("project_materials").delete().eq("id", pm.id);
    if (error) { setErrorMsg(error.message); return; }
    const mat = materials.find((m) => m.id === pm.material_id);
    if (mat) {
      const newQty = Number(mat.quantity || 0) + Number(pm.quantity || 0);
      const { data, error: matError } = await supabase.from("inventory_materials").update({ quantity: newQty }).eq("id", mat.id).select().single();
      if (!matError && data) setMaterials((prev) => prev.map((m) => (m.id === data.id ? data : m)));
    }
    setProjectMaterials((prev) => prev.filter((p) => p.id !== pm.id));
  };

  // ---- Catálogo de cuentas ----
  const saveAccount = async (payload) => {
    setSaving(true);
    if (editingAccount) {
      const { data, error } = await supabase.from("chart_of_accounts").update(payload).eq("id", editingAccount.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setChartOfAccounts((prev) => prev.map((a) => (a.id === data.id ? data : a)));
      setEditingAccount(null);
    } else {
      const { data, error } = await supabase.from("chart_of_accounts").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setChartOfAccounts((prev) => [...prev, data].sort((a, b) => a.code.localeCompare(b.code)));
      setShowAddAccount(false);
    }
  };
  const deleteAccount = async (id) => {
    if (!window.confirm("¿Eliminar esta cuenta del catálogo?")) return;
    const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setChartOfAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  // ---- Tasas impositivas ----
  const saveTaxRate = async (payload) => {
    setSaving(true);
    if (editingTaxRate) {
      const { data, error } = await supabase.from("tax_rates").update(payload).eq("id", editingTaxRate.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTaxRates((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      setEditingTaxRate(null);
    } else {
      const { data, error } = await supabase.from("tax_rates").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTaxRates((prev) => [...prev, data]);
      setShowAddTaxRate(false);
    }
  };
  const deleteTaxRate = async (id) => {
    if (!window.confirm("¿Eliminar esta tasa impositiva?")) return;
    const { error } = await supabase.from("tax_rates").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setTaxRates((prev) => prev.filter((t) => t.id !== id));
  };

  // ---- Catálogo RNC (DGII) ----
  const loadDgiiCatalogStats = async () => {
    const { count } = await supabase.from("dgii_rnc_catalog").select("rnc", { count: "exact", head: true });
    setDgiiCatalogCount(count ?? 0);
    const { data: latest } = await supabase.from("dgii_rnc_catalog").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    setDgiiCatalogUpdatedAt(latest?.updated_at || null);
  };

  const importDgiiCatalogFile = async (file) => {
    if (!file) return;
    setDgiiImporting(true);
    setDgiiImportProgress({ done: 0, total: 0, phase: "Leyendo archivo..." });
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      const rows = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split("|").map((p) => p.trim().replace(/\s{2,}/g, " "));
        const rnc = (parts[0] || "").replace(/\D/g, "");
        if (!rnc || rnc.length < 9) continue;
        rows.push({
          rnc,
          name: parts[1] || "Sin nombre",
          commercial_name: parts[2] || null,
          status: parts[5] || parts[4] || null,
          updated_at: new Date().toISOString(),
        });
      }
      const total = rows.length;
      if (total === 0) {
        setErrorMsg("No se pudo leer ningún registro válido de ese archivo. Confirma que sea el DGII_RNC.TXT descomprimido, sin editar.");
        setDgiiImporting(false);
        setDgiiImportProgress(null);
        return;
      }
      const batchSize = 1000;
      setDgiiImportProgress({ done: 0, total, phase: "Importando..." });
      for (let i = 0; i < total; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from("dgii_rnc_catalog").upsert(batch, { onConflict: "rnc" });
        if (error) { setErrorMsg(`Se importaron ${i} de ${total} registros y ocurrió un error: ${error.message}`); break; }
        setDgiiImportProgress({ done: Math.min(i + batchSize, total), total, phase: "Importando..." });
        await new Promise((r) => setTimeout(r, 0));
      }
      await loadDgiiCatalogStats();
    } catch (err) {
      setErrorMsg(`No se pudo procesar el archivo: ${err.message}`);
    }
    setDgiiImporting(false);
    setDgiiImportProgress(null);
  };

  // ---- Recibos de proveedor (libro de pagos a proveedores) ----
  useEffect(() => {
    if (view !== "supplierReceipts" || purchases.length === 0) { if (view !== "supplierReceipts") setAllPurchasePayments([]); return; }
    (async () => {
      const { data } = await supabase.from("purchase_payments").select("*").in("purchase_id", purchases.map((p) => p.id)).order("payment_date", { ascending: false });
      setAllPurchasePayments(data || []);
    })();
  }, [view, purchases]);

  // ---- Producto genérico usado al importar una compra automáticamente desde PDF ----
  const ensureGenericPurchaseProduct = async () => {
    const existing = products.find((p) => p.name === "Compra importada (PDF)" && (p.item_type || "producto") === "servicio");
    if (existing) return existing;
    const { data, error } = await supabase.from("products").insert({
      company_id: companyId, item_type: "servicio", name: "Compra importada (PDF)", category: "Importado",
      unit: "unidad", cost_price: 0, unit_price: 0, stock_qty: 0, is_taxable: true,
    }).select().single();
    if (error) { setErrorMsg(error.message); return null; }
    setProducts((prev) => [...prev, data]);
    return data;
  };

  // ---- Compras (registrar suma stock; eliminar lo resta de vuelta) ----
  const createPurchase = async (payload, items) => {
    setSaving(true);
    const { data: purchase, error: purchaseError } = await supabase.from("purchases").insert({ ...payload, company_id: companyId }).select().single();
    if (purchaseError) { setSaving(false); setErrorMsg(purchaseError.message); return; }

    const itemRows = items.map((it) => ({
      purchase_id: purchase.id,
      product_id: it.product_id,
      quantity: Number(it.quantity),
      unit_cost: Number(it.unit_cost),
      subtotal: Number(it.quantity) * Number(it.unit_cost),
      chapter: it.chapter?.trim() || null,
    }));
    const { error: itemsError } = await supabase.from("purchase_items").insert(itemRows);
    if (itemsError) { setSaving(false); setErrorMsg(itemsError.message); return; }

    for (const row of itemRows) {
      const prod = products.find((p) => p.id === row.product_id);
      if (!prod) continue;
      if ((prod.item_type || "producto") === "servicio") {
        await supabase.from("products").update({ cost_price: row.unit_cost }).eq("id", prod.id);
        continue;
      }
      const newStock = Number(prod.stock_qty) + row.quantity;
      await supabase.from("products").update({ stock_qty: newStock, cost_price: row.unit_cost }).eq("id", prod.id);
    }

    setSaving(false);
    setShowAddSupplier(false);
    setShowAddPurchase(false);
    loadAll();
  };

  const deletePurchase = async (purchase) => {
    if (!window.confirm("¿Eliminar esta compra? Se restará la cantidad comprada del inventario.")) return;
    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id);
    for (const it of items || []) {
      const prod = products.find((p) => p.id === it.product_id);
      if (!prod) continue;
      const newStock = Math.max(0, Number(prod.stock_qty) - Number(it.quantity));
      await supabase.from("products").update({ stock_qty: newStock }).eq("id", prod.id);
    }
    const { error } = await supabase.from("purchases").delete().eq("id", purchase.id);
    if (error) { setErrorMsg(error.message); return; }
    loadAll();
  };

  const openPurchaseDetail = async (purchase) => {
    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id);
    const withNames = (items || []).map((it) => ({ ...it, productName: products.find((p) => p.id === it.product_id)?.name || "Producto eliminado" }));
    const { data: pays } = await supabase.from("purchase_payments").select("*").eq("purchase_id", purchase.id).order("payment_date");
    setPurchaseDetail({ purchase, items: withNames, payments: pays || [] });
  };

  const registerPurchasePayment = async (purchase, payload) => {
    setSaving(true);
    const { error: payError } = await supabase.from("purchase_payments").insert({ ...payload, purchase_id: purchase.id });
    if (payError) { setSaving(false); setErrorMsg(payError.message); return; }

    const { data: allPayments } = await supabase.from("purchase_payments").select("*").eq("purchase_id", purchase.id).order("payment_date");
    const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount), 0);
    const payment_status = totalPaid <= 0 ? "pendiente" : totalPaid >= Number(purchase.total) ? "pagada" : "parcial";
    const { data: updated, error: updError } = await supabase.from("purchases").update({ amount_paid: totalPaid, payment_status }).eq("id", purchase.id).select().single();
    setSaving(false);
    if (updError) { setErrorMsg(updError.message); return; }
    setPurchases((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setPurchaseDetail((prev) => (prev ? { ...prev, purchase: updated, payments: allPayments || [] } : prev));
  };

  const deletePurchasePayment = async (payment, purchase) => {
    if (!window.confirm("¿Eliminar este pago registrado?")) return;
    const { error: delError } = await supabase.from("purchase_payments").delete().eq("id", payment.id);
    if (delError) { setErrorMsg(delError.message); return; }

    const { data: allPayments } = await supabase.from("purchase_payments").select("*").eq("purchase_id", purchase.id).order("payment_date");
    const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount), 0);
    const payment_status = totalPaid <= 0 ? "pendiente" : totalPaid >= Number(purchase.total) ? "pagada" : "parcial";
    const { data: updated, error: updError } = await supabase.from("purchases").update({ amount_paid: totalPaid, payment_status }).eq("id", purchase.id).select().single();
    if (updError) { setErrorMsg(updError.message); return; }
    setPurchases((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setPurchaseDetail((prev) => (prev ? { ...prev, purchase: updated, payments: allPayments || [] } : prev));
  };

  // ---- Secuencias NCF ----
  // ---- Checklists por tipo de equipo ----
  const saveChecklistTemplate = async (payload, itemTexts) => {
    setSaving(true);
    if (editingChecklist) {
      const { error: updError } = await supabase.from("checklist_templates").update(payload).eq("id", editingChecklist.id);
      if (updError) { setSaving(false); setErrorMsg(updError.message); return; }
      const existingCount = (editingChecklist.items || []).length;
      const { data: deletedItems, error: delError } = await supabase.from("checklist_template_items").delete().eq("template_id", editingChecklist.id).select();
      if (delError) { setSaving(false); setErrorMsg(delError.message); return; }
      if (existingCount > 0 && (!deletedItems || deletedItems.length === 0)) {
        setSaving(false);
        setErrorMsg("No se pudieron borrar los puntos anteriores de este checklist (probablemente falta un permiso DELETE en checklist_template_items). No se guardaron los cambios para evitar duplicados.");
        return;
      }
      const rows = itemTexts.map((it, i) => ({ template_id: editingChecklist.id, text: it.text, section: it.section || null, position: i }));
      const { error: insError } = await supabase.from("checklist_template_items").insert(rows);
      if (insError) { setSaving(false); setErrorMsg(insError.message); return; }
      setSaving(false);
      setEditingChecklist(null);
      loadAll();
    } else {
      const { data: tpl, error: tplError } = await supabase.from("checklist_templates").insert({ ...payload, company_id: companyId }).select().single();
      if (tplError) { setSaving(false); setErrorMsg(tplError.message); return; }
      const rows = itemTexts.map((it, i) => ({ template_id: tpl.id, text: it.text, section: it.section || null, position: i }));
      await supabase.from("checklist_template_items").insert(rows);
      setSaving(false);
      setShowAddChecklist(false);
      loadAll();
    }
  };

  const deleteChecklistTemplate = async (id) => {
    if (!window.confirm("¿Eliminar este checklist? No afecta las órdenes que ya lo cargaron.")) return;
    const { data, error } = await supabase.from("checklist_templates").delete().eq("id", id).select();
    if (error) { setErrorMsg(error.message); return; }
    if (!data || data.length === 0) {
      setErrorMsg("No se pudo eliminar el checklist: la base de datos no eliminó ningún registro (probablemente falta un permiso DELETE en checklist_templates).");
      return;
    }
    setChecklistTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const downloadChecklistsExcel = (templates) => {
    const rows = [];
    templates.forEach((tpl) => {
      const items = (tpl.items || []).slice().sort((a, b) => a.position - b.position);
      if (items.length === 0) {
        rows.push({ "Tipo de equipo": tpl.equipment_type, "Nombre del checklist": tpl.name, "Tema": "", "Punto a revisar": "" });
      } else {
        items.forEach((it) => {
          rows.push({ "Tipo de equipo": tpl.equipment_type, "Nombre del checklist": tpl.name, "Tema": it.section || "", "Punto a revisar": it.text });
        });
      }
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 28 }, { wch: 34 }, { wch: 28 }, { wch: 55 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checklists");
    XLSX.writeFile(wb, templates.length === checklistTemplates.length ? "checklists-mantenpro.xlsx" : "checklists-seleccion.xlsx");
  };

  const importChecklistsFromExcel = async (file) => {
    setImportingChecklists(true);
    setErrorMsg("");
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const groups = [];
      const groupIndex = new Map();
      rows.forEach((row) => {
        const equipmentType = String(row["Tipo de equipo"] || "").trim();
        const name = String(row["Nombre del checklist"] || "").trim();
        const section = String(row["Tema"] || "").trim();
        const text = String(row["Punto a revisar"] || "").trim();
        if (!equipmentType || !name || !text) return;
        const key = equipmentType.toLowerCase() + "||" + name.toLowerCase();
        if (!groupIndex.has(key)) {
          groupIndex.set(key, groups.length);
          groups.push({ equipmentType, name, items: [] });
        }
        groups[groupIndex.get(key)].items.push({ text, section });
      });

      if (groups.length === 0) {
        setErrorMsg("El Excel no tiene filas válidas. Debe tener las columnas 'Tipo de equipo', 'Nombre del checklist' y 'Punto a revisar' (y opcionalmente 'Tema').");
        return;
      }

      let created = 0, updated = 0;
      for (const g of groups) {
        const existing = checklistTemplates.find(
          (t) => t.equipment_type.trim().toLowerCase() === g.equipmentType.toLowerCase() && t.name.trim().toLowerCase() === g.name.toLowerCase()
        );
        if (existing) {
          await supabase.from("checklist_templates").update({ equipment_type: g.equipmentType, name: g.name }).eq("id", existing.id);
          await supabase.from("checklist_template_items").delete().eq("template_id", existing.id);
          const itemRows = g.items.map((it, i) => ({ template_id: existing.id, text: it.text, section: it.section || null, position: i }));
          await supabase.from("checklist_template_items").insert(itemRows);
          updated++;
        } else {
          const { data: tpl, error: tplError } = await supabase.from("checklist_templates").insert({ equipment_type: g.equipmentType, name: g.name, company_id: companyId }).select().single();
          if (tplError) { setErrorMsg(tplError.message); continue; }
          const itemRows = g.items.map((it, i) => ({ template_id: tpl.id, text: it.text, section: it.section || null, position: i }));
          await supabase.from("checklist_template_items").insert(itemRows);
          created++;
        }
      }
      await loadAll();
      window.alert(`Importación completa: ${created} checklist${created !== 1 ? "s" : ""} nuevo${created !== 1 ? "s" : ""}, ${updated} actualizado${updated !== 1 ? "s" : ""}.`);
    } catch (err) {
      setErrorMsg("No se pudo leer el Excel: " + err.message);
    } finally {
      setImportingChecklists(false);
    }
  };

  const saveNcfSequence = async (payload) => {
    setSaving(true);
    if (editingNcf) {
      const { data, error } = await supabase.from("ncf_sequences").update({ range_end: payload.range_end, expiration_date: payload.expiration_date }).eq("id", editingNcf.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setNcfSequences((prev) => prev.map((n) => (n.id === data.id ? data : n)));
      setEditingNcf(null);
    } else {
      const { data, error } = await supabase.from("ncf_sequences").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setNcfSequences((prev) => [...prev, data]);
      setShowAddNcf(false);
    }
  };

  const toggleNcfActive = async (seq) => {
    const { data, error } = await supabase.from("ncf_sequences").update({ active: !seq.active }).eq("id", seq.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setNcfSequences((prev) => prev.map((n) => (n.id === data.id ? data : n)));
  };

  const deleteNcfSequence = async (id) => {
    if (!window.confirm("¿Eliminar esta secuencia NCF? Solo hazlo si no se ha usado ningún número todavía.")) return;
    const { error } = await supabase.from("ncf_sequences").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setNcfSequences((prev) => prev.filter((n) => n.id !== id));
  };

  // ---- Facturación ----
  const createInvoice = async (payload, items) => {
    setSaving(true);
    const { data: freshSeq, error: seqError } = await supabase.from("ncf_sequences").select("*").eq("id", payload.ncf_sequence_id).single();
    if (seqError || !freshSeq || freshSeq.next_number > freshSeq.range_end) {
      setSaving(false);
      setErrorMsg("Esta secuencia NCF ya no tiene números disponibles.");
      return;
    }
    const ncf = `${freshSeq.prefix}${String(freshSeq.next_number).padStart(8, "0")}`;
    // Número de factura interno, propio de MantenPro — distinto del NCF (que es el
    // comprobante fiscal que exige la DGII). Sirve como referencia interna/para el
    // cliente sin depender del formato ni de la disponibilidad del NCF.
    const invoice_number = `FAC-${String(invoices.length + 1).padStart(5, "0")}`;

    const { data: invoice, error: invError } = await supabase.from("invoices").insert({ ...payload, company_id: companyId, ncf, invoice_number, status: "emitida" }).select().single();
    if (invError) { setSaving(false); setErrorMsg(invError.message); return; }

    const itemRows = items.map((it) => ({
      invoice_id: invoice.id,
      product_id: it.product_id || null,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      is_taxable: it.is_taxable,
      subtotal: Number(it.quantity) * Number(it.unit_price),
      chapter: it.chapter?.trim() || null,
    }));
    const { error: itemsError } = await supabase.from("invoice_items").insert(itemRows);
    if (itemsError) { setSaving(false); setErrorMsg(itemsError.message); return; }

    await supabase.from("ncf_sequences").update({ next_number: freshSeq.next_number + 1 }).eq("id", freshSeq.id);

    const assetRows = items.filter((it) => it.register_asset).map((it) => ({
      company_id: companyId,
      client_id: payload.client_id,
      name: it.description,
      serial_number: (it.asset_serial || "").trim() || null,
      install_date: payload.invoice_date,
      warranty_months: Number(it.asset_warranty_months) || 0,
      notes: `Generado desde factura ${ncf}`,
    }));
    if (assetRows.length > 0) {
      const { error: assetError } = await supabase.from("client_assets").insert(assetRows);
      if (assetError) setErrorMsg(`La factura se emitió, pero no se pudieron registrar todos los activos en garantía: ${assetError.message}`);
    }

    if (invoicePrefill?.sourceOrderId) {
      const { data: updatedOrder, error: orderUpdateError } = await supabase.from("sales_orders").update({ status: "facturada", invoice_id: invoice.id }).eq("id", invoicePrefill.sourceOrderId).select().single();
      if (orderUpdateError) {
        setErrorMsg(`La factura se creó, pero no se pudo marcar la orden de venta como facturada: ${orderUpdateError.message}`);
      } else if (updatedOrder) {
        setSalesOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
      }
    }

    for (const row of itemRows) {
      if (!row.product_id) continue;
      const prod = products.find((p) => p.id === row.product_id);
      if (!prod) continue;
      if (prod.is_composite) {
        // Producto compuesto (kit): no tiene stock propio — se descuenta cada
        // componente por separado, multiplicado por la cantidad vendida del kit.
        const parts = productComponents.filter((c) => c.parent_product_id === prod.id);
        for (const part of parts) {
          const compProd = products.find((p) => p.id === part.component_product_id);
          if (!compProd) continue;
          const newCompStock = Math.max(0, Number(compProd.stock_qty) - Number(part.quantity) * row.quantity);
          await supabase.from("products").update({ stock_qty: newCompStock }).eq("id", compProd.id);
        }
        continue;
      }
      const newStock = Math.max(0, Number(prod.stock_qty) - row.quantity);
      await supabase.from("products").update({ stock_qty: newStock }).eq("id", prod.id);
    }

    setSaving(false);
    setInvoicePrefill(null);
    setShowAddInvoice(false);
    loadAll();
  };

  // ---- Contratos recurrentes ----
  const saveRecurringContract = async (payload) => {
    setSaving(true);
    if (editingContract) {
      const { data, error } = await supabase.from("recurring_contracts").update(payload).eq("id", editingContract.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setRecurringContracts((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      setEditingContract(null);
    } else {
      const { data, error } = await supabase.from("recurring_contracts").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setRecurringContracts((prev) => [...prev, data]);
      setShowAddContract(false);
    }
  };
  const deleteRecurringContract = async (id) => {
    if (!window.confirm("¿Eliminar este contrato recurrente? Esto no afecta las facturas ya generadas.")) return;
    const { error } = await supabase.from("recurring_contracts").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setRecurringContracts((prev) => prev.filter((c) => c.id !== id));
  };
  const generateContractInvoice = async (contract) => {
    if (contract.end_date && contract.end_date < todayStr) {
      setErrorMsg(`El contrato "${contract.title}" venció el ${fmtDate(contract.end_date)} y ya no genera facturas.`);
      return false;
    }
    if (!contract.ncf_sequence_id) {
      setErrorMsg(`El contrato "${contract.title}" no tiene una secuencia NCF asignada. Edítalo primero para indicarla.`);
      return false;
    }
    const subtotal = Number(contract.amount);
    const itbis = contract.is_taxable ? subtotal * 0.18 : 0;
    const payload = {
      title: contract.title,
      client_id: contract.client_id,
      ncf_sequence_id: contract.ncf_sequence_id,
      branch_id: contract.branch_id || null,
      invoice_date: todayStr,
      discount_pct: 0,
      subtotal,
      itbis,
      exempt_itbis: !contract.is_taxable,
      applies_norma_0205: false,
      itbis_retained: false,
      total: subtotal + itbis,
    };
    const items = [{ product_id: null, description: contract.description || contract.title, quantity: 1, unit_price: subtotal, is_taxable: contract.is_taxable, chapter: null }];
    await createInvoice(payload, items);
    const nextDate = new Date(`${todayStr}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + Number(contract.frequency_days));
    const { data: updated, error: updError } = await supabase.from("recurring_contracts").update({ next_invoice_date: nextDate.toISOString().slice(0, 10) }).eq("id", contract.id).select().single();
    if (!updError && updated) setRecurringContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    return true;
  };
  const generateOneContractInvoice = async (contract) => {
    setSaving(true);
    await generateContractInvoice(contract);
    setSaving(false);
  };
  const generateAllDueContracts = async () => {
    setSaving(true);
    for (const c of dueContracts) await generateContractInvoice(c);
    setSaving(false);
  };

  // ---- Conciliación bancaria ----
  const importBankStatement = async (file) => {
    setImportingBankStatement(true);
    setErrorMsg("");
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const pick = (row, names) => { for (const n of names) if (row[n] !== undefined && row[n] !== "") return row[n]; return ""; };
      const parseDate = (v) => {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; }
        const s = String(v).trim();
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
        return s.slice(0, 10);
      };
      const parsedRows = rows.map((row) => {
        const dateVal = pick(row, ["Fecha", "Date", "fecha"]);
        const desc = pick(row, ["Descripción", "Descripcion", "Description", "Concepto", "descripcion"]);
        let amount = pick(row, ["Monto", "Amount", "monto"]);
        if (amount === "") {
          const credit = Number(pick(row, ["Crédito", "Credito", "Credit", "Depósito", "Deposito"])) || 0;
          const debit = Number(pick(row, ["Débito", "Debito", "Debit", "Retiro"])) || 0;
          amount = credit - debit;
        }
        return { transaction_date: parseDate(dateVal), description: String(desc || "").trim() || null, amount: Number(amount) || 0 };
      }).filter((r) => r.transaction_date && r.amount !== 0);

      if (parsedRows.length === 0) {
        setErrorMsg("No se encontraron filas válidas. El archivo debe tener columnas de Fecha, Descripción y Monto (o Crédito/Débito por separado).");
        return;
      }
      const { data, error } = await supabase.from("bank_transactions").insert(parsedRows.map((r) => ({ ...r, company_id: companyId }))).select();
      if (error) { setErrorMsg(error.message); return; }
      setBankTransactions((prev) => [...(data || []), ...prev]);
    } catch (err) {
      setErrorMsg("No se pudo leer el archivo: " + err.message);
    } finally {
      setImportingBankStatement(false);
    }
  };

  const bankMatchCandidate = (tx) => {
    const txDate = new Date(`${tx.transaction_date}T00:00:00`).getTime();
    const withinDays = (dateStr, days) => Math.abs(new Date(dateStr).getTime() - txDate) <= days * 86400000;
    const closeAmount = (a, b) => Math.abs(Number(a) - Number(b)) < 1;
    if (tx.amount > 0) {
      const candidates = invoicePaymentsAll.filter((p) => closeAmount(p.amount, tx.amount) && withinDays(p.payment_date, BANK_MATCH_WINDOW_DAYS));
      if (candidates.length === 0) return null;
      const inv = (id) => invoices.find((i) => i.id === id);
      const best = candidates.sort((a, b) => Math.abs(new Date(a.payment_date) - txDate) - Math.abs(new Date(b.payment_date) - txDate))[0];
      return { type: "invoice_payment", id: best.id, label: `Cobro factura ${inv(best.invoice_id)?.ncf || ""} — ${fmtMoney(best.amount)}` };
    } else {
      const absAmt = Math.abs(tx.amount);
      const ppCandidates = purchasePaymentsAll.filter((p) => closeAmount(p.amount, absAmt) && withinDays(p.payment_date, BANK_MATCH_WINDOW_DAYS));
      if (ppCandidates.length > 0) {
        const sup = (purchaseId) => { const pu = purchases.find((x) => x.id === purchaseId); return suppliers.find((s) => s.id === pu?.supplier_id)?.name || ""; };
        const best = ppCandidates.sort((a, b) => Math.abs(new Date(a.payment_date) - txDate) - Math.abs(new Date(b.payment_date) - txDate))[0];
        return { type: "purchase_payment", id: best.id, label: `Pago a ${sup(best.purchase_id)} — ${fmtMoney(best.amount)}` };
      }
      const expCandidates = otherExpenses.filter((e) => closeAmount(e.amount, absAmt) && withinDays(e.expense_date, BANK_MATCH_WINDOW_DAYS));
      if (expCandidates.length > 0) {
        const best = expCandidates.sort((a, b) => Math.abs(new Date(a.expense_date) - txDate) - Math.abs(new Date(b.expense_date) - txDate))[0];
        return { type: "other_expense", id: best.id, label: `Gasto: ${best.description} — ${fmtMoney(best.amount)}` };
      }
      return null;
    }
  };

  const reconcileTransaction = async (tx, matchedType, matchedId) => {
    const { data, error } = await supabase.from("bank_transactions").update({ is_reconciled: true, matched_type: matchedType, matched_id: matchedId }).eq("id", tx.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setBankTransactions((prev) => prev.map((t) => (t.id === data.id ? data : t)));
  };
  const unreconcileTransaction = async (tx) => {
    const { data, error } = await supabase.from("bank_transactions").update({ is_reconciled: false, matched_type: null, matched_id: null }).eq("id", tx.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setBankTransactions((prev) => prev.map((t) => (t.id === data.id ? data : t)));
  };
  const deleteBankTransaction = async (id) => {
    if (!window.confirm("¿Eliminar esta transacción bancaria importada?")) return;
    const { error } = await supabase.from("bank_transactions").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setBankTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const voidInvoice = async (invoice) => {
    if (!window.confirm("¿Anular esta factura? El número de NCF queda consumido igual, pero se restaurará el inventario.")) return;
    const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id);
    for (const it of items || []) {
      if (!it.product_id) continue;
      const prod = products.find((p) => p.id === it.product_id);
      if (!prod) continue;
      if (prod.is_composite) {
        const parts = productComponents.filter((c) => c.parent_product_id === prod.id);
        for (const part of parts) {
          const compProd = products.find((p) => p.id === part.component_product_id);
          if (!compProd) continue;
          await supabase.from("products").update({ stock_qty: Number(compProd.stock_qty) + Number(part.quantity) * Number(it.quantity) }).eq("id", compProd.id);
        }
        continue;
      }
      await supabase.from("products").update({ stock_qty: Number(prod.stock_qty) + Number(it.quantity) }).eq("id", prod.id);
    }
    const { error } = await supabase.from("invoices").update({ status: "anulada" }).eq("id", invoice.id);
    if (error) { setErrorMsg(error.message); return; }
    setInvoiceDetail(null);
    loadAll();
  };

  // Junta los comprobantes (invoice_payment_attachments) a cada pago, agrupados por payment_id
  const attachPaymentAttachments = async (paymentsList) => {
    if (!paymentsList || paymentsList.length === 0) return paymentsList || [];
    const { data: atts, error } = await supabase.from("invoice_payment_attachments").select("*").in("payment_id", paymentsList.map((p) => p.id)).order("uploaded_at");
    if (error) { setErrorMsg(error.message); return paymentsList; }
    const byPayment = new Map();
    (atts || []).forEach((a) => {
      if (!byPayment.has(a.payment_id)) byPayment.set(a.payment_id, []);
      byPayment.get(a.payment_id).push(a);
    });
    return paymentsList.map((p) => ({ ...p, attachments: byPayment.get(p.id) || [] }));
  };

  const openInvoiceDetail = async (invoice) => {
    const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id);
    const { data: payments } = await supabase.from("invoice_payments").select("*").eq("invoice_id", invoice.id).order("payment_date");
    const paymentsWithAttachments = await attachPaymentAttachments(payments || []);
    setInvoiceDetail({ invoice, items: items || [], payments: paymentsWithAttachments });
  };

  // ---- Notas de crédito ----
  const createCreditNote = async (payload, items) => {
    setSaving(true);
    const { data: freshSeq, error: seqError } = await supabase.from("ncf_sequences").select("*").eq("id", payload.ncf_sequence_id).single();
    if (seqError || !freshSeq || freshSeq.next_number > freshSeq.range_end) {
      setSaving(false);
      setErrorMsg("Esta secuencia NCF ya no tiene números disponibles.");
      return;
    }
    const ncf = `${freshSeq.prefix}${String(freshSeq.next_number).padStart(8, "0")}`;

    const { data: note, error: noteError } = await supabase.from("credit_notes").insert({ ...payload, company_id: companyId, ncf, status: "emitida" }).select().single();
    if (noteError) { setSaving(false); setErrorMsg(noteError.message); return; }

    const itemRows = items.map((it) => ({
      credit_note_id: note.id,
      product_id: it.product_id || null,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      is_taxable: it.is_taxable,
      subtotal: Number(it.quantity) * Number(it.unit_price),
    }));
    const { error: itemsError } = await supabase.from("credit_note_items").insert(itemRows);
    if (itemsError) { setSaving(false); setErrorMsg(itemsError.message); return; }

    await supabase.from("ncf_sequences").update({ next_number: freshSeq.next_number + 1 }).eq("id", freshSeq.id);

    const targetInvoice = invoices.find((i) => i.id === payload.invoice_id);
    if (targetInvoice) {
      const newCreditApplied = Number(targetInvoice.credit_applied || 0) + payload.total;
      const settled = Number(targetInvoice.amount_paid || 0) + newCreditApplied;
      const payment_status = settled <= 0 ? "pendiente" : settled >= Number(targetInvoice.total) ? "cobrada" : "parcial";
      const { data: updatedInvoice } = await supabase.from("invoices").update({ credit_applied: newCreditApplied, payment_status }).eq("id", targetInvoice.id).select().single();
      if (updatedInvoice) setInvoices((prev) => prev.map((i) => (i.id === updatedInvoice.id ? updatedInvoice : i)));
    }

    setSaving(false);
    setShowAddCreditNote(false);
    loadAll();
  };

  const openCreditNoteDetail = async (note) => {
    const { data: items } = await supabase.from("credit_note_items").select("*").eq("credit_note_id", note.id);
    setCreditNoteDetail({ note, items: items || [] });
  };

  const registerPayment = async (invoice, payload, files) => {
    setSaving(true);
    let cashSessionId = null;
    if (invoice.branch_id) {
      const { data: openSession } = await supabase.from("cash_sessions").select("id").eq("branch_id", invoice.branch_id).eq("status", "abierta").maybeSingle();
      cashSessionId = openSession?.id || null;
    }
    const { data: newPayment, error: payError } = await supabase.from("invoice_payments").insert({ ...payload, invoice_id: invoice.id, cash_session_id: cashSessionId }).select().single();
    if (payError) { setSaving(false); setErrorMsg(payError.message); return; }

    if (files && files.length > 0) {
      for (const file of files) {
        const ext = file.name.split(".").pop();
        const path = `payments/${companyId}/${newPayment.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upError } = await supabase.storage.from("evidence").upload(path, file);
        if (upError) { setErrorMsg(`No se pudo subir ${file.name}: ${upError.message}`); continue; }
        const { data: pub } = supabase.storage.from("evidence").getPublicUrl(path);
        const { error: attError } = await supabase.from("invoice_payment_attachments").insert({ payment_id: newPayment.id, file_url: pub.publicUrl, file_name: file.name });
        if (attError) setErrorMsg(`Se subió ${file.name} pero no se pudo vincular al pago: ${attError.message}`);
      }
    }

    const { data: allPayments } = await supabase.from("invoice_payments").select("*").eq("invoice_id", invoice.id).order("payment_date");
    const paymentsWithAttachments = await attachPaymentAttachments(allPayments || []);
    const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount), 0);
    const payment_status = totalPaid <= 0 ? "pendiente" : totalPaid >= Number(invoice.total) ? "cobrada" : "parcial";
    const { data: updated, error: updError } = await supabase.from("invoices").update({ amount_paid: totalPaid, payment_status }).eq("id", invoice.id).select().single();
    setSaving(false);
    if (updError) { setErrorMsg(updError.message); return; }
    setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setInvoiceDetail((prev) => (prev ? { ...prev, invoice: updated, payments: paymentsWithAttachments } : prev));
  };

  const deletePayment = async (payment, invoice) => {
    if (!window.confirm("¿Eliminar este pago registrado? También se quitarán sus comprobantes.")) return;
    const { error: delError } = await supabase.from("invoice_payments").delete().eq("id", payment.id);
    if (delError) { setErrorMsg(delError.message); return; }

    const { data: allPayments } = await supabase.from("invoice_payments").select("*").eq("invoice_id", invoice.id).order("payment_date");
    const paymentsWithAttachments = await attachPaymentAttachments(allPayments || []);
    const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount), 0);
    const payment_status = totalPaid <= 0 ? "pendiente" : totalPaid >= Number(invoice.total) ? "cobrada" : "parcial";
    const { data: updated, error: updError } = await supabase.from("invoices").update({ amount_paid: totalPaid, payment_status }).eq("id", invoice.id).select().single();
    if (updError) { setErrorMsg(updError.message); return; }
    setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setInvoiceDetail((prev) => (prev ? { ...prev, invoice: updated, payments: paymentsWithAttachments } : prev));
  };

  const deletePaymentAttachment = async (attachment, payment) => {
    if (!window.confirm(`¿Quitar "${attachment.file_name || "este comprobante"}" del pago?`)) return;
    const { data, error } = await supabase.from("invoice_payment_attachments").delete().eq("id", attachment.id).select();
    if (error) { setErrorMsg(error.message); return; }
    if (!data || data.length === 0) {
      setErrorMsg("No se pudo quitar el comprobante: la base de datos no eliminó ningún registro (probablemente falta un permiso DELETE en invoice_payment_attachments).");
      return;
    }
    setInvoiceDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        payments: prev.payments.map((p) => (p.id === payment.id ? { ...p, attachments: (p.attachments || []).filter((a) => a.id !== attachment.id) } : p)),
      };
    });
  };

  // ---- Caja (apertura/cierre y cuadre por sucursal) ----
  const openCashSession = async (branchId, openingAmount) => {
    setSaving(true);
    const { data, error } = await supabase.from("cash_sessions").insert({ company_id: companyId, branch_id: branchId, opened_by: profile.id, opening_amount: openingAmount, status: "abierta" }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setCashSessions((prev) => [data, ...prev]);
    setShowOpenCaja(false);
  };

  const closeCashSession = async (session, declared) => {
    setSaving(true);
    const { data: pays } = await supabase.from("invoice_payments").select("amount, method").eq("cash_session_id", session.id);
    const sums = {};
    (pays || []).forEach((p) => { sums[p.method] = (sums[p.method] || 0) + Number(p.amount); });
    const expected_cash = Number(session.opening_amount) + (sums["Efectivo"] || 0);
    const expected_card = sums["Tarjeta"] || 0;
    const expected_transfer = (sums["Transferencia"] || 0) + (sums["Otro"] || 0);
    const payload = {
      status: "cerrada", closed_by: profile.id, closed_at: new Date().toISOString(),
      expected_cash, expected_card, expected_transfer,
      declared_cash: declared.cash, declared_card: declared.card, declared_transfer: declared.transfer,
      notes: declared.notes || null,
    };
    const { data, error } = await supabase.from("cash_sessions").update(payload).eq("id", session.id).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setCashSessions((prev) => prev.map((s) => (s.id === data.id ? data : s)));
    setShowCloseCaja(false);
  };

  useEffect(() => {
    if (view !== "caja") return;
    const activeBranchId = isVendedor ? profile.branch_id : (cajaBranch || branches[0]?.id);
    const openSession = cashSessions.find((s) => s.branch_id === activeBranchId && s.status === "abierta");
    if (!openSession) { setSessionPayments([]); return; }
    (async () => {
      const { data } = await supabase.from("invoice_payments").select("amount, method, payment_date").eq("cash_session_id", openSession.id).order("payment_date", { ascending: false });
      setSessionPayments(data || []);
    })();
  }, [view, cajaBranch, cashSessions, branches, isVendedor, profile.branch_id]);

  // ---- Cotizaciones ----
  const createQuote = async (payload, items, linkedIncidentId) => {
    setSaving(true);
    const quote_number = `COT-${String(quotes.length + 1).padStart(4, "0")}`;
    const { data: quote, error: quoteError } = await supabase.from("quotes").insert({ ...payload, company_id: companyId, quote_number, status: "pendiente" }).select().single();
    if (quoteError) { setSaving(false); setErrorMsg(quoteError.message); return; }

    const itemRows = items.map((it) => ({
      quote_id: quote.id,
      product_id: it.product_id || null,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      is_taxable: it.is_taxable,
      subtotal: Number(it.quantity) * Number(it.unit_price),
      chapter: it.chapter?.trim() || null,
    }));
    const { error: itemsError } = await supabase.from("quote_items").insert(itemRows);
    setSaving(false);
    if (itemsError) { setErrorMsg(itemsError.message); return; }
    setShowAddQuote(false);
    setQuotePrefill(null);
    if (linkedIncidentId) {
      await supabase.from("incidents").update({ quote_id: quote.id, status: "convertido" }).eq("id", linkedIncidentId);
    }
    loadAll();
  };

  const markQuoteStatus = async (quote, status) => {
    const { data, error } = await supabase.from("quotes").update({ status }).eq("id", quote.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setQuotes((prev) => prev.map((q) => (q.id === data.id ? data : q)));
    setQuoteDetail((prev) => (prev ? { ...prev, quote: data } : prev));
  };

  const deleteQuote = async (quote) => {
    if (!window.confirm(`¿Eliminar definitivamente la cotización ${quote.quote_number || ""}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("quotes").delete().eq("id", quote.id);
    if (error) { setErrorMsg(error.message); return; }
    setQuotes((prev) => prev.filter((q) => q.id !== quote.id));
    setQuoteDetail(null);
  };

  // ---- Órdenes comerciales (cotización aprobada -> orden -> factura) ----
  const convertQuoteToOrder = async (quote, items) => {
    setSaving(true);
    const { data: existing } = await supabase.from("sales_orders").select("id").eq("quote_id", quote.id).neq("status", "cancelada");
    if (existing && existing.length > 0) {
      setSaving(false);
      setErrorMsg("Esta cotización ya tiene una orden de venta activa.");
      setQuoteDetail(null);
      loadAll();
      return;
    }
    const order_number = `ORD-${String(salesOrders.length + 1).padStart(4, "0")}`;
    const { data: order, error: orderError } = await supabase.from("sales_orders").insert({
      company_id: companyId, client_id: quote.client_id, quote_id: quote.id, order_number,
      title: quote.title, subtotal: quote.subtotal, itbis: quote.itbis, total: quote.total, status: "en_proceso", notes: quote.notes || null,
    }).select().single();
    if (orderError) { setSaving(false); setErrorMsg(orderError.message); return; }

    const itemRows = items.map((it) => ({
      sales_order_id: order.id,
      product_id: it.product_id || null,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      is_taxable: it.is_taxable,
      subtotal: Number(it.quantity) * Number(it.unit_price),
      chapter: it.chapter || null,
    }));
    const { error: itemsError } = await supabase.from("sales_order_items").insert(itemRows);
    if (itemsError) { setSaving(false); setErrorMsg(itemsError.message); return; }

    await supabase.from("quotes").update({ status: "en_orden" }).eq("id", quote.id);
    setSaving(false);
    setQuoteDetail(null);
    loadAll();
  };

  const openSalesOrderDetail = async (order) => {
    const { data: items } = await supabase.from("sales_order_items").select("*").eq("sales_order_id", order.id);
    setSalesOrderDetail({ order, items: items || [] });
  };

  const convertSalesOrderToWorkOrder = (order) => {
    setOrderFromSalesOrder({ salesOrderId: order.id, title: order.title || `Trabajo — ${order.order_number}`, branch_id: "", equipment_id: "" });
    setSalesOrderDetail(null);
  };

  const generateInvoiceFromOrder = (order, items) => {
    setInvoicePrefill({
      client_id: order.client_id,
      sourceOrderId: order.id,
      title: order.title,
      notes: order.notes || "",
      items: items.map((it) => ({ product_id: it.product_id || "", description: it.description, quantity: it.quantity, unit_price: it.unit_price, is_taxable: it.is_taxable, chapter: it.chapter || "" })),
    });
    setSalesOrderDetail(null);
    setShowAddInvoice(true);
  };

  const updateSalesOrderNotes = async (order, notes) => {
    const { data, error } = await supabase.from("sales_orders").update({ notes: notes.trim() || null }).eq("id", order.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setSalesOrderDetail((prev) => (prev ? { ...prev, order: data } : prev));
  };

  const cancelSalesOrder = async (order) => {
    if (!window.confirm("¿Cancelar esta orden de venta? Si viene de una cotización, esa cotización volverá a quedar editable.")) return;
    const { data, error } = await supabase.from("sales_orders").update({ status: "cancelada" }).eq("id", order.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setSalesOrderDetail(null);
    if (order.quote_id) {
      await supabase.rpc("revert_quote_on_order_cancel", { order_id_param: order.id });
      const { data: revertedQuote } = await supabase.from("quotes").select("*").eq("id", order.quote_id).single();
      if (revertedQuote) setQuotes((prev) => prev.map((q) => (q.id === revertedQuote.id ? revertedQuote : q)));
    }
  };

  const deleteSalesOrder = async (order) => {
    if (!window.confirm("¿Eliminar definitivamente esta orden de venta cancelada?")) return;
    const { error } = await supabase.from("sales_orders").delete().eq("id", order.id);
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.filter((o) => o.id !== order.id));
    setSalesOrderDetail(null);
  };

  const deleteSalesOrdersBulk = async (ids) => {
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar definitivamente ${ids.length} orden${ids.length !== 1 ? "es" : ""} de venta cancelada${ids.length !== 1 ? "s" : ""}?`)) return;
    const { error } = await supabase.from("sales_orders").delete().in("id", ids);
    if (error) { setErrorMsg(error.message); return; }
    setSalesOrders((prev) => prev.filter((o) => !ids.includes(o.id)));
    setSelectedSalesOrders(new Set());
  };

  const openQuoteDetail = async (quote) => {
    const { data: items } = await supabase.from("quote_items").select("*").eq("quote_id", quote.id);
    setQuoteDetail({ quote, items: items || [] });
  };

  const openEditQuote = (quote, items) => {
    setEditingQuote(quote);
    setEditingQuoteItems(items);
    setQuoteDetail(null);
  };

  const updateQuote = async (payload, items) => {
    setSaving(true);
    const { error: delError } = await supabase.from("quote_items").delete().eq("quote_id", editingQuote.id);
    if (delError) { setSaving(false); setErrorMsg(delError.message); return; }

    const itemRows = items.map((it) => ({
      quote_id: editingQuote.id,
      product_id: it.product_id || null,
      description: it.description,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      is_taxable: it.is_taxable,
      subtotal: Number(it.quantity) * Number(it.unit_price),
      chapter: it.chapter?.trim() || null,
    }));
    const { error: itemsError } = await supabase.from("quote_items").insert(itemRows);
    if (itemsError) { setSaving(false); setErrorMsg(itemsError.message); return; }

    const { error: updError } = await supabase.from("quotes").update(payload).eq("id", editingQuote.id);
    setSaving(false);
    if (updError) { setErrorMsg(updError.message); return; }
    setEditingQuote(null);
    setEditingQuoteItems(null);
    loadAll();
  };

  // ---- Incidentes ----
  const saveIncident = async (payload) => {
    setSaving(true);
    if (editingIncident) {
      const { data, error } = await supabase.from("incidents").update(payload).eq("id", editingIncident.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
      setEditingIncident(null);
    } else {
      const { data, error } = await supabase.from("incidents").insert({ ...payload, company_id: companyId, status: "abierto" }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setIncidents((prev) => [data, ...prev]);
      setShowAddIncident(false);
    }
  };

  const deleteIncident = async (id) => {
    if (!window.confirm("¿Eliminar este incidente?")) return;
    const { error } = await supabase.from("incidents").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.filter((i) => i.id !== id));
    setIncidentDetail(null);
  };

  const markIncidentStatus = async (incident, status) => {
    const payload = { status };
    if (status === "en_revision" && !incident.attended_at) payload.attended_at = new Date().toISOString();
    const { data, error } = await supabase.from("incidents").update(payload).eq("id", incident.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    setIncidentDetail((prev) => (prev ? data : prev));
  };
  const saveIncidentProgress = async (incident, findings) => {
    const { data, error } = await supabase.from("incidents").update({ findings }).eq("id", incident.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    setIncidentDetail((prev) => (prev ? data : prev));
  };
  const assignIncidentTechnician = async (id, technicianId) => {
    const { data, error } = await supabase.from("incidents").update({ technician_id: technicianId || null }).eq("id", id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    setIncidentDetail((prev) => (prev ? data : prev));
    if (technicianId) {
      await notifyManyTechnicians([technicianId], {
        title: `Te asignaron el incidente: ${data.title}`,
        body: data.description || "",
        link_view: "incidents",
        category: "incident_assigned",
      });
    }
  };
  const completeIncident = async (incident, findings) => {
    const payload = { findings, status: "resuelto", completed_at: new Date().toISOString() };
    if (!incident.attended_at) payload.attended_at = payload.completed_at;
    const { data, error } = await supabase.from("incidents").update(payload).eq("id", incident.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    setIncidentDetail((prev) => (prev ? data : prev));
  };
  const reopenIncident = async (incident) => {
    const { data, error } = await supabase.from("incidents").update({ status: "abierto", completed_at: null }).eq("id", incident.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setIncidents((prev) => prev.map((i) => (i.id === data.id ? data : i)));
    setIncidentDetail((prev) => (prev ? data : prev));
  };

  const convertIncidentToOrder = (incident) => {
    setOrderFromIncident({ incidentId: incident.id, title: incident.title, branch_id: incident.branch_id || "", equipment_id: incident.equipment_id || "" });
    setIncidentDetail(null);
  };

  const convertIncidentToQuote = (incident) => {
    setQuotePrefill({
      incidentId: incident.id,
      client_id: incident.client_id || "",
      items: [{ product_id: "", description: incident.title, quantity: 1, unit_price: 0, is_taxable: true }],
    });
    setIncidentDetail(null);
    setShowAddQuote(true);
  };

  const duplicateQuote = (quote, items) => {
    setQuotePrefill({
      client_id: quote.client_id,
      items: items.map((it) => ({
        product_id: it.product_id || "",
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        is_taxable: it.is_taxable,
        chapter: it.chapter || "",
      })),
    });
    setQuoteDetail(null);
    setShowAddQuote(true);
  };

  // ---- Técnicos ----
  const saveTech = async (name, specialty, branchId, canCreateIncidents, hourlyRate, extraBranchIds) => {
    setSaving(true);
    if (editingTech) {
      const { data, error } = await supabase.from("technicians").update({ name, specialty, branch_id: branchId, can_create_incidents: canCreateIncidents, hourly_rate: hourlyRate, extra_branch_ids: extraBranchIds || [] }).eq("id", editingTech.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTechnicians((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      setEditingTech(null);
    } else {
      const { data, error } = await supabase.from("technicians").insert({ company_id: companyId, branch_id: branchId, name, specialty, can_create_incidents: canCreateIncidents, hourly_rate: hourlyRate, extra_branch_ids: extraBranchIds || [] }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTechnicians((prev) => [...prev, data]);
      setShowAddTech(false);
    }
  };

  const deleteTech = async (id) => {
    const tech = technicians.find((t) => t.id === id);

    // Ya está dado de baja: este mismo botón lo reactiva.
    if (tech?.is_active === false) {
      const { data, error } = await supabase.from("technicians").update({ is_active: true }).eq("id", id).select().single();
      if (error) { setErrorMsg(error.message); return; }
      setTechnicians((prev) => prev.map((t) => (t.id === id ? data : t)));
      return;
    }

    // ¿Tiene historial que se perdería con un borrado real?
    const hasHistory =
      orders.some((o) => o.technician_id === id) ||
      orderTechnicians.some((wt) => wt.technician_id === id) ||
      incidents.some((i) => i.technician_id === id) ||
      tools.some((t) => t.technician_id === id) ||
      equipment.some((e) => e.default_technician_id === id) ||
      clientAssets.some((a) => a.default_technician_id === id) ||
      projects.some((p) => p.lead_technician_id === id);

    if (hasHistory) {
      if (!window.confirm(
        "Este técnico tiene órdenes, incidentes, herramientas, equipos o proyectos asociados — eliminarlo por completo borraría o dañaría ese historial (incluyendo costos ya facturados).\n\n¿Darlo de baja en su lugar? Dejará de aparecer para asignar trabajo nuevo, pero su nombre se conserva en el historial, órdenes y facturas ya existentes. Podrás reactivarlo después si vuelve a trabajar contigo."
      )) return;
      const { data, error } = await supabase.from("technicians").update({ is_active: false }).eq("id", id).select().single();
      if (error) { setErrorMsg(error.message); return; }
      setTechnicians((prev) => prev.map((t) => (t.id === id ? data : t)));
      return;
    }

    // Sin ningún historial asociado: se puede eliminar de verdad, sin dejar nada huérfano.
    if (!window.confirm("¿Eliminar este técnico? No tiene órdenes, incidentes ni otro historial asociado, así que se borrará por completo.")) return;
    const { error } = await supabase.from("technicians").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setTechnicians((prev) => prev.filter((t) => t.id !== id));
  };

  // ---- Equipos ----
  const saveEquipment = async (payload) => {
    setSaving(true);
    if (editingEquipment) {
      const { data, error } = await supabase.from("equipment").update(payload).eq("id", editingEquipment.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setEquipment((prev) => prev.map((e) => (e.id === data.id ? data : e)));
      setEditingEquipment(null);
    } else {
      const { data, error } = await supabase.from("equipment").insert({ ...payload, company_id: companyId }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setEquipment((prev) => [...prev, data]);
      setShowAddEquipment(false);
    }
  };

  const deleteEquipment = async (id) => {
    if (!window.confirm("¿Eliminar este equipo?")) return;
    const { error } = await supabase.from("equipment").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setEquipment((prev) => prev.filter((e) => e.id !== id));
  };

  const bulkDeleteEquipment = async (ids) => {
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar ${ids.length} equipo${ids.length !== 1 ? "s" : ""} seleccionado${ids.length !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("equipment").delete().in("id", ids);
    if (error) { setErrorMsg(error.message); return; }
    setEquipment((prev) => prev.filter((e) => !ids.includes(e.id)));
    setSelectedEquipment(new Set());
  };

  const addLocation = async (name, branchId) => {
    setSaving(true);
    const { data, error } = await supabase.from("locations").insert({ company_id: companyId, branch_id: branchId, name }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setLocations((prev) => [...prev, data]);
    setShowAddLocation(false);
  };

  // ---- Usuarios / invitaciones ----
  const updateMaxDiscount = async (userId, value) => {
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    const { data, error } = await supabase.from("profiles").update({ max_discount_pct: n }).eq("id", userId).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
  };

  const updateUserBranch = async (userId, branchId, extraBranchIds) => {
    const { data, error } = await supabase.from("profiles").update({ branch_id: branchId || null, extra_branch_ids: extraBranchIds || [] }).eq("id", userId).select().single();
    if (error) { setErrorMsg(error.message); return false; }
    setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    return true;
  };

  const updateUserRole = async (userId, role) => {
    const { data, error } = await supabase.from("profiles").update({ role }).eq("id", userId).select().single();
    if (error) return `${error.message}${error.code ? ` (código ${error.code})` : ""}`;
    if (!data) return "la actualización no devolvió ninguna fila (probablemente RLS bloqueó el UPDATE en silencio).";
    setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    return true;
  };

  const toggleUserActive = async (user) => {
    const nextActive = !(user.is_active ?? true);
    if (!window.confirm(nextActive ? `¿Reactivar a ${user.full_name || user.email}?` : `¿Desactivar a ${user.full_name || user.email}? No podrá volver a entrar hasta que lo reactives.`)) return;
    const { data, error } = await supabase.from("profiles").update({ is_active: nextActive }).eq("id", user.id).select().single();
    if (error) { setErrorMsg(error.message); return; }
    setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
  };

  const updateUserPermissions = async (userId, permissions) => {
    setSaving(true);
    const { data, error } = await supabase.from("profiles").update({ permissions }).eq("id", userId).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return `${error.message}${error.code ? ` (código ${error.code})` : ""}`; }
    if (!data) return "la actualización no devolvió ninguna fila (probablemente RLS bloqueó el UPDATE en silencio).";
    setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    return true;
  };

  const createInvite = async (email, role, technicianId, branchId, permissions) => {
    setSaving(true);
    const { data, error } = await supabase.from("invites").insert({ company_id: companyId, email, role, technician_id: technicianId, branch_id: branchId, permissions }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setInvites((prev) => [...prev, data]);
    setInviteLink(`${window.location.origin}${window.location.pathname}?invite=${data.token}`);
  };

  const cancelInvite = async (id) => {
    if (!window.confirm("¿Cancelar esta invitación?")) return;
    const { error } = await supabase.from("invites").delete().eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setInvites((prev) => prev.filter((i) => i.id !== id));
  };

  const INVENTORY_CHILD_KEYS = ["tools", "materials"];
  const CATALOG_CHILD_KEYS = ["clients", "products", "services", "warranty"];
  const SALES_CHILD_KEYS = ["quotes", "salesOrders", "invoices", "creditNotes", "recurringContracts", "caja"];
  const COMPRAS_CHILD_KEYS = ["suppliers", "purchaseOrders", "deliveryNotes", "purchases", "supplierReceipts", "otherExpenses", "purchaseLedger"];
  const CONTABLE_CHILD_KEYS = ["ncf", "receivables", "payables", "chartOfAccounts", "taxRates", "bankReconciliation", "dgiiCatalog"];
  const INFORMES_CHILD_KEYS = ["reports", "salesReports", "financialReports", "fiscalReports"];
  const _urlView = new URLSearchParams(window.location.search).get("view") || "dashboard";
  const [openSubmenus, setOpenSubmenus] = useState(() => ({
    inventoryMenu: INVENTORY_CHILD_KEYS.includes(_urlView),
    catalog: CATALOG_CHILD_KEYS.includes(_urlView),
    salesMenu: SALES_CHILD_KEYS.includes(_urlView),
    purchasesMenu: COMPRAS_CHILD_KEYS.includes(_urlView),
    accountingMenu: CONTABLE_CHILD_KEYS.includes(_urlView),
    informesMenu: INFORMES_CHILD_KEYS.includes(_urlView),
  }));
  const toggleSubmenu = (key) => setOpenSubmenus((prev) => ({ ...prev, [key]: !prev[key] }));
  const [openSections, setOpenSections] = useState({ "Departamento Técnico": true, "Comercial": true, "Administración": true });
  const toggleSection = (name) => setOpenSections((prev) => ({ ...prev, [name]: prev[name] === false ? true : false }));

  const RAW_NAV = [
    { key: "dashboard", label: "Panel", Icon: LayoutDashboard },
    {
      key: "informesMenu", label: "Informes", Icon: BarChart3,
      children: [
        { key: "reports", label: "Departamento Técnico", Icon: Wrench },
        { key: "salesReports", label: "Comercial / Ventas", Icon: Layers },
        { key: "financialReports", label: "Financieros", Icon: Wallet },
        { key: "fiscalReports", label: "Fiscales (DGII)", Icon: Hash },
      ],
    },
    { section: "Departamento Técnico" },
    { key: "incidents", label: "Incidentes", Icon: AlertTriangle },
    { key: "agenda", label: "Agenda", Icon: CalendarDays },
    { key: "orders", label: "Órdenes de trabajo", Icon: ClipboardList },
    { key: "projects", label: "Proyectos", Icon: FolderKanban },
    { key: "equipment", label: "Gestión de Equipos", Icon: Settings2 },
    { key: "checklists", label: "Checklists", Icon: ClipboardCheck },
    { key: "technicians", label: "Técnicos", Icon: Users },
    {
      key: "inventoryMenu", label: "Inventario", Icon: Package,
      children: [
        { key: "tools", label: "Herramientas", Icon: Wrench },
        { key: "materials", label: "Almacén", Icon: Boxes },
      ],
    },
    { key: "maintenanceSchedule", label: "Mantenimiento programado", Icon: CalendarDays },
    { section: "Comercial" },
    {
      key: "catalog", label: "Catálogo", Icon: Boxes,
      children: [
        { key: "clients", label: "Clientes", Icon: Users2 },
        { key: "products", label: "Productos", Icon: Boxes },
        { key: "services", label: "Servicios", Icon: Wrench },
        { key: "warranty", label: "Activos en Garantía", Icon: BadgeCheck },
      ],
    },
    {
      key: "purchasesMenu", label: "Compras", Icon: ShoppingCart,
      children: [
        { key: "suppliers", label: "Proveedores", Icon: Truck },
        { key: "purchaseOrders", label: "Pedidos a Proveedores", Icon: ClipboardList },
        { key: "deliveryNotes", label: "Nota de entrega proveedores", Icon: FileText },
        { key: "purchases", label: "Factura de proveedor", Icon: Receipt },
        { key: "supplierReceipts", label: "Recibos de proveedor", Icon: Receipt },
        { key: "otherExpenses", label: "Otros gastos", Icon: ShoppingCart },
        { key: "purchaseLedger", label: "Libro de facturas recibidas", Icon: FileText },
      ],
    },
    {
      key: "salesMenu", label: "Ventas", Icon: Layers,
      children: [
        { key: "quotes", label: "Cotizaciones", Icon: ClipboardCheck },
        { key: "salesOrders", label: "Órdenes de Venta", Icon: Layers },
        { key: "invoices", label: "Facturación", Icon: Receipt },
        { key: "creditNotes", label: "Notas de Crédito", Icon: RotateCcw },
        { key: "recurringContracts", label: "Contratos recurrentes", Icon: CalendarDays },
        { key: "caja", label: "Caja", Icon: Wallet },
      ],
    },
    { section: "Administración" },
    { key: "branches", label: "Sucursales", Icon: Building2 },
    {
      key: "accountingMenu", label: "Gestión Contable", Icon: Hash,
      children: [
        { key: "chartOfAccounts", label: "Catálogo de cuentas", Icon: Boxes },
        { key: "receivables", label: "Cuentas por Cobrar", Icon: Receipt },
        { key: "payables", label: "Cuentas por Pagar", Icon: ShoppingCart },
        { key: "taxRates", label: "Tasas impositivas", Icon: Hash },
        { key: "bankReconciliation", label: "Conciliación bancaria", Icon: Wallet },
        { key: "ncf", label: "Secuencia NCF", Icon: Hash },
        { key: "dgiiCatalog", label: "Catálogo RNC (DGII)", Icon: Search },
      ],
    },
    { key: "users", label: "Usuarios", Icon: ShieldCheck },
    { key: "companyProfile", label: "Perfil de la empresa", Icon: Building2 },
    { key: "activityLog", label: "Historial de actividad", Icon: History },
  ];
  const NAV = [];
  {
    let pendingSection = null;
    RAW_NAV.forEach((item) => {
      if (item.section) { pendingSection = item.section; return; }
      let visibleItem = item;
      if (item.children) {
        const visibleChildren = item.children.filter((c) => hasPerm(c.key));
        if (visibleChildren.length === 0) return;
        visibleItem = { ...item, children: visibleChildren };
      } else if (!hasPerm(item.key)) {
        return;
      }
      if (pendingSection) { NAV.push({ section: pendingSection }); pendingSection = null; }
      NAV.push(visibleItem);
    });
  }

  const flattenNavKeys = (items) => items.flatMap((it) => (it.section ? [] : it.children ? it.children.map((c) => c.key) : [it.key]));
  useEffect(() => {
    if (hasPerm(view)) return;
    const firstAllowed = flattenNavKeys(NAV)[0];
    if (firstAllowed) changeView(firstAllowed);
    // eslint-disable-next-line
  }, [view, JSON.stringify(effectivePermissions)]);

  const renderToolRow = (t) => (
    <div key={t.id} className="p-4" style={{ background: C.panel, border: `1px solid ${selectedTools.has(t.id) ? C.amber : C.border}` }}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex items-start gap-2">
          {canDelete("tools") && (
            <input
              type="checkbox"
              className="mt-1"
              checked={selectedTools.has(t.id)}
              onChange={() => setSelectedTools((prev) => { const next = new Set(prev); next.has(t.id) ? next.delete(t.id) : next.add(t.id); return next; })}
            />
          )}
          <div className="min-w-0">
            <div className="font-medium truncate">{t.name}</div>
            {t.serial_number && <div className="text-xs" style={{ color: C.muted }}>S/N {t.serial_number}</div>}
            {t.category && <div className="text-xs" style={{ color: C.muted }}>{t.category}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canEdit("tools") && <button onClick={() => setEditingTool(t)} style={iconBtnStyle}><Pencil size={14} /></button>}
          {canDelete("tools") && <button onClick={() => deleteTool(t.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
        </div>
      </div>
      <div className="text-xs mb-2" style={{ color: C.muted }}>{branchName(t.branch_id)}</div>
      <div className="flex items-center justify-between pt-2 mt-1" style={{ borderTop: `1px solid ${C.border}` }}>
        <Pill label={TOOL_STATUS_CFG[t.status]?.label || "Disponible"} color={TOOL_STATUS_CFG[t.status]?.color || C.green} />
        {canEdit("tools") ? (
          <select value={t.technician_id || ""} onChange={(e) => assignTool(t.id, e.target.value)} className="px-2 py-1.5 text-xs" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
            <option value="">Sin asignar</option>
            {technicians.filter((tech) => tech.is_active !== false || tech.id === t.technician_id).map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
          </select>
        ) : (
          <span style={{ color: C.muted }}>{techName(t.technician_id)}</span>
        )}
      </div>
      {t.technician_id && (
        canEdit("tools") ? (
          <div className="text-[10px] mt-1 text-right" style={{ color: t.received_at ? C.green : C.amber }}>
            {t.received_at ? `Confirmada ${fmtDate(t.received_at.slice(0, 10))}` : "Pendiente de confirmación"}
          </div>
        ) : (
          t.received_at ? (
            <div className="text-[10px] mt-1 text-right" style={{ color: C.green }}>✓ Confirmada {fmtDate(t.received_at.slice(0, 10))}</div>
          ) : isTecnico && t.technician_id === profile.technician_id ? (
            <div className="text-right">
              <button onClick={() => confirmToolReceipt(t.id)} className="mt-1 inline-flex items-center gap-1 text-[11px] px-2 py-1" style={{ background: C.green + "20", color: C.green, border: `1px solid ${C.green}40` }}>
                <CheckCircle2 size={12} /> Confirmar recepción
              </button>
            </div>
          ) : (
            <div className="text-[10px] mt-1 text-right" style={{ color: C.amber }}>Pendiente de confirmación</div>
          )
        )
      )}
    </div>
  );

  return (
    <div className="w-full min-h-[720px] flex" style={{ background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {showMobileMenu && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowMobileMenu(false)} />
      )}
      <div
        className={`${showMobileMenu ? "flex" : "hidden"} md:flex fixed md:relative inset-y-0 left-0 z-50 md:z-auto w-64 md:w-56 flex-shrink-0 flex-col overflow-y-auto`}
        style={{ background: C.panel, borderRight: `1px solid ${C.border}` }}
      >
        <div className="px-5 py-5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center" style={{ background: C.amber }}>
              <Wrench size={16} color="#1A1500" />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight leading-none">MantenPro</div>
              <div className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: C.muted }}>Multi-empresa</div>
            </div>
          </div>
          <button onClick={() => setShowMobileMenu(false)} className="md:hidden p-1" style={{ color: C.muted }}>
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 py-3">
          {(() => {
            let currentSection = null;
            return NAV.map((item, i) => {
              if (item.section) {
                currentSection = item.section;
                const isOpen = openSections[item.section] !== false;
                return (
                  <button key={`section-${i}`} onClick={() => toggleSection(item.section)}
                    className="w-full flex items-center justify-between px-5 pt-4 pb-1 text-[10px] uppercase tracking-wide text-left"
                    style={{ color: C.muted, borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
                    <span>{item.section}</span>
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                );
              }
              const sectionOpen = currentSection ? openSections[currentSection] !== false : true;
              if (!sectionOpen) return null;
              if (item.children) {
                const isSubOpen = !!openSubmenus[item.key];
                return (
                  <div key={item.key}>
                    <button onClick={() => toggleSubmenu(item.key)} className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left"
                      style={{ color: item.children.some((c) => c.key === view) ? C.text : C.muted, background: item.children.some((c) => c.key === view) ? C.panelAlt : "transparent", borderLeft: `2px solid ${item.children.some((c) => c.key === view) ? C.amber : "transparent"}` }}>
                      <item.Icon size={16} />
                      <span className="flex-1">{item.label}</span>
                      {isSubOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {isSubOpen && item.children.map((child) => (
                      <button key={child.key} onClick={() => changeView(child.key)} className="w-full flex items-center gap-3 pl-9 pr-5 py-2 text-sm text-left"
                        style={{ color: view === child.key ? C.text : C.muted, background: view === child.key ? C.panelAlt : "transparent", borderLeft: `2px solid ${view === child.key ? C.amber : "transparent"}` }}>
                        <child.Icon size={14} />
                        {child.label}
                      </button>
                    ))}
                  </div>
                );
              }
              return (
                <button key={item.key} onClick={() => changeView(item.key)} className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left"
                  style={{ color: view === item.key ? C.text : C.muted, background: view === item.key ? C.panelAlt : "transparent", borderLeft: `2px solid ${view === item.key ? C.amber : "transparent"}` }}>
                  <item.Icon size={16} />
                  {item.label}
                </button>
              );
            });
          })()}
        </nav>
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="text-xs truncate" style={{ color: C.muted }}>{session.user.email}</div>
          <div className="text-[10px] mt-1 mb-2" style={{ color: ROLE_CFG[profile.role]?.color }}>{ROLE_CFG[profile.role]?.label}</div>
          {passwordChanged && <div className="text-[10px] mb-2" style={{ color: C.green }}>Contraseña actualizada.</div>}
          <button onClick={() => { setShowChangePassword(true); setPasswordChanged(false); }} className="flex items-center gap-2 text-xs mb-2" style={{ color: C.muted }}>
            <ShieldCheck size={13} /> Cambiar contraseña
          </button>
          <button onClick={onSignOut} className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
            <LogOut size={13} /> Cerrar sesión
          </button>
        </div>
      </div>

      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onDone={() => { setShowChangePassword(false); setPasswordChanged(true); }}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {errorMsg && (
          <div className="px-4 py-2 text-xs flex items-center justify-between" style={{ background: "#3A2020", color: C.red }}>
            <span>Error: {errorMsg}</span>
            <button onClick={() => setErrorMsg("")}><X size={14} /></button>
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-3 flex-wrap gap-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowMobileMenu(true)} className="md:hidden p-2" style={{ color: C.text }}>
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <Building2 size={14} color={C.amber} />
              {companyName}
            </div>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
              <option value="all">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <button onClick={() => setShowNotifPanel((v) => !v)} className="relative p-2" style={{ color: C.text }}>
                <Bell size={20} />
                {notifications.filter((n) => !n.is_read).length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center text-[10px] font-bold rounded-full" style={{ background: C.red, color: "#fff", width: 16, height: 16 }}>
                    {notifications.filter((n) => !n.is_read).length > 9 ? "9+" : notifications.filter((n) => !n.is_read).length}
                  </span>
                )}
              </button>
              {showNotifPanel && (
                <div className="absolute right-0 mt-2 z-50" style={{ background: C.panel, border: `1px solid ${C.border}`, maxHeight: 480, overflowY: "auto", width: "min(24rem, 90vw)" }}>
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="text-sm font-semibold">Notificaciones</div>
                    <div className="flex items-center gap-2">
                      <button onClick={markAllNotificationsRead} className="text-xs" style={{ color: C.amber }}>Marcar todas leídas</button>
                      <button onClick={() => setShowNotifPanel(false)} style={iconBtnStyle}><X size={14} /></button>
                    </div>
                  </div>
                  {notifications.length === 0 && <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>No tienes notificaciones todavía.</div>}
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => { markNotificationRead(n.id); if (n.link_view) { changeView(n.link_view); setShowNotifPanel(false); } }}
                      className="px-4 py-3 text-sm cursor-pointer"
                      style={{ borderBottom: `1px solid ${C.border}`, background: n.is_read ? "transparent" : C.panelAlt }}
                    >
                      <div className="flex items-start gap-2">
                        {!n.is_read && <span className="mt-1.5 flex-shrink-0" style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber }} />}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{n.title}</div>
                          {n.body && <div className="text-xs truncate" style={{ color: C.muted }}>{n.body}</div>}
                          <div className="text-[10px] mt-0.5" style={{ color: C.muted }}>{new Date(n.created_at).toLocaleString("es-DO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
                    {pushSubscribed ? (
                      <button onClick={disablePushNotifications} className="flex items-center gap-2 text-xs" style={{ color: C.muted }}><BellOff size={13} /> Desactivar notificaciones push en este dispositivo</button>
                    ) : (
                      <PushSetupInline onEnable={enablePushNotifications} />
                    )}
                  </div>
                </div>
              )}
            </div>
            {canManage && (
              <>
                <button onClick={() => setShowBulkOrders(true)} disabled={branches.length === 0 || !canEdit("orders")} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.text }}>
                  <Layers size={16} /> Crear varias
                </button>
                <button onClick={() => setShowOrderForm(true)} disabled={branches.length === 0 || !canEdit("orders")} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={16} /> Nueva orden
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loadingScope && <FullScreenLoader label="Cargando datos..." />}

          {!loadingScope && hasPerm("dashboard") && view === "dashboard" && (
            <div>
              {overdueOrders.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 mb-4" style={{ background: "#3A2020", border: `1px solid ${C.red}40` }}>
                  <div className="flex items-center gap-2 text-sm" style={{ color: C.red }}>
                    <AlertTriangle size={16} />
                    Tienes {overdueOrders.length} orden{overdueOrders.length !== 1 ? "es" : ""} vencida{overdueOrders.length !== 1 ? "s" : ""} — la fecha programada ya pasó.
                  </div>
                  <button onClick={() => changeView("agenda")} className="text-xs px-3 py-1.5" style={{ border: `1px solid ${C.red}40`, color: C.red }}>Ver en agenda</button>
                </div>
              )}
              {pastDeadlineOrders.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 mb-4" style={{ background: "#3A2020", border: `1px solid ${C.red}40` }}>
                  <div className="flex items-center gap-2 text-sm" style={{ color: C.red }}>
                    <AlertTriangle size={16} />
                    Tienes {pastDeadlineOrders.length} orden{pastDeadlineOrders.length !== 1 ? "es" : ""} que pasó{pastDeadlineOrders.length !== 1 ? "ron" : ""} su fecha límite (deadline) sin completarse.
                  </div>
                  <button onClick={() => changeView("orders")} className="text-xs px-3 py-1.5" style={{ border: `1px solid ${C.red}40`, color: C.red }}>Ver órdenes</button>
                </div>
              )}
              {hasPerm("maintenanceSchedule") && (dueEquipment.length + dueClientAssets.length) > 0 && (
                <div className="flex items-center justify-between px-4 py-3 mb-4" style={{ background: "#3A2E14", border: `1px solid ${C.amber}40` }}>
                  <div className="flex items-center gap-2 text-sm" style={{ color: C.amber }}>
                    <CalendarDays size={16} />
                    {dueEquipment.length + dueClientAssets.length} equipo{(dueEquipment.length + dueClientAssets.length) !== 1 ? "s/activos" : ""} con mantenimiento preventivo vencido, listo{(dueEquipment.length + dueClientAssets.length) !== 1 ? "s" : ""} para generar orden.
                  </div>
                  <button onClick={() => changeView("maintenanceSchedule")} className="text-xs px-3 py-1.5" style={{ border: `1px solid ${C.amber}40`, color: C.amber }}>Ver mantenimiento programado</button>
                </div>
              )}
              {hasPerm("receivables") && overdueReceivables.count > 0 && (
                <div className="flex items-center justify-between px-4 py-3 mb-4" style={{ background: "#3A2020", border: `1px solid ${C.red}40` }}>
                  <div className="flex items-center gap-2 text-sm" style={{ color: C.red }}>
                    <AlertTriangle size={16} />
                    Tienes {overdueReceivables.count} factura{overdueReceivables.count !== 1 ? "s" : ""} vencida{overdueReceivables.count !== 1 ? "s" : ""} (+30 días) por {fmtMoney(overdueReceivables.total)}.
                  </div>
                  <button onClick={() => changeView("receivables")} className="text-xs px-3 py-1.5" style={{ border: `1px solid ${C.red}40`, color: C.red }}>Ver Cuentas por Cobrar</button>
                </div>
              )}
              <div className="flex gap-3 flex-wrap mb-6">
                <KpiCard label="Órdenes activas" value={kpi.pend + kpi.prog} accent={C.amber} sub={`${kpi.pend} pendientes · ${kpi.prog} en progreso`} />
                <KpiCard label="Completadas" value={kpi.done} accent={C.green} sub="Histórico visible" />
                <KpiCard label="Preventivos pendientes" value={kpi.prev} accent={C.blue} sub="Sin cerrar aún" />
                <KpiCard label="Total de órdenes" value={kpi.total} accent={C.muted} sub={branchFilter === "all" ? "Todas las sucursales" : branchName(branchFilter)} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-2 p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <div className="text-sm font-semibold mb-3">Órdenes por tipo de mantenimiento</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ left: -20 }}>
                      <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
                      <Tooltip contentStyle={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }} cursor={{ fill: C.panelAlt }} />
                      <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                        {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="lg:col-span-3 p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <div className="text-sm font-semibold mb-3">Órdenes recientes</div>
                  <div className="space-y-2">
                    {scopedOrders.slice(0, 6).map((o) => {
                      const t = TYPE_CFG[o.type], s = STATUS_CFG[o.status];
                      return (
                        <div key={o.id} className="flex items-center justify-between text-sm px-3 py-2" style={{ background: C.panelAlt, borderLeft: `3px solid ${t.color}` }}>
                          <div className="min-w-0">
                            <div className="font-mono text-xs" style={{ color: C.muted }}>{o.code}</div>
                            <div className="truncate" style={{ color: C.text }}>{o.title}</div>
                          </div>
                          <Pill label={s.label} color={s.color} />
                        </div>
                      );
                    })}
                    {scopedOrders.length === 0 && <div className="text-sm" style={{ color: C.muted }}>No hay órdenes registradas en este alcance.</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loadingScope && hasPerm("agenda") && view === "agenda" && (
            <div>
              {overdueOrders.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-3 mb-4 text-sm" style={{ background: "#3A2020", border: `1px solid ${C.red}40`, color: C.red }}>
                  <AlertTriangle size={16} />
                  Tienes {overdueOrders.length} orden{overdueOrders.length !== 1 ? "es" : ""} vencida{overdueOrders.length !== 1 ? "s" : ""} — la fecha programada ya pasó y siguen sin completarse.
                </div>
              )}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setCalendarMonth((m) => { const d = new Date(m.year, m.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} className="p-2" style={{ border: `1px solid ${C.border}`, color: C.muted }}><ChevronLeft size={16} /></button>
                  <div className="text-sm font-semibold" style={{ color: C.text, minWidth: 160, textAlign: "center" }}>
                    {new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString("es-DO", { month: "long", year: "numeric" })}
                  </div>
                  <button onClick={() => setCalendarMonth((m) => { const d = new Date(m.year, m.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} className="p-2" style={{ border: `1px solid ${C.border}`, color: C.muted }}><ChevronRight size={16} /></button>
                  <button onClick={() => { const d = new Date(); setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() }); setSearchedDate(""); }} className="text-xs px-3 py-2" style={{ border: `1px solid ${C.border}`, color: C.amber }}>Hoy</button>
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
                        }
                      }}
                      className="bg-transparent outline-none text-sm"
                      style={{ color: C.text }}
                    />
                    {searchedDate && <button onClick={() => setSearchedDate("")} style={iconBtnStyle}><X size={14} /></button>}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: C.muted }}>
                  <span className="flex items-center gap-1"><Dot color={C.blue} /> Próxima</span>
                  <span className="flex items-center gap-1"><Dot color={C.amber} /> Hoy</span>
                  <span className="flex items-center gap-1"><Dot color={C.red} /> Vencida</span>
                  <span className="flex items-center gap-1"><Dot color={C.green} /> Completada</span>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1 text-xs uppercase tracking-wide text-center" style={{ color: C.muted }}>
                {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => <div key={d}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const { year, month } = calendarMonth;
                  const firstWeekday = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const todayStr = new Date().toISOString().slice(0, 10);
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
            </div>
          )}

          {!loadingScope && hasPerm("orders") && view === "orders" && (
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
                          {isTecnico && o.status === "completada" ? (
                            <Pill label={s.label} color={s.color} />
                          ) : (
                            <button onClick={() => cycleStatus(o)} title="Avanzar estado" className="flex items-center gap-1 text-xs px-2 py-1" style={{ color: s.color, border: `1px solid ${s.color}40` }}>
                              {s.label} <ArrowRight size={12} />
                            </button>
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
          )}

          {!loadingScope && hasPerm("incidents") && view === "incidents" && (
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
          )}

          {!loadingScope && hasPerm("projects") && view === "projects" && (
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
          )}

          {!loadingScope && hasPerm("equipment") && view === "equipment" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{equipmentFiltered.length}{equipmentFiltered.length !== equipment.length ? ` de ${equipment.length}` : ""} equipos{selectedEquipment.size > 0 ? ` · ${selectedEquipment.size} seleccionados` : ""}</div>
                <div className="flex gap-2">
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
                          <button onClick={() => setEditingEquipment(eq)} style={iconBtnStyle}><Pencil size={13} /></button>
                          {canDelete("equipment") && <button onClick={() => deleteEquipment(eq.id)} style={iconBtnStyle}><Trash2 size={13} /></button>}
                        </div>
                      </div>
                      {eq.type && <div className="text-xs mt-0.5" style={{ color: C.muted }}>{eq.type}</div>}
                      <div className="text-xs mt-3 space-y-1" style={{ color: C.muted }}>
                        {eq.brand && <div>Marca: <span style={{ color: C.text }}>{eq.brand}</span></div>}
                        {eq.model && <div>Modelo: <span style={{ color: C.text }}>{eq.model}</span></div>}
                        {eq.serial_number && <div className="font-mono">S/N: <span style={{ color: C.text }}>{eq.serial_number}</span></div>}
                        {eq.installed_at && <div>Instalado: <span style={{ color: C.text }}>{fmtDate(eq.installed_at)}</span></div>}
                        {locationName(eq.location_id) && <div>Ubicación: <span style={{ color: C.text }}>{locationName(eq.location_id)}</span></div>}
                        <div>Técnico: <span style={{ color: eq.default_technician_id ? C.text : C.muted }}>{eq.default_technician_id ? (technicians.find((t) => t.id === eq.default_technician_id)?.name || "—") : "Sin asignar"}</span></div>
                      </div>
                      <div className="flex items-center gap-1 text-xs mt-3" style={{ color: C.muted }}><MapPin size={12} /> {branchName(eq.branch_id)}</div>
                    </div>
                  );
                })}
                {equipmentFiltered.length === 0 && equipment.length > 0 && <div className="text-sm" style={{ color: C.muted }}>Ningún equipo coincide con los filtros.</div>}
                {equipment.length === 0 && <div className="text-sm" style={{ color: C.muted }}>Todavía no hay equipos registrados.</div>}
                {branches.length === 0 && <div className="text-sm" style={{ color: C.muted }}>Primero crea una sucursal para poder agregar equipos.</div>}
              </div>
            </div>
          )}

          {!loadingScope && hasPerm("technicians") && view === "technicians" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{technicians.length} técnicos</div>
                <button onClick={() => setShowAddTech(true)} disabled={branches.length === 0 || !canEdit("technicians")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Agregar técnico
                </button>
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
          )}

          {!loadingScope && hasPerm("tools") && view === "tools" && (
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
          )}

          {!loadingScope && hasPerm("materials") && view === "materials" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{materials.length} material{materials.length !== 1 ? "es" : ""} en almacén</div>
                {canEdit("materials") && (
                  <button onClick={() => setShowAddMaterial(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> Agregar material
                  </button>
                )}
              </div>
              <div className="overflow-x-auto" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-4">Material</div>
                  <div className="col-span-2">Sucursal</div>
                  <div className="col-span-2 text-right">Cantidad</div>
                  <div className="col-span-2">Unidad</div>
                  <div className="col-span-2 text-right">Acciones</div>
                </div>
                {materials.map((m) => (
                  <div key={m.id} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="col-span-4">
                      <div className="font-medium">{m.name}</div>
                      {m.notes && <div className="text-xs" style={{ color: C.muted }}>{m.notes}</div>}
                    </div>
                    <div className="col-span-2 truncate" style={{ color: C.muted }}>{branchName(m.branch_id)}</div>
                    <div className="col-span-2 text-right font-mono">{Number(m.quantity || 0).toLocaleString("es-DO")}</div>
                    <div className="col-span-2" style={{ color: C.muted }}>{m.unit || "—"}</div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      {canEdit("materials") && <button onClick={() => setEditingMaterial(m)} style={iconBtnStyle}><Pencil size={14} /></button>}
                      {canDelete("materials") && <button onClick={() => deleteMaterial(m.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                    </div>
                  </div>
                ))}
                {materials.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>Todavía no hay materiales registrados en el almacén.</div>}
              </div>
            </div>
          )}

          {!loadingScope && hasPerm("maintenanceSchedule") && view === "maintenanceSchedule" && (
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
          )}

          {!loadingScope && hasPerm("branches") && view === "branches" && (
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
          )}

          {!loadingScope && hasPerm("warranty") && view === "warranty" && (
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
          )}

          {!loadingScope && hasPerm("checklists") && view === "checklists" && (
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
          )}

          {!loadingScope && hasPerm("reports") && view === "reports" && (
            <div>
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Incidentes — resumen general</div>
              <div className="flex flex-wrap gap-3 mb-6">
                <KpiCard label="Abiertos" value={incidents.filter((i) => i.status === "abierto").length} accent={C.red} sub="Sin atender aún" />
                <KpiCard label="En revisión" value={incidents.filter((i) => i.status === "en_revision").length} accent={C.amber} sub="En proceso" />
                <KpiCard label="Completados" value={incidents.filter((i) => i.status === "resuelto").length} accent={C.green} sub="Con hallazgos registrados" />
                <KpiCard label="Descartados" value={incidents.filter((i) => i.status === "descartado").length} accent={C.muted} sub="No procedían" />
                <KpiCard label="Total de incidentes" value={incidents.length} accent={C.blue} sub="Histórico completo" />
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
                  <div className="col-span-3">Técnico</div>
                  <div className="col-span-1 text-center">Prev.</div>
                  <div className="col-span-1 text-center">Correc.</div>
                  <div className="col-span-1 text-center">Predic.</div>
                  <div className="col-span-2 text-center">Incidentes</div>
                  <div className="col-span-1 text-center">Total OT</div>
                  <div className="col-span-3 text-right">Historial</div>
                </div>
                {techStats.map((t) => (
                  <div key={t.id} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="col-span-3">
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
                    <div className="col-span-3 text-right">
                      <button onClick={() => setHistoryFor({ title: `Historial de ${t.name}`, orders: orders.filter((o) => o.technician_id === t.id) })} className="flex items-center gap-1 text-xs ml-auto" style={{ color: C.amber }}>
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
                  <div className="col-span-2 text-center">Correctivas</div>
                  <div className="col-span-2 text-center">Incidentes</div>
                  <div className="col-span-1 text-center">Total OT</div>
                  <div className="col-span-2 text-right">Historial</div>
                </div>
                {equipStats.map((eq) => (
                  <div key={eq.id} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="col-span-3">
                      <div>{eq.name}</div>
                      <div className="text-xs" style={{ color: C.muted }}>{branchName(eq.branch_id)}</div>
                    </div>
                    <div className="col-span-2 text-center font-mono" style={{ color: eq.open > 0 ? C.amber : C.muted }}>{eq.open}</div>
                    <div className="col-span-2 text-center font-mono" style={{ color: eq.correctivo > 0 ? C.red : C.muted }}>{eq.correctivo}</div>
                    <div className="col-span-2 text-center font-mono" style={{ color: eq.incidentesAbiertos > 0 ? C.amber : C.muted }}>{eq.incidentesTotal}</div>
                    <div className="col-span-1 text-center font-mono">{eq.total}</div>
                    <div className="col-span-2 text-right">
                      <button onClick={() => setHistoryFor({ title: `Historial de ${eq.name}`, orders: orders.filter((o) => o.equipment_id === eq.id) })} className="flex items-center gap-1 text-xs ml-auto" style={{ color: C.amber }}>
                        <History size={13} /> Ver
                      </button>
                    </div>
                  </div>
                ))}
                {equipStats.length === 0 && <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>Todavía no hay equipos registrados.</div>}
              </div>
            </div>
          )}

          {!loadingScope && hasPerm("clients") && view === "clients" && (
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
          )}

          {!loadingScope && (hasPerm("products") || hasPerm("services")) && (view === "products" || view === "services") && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>
                  {filteredProducts.length}{filteredProducts.length !== products.filter((p) => (p.item_type || "producto") === (isServicesView ? "servicio" : "producto")).length ? ` de ${products.filter((p) => (p.item_type || "producto") === (isServicesView ? "servicio" : "producto")).length}` : ""} {isServicesView ? "servicios" : "productos"}{selectedProducts.size > 0 ? ` · ${selectedProducts.size} seleccionados` : ""}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const list = selectedProducts.size > 0 ? filteredProducts.filter((p) => selectedProducts.has(p.id)) : filteredProducts;
                      const cols = isServicesView ? ["SKU", "Servicio", "Categoría", "Costo", "Precio"] : ["SKU", "Producto", "Categoría", "Costo", "Precio", "Stock"];
                      const rows = isServicesView
                        ? list.map((p) => [p.sku, p.name, p.category, fmtMoney(p.cost_price), fmtMoney(p.unit_price)])
                        : list.map((p) => [p.sku, p.name, p.category, fmtMoney(p.cost_price), fmtMoney(p.unit_price), `${p.stock_qty} ${p.unit}`]);
                      printDocument("Catálogo", listHtml(isServicesView ? "Catálogo de servicios" : "Catálogo de productos", companyName, cols, rows));
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text }}
                  >
                    <FileText size={14} /> {selectedProducts.size > 0 ? `Imprimir selección (${selectedProducts.size})` : "Imprimir lista"}
                  </button>
                  <button onClick={() => setShowAddProduct(true)} disabled={!canEdit(isServicesView ? "services" : "products")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> {isServicesView ? "Agregar servicio" : "Agregar producto"}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-2 px-3 py-2 flex-1 min-w-[220px]" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <Search size={14} color={C.muted} />
                  <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar por nombre o SKU..." className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
                </div>
                <select value={productCategoryFilter} onChange={(e) => setProductCategoryFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todas las categorías</option>
                  {productCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {!isServicesView && (
                  <select value={productBranchFilter} onChange={(e) => setProductBranchFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                    <option value="all">Todas las sucursales</option>
                    <option value="none">Sin especificar</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
              </div>
              {filteredProducts.length > 0 && (
                <label className="flex items-center gap-2 text-xs mb-3 cursor-pointer" style={{ color: C.muted }}>
                  <input type="checkbox" checked={selectedProducts.size === filteredProducts.length} onChange={() => setSelectedProducts(selectedProducts.size === filteredProducts.length ? new Set() : new Set(filteredProducts.map((p) => p.id)))} />
                  Seleccionar todos los que se ven ({filteredProducts.length})
                </label>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredProducts.map((p) => (
                  <div key={p.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <input type="checkbox" checked={selectedProducts.has(p.id)} onChange={() => setSelectedProducts((prev) => { const next = new Set(prev); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; })} />
                        <div className="min-w-0">
                          <div className="font-semibold truncate flex items-center gap-1.5">
                            {p.name}
                            {p.is_composite && <Pill label="Kit" color={C.blue} />}
                          </div>
                          <div className="text-xs truncate" style={{ color: C.muted }}>
                            {p.sku ? `SKU: ${p.sku}` : ""}{p.sku && p.category ? " · " : ""}{p.category || (!p.sku ? p.description || "—" : "")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {canEdit(isServicesView ? "services" : "products") && <button onClick={() => setEditingProduct(p)} style={iconBtnStyle}><Pencil size={14} /></button>}
                        {canDelete(isServicesView ? "services" : "products") && <button onClick={() => deleteProduct(p.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 mt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                      <div className="text-xs" style={{ color: C.muted }}>Costo: <span style={{ color: C.text }}>{fmtMoney(p.cost_price)}</span></div>
                      <div className="font-mono font-semibold">{fmtMoney(p.unit_price)}</div>
                    </div>
                    {!isServicesView && (
                      <div className="text-xs mt-1" style={{ color: p.is_composite ? C.muted : (p.stock_qty <= 0 ? C.red : C.muted) }}>
                        {p.is_composite ? `${productComponents.filter((c) => c.parent_product_id === p.id).length} componentes` : `Stock: ${p.stock_qty} ${p.unit}`}
                      </div>
                    )}
                    {!isServicesView && p.branch_id && (
                      <div className="flex items-center gap-1 text-xs mt-1" style={{ color: C.muted }}><MapPin size={11} /> {branches.find((b) => b.id === p.branch_id)?.name || "—"}</div>
                    )}
                  </div>
                ))}
                {filteredProducts.length === 0 && (
                  <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>
                    {products.filter((p) => (p.item_type || "producto") === (isServicesView ? "servicio" : "producto")).length === 0
                      ? (isServicesView ? "Todavía no hay servicios en el catálogo." : "Todavía no hay productos en el catálogo.")
                      : (isServicesView ? "Ningún servicio coincide con la búsqueda." : "Ningún producto coincide con la búsqueda.")}
                  </div>
                )}
              </div>
            </div>
          )}

          {!loadingScope && hasPerm("suppliers") && view === "suppliers" && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>
                  {filteredSuppliers.length}{filteredSuppliers.length !== suppliers.length ? ` de ${suppliers.length}` : ""} proveedores{selectedSuppliers.size > 0 ? ` · ${selectedSuppliers.size} seleccionados` : ""}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const list = selectedSuppliers.size > 0 ? filteredSuppliers.filter((s) => selectedSuppliers.has(s.id)) : filteredSuppliers;
                      printDocument("Proveedores", listHtml("Listado de proveedores", companyName, ["Proveedor", "RNC", "Teléfono", "Correo"], list.map((s) => [s.name, s.rnc, s.phone, s.email])));
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text }}
                  >
                    <FileText size={14} /> {selectedSuppliers.size > 0 ? `Imprimir selección (${selectedSuppliers.size})` : "Imprimir lista"}
                  </button>
                  <button onClick={() => setShowAddSupplier(true)} disabled={!canEdit("suppliers")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> Agregar proveedor
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 mb-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <Search size={14} color={C.muted} />
                <input value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Buscar por nombre, RNC, teléfono o correo..." className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredSuppliers.map((s) => (
                  <div key={s.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedSuppliers.has(s.id)} onChange={() => setSelectedSuppliers((prev) => { const next = new Set(prev); next.has(s.id) ? next.delete(s.id) : next.add(s.id); return next; })} />
                        <div className="font-semibold">{s.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditingSupplier(s)} style={iconBtnStyle}><Pencil size={13} /></button>
                        {canDelete("suppliers") && <button onClick={() => deleteSupplier(s.id)} style={iconBtnStyle}><Trash2 size={13} /></button>}
                      </div>
                    </div>
                    <div className="text-xs mt-2 space-y-1" style={{ color: C.muted }}>
                      {s.rnc && <div>RNC: <span style={{ color: C.text }}>{s.rnc}</span></div>}
                      {s.phone && <div>Tel: <span style={{ color: C.text }}>{s.phone}</span></div>}
                      {s.email && <div>{s.email}</div>}
                    </div>
                  </div>
                ))}
                {filteredSuppliers.length === 0 && (
                  <div className="text-sm" style={{ color: C.muted }}>
                    {suppliers.length === 0 ? "Todavía no hay proveedores registrados." : "Ningún proveedor coincide con la búsqueda."}
                  </div>
                )}
              </div>
            </div>
          )}

          {!loadingScope && hasPerm("purchases") && view === "purchases" && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>{filteredPurchases.length}{filteredPurchases.length !== purchases.length ? ` de ${purchases.length}` : ""} compras registradas</div>
                <button onClick={() => setShowAddPurchase(true)} disabled={products.length === 0 || !canEdit("purchases")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Registrar compra
                </button>
              </div>
              {products.length === 0 && <div className="text-sm mb-3" style={{ color: C.muted }}>Agrega al menos un producto al catálogo antes de registrar una compra.</div>}
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-2 px-3 py-2 flex-1 min-w-[220px]" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                  <Search size={14} color={C.muted} />
                  <input value={purchaseSearch} onChange={(e) => setPurchaseSearch(e.target.value)} placeholder="Buscar por proveedor o factura..." className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
                </div>
                <select value={purchaseSupplierFilter} onChange={(e) => setPurchaseSupplierFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="all">Todos los proveedores</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredPurchases.map((pu) => {
                  const payCfg = PAYABLE_STATUS_CFG[pu.payment_status] || PAYABLE_STATUS_CFG.pendiente;
                  const sup = suppliers.find((s) => s.id === pu.supplier_id);
                  return (
                    <div key={pu.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{sup?.name || "—"}</div>
                          <div className="text-xs truncate" style={{ color: C.muted }}>{sup?.rnc || ""}</div>
                          {pu.title && <div className="text-xs truncate mt-0.5" style={{ color: C.muted }}>{pu.title}</div>}
                        </div>
                        <div className="text-xs flex-shrink-0" style={{ color: payCfg.color }}>{payCfg.label}</div>
                      </div>
                      <div className="text-xs mt-1" style={{ color: C.muted }}>Factura: {pu.invoice_number || "—"}</div>
                      <div className="flex items-center justify-between pt-2 mt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted }}>{fmtDate(pu.purchase_date)}</span>
                        <span className="font-mono font-semibold">{fmtMoney(pu.total)}</span>
                      </div>
                      <div className="flex items-center justify-end gap-3 mt-2">
                        <button onClick={() => openPurchaseDetail(pu)} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}><FileText size={13} /> Detalle</button>
                        {canDelete("purchases") && <button onClick={() => deletePurchase(pu)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                      </div>
                    </div>
                  );
                })}
                {filteredPurchases.length === 0 && (
                  <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>
                    {purchases.length === 0 ? "Todavía no hay compras registradas." : "Ninguna compra coincide con la búsqueda."}
                  </div>
                )}
              </div>
            </div>
          )}

          {((view === "purchaseOrders" && hasPerm("purchaseOrders")) || (view === "deliveryNotes" && hasPerm("deliveryNotes"))) && (
            <div className="p-8 text-center" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="text-sm font-semibold mb-1" style={{ color: C.text }}>
                {view === "purchaseOrders" ? "Pedidos a Proveedores" : "Nota de entrega proveedores"}
              </div>
              <div className="text-sm" style={{ color: C.muted }}>Este módulo está en desarrollo — todavía no tiene funcionalidad.</div>
            </div>
          )}

          {!loadingScope && hasPerm("otherExpenses") && view === "otherExpenses" && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>{otherExpenses.length} gasto{otherExpenses.length !== 1 ? "s" : ""} registrado{otherExpenses.length !== 1 ? "s" : ""}</div>
                <button onClick={() => setShowAddExpense(true)} disabled={!canEdit("otherExpenses")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Registrar gasto
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {otherExpenses.map((ex) => (
                  <div key={ex.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-xs" style={{ color: C.muted }}>{fmtDate(ex.expense_date)}</div>
                      <div className="flex items-center gap-1">
                        {canEdit("otherExpenses") && <button onClick={() => setEditingExpense(ex)} style={iconBtnStyle}><Pencil size={14} /></button>}
                        {canDelete("otherExpenses") && <button onClick={() => deleteExpense(ex.id)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                      </div>
                    </div>
                    <div className="text-sm">{ex.description}</div>
                    <div className="text-xs mt-1" style={{ color: C.muted }}>{ex.category || "—"}{ex.supplier_id && <span> · {suppliers.find((s) => s.id === ex.supplier_id)?.name}</span>}</div>
                    <div className="pt-2 mt-2 text-right font-mono font-semibold" style={{ borderTop: `1px solid ${C.border}` }}>{fmtMoney(ex.amount)}</div>
                  </div>
                ))}
                {otherExpenses.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>Todavía no hay gastos registrados.</div>}
              </div>
            </div>
          )}

          {!loadingScope && hasPerm("chartOfAccounts") && view === "chartOfAccounts" && (
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
          )}

          {!loadingScope && hasPerm("taxRates") && view === "taxRates" && (
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
          )}

          {!loadingScope && hasPerm("fiscalReports") && view === "fiscalReports" && (
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="text-sm font-semibold" style={{ color: C.text }}>Reportes DGII 606 (Compras) / 607 (Ventas)</div>
                <input type="month" value={taxReportPeriod} onChange={(e) => setTaxReportPeriod(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }} />
              </div>
              <div className="text-xs mb-3" style={{ color: C.muted }}>Las columnas coinciden con las plantillas oficiales de la DGII (606 y 607). Algunas quedan en blanco porque el sistema no captura ese dato (Tipo de Bienes y Servicios, Tipo de Ingreso, Forma de Pago/Venta) — complétalas antes de subir el archivo a la Oficina Virtual.</div>
              {(() => {
                const periodPurchases = purchases.filter((pu) => (pu.purchase_date || "").slice(0, 7) === taxReportPeriod);
                const periodInvoices = invoices.filter((inv) => inv.status !== "anulada" && (inv.invoice_date || "").slice(0, 7) === taxReportPeriod);
                const purchTotals = periodPurchases.reduce((acc, pu) => {
                  acc.subtotal += Number(pu.service_value ?? pu.total ?? 0);
                  acc.itbis += Number(pu.itbis_amount || 0);
                  acc.itbisRet += Number(pu.itbis_retained || 0);
                  acc.isrRet += Number(pu.isr_retained || 0);
                  acc.total += Number(pu.total || 0);
                  return acc;
                }, { subtotal: 0, itbis: 0, itbisRet: 0, isrRet: 0, total: 0 });
                const salesTotals = periodInvoices.reduce((acc, inv) => {
                  acc.subtotal += Number(inv.subtotal || 0);
                  acc.itbis += Number(inv.itbis || 0);
                  acc.itbisRet += Number(inv.itbis_retained || 0);
                  acc.total += Number(inv.total || 0);
                  return acc;
                }, { subtotal: 0, itbis: 0, itbisRet: 0, total: 0 });

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

                const download606 = () => {
                  const header = [
                    "Líneas", "RNC o Cédula", "Tipo Id", "Tipo Bienes y Servicios Comprados", "NCF", "NCF ó Documento Modificado",
                    "Fecha Comprobante", "Fecha Pago", "Monto Facturado en Servicios", "Monto Facturado en Bienes", "Total Monto Facturado",
                    "ITBIS Facturado", "ITBIS Retenido", "ITBIS sujeto a Proporcionalidad (Art. 349)", "ITBIS llevado al Costo",
                    "ITBIS por Adelantar", "ITBIS percibido en compras", "Tipo de Retención en ISR", "Monto Retención Renta",
                    "ISR Percibido en compras", "Impuesto Selectivo al Consumo", "Otros Impuesto/Tasas", "Monto Propina Legal",
                    "Forma de Pago", "Estatus",
                  ];
                  const rows = periodPurchases.map((pu, idx) => {
                    const sup = suppliers.find((s) => s.id === pu.supplier_id);
                    const itbisAmount = Number(pu.itbis_amount || 0);
                    const itbisRetained = Number(pu.itbis_retained || 0);
                    const isServicio = !!pu.applies_254_06;
                    const montoServicios = isServicio ? Number(pu.service_value || 0) : 0;
                    const montoBienes = isServicio ? 0 : Number(pu.service_value ?? pu.total ?? 0);
                    return [
                      idx + 1, sup?.rnc || "", tipoId(sup?.rnc), "", pu.invoice_number || "", "",
                      (pu.purchase_date || "").replaceAll("-", ""), "", montoServicios.toFixed(2), montoBienes.toFixed(2), (montoServicios + montoBienes).toFixed(2),
                      itbisAmount.toFixed(2), itbisRetained.toFixed(2), "", "",
                      Math.max(itbisAmount - itbisRetained, 0).toFixed(2), "", pu.retains_isr ? "02" : "", Number(pu.isr_retained || 0).toFixed(2),
                      "", "", "", "",
                      "", "",
                    ];
                  });
                  downloadCsv(`606_${taxReportPeriod}.csv`, header, rows);
                };
                const download607 = () => {
                  const header = [
                    "No", "RNC/Cédula o Pasaporte", "Tipo Identificación", "Número Comprobante Fiscal", "Número Comprobante Fiscal Modificado",
                    "Tipo de Ingreso", "Fecha Comprobante", "Fecha de Retención", "Monto Facturado", "ITBIS Facturado", "ITBIS Retenido por Terceros",
                    "ITBIS Percibido", "Retención Renta por Terceros", "ISR Percibido", "Impuesto Selectivo al Consumo", "Otros Impuestos/Tasas",
                    "Monto Propina Legal", "Efectivo", "Cheque/ Transferencia/ Depósito", "Tarjeta Débito/Crédito", "Venta a Crédito",
                    "Bonos o Certificados de Regalo", "Permuta", "Otras Formas de Ventas", "Estatus",
                  ];
                  const rows = periodInvoices.map((inv, idx) => {
                    const cli = clients.find((c) => c.id === inv.client_id);
                    return [
                      idx + 1, cli?.rnc_cedula || "", tipoId(cli?.rnc_cedula), inv.ncf || "", "",
                      "", (inv.invoice_date || "").replaceAll("-", ""), inv.applies_norma_0205 ? (inv.invoice_date || "").replaceAll("-", "") : "", Number(inv.subtotal || 0).toFixed(2), Number(inv.itbis || 0).toFixed(2), Number(inv.itbis_retained || 0).toFixed(2),
                      "", "", "", "", "",
                      "", "", "", "", "",
                      "", "", "", "",
                    ];
                  });
                  downloadCsv(`607_${taxReportPeriod}.csv`, header, rows);
                };

                return (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>606 · Compras ({periodPurchases.length})</div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(purchTotals.subtotal)}</span></div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS facturado</span><span className="font-mono">{fmtMoney(purchTotals.itbis)}</span></div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS retenido</span><span className="font-mono">{fmtMoney(purchTotals.itbisRet)}</span></div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ISR retenido</span><span className="font-mono">{fmtMoney(purchTotals.isrRet)}</span></div>
                        <div className="flex justify-between text-sm font-semibold mt-1" style={{ color: C.text }}><span>Total</span><span className="font-mono">{fmtMoney(purchTotals.total)}</span></div>
                        <button onClick={download606} disabled={periodPurchases.length === 0} className="flex items-center gap-2 mt-3 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                          <FileText size={13} /> Descargar 606 (CSV)
                        </button>
                      </div>
                      <div className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.muted }}>607 · Ventas ({periodInvoices.length})</div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>Subtotal</span><span className="font-mono">{fmtMoney(salesTotals.subtotal)}</span></div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS facturado</span><span className="font-mono">{fmtMoney(salesTotals.itbis)}</span></div>
                        <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS retenido</span><span className="font-mono">{fmtMoney(salesTotals.itbisRet)}</span></div>
                        <div className="flex justify-between text-sm font-semibold mt-1" style={{ color: C.text }}><span>Total</span><span className="font-mono">{fmtMoney(salesTotals.total)}</span></div>
                        <button onClick={download607} disabled={periodInvoices.length === 0} className="flex items-center gap-2 mt-3 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                          <FileText size={13} /> Descargar 607 (CSV)
                        </button>
                      </div>
                    </div>
                    <div className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.amber}60` }}>
                      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.amber }}>Cálculo general del período</div>
                      <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS facturado en ventas</span><span className="font-mono">{fmtMoney(salesTotals.itbis)}</span></div>
                      <div className="flex justify-between text-sm" style={{ color: C.muted }}><span>ITBIS facturado en compras (adelantado)</span><span className="font-mono">-{fmtMoney(purchTotals.itbis)}</span></div>
                      <div className="flex justify-between text-sm font-bold mt-1" style={{ color: C.text }}><span>ITBIS a pagar (o a favor si es negativo)</span><span className="font-mono">{fmtMoney(salesTotals.itbis - purchTotals.itbis)}</span></div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {!loadingScope && hasPerm("salesReports") && view === "salesReports" && (
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
          )}

          {!loadingScope && hasPerm("financialReports") && view === "financialReports" && (
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
                    <div className="flex justify-between pt-2"><span style={{ color: C.muted }}>Compras a proveedores</span><span className="font-mono" style={{ color: C.red }}>-{fmtMoney(financialPnl.purchasesCost)}</span></div>
                    <div className="flex justify-between"><span style={{ color: C.muted }}>Otros gastos</span><span className="font-mono" style={{ color: C.red }}>-{fmtMoney(financialPnl.otherExpensesCost)}</span></div>
                    <div className="flex justify-between font-bold text-base pt-2" style={{ borderTop: `1px solid ${C.border}`, color: financialPnl.netIncome >= 0 ? C.green : C.red }}>
                      <span>Utilidad neta</span><span className="font-mono">{fmtMoney(financialPnl.netIncome)}</span>
                    </div>
                  </div>
                  <div className="text-xs mt-3" style={{ color: C.muted }}>Montos sin ITBIS. No incluye mano de obra ni materiales consumidos en órdenes (eso se ve por orden en Departamento Técnico).</div>
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
          )}

          {!loadingScope && hasPerm("bankReconciliation") && view === "bankReconciliation" && (
            <div>
              {(() => {
                const inRange = (d) => d >= financialDateFrom && d <= financialDateTo;
                const txInRange = bankTransactions.filter((t) => inRange(t.transaction_date));
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
                      {canEdit("bankReconciliation") && (
                        <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer" style={{ border: `1px solid ${C.border}`, color: C.amber }}>
                          <Upload size={14} /> {importingBankStatement ? "Importando..." : "Importar estado de cuenta"}
                          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" disabled={importingBankStatement} onChange={(e) => { if (e.target.files?.[0]) importBankStatement(e.target.files[0]); e.target.value = ""; }} />
                        </label>
                      )}
                      {loadingFinancial && <div className="text-sm" style={{ color: C.muted }}>Buscando posibles coincidencias...</div>}
                    </div>
                    <div className="text-xs mb-4" style={{ color: C.muted }}>
                      Sube el estado de cuenta exportado de tu banco (CSV o Excel) con columnas de Fecha, Descripción y Monto (o Crédito/Débito por separado). El sistema busca automáticamente un cobro, pago o gasto registrado con el mismo monto y una fecha cercana.
                    </div>

                    <div className="flex gap-3 flex-wrap mb-6">
                      <KpiCard label="Movimientos del banco" value={txInRange.length} accent={C.blue} sub={fmtMoney(totalBank)} />
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
                            <div className="col-span-2 text-right font-mono" style={{ color: tx.amount >= 0 ? C.green : C.red }}>{fmtMoney(tx.amount)}</div>
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
          )}

          {!loadingScope && hasPerm("supplierReceipts") && view === "supplierReceipts" && (
            <div>
              <div className="text-sm mb-3" style={{ color: C.muted }}>{allPurchasePayments.length} recibo{allPurchasePayments.length !== 1 ? "s" : ""} de pago a proveedores</div>
              <div className="overflow-x-auto" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-3">Proveedor</div>
                  <div className="col-span-2">Factura</div>
                  <div className="col-span-2">Fecha de pago</div>
                  <div className="col-span-2">Método</div>
                  <div className="col-span-3 text-right">Monto</div>
                </div>
                {allPurchasePayments.map((pay) => {
                  const pu = purchases.find((p) => p.id === pay.purchase_id);
                  return (
                    <div key={pay.id} className="grid grid-cols-12 gap-2 min-w-[860px] px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <div className="col-span-3 truncate">{suppliers.find((s) => s.id === pu?.supplier_id)?.name || "—"}</div>
                      <div className="col-span-2 truncate" style={{ color: C.muted }}>{pu?.invoice_number || "—"}</div>
                      <div className="col-span-2" style={{ color: C.muted }}>{fmtDate(pay.payment_date)}</div>
                      <div className="col-span-2" style={{ color: C.muted }}>{pay.method || "—"}</div>
                      <div className="col-span-3 text-right font-mono" style={{ color: C.green }}>{fmtMoney(pay.amount)}</div>
                    </div>
                  );
                })}
                {allPurchasePayments.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>Todavía no hay pagos registrados a proveedores.</div>}
              </div>
            </div>
          )}

          {!loadingScope && hasPerm("purchaseLedger") && view === "purchaseLedger" && (
            <div>
              <div className="text-sm mb-3" style={{ color: C.muted }}>{purchases.length} factura{purchases.length !== 1 ? "s" : ""} de proveedor recibida{purchases.length !== 1 ? "s" : ""}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {purchases.map((pu) => {
                  const payCfg = PAYABLE_STATUS_CFG[pu.payment_status] || PAYABLE_STATUS_CFG.pendiente;
                  const sup = suppliers.find((s) => s.id === pu.supplier_id);
                  return (
                    <div key={pu.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{sup?.name || "—"}</div>
                          <div className="text-xs truncate" style={{ color: C.muted }}>{sup?.rnc || ""}</div>
                        </div>
                        <div className="text-xs flex-shrink-0" style={{ color: payCfg.color }}>{payCfg.label}</div>
                      </div>
                      <div className="text-xs mt-1" style={{ color: C.muted }}>Factura: {pu.invoice_number || "—"}</div>
                      <div className="flex items-center justify-between pt-2 mt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted }}>{fmtDate(pu.purchase_date)}</span>
                        <span className="font-mono font-semibold">{fmtMoney(pu.total)}</span>
                      </div>
                      <div className="flex items-center justify-end gap-3 mt-2">
                        <button onClick={() => openPurchaseDetail(pu)} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}><FileText size={13} /> Detalle</button>
                      </div>
                    </div>
                  );
                })}
                {purchases.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>Todavía no hay facturas de proveedor registradas.</div>}
              </div>
            </div>
          )}

          {!loadingScope && hasPerm("receivables") && view === "receivables" && (
            <div>
              {(() => {
                const pending = invoices.filter((inv) => inv.status !== "anulada" && (Number(inv.total) - Number(inv.amount_paid || 0) - Number(inv.credit_applied || 0)) > 0.009)
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
          )}

          {!loadingScope && hasPerm("payables") && view === "payables" && (
            <div>
              {(() => {
                const pending = purchases.filter((pu) => (Number(pu.total) - Number(pu.amount_paid || 0)) > 0.009)
                  .map((pu) => ({ ...pu, balance: Number(pu.total) - Number(pu.amount_paid || 0), days: Math.max(0, Math.floor((Date.now() - new Date(pu.purchase_date).getTime()) / 86400000)) }))
                  .sort((a, b) => b.days - a.days);
                const totalPending = pending.reduce((s, pu) => s + pu.balance, 0);
                return (
                  <>
                    <div className="flex justify-between items-center mb-3">
                      <div className="text-sm" style={{ color: C.muted }}>{pending.length} compra{pending.length !== 1 ? "s" : ""} pendiente{pending.length !== 1 ? "s" : ""} de pago</div>
                      <div className="text-lg font-mono font-bold" style={{ color: C.red }}>{fmtMoney(totalPending)}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {pending.map((pu) => (
                        <div key={pu.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{suppliers.find((s) => s.id === pu.supplier_id)?.name || "—"}</div>
                              <div className="text-xs truncate" style={{ color: C.muted }}>{pu.invoice_number || "—"}</div>
                            </div>
                            <div className="text-xs flex-shrink-0" style={{ color: pu.days > 60 ? C.red : C.muted }}>{pu.days} días</div>
                          </div>
                          <div className="flex items-center justify-between pt-2 mt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                            <span style={{ color: C.muted }}>{fmtDate(pu.purchase_date)}</span>
                            <span className="font-mono font-semibold" style={{ color: C.red }}>{fmtMoney(pu.balance)}</span>
                          </div>
                          <div className="flex items-center justify-end gap-3 mt-2">
                            <button onClick={() => openPurchaseDetail(pu)} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}><FileText size={13} /> Detalle</button>
                          </div>
                        </div>
                      ))}
                      {pending.length === 0 && (
                        <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>No hay cuentas por pagar pendientes.</div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {!loadingScope && hasPerm("ncf") && view === "ncf" && (
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
                  return (
                    <div key={s.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
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
                      <div className="text-xs font-mono mb-2" style={{ color: C.muted }}>{s.range_start} – {s.range_end}</div>
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
          )}

          {!loadingScope && hasPerm("dgiiCatalog") && view === "dgiiCatalog" && (
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
          )}

          {!loadingScope && hasPerm("quotes") && view === "quotes" && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>
                  {filteredQuotes.length}{filteredQuotes.length !== quotes.length ? ` de ${quotes.length}` : ""} cotizaciones{selectedQuotes.size > 0 ? ` · ${selectedQuotes.size} seleccionadas` : ""}
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
          )}

          {!loadingScope && hasPerm("salesOrders") && view === "salesOrders" && (
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
          )}

          {!loadingScope && hasPerm("invoices") && view === "invoices" && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>{filteredInvoices.length}{filteredInvoices.length !== invoices.length ? ` de ${invoices.length}` : ""} facturas emitidas</div>
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
          )}

          {!loadingScope && hasPerm("caja") && view === "caja" && (
            <div>
              {(() => {
                const activeBranchId = isVendedor ? profile.branch_id : (cajaBranch || branches[0]?.id || "");
                const activeBranchName = branches.find((b) => b.id === activeBranchId)?.name || "—";
                const openSession = cashSessions.find((s) => s.branch_id === activeBranchId && s.status === "abierta");
                const closedSessions = cashSessions.filter((s) => s.branch_id === activeBranchId && s.status === "cerrada").slice(0, 15);

                const sums = {};
                sessionPayments.forEach((p) => { sums[p.method] = (sums[p.method] || 0) + Number(p.amount); });
                const cashSoFar = sums["Efectivo"] || 0;
                const cardSoFar = sums["Tarjeta"] || 0;
                const transferSoFar = (sums["Transferencia"] || 0) + (sums["Otro"] || 0);
                const expected = {
                  cash: Number(openSession?.opening_amount || 0) + cashSoFar,
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
                            <div className="text-xs" style={{ color: C.muted }}>Desde {new Date(openSession.opened_at).toLocaleString("es-DO")} · Fondo inicial {fmtMoney(openSession.opening_amount)}</div>
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
                        {sessionPayments.length > 0 && (
                          <div className="text-xs mt-3" style={{ color: C.muted }}>{sessionPayments.length} cobro{sessionPayments.length !== 1 ? "s" : ""} registrado{sessionPayments.length !== 1 ? "s" : ""} en esta caja.</div>
                        )}
                      </div>
                    )}

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
                            <div className="col-span-3 text-right font-mono font-semibold" style={{ color: Math.abs(diff) > 0.01 ? (diff > 0 ? C.blue : C.red) : C.green }}>{diff > 0 ? "+" : ""}{fmtMoney(diff)}</div>
                          </div>
                        );
                      })}
                      {closedSessions.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>Todavía no hay cuadres cerrados en esta sucursal.</div>}
                    </div>

                    {showOpenCaja && (
                      <CashOpenModal branchName={activeBranchName} saving={saving} onClose={() => setShowOpenCaja(false)} onSave={(amt) => openCashSession(activeBranchId, amt)} />
                    )}
                    {showCloseCaja && openSession && (
                      <CashCloseModal session={openSession} branchName={activeBranchName} expected={expected} saving={saving} onClose={() => setShowCloseCaja(false)} onSave={(declared) => closeCashSession(openSession, declared)} />
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {!loadingScope && hasPerm("creditNotes") && view === "creditNotes" && (
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
          )}

          {!loadingScope && hasPerm("recurringContracts") && view === "recurringContracts" && (
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
                        <div>Monto: <span style={{ color: C.text }} className="font-mono">{fmtMoney(c.amount)}{c.is_taxable ? " +ITBIS" : ""}</span></div>
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
          )}

          {!loadingScope && hasPerm("users") && view === "users" && (
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
          )}

          {!loadingScope && hasPerm("companyProfile") && view === "companyProfile" && (
            <CompanyProfileForm company={company} bankAccounts={companyBankAccounts} onSave={saveCompanyProfile} onSaveBankAccount={saveBankAccount} onDeleteBankAccount={deleteBankAccount} onSetDefaultBankAccount={setDefaultBankAccount} saving={saving} />
          )}

          {!loadingScope && hasPerm("activityLog") && view === "activityLog" && (
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
                {activityLogFiltered.map((l) => {
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
                      <div className="text-xs mt-1" style={{ color: C.muted }}>Por: <span style={{ color: C.text }}>{activityUserName(l.changed_by_email)}</span></div>
                    </div>
                  );
                })}
                {!loadingActivityLog && activityLogFiltered.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>No hay actividad registrada en este rango.</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {showOrderForm && <OrderFormModal branches={branches} equipment={equipment} technicians={technicians} onClose={() => setShowOrderForm(false)} onSave={createOrder} saving={saving} />}
      {showBulkOrders && <BulkOrderFormModal branches={branches} equipment={equipment} technicians={technicians} onClose={() => setShowBulkOrders(false)} onSave={createBulkOrders} saving={saving} />}
      {editingOrder && <OrderFormModal branches={branches} equipment={equipment} technicians={technicians} initial={editingOrder} initialExtraTechIds={orderTechnicians.filter((wt) => wt.work_order_id === editingOrder.id).map((wt) => wt.technician_id)} attachments={editingOrderAttachments} onDeleteAttachment={deleteOrderAttachment} onClose={() => { setEditingOrder(null); setEditingOrderAttachments([]); }} onSave={updateOrder} saving={saving} />}
      {orderFromIncident && (
        <OrderFormModal
          branches={branches}
          equipment={equipment}
          technicians={technicians}
          initial={{ title: orderFromIncident.title, branch_id: orderFromIncident.branch_id, equipment_id: orderFromIncident.equipment_id }}
          onClose={() => setOrderFromIncident(null)}
          onSave={(payload, files, extraTechIds) => createOrder(payload, files, extraTechIds, orderFromIncident.incidentId)}
          saving={saving}
        />
      )}
      {orderFromSalesOrder && (
        <OrderFormModal
          branches={branches}
          equipment={equipment}
          technicians={technicians}
          initial={{ title: orderFromSalesOrder.title, branch_id: orderFromSalesOrder.branch_id, equipment_id: orderFromSalesOrder.equipment_id }}
          onClose={() => setOrderFromSalesOrder(null)}
          onSave={(payload, files, extraTechIds) => createOrder(payload, files, extraTechIds, null, orderFromSalesOrder.salesOrderId)}
          saving={saving}
        />
      )}
      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          attachments={detailOrderAttachments}
          checklistItems={detailOrderChecklist}
          checklistTemplates={checklistTemplates}
          companyName={companyName}
          branchName={branchName}
          equipName={equipName}
          techName={techName}
          technicians={technicians}
          extraTechnicianIds={orderTechnicians.filter((wt) => wt.work_order_id === detailOrder.id).map((wt) => wt.technician_id)}
          materials={materials}
          onConsumeMaterial={consumeMaterialStock}
          canManageWarehouse={canManage}
          onSaveSignature={saveClientSignature}
          onClose={() => { setDetailOrder(null); setDetailOrderAttachments([]); setDetailOrderChecklist([]); }}
          onSave={saveOrderDetail}
          saving={saving}
          readOnly={(isTecnico && detailOrder.status === "completada") || !canEdit("orders")}
          isTecnico={isTecnico}
          onLoadChecklist={loadChecklistFromTemplate}
          onToggleChecklistItem={toggleChecklistItem}
          onChecklistFieldChange={editChecklistItemField}
          onChecklistFieldBlur={saveChecklistItemField}
          onClearChecklist={clearOrderChecklist}
        />
      )}
      {showAddChecklist && <ChecklistTemplateFormModal onClose={() => setShowAddChecklist(false)} onSave={saveChecklistTemplate} saving={saving} />}
      {editingChecklist && <ChecklistTemplateFormModal initial={editingChecklist} onClose={() => setEditingChecklist(null)} onSave={saveChecklistTemplate} saving={saving} />}
      {showAddBranch && <BranchFormModal onClose={() => setShowAddBranch(false)} onSave={saveBranch} saving={saving} />}
      {editingBranch && <BranchFormModal initial={editingBranch} onClose={() => setEditingBranch(null)} onSave={saveBranch} saving={saving} />}
      {showAddTech && <TechFormModal branches={branches} onClose={() => setShowAddTech(false)} onSave={saveTech} saving={saving} />}
      {editingTech && <TechFormModal branches={branches} initial={editingTech} onClose={() => setEditingTech(null)} onSave={saveTech} saving={saving} />}
      {showAddEquipment && (
        <EquipmentFormModal branches={branches} locations={locations} technicians={technicians} onClose={() => setShowAddEquipment(false)} onSave={saveEquipment} saving={saving}
          onRequestNewLocation={(branchId) => { setPendingLocationBranch(branchId); setShowAddLocation(true); }} />
      )}
      {editingEquipment && (
        <EquipmentFormModal branches={branches} locations={locations} technicians={technicians} initial={editingEquipment} onClose={() => setEditingEquipment(null)} onSave={saveEquipment} saving={saving}
          onRequestNewLocation={(branchId) => { setPendingLocationBranch(branchId); setShowAddLocation(true); }} />
      )}
      {showAddLocation && <LocationFormModal branches={branches} defaultBranchId={pendingLocationBranch} onClose={() => setShowAddLocation(false)} onSave={addLocation} saving={saving} />}
      {historyFor && <HistoryModal title={historyFor.title} orders={historyFor.orders} branchName={branchName} equipName={equipName} techName={techName} onClose={() => setHistoryFor(null)} />}
      {showAddClient && <ClientFormModal onClose={() => setShowAddClient(false)} onSave={saveClient} saving={saving} />}
      {editingClient && <ClientFormModal initial={editingClient} onClose={() => setEditingClient(null)} onSave={saveClient} saving={saving} />}
      {showAddAsset && <ClientAssetFormModal clients={clients} branches={branches} technicians={technicians} onClose={() => setShowAddAsset(false)} onSave={saveClientAsset} saving={saving} onRequestNewClient={() => setShowAddClient(true)} />}
      {editingAsset && <ClientAssetFormModal clients={clients} branches={branches} technicians={technicians} initial={editingAsset} onClose={() => setEditingAsset(null)} onSave={saveClientAsset} saving={saving} onRequestNewClient={() => setShowAddClient(true)} />}
      {showAddProduct && (
        <ProductFormModal
          existingProducts={products.filter((p) => (p.item_type || "producto") === (view === "services" ? "servicio" : "producto"))}
          allProducts={products}
          branches={branches}
          restrictToBranchIds={!isAdmin && profile.branch_id ? [profile.branch_id, ...(profile.extra_branch_ids || [])] : null}
          defaultItemType={view === "services" ? "servicio" : "producto"}
          onClose={() => setShowAddProduct(false)}
          onSave={saveProduct}
          saving={saving}
        />
      )}
      {editingProduct && (
        <ProductFormModal
          initial={editingProduct}
          initialComponents={productComponents.filter((c) => c.parent_product_id === editingProduct.id)}
          existingProducts={products.filter((p) => (p.item_type || "producto") === (editingProduct.item_type || "producto"))}
          allProducts={products}
          branches={branches}
          restrictToBranchIds={!isAdmin && profile.branch_id ? [profile.branch_id, ...(profile.extra_branch_ids || [])] : null}
          onClose={() => setEditingProduct(null)}
          onSave={saveProduct}
          saving={saving}
        />
      )}
      {showAddSupplier && <SupplierFormModal onClose={() => setShowAddSupplier(false)} onSave={saveSupplier} saving={saving} />}
      {editingSupplier && <SupplierFormModal initial={editingSupplier} onClose={() => setEditingSupplier(null)} onSave={saveSupplier} saving={saving} />}
      {showAddExpense && <ExpenseFormModal suppliers={suppliers} onClose={() => setShowAddExpense(false)} onSave={saveExpense} saving={saving} />}
      {editingExpense && <ExpenseFormModal suppliers={suppliers} initial={editingExpense} onClose={() => setEditingExpense(null)} onSave={saveExpense} saving={saving} />}
      {showAddTool && <ToolFormModal branches={branches} technicians={technicians} onClose={() => setShowAddTool(false)} onSave={saveTool} saving={saving} />}
      {editingTool && <ToolFormModal branches={branches} technicians={technicians} initial={editingTool} onClose={() => setEditingTool(null)} onSave={saveTool} saving={saving} />}
      {showAddToolList && <ToolListFormModal tools={tools} technicians={technicians} onClose={() => setShowAddToolList(false)} onSave={saveToolList} saving={saving} />}
      {editingToolList && <ToolListFormModal tools={tools} technicians={technicians} initial={editingToolList} onClose={() => setEditingToolList(null)} onSave={saveToolList} saving={saving} />}
      {showBulkTools && <BulkToolFormModal branches={branches} technicians={technicians} onClose={() => setShowBulkTools(false)} onSave={createBulkTools} saving={saving} />}
      {showAddMaterial && <MaterialFormModal branches={branches} onClose={() => setShowAddMaterial(false)} onSave={saveMaterial} saving={saving} />}
      {editingMaterial && <MaterialFormModal branches={branches} initial={editingMaterial} onClose={() => setEditingMaterial(null)} onSave={saveMaterial} saving={saving} />}
      {showAddProject && <ProjectFormModal branches={branches} clients={clients} technicians={technicians} onClose={() => setShowAddProject(false)} onSave={saveProject} saving={saving} />}
      {editingProject && (
        <ProjectFormModal
          branches={branches} clients={clients} technicians={technicians} initial={editingProject}
          onClose={() => setEditingProject(null)} onSave={saveProject} saving={saving}
        />
      )}
      {projectDetail && (
        <ProjectDetailModal
          project={projectDetail} clients={clients} branches={branches} technicians={technicians}
          orders={orders} salesOrders={salesOrders} materials={materials} projectMaterials={projectMaterials}
          canEditProjects={canEdit("projects")} canDeleteProjects={canDelete("projects")} saving={saving}
          onClose={() => setProjectDetail(null)}
          onEdit={(p) => { setProjectDetail(null); setEditingProject(p); }}
          onDelete={deleteProject}
          onSetStatus={setProjectStatus}
          onLinkOrder={linkOrderToProject}
          onUnlinkOrder={unlinkOrderFromProject}
          onLinkSalesOrder={linkSalesOrderToProject}
          onUnlinkSalesOrder={unlinkSalesOrderFromProject}
          onAddMaterial={addProjectMaterial}
          onRemoveMaterial={removeProjectMaterial}
        />
      )}
      {showAddAccount && <AccountFormModal onClose={() => setShowAddAccount(false)} onSave={saveAccount} saving={saving} />}
      {editingAccount && <AccountFormModal initial={editingAccount} onClose={() => setEditingAccount(null)} onSave={saveAccount} saving={saving} />}
      {showAddTaxRate && <TaxRateFormModal onClose={() => setShowAddTaxRate(false)} onSave={saveTaxRate} saving={saving} />}
      {editingTaxRate && <TaxRateFormModal initial={editingTaxRate} onClose={() => setEditingTaxRate(null)} onSave={saveTaxRate} saving={saving} />}
      {editingPermissionsFor && <UserPermissionsModal user={editingPermissionsFor} branches={branches} onClose={() => setEditingPermissionsFor(null)} onSave={updateUserPermissions} onUpdateBranch={updateUserBranch} onUpdateRole={updateUserRole} onToggleActive={toggleUserActive} saving={saving} />}
      {showAddPurchase && (
        <PurchaseFormModal
          suppliers={suppliers}
          products={products}
          onClose={() => setShowAddPurchase(false)}
          onSave={createPurchase}
          saving={saving}
          onRequestNewSupplier={() => setShowAddSupplier(true)}
          onEnsureGenericProduct={ensureGenericPurchaseProduct}
        />
      )}
      {purchaseDetail && (
        <PurchaseDetailModal
          purchase={purchaseDetail.purchase}
          items={purchaseDetail.items}
          payments={purchaseDetail.payments}
          supplierName={suppliers.find((s) => s.id === purchaseDetail.purchase.supplier_id)?.name || "—"}
          supplierRnc={suppliers.find((s) => s.id === purchaseDetail.purchase.supplier_id)?.rnc || ""}
          companyName={companyName}
          company={company}
          canEdit={canEdit("purchases")}
          canDelete={canDelete("purchases")}
          onClose={() => setPurchaseDetail(null)}
          onRegisterPayment={registerPurchasePayment}
          onDeletePayment={deletePurchasePayment}
        />
      )}
      {showAddNcf && <NCFSequenceFormModal onClose={() => setShowAddNcf(false)} onSave={saveNcfSequence} saving={saving} />}
      {editingNcf && <NCFSequenceFormModal initial={editingNcf} onClose={() => setEditingNcf(null)} onSave={saveNcfSequence} saving={saving} />}
      {showAddInvoice && (
        <InvoiceFormModal
          clients={clients}
          products={products}
          ncfSequences={ncfSequences}
          branches={branches}
          bankAccounts={companyBankAccounts}
          defaultBranchId={profile.branch_id}
          prefill={invoicePrefill}
          maxDiscountPct={maxDiscountPct}
          onClose={() => { setShowAddInvoice(false); setInvoicePrefill(null); }}
          onSave={createInvoice}
          saving={saving}
          onRequestNewClient={() => setShowAddClient(true)}
        />
      )}
      {showAddQuote && (
        <QuoteFormModal
          clients={clients}
          products={products}
          prefill={quotePrefill}
          maxDiscountPct={maxDiscountPct}
          onClose={() => { setShowAddQuote(false); setQuotePrefill(null); }}
          onSave={(payload, items) => createQuote(payload, items, quotePrefill?.incidentId)}
          saving={saving}
          onRequestNewClient={() => setShowAddClient(true)}
        />
      )}
      {quoteDetail && (
        <QuoteDetailModal
          quote={quoteDetail.quote}
          items={quoteDetail.items}
          clientName={clients.find((c) => c.id === quoteDetail.quote.client_id)?.name || "—"}
          clientRnc={clients.find((c) => c.id === quoteDetail.quote.client_id)?.rnc_cedula || ""}
          clientAddress={clients.find((c) => c.id === quoteDetail.quote.client_id)?.address || ""}
          companyName={companyName}
          company={company}
          bankAccounts={companyBankAccounts}
          orderInfo={salesOrders.find((o) => o.quote_id === quoteDetail.quote.id) || null}
          canEdit={canEdit("quotes")}
          canDelete={canDelete("quotes")}
          onClose={() => setQuoteDetail(null)}
          onMarkStatus={markQuoteStatus}
          onConvertToOrder={convertQuoteToOrder}
          onEdit={openEditQuote}
          onDuplicate={duplicateQuote}
          onDelete={deleteQuote}
        />
      )}
      {salesOrderDetail && (
        <SalesOrderDetailModal
          order={salesOrderDetail.order}
          items={salesOrderDetail.items}
          clientName={clients.find((c) => c.id === salesOrderDetail.order.client_id)?.name || "—"}
          clientRnc={clients.find((c) => c.id === salesOrderDetail.order.client_id)?.rnc_cedula || ""}
          companyName={companyName}
          company={company}
          workOrderInfo={orders.find((o) => o.id === salesOrderDetail.order.work_order_id) || null}
          canEdit={canEdit("salesOrders")}
          canDelete={canDelete("salesOrders")}
          onClose={() => setSalesOrderDetail(null)}
          onGenerateInvoice={generateInvoiceFromOrder}
          onGenerateWorkOrder={convertSalesOrderToWorkOrder}
          onCancel={cancelSalesOrder}
          onDelete={deleteSalesOrder}
          onUpdateNotes={updateSalesOrderNotes}
        />
      )}
      {editingQuote && (
        <QuoteFormModal
          clients={clients}
          products={products}
          initial={editingQuote}
          initialItems={editingQuoteItems}
          maxDiscountPct={maxDiscountPct}
          onClose={() => { setEditingQuote(null); setEditingQuoteItems(null); }}
          onSave={updateQuote}
          saving={saving}
          onRequestNewClient={() => setShowAddClient(true)}
        />
      )}
      {showAddIncident && (
        <IncidentFormModal
          branches={branches}
          equipment={equipment}
          clients={clients}
          technicians={technicians}
          onClose={() => setShowAddIncident(false)}
          onSave={saveIncident}
          saving={saving}
          onRequestNewClient={() => setShowAddClient(true)}
        />
      )}
      {editingIncident && (
        <IncidentFormModal
          branches={branches}
          equipment={equipment}
          clients={clients}
          technicians={technicians}
          initial={editingIncident}
          onClose={() => setEditingIncident(null)}
          onSave={saveIncident}
          saving={saving}
          onRequestNewClient={() => setShowAddClient(true)}
        />
      )}
      {incidentDetail && (
        <IncidentDetailModal
          incident={incidentDetail}
          branchName={branchName}
          equipName={equipName}
          clientName={(id) => clients.find((c) => c.id === id)?.name || "—"}
          techName={techName}
          technicians={technicians}
          orders={orders}
          quotes={quotes}
          canEdit={canEdit("incidents")}
          canDelete={canDelete("incidents")}
          isTecnico={isTecnico}
          onClose={() => setIncidentDetail(null)}
          onMarkStatus={markIncidentStatus}
          onConvertOrder={convertIncidentToOrder}
          onConvertQuote={convertIncidentToQuote}
          onDelete={deleteIncident}
          onSaveProgress={saveIncidentProgress}
          onComplete={completeIncident}
          onEdit={(inc) => { setIncidentDetail(null); setEditingIncident(inc); }}
          onAssignTechnician={assignIncidentTechnician}
          onReopen={reopenIncident}
        />
      )}
      {showStatement && <StatementModal clients={clients} invoices={invoices} companyName={companyName} onClose={() => setShowStatement(false)} />}
      {invoiceDetail && (
        <InvoiceDetailModal
          invoice={invoiceDetail.invoice}
          items={invoiceDetail.items}
          payments={invoiceDetail.payments}
          clientName={clients.find((c) => c.id === invoiceDetail.invoice.client_id)?.name || "—"}
          clientRnc={clients.find((c) => c.id === invoiceDetail.invoice.client_id)?.rnc_cedula || ""}
          clientAddress={clients.find((c) => c.id === invoiceDetail.invoice.client_id)?.address || ""}
          companyName={companyName}
          company={company}
          bankAccounts={companyBankAccounts}
          canEdit={canEdit("invoices")}
          canDelete={canDelete("invoices")}
          isAdmin={isAdmin}
          onClose={() => setInvoiceDetail(null)}
          onVoid={voidInvoice}
          onRegisterPayment={registerPayment}
          onDeletePayment={deletePayment}
          onDeletePaymentAttachment={deletePaymentAttachment}
        />
      )}
      {showAddCreditNote && (
        <CreditNoteFormModal
          invoices={invoices}
          clients={clients}
          ncfSequences={ncfSequences}
          onClose={() => setShowAddCreditNote(false)}
          onSave={createCreditNote}
          saving={saving}
        />
      )}
      {showAddContract && (
        <RecurringContractFormModal
          clients={clients}
          branches={branches}
          ncfSequences={ncfSequences}
          onClose={() => setShowAddContract(false)}
          onSave={saveRecurringContract}
          saving={saving}
        />
      )}
      {editingContract && (
        <RecurringContractFormModal
          clients={clients}
          branches={branches}
          ncfSequences={ncfSequences}
          initial={editingContract}
          onClose={() => setEditingContract(null)}
          onSave={saveRecurringContract}
          saving={saving}
        />
      )}
      {creditNoteDetail && (
        <CreditNoteDetailModal
          note={creditNoteDetail.note}
          items={creditNoteDetail.items}
          invoice={invoices.find((i) => i.id === creditNoteDetail.note.invoice_id) || null}
          clientName={clients.find((c) => c.id === creditNoteDetail.note.client_id)?.name || "—"}
          clientRnc={clients.find((c) => c.id === creditNoteDetail.note.client_id)?.rnc_cedula || ""}
          companyName={companyName}
          company={company}
          onClose={() => setCreditNoteDetail(null)}
        />
      )}
      {showInvite && (
        <InviteFormModal
          technicians={technicians}
          branches={branches}
          saving={saving}
          generatedLink={inviteLink}
          onClose={() => setShowInvite(false)}
          onSave={createInvite}
          onCloseAfterLink={() => { setShowInvite(false); setInviteLink(""); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Punto de entrada: controla sesión / perfil / invitación / onboarding / app
// ---------------------------------------------------------------------------
export default function MantenProApp() {
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get("invite"));
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(undefined);
  const [company, setCompany] = useState(null);
  const [inviteInfo, setInviteInfo] = useState(undefined); // undefined = sin cargar, null = no hay/invalida
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const loadProfile = async (userId) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) { console.error(error); setProfile(null); return; }
    setProfile(data || null);
    if (data?.company_id) {
      const { data: comp } = await supabase.from("companies").select("*").eq("id", data.company_id).single();
      setCompany(comp || null);
    }
  };

  const checkPlatformAdmin = async (userId) => {
    const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
    setIsPlatformAdmin(!!data);
  };

  const loadInvite = async () => {
    if (!inviteToken) { setInviteInfo(null); return; }
    const { data, error } = await supabase.from("invites").select("*").eq("token", inviteToken).eq("used", false).maybeSingle();
    if (error || !data) { setInviteInfo(null); return; }
    const { data: comp } = await supabase.from("companies").select("name").eq("id", data.company_id).single();
    setInviteInfo({ ...data, companyName: comp?.name || "tu nueva empresa" });
  };

  useEffect(() => {
    loadInvite();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) { await loadProfile(session.user.id); await checkPlatformAdmin(session.user.id); }
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(session);
      if (session) {
        setAuthLoading(true);
        await loadProfile(session.user.id);
        await checkPlatformAdmin(session.user.id);
        setAuthLoading(false);
      } else {
        setProfile(undefined);
        setCompany(null);
        setIsPlatformAdmin(false);
      }
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line
  }, []);

  const signOut = () => supabase.auth.signOut();

  if (authLoading || inviteInfo === undefined) return <FullScreenLoader label="Cargando..." />;
  if (!session) return <AuthScreen inviteInfo={inviteInfo} />;

  if (passwordRecovery) {
    return <ChangePasswordModal title="Pon tu nueva contraseña" onDone={() => setPasswordRecovery(false)} />;
  }

  if (profile === undefined) return <FullScreenLoader label="Cargando tu perfil..." />;

  if (profile === null && inviteInfo) {
    return <InviteAcceptScreen session={session} inviteInfo={inviteInfo} onDone={() => loadProfile(session.user.id)} onSignOut={signOut} />;
  }
  if (profile === null && isPlatformAdmin) {
    return <SupportViewer onSignOut={signOut} />;
  }
  if (profile === null) return <OnboardingScreen userId={session.user.id} userEmail={session.user.email} onDone={() => loadProfile(session.user.id)} />;

  if (profile.is_active === false) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center" style={{ background: "#12151A", color: "#E7EAF0", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div className="max-w-sm text-center p-6">
          <div className="text-lg font-bold mb-2">Cuenta desactivada</div>
          <div className="text-sm mb-5" style={{ color: "#8B92A0" }}>Tu acceso fue desactivado por un administrador de tu empresa. Si crees que es un error, contáctalo directamente.</div>
          <button onClick={signOut} className="px-4 py-2 text-sm font-semibold" style={{ background: "#F2A93B", color: "#1A1500" }}>Cerrar sesión</button>
        </div>
      </div>
    );
  }

  return <Dashboard session={session} profile={profile} company={company} onUpdateCompany={setCompany} onSignOut={signOut} />;
}
