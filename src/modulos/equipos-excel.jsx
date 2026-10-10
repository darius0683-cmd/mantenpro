// Equipos en Excel: descargar la lista (para revisar o llenar en campo) y volver a subirla.
// - La columna "ID (no tocar)" une cada fila con su equipo: con ID se actualiza ese equipo,
//   sin ID se crea uno nuevo (o, si su número de serie ya existe en un solo equipo, se actualiza ese).
// - Antes de guardar se muestra un resumen (nuevos, a actualizar, sin cambios, con errores);
//   las filas con errores no se cargan. Nunca se borra ningún equipo desde el Excel.
// - Sucursal y técnico deben existir; una ubicación que no exista en esa sucursal se crea.
// - Fechas: se descargan como fechas reales de Excel con formato día/mes/año en las DOS columnas
//   (instalación y próximo mantenimiento), y al subir se leen como número de fecha de Excel, así
//   no dependen de cómo tenga configurada la fecha la computadora.
import React, { useState } from "react";
import { Download, Upload } from "lucide-react";
import { supabase } from "../supabaseClient";
import { C, Modal, fetchAllRows, loadXlsx, techWorksAtBranch, todayStrRD } from "./base.jsx";

const COLS = {
  id: "ID (no tocar)",
  name: "Nombre *",
  type: "Tipo",
  status: "Estado",
  brand: "Marca",
  model: "Modelo",
  capacity: "Capacidad",
  capacityUnit: "Unidad de capacidad",
  serial: "Número de serie",
  installed: "Fecha de instalación",
  branch: "Sucursal *",
  location: "Ubicación",
  tech: "Técnico por defecto",
  client: "Cliente (dueño)",
  freq: "Frecuencia mantenimiento (días)",
  next: "Próximo mantenimiento",
  unit: "Unidad de uso",
  usage: "Lectura actual",
  interval: "Cada cuántas unidades",
  checklist: "Checklist del mantenimiento",
};
const HEADERS = Object.values(COLS);
const STATUS_LABEL = { operativo: "Operativo", fuera_servicio: "Fuera de servicio" };
// Campos que se comparan para saber si una fila trae cambios.
const FIELDS = ["name", "type", "operational_status", "brand", "model", "serial_number", "installed_at", "branch_id", "location_id", "default_technician_id", "maintenance_frequency_days", "next_maintenance_date", "usage_unit", "current_usage", "usage_interval"];
// Columnas de fecha (mismo formato en las dos)
const DATE_KEYS = ["installed", "next"];
const DATE_FMT = "dd/mm/yyyy";

const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const text = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };
const pad = (n) => String(n).padStart(2, "0");

// "AAAA-MM-DD" -> número de fecha de Excel (sin hora, sin zona horaria)
const isoToSerial = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 + 25569;
};

// Fechas: acepta fecha de Excel, AAAA-MM-DD o DD/MM/AAAA. Devuelve "AAAA-MM-DD", null (vacío) o undefined (inválida).
function parseDate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? undefined : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === "number") {
    if (!isFinite(v) || v < 1) return undefined;
    const d = new Date((Math.floor(v) - 25569) * 86400000);
    return isNaN(d) ? undefined : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  let y, m, d;
  let mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (mt) [, y, m, d] = mt;
  else if ((mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [, d, m, y] = mt;
  else return undefined;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(m) - 1 || dt.getDate() !== Number(d)) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}
// Números: vacío -> null; inválido -> undefined.
function parseNum(v, { int = false, min = 0 } = {}) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(/,/g, ""));
  if (!isFinite(n) || n < min || (int && !Number.isInteger(n))) return undefined;
  return n;
}
const sameVal = (a, b) => (a ?? null) === (b ?? null) || (a != null && b != null && String(a) === String(b));

// ---------------------------------------------------------------------------
// Descargar
// ---------------------------------------------------------------------------
// Nombre con que sale cada checklist en el Excel. Si dos checklists se llaman igual, se le agrega
// el tipo de equipo entre paréntesis para distinguirlos: "Mensual (Chiller)".
export function checklistExcelNames(templates) {
  const count = new Map();
  (templates || []).forEach((t) => count.set(norm(t.name), (count.get(norm(t.name)) || 0) + 1));
  return new Map((templates || []).map((t) => [t.id, count.get(norm(t.name)) > 1 ? `${t.name} (${t.equipment_type})` : t.name]));
}

