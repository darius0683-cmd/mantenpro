// Pantallas de Compras, inventario y Cuentas por Pagar.
// Cada componente es el JSX de una pantalla del Dashboard, copiado tal cual. Todo lo que usa
// (estados, funciones y cálculos del Dashboard) le llega por props con el mismo nombre.
// Se carga solo cuando se abre la pantalla (ver lazy.jsx).
import React from "react";
import { C, PAYABLE_STATUS_CFG, PURCHASE_ORDER_STATUS_CFG, Pill, fmtDate, fmtMoney, iconBtnStyle, listHtml, printDocument } from "./base.jsx";
import { ArrowRight, ClipboardList, FileText, MapPin, Pencil, Plus, Search, Trash2, Truck } from "lucide-react";

// Pantalla: products / services
export function VistaProductsServices({ branches, canDelete, canEdit, companyName, deleteProduct, filteredProducts, isServicesView, productBranchFilter, productCategories, productCategoryFilter, productComponents, productSearch, products, selectedProducts, setEditingProduct, setProductBranchFilter, setProductCategoryFilter, setProductSearch, setSelectedProducts, setShowAddProduct, setShowStockTransfer, setStockAdjustFor, setStockMovementsFor, stockAt }) {
  return (
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
                  {!isServicesView && canEdit("products") && branches.length > 1 && (
                    <button onClick={() => setShowStockTransfer(true)} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.amber }}>
                      <ArrowRight size={14} /> Transferir
                    </button>
                  )}
                  {!isServicesView && canEdit("products") && branches.length > 0 && (
                    <button onClick={() => setStockAdjustFor(true)} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.amber }}>
                      <Pencil size={14} /> Ajustar inventario
                    </button>
                  )}
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
                    {!isServicesView && (() => {
                      if (p.is_composite) return <div className="text-xs mt-1" style={{ color: C.muted }}>{productComponents.filter((c) => c.parent_product_id === p.id).length} componentes</div>;
                      const byBranch = branches.map((b) => ({ b, q: stockAt(p.id, b.id) })).filter((x) => x.q !== 0);
                      const filterBranch = productBranchFilter !== "all" && productBranchFilter !== "none" ? branches.find((b) => b.id === productBranchFilter) : null;
                      const shownQty = filterBranch ? stockAt(p.id, filterBranch.id) : Number(p.stock_qty || 0);
                      return (
                        <div className="text-xs mt-1 flex items-start justify-between gap-2">
                          <div style={{ color: shownQty <= 0 ? C.red : C.muted }}>
                            {filterBranch ? `En ${filterBranch.name}: ${shownQty} ${p.unit}` : `Stock total: ${p.stock_qty} ${p.unit}`}
                            {!filterBranch && byBranch.length > 0 && branches.length > 1 && (
                              <div style={{ color: C.muted }}>{byBranch.map((x) => `${x.b.name}: ${x.q}`).join(" · ")}</div>
                            )}
                          </div>
                          <button onClick={() => setStockMovementsFor(p)} title="Ver movimientos (kárdex)" className="flex-shrink-0" style={{ color: C.amber }}><ClipboardList size={13} /></button>
                        </div>
                      );
                    })()}
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
  );
}

// Pantalla: suppliers
export function VistaSuppliers({ canDelete, canEdit, companyName, deleteSupplier, filteredSuppliers, selectedSuppliers, setEditingSupplier, setSelectedSuppliers, setShowAddSupplier, setSupplierSearch, supplierSearch, suppliers }) {
  return (
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
  );
}

// Pantalla: purchases
export function VistaPurchases({ canDelete, canEdit, deletePurchase, filteredPurchases, openPurchaseDetail, products, purchaseSearch, purchaseSupplierFilter, purchases, setPurchaseSearch, setPurchaseSupplierFilter, setShowAddPurchase, suppliers }) {
  return (
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
  );
}

// Pantalla: purchaseOrders
export function VistaPurchaseOrders({ canDelete, canEdit, deletePurchaseOrder, products, purchaseOrderItems, purchaseOrders, setPurchaseOrderDetail, setReceiptFromOrder, setShowAddPurchaseOrder, setShowAddReceipt, suppliers }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>{purchaseOrders.length} pedido{purchaseOrders.length !== 1 ? "s" : ""} a proveedores</div>
                <button onClick={() => setShowAddPurchaseOrder(true)} disabled={products.length === 0 || suppliers.length === 0 || !canEdit("purchaseOrders")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.amber, color: "#1A1500" }}>
                  <Plus size={14} /> Nuevo pedido
                </button>
              </div>
              {(products.length === 0 || suppliers.length === 0) && <div className="text-sm mb-3" style={{ color: C.muted }}>Agrega al menos un producto y un proveedor antes de crear un pedido.</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {purchaseOrders.map((po) => {
                  const cfg = PURCHASE_ORDER_STATUS_CFG[po.status] || PURCHASE_ORDER_STATUS_CFG.pendiente;
                  const sup = suppliers.find((s) => s.id === po.supplier_id);
                  const poItems = purchaseOrderItems.filter((it) => it.purchase_order_id === po.id);
                  const total = poItems.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_cost), 0);
                  return (
                    <div key={po.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{sup?.name || "—"}</div>
                          <div className="text-xs truncate" style={{ color: C.muted }}>{po.order_number}</div>
                        </div>
                        <Pill label={cfg.label} color={cfg.color} />
                      </div>
                      <div className="text-xs mt-1" style={{ color: C.muted }}>{poItems.length} producto{poItems.length !== 1 ? "s" : ""}{po.expected_date ? ` · Llega: ${fmtDate(po.expected_date)}` : ""}</div>
                      <div className="flex items-center justify-between pt-2 mt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted }}>{fmtDate(po.order_date)}</span>
                        <span className="font-mono font-semibold">{fmtMoney(total)}</span>
                      </div>
                      <div className="flex items-center justify-end gap-3 mt-2">
                        {(po.status === "pendiente" || po.status === "parcial") && canEdit("deliveryNotes") && (
                          <button onClick={() => { setReceiptFromOrder(po); setShowAddReceipt(true); }} className="flex items-center gap-1 text-xs" style={{ color: C.green }}><Truck size={13} /> Recibir</button>
                        )}
                        <button onClick={() => setPurchaseOrderDetail(po)} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}><FileText size={13} /> Detalle</button>
                        {canDelete("purchaseOrders") && <button onClick={() => deletePurchaseOrder(po)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                      </div>
                    </div>
                  );
                })}
                {purchaseOrders.length === 0 && (
                  <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>
                    Todavía no hay pedidos a proveedores registrados.
                  </div>
                )}
              </div>
            </div>
  );
}

