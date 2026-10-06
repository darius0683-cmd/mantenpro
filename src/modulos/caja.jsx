// Caja: PIN por cajero con bloqueo por inactividad, y reporte de cuadre imprimible.
// - CajaPinGate: envuelve la pantalla de Caja. Pide crear el PIN la primera vez; después pide el
//   PIN para entrar y se bloquea sola tras X minutos sin uso (lo define el admin).
// - CajaPinAdmin: el admin ve quién tiene PIN, lo restablece y define los minutos.
// - cashReportHtml: el reporte del turno (cobros por método y por cajero, notas de crédito y de
//   débito del turno, esperado contra declarado) para imprimir o guardar en PDF.
// El PIN se guarda cifrado en la base de datos (caja-notas.sql); aquí nunca se guarda.
// El desbloqueo vale también en el servidor: los cobros, la apertura y el cierre de caja se
// rechazan si el usuario no desbloqueó la caja con su PIN en los últimos X minutos de uso.
import React, { useEffect, useReducer, useRef, useState } from "react";
import { KeyRound, Lock, RefreshCw, ShieldCheck, Unlock } from "lucide-react";
import { supabase } from "../supabaseClient";
import { C, Field, fmtDate, fmtMoney, inputClass, inputStyle } from "./base.jsx";

// Estado del desbloqueo, compartido por toda la app (no solo la pantalla de Caja): mientras el
// cajero use la app, se le avisa al servidor (caja_touch, como mucho 1 vez por minuto) para que
// el desbloqueo siga vigente. Sin uso por X minutos, se bloquea aquí y en el servidor.
const unlock = { userId: null, lastActivity: 0, lastTouch: 0, mins: 10, timer: null, reason: "" };
const subscribers = new Set();
const notify = () => subscribers.forEach((f) => f());
let listening = false;
function listenActivity() {
  if (listening) return;
  listening = true;
  let last = 0;
  const onAct = () => { const n = Date.now(); if (n - last > 2000) { last = n; if (unlock.userId) unlock.lastActivity = n; } };
  ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"].forEach((ev) => window.addEventListener(ev, onAct, { passive: true }));
}
function localLock(reason) {
  unlock.userId = null; unlock.lastActivity = 0; unlock.reason = reason || "";
  if (unlock.timer) { clearInterval(unlock.timer); unlock.timer = null; }
  notify();
}
async function tick() {
  if (!unlock.userId) return;
  const now = Date.now();
  if (now - unlock.lastActivity > unlock.mins * 60000) { lockCaja("inactividad"); return; }
  if (unlock.lastActivity > unlock.lastTouch && now - unlock.lastTouch > 60000) {
    unlock.lastTouch = now;
    const { data, error } = await supabase.rpc("caja_touch");
    if (!error && data && data.unlocked === false) localLock("servidor");
  }
}
function startUnlocked(profileId, mins) {
  unlock.userId = profileId; unlock.mins = Number(mins) || 10; unlock.lastActivity = Date.now(); unlock.lastTouch = Date.now(); unlock.reason = "";
  listenActivity();
  if (!unlock.timer) unlock.timer = setInterval(tick, 10000);
  notify();
}
export const isCajaUnlocked = (profileId) => !!profileId && unlock.userId === profileId;
// Bloquea aquí y en el servidor
export async function lockCaja(reason) {
  localLock(reason);
  try { await supabase.rpc("caja_lock"); } catch { /* sin conexión: el servidor caduca solo */ }
}
// El servidor rechazó una operación porque la caja está bloqueada (o el usuario no tiene PIN)
export const isCajaPinError = (err) => /CAJA_(BLOQUEADA|SIN_PIN)/.test(err?.message || "");
export const cajaPinErrorText = (err) => String(err?.message || "").replace(/^CAJA_(BLOQUEADA|SIN_PIN):\s*/, "");
function useCajaLockState() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { subscribers.add(force); return () => { subscribers.delete(force); }; }, []);
}

const missingSql = (err) => /caja_pin_status|caja_verify_pin|caja_set_pin|function .* does not exist|schema cache/i.test(err?.message || "");

function PinInput({ value, onChange, autoFocus, placeholder, onEnter }) {
  return (
    <input
      type="password" inputMode="numeric" autoComplete="off" maxLength={8} autoFocus={autoFocus}
      value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
      onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
      placeholder={placeholder || "PIN"}
      className={`${inputClass} text-center tracking-[0.5em] text-lg`} style={inputStyle}
    />
  );
}