export async function downloadEquipmentExcel({ list, branches, locations, technicians, clients = [], checklistTemplates = [], companyName }) {
  const ckNames = checklistExcelNames(checklistTemplates);
  const XLSX = await loadXlsx();
  const branchName = (id) => branches.find((b) => b.id === id)?.name || "";
  const locName = (id) => locations.find((l) => l.id === id)?.name || "";
  const techName = (id) => technicians.find((t) => t.id === id)?.name || "";
  const clientName = (id) => clients.find((c) => c.id === id)?.name || "";
  const sorted = list.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
  const rows = sorted.map((e) => ({
    [COLS.id]: e.id,
    [COLS.name]: e.name || "",
    [COLS.type]: e.type || "",
    [COLS.status]: STATUS_LABEL[e.operational_status] || "Operativo",
    [COLS.brand]: e.brand || "",
    [COLS.model]: e.model || "",
    [COLS.capacity]: e.capacity ?? "",
    [COLS.capacityUnit]: e.capacity_unit || "",
    [COLS.serial]: e.serial_number || "",
    [COLS.installed]: "",
    [COLS.branch]: branchName(e.branch_id),
    [COLS.location]: locName(e.location_id),
    [COLS.tech]: techName(e.default_technician_id),
    [COLS.client]: clientName(e.client_id),
    [COLS.freq]: e.maintenance_frequency_days ?? "",
    [COLS.next]: "",
    [COLS.unit]: e.usage_unit || "",
    [COLS.usage]: e.current_usage ?? "",
    [COLS.interval]: e.usage_interval ?? "",
    [COLS.checklist]: e.default_checklist_template_id ? (ckNames.get(e.default_checklist_template_id) || "") : "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS });

  // Las dos fechas como fechas reales de Excel, con el mismo formato día/mes/año.
  const dateCols = DATE_KEYS.map((k) => HEADERS.indexOf(COLS[k]));
  const values = { installed: sorted.map((e) => e.installed_at), next: sorted.map((e) => e.next_maintenance_date) };
  for (let r = 1; r <= rows.length; r++) {
    DATE_KEYS.forEach((k, j) => {
      const ref = XLSX.utils.encode_cell({ r, c: dateCols[j] });
      const serial = isoToSerial(values[k][r - 1]);
      if (serial != null) ws[ref] = { t: "n", v: serial, z: DATE_FMT };
      else delete ws[ref];
    });
  }
  ws["!cols"] = [38, 30, 16, 16, 14, 16, 12, 12, 18, 14, 18, 18, 20, 26, 14, 14, 10, 10, 12, 30].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: `A1:T${Math.max(rows.length, 1) + 1}` };

  const listas = [["Sucursales", "Ubicaciones (sucursal → ubicación)", "Técnicos activos", "Estado", "Unidad de uso", "Clientes", "Checklists (tipo de equipo)"]];
  const ckRows = checklistTemplates.map((t) => [ckNames.get(t.id), t.equipment_type]).sort((a, b) => a[0].localeCompare(b[0], "es"));
  const locRows = locations.map((l) => `${branchName(l.branch_id)} → ${l.name}`).sort();
  const techRows = technicians.filter((t) => t.is_active !== false).map((t) => t.name).sort();
  const clientRows = clients.map((c) => c.name).filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
  const n = Math.max(branches.length, locRows.length, techRows.length, clientRows.length, ckRows.length, 2);
  for (let i = 0; i < n; i++) listas.push([branches[i]?.name || "", locRows[i] || "", techRows[i] || "", ["Operativo", "Fuera de servicio"][i] || "", ["horas", "km"][i] || "", clientRows[i] || "", ckRows[i] ? `${ckRows[i][0]}  →  ${ckRows[i][1]}` : ""]);
  const wsListas = XLSX.utils.aoa_to_sheet(listas);
  wsListas["!cols"] = [{ wch: 24 }, { wch: 40 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 34 }, { wch: 44 }];

  const ayuda = [
    ["Cómo usar este archivo"],
    [""],
    ["• Para AGREGAR equipos: escribe filas nuevas al final y deja vacía la columna \"ID (no tocar)\"."],
    ["• Para CORREGIR equipos: cambia los datos en su fila. No cambies ni borres el ID: es lo que une la fila con el equipo."],
    ["• Si una fila nueva (sin ID) trae un número de serie que ya tiene un equipo, se actualiza ese equipo en vez de crear otro."],
    ["• Borrar una fila del Excel NO borra el equipo de la app. Para eliminar, hazlo desde la app."],
    ["• Una celda vacía deja ese dato vacío en el equipo (por ejemplo, sin técnico o sin marca)."],
    [""],
    ["Columnas obligatorias: Nombre y Sucursal. La sucursal debe escribirse igual que en la hoja \"Listas\"."],
    ["Estado: Operativo o Fuera de servicio (vacío = Operativo)."],
    ["Capacidad: solo el número (24000, 5, 60). Unidad de capacidad: BTU, TR, kW, kVA, HP... Escribe la unidad igual que en otros equipos para poder comparar."],
    ["Ubicación: si no existe en esa sucursal, se crea al subir el archivo."],
    ["Técnico por defecto: debe existir, estar activo y trabajar en esa sucursal (hoja \"Listas\")."],
    ["Cliente (dueño): el cliente al que pertenece el equipo, escrito igual que en la hoja \"Listas\". Vacío = equipo propio. Con cliente, el equipo sale en el portal de ese cliente."],
    [""],
    ["FECHAS (Fecha de instalación y Próximo mantenimiento) — las dos columnas usan el mismo formato: día/mes/año (03/10/2026 = 3 de octubre)."],
    ["• La forma más segura de escribir una fecha es AÑO-MES-DÍA: 2026-10-03. Excel la entiende igual en cualquier computadora."],
    ["• Si escribes 03/10/2026 y tu Excel está configurado en inglés (mes/día), Excel la puede guardar como 10 de marzo. Para evitarlo, usa 2026-10-03."],
    ["• Para revisar: al subir el archivo, la app muestra los equipos que cambian; verifica ahí que las fechas sean las correctas antes de cargar."],
    [""],
    ["Checklist del mantenimiento: escribe el nombre del checklist tal como sale en la hoja \"Listas\" (lo de antes de la flecha). El equipo lo adopta y se carga solo en sus órdenes de mantenimiento. Vacío = sin checklist fijo (se usa el único de su tipo, si hay uno)."],
    ["Unidad de uso: horas o km. Si la dejas vacía, no se guardan Lectura actual ni Cada cuántas unidades."],
    [""],
    ["Al subir el archivo, la app muestra primero un resumen (nuevos, a actualizar, sin cambios y filas con errores) y solo guarda cuando confirmas."],
    ["Las filas con errores no se cargan: corrígelas y vuelve a subir el mismo archivo (las ya cargadas saldrán \"sin cambios\")."],
  ];
  const wsAyuda = XLSX.utils.aoa_to_sheet(ayuda);
  wsAyuda["!cols"] = [{ wch: 120 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Equipos");
  XLSX.utils.book_append_sheet(wb, wsListas, "Listas");
  XLSX.utils.book_append_sheet(wb, wsAyuda, "Instrucciones");
  const safe = String(companyName || "empresa").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "empresa";
  XLSX.writeFile(wb, `equipos-${safe}-${todayStrRD()}.xlsx`);
}

// ---------------------------------------------------------------------------
// Leer y validar el Excel (sin guardar nada)
// ---------------------------------------------------------------------------
export function analyzeEquipmentRows(rawRows, { equipment, branches, locations, technicians, clients = [], checklistTemplates = [] }) {
  // Checklists por nombre (como salen en el Excel) y por nombre solo
  const ckNames = checklistExcelNames(checklistTemplates);
  const ckByExcelName = new Map();
  checklistTemplates.forEach((t) => {
    for (const k of new Set([norm(ckNames.get(t.id)), norm(t.name)])) ckByExcelName.set(k, [...(ckByExcelName.get(k) || []), t]);
  });
  const byId = new Map(equipment.map((e) => [e.id, e]));
  const bySerial = new Map();
  equipment.forEach((e) => { const k = norm(e.serial_number); if (k) bySerial.set(k, [...(bySerial.get(k) || []), e]); });
  const branchesByName = new Map();
  branches.forEach((b) => { const k = norm(b.name); branchesByName.set(k, [...(branchesByName.get(k) || []), b]); });
  const techsByName = new Map();
  technicians.forEach((t) => { const k = norm(t.name); techsByName.set(k, [...(techsByName.get(k) || []), t]); });
  const clientsByName = new Map();
  clients.forEach((c) => { const k = norm(c.name); clientsByName.set(k, [...(clientsByName.get(k) || []), c]); });

  const result = { creates: [], updates: [], unchanged: 0, errors: [], newLocations: [], possibleDuplicates: [] };
  const existingNameBranch = new Map();
  equipment.forEach((e) => { const k = norm(e.name) + "||" + e.branch_id; existingNameBranch.set(k, (existingNameBranch.get(k) || 0) + 1); });
  const newLocKeys = new Map();
  const seenTargets = new Map();
  const seenNewSerials = new Map();

  rawRows.forEach((raw, i) => {
    const rowNum = i + 2; // fila 1 = encabezados
    const get = (key) => raw[COLS[key]] ?? raw[COLS[key].replace(" *", "")] ?? "";
    if (HEADERS.every((h) => String(raw[h] ?? "").trim() === "")) return; // fila vacía
    const errs = [];
    const name = text(get("name"));
    if (!name) errs.push("falta el nombre");

    // Equipo existente
    const idText = text(get("id"));
    let target = null, viaSerial = false;
    if (idText) {
      target = byId.get(idText);
      if (!target) errs.push("el ID no corresponde a ningún equipo de esta empresa (¿lo cambiaron o el equipo fue eliminado?)");
    }
    const serial = text(get("serial"));
    if (!idText && serial) {
      const matches = bySerial.get(norm(serial)) || [];
      if (matches.length === 1) { target = matches[0]; viaSerial = true; }
      else if (matches.length > 1) errs.push(`hay ${matches.length} equipos con el número de serie "${serial}"; usa el Excel descargado (con ID) para actualizar el correcto`);
    }

    // Sucursal
    const branchText = text(get("branch"));
    let branch = null;
    if (!branchText) errs.push("falta la sucursal");
    else {
      const m = branchesByName.get(norm(branchText)) || [];
      if (m.length === 1) branch = m[0];
      else if (m.length > 1) errs.push(`hay ${m.length} sucursales llamadas "${branchText}"`);
      else errs.push(`la sucursal "${branchText}" no existe`);
    }

    // Estado
    const statusText = norm(get("status"));
    let status = "operativo";
    if (statusText === "" || statusText === "operativo") status = "operativo";
    else if (["fuera de servicio", "fuera_servicio", "fuera servicio"].includes(statusText)) status = "fuera_servicio";
    else errs.push(`estado "${get("status")}" no válido (usa Operativo o Fuera de servicio)`);

    // Técnico
    const techText = text(get("tech"));
    let techId = null;
    if (techText) {
      const m = techsByName.get(norm(techText)) || [];
      if (m.length > 1) errs.push(`hay ${m.length} técnicos llamados "${techText}"`);
      else if (m.length === 0) errs.push(`el técnico "${techText}" no existe`);
      else {
        const t = m[0];
        if (t.is_active === false && target?.default_technician_id !== t.id) errs.push(`el técnico "${t.name}" está dado de baja`);
        else if (branch && !techWorksAtBranch(t, branch.id)) errs.push(`el técnico "${t.name}" no trabaja en la sucursal "${branch.name}"`);
        else techId = t.id;
      }
    }

    // Cliente (dueño). Un Excel viejo sin esta columna no toca el cliente que ya tenga el equipo.
    const hasClientCol = Object.prototype.hasOwnProperty.call(raw, COLS.client) || Object.prototype.hasOwnProperty.call(raw, "Cliente");
    // Archivos bajados antes de que existiera la columna Capacidad: no la borran
    const hasCapacityCol = Object.prototype.hasOwnProperty.call(raw, COLS.capacity);
    // Checklist fijo (archivos viejos sin la columna: no lo tocan)
    const hasChecklistCol = Object.prototype.hasOwnProperty.call(raw, COLS.checklist);
    let checklistId = null;
    if (hasChecklistCol) {
      const ckText = text(get("checklist"));
      if (ckText) {
        let found = ckByExcelName.get(norm(ckText)) || [];
        if (found.length > 1) {
          const rowType = norm(get("type"));
          const sameType = found.filter((t) => norm(t.equipment_type) === rowType);
          if (sameType.length === 1) found = sameType;
        }
        if (found.length === 1) checklistId = found[0].id;
        else if (found.length === 0) errs.push(`no existe el checklist "${ckText}" (mira la hoja "Listas")`);
        else errs.push(`hay ${found.length} checklists llamados "${ckText}"; escríbelo como sale en la hoja "Listas", con el tipo entre paréntesis`);
      }
    }
    let capValue = null;
    if (hasCapacityCol) {
      const rawCap = String(get("capacity") ?? "").trim().replace(/,/g, "");
      if (rawCap !== "") {
        capValue = Number(rawCap);
        if (!isFinite(capValue) || capValue < 0) errs.push(`la capacidad "${get("capacity")}" no es un número (la unidad va en "Unidad de capacidad")`);
      }
    }
    let clientId = null;
    if (hasClientCol) {
      const clientText = text(raw[COLS.client] ?? raw["Cliente"]);
      if (clientText) {
        const m = clientsByName.get(norm(clientText)) || [];
        if (m.length === 1) clientId = m[0].id;
        else if (m.length > 1) errs.push(`hay ${m.length} clientes llamados "${clientText}"`);
        else errs.push(`el cliente "${clientText}" no existe (créalo primero en Clientes)`);
      }
    }

    // Fechas y números
    const installed = parseDate(get("installed"));
    if (installed === undefined) errs.push(`fecha de instalación "${get("installed")}" no válida (escríbela como 2026-10-03)`);
    const next = parseDate(get("next"));
    if (next === undefined) errs.push(`fecha de próximo mantenimiento "${get("next")}" no válida (escríbela como 2026-10-03)`);
    const freq = parseNum(get("freq"), { int: true, min: 1 });
    if (freq === undefined) errs.push("la frecuencia debe ser un número entero de días (1 o más)");
    const unitText = norm(get("unit"));
    let unit = null;
    if (["horas", "hora", "h"].includes(unitText)) unit = "horas";
    else if (["km", "kilometros", "kilómetros"].includes(unitText)) unit = "km";
    else if (unitText) errs.push(`unidad de uso "${get("unit")}" no válida (usa horas o km)`);
    let usage = null, interval = null;
    if (unit) {
      usage = parseNum(get("usage"), { min: 0 });
      if (usage === undefined) errs.push("la lectura actual debe ser un número");
      interval = parseNum(get("interval"), { min: 1 });
      if (interval === undefined) errs.push("\"Cada cuántas unidades\" debe ser un número mayor que 0");
    }

    // La misma fila de equipo no puede venir dos veces
    if (target) {
      if (seenTargets.has(target.id)) errs.push(viaSerial
        ? `el número de serie "${serial}" es del equipo "${target.name}", que ya viene en la fila ${seenTargets.get(target.id)}`
        : `este equipo ya viene en la fila ${seenTargets.get(target.id)}`);
      else seenTargets.set(target.id, rowNum);
    } else if (serial) {
      const k = norm(serial);
      if (seenNewSerials.has(k)) errs.push(`el número de serie "${serial}" se repite en la fila ${seenNewSerials.get(k)}`);
      else seenNewSerials.set(k, rowNum);
    }

    if (errs.length) { result.errors.push({ row: rowNum, name: name || "(sin nombre)", messages: errs }); return; }

    // Ubicación (se crea si no existe en esa sucursal)
    const locText = text(get("location"));
    let locationId = null, locationKey = null;
    if (locText) {
      const existing = locations.find((l) => l.branch_id === branch.id && norm(l.name) === norm(locText));
      if (existing) locationId = existing.id;
      else {
        locationKey = branch.id + "||" + norm(locText);
        if (!newLocKeys.has(locationKey)) {
          newLocKeys.set(locationKey, true);
          result.newLocations.push({ key: locationKey, branch_id: branch.id, name: locText, branchName: branch.name });
        }
      }
    }

    const payload = {
      name, type: text(get("type")), operational_status: status, brand: text(get("brand")), model: text(get("model")),
      serial_number: serial, installed_at: installed, branch_id: branch.id, location_id: locationId,
      default_technician_id: techId, maintenance_frequency_days: freq, next_maintenance_date: next,
      usage_unit: unit, current_usage: usage, usage_interval: interval,
      ...(hasClientCol ? { client_id: clientId } : {}),
      ...(hasCapacityCol ? { capacity: capValue, capacity_unit: capValue === null ? null : text(get("capacityUnit")) } : {}),
      ...(hasChecklistCol ? { default_checklist_template_id: checklistId } : {}),
    };
    if (target) {
      const changed = locationKey || [...FIELDS, ...(hasClientCol ? ["client_id"] : []), ...(hasCapacityCol ? ["capacity", "capacity_unit"] : []), ...(hasChecklistCol ? ["default_checklist_template_id"] : [])].some((f) => !sameVal(payload[f], target[f]));
      if (!changed) { result.unchanged++; return; }
      result.updates.push({ row: rowNum, id: target.id, payload, locationKey, before: target });
    } else {
      result.creates.push({ row: rowNum, payload: { ...payload, usage_last_maintenance: null }, locationKey });
      // Aviso (no bloquea): ya hay un equipo con el mismo nombre en esa sucursal; ¿se está subiendo dos veces?
      if (existingNameBranch.has(norm(name) + "||" + branch.id)) result.possibleDuplicates.push({ row: rowNum, name, branchName: branch.name });
    }
  });
  return result;
}

// Fecha "AAAA-MM-DD" -> "03/10/2026" para mostrar en el resumen
const showDate = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const FIELD_LABELS = { installed_at: "Instalación", next_maintenance_date: "Próx. mant." };

// ---------------------------------------------------------------------------
// Botones + ventana de carga
// ---------------------------------------------------------------------------
export function EquipmentExcelButtons({ canUpload, companyId, companyName, equipment, downloadList, branches, locations, technicians, clients = [], checklistTemplates = [], setEquipment, setLocations }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { fileName, analysis }
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");

  const download = async () => {
    setBusy(true);
    try { await downloadEquipmentExcel({ list: downloadList, branches, locations, technicians, clients, checklistTemplates, companyName }); }
    catch (err) { window.alert("No se pudo generar el Excel: " + err.message); }
    finally { setBusy(false); }
  };

  const readFile = async (file) => {
    setBusy(true); setError(""); setDone(null);
    try {
      const XLSX = await loadXlsx();
      // Sin cellDates: las fechas llegan como número de fecha de Excel, que no depende de la zona
      // horaria ni de la configuración regional de la computadora.
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = wb.SheetNames.includes("Equipos") ? "Equipos" : wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: true });
      const headers = Object.keys(rows[0] || {});
      if (!rows.length || !headers.some((h) => h === COLS.name || h === "Nombre") || !headers.some((h) => h === COLS.branch || h === "Sucursal")) {
        window.alert("Este archivo no tiene el formato de equipos. Usa \"Descargar Excel\" para obtener el formato correcto (columnas \"Nombre *\" y \"Sucursal *\" como mínimo).");
        return;
      }
      setPreview({ fileName: file.name, analysis: analyzeEquipmentRows(rows, { equipment, branches, locations, technicians, clients, checklistTemplates }) });
    } catch (err) {
      window.alert("No se pudo leer el Excel: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    const a = preview.analysis;
    setSaving(true); setError("");
    const failed = [];
    let created = 0, updated = 0, locCreated = 0;
    try {
      // 1. Ubicaciones nuevas
      const locIdByKey = new Map();
      if (a.newLocations.length) {
        const { data, error: locErr } = await supabase.from("locations")
          .insert(a.newLocations.map((l) => ({ company_id: companyId, branch_id: l.branch_id, name: l.name }))).select();
        if (locErr) throw new Error("No se pudieron crear las ubicaciones nuevas: " + locErr.message);
        a.newLocations.forEach((l, i) => locIdByKey.set(l.key, data[i]?.id));
        locCreated = data.length;
      }
      const withLoc = (item) => (item.locationKey ? { ...item.payload, location_id: locIdByKey.get(item.locationKey) || null } : item.payload);

      // 2. Equipos nuevos (en bloques; si un bloque falla, se prueba fila por fila para saber cuál)
      for (let i = 0; i < a.creates.length; i += 200) {
        const chunk = a.creates.slice(i, i + 200);
        const { data, error: insErr } = await supabase.from("equipment").insert(chunk.map((c) => ({ ...withLoc(c), company_id: companyId }))).select("id");
        if (!insErr) { created += data.length; continue; }
        for (const c of chunk) {
          const { error: oneErr } = await supabase.from("equipment").insert({ ...withLoc(c), company_id: companyId });
          if (oneErr) failed.push({ row: c.row, name: c.payload.name, messages: [oneErr.message] }); else created++;
        }
      }

      // 3. Equipos a actualizar (de 10 en 10)
      for (let i = 0; i < a.updates.length; i += 10) {
        const chunk = a.updates.slice(i, i + 10);
        const res = await Promise.all(chunk.map((u) => supabase.from("equipment").update(withLoc(u)).eq("id", u.id).eq("company_id", companyId).select("id")));
        res.forEach((r, j) => {
          if (r.error || !r.data?.length) failed.push({ row: chunk[j].row, name: chunk[j].payload.name, messages: [r.error?.message || "no tienes permiso para modificar este equipo"] });
          else updated++;
        });
      }
    } catch (err) {
      setError(err.message);
    }
    // 4. Recargar equipos y ubicaciones desde la base
    const [eq, loc] = await Promise.all([
      fetchAllRows(() => supabase.from("equipment").select("*").eq("company_id", companyId).order("name")),
      fetchAllRows(() => supabase.from("locations").select("*").eq("company_id", companyId).order("name")),
    ]);
    if (!eq.error) setEquipment(eq.data || []);
    if (!loc.error) setLocations(loc.data || []);
    setSaving(false);
    setDone({ created, updated, locCreated, unchanged: a.unchanged, skipped: a.errors.length, failed });
  };

  const close = () => { setPreview(null); setDone(null); setError(""); };
  const a = preview?.analysis;
  const toSave = a ? a.creates.length + a.updates.length : 0;
  const btn = { border: `1px solid ${C.border}`, color: C.text };
  // Fechas que se van a guardar (nuevos y cambios), para revisarlas antes de cargar
  const dateChecks = a ? [
    ...a.creates.filter((c) => c.payload.installed_at || c.payload.next_maintenance_date).map((c) => ({ row: c.row, name: c.payload.name, installed: c.payload.installed_at, next: c.payload.next_maintenance_date, isNew: true })),
    ...a.updates.filter((u) => !sameVal(u.payload.installed_at, u.before.installed_at) || !sameVal(u.payload.next_maintenance_date, u.before.next_maintenance_date))
      .map((u) => ({ row: u.row, name: u.payload.name, installed: u.payload.installed_at, next: u.payload.next_maintenance_date, isNew: false })),
  ].sort((x, y) => x.row - y.row) : [];

  return (
    <>
      <button onClick={download} disabled={busy} title="Descarga los equipos que se ven (o los seleccionados) para revisarlos o llenarlos en campo" className="flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50" style={btn}>
        <Download size={14} /> Descargar Excel
      </button>
      {canUpload && (
        <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer" style={{ ...btn, opacity: busy ? 0.5 : 1 }} title="Sube el Excel de equipos para agregar o actualizar varios de una vez">
          <Upload size={14} /> {busy ? "Leyendo..." : "Subir Excel"}
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
        </label>
      )}

      {preview && (
        <Modal title="Cargar equipos desde Excel" onClose={saving ? undefined : close} wide>
          <div className="text-xs mb-3" style={{ color: C.muted }}>Archivo: <span style={{ color: C.text }}>{preview.fileName}</span></div>
          {!done ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {[["Nuevos", a.creates.length, C.green], ["A actualizar", a.updates.length, C.blue], ["Sin cambios", a.unchanged, C.muted], ["Con errores", a.errors.length, a.errors.length ? C.red : C.muted]].map(([label, n, color]) => (
                  <div key={label} className="p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                    <div className="text-2xl font-mono font-bold" style={{ color }}>{n}</div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>{label}</div>
                  </div>
                ))}
              </div>
              {a.newLocations.length > 0 && (
                <div className="text-xs mb-3" style={{ color: C.text }}>
                  Se crearán {a.newLocations.length} ubicación{a.newLocations.length !== 1 ? "es" : ""} nueva{a.newLocations.length !== 1 ? "s" : ""}: <span style={{ color: C.muted }}>{a.newLocations.map((l) => `${l.name} (${l.branchName})`).join(", ")}</span>
                </div>
              )}
              {a.possibleDuplicates.length > 0 && (
                <div className="mb-3 p-3 text-xs" style={{ background: C.amber + "14", border: `1px solid ${C.amber}50`, color: C.text }}>
                  <div className="font-semibold mb-1" style={{ color: C.amber }}>Revisa antes de cargar: {a.possibleDuplicates.length === 1 ? "esta fila nueva tiene" : "estas filas nuevas tienen"} el mismo nombre que un equipo que ya existe en esa sucursal</div>
                  <div style={{ color: C.muted }}>Si son equipos distintos, puedes cargar igual. Si es el mismo equipo (por ejemplo, subiste el archivo dos veces), cancela: se crearía repetido.</div>
                  <div className="mt-1 max-h-24 overflow-y-auto">{a.possibleDuplicates.map((d) => <div key={d.row}>Fila {d.row}: <b>{d.name}</b> ({d.branchName})</div>)}</div>
                </div>
              )}
              {dateChecks.length > 0 && (
                <details className="mb-3 text-xs" open={dateChecks.length <= 8}>
                  <summary className="cursor-pointer" style={{ color: C.blue }}>Revisa las fechas que se van a guardar ({dateChecks.length}) — día/mes/año</summary>
                  <div className="mt-2 max-h-48 overflow-y-auto" style={{ border: `1px solid ${C.border}` }}>
                    <div className="grid grid-cols-12 gap-2 px-2 py-1 uppercase tracking-wide text-[10px]" style={{ color: C.muted, background: C.panelAlt }}>
                      <div className="col-span-6">Equipo</div><div className="col-span-3">{FIELD_LABELS.installed_at}</div><div className="col-span-3">{FIELD_LABELS.next_maintenance_date}</div>
                    </div>
                    {dateChecks.map((d) => (
                      <div key={d.row} className="grid grid-cols-12 gap-2 px-2 py-1" style={{ borderTop: `1px solid ${C.border}`, color: C.text }}>
                        <div className="col-span-6 truncate">Fila {d.row} · {d.name}{d.isNew ? <span style={{ color: C.green }}> (nuevo)</span> : ""}</div>
                        <div className="col-span-3 font-mono">{showDate(d.installed)}</div>
                        <div className="col-span-3 font-mono">{showDate(d.next)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1" style={{ color: C.muted }}>Si alguna sale con el día y el mes al revés, cancela, escríbela en el Excel como 2026-10-03 (año-mes-día) y vuelve a subirlo.</div>
                </details>
              )}
              {a.updates.length > 0 && (
                <details className="mb-3 text-xs">
                  <summary className="cursor-pointer" style={{ color: C.blue }}>Ver equipos que se van a actualizar ({a.updates.length})</summary>
                  <div className="mt-2 max-h-40 overflow-y-auto" style={{ color: C.muted }}>
                    {a.updates.map((u) => {
                      const changed = FIELDS.filter((f) => !sameVal(u.payload[f], u.before[f])).length + (u.locationKey ? 1 : 0);
                      return <div key={u.id}>Fila {u.row}: <span style={{ color: C.text }}>{u.payload.name}</span> · {changed} dato{changed !== 1 ? "s" : ""} cambia{changed !== 1 ? "n" : ""}</div>;
                    })}
                  </div>
                </details>
              )}
              {a.errors.length > 0 && (
                <div className="mb-3 p-3 text-xs max-h-56 overflow-y-auto" style={{ background: C.red + "12", border: `1px solid ${C.red}40` }}>
                  <div className="font-semibold mb-1" style={{ color: C.red }}>Estas filas NO se van a cargar:</div>
                  {a.errors.map((er) => (
                    <div key={er.row} className="mb-1" style={{ color: C.text }}>
                      Fila {er.row} · <b>{er.name}</b>: <span style={{ color: C.muted }}>{er.messages.join("; ")}</span>
                    </div>
                  ))}
                </div>
              )}
              {toSave === 0 && <div className="text-sm mb-3" style={{ color: C.muted }}>No hay nada que guardar{a.errors.length ? ": corrige las filas con errores y vuelve a subir el archivo." : ": todo ya está igual en la app."}</div>}
              {error && <div className="text-xs mb-3" style={{ color: C.red }}>{error}</div>}
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={close} disabled={saving} className="px-4 py-2 text-sm disabled:opacity-50" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
                <button onClick={apply} disabled={saving || toSave === 0} className="px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  {saving ? "Guardando..." : `Cargar ${toSave} equipo${toSave !== 1 ? "s" : ""}`}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm mb-3" style={{ color: C.text }}>
                Listo: <b style={{ color: C.green }}>{done.created}</b> equipo{done.created !== 1 ? "s" : ""} nuevo{done.created !== 1 ? "s" : ""}, <b style={{ color: C.blue }}>{done.updated}</b> actualizado{done.updated !== 1 ? "s" : ""}
                {done.locCreated > 0 && <>, {done.locCreated} ubicación{done.locCreated !== 1 ? "es" : ""} nueva{done.locCreated !== 1 ? "s" : ""}</>}
                {done.unchanged > 0 && <> · {done.unchanged} sin cambios</>}.
              </div>
              {done.skipped > 0 && <div className="text-xs mb-2" style={{ color: C.amber }}>{done.skipped} fila{done.skipped !== 1 ? "s" : ""} con errores no se cargaron. Corrígelas en el Excel y vuelve a subirlo.</div>}
              {done.failed.length > 0 && (
                <div className="mb-3 p-3 text-xs" style={{ background: C.red + "12", border: `1px solid ${C.red}40` }}>
                  <div className="font-semibold mb-1" style={{ color: C.red }}>No se pudieron guardar:</div>
                  {done.failed.map((f) => <div key={f.row} style={{ color: C.text }}>Fila {f.row} · <b>{f.name}</b>: <span style={{ color: C.muted }}>{f.messages.join("; ")}</span></div>)}
                </div>
              )}
              {error && <div className="text-xs mb-3" style={{ color: C.red }}>{error}</div>}
              <div className="flex justify-end mt-2">
                <button onClick={close} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Cerrar</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
