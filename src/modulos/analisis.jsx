// Análisis de equipos (Departamento Técnico): busca palabras en lo que se llenó en los
// checklists de las órdenes, cuenta las palabras clave de la empresa por equipo (fallas
// repetidas) y grafica las lecturas numéricas del checklist en el tiempo.
// Se carga solo cuando se abre la pantalla (ver lazy.jsx).
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Search, Tag, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../supabaseClient";
import { C, KpiCard, SearchSelect, fetchByIdChunks, fmtDate, inputClass, inputStyle } from "./base.jsx";

// ---- Utilidades de texto ----
// Minúsculas y sin acentos: "Fuga", "fugá" y "FUGA" cuentan igual.
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Posiciones (en el texto original) donde aparece la palabra, para resaltarla
function findSpans(text, word) {
  const chars = Array.from(String(text ?? ""));
  let flat = "";
  const map = [];
  chars.forEach((ch, i) => { for (const x of norm(ch)) { flat += x; map.push(i); } });
  const w = norm(word).trim();
  const spans = [];
  if (!w) return spans;
  let idx = flat.indexOf(w);
  while (idx !== -1) {
    spans.push([map[idx], map[idx + w.length - 1] + 1]);
    idx = flat.indexOf(w, idx + w.length);
  }
  return spans;
}

function Highlight({ text, words }) {
  const chars = Array.from(String(text ?? ""));
  const marks = new Array(chars.length).fill(false);
  (words || []).forEach((w) => findSpans(text, w).forEach(([a, b]) => { for (let i = a; i < b; i++) marks[i] = true; }));
  const parts = [];
  let buf = "";
  let cur = false;
  chars.forEach((ch, i) => {
    if (marks[i] !== cur) { if (buf) parts.push([cur, buf]); buf = ""; cur = marks[i]; }
    buf += ch;
  });
  if (buf) parts.push([cur, buf]);
  return (
    <>
      {parts.map(([m, t], i) => (m ? <mark key={i} style={{ background: C.amber + "55", color: C.text, padding: 0 }}>{t}</mark> : <span key={i}>{t}</span>))}
    </>
  );
}

// ---- Utilidades de datos ----
const orderDate = (o) => (o.completed_at ? String(o.completed_at).slice(0, 10) : "") || o.scheduled || String(o.created_at || "").slice(0, 10);
const numVal = (v) => {
  const s = String(v ?? "").replace(",", ".").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const isOutOfRange = (it, n) => n != null && ((it.range_min != null && n < Number(it.range_min)) || (it.range_max != null && n > Number(it.range_max)));
// Punto marcado como problema: "No OK" o lectura fuera de su rango
const isFlagged = (it) => it.respuesta === "No OK" || (it.response_type === "numeric" && isOutOfRange(it, numVal(it.respuesta)));
const filledText = (it) => `${it.respuesta || ""} ${it.observaciones || ""}`;
// Una palabra clave cuenta en un punto si está en lo que se escribió (respuesta / observaciones),
// o si el punto quedó "No OK" / fuera de rango y la palabra está en el nombre del punto o su tema.
const itemHasKeyword = (it, word) => {
  const w = norm(word).trim();
  if (!w) return false;
  if (norm(filledText(it)).includes(w)) return true;
  return isFlagged(it) && norm(`${it.section || ""} ${it.text || ""}`).includes(w);
};
const itemMatchesSearch = (it, word) => {
  const w = norm(word).trim();
  return !!w && norm(`${it.section || ""} ${it.text || ""} ${it.respuesta || ""} ${it.observaciones || ""}`).includes(w);
};
const daysBetweenStr = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const avgGapDays = (dates) => {
  const d = [...new Set(dates.filter(Boolean))].sort();
  if (d.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < d.length; i++) sum += daysBetweenStr(d[i - 1], d[i]);
  return Math.round(sum / (d.length - 1));
};
const fmtNum = (n) => (n == null ? "—" : Number(n).toLocaleString("es-DO", { maximumFractionDigits: 2 }));
const shortDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "2-digit" }) : "");

const card = { background: C.panel, border: `1px solid ${C.border}` };
const sectionTitle = "text-xs uppercase tracking-wide mb-2";

