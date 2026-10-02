// Nómina (#18). Se carga solo cuando se usa (ver lazy.jsx).

import React from "react";
import { useState, useEffect, useMemo } from "react";
import { Trash2, Plus, ChevronLeft, Calculator, Lock, RotateCcw, Printer, FileSpreadsheet, Banknote, Search, UserPlus, Pencil, HandCoins, Plane, Download } from "lucide-react";
import { supabase } from "../supabaseClient";
import { C, Field, KpiCard, Modal, Pill, SearchSelect, addDaysToDateStr, fetchAllRows, fetchByIdChunks, fmtDate, fmtMoney, iconBtnStyle, inputClass, inputStyle, loadXlsx, printDocument, todayStrRD } from "./base.jsx";

// ---------------------------------------------------------------------------
// Aplicación principal (una vez ya hay sesión + empresa)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Nómina (#18) — empleados, períodos, novedades, préstamos, vacaciones,
// regalía y reportes TSS / IR-3 / IR-13.
// Los montos los calcula SIEMPRE el servidor (payroll_calculate / payroll_close,
// ver nomina.sql); aquí solo se capturan datos y se muestran resultados.
// ---------------------------------------------------------------------------
export const PAYROLL_FREQ_LABELS = { semanal: "Semanal", quincenal: "Quincenal", mensual: "Mensual" };
export const PAYROLL_STATUS_CFG = {
  borrador: { label: "Borrador", color: C.orange },
  cerrada: { label: "Cerrada", color: C.green },
};
// unit: qué se captura (horas/días se valoran en el servidor con el salario del empleado).
// Los valores por defecto de TSS/ISR se pueden cambiar en cada novedad.
export const PAYROLL_CONCEPTS = {
  horas_extra_35: { label: "Horas extra (35%)", unit: "hours", sign: 1, tss: true, isr: true },
  horas_extra_100: { label: "Horas extra (100%)", unit: "hours", sign: 1, tss: true, isr: true },
  comision: { label: "Comisión", unit: "amount", sign: 1, tss: true, isr: true },
  bono: { label: "Bono / incentivo", unit: "amount", sign: 1, tss: false, isr: true },
  otro_ingreso: { label: "Otro ingreso gravado", unit: "amount", sign: 1, tss: false, isr: true },
  ingreso_exento: { label: "Ingreso exento (viáticos, etc.)", unit: "amount", sign: 1, tss: false, isr: false },
  ausencia: { label: "Ausencia sin goce (días)", unit: "days", sign: -1, tss: true, isr: true },
  descuento: { label: "Otro descuento", unit: "amount", sign: -1, tss: false, isr: false },
};
export const PAYMENT_METHOD_LABELS = { transferencia: "Transferencia", efectivo: "Efectivo", cheque: "Cheque" };
export const employeeFullName = (e) => (e ? `${e.first_names || ""} ${e.last_names || ""}`.trim() : "—");
export const splitLastNames = (lastNames) => {
  const parts = String(lastNames || "").trim().split(/\s+/);
  return [parts[0] || "", parts.slice(1).join(" ")];
};
export const payrollEsc = (t) => String(t ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
export const sumBy = (rows, key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);

// Años completos de servicio a una fecha (para vacaciones: 14 días laborables
// después del primer año, 18 después de cinco — Art. 177 Código de Trabajo).
export function yearsOfService(hireDate, atDate) {
  if (!hireDate) return 0;
  const [hy, hm, hd] = hireDate.split("-").map(Number);
  const [ay, am, ad] = atDate.split("-").map(Number);
  let years = ay - hy;
  if (am < hm || (am === hm && ad < hd)) years -= 1;
  return Math.max(years, 0);
}
export const vacationDaysFor = (years) => (years >= 5 ? 18 : years >= 1 ? 14 : 0);
// Inicio del año de servicio vigente (último aniversario de ingreso).
export function lastAnniversary(hireDate, atDate) {
  const years = yearsOfService(hireDate, atDate);
  const [hy, hm, hd] = hireDate.split("-").map(Number);
  const y = hy + years;
  const lastDay = new Date(Date.UTC(y, hm, 0)).getUTCDate();
  return `${y}-${String(hm).padStart(2, "0")}-${String(Math.min(hd, lastDay)).padStart(2, "0")}`;
}

// Próximo período sugerido según la frecuencia y el último período regular.
export function suggestNextPeriod(frequency, periods) {
  const last = periods.filter((p) => p.kind === "regular" && p.frequency === frequency).sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0];
  const today = todayStrRD();
  const start = last ? addDaysToDateStr(last.end_date, 1) : (frequency === "semanal" ? today : `${today.slice(0, 7)}-01`);
  const [y, m, d] = start.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  let end;
  if (frequency === "mensual") end = monthEnd;
  else if (frequency === "quincenal") end = d <= 15 ? `${start.slice(0, 7)}-15` : monthEnd;
  else end = addDaysToDateStr(start, 6);
  return { start, end };
}

