import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import {
  LayoutDashboard, ClipboardList, Users, Building2, Plus, X, Search,
  CheckCircle2, MapPin, Wrench, Trash2, ArrowRight, Loader2, LogOut,
  Settings2, Pencil, ShieldCheck, Copy, Mail, FileText, Paperclip, ImageIcon, BarChart3, History
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend
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

const ROLE_CFG = {
  admin: { label: "Admin", color: C.amber },
  supervisor: { label: "Supervisor", color: C.blue },
  tecnico: { label: "Técnico", color: C.muted },
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
const iconBtnStyle = { color: C.muted };

function FullScreenLoader({ label }) {
  return (
    <div className="w-full min-h-[720px] flex items-center justify-center gap-3" style={{ background: C.bg, color: C.muted }}>
      <Loader2 size={20} className="animate-spin" /> {label}
    </div>
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
function OrderFormModal({ branches, equipment, technicians, initial, onClose, onSave, saving }) {
  const [branchId, setBranchId] = useState(initial?.branch_id || branches[0]?.id || "");
  const [type, setType] = useState(initial?.type || "preventivo");
  const [priority, setPriority] = useState(initial?.priority || "media");
  const [title, setTitle] = useState(initial?.title || "");
  const [equipmentId, setEquipmentId] = useState(initial?.equipment_id || "");
  const [technicianId, setTechnicianId] = useState(initial?.technician_id || "");
  const [scheduled, setScheduled] = useState(initial?.scheduled || "");

  const branchEquip = equipment.filter((e) => e.branch_id === branchId);
  const branchTechs = technicians.filter((t) => t.branch_id === branchId);

  const submit = () => {
    if (!title.trim() || !branchId || !scheduled) return;
    onSave({ branch_id: branchId, equipment_id: equipmentId || null, technician_id: technicianId || null, type, priority, title: title.trim(), scheduled });
  };

  return (
    <Modal title={initial ? "Editar orden de trabajo" : "Nueva orden de trabajo"} onClose={onClose} wide>
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
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Crear orden"}
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
  return (
    <Modal title={initial ? "Editar técnico" : "Agregar técnico"} onClose={onClose}>
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
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}

function EquipmentFormModal({ branches, locations, initial, onClose, onSave, saving, onRequestNewLocation }) {
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.type || "");
  const [brand, setBrand] = useState(initial?.brand || "");
  const [model, setModel] = useState(initial?.model || "");
  const [serial, setSerial] = useState(initial?.serial_number || "");
  const [installedAt, setInstalledAt] = useState(initial?.installed_at || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || branches[0]?.id || "");
  const [locationId, setLocationId] = useState(initial?.location_id || "");

  const branchLocations = locations.filter((l) => l.branch_id === branchId);

  const submit = () => {
    if (!name.trim() || !branchId) return;
    onSave({
      name: name.trim(), type: type.trim() || null, brand: brand.trim() || null, model: model.trim() || null,
      serial_number: serial.trim() || null, installed_at: installedAt || null, branch_id: branchId, location_id: locationId || null,
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

function InviteFormModal({ technicians, onClose, onSave, saving, generatedLink, onCloseAfterLink }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("tecnico");
  const [technicianId, setTechnicianId] = useState("");

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
    <Modal title="Invitar usuario" onClose={onClose}>
      <Field label="Correo electrónico">
        <input className={inputClass} style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@correo.com" />
      </Field>
      <Field label="Rol">
        <select className={inputClass} style={inputStyle} value={role} onChange={(e) => { setRole(e.target.value); setTechnicianId(""); }}>
          <option value="tecnico">Técnico (solo ve y actualiza sus propias órdenes)</option>
          <option value="supervisor">Supervisor (puede crear y editar todo, menos invitar usuarios)</option>
          <option value="admin">Admin (control total)</option>
        </select>
      </Field>
      {role === "tecnico" && (
        <Field label="Vincular a un técnico existente (opcional)">
          <select className={inputClass} style={inputStyle} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
            <option value="">Sin vincular</option>
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={() => email.trim() && onSave(email.trim(), role, technicianId || null)} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Creando..." : "Crear invitación"}
        </button>
      </div>
    </Modal>
  );
}

function OrderDetailModal({ order, branchName, equipName, techName, onClose, onSave, saving, readOnly }) {
  const [notes, setNotes] = useState(order.resolution_notes || "");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(order.photo_url || "");
  const t = TYPE_CFG[order.type], p = PRIORITY_CFG[order.priority], s = STATUS_CFG[order.status];

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
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
        <div>Técnico<br /><span style={{ color: C.text }}>{techName(order.technician_id)}</span></div>
      </div>

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

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>{readOnly ? "Cerrar" : "Cancelar"}</button>
        {!readOnly && (
          <button onClick={() => onSave(order, notes, photoFile)} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
            {saving ? "Guardando..." : "Guardar"}
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
function Dashboard({ session, profile, companyName, onSignOut }) {
  const companyId = profile.company_id;
  const canManage = profile.role === "admin" || profile.role === "supervisor";
  const isAdmin = profile.role === "admin";
  const isTecnico = profile.role === "tecnico";

  const [loadingScope, setLoadingScope] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [branches, setBranches] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [locations, setLocations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [invites, setInvites] = useState([]);

  const [branchFilter, setBranchFilter] = useState("all");
  const [view, setView] = useState("dashboard");

  const [showOrderForm, setShowOrderForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
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
  const [historyFor, setHistoryFor] = useState(null); // { title, orders }
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadAll = async () => {
    setLoadingScope(true);
    const [br, tech, eq, loc, ord, profs, inv] = await Promise.all([
      supabase.from("branches").select("*").eq("company_id", companyId).order("name"),
      supabase.from("technicians").select("*").eq("company_id", companyId).order("name"),
      supabase.from("equipment").select("*").eq("company_id", companyId).order("name"),
      supabase.from("locations").select("*").eq("company_id", companyId).order("name"),
      supabase.from("work_orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("company_id", companyId).order("created_at"),
      isAdmin ? supabase.from("invites").select("*").eq("company_id", companyId).eq("used", false).order("created_at") : Promise.resolve({ data: [] }),
    ]);
    if (br.error) setErrorMsg(br.error.message);
    setBranches(br.data || []);
    setTechnicians(tech.data || []);
    setEquipment(eq.data || []);
    setLocations(loc.data || []);
    setOrders(ord.data || []);
    setProfiles(profs.data || []);
    setInvites(inv.data || []);
    setLoadingScope(false);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [companyId]);

  const visibleOrders = useMemo(
    () => isTecnico ? orders.filter((o) => o.technician_id === profile.technician_id) : orders,
    [orders, isTecnico, profile.technician_id]
  );
  const scopedOrders = useMemo(() => visibleOrders.filter((o) => branchFilter === "all" || o.branch_id === branchFilter), [visibleOrders, branchFilter]);
  const filteredOrders = useMemo(() => scopedOrders.filter((o) => {
    if (typeFilter !== "all" && o.type !== typeFilter) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search && !o.title.toLowerCase().includes(search.toLowerCase()) && !(o.code || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [scopedOrders, typeFilter, statusFilter, search]);

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
    return { ...t, total: own.length, active: own.filter((o) => o.status !== "completada").length, completed: own.filter((o) => o.status === "completada").length };
  }), [technicians, orders]);

  const equipStats = useMemo(() => equipment.map((eq) => {
    const own = orders.filter((o) => o.equipment_id === eq.id);
    return { ...eq, total: own.length, correctivo: own.filter((o) => o.type === "correctivo").length, open: own.filter((o) => o.status !== "completada").length };
  }), [equipment, orders]);

  const techChartData = useMemo(() => techStats.map((t) => ({ name: t.name.split(" ")[0], Activas: t.active, Completadas: t.completed })), [techStats]);
  const equipChartData = useMemo(
    () => [...equipStats].sort((a, b) => b.correctivo - a.correctivo).slice(0, 8).map((eq) => ({ name: eq.name, Correctivos: eq.correctivo })),
    [equipStats]
  );

  // ---- Órdenes ----
  const createOrder = async (payload) => {
    setSaving(true);
    const code = `OT-${String(orders.length + 1).padStart(4, "0")}`;
    const { data, error } = await supabase.from("work_orders").insert({ ...payload, code, company_id: companyId, status: "pendiente" }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => [data, ...prev]);
    setShowOrderForm(false);
  };

  const updateOrder = async (payload) => {
    setSaving(true);
    const { data, error } = await supabase.from("work_orders").update(payload).eq("id", editingOrder.id).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setEditingOrder(null);
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

  const saveOrderDetail = async (order, notes, photoFile) => {
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
    const { data, error } = await supabase.from("work_orders").update({ resolution_notes: notes, photo_url }).eq("id", order.id).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    setDetailOrder(null);
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

  // ---- Técnicos ----
  const saveTech = async (name, specialty, branchId) => {
    setSaving(true);
    if (editingTech) {
      const { data, error } = await supabase.from("technicians").update({ name, specialty, branch_id: branchId }).eq("id", editingTech.id).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTechnicians((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      setEditingTech(null);
    } else {
      const { data, error } = await supabase.from("technicians").insert({ company_id: companyId, branch_id: branchId, name, specialty }).select().single();
      setSaving(false);
      if (error) { setErrorMsg(error.message); return; }
      setTechnicians((prev) => [...prev, data]);
      setShowAddTech(false);
    }
  };

  const deleteTech = async (id) => {
    if (!window.confirm("¿Eliminar este técnico?")) return;
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

  const addLocation = async (name, branchId) => {
    setSaving(true);
    const { data, error } = await supabase.from("locations").insert({ company_id: companyId, branch_id: branchId, name }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setLocations((prev) => [...prev, data]);
    setShowAddLocation(false);
  };

  // ---- Usuarios / invitaciones ----
  const createInvite = async (email, role, technicianId) => {
    setSaving(true);
    const { data, error } = await supabase.from("invites").insert({ company_id: companyId, email, role, technician_id: technicianId }).select().single();
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

  const NAV = [
    { key: "dashboard", label: "Panel", Icon: LayoutDashboard },
    { key: "orders", label: "Órdenes de trabajo", Icon: ClipboardList },
    ...(canManage ? [{ key: "equipment", label: "Equipos", Icon: Settings2 }] : []),
    ...(canManage ? [{ key: "technicians", label: "Técnicos", Icon: Users }] : []),
    ...(canManage ? [{ key: "branches", label: "Sucursales", Icon: Building2 }] : []),
    ...(canManage ? [{ key: "reports", label: "Reportes", Icon: BarChart3 }] : []),
    ...(isAdmin ? [{ key: "users", label: "Usuarios", Icon: ShieldCheck }] : []),
  ];

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
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="text-xs truncate" style={{ color: C.muted }}>{session.user.email}</div>
          <div className="text-[10px] mt-1 mb-2" style={{ color: ROLE_CFG[profile.role]?.color }}>{ROLE_CFG[profile.role]?.label}</div>
          <button onClick={onSignOut} className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
            <LogOut size={13} /> Cerrar sesión
          </button>
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
            <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <Building2 size={14} color={C.amber} />
              {companyName}
            </div>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
              <option value="all">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {canManage && (
            <button onClick={() => setShowOrderForm(true)} disabled={branches.length === 0} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
              <Plus size={16} /> Nueva orden
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loadingScope && <FullScreenLoader label="Cargando datos..." />}

          {!loadingScope && view === "dashboard" && (
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

          {!loadingScope && view === "orders" && (
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
                  <div className="col-span-1">Sucursal</div>
                  <div className="col-span-2">Técnico</div>
                  <div className="col-span-1">Prioridad</div>
                  <div className="col-span-1">Fecha</div>
                  <div className="col-span-2 text-right">Estado</div>
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
                      <div className="col-span-1 truncate" style={{ color: C.muted }}>{branchName(o.branch_id)}</div>
                      <div className="col-span-2 truncate">{techName(o.technician_id)}</div>
                      <div className="col-span-1"><Pill label={p.label} color={p.color} /></div>
                      <div className="col-span-1 text-xs" style={{ color: C.muted }}>{fmtDate(o.scheduled)}</div>
                      <div className="col-span-2 flex items-center justify-end gap-2">
                        {isTecnico && o.status === "completada" ? (
                          <Pill label={s.label} color={s.color} />
                        ) : (
                          <button onClick={() => cycleStatus(o)} title="Avanzar estado" className="flex items-center gap-1 text-xs px-2 py-1" style={{ color: s.color, border: `1px solid ${s.color}40` }}>
                            {s.label} <ArrowRight size={12} />
                          </button>
                        )}
                        <button onClick={() => setDetailOrder(o)} title={isTecnico && o.status === "completada" ? "Ver nota y foto" : "Nota de cierre y foto"} style={{ color: o.resolution_notes || o.photo_url ? C.amber : C.muted }}>
                          {o.photo_url ? <Paperclip size={14} /> : <FileText size={14} />}
                        </button>
                        {canManage && (
                          <>
                            <button onClick={() => setEditingOrder(o)} style={iconBtnStyle}><Pencil size={14} /></button>
                            <button onClick={() => deleteOrder(o.id)} style={iconBtnStyle}><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredOrders.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>Ninguna orden coincide con los filtros aplicados.</div>}
              </div>
            </div>
          )}

          {!loadingScope && canManage && view === "equipment" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{equipment.length} equipos</div>
                <div className="flex gap-2">
                  <button onClick={() => { setPendingLocationBranch(branchFilter !== "all" ? branchFilter : branches[0]?.id); setShowAddLocation(true); }} disabled={branches.length === 0} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.text }}>
                    <Plus size={14} /> Agregar ubicación
                  </button>
                  <button onClick={() => setShowAddEquipment(true)} disabled={branches.length === 0} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                    <Plus size={14} /> Agregar equipo
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {equipment.filter((e) => branchFilter === "all" || e.branch_id === branchFilter).map((eq) => {
                  const openOrders = orders.filter((o) => o.equipment_id === eq.id && o.status !== "completada").length;
                  return (
                    <div key={eq.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{eq.name}</div>
                        <div className="flex items-center gap-2">
                          {openOrders > 0 && <Pill label={`${openOrders} abierta${openOrders !== 1 ? "s" : ""}`} color={C.amber} />}
                          <button onClick={() => setEditingEquipment(eq)} style={iconBtnStyle}><Pencil size={13} /></button>
                          <button onClick={() => deleteEquipment(eq.id)} style={iconBtnStyle}><Trash2 size={13} /></button>
                        </div>
                      </div>
                      {eq.type && <div className="text-xs mt-0.5" style={{ color: C.muted }}>{eq.type}</div>}
                      <div className="text-xs mt-3 space-y-1" style={{ color: C.muted }}>
                        {eq.brand && <div>Marca: <span style={{ color: C.text }}>{eq.brand}</span></div>}
                        {eq.model && <div>Modelo: <span style={{ color: C.text }}>{eq.model}</span></div>}
                        {eq.serial_number && <div className="font-mono">S/N: <span style={{ color: C.text }}>{eq.serial_number}</span></div>}
                        {eq.installed_at && <div>Instalado: <span style={{ color: C.text }}>{fmtDate(eq.installed_at)}</span></div>}
                        {locationName(eq.location_id) && <div>Ubicación: <span style={{ color: C.text }}>{locationName(eq.location_id)}</span></div>}
                      </div>
                      <div className="flex items-center gap-1 text-xs mt-3" style={{ color: C.muted }}><MapPin size={12} /> {branchName(eq.branch_id)}</div>
                    </div>
                  );
                })}
                {equipment.length === 0 && <div className="text-sm" style={{ color: C.muted }}>Todavía no hay equipos registrados.</div>}
                {branches.length === 0 && <div className="text-sm" style={{ color: C.muted }}>Primero crea una sucursal para poder agregar equipos.</div>}
              </div>
            </div>
          )}

          {!loadingScope && canManage && view === "technicians" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{technicians.length} técnicos</div>
                <button onClick={() => setShowAddTech(true)} disabled={branches.length === 0} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Agregar técnico
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {technicians.filter((t) => branchFilter === "all" || t.branch_id === branchFilter).map((t) => {
                  const active = orders.filter((o) => o.technician_id === t.id && o.status !== "completada").length;
                  return (
                    <div key={t.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{t.name}</div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingTech(t)} style={iconBtnStyle}><Pencil size={13} /></button>
                          <button onClick={() => deleteTech(t.id)} style={iconBtnStyle}><Trash2 size={13} /></button>
                        </div>
                      </div>
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

          {!loadingScope && canManage && view === "branches" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{branches.length} sucursales</div>
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
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold"><Building2 size={16} color={C.amber} /> {b.name}</div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingBranch(b)} style={iconBtnStyle}><Pencil size={13} /></button>
                          <button onClick={() => deleteBranch(b.id)} style={iconBtnStyle}><Trash2 size={13} /></button>
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

          {!loadingScope && canManage && view === "reports" && (
            <div>
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Desempeño por técnico</div>
              <div className="p-4 mb-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={techChartData} margin={{ left: -20 }}>
                    <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
                    <Tooltip contentStyle={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }} cursor={{ fill: C.panelAlt }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: C.muted }} />
                    <Bar dataKey="Activas" stackId="a" fill={C.amber} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Completadas" stackId="a" fill={C.green} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-4">Técnico</div>
                  <div className="col-span-2 text-center">Activas</div>
                  <div className="col-span-2 text-center">Completadas</div>
                  <div className="col-span-2 text-center">Total</div>
                  <div className="col-span-2 text-right">Historial</div>
                </div>
                {techStats.map((t) => (
                  <div key={t.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="col-span-4">
                      <div>{t.name}</div>
                      <div className="text-xs" style={{ color: C.muted }}>{t.specialty}</div>
                    </div>
                    <div className="col-span-2 text-center font-mono" style={{ color: t.active > 0 ? C.amber : C.muted }}>{t.active}</div>
                    <div className="col-span-2 text-center font-mono" style={{ color: C.green }}>{t.completed}</div>
                    <div className="col-span-2 text-center font-mono">{t.total}</div>
                    <div className="col-span-2 text-right">
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
              <div style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-4">Equipo</div>
                  <div className="col-span-2 text-center">Abiertas</div>
                  <div className="col-span-2 text-center">Correctivas</div>
                  <div className="col-span-2 text-center">Total</div>
                  <div className="col-span-2 text-right">Historial</div>
                </div>
                {equipStats.map((eq) => (
                  <div key={eq.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="col-span-4">
                      <div>{eq.name}</div>
                      <div className="text-xs" style={{ color: C.muted }}>{branchName(eq.branch_id)}</div>
                    </div>
                    <div className="col-span-2 text-center font-mono" style={{ color: eq.open > 0 ? C.amber : C.muted }}>{eq.open}</div>
                    <div className="col-span-2 text-center font-mono" style={{ color: eq.correctivo > 0 ? C.red : C.muted }}>{eq.correctivo}</div>
                    <div className="col-span-2 text-center font-mono">{eq.total}</div>
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

          {!loadingScope && isAdmin && view === "users" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: C.muted }}>{profiles.length} usuarios · {invites.length} invitaciones pendientes</div>
                <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
                  <Mail size={14} /> Invitar usuario
                </button>
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Miembros de la empresa</div>
              <div className="mb-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                {profiles.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <div>{p.full_name || p.email}</div>
                      <div className="text-xs" style={{ color: C.muted }}>{p.email}</div>
                    </div>
                    <Pill label={ROLE_CFG[p.role]?.label || p.role} color={ROLE_CFG[p.role]?.color || C.muted} />
                  </div>
                ))}
              </div>

              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Invitaciones pendientes</div>
              <div style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                {invites.map((i) => (
                  <div key={i.id} className="flex items-center justify-between px-4 py-3 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <div>{i.email}</div>
                      <div className="text-xs" style={{ color: C.muted }}>Pendiente de aceptar</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Pill label={ROLE_CFG[i.role]?.label || i.role} color={ROLE_CFG[i.role]?.color || C.muted} />
                      <button onClick={() => cancelInvite(i.id)} style={iconBtnStyle}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                {invites.length === 0 && <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>No hay invitaciones pendientes.</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {showOrderForm && <OrderFormModal branches={branches} equipment={equipment} technicians={technicians} onClose={() => setShowOrderForm(false)} onSave={createOrder} saving={saving} />}
      {editingOrder && <OrderFormModal branches={branches} equipment={equipment} technicians={technicians} initial={editingOrder} onClose={() => setEditingOrder(null)} onSave={updateOrder} saving={saving} />}
      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          branchName={branchName}
          equipName={equipName}
          techName={techName}
          onClose={() => setDetailOrder(null)}
          onSave={saveOrderDetail}
          saving={saving}
          readOnly={isTecnico && detailOrder.status === "completada"}
        />
      )}
      {showAddBranch && <BranchFormModal onClose={() => setShowAddBranch(false)} onSave={saveBranch} saving={saving} />}
      {editingBranch && <BranchFormModal initial={editingBranch} onClose={() => setEditingBranch(null)} onSave={saveBranch} saving={saving} />}
      {showAddTech && <TechFormModal branches={branches} onClose={() => setShowAddTech(false)} onSave={saveTech} saving={saving} />}
      {editingTech && <TechFormModal branches={branches} initial={editingTech} onClose={() => setEditingTech(null)} onSave={saveTech} saving={saving} />}
      {showAddEquipment && (
        <EquipmentFormModal branches={branches} locations={locations} onClose={() => setShowAddEquipment(false)} onSave={saveEquipment} saving={saving}
          onRequestNewLocation={(branchId) => { setPendingLocationBranch(branchId); setShowAddLocation(true); }} />
      )}
      {editingEquipment && (
        <EquipmentFormModal branches={branches} locations={locations} initial={editingEquipment} onClose={() => setEditingEquipment(null)} onSave={saveEquipment} saving={saving}
          onRequestNewLocation={(branchId) => { setPendingLocationBranch(branchId); setShowAddLocation(true); }} />
      )}
      {showAddLocation && <LocationFormModal branches={branches} defaultBranchId={pendingLocationBranch} onClose={() => setShowAddLocation(false)} onSave={addLocation} saving={saving} />}
      {historyFor && <HistoryModal title={historyFor.title} orders={historyFor.orders} branchName={branchName} equipName={equipName} techName={techName} onClose={() => setHistoryFor(null)} />}
      {showInvite && (
        <InviteFormModal
          technicians={technicians}
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

  const loadProfile = async (userId) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) { console.error(error); setProfile(null); return; }
    setProfile(data || null);
    if (data?.company_id) {
      const { data: comp } = await supabase.from("companies").select("*").eq("id", data.company_id).single();
      setCompany(comp || null);
    }
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
      if (session) await loadProfile(session.user.id);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        setAuthLoading(true);
        await loadProfile(session.user.id);
        setAuthLoading(false);
      } else {
        setProfile(undefined);
        setCompany(null);
      }
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line
  }, []);

  const signOut = () => supabase.auth.signOut();

  if (authLoading || inviteInfo === undefined) return <FullScreenLoader label="Cargando..." />;
  if (!session) return <AuthScreen inviteInfo={inviteInfo} />;
  if (profile === undefined) return <FullScreenLoader label="Cargando tu perfil..." />;

  if (profile === null && inviteInfo) {
    return <InviteAcceptScreen session={session} inviteInfo={inviteInfo} onDone={() => loadProfile(session.user.id)} onSignOut={signOut} />;
  }
  if (profile === null) return <OnboardingScreen userId={session.user.id} userEmail={session.user.email} onDone={() => loadProfile(session.user.id)} />;

  return <Dashboard session={session} profile={profile} companyName={company?.name || "Tu empresa"} onSignOut={signOut} />;
}
