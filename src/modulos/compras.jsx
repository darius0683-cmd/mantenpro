// Compras e inventario: productos, existencias, proveedores, pedidos, notas de entrega, facturas de proveedor y gastos.
// Se carga solo cuando se usa (ver lazy.jsx).

import React from "react";
import { useState, useEffect, useMemo } from "react";
import { X, Plus, History, Upload, GripVertical, Pencil, Trash2, FileText } from "lucide-react";
import { supabase } from "../supabaseClient";
import { ActivityHistorySection, C, Field, Modal, PAYABLE_STATUS_CFG, PURCHASE_ORDER_STATUS_CFG, Pill, ProductSearchSelect, SearchSelect, TIPOS_RETENCION_ISR_606, extractInvoiceDataFromPdf, fmtDate, fmtMoney, formaPago606FromPayments, groupItemsByChapter, iconBtnStyle, inputClass, inputStyle, invoiceLikeHtml, issuableSequences, printDocument, todayStrRD } from "./base.jsx";

// ---- Inventario por sucursal: transferencias, ajustes y kárdex ----
export const STOCK_KIND_LABELS = {
  inicial: "Stock inicial", compra: "Compra", nota_entrega: "Nota de entrega", venta: "Venta", anulacion: "Anulación de factura",
  transferencia_salida: "Transferencia (salida)", transferencia_entrada: "Transferencia (entrada)", ajuste: "Ajuste",
  eliminacion_compra: "Compra eliminada", eliminacion_nota_entrega: "Nota de entrega eliminada",
};
export const STOCK_ADJUST_REASONS = ["Conteo físico", "Merma", "Daño o vencimiento", "Consumo interno", "Corrección de error", "Otro"];
export const stockableProducts = (products) => (products || []).filter((p) => (p.item_type || "producto") !== "servicio" && !p.is_composite);