export function EmployeeFormModal({ initial, branches, technicians, defaultFrequency, onClose, onSave, saving }) {
  const [f, setF] = useState(() => ({
    code: initial?.code || "", first_names: initial?.first_names || "", last_names: initial?.last_names || "",
    document_type: initial?.document_type || "C", document_number: initial?.document_number || "", nss: initial?.nss || "",
    sex: initial?.sex || "", birth_date: initial?.birth_date || "", hire_date: initial?.hire_date || todayStrRD(),
    termination_date: initial?.termination_date || "", position: initial?.position || "", department: initial?.department || "",
    branch_id: initial?.branch_id || "", technician_id: initial?.technician_id || "", base_salary: initial?.base_salary ?? "",
    pay_frequency: initial?.pay_frequency || "", payment_method: initial?.payment_method || "transferencia",
    bank_name: initial?.bank_name || "", bank_account: initial?.bank_account || "", afp_name: initial?.afp_name || "",
    ars_name: initial?.ars_name || "", is_active: initial?.is_active ?? true, notes: initial?.notes || "",
  }));
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const submit = () => {
    setError("");
    if (!f.first_names.trim() || !f.last_names.trim()) { setError("Escribe nombres y apellidos."); return; }
    if (!f.hire_date) { setError("La fecha de ingreso es obligatoria."); return; }
    if (f.base_salary === "" || Number(f.base_salary) < 0 || isNaN(Number(f.base_salary))) { setError("Escribe el salario mensual."); return; }
    if (f.termination_date && f.termination_date < f.hire_date) { setError("La fecha de salida no puede ser antes del ingreso."); return; }
    const digits = f.document_number.replace(/\D/g, "");
    if (f.document_type === "C" && f.document_number && digits.length !== 11) { setError("La cédula debe tener 11 dígitos."); return; }
    onSave({
      code: f.code.trim() || null, first_names: f.first_names.trim(), last_names: f.last_names.trim(),
      document_type: f.document_type, document_number: f.document_type === "C" ? (digits || null) : (f.document_number.trim() || null),
      nss: f.nss.trim() || null, sex: f.sex || null, birth_date: f.birth_date || null, hire_date: f.hire_date,
      termination_date: f.termination_date || null, position: f.position.trim() || null, department: f.department.trim() || null,
      branch_id: f.branch_id || null, technician_id: f.technician_id || null, base_salary: Number(f.base_salary),
      pay_frequency: f.pay_frequency || null, payment_method: f.payment_method,
      bank_name: f.bank_name.trim() || null, bank_account: f.bank_account.trim() || null,
      afp_name: f.afp_name.trim() || null, ars_name: f.ars_name.trim() || null,
      is_active: f.termination_date ? false : !!f.is_active, notes: f.notes.trim() || null,
    });
  };
  return (
    <Modal title={initial ? "Editar empleado" : "Nuevo empleado"} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombres"><input className={inputClass} style={inputStyle} value={f.first_names} onChange={set("first_names")} placeholder="Ej. Juan Carlos" /></Field>
        <Field label="Apellidos"><input className={inputClass} style={inputStyle} value={f.last_names} onChange={set("last_names")} placeholder="Ej. Pérez Gómez" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Documento">
          <select className={inputClass} style={inputStyle} value={f.document_type} onChange={set("document_type")}>
            <option value="C">Cédula</option>
            <option value="P">Pasaporte</option>
          </select>
        </Field>
        <Field label="Número"><input className={inputClass} style={inputStyle} value={f.document_number} onChange={set("document_number")} placeholder={f.document_type === "C" ? "001-0000000-0" : "Pasaporte"} /></Field>
        <Field label="NSS (opcional)"><input className={inputClass} style={inputStyle} value={f.nss} onChange={set("nss")} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Sexo">
          <select className={inputClass} style={inputStyle} value={f.sex} onChange={set("sex")}>
            <option value="">—</option><option value="M">Masculino</option><option value="F">Femenino</option>
          </select>
        </Field>
        <Field label="Fecha de nacimiento"><input type="date" className={inputClass} style={inputStyle} value={f.birth_date} onChange={set("birth_date")} /></Field>
        <Field label="Código interno (opcional)"><input className={inputClass} style={inputStyle} value={f.code} onChange={set("code")} placeholder="Ej. EMP-001" /></Field>
      </div>
      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Empleo</div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Fecha de ingreso"><input type="date" className={inputClass} style={inputStyle} value={f.hire_date} onChange={set("hire_date")} /></Field>
        <Field label="Fecha de salida (si ya salió)"><input type="date" className={inputClass} style={inputStyle} value={f.termination_date} onChange={set("termination_date")} /></Field>
        <Field label="Cargo"><input className={inputClass} style={inputStyle} value={f.position} onChange={set("position")} placeholder="Ej. Técnico de refrigeración" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Departamento"><input className={inputClass} style={inputStyle} value={f.department} onChange={set("department")} placeholder="Ej. Técnico" /></Field>
        <Field label="Sucursal">
          <select className={inputClass} style={inputStyle} value={f.branch_id} onChange={set("branch_id")}>
            <option value="">Sin sucursal</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Es este técnico de la app (opcional)">
          <select className={inputClass} style={inputStyle} value={f.technician_id} onChange={set("technician_id")}>
            <option value="">No vinculado</option>
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Salario mensual (RD$)"><input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={f.base_salary} onChange={set("base_salary")} placeholder="0.00" /></Field>
        <Field label="Frecuencia de pago">
          <select className={inputClass} style={inputStyle} value={f.pay_frequency} onChange={set("pay_frequency")}>
            <option value="">La de la empresa ({PAYROLL_FREQ_LABELS[defaultFrequency] || "—"})</option>
            {Object.entries(PAYROLL_FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Forma de pago">
          <select className={inputClass} style={inputStyle} value={f.payment_method} onChange={set("payment_method")}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      {f.payment_method === "transferencia" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Banco"><input className={inputClass} style={inputStyle} value={f.bank_name} onChange={set("bank_name")} placeholder="Ej. Banreservas" /></Field>
          <Field label="Número de cuenta"><input className={inputClass} style={inputStyle} value={f.bank_account} onChange={set("bank_account")} /></Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="AFP (opcional)"><input className={inputClass} style={inputStyle} value={f.afp_name} onChange={set("afp_name")} placeholder="Ej. AFP Popular" /></Field>
        <Field label="ARS (opcional)"><input className={inputClass} style={inputStyle} value={f.ars_name} onChange={set("ars_name")} placeholder="Ej. ARS Humano" /></Field>
      </div>
      <Field label="Notas (opcional)"><input className={inputClass} style={inputStyle} value={f.notes} onChange={set("notes")} /></Field>
      {!f.termination_date && (
        <label className="flex items-center gap-2 text-sm mb-2" style={{ color: C.text }}>
          <input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Activo (entra en las nóminas)
        </label>
      )}
      {error && <div className="text-xs mb-2" style={{ color: C.red }}>{error}</div>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{saving ? "Guardando..." : initial ? "Guardar cambios" : "Agregar empleado"}</button>
      </div>
    </Modal>
  );
}

export function PayrollPeriodFormModal({ periods, defaultFrequency, onClose, onSave, saving }) {
  const [kind, setKind] = useState("regular");
  const [frequency, setFrequency] = useState(defaultFrequency || "quincenal");
  const initialRange = suggestNextPeriod(defaultFrequency || "quincenal", periods);
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [payDate, setPayDate] = useState(initialRange.end);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const changeFrequency = (fq) => {
    setFrequency(fq);
    const r = suggestNextPeriod(fq, periods);
    setStartDate(r.start); setEndDate(r.end); setPayDate(r.end);
  };
  const changeKind = (k) => {
    setKind(k);
    if (k === "regalia") {
      const y = todayStrRD().slice(0, 4);
      setStartDate(`${y}-01-01`); setEndDate(`${y}-12-31`); setPayDate(`${y}-12-20`);
      setDescription(`Regalía pascual ${y}`);
    } else {
      changeFrequency(frequency);
      setDescription("");
    }
  };
  const submit = () => {
    setError("");
    if (!startDate || !endDate || !payDate) { setError("Completa las fechas."); return; }
    if (endDate < startDate) { setError("La fecha final no puede ser antes de la inicial."); return; }
    if (kind === "regular") {
      const overlap = periods.find((p) => p.kind === "regular" && p.frequency === frequency && p.start_date <= endDate && p.end_date >= startDate);
      if (overlap) { setError(`Se cruza con la nómina del ${fmtDate(overlap.start_date)} al ${fmtDate(overlap.end_date)}.`); return; }
    } else if (periods.some((p) => p.kind === "regalia" && p.end_date.slice(0, 4) === endDate.slice(0, 4))) {
      setError("Ya existe una nómina de regalía para ese año."); return;
    }
    onSave({ kind, frequency: kind === "regalia" ? "mensual" : frequency, start_date: startDate, end_date: endDate, pay_date: payDate, description: description.trim() || null });
  };
  return (
    <Modal title="Nueva nómina" onClose={onClose}>
      <Field label="Tipo">
        <select className={inputClass} style={inputStyle} value={kind} onChange={(e) => changeKind(e.target.value)}>
          <option value="regular">Nómina regular</option>
          <option value="regalia">Regalía pascual (salario 13)</option>
        </select>
      </Field>
      {kind === "regular" && (
        <Field label="Frecuencia (entran los empleados que cobran así)">
          <select className={inputClass} style={inputStyle} value={frequency} onChange={(e) => changeFrequency(e.target.value)}>
            {Object.entries(PAYROLL_FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Desde"><input type="date" className={inputClass} style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Hasta"><input type="date" className={inputClass} style={inputStyle} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        <Field label="Fecha de pago"><input type="date" className={inputClass} style={inputStyle} value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field>
      </div>
      <Field label="Descripción (opcional)"><input className={inputClass} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. 1ra quincena de octubre" /></Field>
      {kind === "regalia" && (
        <div className="text-xs mb-2" style={{ color: C.muted }}>Se calcula 1/12 de lo devengado en el año, proporcional a los días trabajados. No paga TSS y está exenta de ISR hasta 5 salarios mínimos (Art. 222 Código de Trabajo). Se paga a más tardar el 20 de diciembre.</div>
      )}
      {error && <div className="text-xs mb-2" style={{ color: C.red }}>{error}</div>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{saving ? "Creando..." : "Crear nómina"}</button>
      </div>
    </Modal>
  );
}

export function PayrollItemsModal({ employee, items, editable, onClose, onAdd, onDelete, saving }) {
  const [concept, setConcept] = useState("horas_extra_35");
  const [qty, setQty] = useState("");
  const [description, setDescription] = useState("");
  const [tss, setTss] = useState(PAYROLL_CONCEPTS.horas_extra_35.tss);
  const [isr, setIsr] = useState(PAYROLL_CONCEPTS.horas_extra_35.isr);
  const [error, setError] = useState("");
  const cfg = PAYROLL_CONCEPTS[concept];
  const pickConcept = (c) => { setConcept(c); setTss(PAYROLL_CONCEPTS[c].tss); setIsr(PAYROLL_CONCEPTS[c].isr); setQty(""); };
  const submit = async () => {
    setError("");
    const n = Number(qty);
    if (!qty || isNaN(n) || n <= 0) { setError(cfg.unit === "hours" ? "Escribe las horas." : cfg.unit === "days" ? "Escribe los días." : "Escribe el monto."); return; }
    const ok = await onAdd({
      concept, description: description.trim() || null,
      hours: cfg.unit === "hours" ? n : null, days: cfg.unit === "days" ? n : null, amount: cfg.unit === "amount" ? n : null,
      cotiza_tss: concept === "descuento" ? false : tss, grava_isr: concept === "descuento" ? false : isr,
    });
    if (ok) { setQty(""); setDescription(""); }
  };
  const unitLabel = (it) => (it.hours != null ? `${Number(it.hours)} h` : it.days != null ? `${Number(it.days)} día(s)` : fmtMoney(it.amount));
  return (
    <Modal title={`Novedades · ${employeeFullName(employee)}`} onClose={onClose} wide>
      <div className="space-y-1 mb-4">
        {items.length === 0 && <div className="text-sm" style={{ color: C.muted }}>Sin novedades en esta nómina: cobra solo su salario.</div>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between px-3 py-2 text-sm" style={{ background: C.panelAlt }}>
            <div>
              <span style={{ color: PAYROLL_CONCEPTS[it.concept]?.sign < 0 ? C.red : C.text }}>{PAYROLL_CONCEPTS[it.concept]?.label || it.concept}</span>
              <span className="ml-2 font-mono">{unitLabel(it)}</span>
              {it.description && <span className="ml-2 text-xs" style={{ color: C.muted }}>{it.description}</span>}
              <span className="ml-2 text-[10px]" style={{ color: C.muted }}>{it.concept === "descuento" ? "después de impuestos" : `${it.cotiza_tss ? "TSS" : "sin TSS"} · ${it.grava_isr ? "ISR" : "sin ISR"}`}</span>
            </div>
            {editable && <button onClick={() => onDelete(it)} style={iconBtnStyle}><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>
      {editable ? (
        <div className="p-3" style={{ border: `1px solid ${C.border}` }}>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Concepto">
              <select className={inputClass} style={inputStyle} value={concept} onChange={(e) => pickConcept(e.target.value)}>
                {Object.entries(PAYROLL_CONCEPTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label={cfg.unit === "hours" ? "Horas" : cfg.unit === "days" ? "Días" : "Monto (RD$)"}>
              <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Detalle (opcional)"><input className={inputClass} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          </div>
          {concept !== "descuento" && (
            <div className="flex gap-4 text-xs mb-2" style={{ color: C.muted }}>
              <label className="flex items-center gap-1"><input type="checkbox" checked={tss} onChange={(e) => setTss(e.target.checked)} /> Cotiza TSS</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={isr} onChange={(e) => setIsr(e.target.checked)} /> Grava ISR</label>
            </div>
          )}
          {cfg.unit !== "amount" && <div className="text-xs mb-2" style={{ color: C.muted }}>El monto lo calcula el sistema con el salario del empleado (salario ÷ días del mes ÷ horas por día{cfg.unit === "hours" ? " × factor de horas extra" : ""}).</div>}
          {error && <div className="text-xs mb-2" style={{ color: C.red }}>{error}</div>}
          <div className="flex justify-end">
            <button onClick={submit} disabled={saving} className="flex items-center gap-1 px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}><Plus size={14} /> Agregar</button>
          </div>
        </div>
      ) : (
        <div className="text-xs" style={{ color: C.muted }}>La nómina está cerrada: las novedades ya no se pueden cambiar.</div>
      )}
      <div className="text-xs mt-3" style={{ color: C.muted }}>Después de agregar o quitar novedades, presiona «Calcular» para ver los montos.</div>
    </Modal>
  );
}

export function EmployeeLoanFormModal({ employees, initial, onClose, onSave, saving }) {
  const [employeeId, setEmployeeId] = useState(initial?.employee_id || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [loanDate, setLoanDate] = useState(initial?.loan_date || todayStrRD());
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [installment, setInstallment] = useState(initial?.installment ?? "");
  const [status, setStatus] = useState(initial?.status || "activo");
  const [error, setError] = useState("");
  const submit = () => {
    setError("");
    if (!employeeId) { setError("Elige el empleado."); return; }
    if (!(Number(amount) > 0)) { setError("Escribe el monto prestado."); return; }
    if (!(Number(installment) > 0)) { setError("Escribe la cuota por nómina."); return; }
    const payload = { employee_id: employeeId, description: description.trim() || null, loan_date: loanDate, installment: Number(installment), status };
    if (!initial || Number(initial.amount) !== Number(amount)) payload.amount = Number(amount);
    onSave(payload);
  };
  return (
    <Modal title={initial ? "Editar préstamo" : "Nuevo préstamo o avance"} onClose={onClose}>
      <Field label="Empleado">
        <SearchSelect items={employees} value={employeeId} onChange={setEmployeeId} placeholder="Buscar empleado..." getLabel={employeeFullName} />
      </Field>
      <Field label="Concepto (opcional)"><input className={inputClass} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Avance de salario" /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Fecha"><input type="date" className={inputClass} style={inputStyle} value={loanDate} onChange={(e) => setLoanDate(e.target.value)} /></Field>
        <Field label="Monto (RD$)"><input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!!initial && Number(initial.balance) !== Number(initial.amount)} /></Field>
        <Field label="Cuota por nómina"><input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={installment} onChange={(e) => setInstallment(e.target.value)} /></Field>
      </div>
      {initial && (
        <Field label="Estado">
          <select className={inputClass} style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="activo">Activo (se descuenta)</option>
            <option value="pausado">Pausado (no se descuenta)</option>
            {Number(initial.balance) <= 0 && <option value="pagado">Pagado</option>}
          </select>
        </Field>
      )}
      <div className="text-xs mb-2" style={{ color: C.muted }}>La cuota se descuenta sola en cada nómina hasta saldar. El saldo solo baja al cerrar una nómina (y se devuelve si se reabre).</div>
      {error && <div className="text-xs mb-2" style={{ color: C.red }}>{error}</div>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{saving ? "Guardando..." : "Guardar"}</button>
      </div>
    </Modal>
  );
}

export function EmployeeVacationFormModal({ employees, onClose, onSave, saving }) {
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState(todayStrRD());
  const [endDate, setEndDate] = useState(todayStrRD());
  const [days, setDays] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    setError("");
    if (!employeeId) { setError("Elige el empleado."); return; }
    if (endDate < startDate) { setError("La fecha final no puede ser antes de la inicial."); return; }
    if (!(Number(days) > 0)) { setError("Escribe los días laborables tomados."); return; }
    onSave({ employee_id: employeeId, start_date: startDate, end_date: endDate, days: Number(days), notes: notes.trim() || null });
  };
  return (
    <Modal title="Registrar vacaciones" onClose={onClose}>
      <Field label="Empleado"><SearchSelect items={employees} value={employeeId} onChange={setEmployeeId} placeholder="Buscar empleado..." getLabel={employeeFullName} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Desde"><input type="date" className={inputClass} style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Hasta"><input type="date" className={inputClass} style={inputStyle} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        <Field label="Días laborables"><input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
      </div>
      <Field label="Notas (opcional)"><input className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="text-xs mb-2" style={{ color: C.muted }}>Las vacaciones se pagan con el salario normal de la nómina; este registro lleva el control de los días.</div>
      {error && <div className="text-xs mb-2" style={{ color: C.red }}>{error}</div>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{saving ? "Guardando..." : "Registrar"}</button>
      </div>
    </Modal>
  );
}

export function PayrollSettingsForm({ settings, canEditSettings, onSave, saving }) {
  const fields = [
    ["afp_employee_pct", "AFP empleado %"], ["afp_employer_pct", "AFP empleador %"],
    ["sfs_employee_pct", "SFS empleado %"], ["sfs_employer_pct", "SFS empleador %"],
    ["srl_employer_pct", "SRL empleador % (según riesgo)"], ["infotep_employer_pct", "INFOTEP empleador %"],
    ["min_cotizable", "Salario mínimo cotizable TSS"], ["afp_cap_multiple", "Tope AFP (× salario mínimo)"],
    ["sfs_cap_multiple", "Tope SFS (× salario mínimo)"], ["srl_cap_multiple", "Tope SRL (× salario mínimo)"],
    ["days_per_month", "Días laborables por mes"], ["hours_per_day", "Horas por día"],
    ["overtime_factor_35", "Factor horas extra (35%)"], ["overtime_factor_100", "Factor horas extra (100%)"],
    ["min_wage", "Salario mínimo para regalía"], ["regalia_isr_exempt_minimums", "Regalía exenta ISR hasta (× salario mínimo)"],
  ];
  const [f, setF] = useState(() => {
    const base = { pay_frequency: settings?.pay_frequency || "quincenal" };
    fields.forEach(([k]) => { base[k] = settings?.[k] ?? ""; });
    base.isr_brackets = (settings?.isr_brackets || []).map((b) => ({ desde: b.desde, tasa: b.tasa, fijo: b.fijo }));
    return base;
  });
  const [error, setError] = useState("");
  const submit = () => {
    setError("");
    const payload = { pay_frequency: f.pay_frequency };
    for (const [k, label] of fields) {
      const n = Number(f[k]);
      if (f[k] === "" || isNaN(n) || n < 0) { setError(`Revisa: ${label}.`); return; }
      payload[k] = n;
    }
    const brackets = f.isr_brackets.map((b) => ({ desde: Number(b.desde), tasa: Number(b.tasa), fijo: Number(b.fijo) }));
    if (brackets.some((b) => [b.desde, b.tasa, b.fijo].some((n) => isNaN(n) || n < 0))) { setError("Revisa la escala de ISR."); return; }
    payload.isr_brackets = brackets.sort((a, b) => a.desde - b.desde);
    payload.updated_at = new Date().toISOString();
    onSave(payload);
  };
  const setBracket = (i, k, v) => setF((prev) => ({ ...prev, isr_brackets: prev.isr_brackets.map((b, j) => (j === i ? { ...b, [k]: v } : b)) }));
  return (
    <div className="max-w-3xl p-5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="text-xs mb-4" style={{ color: C.muted }}>Valores por defecto vigentes a octubre 2026: TSS Res. 01-2025 (salario mínimo cotizable RD$23,223 desde el 1-feb-2026) y escala anual de ISR para asalariados. Si cambian, se actualizan aquí y las próximas nóminas los usan; las nóminas cerradas no cambian.</div>
      <Field label="Frecuencia de pago de la empresa">
        <select className={inputClass} style={inputStyle} value={f.pay_frequency} disabled={!canEditSettings} onChange={(e) => setF((p) => ({ ...p, pay_frequency: e.target.value }))}>
          {Object.entries(PAYROLL_FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <div className="text-xs mb-3 -mt-1" style={{ color: C.muted }}>Cada empleado puede tener su propia frecuencia en su ficha (por ejemplo, obreros semanales y administrativos quincenales).</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {fields.map(([k, label]) => (
          <Field key={k} label={label}>
            <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={f[k]} disabled={!canEditSettings} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />
          </Field>
        ))}
      </div>
      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Escala anual de ISR (asalariados)</div>
      <div className="space-y-2 mb-3">
        {f.isr_brackets.map((b, i) => (
          <div key={i} className="grid grid-cols-3 gap-2 items-center text-sm">
            <label className="flex items-center gap-1"><span className="text-xs w-14" style={{ color: C.muted }}>Desde</span><input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={b.desde} disabled={!canEditSettings} onChange={(e) => setBracket(i, "desde", e.target.value)} /></label>
            <label className="flex items-center gap-1"><span className="text-xs w-14" style={{ color: C.muted }}>Tasa %</span><input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={b.tasa} disabled={!canEditSettings} onChange={(e) => setBracket(i, "tasa", e.target.value)} /></label>
            <label className="flex items-center gap-1"><span className="text-xs w-14" style={{ color: C.muted }}>Fijo</span><input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={b.fijo} disabled={!canEditSettings} onChange={(e) => setBracket(i, "fijo", e.target.value)} /></label>
          </div>
        ))}
      </div>
      <div className="text-xs mb-3" style={{ color: C.muted }}>Cada tramo: «Fijo» + «Tasa %» sobre lo que pase de «Desde». Las retenciones se cuadran por mes: en el último pago del mes el total retenido coincide con lo que corresponde al mes completo.</div>
      {error && <div className="text-xs mb-2" style={{ color: C.red }}>{error}</div>}
      {canEditSettings && (
        <div className="flex justify-end">
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{saving ? "Guardando..." : "Guardar configuración"}</button>
        </div>
      )}
    </div>
  );
}

export function payrollReceiptHtml({ company, companyName, period, line, employee, items }) {
  const row = (label, amount, negative) => (Number(amount) ? `<tr><td>${payrollEsc(label)}</td><td style="text-align:right">${negative ? "-" : ""}${fmtMoney(amount)}</td></tr>` : "");
  const itemsDetail = (items || []).map((it) => `${payrollEsc(PAYROLL_CONCEPTS[it.concept]?.label || it.concept)}${it.hours != null ? ` (${Number(it.hours)} h)` : it.days != null ? ` (${Number(it.days)} días)` : ""}${it.description ? ` — ${payrollEsc(it.description)}` : ""}`).join("<br/>");
  return `
    <div style="page-break-after:always;padding-bottom:16px">
      <div class="header-row">
        <div style="display:flex;gap:12px;align-items:flex-start">
          ${company?.logo_url ? `<img src="${payrollEsc(company.logo_url)}" style="width:48px;height:48px;object-fit:contain" />` : ""}
          <div><h1>${payrollEsc(companyName)}</h1>${company?.rnc ? `<div class="muted">RNC: ${payrollEsc(company.rnc)}</div>` : ""}<div class="muted">Recibo de pago de nómina</div></div>
        </div>
        <div class="muted" style="text-align:right">${period.kind === "regalia" ? "Regalía pascual" : `Período: ${fmtDate(period.start_date)} al ${fmtDate(period.end_date)}`}<br/>Fecha de pago: ${fmtDate(period.pay_date)}</div>
      </div>
      <div class="muted">Empleado: <b style="color:#111">${payrollEsc(employeeFullName(employee))}</b>${employee?.document_number ? ` · ${employee.document_type === "P" ? "Pasaporte" : "Cédula"}: ${payrollEsc(employee.document_number)}` : ""}${employee?.position ? ` · ${payrollEsc(employee.position)}` : ""}</div>
      <table>
        <thead><tr><th>Ingresos</th><th style="text-align:right">Monto</th></tr></thead>
        <tbody>
          ${row("Salario", line.base_amount)}${row("Horas extra", line.overtime_amount)}${row("Comisiones", line.commissions)}${row("Bonos", line.bonuses)}
          ${row("Otros ingresos", line.other_income)}${row("Ingresos exentos", line.exempt_income)}${row("Regalía pascual", line.regalia)}${row("Ausencias sin goce", line.absence_amount, true)}
          <tr><td><b>Total ingresos</b></td><td style="text-align:right"><b>${fmtMoney(line.gross)}</b></td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>Descuentos</th><th style="text-align:right">Monto</th></tr></thead>
        <tbody>
          ${row("AFP (pensión)", line.afp_employee)}${row("SFS (salud)", line.sfs_employee)}${row("ISR retenido", line.isr)}
          ${row("Préstamos / avances", line.loan_deductions)}${row("Otros descuentos", line.other_deductions)}
          <tr><td><b>Total descuentos</b></td><td style="text-align:right"><b>${fmtMoney(Number(line.gross) - Number(line.net))}</b></td></tr>
        </tbody>
      </table>
      <div class="totals"><div class="total"><span>Neto a pagar</span><span>${fmtMoney(line.net)}</span></div></div>
      ${itemsDetail ? `<div class="muted" style="margin-top:8px;font-size:11px">Detalle de novedades:<br/>${itemsDetail}</div>` : ""}
      <div style="display:flex;justify-content:space-between;gap:40px;margin-top:50px">
        <div style="flex:1;border-top:1px solid #333;padding-top:4px;text-align:center" class="muted">Entregado por</div>
        <div style="flex:1;border-top:1px solid #333;padding-top:4px;text-align:center" class="muted">Recibido conforme (empleado)</div>
      </div>
    </div>`;
}

export function PayrollSection({ companyId, company, companyName, branches, technicians, isAdmin, canEditPayroll, canDeletePayroll, setErrorMsg }) {
  const [tab, setTab] = useState("periods");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loanPayments, setLoanPayments] = useState([]);
  const [vacations, setVacations] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null); // null | "new" | employee
  const [showNewPeriod, setShowNewPeriod] = useState(false);
  const [openPeriodId, setOpenPeriodId] = useState(null);
  const [periodLines, setPeriodLines] = useState([]);
  const [periodItems, setPeriodItems] = useState([]);
  const [itemsEmployeeId, setItemsEmployeeId] = useState(null);
  const [editingLoan, setEditingLoan] = useState(null); // null | "new" | loan
  const [showNewVacation, setShowNewVacation] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => todayStrRD().slice(0, 7));
  const [reportYear, setReportYear] = useState(() => todayStrRD().slice(0, 4));
  const [reportBusy, setReportBusy] = useState(false);

  const loadPayroll = async () => {
    setLoading(true);
    const [st, emp, per, ln, lp, vac] = await Promise.all([
      supabase.from("payroll_settings").select("*").eq("company_id", companyId).maybeSingle(),
      fetchAllRows(() => supabase.from("employees").select("*").eq("company_id", companyId)),
      fetchAllRows(() => supabase.from("payroll_periods").select("*").eq("company_id", companyId)),
      fetchAllRows(() => supabase.from("employee_loans").select("*").eq("company_id", companyId)),
      fetchAllRows(() => supabase.from("employee_loan_payments").select("*").eq("company_id", companyId)),
      fetchAllRows(() => supabase.from("employee_vacations").select("*").eq("company_id", companyId)),
    ]);
    setLoading(false);
    const firstError = [st, emp, per, ln, lp, vac].find((r) => r.error)?.error;
    if (firstError) { setErrorMsg(firstError.message); return; }
    let s = st.data;
    if (!s && canEditPayroll) {
      const ins = await supabase.from("payroll_settings").insert({ company_id: companyId }).select().single();
      if (!ins.error) s = ins.data;
    }
    setSettings(s);
    setEmployees((emp.data || []).sort((a, b) => employeeFullName(a).localeCompare(employeeFullName(b))));
    setPeriods((per.data || []).sort((a, b) => (a.end_date < b.end_date ? 1 : a.end_date > b.end_date ? -1 : 0)));
    setLoans(ln.data || []);
    setLoanPayments(lp.data || []);
    setVacations(vac.data || []);
  };
  useEffect(() => { loadPayroll(); /* eslint-disable-next-line */ }, [companyId]);

  const defaultFrequency = settings?.pay_frequency || "quincenal";
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const openPeriod = periods.find((p) => p.id === openPeriodId) || null;

  const loadPeriodDetail = async (periodId) => {
    const [ls, its] = await Promise.all([
      fetchAllRows(() => supabase.from("payroll_lines").select("*").eq("period_id", periodId)),
      fetchAllRows(() => supabase.from("payroll_items").select("*").eq("period_id", periodId)),
    ]);
    if (ls.error || its.error) { setErrorMsg((ls.error || its.error).message); return; }
    setPeriodLines((ls.data || []).sort((a, b) => employeeFullName(employeeById.get(a.employee_id)).localeCompare(employeeFullName(employeeById.get(b.employee_id)))));
    setPeriodItems(its.data || []);
  };
  const openPeriodDetail = (p) => { setOpenPeriodId(p.id); setPeriodLines([]); setPeriodItems([]); loadPeriodDetail(p.id); };

  // ---- Empleados ----
  const saveEmployee = async (payload) => {
    setSaving(true);
    const isNew = editingEmployee === "new";
    const res = isNew
      ? await supabase.from("employees").insert({ ...payload, company_id: companyId }).select().single()
      : await supabase.from("employees").update(payload).eq("id", editingEmployee.id).select().single();
    setSaving(false);
    if (res.error) { setErrorMsg(res.error.message.includes("employees_company_doc_uq") ? "Ya hay un empleado con ese número de documento." : res.error.message); return; }
    setEmployees((prev) => (isNew ? [...prev, res.data] : prev.map((e) => (e.id === res.data.id ? res.data : e))).sort((a, b) => employeeFullName(a).localeCompare(employeeFullName(b))));
    setEditingEmployee(null);
  };
  const deleteEmployee = async (emp) => {
    if (!window.confirm(`¿Eliminar a ${employeeFullName(emp)}? Si ya salió en alguna nómina no se puede: desactívalo en su ficha.`)) return;
    const { error } = await supabase.from("employees").delete().eq("id", emp.id);
    if (error) { setErrorMsg(error.message); return; }
    setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
  };

  // ---- Períodos ----
  const createPeriod = async (payload) => {
    setSaving(true);
    const { data, error } = await supabase.from("payroll_periods").insert({ ...payload, company_id: companyId }).select().single();
    if (error) { setSaving(false); setErrorMsg(error.message); return; }
    const calc = await supabase.rpc("payroll_calculate", { p_period_id: data.id });
    setSaving(false);
    if (calc.error) setErrorMsg(calc.error.message);
    setPeriods((prev) => [{ ...data, calculated_at: new Date().toISOString() }, ...prev]);
    setShowNewPeriod(false);
    openPeriodDetail(data);
  };
  const calculatePeriod = async () => {
    if (!openPeriod) return;
    setSaving(true);
    const { error } = await supabase.rpc("payroll_calculate", { p_period_id: openPeriod.id });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setPeriods((prev) => prev.map((p) => (p.id === openPeriod.id ? { ...p, calculated_at: new Date().toISOString() } : p)));
    loadPeriodDetail(openPeriod.id);
  };
  const closePeriod = async () => {
    if (!openPeriod) return;
    if (!window.confirm("¿Cerrar esta nómina? Se recalcula por última vez, se descuentan las cuotas de préstamos y ya no se podrá modificar (solo un administrador puede reabrirla).")) return;
    setSaving(true);
    const { error } = await supabase.rpc("payroll_close", { p_period_id: openPeriod.id });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    await loadPayroll();
    loadPeriodDetail(openPeriod.id);
  };
  const reopenPeriod = async () => {
    if (!openPeriod) return;
    if (!window.confirm("¿Reabrir esta nómina? Se devuelven las cuotas de préstamos descontadas y vuelve a borrador.")) return;
    setSaving(true);
    const { error } = await supabase.rpc("payroll_reopen", { p_period_id: openPeriod.id });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    await loadPayroll();
    loadPeriodDetail(openPeriod.id);
  };
  const deletePeriod = async (p) => {
    if (!window.confirm("¿Eliminar esta nómina en borrador con sus novedades?")) return;
    const { error } = await supabase.from("payroll_periods").delete().eq("id", p.id);
    if (error) { setErrorMsg(error.message); return; }
    setPeriods((prev) => prev.filter((x) => x.id !== p.id));
    if (openPeriodId === p.id) setOpenPeriodId(null);
  };
  const addItem = async (payload) => {
    setSaving(true);
    const { data, error } = await supabase.from("payroll_items").insert({ ...payload, company_id: companyId, period_id: openPeriod.id, employee_id: itemsEmployeeId }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return false; }
    setPeriodItems((prev) => [...prev, data]);
    return true;
  };
  const deleteItem = async (it) => {
    const { error } = await supabase.from("payroll_items").delete().eq("id", it.id);
    if (error) { setErrorMsg(error.message); return; }
    setPeriodItems((prev) => prev.filter((x) => x.id !== it.id));
  };

  // ---- Préstamos y vacaciones ----
  const saveLoan = async (payload) => {
    setSaving(true);
    const isNew = editingLoan === "new";
    const res = isNew
      ? await supabase.from("employee_loans").insert({ ...payload, company_id: companyId, balance: payload.amount }).select().single()
      : await supabase.from("employee_loans").update(payload).eq("id", editingLoan.id).select().single();
    setSaving(false);
    if (res.error) { setErrorMsg(res.error.message); return; }
    setLoans((prev) => (isNew ? [...prev, res.data] : prev.map((l) => (l.id === res.data.id ? res.data : l))));
    setEditingLoan(null);
  };
  const deleteLoan = async (loan) => {
    if (!window.confirm("¿Eliminar este préstamo?")) return;
    const { error } = await supabase.from("employee_loans").delete().eq("id", loan.id);
    if (error) { setErrorMsg(error.message); return; }
    setLoans((prev) => prev.filter((l) => l.id !== loan.id));
  };
  const saveVacation = async (payload) => {
    setSaving(true);
    const { data, error } = await supabase.from("employee_vacations").insert({ ...payload, company_id: companyId }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setVacations((prev) => [...prev, data]);
    setShowNewVacation(false);
  };
  const deleteVacation = async (v) => {
    if (!window.confirm("¿Eliminar este registro de vacaciones?")) return;
    const { error } = await supabase.from("employee_vacations").delete().eq("id", v.id);
    if (error) { setErrorMsg(error.message); return; }
    setVacations((prev) => prev.filter((x) => x.id !== v.id));
  };
  const saveSettings = async (payload) => {
    setSaving(true);
    const { data, error } = await supabase.from("payroll_settings").upsert({ ...payload, company_id: companyId }).select().single();
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    setSettings(data);
  };

  // ---- Impresión y exportación ----
  const printReceipts = (lines) => {
    if (!openPeriod || lines.length === 0) return;
    const html = lines.map((l) => payrollReceiptHtml({
      company, companyName, period: openPeriod, line: l, employee: employeeById.get(l.employee_id),
      items: periodItems.filter((it) => it.employee_id === l.employee_id),
    })).join("");
    printDocument(`Recibos de nómina ${openPeriod.start_date}`, html);
  };
  const exportPeriodExcel = async () => {
    const XLSX = await loadXlsx();
    if (!openPeriod) return;
    const rows = periodLines.map((l) => {
      const e = employeeById.get(l.employee_id);
      return {
        Empleado: employeeFullName(e), Documento: e?.document_number || "", Cargo: e?.position || "",
        Salario: Number(l.base_amount), "Horas extra": Number(l.overtime_amount), Comisiones: Number(l.commissions), Bonos: Number(l.bonuses),
        "Otros ingresos": Number(l.other_income), Exentos: Number(l.exempt_income), Ausencias: -Number(l.absence_amount), Regalía: Number(l.regalia),
        Bruto: Number(l.gross), AFP: Number(l.afp_employee), SFS: Number(l.sfs_employee), ISR: Number(l.isr),
        Préstamos: Number(l.loan_deductions), "Otros descuentos": Number(l.other_deductions), Neto: Number(l.net),
        "AFP empleador": Number(l.afp_employer), "SFS empleador": Number(l.sfs_employer), "SRL empleador": Number(l.srl_employer), "INFOTEP empleador": Number(l.infotep_employer),
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Nómina");
    XLSX.writeFile(wb, `nomina_${openPeriod.start_date}_${openPeriod.end_date}.xlsx`);
  };
  const exportBankList = async () => {
    const XLSX = await loadXlsx();
    if (!openPeriod) return;
    const rows = periodLines.filter((l) => Number(l.net) > 0).map((l) => {
      const e = employeeById.get(l.employee_id);
      return { Empleado: employeeFullName(e), Documento: e?.document_number || "", "Forma de pago": PAYMENT_METHOD_LABELS[e?.payment_method] || "", Banco: e?.bank_name || "", Cuenta: e?.bank_account || "", Neto: Number(l.net) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Pagos");
    XLSX.writeFile(wb, `pagos_nomina_${openPeriod.pay_date}.xlsx`);
  };
  // Renglones de nóminas CERRADAS, por mes (TSS / IR-3) o por año (IR-13).
  const fetchClosedLines = async (filter) => {
    const closedIds = periods.filter((p) => p.status === "cerrada").map((p) => p.id);
    if (closedIds.length === 0) return [];
    const { data, error } = await fetchByIdChunks(closedIds, (chunk) => filter(supabase.from("payroll_lines").select("*").in("period_id", chunk)));
    if (error) { setErrorMsg(error.message); return null; }
    return data || [];
  };
  const groupLinesByEmployee = (lines) => {
    const map = new Map();
    lines.forEach((l) => {
      const g = map.get(l.employee_id) || { employee_id: l.employee_id, tss_base: 0, isr_base: 0, gross: 0, regalia: 0, exempt: 0, afp: 0, sfs: 0, isr: 0, afp_er: 0, sfs_er: 0, srl: 0, infotep: 0, otherRem: 0 };
      g.tss_base += Number(l.tss_base); g.isr_base += Number(l.isr_base); g.gross += Number(l.gross); g.regalia += Number(l.regalia);
      g.exempt += Number(l.exempt_income); g.afp += Number(l.afp_employee); g.sfs += Number(l.sfs_employee); g.isr += Number(l.isr);
      g.afp_er += Number(l.afp_employer); g.sfs_er += Number(l.sfs_employer); g.srl += Number(l.srl_employer); g.infotep += Number(l.infotep_employer);
      map.set(l.employee_id, g);
    });
    return [...map.values()].map((g) => {
      // Lo que paga ISR pero no TSS (bonos, regalía gravada, etc.)
      g.otherRem = Math.max(g.isr_base + g.afp + g.sfs - g.tss_base, 0);
      return g;
    });
  };
  const round2 = (n) => Math.round(n * 100) / 100;
  const exportTssMonth = async () => {
    const XLSX = await loadXlsx();
    setReportBusy(true);
    const lines = await fetchClosedLines((q) => q.eq("month_key", reportMonth));
    setReportBusy(false);
    if (!lines) return;
    if (lines.length === 0) { setErrorMsg(`No hay nóminas cerradas en ${reportMonth}.`); return; }
    const rows = groupLinesByEmployee(lines).map((g, i) => {
      const e = employeeById.get(g.employee_id);
      const [ap1, ap2] = splitLastNames(e?.last_names);
      return {
        "Clave nómina": "001", "#": i + 1, "Tipo documento": e?.document_type || "", "Número documento": e?.document_number || "", NSS: e?.nss || "",
        Nombres: e?.first_names || "", "Primer apellido": ap1, "Segundo apellido": ap2, Sexo: e?.sex || "", "Fecha nacimiento": e?.birth_date || "",
        "Salario cotizable TSS": round2(g.tss_base), "Salario ISR (después de TSS)": round2(g.isr_base),
        "Otras remuneraciones (ISR, no TSS)": round2(g.otherRem), "Regalía (exento)": round2(g.regalia), "Otros ingresos exentos": round2(g.exempt),
        "Salario INFOTEP": round2(g.tss_base), "AFP empleado": round2(g.afp), "SFS empleado": round2(g.sfs), "ISR retenido": round2(g.isr),
        "AFP empleador": round2(g.afp_er), "SFS empleador": round2(g.sfs_er), "SRL empleador": round2(g.srl), "INFOTEP empleador": round2(g.infotep),
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "TSS");
    XLSX.writeFile(wb, `TSS_autodeterminacion_${reportMonth}.xlsx`);
  };
  const exportIr3Month = async () => {
    const XLSX = await loadXlsx();
    setReportBusy(true);
    const lines = await fetchClosedLines((q) => q.eq("month_key", reportMonth));
    setReportBusy(false);
    if (!lines) return;
    if (lines.length === 0) { setErrorMsg(`No hay nóminas cerradas en ${reportMonth}.`); return; }
    const groups = groupLinesByEmployee(lines);
    const detail = groups.map((g) => {
      const e = employeeById.get(g.employee_id);
      return { Empleado: employeeFullName(e), Documento: e?.document_number || "", "Total pagado": round2(g.gross), "Aportes TSS empleado": round2(g.afp + g.sfs), "Renta gravada": round2(g.isr_base), "ISR retenido": round2(g.isr) };
    });
    const summary = [
      { Concepto: "Mes", Valor: reportMonth },
      { Concepto: "Empleados", Valor: groups.length },
      { Concepto: "Total pagado (bruto)", Valor: round2(sumBy(groups, "gross")) },
      { Concepto: "Aportes TSS de empleados (AFP + SFS)", Valor: round2(sumBy(groups, "afp") + sumBy(groups, "sfs")) },
      { Concepto: "Renta gravada (después de TSS)", Valor: round2(sumBy(groups, "isr_base")) },
      { Concepto: "ISR retenido a asalariados (IR-3)", Valor: round2(sumBy(groups, "isr")) },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Resumen IR-3");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Detalle");
    XLSX.writeFile(wb, `IR-3_${reportMonth}.xlsx`);
  };
  const exportIr13Year = async () => {
    const XLSX = await loadXlsx();
    setReportBusy(true);
    const lines = await fetchClosedLines((q) => q.like("month_key", `${reportYear}-%`));
    setReportBusy(false);
    if (!lines) return;
    if (lines.length === 0) { setErrorMsg(`No hay nóminas cerradas en ${reportYear}.`); return; }
    const rows = groupLinesByEmployee(lines).map((g) => {
      const e = employeeById.get(g.employee_id);
      return {
        "Tipo documento": e?.document_type || "", "Número documento": e?.document_number || "", Empleado: employeeFullName(e),
        "Total pagado": round2(g.gross), "Regalía": round2(g.regalia), "Otros exentos": round2(g.exempt),
        "AFP empleado": round2(g.afp), "SFS empleado": round2(g.sfs), "Renta gravada": round2(g.isr_base), "ISR retenido": round2(g.isr),
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `IR-13 ${reportYear}`);
    XLSX.writeFile(wb, `IR-13_${reportYear}.xlsx`);
  };

  if (loading) return <div className="text-sm" style={{ color: C.muted }}>Cargando nómina...</div>;

  const TABS = [
    ["periods", "Nóminas"], ["employees", "Empleados"], ["loans", "Préstamos"], ["vacations", "Vacaciones"], ["reports", "Reportes TSS / DGII"], ["settings", "Configuración"],
  ];
  const activeEmployees = employees.filter((e) => e.is_active);
  const visibleEmployees = employees.filter((e) => (showInactive || e.is_active) && (`${employeeFullName(e)} ${e.document_number || ""} ${e.position || ""}`).toLowerCase().includes(employeeSearch.toLowerCase()));
  const editable = openPeriod?.status === "borrador" && canEditPayroll;
  const itemsCountFor = (empId) => periodItems.filter((it) => it.employee_id === empId).length;
  const totals = (key) => sumBy(periodLines, key);
  const employerTotal = totals("afp_employer") + totals("sfs_employer") + totals("srl_employer") + totals("infotep_employer");
  const negativeNet = periodLines.filter((l) => Number(l.net) < 0);
  const today = todayStrRD();

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); if (k !== "periods") setOpenPeriodId(null); }} className="px-3 py-2 text-xs font-semibold"
            style={{ background: tab === k ? C.amber : C.panel, color: tab === k ? "#1A1500" : C.muted, border: `1px solid ${tab === k ? C.amber : C.border}` }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "periods" && !openPeriod && (
        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="text-sm" style={{ color: C.muted }}>{activeEmployees.length} empleado(s) activo(s) · pago {PAYROLL_FREQ_LABELS[defaultFrequency]?.toLowerCase()} por defecto</div>
            {canEditPayroll && (
              <button onClick={() => setShowNewPeriod(true)} disabled={activeEmployees.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}><Plus size={14} /> Nueva nómina</button>
            )}
          </div>
          {activeEmployees.length === 0 && <div className="text-sm mb-3" style={{ color: C.orange }}>Primero agrega tus empleados en la pestaña «Empleados».</div>}
          <div className="overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
            <div className="grid grid-cols-12 gap-2 min-w-[720px] px-3 py-2 text-[10px] uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
              <div className="col-span-3">Período</div><div className="col-span-2">Tipo</div><div className="col-span-2">Fecha de pago</div><div className="col-span-3">Descripción</div><div className="col-span-1">Estado</div><div className="col-span-1"></div>
            </div>
            {periods.length === 0 && <div className="px-3 py-6 text-center text-sm" style={{ color: C.muted }}>Todavía no hay nóminas.</div>}
            {periods.map((p) => (
              <div key={p.id} onClick={() => openPeriodDetail(p)} className="grid grid-cols-12 gap-2 min-w-[720px] px-3 py-2.5 text-sm cursor-pointer items-center" style={{ borderBottom: `1px solid ${C.border}` }}>
                <div className="col-span-3">{p.kind === "regalia" ? `Año ${p.end_date.slice(0, 4)}` : `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`}</div>
                <div className="col-span-2 text-xs" style={{ color: C.muted }}>{p.kind === "regalia" ? "Regalía pascual" : PAYROLL_FREQ_LABELS[p.frequency]}</div>
                <div className="col-span-2 text-xs">{fmtDate(p.pay_date)}</div>
                <div className="col-span-3 text-xs truncate" style={{ color: C.muted }}>{p.description || ""}</div>
                <div className="col-span-1"><Pill label={PAYROLL_STATUS_CFG[p.status]?.label} color={PAYROLL_STATUS_CFG[p.status]?.color} /></div>
                <div className="col-span-1 text-right">
                  {p.status === "borrador" && canDeletePayroll && <button onClick={(ev) => { ev.stopPropagation(); deletePeriod(p); }} style={iconBtnStyle}><Trash2 size={13} /></button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "periods" && openPeriod && (
        <div>
          <button onClick={() => setOpenPeriodId(null)} className="flex items-center gap-1 text-sm mb-3" style={{ color: C.muted }}><ChevronLeft size={16} /> Todas las nóminas</button>
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div>
              <div className="text-lg font-semibold flex items-center gap-2">
                {openPeriod.kind === "regalia" ? `Regalía pascual ${openPeriod.end_date.slice(0, 4)}` : `Nómina ${PAYROLL_FREQ_LABELS[openPeriod.frequency]?.toLowerCase()} · ${fmtDate(openPeriod.start_date)} al ${fmtDate(openPeriod.end_date)}`}
                <Pill label={PAYROLL_STATUS_CFG[openPeriod.status]?.label} color={PAYROLL_STATUS_CFG[openPeriod.status]?.color} />
              </div>
              <div className="text-xs mt-1" style={{ color: C.muted }}>Pago: {fmtDate(openPeriod.pay_date)}{openPeriod.description ? ` · ${openPeriod.description}` : ""}{openPeriod.calculated_at ? ` · calculada ${new Date(openPeriod.calculated_at).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" })}` : ""}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {editable && <button onClick={calculatePeriod} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ border: `1px solid ${C.border}`, color: C.text }}><Calculator size={13} /> Calcular</button>}
              {editable && <button onClick={closePeriod} disabled={saving || periodLines.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ background: C.green, color: "#08210F" }}><Lock size={13} /> Cerrar nómina</button>}
              {openPeriod.status === "cerrada" && isAdmin && <button onClick={reopenPeriod} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ border: `1px solid ${C.orange}`, color: C.orange }}><RotateCcw size={13} /> Reabrir</button>}
              <button onClick={() => printReceipts(periodLines)} disabled={periodLines.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.text }}><Printer size={13} /> Recibos</button>
              <button onClick={exportPeriodExcel} disabled={periodLines.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.text }}><FileSpreadsheet size={13} /> Excel</button>
              <button onClick={exportBankList} disabled={periodLines.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ border: `1px solid ${C.border}`, color: C.text }}><Banknote size={13} /> Lista de pagos</button>
            </div>
          </div>

          {openPeriod.status === "borrador" && (
            <div className="text-xs mb-3 px-3 py-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.muted }}>
              Borrador: agrega horas extra, comisiones, bonos, ausencias o descuentos con el botón «Novedades» de cada empleado y presiona «Calcular». Al cerrar se recalcula por última vez y se descuentan las cuotas de préstamos. Los topes de TSS y el ISR se cuadran por mes: cierra las nóminas del mes en orden.
            </div>
          )}
          {negativeNet.length > 0 && (
            <div className="text-xs mb-3 px-3 py-2" style={{ background: C.redBg, color: C.red }}>{negativeNet.length} empleado(s) quedan con neto negativo: revisa sus descuentos o pausa algún préstamo.</div>
          )}

          <div className="flex gap-3 flex-wrap mb-4">
            <KpiCard label="Empleados" value={periodLines.length} accent={C.blue} />
            <KpiCard label="Total bruto" value={fmtMoney(totals("gross"))} accent={C.amber} />
            <KpiCard label="Neto a pagar" value={fmtMoney(totals("net"))} accent={C.green} sub={`ISR ${fmtMoney(totals("isr"))} · TSS empleados ${fmtMoney(totals("afp_employee") + totals("sfs_employee"))}`} />
            <KpiCard label="Aportes patronales" value={fmtMoney(employerTotal)} accent={C.muted} sub={`Costo total ${fmtMoney(totals("gross") + employerTotal)}`} />
          </div>

          <div className="overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
            <table className="w-full text-sm min-w-[980px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-[10px] uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <th className="text-left px-3 py-2">Empleado</th>
                  <th className="text-right px-2 py-2">{openPeriod.kind === "regalia" ? "Regalía" : "Salario"}</th>
                  <th className="text-right px-2 py-2">Otros ingresos</th>
                  <th className="text-right px-2 py-2">Bruto</th>
                  <th className="text-right px-2 py-2">AFP</th>
                  <th className="text-right px-2 py-2">SFS</th>
                  <th className="text-right px-2 py-2">ISR</th>
                  <th className="text-right px-2 py-2">Préstamos / otros</th>
                  <th className="text-right px-2 py-2">Neto</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {periodLines.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-6 text-center" style={{ color: C.muted }}>{openPeriod.status === "borrador" ? "Sin renglones: presiona «Calcular». Entran los empleados activos con esta frecuencia de pago y fecha de ingreso dentro del período." : "Sin renglones."}</td></tr>
                )}
                {periodLines.map((l) => {
                  const e = employeeById.get(l.employee_id);
                  const others = Number(l.overtime_amount) + Number(l.commissions) + Number(l.bonuses) + Number(l.other_income) + Number(l.exempt_income) - Number(l.absence_amount);
                  return (
                    <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="px-3 py-2">
                        <div>{employeeFullName(e)}</div>
                        <div className="text-[11px]" style={{ color: C.muted }}>{e?.position || ""}{l.detail?.dias_trabajados != null && openPeriod.kind === "regular" ? ` · ${l.detail.dias_trabajados} día(s)` : ""}</div>
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{fmtMoney(openPeriod.kind === "regalia" ? l.regalia : l.base_amount)}</td>
                      <td className="px-2 py-2 text-right font-mono" style={{ color: others < 0 ? C.red : C.text }}>{others ? fmtMoney(others) : "—"}</td>
                      <td className="px-2 py-2 text-right font-mono">{fmtMoney(l.gross)}</td>
                      <td className="px-2 py-2 text-right font-mono" style={{ color: C.muted }}>{fmtMoney(l.afp_employee)}</td>
                      <td className="px-2 py-2 text-right font-mono" style={{ color: C.muted }}>{fmtMoney(l.sfs_employee)}</td>
                      <td className="px-2 py-2 text-right font-mono" style={{ color: C.muted }}>{fmtMoney(l.isr)}</td>
                      <td className="px-2 py-2 text-right font-mono" style={{ color: C.muted }}>{fmtMoney(Number(l.loan_deductions) + Number(l.other_deductions))}</td>
                      <td className="px-2 py-2 text-right font-mono font-semibold" style={{ color: Number(l.net) < 0 ? C.red : C.text }}>{fmtMoney(l.net)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <button onClick={() => setItemsEmployeeId(l.employee_id)} className="text-xs px-2 py-1 mr-1" style={{ border: `1px solid ${C.border}`, color: C.amber }}>Novedades{itemsCountFor(l.employee_id) ? ` (${itemsCountFor(l.employee_id)})` : ""}</button>
                        <button onClick={() => printReceipts([l])} title="Imprimir recibo" style={iconBtnStyle}><Printer size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {periodLines.length > 0 && (
                <tfoot>
                  <tr className="font-semibold" style={{ borderTop: `2px solid ${C.border}` }}>
                    <td className="px-3 py-2">Totales</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtMoney(openPeriod.kind === "regalia" ? totals("regalia") : totals("base_amount"))}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtMoney(totals("overtime_amount") + totals("commissions") + totals("bonuses") + totals("other_income") + totals("exempt_income") - totals("absence_amount"))}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtMoney(totals("gross"))}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtMoney(totals("afp_employee"))}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtMoney(totals("sfs_employee"))}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtMoney(totals("isr"))}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtMoney(totals("loan_deductions") + totals("other_deductions"))}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtMoney(totals("net"))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {periodLines.length > 0 && (
            <div className="text-xs mt-2" style={{ color: C.muted }}>
              Aportes patronales: AFP {fmtMoney(totals("afp_employer"))} · SFS {fmtMoney(totals("sfs_employer"))} · SRL {fmtMoney(totals("srl_employer"))} · INFOTEP {fmtMoney(totals("infotep_employer"))}. Los paga la empresa, no se descuentan al empleado.
            </div>
          )}
        </div>
      )}

      {tab === "employees" && (
        <div>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                <Search size={14} style={{ color: C.muted }} />
                <input value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} placeholder="Buscar empleado..." className="bg-transparent outline-none text-sm" style={{ color: C.text }} />
              </div>
              <label className="flex items-center gap-1 text-xs" style={{ color: C.muted }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar inactivos</label>
            </div>
            {canEditPayroll && <button onClick={() => setEditingEmployee("new")} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}><UserPlus size={14} /> Nuevo empleado</button>}
          </div>
          <div className="overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
            <div className="grid grid-cols-12 gap-2 min-w-[820px] px-3 py-2 text-[10px] uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
              <div className="col-span-3">Empleado</div><div className="col-span-2">Documento</div><div className="col-span-2">Cargo</div><div className="col-span-1">Ingreso</div><div className="col-span-1">Frecuencia</div><div className="col-span-2 text-right">Salario mensual</div><div className="col-span-1"></div>
            </div>
            {visibleEmployees.length === 0 && <div className="px-3 py-6 text-center text-sm" style={{ color: C.muted }}>Sin empleados.</div>}
            {visibleEmployees.map((e) => (
              <div key={e.id} className="grid grid-cols-12 gap-2 min-w-[820px] px-3 py-2.5 text-sm items-center" style={{ borderBottom: `1px solid ${C.border}`, opacity: e.is_active ? 1 : 0.55 }}>
                <div className="col-span-3">
                  <div>{employeeFullName(e)}</div>
                  <div className="text-[11px]" style={{ color: C.muted }}>{branches.find((b) => b.id === e.branch_id)?.name || ""}{e.technician_id ? " · técnico vinculado" : ""}{!e.is_active ? (e.termination_date ? ` · salió ${fmtDate(e.termination_date)}` : " · inactivo") : ""}</div>
                </div>
                <div className="col-span-2 font-mono text-xs">{e.document_number || "—"}</div>
                <div className="col-span-2 text-xs" style={{ color: C.muted }}>{e.position || "—"}</div>
                <div className="col-span-1 text-xs">{fmtDate(e.hire_date)}</div>
                <div className="col-span-1 text-xs" style={{ color: C.muted }}>{PAYROLL_FREQ_LABELS[e.pay_frequency || defaultFrequency]}</div>
                <div className="col-span-2 text-right font-mono">{fmtMoney(e.base_salary)}</div>
                <div className="col-span-1 flex justify-end gap-1">
                  {canEditPayroll && <button onClick={() => setEditingEmployee(e)} style={iconBtnStyle}><Pencil size={13} /></button>}
                  {canDeletePayroll && <button onClick={() => deleteEmployee(e)} style={iconBtnStyle}><Trash2 size={13} /></button>}
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs mt-2" style={{ color: C.muted }}>Total salarios mensuales de activos: {fmtMoney(sumBy(activeEmployees, "base_salary"))}</div>
        </div>
      )}

      {tab === "loans" && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm" style={{ color: C.muted }}>Saldo pendiente total: <span className="font-mono" style={{ color: C.text }}>{fmtMoney(sumBy(loans.filter((l) => l.status !== "pagado"), "balance"))}</span></div>
            {canEditPayroll && <button onClick={() => setEditingLoan("new")} disabled={activeEmployees.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}><HandCoins size={14} /> Nuevo préstamo</button>}
          </div>
          <div className="overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
            <div className="grid grid-cols-12 gap-2 min-w-[760px] px-3 py-2 text-[10px] uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
              <div className="col-span-3">Empleado</div><div className="col-span-2">Concepto</div><div className="col-span-1">Fecha</div><div className="col-span-2 text-right">Monto</div><div className="col-span-1 text-right">Cuota</div><div className="col-span-2 text-right">Saldo</div><div className="col-span-1"></div>
            </div>
            {loans.length === 0 && <div className="px-3 py-6 text-center text-sm" style={{ color: C.muted }}>No hay préstamos registrados.</div>}
            {[...loans].sort((a, b) => (a.loan_date < b.loan_date ? 1 : -1)).map((l) => {
              const paid = loanPayments.filter((p) => p.loan_id === l.id);
              return (
                <div key={l.id} className="grid grid-cols-12 gap-2 min-w-[760px] px-3 py-2.5 text-sm items-center" style={{ borderBottom: `1px solid ${C.border}`, opacity: l.status === "pagado" ? 0.55 : 1 }}>
                  <div className="col-span-3">{employeeFullName(employeeById.get(l.employee_id))}<div className="text-[11px]" style={{ color: l.status === "pausado" ? C.orange : C.muted }}>{l.status === "activo" ? "Activo" : l.status === "pausado" ? "Pausado" : "Pagado"} · {paid.length} cuota(s) descontada(s)</div></div>
                  <div className="col-span-2 text-xs truncate" style={{ color: C.muted }}>{l.description || "—"}</div>
                  <div className="col-span-1 text-xs">{fmtDate(l.loan_date)}</div>
                  <div className="col-span-2 text-right font-mono">{fmtMoney(l.amount)}</div>
                  <div className="col-span-1 text-right font-mono text-xs">{fmtMoney(l.installment)}</div>
                  <div className="col-span-2 text-right font-mono font-semibold">{fmtMoney(l.balance)}</div>
                  <div className="col-span-1 flex justify-end gap-1">
                    {canEditPayroll && <button onClick={() => setEditingLoan(l)} style={iconBtnStyle}><Pencil size={13} /></button>}
                    {canDeletePayroll && paid.length === 0 && <button onClick={() => deleteLoan(l)} style={iconBtnStyle}><Trash2 size={13} /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "vacations" && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <div className="text-xs" style={{ color: C.muted }}>14 días laborables al cumplir 1 año de servicio; 18 a partir de los 5 años (Art. 177 Código de Trabajo).</div>
            {canEditPayroll && <button onClick={() => setShowNewVacation(true)} disabled={activeEmployees.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}><Plane size={14} /> Registrar vacaciones</button>}
          </div>
          <div className="overflow-x-auto mb-5" style={{ border: `1px solid ${C.border}` }}>
            <div className="grid grid-cols-12 gap-2 min-w-[700px] px-3 py-2 text-[10px] uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
              <div className="col-span-4">Empleado</div><div className="col-span-2">Años de servicio</div><div className="col-span-2 text-right">Le corresponden</div><div className="col-span-2 text-right">Tomados (año actual)</div><div className="col-span-2 text-right">Disponibles</div>
            </div>
            {activeEmployees.map((e) => {
              const years = yearsOfService(e.hire_date, today);
              const entitled = vacationDaysFor(years);
              const since = years >= 1 ? lastAnniversary(e.hire_date, today) : e.hire_date;
              const taken = vacations.filter((v) => v.employee_id === e.id && v.start_date >= since).reduce((s, v) => s + Number(v.days), 0);
              return (
                <div key={e.id} className="grid grid-cols-12 gap-2 min-w-[700px] px-3 py-2 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <div className="col-span-4">{employeeFullName(e)}</div>
                  <div className="col-span-2 text-xs" style={{ color: C.muted }}>{years} {years === 1 ? "año" : "años"}{years >= 1 ? ` · desde ${fmtDate(since)}` : ""}</div>
                  <div className="col-span-2 text-right font-mono">{entitled}</div>
                  <div className="col-span-2 text-right font-mono">{taken}</div>
                  <div className="col-span-2 text-right font-mono font-semibold" style={{ color: entitled - taken < 0 ? C.red : C.text }}>{years >= 1 ? entitled - taken : "Aún no cumple 1 año"}</div>
                </div>
              );
            })}
          </div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Historial</div>
          <div style={{ border: `1px solid ${C.border}` }}>
            {vacations.length === 0 && <div className="px-3 py-4 text-center text-sm" style={{ color: C.muted }}>Sin registros.</div>}
            {[...vacations].sort((a, b) => (a.start_date < b.start_date ? 1 : -1)).map((v) => (
              <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                <div>{employeeFullName(employeeById.get(v.employee_id))} <span className="text-xs ml-2" style={{ color: C.muted }}>{fmtDate(v.start_date)} – {fmtDate(v.end_date)} · {Number(v.days)} día(s){v.notes ? ` · ${v.notes}` : ""}</span></div>
                {canDeletePayroll && <button onClick={() => deleteVacation(v)} style={iconBtnStyle}><Trash2 size={13} /></button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "reports" && (
        <div className="space-y-4 max-w-3xl">
          <div className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="text-sm font-semibold mb-1">Mensual: TSS e IR-3</div>
            <div className="text-xs mb-3" style={{ color: C.muted }}>Suma las nóminas CERRADAS del mes (por fecha final del período).</div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Mes"><input type="month" className={inputClass} style={inputStyle} value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} /></Field>
              <div className="pb-3 flex flex-wrap gap-2">
                <button onClick={exportTssMonth} disabled={reportBusy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}><Download size={13} /> Datos para la TSS (Excel)</button>
                <button onClick={exportIr3Month} disabled={reportBusy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ border: `1px solid ${C.border}`, color: C.text }}><Download size={13} /> Resumen IR-3 (Excel)</button>
              </div>
            </div>
            <div className="text-xs" style={{ color: C.muted }}>El Excel de la TSS trae, por empleado, los datos que pide la autodeterminación mensual en el SUIR+ (documento, nombres, salario cotizable, salario ISR, otras remuneraciones, exentos, regalía). Pásalos a la plantilla oficial de la TSS; el formato exacto del archivo TXT de la TSS todavía no está generado.</div>
          </div>
          <div className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <div className="text-sm font-semibold mb-1">Anual: IR-13</div>
            <div className="text-xs mb-3" style={{ color: C.muted }}>Por empleado: total pagado, exentos, aportes a la TSS, renta gravada e ISR retenido del año.</div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Año"><input type="number" className={inputClass} style={{ ...inputStyle, width: 110 }} value={reportYear} onChange={(e) => setReportYear(e.target.value)} /></Field>
              <div className="pb-3"><button onClick={exportIr13Year} disabled={reportBusy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}><Download size={13} /> Resumen IR-13 (Excel)</button></div>
            </div>
          </div>
        </div>
      )}

      {tab === "settings" && (
        settings
          ? <PayrollSettingsForm key={settings.updated_at} settings={settings} canEditSettings={canEditPayroll} onSave={saveSettings} saving={saving} />
          : <div className="text-sm" style={{ color: C.muted }}>La configuración se crea la primera vez que entra alguien con permiso para editar nómina.</div>
      )}

      {editingEmployee && (
        <EmployeeFormModal initial={editingEmployee === "new" ? null : editingEmployee} branches={branches} technicians={technicians} defaultFrequency={defaultFrequency}
          onClose={() => setEditingEmployee(null)} onSave={saveEmployee} saving={saving} />
      )}
      {showNewPeriod && <PayrollPeriodFormModal periods={periods} defaultFrequency={defaultFrequency} onClose={() => setShowNewPeriod(false)} onSave={createPeriod} saving={saving} />}
      {itemsEmployeeId && openPeriod && (
        <PayrollItemsModal employee={employeeById.get(itemsEmployeeId)} items={periodItems.filter((it) => it.employee_id === itemsEmployeeId)} editable={editable}
          onClose={() => setItemsEmployeeId(null)} onAdd={addItem} onDelete={deleteItem} saving={saving} />
      )}
      {editingLoan && (
        <EmployeeLoanFormModal employees={editingLoan === "new" ? activeEmployees : employees} initial={editingLoan === "new" ? null : editingLoan}
          onClose={() => setEditingLoan(null)} onSave={saveLoan} saving={saving} />
      )}
      {showNewVacation && <EmployeeVacationFormModal employees={activeEmployees} onClose={() => setShowNewVacation(false)} onSave={saveVacation} saving={saving} />}
    </div>
  );
}