export function VistaEquipmentAnalysis({ orders, equipment, branchFilter, branchName, companyId, canEditKeywords, canDeleteKeywords, openOrderDetail }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [keywords, setKeywords] = useState([]);
  const [keywordsError, setKeywordsError] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [savingKeyword, setSavingKeyword] = useState(false);

  const [drill, setDrill] = useState(null); // { equipmentId, word }
  const [readingsEquipId, setReadingsEquipId] = useState("");
  const [pointFilter, setPointFilter] = useState("");

  const equipById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);
  const equipmentTypes = useMemo(() => Array.from(new Set(equipment.map((e) => e.type).filter(Boolean))).sort(), [equipment]);

  // Órdenes con equipo (la sucursal ya viene filtrada desde arriba)
  const equipOrders = useMemo(() => orders.filter((o) => o.equipment_id && equipById.has(o.equipment_id)), [orders, equipById]);
  const equipOrderIdsKey = useMemo(() => equipOrders.map((o) => o.id).sort().join(","), [equipOrders]);

  // Lo llenado en los checklists de esas órdenes
  useEffect(() => {
    let active = true;
    const ids = equipOrderIdsKey ? equipOrderIdsKey.split(",") : [];
    setLoadingItems(true);
    setLoadError("");
    if (ids.length === 0) { setItems([]); setLoadingItems(false); return undefined; }
    fetchByIdChunks(ids, (chunk) => supabase.from("work_order_checklist_items")
      .select("id, work_order_id, section, text, response_type, respuesta, observaciones, range_min, range_max, checked, position")
      .in("work_order_id", chunk))
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadError(error.message);
        setItems(data || []);
        setLoadingItems(false);
      });
    return () => { active = false; };
  }, [equipOrderIdsKey]);

  // Palabras clave de la empresa
  const loadKeywords = async () => {
    const { data, error } = await supabase.from("equipment_keywords").select("*").order("word");
    if (error) {
      setKeywordsError(/equipment_keywords/.test(error.message) ? "Falta correr analisis-equipos.sql en Supabase." : error.message);
      setKeywords([]);
      return;
    }
    setKeywordsError("");
    setKeywords(data || []);
  };
  useEffect(() => { loadKeywords(); /* eslint-disable-next-line */ }, [companyId]);

  const addKeyword = async () => {
    const word = newKeyword.trim();
    if (word.length < 2) return;
    if (keywords.some((k) => norm(k.word).trim() === norm(word))) { setNewKeyword(""); return; }
    setSavingKeyword(true);
    const { data, error } = await supabase.from("equipment_keywords").insert({ company_id: companyId, word }).select().single();
    setSavingKeyword(false);
    if (error) { setKeywordsError(error.code === "23505" ? "Esa palabra ya está guardada." : error.message); return; }
    setKeywordsError("");
    setKeywords((prev) => [...prev, data].sort((a, b) => a.word.localeCompare(b.word, "es")));
    setNewKeyword("");
  };
  const removeKeyword = async (k) => {
    if (!window.confirm(`¿Quitar la palabra clave "${k.word}"? No se borra nada de las órdenes, solo deja de contarse.`)) return;
    const { data, error } = await supabase.from("equipment_keywords").delete().eq("id", k.id).select();
    if (error) { setKeywordsError(error.message); return; }
    if (!data || data.length === 0) { setKeywordsError("No se pudo quitar la palabra (sin permiso)."); return; }
    setKeywords((prev) => prev.filter((x) => x.id !== k.id));
    if (drill && norm(drill.word) === norm(k.word)) setDrill(null);
  };

  // Órdenes dentro del filtro (fechas y tipo de equipo), con su checklist
  const itemsByOrder = useMemo(() => {
    const m = new Map();
    items.forEach((it) => { if (!m.has(it.work_order_id)) m.set(it.work_order_id, []); m.get(it.work_order_id).push(it); });
    m.forEach((list) => list.sort((a, b) => (a.position || 0) - (b.position || 0)));
    return m;
  }, [items]);
  const analyzedOrders = useMemo(() => equipOrders.filter((o) => {
    const d = orderDate(o);
    if (dateFrom && (!d || d < dateFrom)) return false;
    if (dateTo && (!d || d > dateTo)) return false;
    if (typeFilter !== "all" && equipById.get(o.equipment_id)?.type !== typeFilter) return false;
    return itemsByOrder.has(o.id);
  }), [equipOrders, itemsByOrder, dateFrom, dateTo, typeFilter, equipById]);

  // ---- Fallas repetidas: palabras clave por equipo ----
  const keywordMatrix = useMemo(() => {
    const byEquip = new Map();
    analyzedOrders.forEach((o) => {
      if (!byEquip.has(o.equipment_id)) byEquip.set(o.equipment_id, { equipmentId: o.equipment_id, orders: 0, hits: {} });
      const row = byEquip.get(o.equipment_id);
      row.orders += 1;
      const its = itemsByOrder.get(o.id) || [];
      keywords.forEach((k) => {
        const matched = its.filter((it) => itemHasKeyword(it, k.word));
        if (matched.length === 0) return;
        (row.hits[k.id] ||= []).push({ order: o, items: matched });
      });
    });
    const rows = Array.from(byEquip.values()).map((r) => ({ ...r, total: Object.values(r.hits).reduce((s, h) => s + h.length, 0) }));
    rows.sort((a, b) => b.total - a.total || (equipById.get(a.equipmentId)?.name || "").localeCompare(equipById.get(b.equipmentId)?.name || "", "es"));
    return rows;
  }, [analyzedOrders, itemsByOrder, keywords, equipById]);
  const rowsWithHits = keywordMatrix.filter((r) => r.total > 0);
  const keywordTotals = useMemo(() => keywords.map((k) => {
    const hits = keywordMatrix.flatMap((r) => r.hits[k.id] || []);
    return { ...k, orders: hits.length, equipCount: keywordMatrix.filter((r) => (r.hits[k.id] || []).length > 0).length };
  }), [keywords, keywordMatrix]);

  const drillData = useMemo(() => {
    if (!drill) return null;
    const row = keywordMatrix.find((r) => r.equipmentId === drill.equipmentId);
    const kw = keywords.find((k) => norm(k.word) === norm(drill.word));
    if (!row || !kw) return null;
    const hits = (row.hits[kw.id] || []).slice().sort((a, b) => orderDate(b.order).localeCompare(orderDate(a.order)));
    const dates = hits.map((h) => orderDate(h.order));
    return { equip: equipById.get(drill.equipmentId), word: kw.word, hits, gap: avgGapDays(dates), last: dates[0] || null, ordersAnalyzed: row.orders };
  }, [drill, keywordMatrix, keywords, equipById]);

  // ---- Búsqueda libre en lo llenado ----
  const searchResults = useMemo(() => {
    const q = search.trim();
    if (q.length < 2) return null;
    const rows = [];
    analyzedOrders.forEach((o) => (itemsByOrder.get(o.id) || []).forEach((it) => { if (itemMatchesSearch(it, q)) rows.push({ order: o, it }); }));
    rows.sort((a, b) => orderDate(b.order).localeCompare(orderDate(a.order)));
    const ordersHit = new Set(rows.map((r) => r.order.id));
    const byEquip = new Map();
    rows.forEach((r) => {
      const id = r.order.equipment_id;
      if (!byEquip.has(id)) byEquip.set(id, new Set());
      byEquip.get(id).add(r.order.id);
    });
    const equipSummary = Array.from(byEquip.entries()).map(([id, set]) => ({ id, name: equipById.get(id)?.name || "—", count: set.size })).sort((a, b) => b.count - a.count);
    return { rows, orders: ordersHit.size, equipSummary };
  }, [search, analyzedOrders, itemsByOrder, equipById]);

  // ---- Lecturas en el tiempo ----
  const numericEquipIds = useMemo(() => {
    const s = new Set();
    analyzedOrders.forEach((o) => { if ((itemsByOrder.get(o.id) || []).some((it) => it.response_type === "numeric" && numVal(it.respuesta) != null)) s.add(o.equipment_id); });
    return s;
  }, [analyzedOrders, itemsByOrder]);
  const numericEquipOptions = useMemo(() => equipment.filter((e) => numericEquipIds.has(e.id)).sort((a, b) => (a.name || "").localeCompare(b.name || "", "es")), [equipment, numericEquipIds]);
  useEffect(() => {
    if (readingsEquipId && numericEquipIds.has(readingsEquipId)) return;
    setReadingsEquipId(numericEquipOptions[0]?.id || "");
  }, [numericEquipOptions, numericEquipIds, readingsEquipId]);

  const readingSeries = useMemo(() => {
    if (!readingsEquipId) return [];
    const groups = new Map();
    analyzedOrders.filter((o) => o.equipment_id === readingsEquipId).forEach((o) => {
      (itemsByOrder.get(o.id) || []).forEach((it) => {
        if (it.response_type !== "numeric") return;
        const v = numVal(it.respuesta);
        if (v == null) return;
        const key = `${norm(it.section).trim()}|${norm(it.text).trim()}`;
        if (!groups.has(key)) groups.set(key, { key, section: it.section || "", text: it.text || "", points: [] });
        groups.get(key).points.push({ date: orderDate(o), value: v, out: isOutOfRange(it, v), code: o.code, order: o, min: it.range_min, max: it.range_max, obs: it.observaciones || "" });
      });
    });
    const list = Array.from(groups.values()).map((g) => {
      const pts = g.points.sort((a, b) => a.date.localeCompare(b.date) || String(a.code).localeCompare(String(b.code)));
      const vals = pts.map((p) => p.value);
      const last = pts[pts.length - 1];
      const prev = pts.length > 1 ? pts.slice(0, -1) : [];
      const prevAvg = prev.length ? prev.reduce((s, p) => s + p.value, 0) / prev.length : null;
      return {
        ...g,
        points: pts.map((p) => ({ ...p, label: shortDate(p.date) })),
        min: last.min, max: last.max,
        last: last.value, lowest: Math.min(...vals), highest: Math.max(...vals),
        avg: vals.reduce((s, v) => s + v, 0) / vals.length,
        outCount: pts.filter((p) => p.out).length,
        change: prevAvg == null ? null : last.value - prevAvg,
      };
    });
    const q = norm(pointFilter).trim();
    return list.filter((g) => !q || norm(`${g.section} ${g.text}`).includes(q))
      .sort((a, b) => b.outCount - a.outCount || a.section.localeCompare(b.section, "es") || a.text.localeCompare(b.text, "es"));
  }, [readingsEquipId, analyzedOrders, itemsByOrder, pointFilter]);

  const kwWords = keywords.map((k) => k.word);
  const anyFilter = dateFrom || dateTo || typeFilter !== "all";

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 mb-4 p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <div className="text-xs" style={{ color: C.muted }}>
          Sucursal: <span style={{ color: C.text }}>{branchFilter === "all" ? "Todas" : branchName(branchFilter)}</span> (se cambia arriba)
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Tipo de equipo</div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 text-sm" style={inputStyle}>
            <option value="all">Todos los tipos</option>
            {equipmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Desde</div>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 text-sm" style={inputStyle} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>Hasta</div>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 text-sm" style={inputStyle} />
        </div>
        {anyFilter && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); setTypeFilter("all"); }} className="px-3 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Limpiar filtros</button>
        )}
      </div>

      {loadError && <div className="text-sm mb-4 px-3 py-2" style={{ background: C.redBg, color: C.red }}>No se pudieron cargar los checklists: {loadError}</div>}

      <div className="flex flex-wrap gap-3 mb-6">
        <KpiCard label="Órdenes analizadas" value={loadingItems ? "…" : analyzedOrders.length} accent={C.blue} sub="Con equipo y con checklist llenado" />
        <KpiCard label="Equipos con datos" value={loadingItems ? "…" : new Set(analyzedOrders.map((o) => o.equipment_id)).size} accent={C.green} sub="En el filtro actual" />
        <KpiCard label="Equipos con fallas repetidas" value={loadingItems ? "…" : rowsWithHits.filter((r) => Object.values(r.hits).some((h) => h.length >= 2)).length} accent={C.red} sub="Una misma palabra clave en 2 o más órdenes" />
      </div>

      {/* Búsqueda libre */}
      <div className={sectionTitle} style={{ color: C.muted }}>Buscar en lo llenado del checklist</div>
      <div className="flex items-center gap-2 px-3 py-2 mb-2" style={card}>
        <Search size={14} color={C.muted} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Palabra a buscar en puntos, respuestas y observaciones (ej. fuga, ruido, capacitor)..." className="bg-transparent outline-none text-sm w-full" style={{ color: C.text }} />
        {search && <button onClick={() => setSearch("")} style={{ color: C.muted }}><X size={14} /></button>}
      </div>
      {searchResults && (
        <div className="mb-6" style={card}>
          <div className="px-4 py-2 text-xs flex flex-wrap gap-x-3 gap-y-1" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
            <span>{searchResults.rows.length} punto{searchResults.rows.length !== 1 ? "s" : ""} en {searchResults.orders} orden{searchResults.orders !== 1 ? "es" : ""}</span>
            {searchResults.equipSummary.slice(0, 8).map((e) => <span key={e.id} style={{ color: C.text }}>{e.name}: {e.count}</span>)}
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                <div className="col-span-2">Orden / fecha</div>
                <div className="col-span-2">Equipo</div>
                <div className="col-span-3">Punto</div>
                <div className="col-span-2">Respuesta</div>
                <div className="col-span-3">Observaciones</div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {searchResults.rows.slice(0, 300).map(({ order, it }) => (
                  <div key={it.id} onClick={() => openOrderDetail(order)} className="grid grid-cols-12 gap-2 px-4 py-2 text-sm cursor-pointer" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="col-span-2"><div className="font-mono text-xs">{order.code}</div><div className="text-xs" style={{ color: C.muted }}>{fmtDate(orderDate(order))}</div></div>
                    <div className="col-span-2 truncate">{equipById.get(order.equipment_id)?.name || "—"}</div>
                    <div className="col-span-3">{it.section && <div className="text-[10px] uppercase" style={{ color: C.muted }}><Highlight text={it.section} words={[search]} /></div>}<Highlight text={it.text} words={[search]} /></div>
                    <div className="col-span-2" style={{ color: isFlagged(it) ? C.red : C.text }}><Highlight text={it.respuesta || "—"} words={[search]} /></div>
                    <div className="col-span-3" style={{ color: C.muted }}><Highlight text={it.observaciones || "—"} words={[search]} /></div>
                  </div>
                ))}
                {searchResults.rows.length === 0 && <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>No aparece en ningún checklist del filtro actual.</div>}
                {searchResults.rows.length > 300 && <div className="px-4 py-2 text-xs" style={{ color: C.muted }}>Se muestran los 300 más recientes. Usa las fechas o el tipo de equipo para acotar.</div>}
              </div>
            </div>
          </div>
        </div>
      )}
      {!searchResults && <div className="text-xs mb-6" style={{ color: C.muted }}>Escribe al menos 2 letras. No importan mayúsculas ni acentos. Toca un resultado para abrir la orden.</div>}

      {/* Palabras clave y fallas repetidas */}
      <div className={sectionTitle} style={{ color: C.muted }}>Fallas repetidas — palabras clave por equipo</div>
      <div className="p-3 mb-3" style={card}>
        <div className="flex flex-wrap items-center gap-2">
          <Tag size={14} color={C.amber} />
          {keywordTotals.map((k) => (
            <span key={k.id} className="flex items-center gap-1 text-xs px-2 py-1" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
              {k.word}
              <span style={{ color: C.muted }}>· {k.orders} OT / {k.equipCount} eq.</span>
              {canDeleteKeywords && <button onClick={() => removeKeyword(k)} title="Quitar palabra" style={{ color: C.muted }}><X size={12} /></button>}
            </span>
          ))}
          {keywords.length === 0 && !keywordsError && <span className="text-xs" style={{ color: C.muted }}>Todavía no hay palabras clave.</span>}
          {canEditKeywords && (
            <span className="flex items-center gap-1">
              <input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addKeyword(); }} placeholder="Nueva palabra (ej. fuga)" className="px-2 py-1 text-xs" style={{ ...inputStyle, width: 170 }} maxLength={60} />
              <button onClick={addKeyword} disabled={savingKeyword || newKeyword.trim().length < 2} className="flex items-center gap-1 px-2 py-1 text-xs font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}><Plus size={12} /> Agregar</button>
            </span>
          )}
        </div>
        {keywordsError && <div className="text-xs mt-2" style={{ color: C.red }}>{keywordsError}</div>}
        <div className="text-xs mt-2" style={{ color: C.muted }}>
          Una palabra cuenta en una orden si aparece en lo que se escribió en el checklist (respuesta u observaciones), o si un punto quedó "No OK" o fuera de rango y la palabra está en el nombre de ese punto. Las palabras sirven para toda la empresa.
        </div>
      </div>

      {keywords.length > 0 && (
        <div className="overflow-x-auto mb-3" style={card}>
          <div style={{ minWidth: 380 + keywords.length * 110 }}>
            <div className="flex px-4 py-2 text-xs uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ width: 260, flexShrink: 0 }}>Equipo</div>
              <div style={{ width: 90, flexShrink: 0 }} className="text-center">OT analiz.</div>
              {keywords.map((k) => <div key={k.id} style={{ width: 110, flexShrink: 0 }} className="text-center truncate px-1" title={k.word}>{k.word}</div>)}
            </div>
            {rowsWithHits.map((r) => {
              const eq = equipById.get(r.equipmentId);
              return (
                <div key={r.equipmentId} className="flex px-4 py-2 items-center text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 260, flexShrink: 0 }} className="min-w-0 pr-2">
                    <div className="truncate">{eq?.name || "—"}</div>
                    <div className="text-xs truncate" style={{ color: C.muted }}>{[eq?.type, branchName(eq?.branch_id)].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div style={{ width: 90, flexShrink: 0 }} className="text-center font-mono" >{r.orders}</div>
                  {keywords.map((k) => {
                    const n = (r.hits[k.id] || []).length;
                    const active = drill && drill.equipmentId === r.equipmentId && norm(drill.word) === norm(k.word);
                    const color = n >= 3 ? C.red : n === 2 ? C.orange : n === 1 ? C.text : C.muted;
                    return (
                      <div key={k.id} style={{ width: 110, flexShrink: 0 }} className="text-center">
                        {n > 0 ? (
                          <button onClick={() => setDrill(active ? null : { equipmentId: r.equipmentId, word: k.word })} className="font-mono px-3 py-1 text-sm font-semibold" style={{ color, background: active ? C.amber + "33" : n >= 2 ? color + "1A" : "transparent", border: `1px solid ${active ? C.amber : n >= 2 ? color + "60" : C.border}` }}>{n}</button>
                        ) : <span className="font-mono" style={{ color: C.muted }}>·</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {!loadingItems && rowsWithHits.length === 0 && <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>Ningún equipo tiene esas palabras en el filtro actual.</div>}
            {loadingItems && <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>Cargando checklists...</div>}
          </div>
        </div>
      )}

      {drillData && (
        <div className="mb-6 p-4" style={{ ...card, borderLeft: `3px solid ${C.amber}` }}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="font-semibold">"{drillData.word}" en {drillData.equip?.name || "—"}</div>
              <div className="text-xs mt-0.5" style={{ color: C.muted }}>
                {drillData.hits.length} de {drillData.ordersAnalyzed} órdenes analizadas
                {drillData.gap != null ? ` · se repite cada ${drillData.gap} día${drillData.gap !== 1 ? "s" : ""} en promedio` : ""}
                {drillData.last ? ` · última vez ${fmtDate(drillData.last)}` : ""}
              </div>
            </div>
            <button onClick={() => setDrill(null)} style={{ color: C.muted }}><X size={16} /></button>
          </div>
          <div className="space-y-2">
            {drillData.hits.map(({ order, items: its }) => (
              <div key={order.id} onClick={() => openOrderDetail(order)} className="px-3 py-2 cursor-pointer" style={{ background: C.panelAlt }}>
                <div className="text-xs mb-1" style={{ color: C.muted }}><span className="font-mono" style={{ color: C.text }}>{order.code}</span> · {fmtDate(orderDate(order))} · {order.title}</div>
                {its.map((it) => (
                  <div key={it.id} className="text-sm">
                    <span style={{ color: isFlagged(it) ? C.red : C.text }}><Highlight text={it.text} words={kwWords} /></span>
                    {it.respuesta && <span style={{ color: C.muted }}> — <Highlight text={it.respuesta} words={kwWords} /></span>}
                    {it.observaciones && <span style={{ color: C.muted }}> · <Highlight text={it.observaciones} words={kwWords} /></span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {!drillData && keywords.length > 0 && rowsWithHits.length > 0 && <div className="text-xs mb-6" style={{ color: C.muted }}>Toca un número para ver en qué órdenes salió y cada cuánto se repite. En rojo: 3 o más veces; en naranja: 2.</div>}

      {/* Lecturas en el tiempo */}
      <div className={sectionTitle} style={{ color: C.muted }}>Lecturas del checklist en el tiempo</div>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="flex-1 min-w-[220px]">
          <SearchSelect items={numericEquipOptions} value={readingsEquipId} onChange={setReadingsEquipId} placeholder={numericEquipOptions.length ? "Buscar equipo..." : "Ningún equipo tiene lecturas numéricas"} getLabel={(e) => e.name} getSub={(e) => e.type || ""} />
        </div>
        <input value={pointFilter} onChange={(e) => setPointFilter(e.target.value)} placeholder="Filtrar puntos (ej. presión)" className={inputClass} style={{ ...inputStyle, maxWidth: 240 }} />
      </div>
      {readingsEquipId && readingSeries.length === 0 && !loadingItems && (
        <div className="text-sm px-4 py-6 text-center" style={{ ...card, color: C.muted }}>Este equipo no tiene lecturas numéricas{pointFilter ? " con ese filtro" : ""}.</div>
      )}
      {!readingsEquipId && !loadingItems && (
        <div className="text-sm px-4 py-6 text-center" style={{ ...card, color: C.muted }}>Para ver lecturas en el tiempo, los checklists deben tener puntos de tipo "Numérico (con rango)".</div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {readingSeries.map((g) => (
          <div key={g.key} className="p-3" style={card}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                {g.section && <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>{g.section}</div>}
                <div className="text-sm font-semibold">{g.text}</div>
              </div>
              {g.outCount > 0 && (
                <span className="flex items-center gap-1 text-xs flex-shrink-0 px-2 py-0.5" style={{ color: C.red, border: `1px solid ${C.red}60` }}>
                  <AlertTriangle size={12} /> {g.outCount} fuera de rango
                </span>
              )}
            </div>
            <div className="text-xs mb-2" style={{ color: C.muted }}>
              Rango: {g.min ?? "—"} a {g.max ?? "—"} · Última: <span style={{ color: isOutOfRange({ range_min: g.min, range_max: g.max }, g.last) ? C.red : C.text }}>{fmtNum(g.last)}</span>
              {" "}· Mín {fmtNum(g.lowest)} · Máx {fmtNum(g.highest)} · Prom. {fmtNum(g.avg)}
              {g.change != null && Math.abs(g.change) > 1e-9 && <span> · {g.change > 0 ? "▲" : "▼"} {fmtNum(Math.abs(g.change))} vs. promedio anterior</span>}
            </div>
            {g.points.length >= 2 ? (
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={g.points} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} axisLine={{ stroke: C.border }} tickLine={false} />
                  <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={{ stroke: C.border }} tickLine={false} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text, fontSize: 12 }}
                    formatter={(v) => [fmtNum(v), "Lectura"]}
                    labelFormatter={(_, payload) => { const p = payload?.[0]?.payload; return p ? `${p.code} · ${fmtDate(p.date)}${p.obs ? ` · ${p.obs}` : ""}` : ""; }}
                  />
                  {g.min != null && <ReferenceLine y={Number(g.min)} stroke={C.orange} strokeDasharray="4 4" />}
                  {g.max != null && <ReferenceLine y={Number(g.max)} stroke={C.orange} strokeDasharray="4 4" />}
                  <Line
                    type="monotone" dataKey="value" stroke={C.blue} strokeWidth={2} isAnimationActive={false}
                    dot={(p) => <circle key={`d${p.index}`} cx={p.cx} cy={p.cy} r={p.payload.out ? 5 : 3.5} fill={p.payload.out ? C.red : C.blue} stroke={C.panel} strokeWidth={1} style={{ cursor: "pointer" }} onClick={() => openOrderDetail(p.payload.order)} />}
                    activeDot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs py-4 text-center" style={{ color: C.muted }}>Solo hay una lectura ({fmtNum(g.points[0]?.value)} en {g.points[0]?.code}). La gráfica aparece desde la segunda orden.</div>
            )}
          </div>
        ))}
      </div>
      {readingSeries.length > 0 && <div className="text-xs mt-2" style={{ color: C.muted }}>Líneas naranjas: rango esperado del checklist. Puntos rojos: lecturas fuera de rango. Pasa el ratón por un punto para ver la orden; tócalo para abrirla.</div>}
    </div>
  );
}