export function StockTransferModal({ branches, products, stockAt, defaultFromId, onClose, onSave, saving }) {
  const [fromId, setFromId] = useState(defaultFromId || branches[0]?.id || "");
  const [toId, setToId] = useState(branches.find((b) => b.id !== (defaultFromId || branches[0]?.id))?.id || "");
  const [date, setDate] = useState(() => todayStrRD());
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState([{ key: 1, product_id: "", quantity: "" }]);
  const [error, setError] = useState("");
  const items = stockableProducts(products);
  const update = (key, patch) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const submit = () => {
    setError("");
    if (!fromId || !toId || fromId === toId) { setError("Elige dos sucursales distintas."); return; }
    const valid = rows.filter((r) => r.product_id && Number(r.quantity) > 0);
    if (valid.length === 0) { setError("Agrega al menos un producto con cantidad."); return; }
    for (const r of valid) {
      const avail = stockAt(r.product_id, fromId);
      if (Number(r.quantity) > avail) { setError(`${items.find((p) => p.id === r.product_id)?.name}: solo hay ${avail} en la sucursal de origen.`); return; }
    }
    onSave(fromId, toId, valid.map((r) => ({ product_id: r.product_id, quantity: Number(r.quantity) })), notes.trim(), date);
  };
  return (
    <Modal title="Transferir inventario entre sucursales" onClose={onClose} wide>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Desde">
          <select className={inputClass} style={inputStyle} value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Hacia">
          <select className={inputClass} style={inputStyle} value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">Selecciona</option>
            {branches.filter((b) => b.id !== fromId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Fecha">
          <input type="date" className={inputClass} style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Productos</div>
      <div className="space-y-2 mb-2">
        {rows.map((r) => {
          const avail = r.product_id ? stockAt(r.product_id, fromId) : null;
          return (
            <div key={r.key} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-7"><SearchSelect items={items} value={r.product_id} onChange={(v) => update(r.key, { product_id: v })} placeholder="Buscar producto..." getLabel={(p) => `${p.name}${p.sku ? ` (${p.sku})` : ""}`} /></div>
              <input type="text" inputMode="decimal" className={`${inputClass} col-span-2`} style={inputStyle} value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} placeholder="Cant." />
              <div className="col-span-2 text-xs" style={{ color: avail !== null && Number(r.quantity) > avail ? C.red : C.muted }}>{avail !== null ? `Hay ${avail}` : ""}</div>
              <button onClick={() => setRows((prev) => prev.length > 1 ? prev.filter((x) => x.key !== r.key) : prev)} style={iconBtnStyle} className="col-span-1"><X size={14} /></button>
            </div>
          );
        })}
      </div>
      <button onClick={() => setRows((prev) => [...prev, { key: Date.now(), product_id: "", quantity: "" }])} className="flex items-center gap-1 text-sm mb-3" style={{ color: C.amber }}><Plus size={14} /> Agregar producto</button>
      <Field label="Notas (opcional)">
        <input className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Reposición para obra en Santiago" />
      </Field>
      {error && <div className="text-xs mb-2" style={{ color: C.red }}>{error}</div>}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{saving ? "Transfiriendo..." : "Transferir"}</button>
      </div>
    </Modal>
  );
}

export function StockAdjustModal({ branches, products, stockAt, initialProductId, defaultBranchId, onClose, onSave, saving }) {
  const items = stockableProducts(products);
  const [productId, setProductId] = useState(initialProductId || "");
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "");
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState(STOCK_ADJUST_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const current = productId && branchId ? stockAt(productId, branchId) : null;
  const delta = counted !== "" && current !== null ? Number(counted) - current : 0;
  const submit = () => {
    setError("");
    if (!productId || !branchId) { setError("Elige el producto y la sucursal."); return; }
    if (counted === "" || Number(counted) < 0 || isNaN(Number(counted))) { setError("Escribe la existencia real (0 o más)."); return; }
    if (delta === 0) { setError("La existencia contada es igual a la del sistema: no hay nada que ajustar."); return; }
    onSave(productId, branchId, delta, detail.trim() ? `${reason}: ${detail.trim()}` : reason);
  };
  return (
    <Modal title="Ajustar inventario" onClose={onClose}>
      <Field label="Producto">
        <SearchSelect items={items} value={productId} onChange={setProductId} placeholder="Buscar producto..." getLabel={(p) => `${p.name}${p.sku ? ` (${p.sku})` : ""}`} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sucursal">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label={`Existencia real${current !== null ? ` (sistema: ${current})` : ""}`}>
          <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="Lo que hay físicamente" />
        </Field>
      </div>
      {counted !== "" && current !== null && delta !== 0 && (
        <div className="text-xs mb-2" style={{ color: delta > 0 ? C.green : C.red }}>Se {delta > 0 ? "sumarán" : "restarán"} {Math.abs(delta)} unidades.</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Motivo">
          <select className={inputClass} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)}>
            {STOCK_ADJUST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Detalle (opcional)">
          <input className={inputClass} style={inputStyle} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Ej. conteo de fin de mes" />
        </Field>
      </div>
      {error && <div className="text-xs mb-2" style={{ color: C.red }}>{error}</div>}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{saving ? "Guardando..." : "Guardar ajuste"}</button>
      </div>
    </Modal>
  );
}

export function StockMovementsModal({ product, branches, onClose }) {
  const [rows, setRows] = useState(null);
  const [branchFilter, setBranchFilter] = useState("");
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("stock_movements").select("*").eq("product_id", product.id).order("created_at", { ascending: false }).limit(500);
      setRows(error ? [] : (data || []));
    })();
  }, [product.id]);
  const shown = (rows || []).filter((r) => !branchFilter || r.branch_id === branchFilter);
  return (
    <Modal title={`Movimientos · ${product.name}`} onClose={onClose} wide>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="text-xs" style={{ color: C.muted }}>Existencia total: <span style={{ color: C.text }}>{product.stock_qty} {product.unit}</span> · costo promedio {fmtMoney(product.cost_price)}</div>
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-3 py-1.5 text-sm" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
        <div className="grid grid-cols-12 gap-2 min-w-[720px] px-3 py-2 text-[10px] uppercase tracking-wide" style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
          <div className="col-span-2">Fecha</div><div className="col-span-3">Movimiento</div><div className="col-span-2">Sucursal</div>
          <div className="col-span-1 text-right">Cant.</div><div className="col-span-1 text-right">Queda</div><div className="col-span-3">Detalle</div>
        </div>
        {rows === null && <div className="px-3 py-6 text-center text-sm" style={{ color: C.muted }}>Cargando...</div>}
        {rows !== null && shown.length === 0 && <div className="px-3 py-6 text-center text-sm" style={{ color: C.muted }}>Sin movimientos registrados.</div>}
        {shown.map((r) => (
          <div key={r.id} className="grid grid-cols-12 gap-2 min-w-[720px] px-3 py-2 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div className="col-span-2 text-xs" style={{ color: C.muted }}>{new Date(r.created_at).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" })}</div>
            <div className="col-span-3">{STOCK_KIND_LABELS[r.kind] || r.kind}</div>
            <div className="col-span-2 text-xs" style={{ color: C.muted }}>{branches.find((b) => b.id === r.branch_id)?.name || "—"}</div>
            <div className="col-span-1 text-right font-mono" style={{ color: Number(r.quantity) >= 0 ? C.green : C.red }}>{Number(r.quantity) > 0 ? "+" : ""}{Number(r.quantity)}</div>
            <div className="col-span-1 text-right font-mono">{r.balance_after ?? "—"}</div>
            <div className="col-span-3 text-xs truncate" style={{ color: C.muted }}>{r.reason || ""}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function ProductFormModal({ initial, existingProducts, allProducts, initialComponents, defaultItemType, branches, restrictToBranchIds, onClose, onSave, saving }) {
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
      branch_id: isService ? null : (branchId || null),
      is_taxable: isTaxable,
      is_composite: isComposite,
    }, components, {
      // Stock inicial (solo al crear): entra a la sucursal del producto o a la principal
      initialStock: (!initial && !isService && !isComposite) ? (Number(stockQty) || 0) : 0,
      initialStockBranchId: branchId || null,
    });
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
          initial ? (
            <Field label="Existencia">
              <div className="px-3 py-2 text-sm" style={{ ...inputStyle, color: C.muted }}>{initial.stock_qty} {initial.unit} — se cambia con "Ajustar inventario"</div>
            </Field>
          ) : (
            <Field label="Stock inicial">
              <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={stockQty} onChange={(e) => setStockQty(e.target.value)} placeholder="0" />
            </Field>
          )
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