export function CajaPinGate({ profileId, children }) {
  const [status, setStatus] = useState(null); // { has_pin, lock_minutes, locked_until } | { skip: true }
  useCajaLockState();
  const unlocked = isCajaUnlocked(profileId);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [current, setCurrent] = useState("");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const minsRef = useRef(10);

  const loadStatus = async () => {
    const { data, error } = await supabase.rpc("caja_pin_status");
    if (error) { setStatus(missingSql(error) ? { skip: true } : { error: error.message }); return; }
    minsRef.current = Number(data?.lock_minutes) || 10;
    // Si el servidor dice que sigue desbloqueada (por ejemplo, se recargó la página), se continúa
    if (data?.unlocked_until && new Date(data.unlocked_until).getTime() > Date.now() && !isCajaUnlocked(profileId)) startUnlocked(profileId, minsRef.current);
    setStatus(data || {});
  };
  useEffect(() => { loadStatus(); listenActivity(); /* eslint-disable-next-line */ }, [profileId]);

  const lockMsg = !unlocked && unlock.reason === "inactividad" ? "La caja se bloqueó por inactividad." : !unlocked && unlock.reason === "servidor" ? "La caja se bloqueó. Pon tu PIN otra vez." : "";
  const doUnlock = () => { startUnlocked(profileId, minsRef.current); setPin(""); setPin2(""); setCurrent(""); setMsg(""); setChanging(false); };

  const verify = async () => {
    if (pin.length < 4) return;
    setBusy(true); setMsg("");
    const { data, error } = await supabase.rpc("caja_verify_pin", { p_pin: pin });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    if (data?.ok) doUnlock();
    else { setPin(""); setMsg(`${data?.error || "PIN incorrecto."}${data?.attempts_left ? ` Quedan ${data.attempts_left} intento${data.attempts_left !== 1 ? "s" : ""}.` : ""}`); }
  };
  const savePin = async () => {
    setMsg("");
    if (!/^[0-9]{4,8}$/.test(pin)) { setMsg("El PIN tiene que tener de 4 a 8 números."); return; }
    if (pin !== pin2) { setMsg("Los dos PIN no coinciden."); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("caja_set_pin", { p_current: changing ? current : null, p_new: pin });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    if (!data?.ok) { setMsg(data?.error || "No se pudo guardar el PIN."); return; }
    await loadStatus();
    doUnlock();
  };

  if (!status) return <div className="text-sm py-8 text-center" style={{ color: C.muted }}>Cargando caja…</div>;
  if (status.skip) return children; // todavía no se corrió el SQL del PIN
  if (status.error) return <div className="text-sm p-4" style={{ color: C.red }}>{status.error}</div>;

  const box = (title, Icon, body) => (
    <div className="max-w-sm mx-auto mt-6 p-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 font-semibold mb-1"><Icon size={18} color={C.amber} /> {title}</div>
      {body}
      {(msg || lockMsg) && <div className="text-xs mt-3" style={{ color: !msg ? C.orange : C.red }}>{msg || lockMsg}</div>}
    </div>
  );

  if (!status.has_pin || changing) {
    return box(changing ? "Cambiar mi PIN de caja" : "Crea tu PIN de caja", KeyRound, (
      <>
        <div className="text-xs mb-4" style={{ color: C.muted }}>
          {changing ? "Pon tu PIN actual y el nuevo." : "Cada cajero tiene su propio PIN. Se pide al entrar a Caja y cuando se bloquea por no usarla."} De 4 a 8 números.
        </div>
        {changing && <Field label="PIN actual"><PinInput value={current} onChange={setCurrent} autoFocus /></Field>}
        <Field label="PIN nuevo"><PinInput value={pin} onChange={setPin} autoFocus={!changing} /></Field>
        <Field label="Repite el PIN"><PinInput value={pin2} onChange={setPin2} onEnter={savePin} /></Field>
        <div className="flex gap-2 justify-end">
          {changing && <button onClick={() => { setChanging(false); setMsg(""); }} className="px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.muted }}>Cancelar</button>}
          <button onClick={savePin} disabled={busy} className="px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>{busy ? "Guardando…" : "Guardar PIN"}</button>
        </div>
      </>
    ));
  }

  if (!unlocked) {
    return box("Caja bloqueada", Lock, (
      <>
        <div className="text-xs mb-4" style={{ color: C.muted }}>Pon tu PIN de caja para entrar. Se bloquea sola después de {status.lock_minutes || 10} minutos sin uso.</div>
        <PinInput value={pin} onChange={setPin} autoFocus onEnter={verify} />
        <button onClick={verify} disabled={busy || pin.length < 4} className="w-full mt-3 px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
          <Unlock size={14} /> {busy ? "Revisando…" : "Desbloquear"}
        </button>
        <div className="text-[11px] mt-3" style={{ color: C.muted }}>¿Olvidaste tu PIN? Pídele al administrador que te lo restablezca.</div>
      </>
    ));
  }

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap mb-3 px-3 py-2 text-xs" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.muted }}>
        <ShieldCheck size={14} color={C.green} />
        <span className="flex-1">Caja desbloqueada · se bloquea sola tras {status.lock_minutes || 10} min sin uso</span>
        <button onClick={() => { setChanging(true); setMsg(""); setPin(""); setPin2(""); }} style={{ color: C.amber }}>Cambiar PIN</button>
        <button onClick={() => { lockCaja(); setMsg(""); }} className="flex items-center gap-1 font-semibold" style={{ color: C.text }}><Lock size={12} /> Bloquear ahora</button>
      </div>
      {children}
    </>
  );
}

// Ventana para poner el PIN cuando se intenta cobrar (o abrir/cerrar caja) con la caja bloqueada
export function CajaPinPrompt({ profileId, onUnlocked, onClose }) {
  const [st, setSt] = useState(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    supabase.rpc("caja_pin_status").then(({ data, error }) => setSt(error ? { error: error.message } : (data || {})));
  }, []);
  const verify = async () => {
    if (pin.length < 4) return;
    setBusy(true); setMsg("");
    const { data, error } = await supabase.rpc("caja_verify_pin", { p_pin: pin });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    if (!data?.ok) { setPin(""); setMsg(`${data?.error || "PIN incorrecto."}${data?.attempts_left ? ` Quedan ${data.attempts_left} intento${data.attempts_left !== 1 ? "s" : ""}.` : ""}`); return; }
    startUnlocked(profileId, st?.lock_minutes);
    onUnlocked();
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm p-6" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 font-semibold mb-1"><Lock size={18} color={C.amber} /> La caja está bloqueada</div>
        {!st ? <div className="text-xs py-3" style={{ color: C.muted }}>Cargando…</div> : st.error ? <div className="text-xs py-3" style={{ color: C.red }}>{st.error}</div> : !st.has_pin ? (
          <div className="text-sm py-3" style={{ color: C.text }}>Para cobrar necesitas tu PIN de caja. Entra a <b>Ventas → Caja</b> y créalo; después vuelve a intentar.</div>
        ) : (
          <>
            <div className="text-xs mb-4" style={{ color: C.muted }}>Pon tu PIN de caja para registrar este movimiento.</div>
            <PinInput value={pin} onChange={setPin} autoFocus onEnter={verify} />
            <button onClick={verify} disabled={busy || pin.length < 4} className="w-full mt-3 px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: C.amber, color: "#1A1500" }}>
              <Unlock size={14} /> {busy ? "Revisando…" : "Desbloquear y continuar"}
            </button>
          </>
        )}
        {msg && <div className="text-xs mt-3" style={{ color: C.red }}>{msg}</div>}
        <button onClick={onClose} className="w-full mt-3 px-4 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.muted }}>Cancelar</button>
      </div>
    </div>
  );
}

