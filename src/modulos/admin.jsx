// Administración y contabilidad: perfil de la empresa, cuentas bancarias, usuarios, invitaciones,
// catálogo de cuentas, tasas y exportación de datos. Se carga solo cuando se usa (ver lazy.jsx).

import React from "react";
import { useState } from "react";
import { ImageIcon, Plus, Pencil, Trash2, Copy, Download } from "lucide-react";
import { supabase } from "../supabaseClient";
import { ActivityHistorySection, C, Field, Modal, PermissionChecklist, Pill, ROLE_CFG, ROLE_DEFAULT_PERMISSIONS, fetchAllRows, iconBtnStyle, inputClass, inputStyle, loadXlsx, todayStrRD } from "./base.jsx";

export function CompanyProfileForm({ company, bankAccounts, onSave, onSaveBankAccount, onDeleteBankAccount, onSetDefaultBankAccount, saving }) {
  const [name, setName] = useState(company?.name || "");
  const [rnc, setRnc] = useState(company?.rnc || "");
  const [address, setAddress] = useState(company?.address || "");
  const [phone, setPhone] = useState(company?.phone || "");
  const [email, setEmail] = useState(company?.email || "");
  const [website, setWebsite] = useState(company?.website || "");
  const [acceptsUsd, setAcceptsUsd] = useState(!!company?.accepts_usd_payments);
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
      accepts_usd_payments: acceptsUsd,
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
        <label className="flex items-start gap-2 text-sm mt-2 p-3 cursor-pointer" style={{ color: C.text, background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <input type="checkbox" className="mt-0.5" checked={acceptsUsd} onChange={(e) => setAcceptsUsd(e.target.checked)} />
          <div>
            <div>Recibe cobros en dólares (US$)</div>
            <div className="text-xs" style={{ color: C.muted }}>Activa la opción de cobrar en US$ con tasa del día y diferencia cambiaria, y el fondo y conteo en dólares de la caja. Si tu empresa solo cobra en pesos, déjalo apagado.</div>
          </div>
        </label>
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

export function BankAccountsManager({ accounts, onSave, onDelete, onSetDefault, saving }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [accCurrency, setAccCurrency] = useState("DOP");
  const [makeDefault, setMakeDefault] = useState(accounts.length === 0);

  const openNew = () => {
    setEditingId(null); setBankName(""); setAccountType(""); setAccountNumber(""); setHolderName(""); setAccCurrency("DOP"); setMakeDefault(accounts.length === 0);
    setShowForm(true);
  };
  const openEdit = (acc) => {
    setEditingId(acc.id); setBankName(acc.bank_name || ""); setAccountType(acc.account_type || ""); setAccountNumber(acc.account_number || ""); setHolderName(acc.holder_name || ""); setAccCurrency(acc.currency || "DOP"); setMakeDefault(!!acc.is_default);
    setShowForm(true);
  };

  const submit = async () => {
    if (!bankName.trim() || !accountNumber.trim()) return;
    await onSave({
      bank_name: bankName.trim(), account_type: accountType.trim() || null, account_number: accountNumber.trim(),
      holder_name: holderName.trim() || null, is_default: makeDefault || accounts.length === 0,
      currency: accCurrency,
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
                {acc.currency === "USD" && <Pill label="US$" color={C.blue} />}
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
          <Field label="Moneda de la cuenta">
            <select className={inputClass} style={inputStyle} value={accCurrency} onChange={(e) => setAccCurrency(e.target.value)}>
              <option value="DOP">Pesos (RD$)</option>
              <option value="USD">Dólares (US$)</option>
            </select>
          </Field>
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

export function UserPermissionsModal({ user, branches, onClose, onSave, onUpdateBranch, onUpdateRole, onToggleActive, saving }) {
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

export const ACCOUNT_TYPES = ["Activo", "Pasivo", "Patrimonio", "Ingreso", "Gasto"];

export function AccountFormModal({ initial, onClose, onSave, saving }) {
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

export function TaxRateFormModal({ initial, onClose, onSave, saving }) {
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

export function InviteFormModal({ technicians, branches, saving, generatedLink, onClose, onSave, onCloseAfterLink }) {
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

// ---------------------------------------------------------------------------
// Exportar todos los datos de la empresa (permiso "dataExport").
// Descarga un Excel legible (una hoja por tipo de dato) y una copia técnica en JSON.
// Solo exporta lo que el usuario puede leer: el candado real es RLS, así que nadie
// puede sacar por aquí datos de otra empresa ni de una sección que la base le niega.
// Es solo de salida: a propósito NO existe "subir y restaurar" (ver resumen-sesion).
// ---------------------------------------------------------------------------
const EXPORT_GROUPS = [
  { group: "Empresa", tables: [
    ["companies", "Empresa"], ["branches", "Sucursales"], ["profiles", "Usuarios"], ["company_bank_accounts", "Cuentas bancarias"],
    ["ncf_sequences", "Secuencias NCF"], ["chart_of_accounts", "Catálogo de cuentas"], ["tax_rates", "Tasas impositivas"], ["card_acquirers", "Adquirentes de tarjeta"],
  ] },
  { group: "Ventas", tables: [
    ["clients", "Clientes"], ["quotes", "Cotizaciones"], ["quote_items", "Cotizaciones - renglones"],
    ["sales_orders", "Órdenes de venta"], ["sales_order_items", "Órdenes de venta - renglones"],
    ["invoices", "Facturas"], ["invoice_items", "Facturas - renglones"], ["invoice_payments", "Cobros"],
    ["invoice_payment_card_details", "Cobros - tarjeta"], ["invoice_payment_attachments", "Cobros - adjuntos"],
    ["credit_notes", "Notas de crédito"], ["credit_note_items", "Notas de crédito - renglones"],
    ["recurring_contracts", "Contratos recurrentes"], ["cash_sessions", "Caja"],
  ] },
  { group: "Compras", tables: [
    ["suppliers", "Proveedores"], ["purchase_orders", "Pedidos a proveedores"], ["purchase_order_items", "Pedidos - renglones"],
    ["goods_receipts", "Notas de entrega"], ["goods_receipt_items", "Notas de entrega - renglones"],
    ["purchases", "Facturas de proveedor"], ["purchase_items", "Facturas proveedor - renglones"], ["purchase_payments", "Pagos a proveedores"],
    ["other_expenses", "Otros gastos"], ["bank_transactions", "Movimientos bancarios"],
  ] },
  { group: "Inventario", tables: [
    ["products", "Productos y servicios"], ["product_components", "Componentes de kits"], ["product_stock", "Existencias por sucursal"],
    ["stock_movements", "Movimientos de inventario"], ["inventory_materials", "Almacén (materiales)"],
  ] },
  { group: "Técnico", tables: [
    ["technicians", "Técnicos"], ["locations", "Ubicaciones"], ["equipment", "Equipos"], ["client_assets", "Activos en garantía"],
    ["work_orders", "Órdenes de trabajo"], ["work_order_technicians", "Órdenes - técnicos"], ["work_order_materials", "Órdenes - materiales"],
    ["work_order_checklist_items", "Órdenes - checklist"], ["work_order_attachments", "Órdenes - adjuntos"],
    ["checklist_templates", "Checklists"], ["checklist_template_items", "Checklists - puntos"], ["incidents", "Incidentes"],
    ["projects", "Proyectos"], ["project_materials", "Proyectos - materiales"],
    ["tools", "Herramientas"], ["tool_lists", "Listados de herramientas"], ["tool_loans", "Préstamos de herramientas"],
  ] },
  { group: "Nómina", payroll: true, tables: [
    ["payroll_settings", "Nómina - configuración"], ["employees", "Empleados"], ["payroll_periods", "Nóminas"], ["payroll_lines", "Nóminas - renglones"],
    ["payroll_items", "Nóminas - novedades"], ["employee_loans", "Préstamos a empleados"], ["employee_loan_payments", "Préstamos - cuotas"],
    ["employee_vacations", "Vacaciones"],
  ] },
];
// Columnas que nunca salen en el archivo (credenciales o datos internos).
const EXPORT_HIDDEN_COLUMNS = { profiles: ["permissions"], companies: ["billing_note"] };

async function fetchTableForExport(table, companyId) {
  // La mayoría de las tablas tiene company_id e id; algunas no (renglones, configuración).
  // Se prueba de la variante más precisa a la más general; RLS limita lo que se ve en todas.
  const isMissingColumn = (err) => err && (err.code === "42703" || /column .* does not exist/i.test(err.message || ""));
  const build = (withCompany) => {
    let q = supabase.from(table).select("*");
    if (table === "companies") return q.eq("id", companyId);
    if (withCompany) q = q.eq("company_id", companyId);
    return q;
  };
  const pageNoOrder = async (withCompany) => {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build(withCompany).range(from, from + 999);
      if (error) return { data: null, error };
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return { data: all, error: null };
  };
  for (const attempt of [() => fetchAllRows(() => build(true)), () => fetchAllRows(() => build(false)), () => pageNoOrder(true), () => pageNoOrder(false)]) {
    const res = await attempt();
    if (!res.error) return res;
    if (!isMissingColumn(res.error)) return res;
  }
  return { data: null, error: { message: "no se pudo leer la tabla" } };
}

// Enlaces de descarga nuevos (7 días) para fotos, firmas y adjuntos guardados en Storage.
async function addFreshFileLinks(rows) {
  if (!rows.length) return rows;
  const pathCols = Object.keys(rows[0]).filter((k) => k.endsWith("_path"));
  if (pathCols.length === 0) return rows;
  const out = rows.map((r) => ({ ...r }));
  for (const col of pathCols) {
    const linkCol = col.replace(/_path$/, "_enlace_7_dias");
    const paths = [...new Set(out.map((r) => r[col]).filter(Boolean))];
    const urlByPath = {};
    for (let i = 0; i < paths.length; i += 100) {
      const { data } = await supabase.storage.from("evidence").createSignedUrls(paths.slice(i, i + 100), 604800);
      (data || []).forEach((s) => { if (!s.error && s.signedUrl) urlByPath[s.path] = s.signedUrl; });
    }
    out.forEach((r) => { r[linkCol] = r[col] ? urlByPath[r[col]] || "" : ""; });
  }
  return out;
}

const toExcelValue = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") v = JSON.stringify(v);
  if (typeof v === "string" && v.length > 32000) return v.slice(0, 32000) + " …(recortado; completo en el JSON)";
  return v;
};

export function ExportDataPanel({ companyId, companyName, canSeePayroll }) {
  const [includeLinks, setIncludeLinks] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState([]); // [{table, label, count, error}]
  const [done, setDone] = useState(null);

  const groups = EXPORT_GROUPS.filter((g) => !g.payroll || canSeePayroll);
  const totalTables = groups.reduce((s, g) => s + g.tables.length, 0);

  const run = async () => {
    setRunning(true);
    setProgress([]);
    setDone(null);
    const startedAt = new Date();
    const result = {};
    const log = [];
    for (const g of groups) {
      for (const [table, label] of g.tables) {
        const { data, error } = await fetchTableForExport(table, companyId);
        let rows = data || [];
        const hidden = EXPORT_HIDDEN_COLUMNS[table] || [];
        if (hidden.length) rows = rows.map((r) => { const c = { ...r }; hidden.forEach((h) => delete c[h]); return c; });
        if (includeLinks && rows.length) rows = await addFreshFileLinks(rows);
        result[table] = rows;
        const entry = { group: g.group, table, label, count: rows.length, error: error ? error.message : null };
        log.push(entry);
        setProgress((prev) => [...prev, entry]);
      }
    }
    const stamp = todayStrRD();
    const safeName = (companyName || "empresa").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "empresa";

    // Excel legible
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    const info = [
      { Campo: "Empresa", Valor: companyName || "" },
      { Campo: "Exportado", Valor: startedAt.toLocaleString("es-DO") },
      { Campo: "Contenido", Valor: "Una hoja por tipo de dato con todos sus registros. Solo incluye lo que tu usuario tiene permiso de ver." },
      { Campo: "Archivos", Valor: includeLinks ? "Las columnas *_enlace_7_dias descargan cada foto, firma o adjunto. Vencen en 7 días." : "No se incluyeron enlaces a los archivos." },
      { Campo: "Copia técnica", Valor: "El archivo .json que se descargó junto a este trae los mismos datos completos, sin recortes." },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), "Léeme");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(log.map((e) => ({ Área: e.group, Hoja: e.label, Tabla: e.table, Registros: e.count, Nota: e.error || "" }))), "Resumen");
    const usedNames = new Set(["Léeme", "Resumen"]);
    for (const e of log) {
      if (!result[e.table].length) continue;
      let name = e.label.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
      for (let i = 2; usedNames.has(name); i++) name = `${e.label.slice(0, 27)} (${i})`;
      usedNames.add(name);
      const rows = result[e.table].map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, toExcelValue(v)])));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
    }
    XLSX.writeFile(wb, `mantenpro-${safeName}-${stamp}.xlsx`);

    // Copia técnica completa
    const json = JSON.stringify({ formato: "mantenpro-export", version: 1, exportado_en: startedAt.toISOString(), empresa: { id: companyId, nombre: companyName }, tablas: result }, null, 1);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mantenpro-${safeName}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);

    setDone({ tables: log.length, rows: log.reduce((s, e) => s + e.count, 0), errors: log.filter((e) => e.error).length });
    setRunning(false);
  };

  return (
    <div className="max-w-3xl">
      <div className="p-5 mb-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="text-base font-semibold mb-1">Exportar todos los datos de la empresa</div>
        <div className="text-sm mb-3" style={{ color: C.muted }}>
          Descarga una copia de la información de {companyName || "tu empresa"}: ventas, compras, inventario, Departamento Técnico{canSeePayroll ? ", nómina" : ""} y configuración. Sirve para guardar tu propio respaldo o para llevarte tus datos.
        </div>
        <ul className="text-xs mb-3 space-y-1 list-disc pl-5" style={{ color: C.muted }}>
          <li><b style={{ color: C.text }}>Excel:</b> una hoja por tipo de dato, para abrir y revisar.</li>
          <li><b style={{ color: C.text }}>JSON:</b> copia técnica completa con los mismos datos, sin recortes.</li>
          <li>Solo incluye lo que tu usuario tiene permiso de ver.{!canSeePayroll ? " La nómina no se incluye porque no tienes permiso de Nómina." : ""}</li>
          <li>Es una copia de consulta: no se puede volver a subir para restaurar. Los respaldos automáticos del sistema son los que protegen contra pérdida de datos.</li>
        </ul>
        <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer" style={{ color: C.text }}>
          <input type="checkbox" checked={includeLinks} onChange={(e) => setIncludeLinks(e.target.checked)} disabled={running} />
          Incluir enlaces para descargar fotos, firmas y adjuntos (válidos 7 días)
        </label>
        <button onClick={run} disabled={running} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          <Download size={15} /> {running ? `Exportando... (${progress.length} de ${totalTables})` : "Exportar datos"}
        </button>
        {done && (
          <div className="text-sm mt-3" style={{ color: done.errors ? C.orange : C.green }}>
            Listo: {done.rows.toLocaleString("es-DO")} registros en {done.tables} tablas. Revisa tus descargas (un .xlsx y un .json).
            {done.errors > 0 && ` ${done.errors} tabla(s) no se pudieron leer: aparecen en la hoja «Resumen».`}
          </div>
        )}
      </div>
      {progress.length > 0 && (
        <div style={{ border: `1px solid ${C.border}` }}>
          {progress.map((e) => (
            <div key={e.table} className="flex justify-between px-3 py-1.5 text-xs" style={{ borderBottom: `1px solid ${C.border}` }}>
              <span><span style={{ color: C.muted }}>{e.group} · </span>{e.label}</span>
              <span className="font-mono" style={{ color: e.error ? C.red : C.muted }}>{e.error ? "no disponible" : e.count.toLocaleString("es-DO")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
