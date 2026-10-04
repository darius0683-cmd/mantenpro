// Departamento Técnico: órdenes, incidentes, equipos, checklists, herramientas, almacén y proyectos.
// Se carga solo cuando se usa (ver lazy.jsx).

import React from "react";
import { useState, useRef, useEffect, useMemo } from "react";
import { ImageIcon, FileText, X, Plus, Pencil, Trash2, CheckCircle2, Unlink, Link2, Upload, Layers, AlertTriangle } from "lucide-react";
import { supabase } from "../supabaseClient";
import { OrderVisitsSection } from "./visitas.jsx";
import { getOrderDetails, hasPendingFor, isNetworkError, isOnline, newId, patchOrderDetails, perform, useOfflineState } from "./offline.jsx";
import { ActivityHistorySection, C, Field, INCIDENT_STATUS_CFG, LEFTOVER_CONDITIONS, Modal, returnMaterialLine, PRIORITY_CFG, PROJECT_STATUS_CFG, Pill, STATUS_CFG, SearchSelect, TOOL_STATUS_CFG, TYPE_CFG, extractChecklistItemsFromPdf, fmtDate, fmtMoney, iconBtnStyle, inputClass, inputStyle, printDocument, techWorksAtBranch, todayStrRD } from "./base.jsx";

