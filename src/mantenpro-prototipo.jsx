import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import {
  LayoutDashboard, ClipboardList, Users, Building2, Plus, X, Search,
  ChevronDown, AlertTriangle, CheckCircle2, Zap, MapPin, Wrench,
  Trash2, ArrowRight, Loader2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
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

const PRIORITY_CFG = {
  baja: { label: "Baja", color: C.muted },
  media: { label: "Media", color: C.amber },
  alta: { label: "Alta", color: "#E8894C" },
  critica: { label: "Crítica", color: C.red },
};

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

function KpiCard({ label, value, accent, sub }) {
  return (
    <div className="p-4 flex-1 min-w-[150px]" style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeftWidth: 3, borderLeftColor: accent }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>{label}</div>
      <div className="text-3xl font-bold mt-1 font-mono" style={{ color: C.text }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[85vh] overflow-y-auto`} style={{ background: C.panel, border: `1px solid ${C.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <h3 className="font-semibold text-base" style={{ color: C.text }}>{title}</h3>
          <button onClick={onClose} className="p-1" style={{ color: C.muted }}><X size={18} /></button>
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

function FullScreenLoader({ label }) {
  return (
    <div className="w-full min-h-[720px] flex items-center justify-center gap-3" style={{ background: C.bg, color: C.muted }}>
      <Loader2 size={20} className="animate-spin" /> {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New / Edit order modal
// ---------------------------------------------------------------------------
function OrderFormModal({ branches, equipment, technicians, onClose, onSave, saving }) {
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  const [type, setType] = useState("preventivo");
  const [priority, setPriority] = useState("media");
  const [title, setTitle] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [scheduled, setScheduled] = useState("");

  const branchEquip = equipment.filter((e) => e.branch_id === branchId);
  const branchTechs = technicians.filter((t) => t.branch_id === branchId);

  const submit = () => {
    if (!title.trim() || !branchId || !scheduled) return;
    onSave({
      branch_id: branchId,
      equipment_id: equipmentId || null,
      technician_id: technicianId || null,
      type,
      priority,
      title: title.trim(),
      scheduled,
    });
  };

  return (
    <Modal title="Nueva orden de trabajo" onClose={onClose} wide>
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
        <Field label="Sucursal">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => { setBranchId(e.target.value); setEquipmentId(""); setTechnicianId(""); }}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Equipo">
          <select className={inputClass} style={inputStyle} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
            <option value="">Sin especificar</option>
            {branchEquip.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
          </select>
        </Field>
        <Field label="Técnico asignado">
          <select className={inputClass} style={inputStyle} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
            <option value="">Sin asignar</option>
            {branchTechs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : "Crear orden"}
        </button>
      </div>
    </Modal>
  );
}

function AddCompanyModal({ onClose, onSave, saving }) {
  const [name, setName] = useState("");
  return (
    <Modal title="Agregar nueva empresa" onClose={onClose}>
      <Field label="Nombre de la empresa">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Refrigeración del Caribe" />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => name.trim() && onSave(name.trim())} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Creando..." : "Crear empresa"}
        </button>
      </div>
    </Modal>
  );
}

function AddBranchModal({ onClose, onSave, saving }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  return (
    <Modal title="Agregar sucursal" onClose={onClose}>
      <Field label="Nombre de la sucursal">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Bávaro" />
      </Field>
      <Field label="Ciudad">
        <input className={inputClass} style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ej. Punta Cana" />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => name.trim() && onSave(name.trim(), city.trim())} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Agregando..." : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}

function AddTechModal({ branches, onClose, onSave, saving }) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  return (
    <Modal title="Agregar técnico" onClose={onClose}>
      <Field label="Nombre completo">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. José Manuel Cruz" />
      </Field>
      <Field label="Especialidad">
        <input className={inputClass} style={inputStyle} value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Ej. Refrigeración industrial" />
      </Field>
      <Field label="Sucursal">
        <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => name.trim() && branchId && onSave(name.trim(), specialty.trim(), branchId)} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Agregando..." : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------
export default function MantenProApp() {
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingScope, setLoadingScope] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [companies, setCompanies] = useState([]);
  const [branches, setBranches] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [orders, setOrders] = useState([]);

  const [companyId, setCompanyId] = useState(null);
  const [branchFilter, setBranchFilter] = useState("all");
  const [view, setView] = useState("dashboard");
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);

  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [showAddTech, setShowAddTech] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("companies").select("*").order("created_at");
      if (error) setErrorMsg(error.message);
      else {
        setCompanies(data || []);
        if (data && data.length > 0) setCompanyId(data[0].id);
      }
      setLoadingCompanies(false);
    })();
  }, []);

  useEffect(() => {
    if (!companyId) return;
    setLoadingScope(true);
    (async () => {
      const [br, tech, eq, ord] = await Promise.all([
        supabase.from("branches").select("*").eq("company_id", companyId).order("name"),
        supabase.from("technicians").select("*").eq("company_id", companyId).order("name"),
        supabase.from("equipment").select("*").eq("company_id", companyId).order("name"),
        supabase.from("work_orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      ]);
      if (br.error) setErrorMsg(br.error.message);
      setBranches(br.data || []);
      setTechnicians(tech.data || []);
      setEquipment(eq.data || []);
      setOrders(ord.data || []);
      setBranchFilter("all");
      setLoadingScope(false);
    })();
  }, [companyId]);

  const scopedOrders = useMemo(
    () => orders.filter((o) => branchFilter === "all" || o.branch_id === branchFilter),
    [orders, branchFilter]
  );

  const filteredOrders = useMemo(() => {
    return scopedOrders.filter((o) => {
      if (typeFilter !== "all" && o.type !== typeFilter) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (search && !o.title.toLowerCase().includes(search.toLowerCase()) && !(o.code || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [scopedOrders, typeFilter, statusFilter, search]);

  const kpi = useMemo(() => {
    const pend = scopedOrders.filter((o) => o.status === "pendiente").length;
    const prog = scopedOrders.filter((o) => o.status === "en_progreso").length;
    const done = scopedOrders.filter((o) => o.status === "completada").length;
    const prev = scopedOrders.filter((o) => o.type === "preventivo" && o.status !== "completada").length;
    return { pend, prog, done, prev, total: scopedOrders.length };
  }, [scopedOrders]);

  const chartData = useMemo(
    () => Object.entries(TYPE_CFG).map(([key, cfg]) => ({
      name: cfg.label,
      value: scopedOrders.filter((o) => o.type === key).length,
      color: cfg.color,
    })),
    [scopedOrders]
  );

  const branchName = (id) => branches.find((b) => b.id === id)?.name || "—";
  const techName = (id) => technicians.find((t) => t.id === id)?.name || "Sin asignar";
  const equipName = (id) => equipment.find((e) => e.id === id)?.name || "—";
  const currentCompany = companies.find((c) => c.id === companyId);

  const createOrder = async (payload) => {
    setSaving(true);
    const code = `OT-${String(orders.length + 1).padStart(4, "0")}`;
    const { data, error } = await supabase
      .from("work_orders")
      .insert({ ...payload, code, company_id: companyId, status: "pendiente" })
      .select()
      .single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => [data, ...prev]);
    setShowOrderForm(false);
  };

  const cycleStatus = async (order) => {
    const seq = ["pendiente", "en_progreso", "completada"];
    const next = seq[(seq.indexOf(order.status) + 1) % seq.length];
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    const { error } = await supabase.from("work_orders").update({ status: next }).eq("id", order.id);
    if (error) setErrorMsg(error.message);
  };

  const deleteOrder = async (orderId) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    const { error } = await supabase.from("work_orders").delete().eq("id", orderId);
    if (error) setErrorMsg(error.message);
  };

  const addCompany = async (name) => {
    setSaving(true);
    const { data, error } = await supabase.from("companies").insert({ name }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setCompanies((prev) => [...prev, data]);
    setCompanyId(data.id);
    setShowAddCompany(false);
  };

  const addBranch = async (name, city) => {
    setSaving(true);
    const { data, error } = await supabase.from("branches").insert({ company_id: companyId, name, city }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setBranches((prev) => [...prev, data]);
    setShowAddBranch(false);
  };

  const addTech = async (name, specialty, branchId) => {
    setSaving(true);
    const { data, error } = await supabase.from("technicians").insert({ company_id: companyId, branch_id: branchId, name, specialty }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setTechnicians((prev) => [...prev, data]);
    setShowAddTech(false);
  };

  const NAV = [
    { key: "dashboard", label: "Panel", Icon: LayoutDashboard },
    { key: "orders", label: "Órdenes de trabajo", Icon: ClipboardList },
    { key: "technicians", label: "Técnicos", Icon: Users },
    { key: "branches", label: "Sucursales", Icon: Building2 },
  ];

  if (loadingCompanies) return <FullScreenLoader label="Cargando empresas..." />;

  return (
    <div className="w-full min-h-[720px] flex" style={{ background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="w-56 flex-shrink-0 flex flex-col" style={{ background: C.panel, borderRight: `1px solid ${C.border}` }}>
        <div className="px-5 py-5 flex items-center gap-2" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="w-7 h-7 flex items-center justify-center" style={{ background: C.amber }}>
            <Wrench size={16} color="#1A1500" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight leading-none">MantenPro</div>
            <div className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: C.muted }}>Multi-empresa</div>
          </div>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setView(key)} className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left"
              style={{ color: view === key ? C.text : C.muted, background: view === key ? C.panelAlt : "transparent", borderLeft: `2px solid ${view === key ? C.amber : "transparent"}` }}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 text-[11px]" style={{ color: C.muted, borderTop: `1px solid ${C.border}` }}>
          Conectado a Supabase — datos reales
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {errorMsg && (
          <div className="px-4 py-2 text-xs flex items-center justify-between" style={{ background: "#3A2020", color: C.red }}>
            <span>Error: {errorMsg}</span>
            <button onClick={() => setErrorMsg("")}><X size={14} /></button>
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-3 flex-wrap gap-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button onClick={() => setCompanyMenuOpen((v) => !v)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                <Building2 size={14} color={C.amber} />
                {currentCompany?.name || "Sin empresas"}
                <ChevronDown size={14} color={C.muted} />
              </button>
              {companyMenuOpen && (
                <div className="absolute mt-1 w-56 z-40" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                  {companies.map((c) => (
                    <button key={c.id} onClick={() => { setCompanyId(c.id); setCompanyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm flex items-center justify-between" style={{ color: c.id === companyId ? C.amber : C.text }}>
                      {c.name}
                      {c.id === companyId && <CheckCircle2 size={14} />}
                    </button>
                  ))}
                  <button onClick={() => { setShowAddCompany(true); setCompanyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm flex items-center gap-2" style={{ color: C.amber, borderTop: `1px solid ${C.border}` }}>
                    <Plus size={14} /> Nueva empresa
                  </button>
                </div>
              )}
            </div>

            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
              <option value="all">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <button onClick={() => setShowOrderForm(true)} disabled={!companyId || branches.length === 0} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
            <Plus size={16} /> Nueva orden
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!companyId && (
            <div className="text-sm p-6 text-center" style={{ color: C.muted }}>
              No hay ninguna empresa todavía. Crea la primera con el botón "Nueva empresa" arriba.
            </div>
          )}

          {companyId && loadingScope && <FullScreenLoader label="Cargando datos..." />}

          {companyId && !loadingScope && view === "dashboard" && (
            <div>
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

          {companyId && !loadingScope && view === "orders" && (
            <div>
              <div className="flex flex-wrap gap-2 mb-4">
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
              </div>
              <div style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-3">Orden</div>
                  <div className="col-span-2">Tipo</div>
                  <div className="col-span-2">Sucursal</div>
                  <div className="col-span-2">Técnico</div>
                  <div className="col-span-1">Prioridad</div>
                  <div className="col-span-1">Fecha</div>
                  <div className="col-span-1 text-right">Estado</div>
                </div>
                {filteredOrders.map((o) => {
                  const t = TYPE_CFG[o.type], p = PRIORITY_CFG[o.priority], s = STATUS_CFG[o.status];
                  return (
                    <div key={o.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${t.color}` }}>
                      <div className="col-span-3 min-w-0">
                        <div className="font-mono text-xs" style={{ color: C.muted }}>{o.code}</div>
                        <div className="truncate">{o.title}</div>
                        <div className="text-xs truncate" style={{ color: C.muted }}>{equipName(o.equipment_id)}</div>
                      </div>
                      <div className="col-span-2"><Pill label={t.label} color={t.color} /></div>
                      <div className="col-span-2 truncate" style={{ color: C.muted }}>{branchName(o.branch_id)}</div>
                      <div className="col-span-2 truncate">{techName(o.technician_id)}</div>
                      <div className="col-span-1"><Pill label={p.label} color={p.color} /></div>
                      <div className="col-span-1 text-xs" style={{ color: C.muted }}>{fmtDate(o.scheduled)}</div>
                      <div className="col-span-1 flex items-center justify-end gap-2">
                        <button onClick={() => cycleStatus(o)} title="Avanzar estado" className="flex items-center gap-1 text-xs px-2 py-1" style={{ color: s.color, border: `1px solid ${s.color}40` }}>
                          {s.label} <ArrowRight size={12} />
                        </button>
                        <button onClick={() => deleteOrder(o.id)} style={{ color: C.muted }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })}
                {filteredOrders.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>Ninguna orden coincide con los filtros aplicados.</div>}
              </div>
            </div>
          )}

          {companyId && !loadingScope && view === "technicians" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{technicians.length} técnicos en {currentCompany?.name}</div>
                <button onClick={() => setShowAddTech(true)} disabled={branches.length === 0} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Agregar técnico
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {technicians.filter((t) => branchFilter === "all" || t.branch_id === branchFilter).map((t) => {
                  const active = orders.filter((o) => o.technician_id === t.id && o.status !== "completada").length;
                  return (
                    <div key={t.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-sm mt-0.5" style={{ color: C.muted }}>{t.specialty}</div>
                      <div className="flex items-center gap-1 text-xs mt-3" style={{ color: C.muted }}><MapPin size={12} /> {branchName(t.branch_id)}</div>
                      <div className="mt-3 text-xs px-2 py-1 inline-block" style={{ background: C.panelAlt, color: active > 0 ? C.amber : C.muted }}>
                        {active} orden{active !== 1 ? "es" : ""} activa{active !== 1 ? "s" : ""}
                      </div>
                    </div>
                  );
                })}
                {branches.length === 0 && <div className="text-sm" style={{ color: C.muted }}>Primero crea una sucursal para poder agregar técnicos.</div>}
              </div>
            </div>
          )}

          {companyId && !loadingScope && view === "branches" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{branches.length} sucursales en {currentCompany?.name}</div>
                <button onClick={() => setShowAddBranch(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
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
                      <div className="flex items-center gap-2 font-semibold"><Building2 size={16} color={C.amber} /> {b.name}</div>
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
        </div>
      </div>

      {showOrderForm && <OrderFormModal branches={branches} equipment={equipment} technicians={technicians} onClose={() => setShowOrderForm(false)} onSave={createOrder} saving={saving} />}
      {showAddCompany && <AddCompanyModal onClose={() => setShowAddCompany(false)} onSave={addCompany} saving={saving} />}
      {showAddBranch && <AddBranchModal onClose={() => setShowAddBranch(false)} onSave={addBranch} saving={saving} />}
      {showAddTech && <AddTechModal branches={branches} onClose={() => setShowAddTech(false)} onSave={addTech} saving={saving} />}
    </div>
  );
}