// Panel del administrador: PIN de cada cajero y minutos de inactividad
export function CajaPinAdmin({ profiles, isAdmin }) {
  const [rows, setRows] = useState(null);
  const [mins, setMins] = useState("");
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const load = async () => {
    setErr("");
    const [{ data, error }, st] = await Promise.all([supabase.rpc("caja_pin_list"), supabase.rpc("caja_pin_status")]);
    if (error) { setErr(missingSql(error) || /caja_pin_list/.test(error.message) ? "Falta correr caja-notas.sql en Supabase." : error.message); setRows([]); return; }
    setRows(data || []);
    if (st.data) setMins(String(st.data.lock_minutes || 10));
  };
  useEffect(() => { load(); }, []);
  const name = (id) => { const p = profiles.find((x) => x.id === id); return p ? (p.full_name || p.email || "Usuario") : "Usuario"; };
  const reset = async (id) => {
    if (!window.confirm(`¿Restablecer el PIN de caja de ${name(id)}? La próxima vez que entre a Caja tendrá que crear uno nuevo.`)) return;
    const { error } = await supabase.rpc("caja_reset_pin", { p_profile: id });
    if (error) { setErr(error.message); return; }
    load();
  };
  const saveMins = async () => {
    setErr(""); setOkMsg("");
    const { error } = await supabase.rpc("caja_set_lock_minutes", { p_minutes: Number(mins) });
    if (error) { setErr(error.message); return; }
    setOkMsg("Guardado. Aplica la próxima vez que cada cajero entre a Caja.");
  };
  const visible = (rows || []).filter((r) => { const p = profiles.find((x) => x.id === r.profile_id); return p && p.role !== "tecnico" && p.is_active !== false; });
  return (
    <div className="p-3 mb-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      {isAdmin && (
        <div className="flex items-end gap-2 mb-3 flex-wrap">
          <Field label="Bloquear la caja tras (minutos sin uso)">
            <input type="number" min="1" max="480" className={inputClass} style={{ ...inputStyle, maxWidth: 120 }} value={mins} onChange={(e) => setMins(e.target.value)} />
          </Field>
          <button onClick={saveMins} className="px-3 py-2 text-xs font-semibold mb-3" style={{ background: C.amber, color: "#1A1500" }}>Guardar</button>
        </div>
      )}
      {rows === null ? <div className="text-xs" style={{ color: C.muted }}>Cargando…</div> : (
        <div className="space-y-1">
          {visible.map((r) => (
            <div key={r.profile_id} className="flex items-center justify-between gap-2 text-sm px-2 py-1.5" style={{ background: C.panelAlt }}>
              <span className="truncate">{name(r.profile_id)}</span>
              <span className="flex items-center gap-3 text-xs flex-shrink-0">
                <span style={{ color: r.locked ? C.red : r.has_pin ? C.green : C.muted }}>{r.locked ? "bloqueado por intentos" : r.has_pin ? `con PIN${r.updated_at ? ` · ${fmtDate(String(r.updated_at).slice(0, 10))}` : ""}` : "sin PIN"}</span>
                {isAdmin && (r.has_pin || r.locked) && <button onClick={() => reset(r.profile_id)} className="flex items-center gap-1" style={{ color: C.amber }}><RefreshCw size={11} /> Restablecer</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      {err && <div className="text-xs mt-2" style={{ color: C.red }}>{err}</div>}
      {okMsg && <div className="text-xs mt-2" style={{ color: C.green }}>{okMsg}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reporte del turno de caja (imprimir / PDF)
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const timeRD = (iso) => (iso ? new Date(iso).toLocaleString("es-DO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Santo_Domingo" }) : "—");

// Notas (crédito / débito) hechas durante el turno en esa sucursal
export function notesInSession(notes, session, invoices) {
  const from = new Date(session.opened_at).getTime();
  const to = session.closed_at ? new Date(session.closed_at).getTime() : Date.now();
  return (notes || []).filter((n) => {
    const inv = invoices.find((i) => i.id === n.invoice_id);
    const branch = n.branch_id || inv?.branch_id;
    if (branch !== session.branch_id) return false; // sin sucursal conocida no se le asigna a ninguna caja
    const t = n.created_at ? new Date(n.created_at).getTime() : (n.note_date ? new Date(`${n.note_date}T12:00:00-04:00`).getTime() : 0);
    return t >= from && t <= to;
  });
}

export function cashReportHtml({ companyName, branchName, session, expected, payments, creditNotes, debitNotes, invoices, clients, profiles }) {
  const userName = (id) => { const p = (profiles || []).find((x) => x.id === id); return p ? (p.full_name || p.email) : "—"; };
  const invOf = (id) => invoices.find((i) => i.id === id);
  const clientOf = (id) => clients.find((c) => c.id === id)?.name || "—";
  const realRd = (p) => Number(p.amount || 0) + Number(p.fx_difference || 0);
  const methodOf = (p) => (p.method === "Efectivo" ? ((p.currency || "DOP") === "USD" ? "Efectivo US$" : "Efectivo") : p.method === "Tarjeta" ? "Tarjeta" : "Transferencia / otro");
  const closed = session.status === "cerrada";
  const exp = closed
    ? { cash: Number(session.expected_cash || 0), card: Number(session.expected_card || 0), transfer: Number(session.expected_transfer || 0), cashUsd: Number(session.expected_cash_usd || 0) }
    : expected || { cash: 0, card: 0, transfer: 0, cashUsd: 0 };
  const dec = closed ? { cash: Number(session.declared_cash || 0), card: Number(session.declared_card || 0), transfer: Number(session.declared_transfer || 0), cashUsd: Number(session.declared_cash_usd || 0) } : null;
  const row = (label, e, d, usd) => {
    const f = (n) => (usd ? `US$ ${Number(n).toFixed(2)}` : fmtMoney(n));
    const diff = d == null ? null : d - e;
    return `<tr><td>${label}</td><td style="text-align:right">${f(e)}</td><td style="text-align:right">${d == null ? "—" : f(d)}</td><td style="text-align:right;${diff && Math.abs(diff) > 0.009 ? `color:${diff > 0 ? "#1f6fb2" : "#c0392b"};font-weight:bold` : ""}">${diff == null ? "—" : (diff > 0 ? "+" : "") + f(diff)}</td></tr>`;
  };
  const showUsd = exp.cashUsd > 0 || (dec && dec.cashUsd > 0);
  const totalDiff = dec ? (dec.cash - exp.cash) + (dec.card - exp.card) + (dec.transfer - exp.transfer) : null;

  const byMethod = {};
  const byUser = {};
  (payments || []).forEach((p) => {
    const m = methodOf(p);
    const amt = m === "Efectivo US$" ? Number(p.amount || 0) : (p.method === "Efectivo" ? Number(p.amount || 0) : realRd(p));
    byMethod[m] = byMethod[m] || { n: 0, total: 0 }; byMethod[m].n++; byMethod[m].total += amt;
    const u = p.created_by || "_";
    byUser[u] = byUser[u] || { n: 0, total: 0 }; byUser[u].n++; byUser[u].total += amt;
  });
  const payRows = (payments || []).slice().sort((a, b) => String(a.created_at || a.payment_date).localeCompare(String(b.created_at || b.payment_date))).map((p) => {
    const inv = invOf(p.invoice_id);
    return `<tr><td>${p.created_at ? timeRD(p.created_at) : fmtDate(p.payment_date)}</td><td>${esc(p.receipt_number || "—")}</td><td>${esc(inv?.invoice_number || inv?.ncf || "Factura")}</td><td>${esc(clientOf(inv?.client_id))}</td><td>${esc(methodOf(p))}${p.currency === "USD" ? ` (US$ ${Number(p.foreign_amount || 0).toFixed(2)})` : ""}</td><td>${esc(p.created_by ? userName(p.created_by) : "—")}</td><td style="text-align:right">${fmtMoney(p.amount)}</td></tr>`;
  }).join("");
  const noteRows = (list) => list.map((n) => {
    const inv = invOf(n.invoice_id);
    return `<tr><td>${esc(n.ncf || "")}</td><td>${n.created_at ? timeRD(n.created_at) : fmtDate(n.note_date)}</td><td>${esc(inv?.invoice_number || inv?.ncf || "—")}</td><td>${esc(clientOf(n.client_id || inv?.client_id))}</td><td>${esc(n.reason || "")}</td><td>${esc(n.created_by ? userName(n.created_by) : "—")}</td><td style="text-align:right">${fmtMoney(n.total)}</td></tr>`;
  }).join("");
  const sum = (list) => list.reduce((a, n) => a + Number(n.total || 0), 0);
  const cn = creditNotes || [], dn = debitNotes || [];

  return `
    <div class="header-row"><div><h1>${esc(companyName)}</h1><div class="muted">Reporte de caja · ${esc(branchName)}</div></div>
    <div style="text-align:right"><b>${closed ? "Caja cerrada" : "Caja abierta (parcial)"}</b><div class="muted">Impreso ${timeRD(new Date().toISOString())}</div></div></div>
    <div class="muted">Apertura: ${timeRD(session.opened_at)}${session.opened_by ? ` por ${esc(userName(session.opened_by))}` : ""} · Fondo inicial ${fmtMoney(session.opening_amount)}${Number(session.opening_amount_usd || 0) > 0 ? ` + US$ ${Number(session.opening_amount_usd).toFixed(2)}` : ""}
    ${closed ? `<br/>Cierre: ${timeRD(session.closed_at)}${session.closed_by ? ` por ${esc(userName(session.closed_by))}` : ""}` : ""}</div>
    <table><thead><tr><th>Cuadre</th><th>Esperado</th><th>Declarado</th><th>Diferencia</th></tr></thead><tbody>
      ${row("Efectivo (incluye fondo)", exp.cash, dec?.cash)}
      ${showUsd ? row("Efectivo en dólares", exp.cashUsd, dec?.cashUsd, true) : ""}
      ${row("Tarjeta", exp.card, dec?.card)}
      ${row("Transferencia / otro", exp.transfer, dec?.transfer)}
      ${dec ? `<tr><td><b>Diferencia total (RD$)</b></td><td></td><td></td><td style="text-align:right"><b>${(totalDiff > 0 ? "+" : "") + fmtMoney(totalDiff)}</b></td></tr>` : ""}
    </tbody></table>
    ${session.notes ? `<div class="muted" style="margin-top:6px">Nota del cierre: ${esc(session.notes)}</div>` : ""}
    <div style="margin-top:16px;font-weight:bold">Cobros por método</div>
    <table><thead><tr><th>Método</th><th>Cobros</th><th>Total</th></tr></thead><tbody>
      ${Object.entries(byMethod).map(([m, t]) => `<tr><td>${esc(m)}</td><td>${t.n}</td><td style="text-align:right">${m === "Efectivo US$" ? fmtMoney(t.total) : fmtMoney(t.total)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">Sin cobros en este turno.</td></tr>`}
    </tbody></table>
    <div style="margin-top:16px;font-weight:bold">Cobros por cajero</div>
    <table><thead><tr><th>Cajero</th><th>Cobros</th><th>Total</th></tr></thead><tbody>
      ${Object.entries(byUser).map(([u, t]) => `<tr><td>${esc(u === "_" ? "Sin dato (cobros anteriores)" : userName(u))}</td><td>${t.n}</td><td style="text-align:right">${fmtMoney(t.total)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">Sin cobros.</td></tr>`}
    </tbody></table>
    <div style="margin-top:16px;font-weight:bold">Detalle de cobros</div>
    ${payRows ? `<table><thead><tr><th>Hora</th><th>Recibo</th><th>Factura</th><th>Cliente</th><th>Método</th><th>Cajero</th><th>Monto</th></tr></thead><tbody>${payRows}</tbody></table>` : `<div class="muted">Sin cobros en este turno.</div>`}
    <div style="margin-top:16px;font-weight:bold">Notas de crédito del turno (${cn.length}) · ${fmtMoney(sum(cn))}</div>
    ${cn.length ? `<table><thead><tr><th>NCF</th><th>Hora</th><th>Factura</th><th>Cliente</th><th>Motivo</th><th>Usuario</th><th>Total</th></tr></thead><tbody>${noteRows(cn)}</tbody></table>
      <div class="muted" style="margin-top:4px">Las notas de crédito no sacan dinero de la caja: rebajan lo que debe la factura o quedan como saldo a favor del cliente.</div>` : `<div class="muted">No se hicieron notas de crédito en este turno.</div>`}
    <div style="margin-top:16px;font-weight:bold">Notas de débito del turno (${dn.length}) · ${fmtMoney(sum(dn))}</div>
    ${dn.length ? `<table><thead><tr><th>NCF</th><th>Hora</th><th>Factura</th><th>Cliente</th><th>Motivo</th><th>Usuario</th><th>Total</th></tr></thead><tbody>${noteRows(dn)}</tbody></table>
      <div class="muted" style="margin-top:4px">Las notas de débito suben lo que debe la factura; se cobran como cualquier saldo.</div>` : `<div class="muted">No se hicieron notas de débito en este turno.</div>`}
    <table style="margin-top:48px;border:none"><tr>
      <td style="border:none;border-top:1px solid #333;text-align:center;width:45%">Cajero</td><td style="border:none;width:10%"></td>
      <td style="border:none;border-top:1px solid #333;text-align:center;width:45%">Supervisor</td></tr></table>
  `;
}