export function SupplierFormModal({ initial, onClose, onSave, saving }) {
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

// ---- Catálogos del formato 606 de la DGII ----
export const TIPOS_BIENES_SERVICIOS_606 = [
  { code: "01", label: "01 · Gastos de personal" },
  { code: "02", label: "02 · Gastos por trabajos, suministros y servicios" },
  { code: "03", label: "03 · Arrendamientos" },
  { code: "04", label: "04 · Gastos de activos fijos" },
  { code: "05", label: "05 · Gastos de representación" },
  { code: "06", label: "06 · Otras deducciones admitidas" },
  { code: "07", label: "07 · Gastos financieros" },
  { code: "08", label: "08 · Gastos extraordinarios" },
  { code: "09", label: "09 · Compras y gastos que forman parte del costo de venta" },
  { code: "10", label: "10 · Adquisiciones de activos" },
  { code: "11", label: "11 · Gastos de seguros" },
];
export const FORMAS_PAGO_606 = [
  { code: "01", label: "01 · Efectivo" },
  { code: "02", label: "02 · Cheque / transferencia / depósito" },
  { code: "03", label: "03 · Tarjeta crédito / débito" },
  { code: "04", label: "04 · Compra a crédito" },
  { code: "05", label: "05 · Permuta" },
  { code: "06", label: "06 · Nota de crédito" },
  { code: "07", label: "07 · Mixto" },
];

export function ExpenseFormModal({ suppliers, ncfSequences, initial, onClose, onSave, saving }) {
  const [expenseDate, setExpenseDate] = useState(initial?.expense_date || (() => todayStrRD())());
  const [category, setCategory] = useState(initial?.category || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [supplierId, setSupplierId] = useState(initial?.supplier_id || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [ncf, setNcf] = useState(initial?.ncf || "");
  const [itbisAmount, setItbisAmount] = useState(initial?.itbis_amount ? String(initial.itbis_amount) : "");
  const [expenseKind, setExpenseKind] = useState(initial?.expense_kind || "servicios");
  const [tipoBienServicio, setTipoBienServicio] = useState(initial?.tipo_bien_servicio || "02");
  const [formaPago, setFormaPago] = useState(initial?.forma_pago || "");
  const [paymentDate, setPaymentDate] = useState(initial?.payment_date || "");
  const [formError, setFormError] = useState("");
  // Emitir el comprobante desde el sistema: B13 (gasto menor sin comprobante) o B11 (proveedor informal)
  const [emitType, setEmitType] = useState("");
  const b13Seqs = issuableSequences(ncfSequences, "B13", expenseDate);
  const b11Seqs = issuableSequences(ncfSequences, "B11", expenseDate);
  const emitSeqs = emitType === "B13" ? b13Seqs : emitType === "B11" ? b11Seqs : [];
  const canEmit = !initial?.ncf && (b13Seqs.length > 0 || b11Seqs.length > 0);
  const hasNcf = ncf.trim().length > 0 || !!emitType;
  const selectedSupplier = suppliers.find((s) => s.id === supplierId) || null;
  const amountNum = Number(amount) || 0;
  const itbisNum = Number(itbisAmount) || 0;
  const submit = () => {
    if (!description.trim() || !amount) return;
    if (itbisNum < 0 || itbisNum > amountNum) { setFormError("El ITBIS no puede ser negativo ni mayor que el monto total."); return; }
    if (hasNcf) {
      if (emitType && emitSeqs.length === 0) { setFormError(`No hay una secuencia ${emitType} activa y vigente — configúrala en Secuencias NCF.`); return; }
      if (emitType !== "B13") {
        if (!selectedSupplier) { setFormError(emitType === "B11" ? "Para emitir B11 elige el proveedor (se necesita su cédula)." : "Para que el gasto vaya al 606 hay que elegir el proveedor (se necesita su RNC)."); return; }
        if (!(selectedSupplier.rnc || "").trim()) { setFormError(`El proveedor ${selectedSupplier.name} no tiene RNC/cédula registrado — agrégaselo en Proveedores.`); return; }
      }
      if (!formaPago) { setFormError("Selecciona la forma de pago (se exige en el 606)."); return; }
    }
    onSave({
      expense_date: expenseDate, category: category.trim() || null, description: description.trim(), amount: amountNum, supplier_id: supplierId || null, notes: notes.trim() || null,
      ncf: emitType ? (initial?.ncf || null) : (ncf.trim() ? ncf.trim().toUpperCase() : null),
      issue_ncf_sequence_id: emitType ? emitSeqs[0]?.id || null : null,
      itbis_amount: hasNcf ? itbisNum : 0,
      expense_kind: expenseKind,
      tipo_bien_servicio: hasNcf ? tipoBienServicio : null,
      forma_pago: hasNcf ? formaPago : null,
      payment_date: hasNcf ? (paymentDate || expenseDate) : null,
    });
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
        <Field label="Monto total pagado (RD$, ITBIS incluido)">
          <input type="number" step="0.01" className={inputClass} style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Proveedor (opcional)">
          <select className={inputClass} style={inputStyle} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="p-3 mb-3 space-y-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
        <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Comprobante fiscal (para el 606)</div>
        {canEmit && (
          <Field label="Comprobante">
            <select className={inputClass} style={inputStyle} value={emitType} onChange={(e) => { setEmitType(e.target.value); if (e.target.value) setNcf(""); setFormError(""); }}>
              <option value="">NCF del proveedor / sin comprobante</option>
              {b13Seqs.length > 0 && <option value="B13">Emitir B13 — gasto menor sin comprobante</option>}
              {b11Seqs.length > 0 && <option value="B11">Emitir B11 — proveedor informal</option>}
            </select>
          </Field>
        )}
        {emitType ? (
          <div className="text-xs" style={{ color: C.muted }}>Se emite un {emitType} ({emitSeqs[0]?.prefix}) al guardar el gasto.</div>
        ) : (
          <Field label="NCF del proveedor (déjalo vacío si el gasto no tiene comprobante)">
            <input className={inputClass} style={inputStyle} value={ncf} onChange={(e) => setNcf(e.target.value)} placeholder="Ej. B0100000123" disabled={!!initial?.ncf && /^B1[13]/i.test(initial.ncf)} />
          </Field>
        )}
        {hasNcf && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ITBIS facturado (RD$)">
                <input type="number" step="0.01" min="0" className={inputClass} style={inputStyle} value={itbisAmount} onChange={(e) => setItbisAmount(e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Es">
                <select className={inputClass} style={inputStyle} value={expenseKind} onChange={(e) => setExpenseKind(e.target.value)}>
                  <option value="servicios">Servicio</option>
                  <option value="bienes">Bien</option>
                </select>
              </Field>
            </div>
            <div className="text-xs" style={{ color: C.muted }}>Monto sin ITBIS: <span className="font-mono" style={{ color: C.text }}>{fmtMoney(Math.max(amountNum - itbisNum, 0))}</span>{selectedSupplier && <> · RNC del proveedor: <span className="font-mono" style={{ color: (selectedSupplier.rnc || "").trim() ? C.text : C.red }}>{selectedSupplier.rnc || "sin RNC"}</span></>}</div>
            <Field label="Tipo de bien o servicio">
              <select className={inputClass} style={inputStyle} value={tipoBienServicio} onChange={(e) => setTipoBienServicio(e.target.value)}>
                {TIPOS_BIENES_SERVICIOS_606.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Forma de pago">
                <select className={inputClass} style={inputStyle} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                  <option value="">Selecciona</option>
                  {FORMAS_PAGO_606.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Fecha de pago (si es distinta)">
                <input type="date" className={inputClass} style={inputStyle} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </Field>
            </div>
          </>
        )}
      </div>
      <Field label="Notas (opcional)">
        <input className={inputClass} style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones" />
      </Field>
      {formError && <div className="text-xs mb-2" style={{ color: C.red }}>{formError}</div>}
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

export function PurchaseFormModal({ suppliers, products, ncfSequences, branches, defaultBranchId, onClose, onSave, saving, onRequestNewSupplier, onEnsureGenericProduct, prefill }) {
  const [title, setTitle] = useState("");
  const [supplierId, setSupplierId] = useState(prefill?.supplier_id || suppliers[0]?.id || "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => todayStrRD());
  const [notes, setNotes] = useState("");
  // goods_receipt_id: si esta factura viene de una nota de entrega ya registrada, el
  // inventario NO se vuelve a tocar al guardar (ver createPurchase) — ya subió al recibir.
  const [goodsReceiptId] = useState(prefill?.goods_receipt_id || null);
  const [blocks, setBlocks] = useState(() => prefill?.items?.length
    ? prefill.items.map((it, idx) => {
      const prod = products.find((p) => p.id === it.product_id);
      return { id: idx, kind: "item", product_id: it.product_id, quantity: it.quantity, unit_cost: it.unit_cost, is_taxable: prod?.is_taxable ?? true };
    })
    : [{ id: 0, kind: "item", product_id: "", quantity: 1, unit_cost: 0, is_taxable: true }]);
  const [retainItbis, setRetainItbis] = useState(false);
  const [retainIsr, setRetainIsr] = useState(false);
  const [tipoBienServicio, setTipoBienServicio] = useState("09");
  const [formaPago, setFormaPago] = useState("");
  const [isrRetentionType, setIsrRetentionType] = useState("02");
  const [purchaseBranchId, setPurchaseBranchId] = useState(prefill?.branch_id || defaultBranchId || (branches || [])[0]?.id || "");
  const [emitB11, setEmitB11] = useState(false);
  const [b11SeqId, setB11SeqId] = useState("");
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

  const b11Seqs = issuableSequences(ncfSequences, "B11", purchaseDate);
  const submit = () => {
    const validItems = resolvedItems.filter((it) => it.product_id && Number(it.quantity) > 0);
    if (!supplierId || validItems.length === 0) return;
    if (emitB11 && b11Seqs.length === 0) return;
    onSave({
      title: title.trim() || null, supplier_id: supplierId, invoice_number: invoiceNumber.trim() || null, purchase_date: purchaseDate, notes: notes.trim() || null,
      applies_254_06: apply254_06, retains_itbis: retainItbis, retains_isr: retainIsr,
      service_value: serviceValue, itbis_amount: itbisAmount, isr_retained: isrRetained, itbis_retained: itbisRetained,
      total, goods_receipt_id: goodsReceiptId,
      tipo_bien_servicio: tipoBienServicio || null,
      forma_pago: formaPago || null,
      isr_retention_type: retainIsr ? isrRetentionType : null,
      issue_ncf_sequence_id: emitB11 ? (b11SeqId || b11Seqs[0]?.id || null) : null,
      branch_id: purchaseBranchId || null,
    }, validItems);
  };

  return (
    <Modal title="Registrar compra" onClose={onClose} wide>
      {goodsReceiptId ? (
        <div className="mb-3 p-3 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.green}60`, color: C.text }}>
          Esta factura viene de la nota de entrega <span className="font-mono">{prefill?.receiptLabel}</span> — el proveedor y los renglones ya se llenaron con lo que se recibió. El inventario no se va a duplicar (ya subió al registrar esa nota de entrega); solo puedes ajustar el costo si la factura final vino distinta.
        </div>
      ) : (
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
      )}
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
        <Field label="NCF del proveedor (va al 606)">
          {emitB11 ? (
            <div className="px-3 py-2 text-sm" style={{ ...inputStyle, color: C.muted }}>Se emite un B11 al guardar</div>
          ) : (
            <input className={inputClass} style={inputStyle} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ej. B0100000123" />
          )}
          {b11Seqs.length > 0 && (
            <label className="flex items-center gap-1 text-xs mt-1 cursor-pointer" style={{ color: C.amber }}>
              <input type="checkbox" checked={emitB11} onChange={(e) => { setEmitB11(e.target.checked); if (e.target.checked) setInvoiceNumber(""); }} /> Proveedor informal: emitir B11
            </label>
          )}
          {emitB11 && b11Seqs.length > 1 && (
            <select className={`${inputClass} mt-1`} style={inputStyle} value={b11SeqId || b11Seqs[0].id} onChange={(e) => setB11SeqId(e.target.value)}>
              {b11Seqs.map((sq) => <option key={sq.id} value={sq.id}>{sq.prefix} (disp. {sq.range_end - sq.next_number + 1})</option>)}
            </select>
          )}
        </Field>
        <Field label="Fecha de compra">
          <input type="date" className={inputClass} style={inputStyle} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </Field>
      </div>

      {(branches || []).length > 0 && (
        <Field label="Sucursal (a qué inventario entra)">
          <select className={inputClass} style={inputStyle} value={purchaseBranchId} onChange={(e) => setPurchaseBranchId(e.target.value)} disabled={!!goodsReceiptId}>
            {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {goodsReceiptId && <div className="text-xs mt-1" style={{ color: C.muted }}>La mercancía ya entró con la nota de entrega.</div>}
        </Field>
      )}
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
      {retainIsr && (
        <Field label="Tipo de retención de ISR (606)">
          <select className={inputClass} style={inputStyle} value={isrRetentionType} onChange={(e) => setIsrRetentionType(e.target.value)}>
            {TIPOS_RETENCION_ISR_606.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Tipo de bien o servicio (606)">
          <select className={inputClass} style={inputStyle} value={tipoBienServicio} onChange={(e) => setTipoBienServicio(e.target.value)}>
            {TIPOS_BIENES_SERVICIOS_606.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Forma de pago (606)">
          <select className={inputClass} style={inputStyle} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
            <option value="">Según los pagos que registre</option>
            {FORMAS_PAGO_606.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </Field>
      </div>

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

export function PurchaseDetailModal({ purchase, items, payments, supplierName, supplierRnc, companyName, company, canEdit, canDelete, onClose, onRegisterPayment, onDeletePayment, onUpdate606, b11Sequences, onIssueB11 }) {
  const [issuingB11, setIssuingB11] = useState(false);
  const [edit606, setEdit606] = useState(false);
  const [f606, setF606] = useState({ tipo_bien_servicio: purchase.tipo_bien_servicio || "", forma_pago: purchase.forma_pago || "", isr_retention_type: purchase.isr_retention_type || (purchase.retains_isr ? "02" : "") });
  const [saving606, setSaving606] = useState(false);
  const label606 = (list, code) => list.find((t) => t.code === code)?.label || "—";
  const save606 = async () => {
    setSaving606(true);
    const ok = await onUpdate606(purchase, {
      tipo_bien_servicio: f606.tipo_bien_servicio || null,
      forma_pago: f606.forma_pago || null,
      isr_retention_type: purchase.retains_isr ? (f606.isr_retention_type || "02") : null,
    });
    setSaving606(false);
    if (ok) setEdit606(false);
  };
  const chapterGroups = groupItemsByChapter(items, (it) => Number(it.subtotal) || 0);
  const showChapters = chapterGroups.length > 1 || (chapterGroups[0] && chapterGroups[0].chapter !== "General");
  const balance = Number(purchase.total) - Number(purchase.amount_paid || 0);
  const payCfg = PAYABLE_STATUS_CFG[purchase.payment_status] || PAYABLE_STATUS_CFG.pendiente;
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payAmount, setPayAmount] = useState(balance > 0 ? balance.toFixed(2) : "");
  const [payDate, setPayDate] = useState(() => todayStrRD());
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

      <div className="mt-4 p-3" style={{ background: C.panelAlt, border: `1px solid ${purchase.tipo_bien_servicio ? C.border : C.orange + "80"}` }}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Datos para el 606</div>
          {canEdit && !edit606 && onUpdate606 && <button onClick={() => setEdit606(true)} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}><Pencil size={12} /> Editar</button>}
        </div>
        {!edit606 ? (
          <div className="text-xs space-y-0.5" style={{ color: C.text }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span>NCF: <span className="font-mono">{purchase.invoice_number || <span style={{ color: C.red }}>sin NCF</span>}</span></span>
              {!purchase.invoice_number && canEdit && onIssueB11 && (b11Sequences || []).length > 0 && (
                <button disabled={issuingB11} onClick={async () => { setIssuingB11(true); await onIssueB11(purchase, b11Sequences[0].id); setIssuingB11(false); }} className="text-xs px-2 py-0.5 font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
                  {issuingB11 ? "Emitiendo..." : `Emitir B11 (${b11Sequences[0].prefix})`}
                </button>
              )}
            </div>
            <div>Tipo de bien o servicio: {purchase.tipo_bien_servicio ? label606(TIPOS_BIENES_SERVICIOS_606, purchase.tipo_bien_servicio) : <span style={{ color: C.orange }}>sin asignar</span>}</div>
            <div>Forma de pago: {purchase.forma_pago ? label606(FORMAS_PAGO_606, purchase.forma_pago) : <span style={{ color: C.muted }}>según los pagos registrados ({label606(FORMAS_PAGO_606, formaPago606FromPayments(payments))})</span>}</div>
            {purchase.retains_isr && <div>Tipo de retención ISR: {label606(TIPOS_RETENCION_ISR_606, purchase.isr_retention_type || "02")}</div>}
          </div>
        ) : (
          <div className="space-y-2">
            <Field label="Tipo de bien o servicio">
              <select className={inputClass} style={inputStyle} value={f606.tipo_bien_servicio} onChange={(e) => setF606({ ...f606, tipo_bien_servicio: e.target.value })}>
                <option value="">Sin asignar</option>
                {TIPOS_BIENES_SERVICIOS_606.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Forma de pago">
              <select className={inputClass} style={inputStyle} value={f606.forma_pago} onChange={(e) => setF606({ ...f606, forma_pago: e.target.value })}>
                <option value="">Según los pagos registrados</option>
                {FORMAS_PAGO_606.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </Field>
            {purchase.retains_isr && (
              <Field label="Tipo de retención de ISR">
                <select className={inputClass} style={inputStyle} value={f606.isr_retention_type} onChange={(e) => setF606({ ...f606, isr_retention_type: e.target.value })}>
                  {TIPOS_RETENCION_ISR_606.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEdit606(false)} className="px-3 py-1.5 text-xs" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
              <button onClick={save606} disabled={saving606} className="px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{saving606 ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        )}
      </div>

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

export function PurchaseOrderFormModal({ suppliers, branches, products, onClose, onSave, saving, onRequestNewSupplier }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [branchId, setBranchId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ tempId: 0, product_id: "", quantity: 1, unit_cost: 0 }]);
  const newTempId = () => Date.now() + Math.random();

  const updateItem = (tempId, patch) => setItems((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { tempId: newTempId(), product_id: "", quantity: 1, unit_cost: 0 }]);
  const removeItem = (tempId) => setItems((prev) => prev.filter((it) => it.tempId !== tempId));
  const onProductPick = (tempId, productId) => {
    const prod = products.find((p) => p.id === productId);
    updateItem(tempId, { product_id: productId, unit_cost: prod ? prod.cost_price : 0 });
  };

  const validItems = items.filter((it) => it.product_id && Number(it.quantity) > 0);
  const total = validItems.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_cost), 0);

  const submit = () => {
    if (!supplierId || validItems.length === 0) return;
    onSave(
      { supplier_id: supplierId, branch_id: branchId || null, expected_date: expectedDate || null, notes: notes.trim() || null },
      validItems.map((it) => ({ product_id: it.product_id, quantity: Number(it.quantity), unit_cost: Number(it.unit_cost) }))
    );
  };

  return (
    <Modal title="Nuevo pedido a proveedor" onClose={onClose} wide>
      <div className="text-xs mb-3" style={{ color: C.muted }}>Esto solo registra qué le pediste al proveedor — no toca el inventario. El inventario sube cuando registres la Nota de entrega con lo que realmente llegó.</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Proveedor">
          <div className="flex gap-2">
            <div className="flex-1"><SearchSelect items={suppliers} value={supplierId} onChange={setSupplierId} placeholder="Buscar proveedor..." getLabel={(s) => s.name} /></div>
            {onRequestNewSupplier && <button type="button" onClick={onRequestNewSupplier} className="px-3 flex-shrink-0" style={{ border: `1px solid ${C.border}`, color: C.amber }}><Plus size={14} /></button>}
          </div>
        </Field>
        <Field label="Sucursal (opcional)">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Sin especificar</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Fecha estimada de llegada (opcional)">
        <input type="date" className={inputClass} style={inputStyle} value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
      </Field>

      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Productos pedidos</div>
      <div className="space-y-2 mb-3">
        {items.map((it) => (
          <div key={it.tempId} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-6"><ProductSearchSelect products={products} value={it.product_id} onChange={(id) => onProductPick(it.tempId, id)} placeholder="Buscar producto..." /></div>
            <input type="text" inputMode="decimal" className={`${inputClass} col-span-2`} style={inputStyle} value={it.quantity} onChange={(e) => updateItem(it.tempId, { quantity: e.target.value })} placeholder="Cant." />
            <input type="text" inputMode="decimal" className={`${inputClass} col-span-3`} style={inputStyle} value={it.unit_cost} onChange={(e) => updateItem(it.tempId, { unit_cost: e.target.value })} placeholder="Costo unit." />
            <button onClick={() => removeItem(it.tempId)} className="col-span-1" style={iconBtnStyle}><X size={16} /></button>
          </div>
        ))}
      </div>
      <button onClick={addItem} className="flex items-center gap-2 text-sm mb-3" style={{ color: C.amber }}><Plus size={14} /> Agregar producto</button>
      <div className="text-right text-sm font-semibold mb-3" style={{ color: C.text }}>Total estimado: {fmtMoney(total)}</div>
      <Field label="Notas (opcional)">
        <textarea className={inputClass} style={{ ...inputStyle, minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condiciones, referencia del proveedor, etc." />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving || !supplierId || validItems.length === 0} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          {saving ? "Guardando..." : "Crear pedido"}
        </button>
      </div>
    </Modal>
  );
}

export function GoodsReceiptFormModal({ suppliers, branches, products, openOrders, orderItemsFor, fromOrder, onClose, onSave, saving }) {
  const newTempId = () => Date.now() + Math.random();
  const pendingFromOrder = (order) => {
    const pending = (orderItemsFor(order?.id) || []).filter((it) => Number(it.received_quantity || 0) < Number(it.quantity));
    return pending.length > 0
      ? pending.map((it) => ({ tempId: newTempId(), product_id: it.product_id, quantity: Number(it.quantity) - Number(it.received_quantity || 0), unit_cost: Number(it.unit_cost) }))
      : [{ tempId: newTempId(), product_id: "", quantity: 1, unit_cost: 0 }];
  };

  const [purchaseOrderId, setPurchaseOrderId] = useState(fromOrder?.id || "");
  const [supplierId, setSupplierId] = useState(fromOrder?.supplier_id || suppliers[0]?.id || "");
  const [branchId, setBranchId] = useState(fromOrder?.branch_id || "");
  const [receiptDate, setReceiptDate] = useState(() => todayStrRD());
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState(() => fromOrder ? pendingFromOrder(fromOrder) : [{ tempId: newTempId(), product_id: "", quantity: 1, unit_cost: 0 }]);

  const onPickOrder = (orderId) => {
    setPurchaseOrderId(orderId);
    const order = openOrders.find((o) => o.id === orderId);
    if (order) {
      setSupplierId(order.supplier_id);
      setBranchId(order.branch_id || "");
      setItems(pendingFromOrder(order));
    } else {
      setItems([{ tempId: newTempId(), product_id: "", quantity: 1, unit_cost: 0 }]);
    }
  };

  const updateItem = (tempId, patch) => setItems((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { tempId: newTempId(), product_id: "", quantity: 1, unit_cost: 0 }]);
  const removeItem = (tempId) => setItems((prev) => prev.filter((it) => it.tempId !== tempId));
  const onProductPick = (tempId, productId) => {
    const prod = products.find((p) => p.id === productId);
    updateItem(tempId, { product_id: productId, unit_cost: prod ? prod.cost_price : 0 });
  };

  const validItems = items.filter((it) => it.product_id && Number(it.quantity) > 0);

  const submit = () => {
    if (!supplierId || validItems.length === 0) return;
    onSave(
      { supplier_id: supplierId, purchase_order_id: purchaseOrderId || null, branch_id: branchId || null, receipt_date: receiptDate, notes: notes.trim() || null },
      validItems.map((it) => ({ product_id: it.product_id, quantity: Number(it.quantity), unit_cost: Number(it.unit_cost) }))
    );
  };

  return (
    <Modal title="Nueva nota de entrega" onClose={onClose} wide>
      <div className="text-xs mb-3" style={{ color: C.muted }}>Registra lo que llegó de verdad (puede ser distinto a lo pedido). El inventario sube con lo que pongas aquí, no cuando llegue la factura.</div>
      {fromOrder ? (
        <div className="mb-3 p-3 text-sm" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text }}>
          Recibiendo contra el pedido <span className="font-mono">{fromOrder.order_number}</span> — proveedor {suppliers.find((s) => s.id === fromOrder.supplier_id)?.name || "—"}. Las cantidades de abajo son las que faltan por recibir; ajústalas si llegó distinto.
        </div>
      ) : (
        <Field label="Pedido relacionado (opcional)">
          <select className={inputClass} style={inputStyle} value={purchaseOrderId} onChange={(e) => onPickOrder(e.target.value)}>
            <option value="">Sin pedido — recepción libre</option>
            {openOrders.map((o) => <option key={o.id} value={o.id}>{o.order_number} · {suppliers.find((s) => s.id === o.supplier_id)?.name || "—"}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Proveedor">
          {purchaseOrderId ? (
            <div className={inputClass} style={{ ...inputStyle, display: "flex", alignItems: "center", color: C.muted }}>{suppliers.find((s) => s.id === supplierId)?.name || "—"}</div>
          ) : (
            <SearchSelect items={suppliers} value={supplierId} onChange={setSupplierId} placeholder="Buscar proveedor..." getLabel={(s) => s.name} />
          )}
        </Field>
        <Field label="Sucursal (opcional)">
          <select className={inputClass} style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Sin especificar</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Fecha de recepción">
          <input type="date" className={inputClass} style={inputStyle} value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
        </Field>
      </div>

      <div className="text-xs uppercase tracking-wide mb-2 mt-2" style={{ color: C.muted }}>Productos recibidos</div>
      <div className="space-y-2 mb-3">
        {items.map((it) => (
          <div key={it.tempId} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-6"><ProductSearchSelect products={products} value={it.product_id} onChange={(id) => onProductPick(it.tempId, id)} placeholder="Buscar producto..." /></div>
            <input type="text" inputMode="decimal" className={`${inputClass} col-span-2`} style={inputStyle} value={it.quantity} onChange={(e) => updateItem(it.tempId, { quantity: e.target.value })} placeholder="Cant. recibida" />
            <input type="text" inputMode="decimal" className={`${inputClass} col-span-3`} style={inputStyle} value={it.unit_cost} onChange={(e) => updateItem(it.tempId, { unit_cost: e.target.value })} placeholder="Costo unit." />
            <button onClick={() => removeItem(it.tempId)} className="col-span-1" style={iconBtnStyle}><X size={16} /></button>
          </div>
        ))}
      </div>
      <button onClick={addItem} className="flex items-center gap-2 text-sm mb-3" style={{ color: C.amber }}><Plus size={14} /> Agregar producto</button>
      <Field label="Notas (opcional)">
        <textarea className={inputClass} style={{ ...inputStyle, minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Diferencias con lo pedido, estado de la mercancía, etc." />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar</button>
        <button onClick={submit} disabled={saving || !supplierId || validItems.length === 0} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.green, color: "#0B1F13" }}>
          {saving ? "Guardando..." : "Registrar recepción"}
        </button>
      </div>
    </Modal>
  );
}

export function PurchaseOrderDetailModal({ po, items, supplierName, branchName, canEdit, onClose, onCancel, onDelete, onReceive }) {
  const cfg = PURCHASE_ORDER_STATUS_CFG[po.status] || PURCHASE_ORDER_STATUS_CFG.pendiente;
  const total = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_cost), 0);
  return (
    <Modal title={`Pedido ${po.order_number || ""}`} onClose={onClose} wide>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ color: C.text }}>{supplierName}</div>
          <div className="text-xs" style={{ color: C.muted }}>{branchName ? `${branchName} · ` : ""}Pedido: {fmtDate(po.order_date)}{po.expected_date ? ` · Llegada esperada: ${fmtDate(po.expected_date)}` : ""}</div>
        </div>
        <Pill label={cfg.label} color={cfg.color} />
      </div>
      {po.notes && <div className="text-sm mb-3 p-2" style={{ background: C.panelAlt, color: C.muted }}>{po.notes}</div>}
      <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide mb-1 px-1" style={{ color: C.muted }}>
        <div className="col-span-5">Producto</div>
        <div className="col-span-2 text-right">Pedido</div>
        <div className="col-span-2 text-right">Recibido</div>
        <div className="col-span-3 text-right">Costo unit.</div>
      </div>
      <div className="space-y-1 mb-3">
        {items.map((it) => (
          <div key={it.id} className="grid grid-cols-12 gap-2 text-sm py-1" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div className="col-span-5 truncate" style={{ color: C.text }}>{it.productName}</div>
            <div className="col-span-2 text-right font-mono">{it.quantity}</div>
            <div className="col-span-2 text-right font-mono" style={{ color: Number(it.received_quantity) >= Number(it.quantity) ? C.green : C.amber }}>{it.received_quantity || 0}</div>
            <div className="col-span-3 text-right font-mono" style={{ color: C.muted }}>{fmtMoney(it.unit_cost)}</div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-base font-bold mb-4" style={{ color: C.text }}><span>Total estimado</span><span className="font-mono">{fmtMoney(total)}</span></div>
      <div className="flex justify-end gap-2">
        {onDelete && canEdit && <button onClick={() => { onDelete(po); onClose(); }} className="px-4 py-2 text-sm" style={{ color: C.red, border: `1px solid ${C.red}60` }}>Eliminar</button>}
        {onCancel && canEdit && (po.status === "pendiente" || po.status === "parcial") && <button onClick={() => onCancel(po)} className="px-4 py-2 text-sm" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancelar pedido</button>}
        {onReceive && canEdit && (po.status === "pendiente" || po.status === "parcial") && <button onClick={() => { onReceive(po); onClose(); }} className="px-4 py-2 text-sm font-semibold" style={{ background: C.green, color: "#0B1F13" }}>Recibir mercancía</button>}
      </div>
    </Modal>
  );
}

export function GoodsReceiptDetailModal({ receipt, items, supplierName, branchName, orderNumber, invoiced, canEdit, onClose, onDelete, onInvoice }) {
  const total = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_cost), 0);
  return (
    <Modal title={`Nota de entrega ${receipt.receipt_number || ""}`} onClose={onClose} wide>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold" style={{ color: C.text }}>{supplierName}</div>
          <div className="text-xs" style={{ color: C.muted }}>{branchName ? `${branchName} · ` : ""}Recibido: {fmtDate(receipt.receipt_date)}{orderNumber ? ` · Pedido: ${orderNumber}` : ""}</div>
        </div>
        <Pill label={invoiced ? "Facturada" : "Sin facturar"} color={invoiced ? C.green : C.amber} />
      </div>
      {receipt.notes && <div className="text-sm mb-3 p-2" style={{ background: C.panelAlt, color: C.muted }}>{receipt.notes}</div>}
      <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide mb-1 px-1" style={{ color: C.muted }}>
        <div className="col-span-6">Producto</div>
        <div className="col-span-2 text-right">Cantidad</div>
        <div className="col-span-4 text-right">Costo unit.</div>
      </div>
      <div className="space-y-1 mb-3">
        {items.map((it) => (
          <div key={it.id} className="grid grid-cols-12 gap-2 text-sm py-1" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div className="col-span-6 truncate" style={{ color: C.text }}>{it.productName}</div>
            <div className="col-span-2 text-right font-mono">{it.quantity}</div>
            <div className="col-span-4 text-right font-mono" style={{ color: C.muted }}>{fmtMoney(it.unit_cost)}</div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-base font-bold mb-4" style={{ color: C.text }}><span>Total recibido</span><span className="font-mono">{fmtMoney(total)}</span></div>
      <div className="flex justify-end gap-2">
        {onDelete && canEdit && !invoiced && <button onClick={() => { onDelete(receipt); onClose(); }} className="px-4 py-2 text-sm" style={{ color: C.red, border: `1px solid ${C.red}60` }}>Eliminar</button>}
        {onInvoice && canEdit && !invoiced && <button onClick={() => { onInvoice(receipt); onClose(); }} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Registrar factura</button>}
      </div>
    </Modal>
  );
}
