// Formulario de nueva orden / editar orden de trabajo.
// (Reemplaza al OrderFormModal de tecnico.jsx: lazy.jsx ahora carga este.)
// Novedad: al CREAR la orden se puede elegir el checklist, y se carga en la orden al guardarla,
// sin tener que abrirla otra vez. Si el equipo elegido tiene un checklist de su mismo tipo,
// se propone solo.
import React, { useState } from "react";
import { ImageIcon, FileText, X } from "lucide-react";
import { C, Field, Modal, PRIORITY_CFG, SearchSelect, TYPE_CFG, defaultChecklistFor, iconBtnStyle, inputClass, inputStyle, techWorksAtBranch } from "./base.jsx";

const sameType = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function OrderFormModal({ branches, equipment, technicians, clients, checklistTemplates = [], initial, initialExtraTechIds, attachments, onDeleteAttachment, onClose, onSave, saving }) {
  const isNew = !initial?.id;
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

  // Checklist (solo al crear). Se propone el del tipo del equipo hasta que el usuario elija uno a mano.
  const equipTypeOf = (id) => equipment.find((e) => e.id === id)?.type || "";
  const matchingFor = (id) => checklistTemplates.filter((t) => sameType(t.equipment_type, equipTypeOf(id)));
  // Propuesta: el checklist fijo del equipo; si no tiene, el único de su mismo tipo
  const proposalFor = (id) => defaultChecklistFor(equipment.find((e) => e.id === id), checklistTemplates)?.id || "";
  const [checklistId, setChecklistId] = useState(() => (isNew ? proposalFor(initial?.equipment_id || "") : ""));
  const [checklistTouched, setChecklistTouched] = useState(false);
  const selectedEquipType = equipTypeOf(equipmentId);
  const matching = matchingFor(equipmentId);
  const others = checklistTemplates.filter((t) => !matching.includes(t));

  const onEquipmentChange = (id) => {
    setEquipmentId(id);
    const owner = equipment.find((x) => x.id === id)?.client_id;
    if (owner) setClientId(owner);
    if (isNew && !checklistTouched) setChecklistId(proposalFor(id));
  };

  const branchEquip = equipment.filter((e) => e.branch_id === branchId);
  const branchTechs = technicians.filter((t) => techWorksAtBranch(t, branchId) && (t.is_active !== false || t.id === technicianId || extraTechIds.includes(t.id)));
  const isImage = (name) => /\.(png|jpe?g|gif|webp)$/i.test(name || "");

  const toggleExtraTech = (id) => setExtraTechIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const submit = () => {
    if (!title.trim() || !branchId || !scheduled) return;
    if (deadline && deadline < scheduled) return;
    onSave(
      { branch_id: branchId, equipment_id: equipmentId || null, technician_id: technicianId || null, type, priority, title: title.trim(), scheduled, deadline: deadline || null, ...(clients ? { client_id: clientId || null } : {}) },
      files,
      extraTechIds.filter((id) => id !== technicianId),
      isNew && checklistId ? { checklistTemplateId: checklistId } : {},
    );
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
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => { setBranchId(e.target.value); onEquipmentChange(""); setTechnicianId(""); setExtraTechIds([]); }}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Equipo">
          <select className={inputClass} style={inputStyle} value={equipmentId} onChange={(e) => onEquipmentChange(e.target.value)}>
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
      {isNew && (
        <Field label="Checklist (opcional — se carga en la orden al crearla)">
          {checklistTemplates.length > 0 ? (
            <>
              <select className={inputClass} style={inputStyle} value={checklistId} onChange={(e) => { setChecklistId(e.target.value); setChecklistTouched(true); }}>
                <option value="">Sin checklist</option>
                {matching.length > 0 && (
                  <optgroup label={`Para equipos tipo "${selectedEquipType}"`}>
                    {matching.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                )}
                <optgroup label={matching.length > 0 ? "Otros checklists" : "Checklists"}>
                  {others.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.equipment_type}</option>)}
                </optgroup>
              </select>
              {checklistId && !checklistTouched && checklistId === proposalFor(equipmentId) && (
                <div className="text-xs mt-1" style={{ color: C.muted }}>Propuesto por el equipo. Puedes cambiarlo o quitarlo.</div>
              )}
            </>
          ) : (
            <div className="text-xs px-3 py-2" style={{ background: C.panelAlt, color: C.muted, border: `1px solid ${C.border}` }}>
              No hay checklists creados todavía. Créalos en el menú <b style={{ color: C.text }}>Checklists</b> y aparecerán aquí.
            </div>
          )}
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