export function UsageQuickUpdate({ item, onUpdate }) {
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

// ---------------------------------------------------------------------------
// Modales: sucursal / técnico / equipo / ubicación (con soporte de edición)
// ---------------------------------------------------------------------------
export function OrderFormModal({ branches, equipment, technicians, clients, initial, initialExtraTechIds, attachments, onDeleteAttachment, onClose, onSave, saving }) {
  const [clientId, setClientId] = useState(initial?.client_id || "");
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
    onSave({ branch_id: branchId, equipment_id: equipmentId || null, technician_id: technicianId || null, type, priority, title: title.trim(), scheduled, deadline: deadline || null, ...(clients ? { client_id: clientId || null } : {}) }, files, extraTechIds.filter((id) => id !== technicianId));
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
        {clients && (
          <div className="col-span-2">
            <Field label="Cliente (opcional — la verá en su portal)">
              <SearchSelect items={[{ id: "", name: "Sin cliente" }, ...clients]} value={clientId} onChange={setClientId} placeholder="Buscar cliente..." getLabel={(c) => c.name} />
            </Field>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Sucursal">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => { setBranchId(e.target.value); setEquipmentId(""); setTechnicianId(""); setExtraTechIds([]); }}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Equipo">
          <select className={inputClass} style={inputStyle} value={equipmentId} onChange={(e) => { setEquipmentId(e.target.value); const owner = equipment.find((x) => x.id === e.target.value)?.client_id; if (owner) setClientId(owner); }}>
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

export function BranchFormModal({ initial, onClose, onSave, saving }) {
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

export function TechFormModal({ branches, initial, onClose, onSave, saving }) {
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

export function EquipmentFormModal({ branches, locations, technicians, clients, initial, onClose, onSave, saving, onRequestNewLocation }) {
  const [clientId, setClientId] = useState(initial?.client_id || "");
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
  const [operationalStatus, setOperationalStatus] = useState(initial?.operational_status || "operativo");

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
      operational_status: operationalStatus,
      ...(clients ? { client_id: clientId || null } : {}),
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
        <Field label="Estado operativo">
          <select className={inputClass} style={inputStyle} value={operationalStatus} onChange={(e) => setOperationalStatus(e.target.value)}>
            <option value="operativo">Operativo</option>
            <option value="fuera_servicio">Fuera de servicio</option>
          </select>
        </Field>
        {clients && (
          <Field label="Cliente dueño del equipo (opcional)">
            <SearchSelect items={[{ id: "", name: "Equipo propio / sin cliente" }, ...clients]} value={clientId} onChange={setClientId} placeholder="Buscar cliente..." getLabel={(c) => c.name} />
          </Field>
        )}
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

export function LocationFormModal({ branches, defaultBranchId, onClose, onSave, saving }) {
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

// Agrupa puntos de checklist por "tema" (sección), preservando el orden de aparición
export function groupChecklistItemsBySection(items) {
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
export function checklistItemsToBlocks(items) {
  let n = 0;
  const blocks = [];
  let currentSection = "";
  (items || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0)).forEach((it) => {
    const sec = (it.section || "").trim();
    if (sec !== currentSection) {
      if (sec) blocks.push({ id: n++, kind: "section", name: sec });
      currentSection = sec;
    }
    blocks.push({ id: n++, kind: "item", text: it.text, response_type: it.response_type || "check", range_min: it.range_min ?? "", range_max: it.range_max ?? "" });
  });
  if (blocks.length === 0) blocks.push({ id: n++, kind: "item", text: "", response_type: "check", range_min: "", range_max: "" });
  return blocks;
}

// Marca de la columna "Cotejo" en los reportes impresos, según el tipo de respuesta del punto
// (checkbox de siempre, OK/No OK/N/A, o numérico) — antes solo miraba "checked", así que los
// puntos OK/No OK/N/A y numéricos ya respondidos salían con esa columna vacía en el PDF.
export const checklistItemMark = (it) => {
  if (it.response_type === "ok_no_ok_na") return it.respuesta === "OK" ? "✓" : it.respuesta === "No OK" ? "✗" : it.respuesta === "N/A" ? "N/A" : "";
  if (it.response_type === "numeric") return it.respuesta !== "" && it.respuesta != null ? "✓" : "";
  return it.checked ? "✓" : "";
};

export function checklistPrintHtml({ companyName, order, branchName, equipName, techName, checklistItems }) {
  const groups = groupChecklistItemsBySection(checklistItems || []);
  const showSections = groups.length > 1 || (groups[0] && groups[0].section !== "General");
  const itemRow = (it) => `
    <tr>
      <td style="text-align:center;width:60px;">${checklistItemMark(it)}</td>
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

export function orderServiceReportHtml({ companyName, order, branchName, equipName, techName, clientName, checklistItems, usedMaterials, laborHours, beforePhotos, afterPhotos }) {
  const t = TYPE_CFG[order.type], p = PRIORITY_CFG[order.priority], s = STATUS_CFG[order.status];
  const groups = groupChecklistItemsBySection(checklistItems || []);
  const showSections = groups.length > 1 || (groups[0] && groups[0].section !== "General");
  const itemRow = (it) => `
    <tr>
      <td style="text-align:center;width:50px;">${checklistItemMark(it)}</td>
      <td>${it.text || ""}</td>
      <td>${it.respuesta || ""}</td>
      <td>${it.observaciones || ""}</td>
    </tr>`;
  const checklistRows = showSections
    ? groups.map((g) => `<tr><td colspan="4" style="background:#f2f2f2;font-weight:bold">${g.section}</td></tr>${g.items.map(itemRow).join("")}`).join("")
    : groups.map((g) => g.items.map(itemRow).join("")).join("");
  const materialsRows = (usedMaterials || []).map((m) => `<tr><td>${m.name}</td><td style="text-align:right">${Number(m.quantity || 0).toLocaleString("es-DO")} ${m.unit || ""}</td></tr>`).join("");
  const photoGrid = (photos) => (photos && photos.length > 0)
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">${photos.map((a) => `<img src="${a.file_url}" style="width:140px;height:105px;object-fit:cover;border:1px solid #ccc;" />`).join("")}</div>`
    : `<div class="muted">Sin fotos</div>`;
  return `
    <div class="header-row">
      <div>
        <h1>${companyName || ""}</h1>
        <div class="muted">Informe de servicio &middot; Orden ${order.code}</div>
        ${order.title ? `<div class="muted" style="margin-top:2px">${order.title}</div>` : ""}
      </div>
      <div class="muted">${fmtDate(order.scheduled)}</div>
    </div>
    <div class="muted" style="margin-bottom:4px;">
      Sucursal: ${branchName(order.branch_id)} &nbsp;&middot;&nbsp;
      Equipo: ${equipName(order.equipment_id)} &nbsp;&middot;&nbsp;
      Técnico: ${techName(order.technician_id)}
      ${clientName ? ` &nbsp;&middot;&nbsp; Cliente: ${clientName}` : ""}
    </div>
    <div class="muted" style="margin-bottom:12px;">
      Tipo: ${t?.label || order.type} &nbsp;&middot;&nbsp; Prioridad: ${p?.label || order.priority} &nbsp;&middot;&nbsp; Estado: ${s?.label || order.status}
      ${laborHours ? ` &nbsp;&middot;&nbsp; Horas trabajadas: ${laborHours}` : ""}
    </div>
    ${order.resolution_notes ? `<div style="margin-bottom:12px;"><b>Nota de solución / cierre</b><div class="muted" style="margin-top:2px;white-space:pre-wrap;">${order.resolution_notes}</div></div>` : ""}
    ${checklistRows ? `
      <div style="margin-top:10px;font-weight:bold;">Checklist</div>
      <table><thead><tr><th>Cotejo</th><th>Punto a revisar</th><th>Respuesta</th><th>Observaciones</th></tr></thead><tbody>${checklistRows}</tbody></table>
    ` : ""}
    ${materialsRows ? `
      <div style="margin-top:14px;font-weight:bold;">Materiales retirados del almacén</div>
      <table><thead><tr><th>Material</th><th style="text-align:right">Cantidad</th></tr></thead><tbody>${materialsRows}</tbody></table>
    ` : ""}
    <div style="margin-top:14px;font-weight:bold;">Fotos — antes</div>
    ${photoGrid(beforePhotos)}
    <div style="margin-top:14px;font-weight:bold;">Fotos — después</div>
    ${photoGrid(afterPhotos)}
    ${order.client_signature_url ? `
      <div style="margin-top:18px;padding-top:10px;border-top:1px solid #ddd;">
        <div style="font-weight:bold;margin-bottom:4px;">Firma del cliente</div>
        <img src="${order.client_signature_url}" style="max-width:260px;background:#fff;border:1px solid #ccc;" />
        <div class="muted" style="margin-top:2px;">Firmado por ${order.client_signature_name || ""}${order.client_signature_at ? " — " + fmtDate(order.client_signature_at.slice(0, 10)) : ""}</div>
      </div>
    ` : ""}
  `;
}

export function ClientAssetFormModal({ clients, branches, technicians, initial, onClose, onSave, saving, onRequestNewClient, autoSelectClientId, autoSelectToken }) {
  const [clientId, setClientId] = useState(initial?.client_id || clients[0]?.id || "");
  // Si desde este formulario se creó un cliente nuevo con el "+" (búsqueda en
  // catálogo DGII o manual), lo selecciona solo en cuanto se guarda — sin
  // aplicar tokens que ya existían antes de abrir este formulario.
  const appliedAutoSelectTokenRef = useRef(autoSelectToken);
  useEffect(() => {
    if (autoSelectToken !== appliedAutoSelectTokenRef.current && autoSelectClientId) {
      setClientId(autoSelectClientId);
      appliedAutoSelectTokenRef.current = autoSelectToken;
    }
  }, [autoSelectToken, autoSelectClientId]);
  const [name, setName] = useState(initial?.name || "");
  const [brand, setBrand] = useState(initial?.brand || "");
  const [model, setModel] = useState(initial?.model || "");
  const [serial, setSerial] = useState(initial?.serial_number || "");
  const [installDate, setInstallDate] = useState(initial?.install_date || todayStrRD());
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

export function ToolFormModal({ branches, technicians, initial, onClose, onSave, saving }) {
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

export const MATERIAL_UNITS = ["unidad", "pieza", "metro", "kg", "litro", "galón", "caja", "rollo"];

// ---- Material para órdenes de trabajo y proyectos ----
// Empresa con técnico + comercial: se puede sacar de Productos (los marcados "Disponible para el
// Departamento Técnico", con existencia en la sucursal de la orden) o del almacén técnico (sobrantes).
// Empresa solo técnico: del almacén técnico, como siempre. El descuento y la devolución los hace la
// base de datos (disparadores en work_order_materials / project_materials).
const fmtQty = (n) => Number(n || 0).toLocaleString("es-DO");
export function techMaterialOptions({ techUsesProducts, products, productStock, materials, branchId }) {
  const opts = [];
  if (techUsesProducts) {
    (products || []).filter((p) => p.tech_available && (p.item_type || "producto") !== "servicio" && !p.is_composite).forEach((p) => {
      const qty = Number((productStock || []).find((r) => r.product_id === p.id && r.branch_id === branchId)?.quantity || 0);
      if (qty > 0) opts.push({ id: "p:" + p.id, name: p.name, unit: p.unit, available: qty, sourceLabel: "Productos" });
    });
  }
  (materials || []).filter((m) => Number(m.quantity || 0) > 0).forEach((m) => {
    opts.push({ id: "m:" + m.id, name: m.name, unit: m.unit, available: Number(m.quantity), sourceLabel: m.kind === "sobrante" ? "Sobrante" : techUsesProducts ? "Almacén técnico (anterior)" : "Almacén técnico" });
  });
  return opts;
}
export const techOptionLabel = (o) => `${o.name} — ${o.sourceLabel} (disp. ${fmtQty(o.available)} ${o.unit || ""})`;
// Convierte el id elegido ("p:..." o "m:...") en las columnas del renglón
export const techPickToColumns = (pickId) => (pickId.startsWith("p:") ? { product_id: pickId.slice(2) } : { material_id: pickId.slice(2) });
export function materialLineSource(line, materials) {
  if (line.product_id) return "Productos";
  const mat = (materials || []).find((m) => m.id === line.material_id);
  return mat?.kind === "sobrante" ? "Sobrante" : "Almacén técnico";
}

// Formulario corto para registrar un sobrante (lo que quedó de un producto usado)
export function LeftoverInlineForm({ defaultName, defaultUnit, onSave, onCancel }) {
  const [name, setName] = useState(defaultName || "");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(defaultUnit || MATERIAL_UNITS[0]);
  const [condition, setCondition] = useState("incompleto");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const units = MATERIAL_UNITS.includes(unit) ? MATERIAL_UNITS : [unit, ...MATERIAL_UNITS];
  const save = async () => {
    const q = Number(String(quantity).replace(",", "."));
    if (!name.trim() || !(q > 0)) return;
    setBusy(true);
    const ok = await onSave({ name: name.trim(), quantity: q, unit, condition, notes: notes.trim() || null });
    setBusy(false);
    if (ok !== false) onCancel();
  };
  return (
    <div className="p-3 mt-1 mb-2 space-y-2" style={{ background: C.panel, border: `1px dashed ${C.amber}` }}>
      <div className="text-xs font-semibold" style={{ color: C.amber }}>Registrar sobrante en el almacén técnico (sin costo, no regresa a Productos)</div>
      <div className="grid grid-cols-12 gap-2">
        <input className={`${inputClass} col-span-12 md:col-span-5 text-xs`} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Descripción" />
        <input type="text" inputMode="decimal" className={`${inputClass} col-span-4 md:col-span-2 text-xs`} style={inputStyle} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Cant." />
        <select className={`${inputClass} col-span-4 md:col-span-2 text-xs`} style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)}>
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select className={`${inputClass} col-span-4 md:col-span-3 text-xs`} style={inputStyle} value={condition} onChange={(e) => setCondition(e.target.value)}>
          {Object.entries(LEFTOVER_CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className={`${inputClass} col-span-12 text-xs`} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional): estado, dónde se guardó..." />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={save} disabled={busy || !name.trim() || !quantity} className="px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{busy ? "Guardando..." : "Guardar sobrante"}</button>
      </div>
    </div>
  );
}


export function ToolListFormModal({ tools, technicians, initial, onClose, onSave, saving }) {
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

export function ToolListCard({ list, tools, technicians, canEdit, canDelete, onEdit, onDelete, onAssign, onReturn }) {
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

export function TechnicianToolRow({ tool, technicians, myTechnicianId, activeLoan, onConfirmReceipt, onLend, onReturn }) {
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

export function BulkToolFormModal({ branches, technicians, onClose, onSave, saving }) {
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


export function MaterialFormModal({ branches, initial, leftoverMode, onClose, onSave, saving }) {
  // leftoverMode: la empresa lleva el inventario en Productos; aquí solo se crean sobrantes
  // y la cantidad de los materiales anteriores no se cambia a mano.
  const isLeftover = initial ? initial.kind === "sobrante" : !!leftoverMode;
  const quantityLocked = !!leftoverMode && !!initial && initial.kind !== "sobrante";
  const [condition, setCondition] = useState(initial?.condition || "incompleto");
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [partCode, setPartCode] = useState(initial?.part_code || "");
  const [partNumber, setPartNumber] = useState(initial?.part_number || "");
  const [serialNumber, setSerialNumber] = useState(initial?.serial_number || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || branches[0]?.id || "");
  const [quantity, setQuantity] = useState(initial?.quantity ?? "");
  const [unit, setUnit] = useState(initial?.unit || MATERIAL_UNITS[0]);
  const [minQuantity, setMinQuantity] = useState(initial?.min_quantity ?? "");
  const [maxQuantity, setMaxQuantity] = useState(initial?.max_quantity ?? "");
  const [location, setLocation] = useState(initial?.location || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const submit = () => {
    if (!name.trim() || quantity === "") return;
    onSave({
      name: name.trim(),
      description: description.trim() || null,
      part_code: partCode.trim() || null,
      part_number: partNumber.trim() || null,
      serial_number: serialNumber.trim() || null,
      branch_id: branchId || null,
      quantity: Number(quantity),
      unit,
      min_quantity: minQuantity === "" ? null : Number(minQuantity),
      max_quantity: maxQuantity === "" ? null : Number(maxQuantity),
      location: location.trim() || null,
      notes: notes.trim() || null,
      ...(isLeftover ? { condition } : {}),
      ...(!initial && leftoverMode ? { kind: "sobrante" } : {}),
      ...(quantityLocked ? { quantity: initial.quantity } : {}),
    });
  };
  return (
    <Modal title={initial ? (isLeftover ? "Editar sobrante" : "Editar material") : (leftoverMode ? "Agregar sobrante" : "Agregar material al almacén")} onClose={onClose}>
      {leftoverMode && !initial && (
        <div className="text-xs mb-3 p-2" style={{ background: C.panelAlt, color: C.muted, border: `1px solid ${C.border}` }}>
          Sobrante: material incompleto, usado o recuperado de un equipo. No tiene costo y no entra al inventario de Productos. El material nuevo se registra en Productos.
        </div>
      )}
      {isLeftover && (
        <Field label="Condición">
          <select className={inputClass} style={inputStyle} value={condition} onChange={(e) => setCondition(e.target.value)}>
            {Object.entries(LEFTOVER_CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      )}
      <Field label="Nombre del material">
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tubería PVC 1/2, cable THHN #12" />
      </Field>
      <Field label="Descripción (opcional)">
        <input className={inputClass} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalle más largo del repuesto/material" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="ID / código de repuesto">
          <input className={inputClass} style={inputStyle} value={partCode} onChange={(e) => setPartCode(e.target.value)} placeholder="Código interno" />
        </Field>
        <Field label="Número de parte">
          <input className={inputClass} style={inputStyle} value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Del fabricante" />
        </Field>
        <Field label="Número de serie">
          <input className={inputClass} style={inputStyle} value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Si aplica" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label={isLeftover ? "Cantidad" : "Stock actual"}>
          <input type="text" inputMode="decimal" disabled={quantityLocked} title={quantityLocked ? "La cantidad de un material anterior solo cambia al usarlo en una orden o proyecto" : undefined} className={`${inputClass} disabled:opacity-50`} style={inputStyle} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Unidad">
          <select className={inputClass} style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {MATERIAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Ubicación en almacén">
          <input className={inputClass} style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej. Pasillo 3, estante B" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Stock mínimo (opcional — avisa cuando la cantidad caiga a este nivel o menos)">
          <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} placeholder="Ej. 5" />
        </Field>
        <Field label="Stock máximo (opcional)">
          <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={maxQuantity} onChange={(e) => setMaxQuantity(e.target.value)} placeholder="Ej. 50" />
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

export function ProjectFormModal({ branches, clients, technicians, initial, onClose, onSave, saving }) {
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

export function ProjectDetailModal({
  project, clients, branches, technicians, orders, orderTechnicians, salesOrders, materials, projectMaterials,
  canEditProjects, canDeleteProjects, canManageWarehouse, onClose, onEdit, onDelete, onSetStatus,
  onLinkOrder, onUnlinkOrder, onLinkSalesOrder, onUnlinkSalesOrder, onAddMaterial, onRemoveMaterial, saving,
  techUsesProducts, products, productStock, defaultBranchId, onRegisterLeftover,
}) {
  const [pickOrderId, setPickOrderId] = useState("");
  const [pickSalesOrderId, setPickSalesOrderId] = useState("");
  const [pickMaterialId, setPickMaterialId] = useState("");
  const [pickMaterialQty, setPickMaterialQty] = useState("");
  const [pickMaterialNotes, setPickMaterialNotes] = useState("");

  const linkedOrders = orders.filter((o) => o.project_id === project.id);
  // Costo real = mano de obra de las órdenes de trabajo vinculadas (técnico principal + adicionales).
  // No incluye materiales: el costo de lo tomado de Productos se muestra aparte (materialsCost).
  const projectLaborCost = linkedOrders.reduce((sum, o) => {
    const primary = (Number(o.labor_hours) || 0) * (Number(o.labor_rate_used) || 0);
    const extra = (orderTechnicians || []).filter((wt) => wt.work_order_id === o.id).reduce((s, wt) => {
      const rate = technicians.find((t) => t.id === wt.technician_id)?.hourly_rate;
      return s + (Number(wt.hours) || 0) * (Number(rate) || 0);
    }, 0);
    return sum + primary + extra;
  }, 0);
  const budgetPct = project.budget ? (projectLaborCost / Number(project.budget)) * 100 : null;
  const availableOrders = orders.filter((o) => !o.project_id);
  const linkedSalesOrders = salesOrders.filter((o) => o.project_id === project.id);
  const availableSalesOrders = salesOrders.filter((o) => !o.project_id);
  const linkedMaterials = projectMaterials.filter((pm) => pm.project_id === project.id);
  const materialOptions = techMaterialOptions({ techUsesProducts, products, productStock, materials, branchId: project.branch_id || defaultBranchId });
  const materialsCost = linkedMaterials.reduce((sum, pm) => sum + Number(pm.quantity || 0) * Number(pm.unit_cost || 0), 0);
  const [leftoverFor, setLeftoverFor] = useState(null);

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

      {/* Presupuesto vs. costo real */}
      <div className="mb-4 p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Presupuesto vs. costo real (mano de obra)</div>
        <div className="flex items-center justify-between text-sm mb-1">
          <span style={{ color: C.muted }}>Costo real hasta ahora</span>
          <span className="font-mono font-bold">{fmtMoney(projectLaborCost)}</span>
        </div>
        {project.budget != null ? (
          <>
            <div className="w-full h-2" style={{ background: C.border }}>
              <div style={{ width: `${Math.min(100, budgetPct)}%`, height: "100%", background: budgetPct > 100 ? C.red : budgetPct > 80 ? C.amber : C.green }} />
            </div>
            <div className="text-xs mt-1" style={{ color: budgetPct > 100 ? C.red : C.muted }}>
              {budgetPct.toFixed(0)}% del presupuesto ({fmtMoney(project.budget)}){budgetPct > 100 ? " — presupuesto excedido" : ""}
            </div>
          </>
        ) : (
          <div className="text-xs" style={{ color: C.muted }}>Este proyecto no tiene presupuesto asignado (edítalo para agregar uno y comparar).</div>
        )}
        <div className="text-xs mt-1" style={{ color: C.muted }}>Solo incluye mano de obra de las órdenes de trabajo vinculadas. El costo de los materiales tomados de Productos se muestra aparte, en "Materiales asignados" (los sobrantes no tienen costo).</div>
      </div>

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
        <div className="text-sm font-semibold mb-2">
          Materiales asignados ({linkedMaterials.length})
          {materialsCost > 0 && <span className="text-xs font-normal ml-2" style={{ color: C.muted }}>Costo de lo usado de Productos: {fmtMoney(materialsCost)}</span>}
        </div>
        <div className="space-y-2 mb-3">
          {linkedMaterials.map((pm) => {
            const mat = materials.find((m) => m.id === pm.material_id);
            const name = pm.name || mat?.name || "Material eliminado";
            const unit = pm.unit || mat?.unit || "";
            return (
              <div key={pm.id}>
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                  <div className="min-w-0">
                    {name} <span className="text-xs" style={{ color: C.muted }}>× {fmtQty(pm.quantity)} {unit}</span>
                    <span className="text-[10px] uppercase tracking-wide ml-2" style={{ color: pm.product_id ? C.blue : C.muted }}>{materialLineSource(pm, materials)}</span>
                    {pm.notes && <div className="text-xs" style={{ color: C.muted }}>{pm.notes}</div>}
                  </div>
                  {canDeleteProjects && canManageWarehouse && (
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {techUsesProducts && pm.product_id && <button onClick={() => setLeftoverFor(leftoverFor === pm.id ? null : pm.id)} className="text-xs" style={{ color: C.amber }} title="Lo que sobró y no puede regresar a Productos">Sobrante</button>}
                      <button onClick={() => onRemoveMaterial({ ...pm, name, unit })} className="text-xs" style={{ color: C.muted }} title="Devolver todo o parte a su origen">Devolver</button>
                    </span>
                  )}
                </div>
                {leftoverFor === pm.id && (
                  <LeftoverInlineForm defaultName={name} defaultUnit={unit} onCancel={() => setLeftoverFor(null)}
                    onSave={(payload) => onRegisterLeftover({ ...payload, branch_id: project.branch_id || null, source_project_id: project.id, source_product_id: pm.product_id || null })} />
                )}
              </div>
            );
          })}
          {linkedMaterials.length === 0 && <div className="text-xs" style={{ color: C.muted }}>Todavía no hay materiales asignados a este proyecto.</div>}
        </div>
        {canEditProjects && canManageWarehouse && (
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[160px]"><SearchSelect items={materialOptions} value={pickMaterialId} onChange={setPickMaterialId} placeholder={techUsesProducts ? "Buscar producto o sobrante..." : "Buscar material del almacén..."} getLabel={techOptionLabel} /></div>
            <input type="text" inputMode="decimal" className="px-3 py-2 text-sm w-24" style={inputStyle} value={pickMaterialQty} onChange={(e) => setPickMaterialQty(e.target.value)} placeholder="Cant." />
            <input type="text" className="px-3 py-2 text-sm flex-1 min-w-[120px]" style={inputStyle} value={pickMaterialNotes} onChange={(e) => setPickMaterialNotes(e.target.value)} placeholder="Notas (opcional)" />
            <button
              onClick={() => { if (pickMaterialId && pickMaterialQty) { onAddMaterial(project.id, pickMaterialId, pickMaterialQty, pickMaterialNotes); setPickMaterialId(""); setPickMaterialQty(""); setPickMaterialNotes(""); } }}
              disabled={!pickMaterialId || !pickMaterialQty || saving}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}
            ><Plus size={12} /> Descontar y asignar</button>
          </div>
        )}
        {canEditProjects && !canManageWarehouse && (
          <div className="text-xs" style={{ color: C.muted }}>Solo un supervisor o administrador puede retirar materiales.</div>
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

export function IncidentFormModal({ branches, equipment, clients, technicians, initial, onClose, onSave, saving, onRequestNewClient, autoSelectClientId, autoSelectToken }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [branchId, setBranchId] = useState(initial?.branch_id || "");
  const [equipmentId, setEquipmentId] = useState(initial?.equipment_id || "");
  const [clientId, setClientId] = useState(initial?.client_id || "");
  // Si desde este formulario se creó un cliente nuevo con el "+", lo selecciona
  // solo en cuanto se guarda — ver nota en ClientAssetFormModal.
  const appliedAutoSelectTokenRef = useRef(autoSelectToken);
  useEffect(() => {
    if (autoSelectToken !== appliedAutoSelectTokenRef.current && autoSelectClientId) {
      setClientId(autoSelectClientId);
      appliedAutoSelectTokenRef.current = autoSelectToken;
    }
  }, [autoSelectToken, autoSelectClientId]);
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

export function IncidentDetailModal({ incident, branchName, equipName, clientName, techName, technicians, orders, quotes, canEdit, canDelete, isTecnico, onClose, onMarkStatus, onConvertOrder, onConvertQuote, onDelete, onSaveProgress, onComplete, onEdit, onAssignTechnician, onReopen }) {
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

export function ChecklistTemplateFormModal({ initial, onClose, onSave, saving }) {
  const [equipmentType, setEquipmentType] = useState(initial?.equipment_type || "");
  const [name, setName] = useState(initial?.name || "");
  const [blocks, setBlocks] = useState(() => checklistItemsToBlocks(initial?.items));
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const newBlockId = () => Date.now() + Math.random();

  const updateBlock = (id, patch) => setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const addItemRow = () => setBlocks((prev) => [...prev, { id: newBlockId(), kind: "item", text: "", response_type: "check", range_min: "", range_max: "" }]);
  const addSectionRow = () => setBlocks((prev) => [...prev, { id: newBlockId(), kind: "section", name: "" }]);
  const removeBlock = (id) => setBlocks((prev) => prev.filter((b) => b.id !== id));

  const resolvedItems = useMemo(() => {
    let current = "";
    const result = [];
    blocks.forEach((b) => {
      if (b.kind === "section") current = b.name.trim();
      else result.push({ text: b.text, section: current, response_type: b.response_type || "check", range_min: b.range_min, range_max: b.range_max });
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
            newBlocks.push({ id: newBlockId(), kind: "item", text: it.text, response_type: "check", range_min: "", range_max: "" });
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
    const cleanItems = resolvedItems
      .map((it) => ({
        text: it.text.trim(),
        section: it.section,
        response_type: it.response_type || "check",
        range_min: it.response_type === "numeric" && it.range_min !== "" && it.range_min != null ? Number(it.range_min) : null,
        range_max: it.response_type === "numeric" && it.range_max !== "" && it.range_max != null ? Number(it.range_max) : null,
      }))
      .filter((it) => it.text);
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
            <div key={b.id} className="space-y-1 pb-2" style={{ borderBottom: `1px dashed ${C.border}` }}>
              <div className="flex gap-2">
                <input className={inputClass} style={inputStyle} value={b.text} onChange={(e) => updateBlock(b.id, { text: e.target.value })} placeholder="Punto a revisar" />
                <select className={inputClass} style={{ ...inputStyle, maxWidth: 170 }} value={b.response_type || "check"} onChange={(e) => updateBlock(b.id, { response_type: e.target.value })}>
                  <option value="check">Cotejo (✓)</option>
                  <option value="ok_no_ok_na">OK / No OK / N/A</option>
                  <option value="numeric">Numérico (con rango)</option>
                </select>
                <button onClick={() => removeBlock(b.id)} style={iconBtnStyle}><X size={16} /></button>
              </div>
              {b.response_type === "numeric" && (
                <div className="flex items-center gap-2 pl-1">
                  <span className="text-xs" style={{ color: C.muted }}>Rango esperado:</span>
                  <input type="number" className={inputClass} style={{ ...inputStyle, maxWidth: 110 }} value={b.range_min} onChange={(e) => updateBlock(b.id, { range_min: e.target.value })} placeholder="Mín" />
                  <span className="text-xs" style={{ color: C.muted }}>a</span>
                  <input type="number" className={inputClass} style={{ ...inputStyle, maxWidth: 110 }} value={b.range_max} onChange={(e) => updateBlock(b.id, { range_max: e.target.value })} placeholder="Máx" />
                </div>
              )}
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

export function BulkOrderFormModal({ branches, equipment, technicians, onClose, onSave, saving }) {
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

export function SignaturePad({ onSave, saving }) {
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

// Horas de un técnico adicional en una orden multi-técnico. Estado local propio para no
// disparar un guardado en cada tecla — se guarda al salir del campo (onBlur), igual que
// los demás campos de texto del detalle de la orden.
export function TechnicianHoursRow({ row, name, hourlyRate, readOnly, onSave, hideCost }) {
  const [hours, setHours] = useState(row.hours ?? "");
  const cost = (Number(hours) || 0) * (Number(hourlyRate) || 0);
  return (
    <div className="flex items-center gap-3 px-3 py-2" style={{ background: C.panelAlt }}>
      <div className="flex-1 text-sm truncate">{name}</div>
      <input
        type="number" step="0.25" min="0" disabled={readOnly}
        className={inputClass} style={{ ...inputStyle, maxWidth: 100 }}
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        onBlur={(e) => onSave(row, e.target.value)}
        placeholder="Horas"
      />
      {!hideCost && <div className="text-xs font-mono text-right" style={{ color: C.muted, width: 90 }}>{fmtMoney(cost)}</div>}
    </div>
  );
}

export function OrderDetailModal({ order, attachments, checklistItems, checklistTemplates, companyName, branchName, equipName, equipType, techName, technicians, extraTechnicianIds, extraTechnicianRows, onUpdateTechnicianHours, materials, onInventoryChanged, onRegisterLeftover, techUsesProducts, products, productStock, defaultBranchId, canManageWarehouse, onAddPhoto, onDeletePhoto, clients, onCreateIncidentFromChecklist, onSaveSignature, onClose, onSave, saving, readOnly, isTecnico, onLoadChecklist, onToggleChecklistItem, onChecklistFieldChange, onChecklistFieldBlur, onClearChecklist, myTechnicianId, canManageVisits, onOrderStatusChange, onVisitsChanged }) {
  const [notes, setNotes] = useState(order.resolution_notes || "");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [uploadingStage, setUploadingStage] = useState(null);
  const handleAddPhotos = async (stage, fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setUploadingStage(stage);
    for (const file of files) { await onAddPhoto(order, file, stage); }
    setUploadingStage(null);
  };
  const t = TYPE_CFG[order.type], p = PRIORITY_CFG[order.priority], s = STATUS_CFG[order.status];

  const technician = technicians.find((tc) => tc.id === order.technician_id);
  const [laborHours, setLaborHours] = useState(order.labor_hours ?? "");
  const [laborRate, setLaborRate] = useState(order.labor_rate_used ?? (technician?.hourly_rate ?? ""));
  // Las horas se recalculan solas al cerrar una visita (llegada y salida): se refrescan aquí.
  useEffect(() => { setLaborHours(order.labor_hours ?? ""); }, [order.labor_hours]);
  useEffect(() => { if (order.labor_rate_used != null) setLaborRate(order.labor_rate_used); }, [order.labor_rate_used]);
  // El técnico no ve ni guarda la tarifa ni las horas (las pone la llegada y salida / el supervisor)
  const laborForSave = isTecnico ? undefined : laborHours;
  const rateForSave = isTecnico ? undefined : laborRate;

  const [usedMaterials, setUsedMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [pickMaterialId, setPickMaterialId] = useState("");
  const [pickMaterialQty, setPickMaterialQty] = useState("");
  const [materialErr, setMaterialErr] = useState("");
  const [savingMaterial, setSavingMaterial] = useState(false);

  const offlineState = useOfflineState();
  useEffect(() => {
    let active = true;
    setLoadingMaterials(true);
    // Sin señal (o con cambios de esta orden en la cola): lo guardado en el teléfono
    const fromCopy = () => getOrderDetails(order.id).then((d) => {
      if (!active) return;
      setUsedMaterials(d?.materials || []);
      setLoadingMaterials(false);
    });
    (async () => {
      if (!isOnline() || (await hasPendingFor(order.id))) { fromCopy(); return; }
      const { data, error } = await supabase.from("work_order_materials").select("*").eq("work_order_id", order.id).order("created_at");
      if (!active) return;
      if (error && isNetworkError(error)) { fromCopy(); return; }
      if (!error) {
        setUsedMaterials(data || []);
        if (isTecnico) patchOrderDetails(order.id, (d) => ({ ...d, materials: data || [] }));
      }
      setLoadingMaterials(false);
    })();
    return () => { active = false; };
    // eslint-disable-next-line
  }, [order.id]);

  const materialOptions = techMaterialOptions({ techUsesProducts, products, productStock, materials, branchId: order.branch_id || defaultBranchId });
  const [leftoverFor, setLeftoverFor] = useState(null); // renglón del que se registra un sobrante
  const leftoversFromOrder = (materials || []).filter((m) => m.kind === "sobrante" && m.source_work_order_id === order.id);

  const addUsedMaterial = async () => {
    setMaterialErr("");
    const opt = materialOptions.find((o) => o.id === pickMaterialId);
    const qty = Number(String(pickMaterialQty).replace(",", "."));
    if (!opt || !(qty > 0)) return;
    if (qty > opt.available) { setMaterialErr(`No hay suficiente: disponible ${fmtQty(opt.available)} ${opt.unit || ""}.`); return; }
    setSavingMaterial(true);
    // La base de datos completa nombre, unidad, costo y empresa, y descuenta la existencia.
    // Sin señal queda en la cola; si al enviarlo ya no hay existencia, aparece en "Cambios hechos sin señal".
    const row = { id: newId(), work_order_id: order.id, company_id: order.company_id, name: opt.name, quantity: qty, ...techPickToColumns(opt.id) };
    const res = await perform("material_add", order.id, { row }, `${order.code} · ${fmtQty(qty)} ${opt.unit || ""} ${opt.name}`);
    setSavingMaterial(false);
    if (res.error) { setMaterialErr(res.error.message); return; }
    const saved = res.data || { ...row, unit: opt.unit || null, pending: true, created_at: new Date().toISOString() };
    setUsedMaterials((prev) => [...prev, saved]);
    if (isTecnico) patchOrderDetails(order.id, (d) => ({ ...d, materials: [...(d.materials || []), saved] }));
    if (res.data) onInventoryChanged && onInventoryChanged();
    setPickMaterialId(""); setPickMaterialQty("");
  };
  const removeUsedMaterial = async (m) => {
    if (m.pending || !isOnline()) { setMaterialErr("Para devolver material necesitas conexión (y que lo anotado sin señal ya se haya enviado)."); return; }
    const res = await returnMaterialLine("work_order_materials", m);
    if (!res) return;
    const next = res.removed ? usedMaterials.filter((x) => x.id !== m.id) : usedMaterials.map((x) => (x.id === m.id ? res.updated : x));
    setUsedMaterials(next);
    if (isTecnico) patchOrderDetails(order.id, (d) => ({ ...d, materials: next }));
    onInventoryChanged && onInventoryChanged();
  };
  const saveLeftover = (line) => (payload) => onRegisterLeftover({
    ...payload, branch_id: order.branch_id || null, source_work_order_id: order.id, source_product_id: line.product_id || null,
  });

  const laborCost = (Number(laborHours) || 0) * (Number(laborRate) || 0);
  const extraTechnicianCost = (extraTechnicianRows || []).reduce((sum, row) => {
    const rate = technicians.find((t) => t.id === row.technician_id)?.hourly_rate;
    return sum + (Number(row.hours) || 0) * (Number(rate) || 0);
  }, 0);
  const totalLaborCost = laborCost + extraTechnicianCost;

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

  const isImage = (name) => /\.(png|jpe?g|gif|webp)$/i.test(name || "");
  const isChecklistItemAnswered = (it) => {
    if (it.response_type === "ok_no_ok_na") return !!(it.respuesta && it.respuesta.trim());
    if (it.response_type === "numeric") return !!(it.respuesta && it.respuesta.trim() !== "" && !isNaN(Number(it.respuesta)));
    return !!it.checked;
  };
  const checkedCount = (checklistItems || []).filter(isChecklistItemAnswered).length;
  const uncheckedCount = (checklistItems || []).length - checkedCount;
  const checklistGroups = groupChecklistItemsBySection(checklistItems || []);
  const showChecklistSections = checklistGroups.length > 1 || (checklistGroups[0] && checklistGroups[0].section !== "General");
  const canRemoveChecklist = order.status !== "completada";
  const orderEquipType = (equipType ? equipType(order.equipment_id) : "") || "";
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const matchingTemplates = (checklistTemplates || []).filter(
    (tpl) => orderEquipType && tpl.equipment_type && tpl.equipment_type.trim().toLowerCase() === orderEquipType.trim().toLowerCase()
  );
  const visibleTemplates = (!orderEquipType || showAllTemplates || matchingTemplates.length === 0) ? (checklistTemplates || []) : matchingTemplates;

  const closeRequirements = [];
  if (uncheckedCount > 0) closeRequirements.push(`checklist (${uncheckedCount} punto${uncheckedCount !== 1 ? "s" : ""} sin marcar)`);
  if (!notes.trim()) closeRequirements.push("nota de cierre");
  if (!order.client_signature_url) closeRequirements.push("firma del cliente");
  const canCloseOrder = closeRequirements.length === 0;

  const doPrintChecklist = () => {
    const html = checklistPrintHtml({ companyName, order, branchName, equipName, techName, checklistItems });
    printDocument(`Checklist ${order.code}`, html);
  };

  const orderClient = (clients || []).find((c) => c.id === order.client_id) || null;
  const [reportEmail, setReportEmail] = useState(orderClient?.email || "");
  const [sendingReport, setSendingReport] = useState(false);
  const [reportSentMsg, setReportSentMsg] = useState("");
  const beforePhotos = (attachments || []).filter((a) => a.stage === "antes");
  const afterPhotos = (attachments || []).filter((a) => a.stage === "despues");

  const doPrintServiceReport = () => {
    const html = orderServiceReportHtml({
      companyName, order, branchName, equipName, techName,
      clientName: orderClient?.name || "",
      checklistItems, usedMaterials, laborHours, beforePhotos, afterPhotos,
    });
    printDocument(`Informe de servicio ${order.code}`, html);
  };

  const doSendServiceReport = async () => {
    if (!reportEmail.trim()) return;
    setSendingReport(true);
    setReportSentMsg("");
    const materialsText = usedMaterials.length > 0
      ? usedMaterials.map((m) => `- ${m.name}: ${m.quantity} ${m.unit || ""}`).join("\n")
      : "Ninguno";
    // Respaldo en texto plano (mejor entregabilidad y por si el cliente de correo no
    // muestra HTML). El correo real que se ve es el "html" de abajo: el mismo informe
    // completo que se imprime, con checklist, materiales y fotos antes/después —
    // las fotos se ven porque son URLs públicas del storage, no adjuntos.
    const text = [
      `Informe de servicio — Orden ${order.code}`,
      order.title || "",
      "",
      `Sucursal: ${branchName(order.branch_id)}`,
      `Equipo: ${equipName(order.equipment_id)}`,
      `Técnico: ${techName(order.technician_id)}`,
      `Fecha: ${fmtDate(order.scheduled)}`,
      "",
      "Nota de solución / cierre:",
      order.resolution_notes || notes || "—",
      "",
      "Materiales retirados del almacén:",
      materialsText,
    ].join("\n");
    const reportBodyHtml = orderServiceReportHtml({
      companyName, order, branchName, equipName, techName,
      clientName: orderClient?.name || "",
      checklistItems, usedMaterials, laborHours, beforePhotos, afterPhotos,
    });
    const html = `<html><head><style>
      body { font-family: Arial, Helvetica, sans-serif; color: #111; }
      h1 { font-size: 18px; margin: 0 0 2px; }
      .muted { color: #666; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 14px; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 13px; }
      th { background: #f2f2f2; }
      .header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    </style></head><body>${reportBodyHtml}</body></html>`;
    const { error } = await supabase.functions.invoke("send-client-email", {
      body: { to: reportEmail.trim(), subject: `Informe de servicio — Orden ${order.code}`, text, html },
    });
    setSendingReport(false);
    setReportSentMsg(error ? `No se pudo enviar: ${error.message}` : "Enviado.");
  };

  return (
    <Modal title={`Orden ${order.code}`} onClose={onClose} wide>
      <div className="flex flex-wrap gap-2 mb-4">
        <Pill label={t.label} color={t.color} />
        <Pill label={p.label} color={p.color} />
        <Pill label={s.label} color={s.color} />
      </div>
      {!offlineState.online && (
        <div className="text-xs mb-3 px-3 py-2" style={{ background: C.orange + "22", color: C.orange }}>
          Sin señal: lo que hagas en esta orden se guarda en el teléfono y se envía solo cuando vuelva la conexión. Las fotos que ya estaban enviadas se ven cuando haya señal.
        </div>
      )}
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
          <div>Fecha límite (deadline)<br /><span style={{ color: order.status !== "completada" && order.deadline < todayStrRD() ? C.red : C.text }}>{fmtDate(order.deadline)}</span></div>
        )}
      </div>

      <OrderVisitsSection
        order={order}
        techName={techName}
        myTechnicianId={myTechnicianId}
        assignedTechIds={[order.technician_id, ...(extraTechnicianIds || [])].filter(Boolean)}
        canManage={canManageVisits}
        readOnly={readOnly}
        onOrderStatusChange={onOrderStatusChange}
        onVisitsChanged={onVisitsChanged}
      />

      {!isTecnico && !readOnly && checklistItems && checklistItems.length === 0 && checklistTemplates && checklistTemplates.length > 0 && (
        <div className="mb-4 px-3 py-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <div className="text-xs mb-2" style={{ color: C.muted }}>
            Elige un checklist para cargar en esta orden{orderEquipType ? ` (equipo tipo "${orderEquipType}")` : ""}:
          </div>
          <div className="flex items-center gap-2">
            <select className={inputClass} style={inputStyle} value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
              <option value="">Selecciona un checklist...</option>
              {visibleTemplates.map((tpl) => (
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
          {orderEquipType && matchingTemplates.length > 0 && !showAllTemplates && (
            <button onClick={() => setShowAllTemplates(true)} className="text-xs mt-2" style={{ color: C.amber }}>
              Ver todos los checklists ({checklistTemplates.length})
            </button>
          )}
          {orderEquipType && showAllTemplates && matchingTemplates.length > 0 && (
            <button onClick={() => setShowAllTemplates(false)} className="text-xs mt-2" style={{ color: C.muted }}>
              Ver solo los de "{orderEquipType}"
            </button>
          )}
          {orderEquipType && matchingTemplates.length === 0 && (
            <div className="text-xs mt-2" style={{ color: C.muted }}>No hay ningún checklist configurado para el tipo "{orderEquipType}"; se muestran todos.</div>
          )}
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
                  {g.items.map((it) => {
                    const numericVal = it.respuesta !== "" && it.respuesta != null ? Number(it.respuesta) : null;
                    const outOfRange = it.response_type === "numeric" && numericVal != null && !isNaN(numericVal) &&
                      ((it.range_min != null && numericVal < Number(it.range_min)) || (it.range_max != null && numericVal > Number(it.range_max)));
                    const isBadOkNoOkNa = it.response_type === "ok_no_ok_na" && it.respuesta === "No OK";
                    const needsIncident = outOfRange || isBadOkNoOkNa;
                    return (
                    <div key={it.id} className="px-3 py-2" style={{ background: C.panelAlt, border: needsIncident ? `1px solid ${C.red}` : "none" }}>
                      {it.response_type === "ok_no_ok_na" ? (
                        <div className="mb-2">
                          <div className="text-sm mb-1" style={{ color: C.text }}>{it.text}</div>
                          <div className="flex items-center gap-1">
                            {["OK", "No OK", "N/A"].map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                disabled={readOnly}
                                onClick={() => { onChecklistFieldChange(it, "respuesta", opt); onChecklistFieldBlur(it, "respuesta", opt); }}
                                className="text-xs px-3 py-1 font-semibold disabled:opacity-50"
                                style={{
                                  background: it.respuesta === opt ? (opt === "No OK" ? C.red : opt === "OK" ? C.green : C.muted) : "transparent",
                                  color: it.respuesta === opt ? "#fff" : C.muted,
                                  border: `1px solid ${it.respuesta === opt ? "transparent" : C.border}`,
                                }}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : it.response_type === "numeric" ? (
                        <div className="mb-2">
                          <div className="text-sm mb-1" style={{ color: C.text }}>
                            {it.text}
                            {(it.range_min != null || it.range_max != null) && (
                              <span className="text-xs ml-2" style={{ color: C.muted }}>(rango: {it.range_min ?? "—"} a {it.range_max ?? "—"})</span>
                            )}
                          </div>
                          <input
                            type="number"
                            className={inputClass}
                            style={{ ...inputStyle, maxWidth: 160, borderColor: outOfRange ? C.red : undefined }}
                            placeholder="Lectura"
                            value={it.respuesta || ""}
                            onChange={(e) => onChecklistFieldChange(it, "respuesta", e.target.value)}
                            onBlur={(e) => onChecklistFieldBlur(it, "respuesta", e.target.value)}
                            disabled={readOnly}
                          />
                          {outOfRange && <div className="text-xs mt-1" style={{ color: C.red }}>Fuera del rango esperado.</div>}
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                          <input type="checkbox" checked={it.checked} onChange={(e) => onToggleChecklistItem(it, e.target.checked)} disabled={readOnly} />
                          <span style={{ color: it.checked ? C.muted : C.text, textDecoration: it.checked ? "line-through" : "none" }}>{it.text}</span>
                        </label>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {it.response_type === "check" || !it.response_type ? (
                          <input
                            className={inputClass}
                            style={inputStyle}
                            placeholder="Respuesta / lectura"
                            value={it.respuesta || ""}
                            onChange={(e) => onChecklistFieldChange(it, "respuesta", e.target.value)}
                            onBlur={(e) => onChecklistFieldBlur(it, "respuesta", e.target.value)}
                            disabled={readOnly}
                          />
                        ) : <div />}
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
                      {needsIncident && !readOnly && onCreateIncidentFromChecklist && (
                        <button
                          type="button"
                          onClick={() => onCreateIncidentFromChecklist(order, it, it.respuesta)}
                          className="flex items-center gap-1 text-xs mt-2"
                          style={{ color: C.red }}
                        >
                          <AlertTriangle size={13} /> Reportar como incidente
                        </button>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {attachments && attachments.filter((a) => !a.stage).length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Archivos de apoyo</div>
          <div className="grid grid-cols-2 gap-2">
            {attachments.filter((a) => !a.stage).map((a) => (
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
          Esta orden ya está completada — no se puede editar la nota ni las fotos.
        </div>
      )}

      <Field label="Nota de solución / cierre">
        <textarea rows={4} disabled={readOnly} className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qué se hizo, repuestos usados, observaciones..." />
      </Field>

      <div className="mt-2 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Fotos — antes / después</div>
        {order.photo_url && (
          <div className="mb-3">
            <div className="text-xs mb-1" style={{ color: C.muted }}>Foto de cierre (registro anterior a este cambio)</div>
            <img src={order.photo_url} alt="Evidencia" className="w-full max-h-56 object-cover" style={{ border: `1px solid ${C.border}` }} />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {["antes", "despues"].map((stage) => {
            const stagePhotos = (attachments || []).filter((a) => a.stage === stage);
            return (
              <div key={stage}>
                <div className="text-xs mb-2" style={{ color: C.muted }}>{stage === "antes" ? "Antes" : "Después"} ({stagePhotos.length})</div>
                {stagePhotos.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {stagePhotos.map((a) => (
                      <div key={a.id} className="relative">
                        <a href={a.file_url} target="_blank" rel="noreferrer">
                          {isImage(a.file_name) ? (
                            <img src={a.file_url} alt={stage} className="w-full h-24 object-cover" style={{ border: `1px solid ${C.border}` }} />
                          ) : (
                            <div className="w-full h-24 flex items-center justify-center text-xs" style={{ border: `1px solid ${C.border}`, color: C.muted }}>
                              <FileText size={16} />
                            </div>
                          )}
                        </a>
                        {a.pending && (
                          <span className="absolute bottom-1 left-1 px-1 text-[10px] font-semibold" style={{ background: C.orange, color: "#1A1500" }}>Por enviar</span>
                        )}
                        {!readOnly && (
                          <button onClick={() => onDeletePhoto(a)} className="absolute top-1 right-1 p-0.5" style={{ background: "#000000a0", color: "#fff" }}>
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!readOnly && (
                  <label className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer w-fit" style={{ border: `1px solid ${C.border}`, color: C.amber }}>
                    <ImageIcon size={13} /> {uploadingStage === stage ? "Subiendo..." : "Agregar foto"}
                    <input type="file" accept="image/*" multiple disabled={uploadingStage === stage} className="hidden" onChange={(e) => handleAddPhotos(stage, e.target.files)} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>{techUsesProducts ? "Materiales usados (de Productos o del almacén técnico)" : "Materiales retirados del almacén"}</div>
        {!loadingMaterials && usedMaterials.length > 0 && (
          <div className="mb-2 space-y-1">
            {usedMaterials.map((m) => (
              <div key={m.id}>
                <div className="flex items-center justify-between gap-2 text-sm px-3 py-1.5" style={{ background: C.panelAlt }}>
                  <span className="min-w-0">
                    {m.name} — {fmtQty(m.quantity)} {m.unit || ""}
                    <span className="text-[10px] uppercase tracking-wide ml-2" style={{ color: m.product_id ? C.blue : C.muted }}>{materialLineSource(m, materials)}</span>
                    {m.pending && <span className="text-[10px] font-semibold ml-2" style={{ color: C.orange }}>por enviar</span>}
                  </span>
                  {!readOnly && canManageWarehouse && (
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {techUsesProducts && m.product_id && <button onClick={() => setLeftoverFor(leftoverFor === m.id ? null : m.id)} className="text-xs" style={{ color: C.amber }} title="Lo que sobró y no puede regresar a Productos">Sobrante</button>}
                      <button onClick={() => removeUsedMaterial(m)} className="text-xs" style={{ color: C.muted }} title="Devolver todo o parte a su origen">Devolver</button>
                    </span>
                  )}
                </div>
                {leftoverFor === m.id && <LeftoverInlineForm defaultName={m.name} defaultUnit={m.unit} onSave={saveLeftover(m)} onCancel={() => setLeftoverFor(null)} />}
              </div>
            ))}
          </div>
        )}
        {!loadingMaterials && usedMaterials.length === 0 && <div className="text-xs mb-2" style={{ color: C.muted }}>Todavía no se ha retirado ningún material para esta orden.</div>}
        {leftoversFromOrder.length > 0 && (
          <div className="text-xs mb-2" style={{ color: C.muted }}>
            Sobrantes registrados de esta orden: {leftoversFromOrder.map((x) => `${x.name} (${fmtQty(x.quantity)} ${x.unit || ""}, ${LEFTOVER_CONDITIONS[x.condition] || "sobrante"})`).join(" · ")}
          </div>
        )}
        {!readOnly && canManageWarehouse && (
          <div>
            <div className="grid grid-cols-12 gap-2 min-w-[500px] items-end">
              <div className="col-span-7"><SearchSelect items={materialOptions} value={pickMaterialId} onChange={setPickMaterialId} placeholder={techUsesProducts ? "Buscar producto o sobrante..." : "Buscar material del almacén..."} getLabel={techOptionLabel} /></div>
              <input type="text" inputMode="decimal" className={`${inputClass} col-span-2 text-xs`} style={inputStyle} value={pickMaterialQty} onChange={(e) => setPickMaterialQty(e.target.value)} placeholder="Cant." />
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
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>
          Mano de obra{extraTechnicianRows && extraTechnicianRows.length > 0 ? ` — ${techName(order.technician_id)} (técnico principal)` : ""}
        </div>
        {isTecnico ? (
          <div className="text-sm px-3 py-2" style={{ background: C.panelAlt }}>
            Horas trabajadas: <span className="font-mono font-semibold">{laborHours === "" || laborHours == null ? "—" : `${Number(laborHours).toLocaleString("es-DO", { maximumFractionDigits: 2 })} h`}</span>
            <div className="text-xs mt-0.5" style={{ color: C.muted }}>Se calculan solas con tu llegada y salida.</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Horas trabajadas">
                <input type="number" step="0.01" min="0" disabled={readOnly} className={inputClass} style={inputStyle} value={laborHours} onChange={(e) => setLaborHours(e.target.value)} placeholder="Ej. 2.5" />
              </Field>
              <Field label="Tarifa por hora (RD$)">
                <input type="number" step="0.01" min="0" disabled={readOnly} className={inputClass} style={inputStyle} value={laborRate} onChange={(e) => setLaborRate(e.target.value)} placeholder={technician?.hourly_rate ? String(technician.hourly_rate) : "0.00"} />
              </Field>
            </div>
            <div className="text-xs -mt-1" style={{ color: C.muted }}>Las horas se llenan solas cuando el técnico marca llegada y salida; si cambias el número a mano, la próxima visita cerrada lo vuelve a calcular.</div>
          </>
        )}
      </div>

      {extraTechnicianRows && extraTechnicianRows.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Horas de los técnicos adicionales</div>
          <div className="space-y-1">
            {extraTechnicianRows.map((row) => (
              <TechnicianHoursRow
                key={`${row.id}:${row.hours ?? ""}`}
                row={row}
                name={techName(row.technician_id)}
                hourlyRate={technicians.find((t) => t.id === row.technician_id)?.hourly_rate}
                readOnly={readOnly || isTecnico}
                hideCost={isTecnico}
                onSave={onUpdateTechnicianHours}
              />
            ))}
          </div>
        </div>
      )}

      {!isTecnico && (
        <div className="mt-2 p-3 flex justify-between items-center text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <span style={{ color: C.muted }}>Costo de mano de obra{extraTechnicianRows && extraTechnicianRows.length > 0 ? " (total, todos los técnicos)" : ""}</span>
          <div className="font-mono font-bold">{fmtMoney(totalLaborCost)}</div>
        </div>
      )}

      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Firma del cliente</div>
        {order.client_signature_url && !resigning ? (
          <div>
            <img src={order.client_signature_url} alt="Firma del cliente" className="mb-2" style={{ background: "#fff", maxWidth: 300, border: `1px solid ${C.border}` }} />
            {String(order.client_signature_url).startsWith("data:") && (
              <div className="text-[11px] mb-1" style={{ color: C.orange }}>Guardada sin señal · se envía sola cuando vuelva la conexión</div>
            )}
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

      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Informe de servicio</div>
        <div className="text-xs mb-2" style={{ color: C.muted }}>Incluye checklist, materiales retirados, horas, fotos de antes/después y la firma del cliente.</div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={doPrintServiceReport} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold" style={{ border: `1px solid ${C.border}`, color: C.amber }}>
            <FileText size={13} /> Imprimir / descargar PDF
          </button>
          <input
            type="email"
            className={inputClass}
            style={{ ...inputStyle, width: 220 }}
            value={reportEmail}
            onChange={(e) => { setReportEmail(e.target.value); setReportSentMsg(""); }}
            placeholder="correo del cliente"
          />
          <button
            onClick={doSendServiceReport}
            disabled={!reportEmail.trim() || sendingReport}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold disabled:opacity-50"
            style={{ background: C.amber, color: "#1A1500" }}
          >
            {sendingReport ? "Enviando..." : "Enviar por correo"}
          </button>
          {reportSentMsg && <span className="text-xs" style={{ color: reportSentMsg.startsWith("No") ? C.red : C.green }}>{reportSentMsg}</span>}
        </div>
      </div>

      <ActivityHistorySection
        tableName="work_orders"
        recordId={order.id}
        title="Historial de esta orden"
        resolvers={{ technician_id: techName, branch_id: branchName, equipment_id: equipName }}
        statusLabels={Object.fromEntries(Object.entries(STATUS_CFG).map(([k, v]) => [k, v.label]))}
      />

      {!readOnly && order.status !== "completada" && !canCloseOrder && (
        <div className="mt-3 text-xs" style={{ color: C.amber }}>
          Para cerrar esta orden todavía falta: {closeRequirements.join(", ")}.
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>{readOnly ? "Cerrar" : "Cancelar"}</button>
        {!readOnly && (
          <button onClick={() => onSave(order, notes, null, undefined, laborForSave, rateForSave)} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        )}
        {!readOnly && order.status !== "completada" && (
          <button
            onClick={() => {
              if (!canCloseOrder) return;
              if (!window.confirm("¿Cerrar esta orden de trabajo? Se guardará la nota y la foto, y quedará marcada como Completada.")) return;
              onSave(order, notes, null, "completada", laborForSave, rateForSave);
            }}
            disabled={saving || !canCloseOrder}
            title={canCloseOrder ? undefined : `Falta: ${closeRequirements.join(", ")}`}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: C.green, color: "#0B1F13" }}
          >
            <CheckCircle2 size={14} /> {saving ? "Cerrando..." : "Cerrar orden"}
          </button>
        )}
        {!readOnly && order.status === "completada" && canManageWarehouse && (
          <button
            onClick={() => {
              if (!window.confirm("¿Reabrir esta orden de trabajo? Volverá a estado \"En progreso\" y el checklist quedará editable.")) return;
              onSave(order, notes, null, "en_progreso", laborForSave, rateForSave);
            }}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ color: C.amber, border: `1px solid ${C.amber}60` }}
          >
            Reabrir orden
          </button>
        )}
      </div>
    </Modal>
  );
}

export function HistoryModal({ title, orders, branchName, equipName, techName, onClose }) {
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