// Pantalla: deliveryNotes
export function VistaDeliveryNotes({ canDelete, canEdit, deleteGoodsReceipt, goodsReceiptItems, goodsReceipts, products, purchaseOrders, purchases, setPrefillReceiptId, setReceiptDetail, setReceiptFromOrder, setShowAddPurchase, setShowAddReceipt, suppliers }) {
  return (
          <div>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm" style={{ color: C.muted }}>{goodsReceipts.length} nota{goodsReceipts.length !== 1 ? "s" : ""} de entrega</div>
                <button onClick={() => { setReceiptFromOrder(null); setShowAddReceipt(true); }} disabled={products.length === 0 || suppliers.length === 0 || !canEdit("deliveryNotes")} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: C.green, color: "#0B1F13" }}>
                  <Plus size={14} /> Nueva nota de entrega
                </button>
              </div>
              {(products.length === 0 || suppliers.length === 0) && <div className="text-sm mb-3" style={{ color: C.muted }}>Agrega al menos un producto y un proveedor antes de registrar una recepción.</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {goodsReceipts.map((gr) => {
                  const sup = suppliers.find((s) => s.id === gr.supplier_id);
                  const grItems = goodsReceiptItems.filter((it) => it.goods_receipt_id === gr.id);
                  const total = grItems.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_cost), 0);
                  const relatedPo = purchaseOrders.find((po) => po.id === gr.purchase_order_id);
                  const invoiced = purchases.some((p) => p.goods_receipt_id === gr.id);
                  return (
                    <div key={gr.id} className="p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{sup?.name || "—"}</div>
                          <div className="text-xs truncate" style={{ color: C.muted }}>{gr.receipt_number}{relatedPo ? ` · Pedido ${relatedPo.order_number}` : ""}</div>
                        </div>
                        <Pill label={invoiced ? "Facturada" : "Sin facturar"} color={invoiced ? C.green : C.amber} />
                      </div>
                      <div className="text-xs mt-1" style={{ color: C.muted }}>{grItems.length} producto{grItems.length !== 1 ? "s" : ""}</div>
                      <div className="flex items-center justify-between pt-2 mt-2 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
                        <span style={{ color: C.muted }}>{fmtDate(gr.receipt_date)}</span>
                        <span className="font-mono font-semibold">{fmtMoney(total)}</span>
                      </div>
                      <div className="flex items-center justify-end gap-3 mt-2">
                        {!invoiced && canEdit("purchases") && (
                          <button onClick={() => { setPrefillReceiptId(gr.id); setShowAddPurchase(true); }} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}><ClipboardList size={13} /> Facturar</button>
                        )}
                        <button onClick={() => setReceiptDetail(gr)} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}><FileText size={13} /> Detalle</button>
                        {!invoiced && canDelete("deliveryNotes") && <button onClick={() => deleteGoodsReceipt(gr)} style={iconBtnStyle}><Trash2 size={14} /></button>}
                      </div>
                    </div>
                  );
                })}
                {goodsReceipts.length === 0 && (
                  <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>
                    Todavía no hay notas de entrega registradas.
                  </div>
                )}
              </div>
            </div>
  );
}

// Pantalla: otherExpenses
export function VistaOtherExpenses({ canDelete, canEdit, deleteExpense, otherExpenses, setEditingExpense, setShowAddExpense, suppliers }) {
  return (
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
                    {ex.ncf && <div className="text-xs mt-1" style={{ color: C.muted }}>NCF <span className="font-mono" style={{ color: C.text }}>{ex.ncf}</span>{Number(ex.itbis_amount) > 0 && <> · ITBIS {fmtMoney(ex.itbis_amount)}</>} · <span style={{ color: C.green }}>va al 606</span></div>}
                    <div className="pt-2 mt-2 text-right font-mono font-semibold" style={{ borderTop: `1px solid ${C.border}` }}>{fmtMoney(ex.amount)}</div>
                  </div>
                ))}
                {otherExpenses.length === 0 && <div className="col-span-full px-4 py-8 text-center text-sm" style={{ color: C.muted, background: C.panel, border: `1px solid ${C.border}` }}>Todavía no hay gastos registrados.</div>}
              </div>
            </div>
  );
}

// Pantalla: supplierReceipts
export function VistaSupplierReceipts({ allPurchasePayments, purchases, suppliers }) {
  return (
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
  );
}

// Pantalla: purchaseLedger
export function VistaPurchaseLedger({ openPurchaseDetail, purchases, suppliers }) {
  return (
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
  );
}

// Pantalla: payables
export function VistaPayables({ openPurchaseDetail, purchases, suppliers }) {
  return (
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
  );
}
