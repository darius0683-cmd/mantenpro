// Modo sin conexión del técnico.
//
// Qué hace:
// 1) Guarda en el teléfono (IndexedDB) una copia de lo que el técnico necesita para trabajar:
//    sus órdenes, equipos, sucursales, checklist, materiales y la llegada/salida de cada orden.
//    Si abre la app sin señal, trabaja con esa copia.
// 2) Lo que hace sin señal (Llegué / Terminé, checklist, fotos, firma, nota, cerrar la orden,
//    materiales) queda en una "cola" en el teléfono, en el mismo orden en que lo hizo.
// 3) Cuando vuelve la señal, la cola se envía sola, cambio por cambio. Si alguno lo rechaza el
//    servidor (por ejemplo: no había existencia de un material), queda marcado con el motivo para
//    que el técnico lo vea; los demás siguen.
//
// Cada cambio lleva su propia identificación, así que si se corta la señal a mitad de un envío
// y se vuelve a mandar, no queda repetido (ver modo-sin-internet.sql).
import React, { useEffect, useState } from "react";
import { AlertTriangle, CloudOff, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { C, Modal } from "./base.jsx";

// ---------------------------------------------------------------------------------------------
// Almacenamiento en el teléfono (IndexedDB)
// ---------------------------------------------------------------------------------------------
const DB_NAME = "mantenpro-offline";
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Este navegador no permite guardar datos para usar sin conexión.")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

async function idb(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const kvGet = (key) => idb("kv", "readonly", (s) => s.get(key)).catch(() => undefined);
const kvSet = (key, value) => idb("kv", "readwrite", (s) => s.put(value, key)).catch(() => undefined);
const kvDel = (key) => idb("kv", "readwrite", (s) => s.delete(key)).catch(() => undefined);

async function blobPut(key, blob) {
  const buf = await blob.arrayBuffer();
  await idb("blobs", "readwrite", (s) => s.put({ buf, type: blob.type || "application/octet-stream" }, key));
}
async function blobGet(key) {
  const row = await idb("blobs", "readonly", (s) => s.get(key)).catch(() => undefined);
  return row ? new Blob([row.buf], { type: row.type }) : null;
}
const blobDel = (key) => idb("blobs", "readwrite", (s) => s.delete(key)).catch(() => undefined);

const opsAll = () => idb("outbox", "readonly", (s) => s.getAll()).catch(() => []);
const opPut = (op) => idb("outbox", "readwrite", (s) => s.put(op));
const opAdd = (op) => idb("outbox", "readwrite", (s) => s.add(op));
const opDel = (seq) => idb("outbox", "readwrite", (s) => s.delete(seq));

export const newId = () => (crypto.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

// ---------------------------------------------------------------------------------------------
// Estado de conexión y de la cola (lo usa la barra de arriba)
// ---------------------------------------------------------------------------------------------
let currentUser = null;
let netDown = false; // la red dijo "sin conexión" aunque el teléfono crea que tiene señal
let state = { online: typeof navigator === "undefined" ? true : navigator.onLine, pending: 0, failed: [], syncing: false, needsLogin: false };
const listeners = new Set();
const syncedListeners = new Set();
const setState = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn(state)); };

export const isOnline = () => navigator.onLine && !netDown;
function markDown() { if (!netDown) { netDown = true; setState({ online: false }); } }
function markUp() { if (netDown || !state.online) { netDown = false; setState({ online: navigator.onLine }); } }

export function isNetworkError(e) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = `${e?.name || ""} ${e?.message || e || ""} ${e?.details || ""}`;
  return /Failed to fetch|NetworkError|Load failed|network ?error|fetch failed|ERR_INTERNET|ERR_NETWORK|Internet connection|sin respuesta de la red|AuthRetryableFetchError|FunctionsFetchError/i.test(msg);
}

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error("sin respuesta de la red")), ms); }),
  ]).finally(() => clearTimeout(t));
}

async function refreshCounts() {
  if (!currentUser) { setState({ pending: 0, failed: [] }); return; }
  const ops = (await opsAll()).filter((o) => o.userId === currentUser);
  setState({ pending: ops.filter((o) => o.status !== "failed").length, failed: ops.filter((o) => o.status === "failed") });
}

export function useOfflineState() {
  const [s, setS] = useState(state);
  useEffect(() => { listeners.add(setS); setS(state); return () => { listeners.delete(setS); }; }, []);
  return s;
}

// Avisa cuando la cola terminó de enviar algo (la app recarga los datos del servidor).
export function onSynced(fn) { syncedListeners.add(fn); return () => syncedListeners.delete(fn); }

// ---------------------------------------------------------------------------------------------
// Copia de datos del técnico
// ---------------------------------------------------------------------------------------------
export const saveProfileCache = (userId, value) => kvSet(`profile:${userId}`, { ...value, savedAt: new Date().toISOString() });
export const loadProfileCache = (userId) => kvGet(`profile:${userId}`);
export const saveDataSnapshot = (userId, data) => kvSet(`data:${userId}`, { data, savedAt: new Date().toISOString() });
export const loadDataSnapshot = (userId) => kvGet(`data:${userId}`);

// Detalle de cada orden: { [orderId]: { attachments, checklist, materials, visits } }
let detailsCache = null;
let detailsUser = null;
let detailsSaveTimer = null;
async function ensureDetails() {
  if (detailsCache && detailsUser === currentUser) return detailsCache;
  detailsUser = currentUser;
  detailsCache = (currentUser && (await kvGet(`details:${currentUser}`))) || {};
  return detailsCache;
}
function persistDetails() {
  clearTimeout(detailsSaveTimer);
  const user = detailsUser, snap = detailsCache;
  detailsSaveTimer = setTimeout(() => { if (user) kvSet(`details:${user}`, snap); }, 300);
}
export async function getOrderDetails(orderId) {
  const all = await ensureDetails();
  return all[orderId] || null;
}
export async function patchOrderDetails(orderId, fn) {
  const all = await ensureDetails();
  const cur = all[orderId] || { attachments: [], checklist: [], materials: [], visits: [] };
  all[orderId] = fn({ ...cur });
  persistDetails();
}

// Baja el detalle (fotos, checklist, materiales, visitas) de las órdenes abiertas del técnico,
// para poder abrirlas sin señal.
export async function prefetchOrderDetails(orderIds) {
  if (!currentUser || !orderIds.length || !isOnline()) return;
  const chunks = [];
  for (let i = 0; i < orderIds.length; i += 150) chunks.push(orderIds.slice(i, i + 150));
  const out = {};
  orderIds.forEach((id) => { out[id] = { attachments: [], checklist: [], materials: [], visits: [] }; });
  try {
    for (const ids of chunks) {
      const [att, ck, mat, vis] = await Promise.all([
        supabase.from("work_order_attachments").select("*").in("work_order_id", ids).order("uploaded_at"),
        supabase.from("work_order_checklist_items").select("*").in("work_order_id", ids).order("position"),
        supabase.from("work_order_materials").select("*").in("work_order_id", ids).order("created_at"),
        supabase.from("work_order_visits").select("*").in("work_order_id", ids).order("check_in_at"),
      ]);
      if (att.error || ck.error) return; // sin red o sin permiso: se queda la copia anterior
      (att.data || []).forEach((r) => out[r.work_order_id]?.attachments.push(r));
      (ck.data || []).forEach((r) => out[r.work_order_id]?.checklist.push(r));
      if (!mat.error) (mat.data || []).forEach((r) => out[r.work_order_id]?.materials.push(r));
      if (!vis.error) (vis.data || []).forEach((r) => out[r.work_order_id]?.visits.push(r));
    }
  } catch { return; }
  const all = await ensureDetails();
  // Las órdenes con cambios todavía en la cola se dejan como están en el teléfono (lo del
  // servidor todavía no los tiene); se actualizan después de enviarse.
  const ops = (await opsAll()).filter((o) => o.userId === currentUser);
  const withPending = new Set(ops.map((o) => o.orderId));
  for (const id of Object.keys(out)) {
    if (withPending.has(id) && all[id]) continue;
    all[id] = out[id];
  }
  // Se quitan las órdenes que ya no están abiertas para no llenar el teléfono
  Object.keys(all).forEach((id) => { if (!out[id] && !withPending.has(id)) delete all[id]; });
  persistDetails();
}

// ¿Esta orden tiene cambios hechos sin señal que todavía no llegan al servidor?
// Mientras sea así, la app la muestra desde la copia del teléfono.
export async function hasPendingFor(orderId) {
  if (!currentUser) return false;
  return (await opsAll()).some((o) => o.userId === currentUser && o.orderId === orderId);
}

// Visita abierta del técnico en cualquier orden (para no dejar marcar dos llegadas sin señal)
export async function findMyOpenVisit(techId) {
  const all = await ensureDetails();
  for (const [orderId, d] of Object.entries(all)) {
    const v = (d.visits || []).find((x) => x.technician_id === techId && !x.check_out_at);
    if (v) return { orderId, visit: v };
  }
  return null;
}

// Foto o firma que todavía está en el teléfono
export async function localBlobUrl(key) {
  const b = await blobGet(key);
  return b ? URL.createObjectURL(b) : null;
}

// ---------------------------------------------------------------------------------------------
// Sesión guardada (para abrir la app sin señal aunque el permiso de Supabase haya vencido)
// ---------------------------------------------------------------------------------------------
export function findStoredAuthUser() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!/^sb-.*-auth-token$/.test(k)) continue;
      const v = JSON.parse(localStorage.getItem(k) || "null");
      if (!v?.refresh_token) continue;
      let user = v.user;
      if (!user?.id) user = JSON.parse(localStorage.getItem(`${k}-user`) || "null")?.user;
      if (user?.id) return { id: user.id, email: user.email || "" };
    }
  } catch { /* sin almacenamiento */ }
  return null;
}

export function setOfflineUser(userId) {
  currentUser = userId || null;
  if (detailsUser !== currentUser) { detailsCache = null; }
  refreshCounts();
}

// Borra la sesión guardada de Supabase en el teléfono. supabase.auth.signOut() no la borra si no
// hay señal y el permiso ya venció: al volver la señal se renovaría y entraría el usuario anterior.
export function clearStoredAuth() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^sb-.*-auth-token(-user|-code-verifier)?$/.test(k)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* sin almacenamiento */ }
}

// Al cerrar sesión: se borra la copia de datos (no la cola: se envía cuando vuelva a entrar).
export async function clearUserCopy(userId) {
  if (!userId) return;
  await kvDel(`data:${userId}`);
  await kvDel(`details:${userId}`);
  await kvDel(`profile:${userId}`);
  if (detailsUser === userId) detailsCache = null;
}

// ---------------------------------------------------------------------------------------------
// Los cambios: cómo se envía cada uno al servidor
// ---------------------------------------------------------------------------------------------
async function uploadSigned(path, blob, contentType) {
  const { error: upError } = await supabase.storage.from("evidence").upload(path, blob, { contentType, upsert: true });
  if (upError) throw upError;
  const { data: signed, error: signError } = await supabase.storage.from("evidence").createSignedUrl(path, 604800);
  if (signError) throw signError;
  return signed.signedUrl;
}

// op.status existe solo si el cambio salió de la cola (se hizo sin señal)
const fromQueue = (op) => !!op.status;

const EXEC = {
  async visit(op) {
    const p = op.payload;
    const { data, error } = await supabase.rpc(p.kind === "in" ? "visit_check_in" : "visit_check_out", {
      p_order: op.orderId, p_lat: p.lat ?? null, p_lng: p.lng ?? null, p_accuracy: p.accuracy ?? null,
      // Con señal manda la hora el servidor; la del teléfono solo se usa para lo hecho sin señal
      p_at: fromQueue(op) ? p.at : null, p_client_ref: p.ref,
    });
    if (error) throw error;
    return data;
  },
  async checklist_load(op) {
    const { data, error } = await supabase.from("work_order_checklist_items").upsert(op.payload.rows, { onConflict: "id", ignoreDuplicates: true }).select();
    if (error) throw error;
    return data;
  },
  async checklist_update(op) {
    const { data, error } = await supabase.from("work_order_checklist_items").update(op.payload.fields).eq("id", op.payload.itemId).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Ese punto del checklist ya no existe en la orden (o no tienes permiso para cambiarlo).");
    return true;
  },
  async order_update(op) {
    let q = supabase.from("work_orders").update(op.payload.fields).eq("id", op.orderId);
    // Lo hecho sin señal no reabre una orden que alguien ya cerró mientras tanto
    const reopening = op.payload.fields.reopened_count != null;
    if (fromQueue(op) && op.payload.fields.status !== "completada" && !reopening) q = q.neq("status", "completada");
    const { data, error } = await q.select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(fromQueue(op) ? "La orden ya estaba completada en el sistema (o no tienes permiso); este cambio no se aplicó." : "No se pudo guardar la orden (sin permiso o ya no existe).");
    }
    return data[0];
  },
  async signature(op) {
    const p = op.payload;
    const blob = p.blob || (await blobGet(p.blobKey));
    if (!blob) throw new Error("La firma ya no está en el teléfono.");
    const url = await uploadSigned(p.path, blob, "image/png");
    const { data, error } = await supabase.from("work_orders").update({
      client_signature_url: url, client_signature_path: p.path, client_signature_name: p.name, client_signature_at: p.at,
    }).eq("id", op.orderId).select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("No se pudo guardar la firma en la orden (sin permiso o ya no existe).");
    return data[0];
  },
  async photo(op) {
    const p = op.payload;
    // Si ya se había guardado (se cortó la señal justo después), no se repite
    const { data: existing } = await supabase.from("work_order_attachments").select("*").eq("work_order_id", op.orderId).eq("file_path", p.path).limit(1);
    if (existing && existing.length) return existing[0];
    const blob = p.blob || (await blobGet(p.blobKey));
    if (!blob) throw new Error("La foto ya no está en el teléfono.");
    const url = await uploadSigned(p.path, blob, blob.type || undefined);
    const { data, error } = await supabase.rpc("add_order_attachment", { p_order: op.orderId, p_file_url: url, p_file_path: p.path, p_file_name: p.name, p_stage: p.stage });
    if (error) throw error;
    return data;
  },
  async material_add(op) {
    const { data, error } = await supabase.from("work_order_materials").insert(op.payload.row).select().single();
    if (error) {
      if (error.code === "23505") return { ...op.payload.row }; // ya se había guardado
      throw error;
    }
    return data;
  },
};
// Fotos y firmas pueden tardar con señal mala: más tiempo antes de darlas por "sin red"
const opTimeout = (op) => (op.type === "photo" || op.type === "signature" ? 120000 : 30000);

// ¿Hay sesión válida de Supabase? { userId } si sí; { netErr: true } si no se pudo saber por la red.
export async function checkSession(ms = 15000) {
  try {
    const { data, error } = await withTimeout(supabase.auth.getSession(), ms);
    if (data?.session) return { userId: data.session.user.id };
    if (error && isNetworkError(error)) return { netErr: true };
    if (!navigator.onLine) return { netErr: true };
    return {};
  } catch (e) {
    return { netErr: isNetworkError(e) || !navigator.onLine };
  }
}

// Sin permiso (sesión vencida o de otro usuario): no es culpa del cambio, se espera
function isAuthProblem(e) {
  const msg = `${e?.code || ""} ${e?.message || ""}`;
  return e?.status === 401 || /PGRST301|PGRST303|JWT|not authenticated|No autorizado/i.test(msg);
}

async function enqueue(op) {
  const toStore = { ...op, payload: { ...op.payload } };
  if (toStore.payload.blob) {
    const key = `blob:${newId()}`;
    await blobPut(key, toStore.payload.blob);
    toStore.payload.blobKey = key;
    delete toStore.payload.blob;
  }
  toStore.status = "pending";
  const seq = await opAdd(toStore);
  await refreshCounts();
  return { ...toStore, seq };
}

// Hace un cambio: si hay señal lo manda ya; si no (o si hay cambios anteriores esperando, para
// respetar el orden), lo guarda en la cola.
//   type: visit | checklist_load | checklist_update | order_update | signature | photo | material_add
//   label: texto para la lista de pendientes ("Llegada · OT-0012")
// Devuelve { data } si se guardó en el servidor, { queued: true, op } si quedó en la cola,
// o { error } si el servidor lo rechazó.
export async function perform(type, orderId, payload, label) {
  const op = { type, orderId, payload, label, userId: currentUser, createdAt: new Date().toISOString() };
  const canQueue = !!currentUser;
  if (canQueue && (!isOnline() || state.pending > 0 || flushing)) {
    try {
      const stored = await enqueue(op);
      if (isOnline()) flush();
      return { queued: true, op: stored };
    } catch (e) { return { error: e }; }
  }
  try {
    if (canQueue) {
      const sess = await checkSession();
      if (sess.netErr || !sess.userId) throw new Error("sin respuesta de la red");
      if (sess.userId !== currentUser) return { error: new Error("La sesión cambió. Vuelve a abrir la app.") };
    }
    const data = await withTimeout(EXEC[type](op), opTimeout(op));
    markUp();
    return { data };
  } catch (e) {
    if (canQueue && isNetworkError(e)) {
      markDown();
      try { const stored = await enqueue(op); return { queued: true, op: stored }; }
      catch (e2) { return { error: e2 }; }
    }
    return { error: e };
  }
}

let flushing = false;
async function flushInner() {
  let sent = 0;
  const user = currentUser;
  const sess = await checkSession();
  if (!sess.userId) {
    if (sess.netErr) { markDown(); return 0; }
    // Con señal pero sin sesión: hay que volver a entrar con el usuario para enviar
    setState({ needsLogin: true });
    return 0;
  }
  // Solo se envía lo de quien tiene la sesión abierta
  if (sess.userId !== user) return 0;
  setState({ needsLogin: false });
  const done = new Set();
  for (;;) {
    if (currentUser !== user) break;
    const ops = (await opsAll()).filter((o) => o.userId === user && o.status !== "failed" && !done.has(o.seq)).sort((a, b) => a.seq - b.seq);
    if (ops.length === 0) break;
    let stop = false;
    for (const op of ops) {
      if (currentUser !== user) { stop = true; break; }
      done.add(op.seq);
      try {
        await withTimeout(EXEC[op.type](op), opTimeout(op));
        await opDel(op.seq);
        if (op.payload?.blobKey) await blobDel(op.payload.blobKey);
        sent++;
        markUp();
      } catch (e) {
        if (isNetworkError(e)) { markDown(); stop = true; break; }
        if (isAuthProblem(e)) { stop = true; break; }
        // Solo se marca si sigue en la cola (otra pestaña pudo haberlo enviado ya)
        const still = (await opsAll()).some((o) => o.seq === op.seq);
        if (still) await opPut({ ...op, status: "failed", error: e?.message || String(e), failedAt: new Date().toISOString() });
        sent++;
      }
      await refreshCounts();
    }
    if (stop) break; // y los que se agregaron mientras tanto, en la próxima vuelta
  }
  return sent;
}

export async function flush() {
  if (flushing || !currentUser || !navigator.onLine) return;
  flushing = true;
  setState({ syncing: true });
  let sent = 0;
  try {
    // Una sola pestaña o ventana envía la cola a la vez
    if (navigator.locks?.request) {
      await navigator.locks.request("mantenpro-outbox", { ifAvailable: true }, async (lock) => { if (lock) sent = await flushInner(); });
    } else {
      sent = await flushInner();
    }
  } catch { /* se reintenta en la próxima vuelta */ } finally {
    flushing = false;
    await refreshCounts();
    setState({ syncing: false });
    if (sent > 0) syncedListeners.forEach((fn) => { try { fn(); } catch { /* nada */ } });
  }
}

export async function retryFailed(seq) {
  const op = (await opsAll()).find((o) => o.seq === seq);
  if (!op) return;
  // Vuelve a la cola con un número nuevo (al final)
  await opDel(seq);
  const { seq: _old, status: _s, error: _e, ...rest } = op;
  await opAdd({ ...rest, status: "pending" });
  await refreshCounts();
  flush();
}
export async function discardOp(seq) { return discardFailed(seq); }
export async function discardFailed(seq) {
  const op = (await opsAll()).find((o) => o.seq === seq);
  if (!op) return;
  await opDel(seq);
  if (op.payload?.blobKey) await blobDel(op.payload.blobKey);
  await refreshCounts();
  syncedListeners.forEach((fn) => { try { fn(); } catch { /* nada */ } });
}
export const listPendingOps = async () => (await opsAll()).filter((o) => o.userId === currentUser).sort((a, b) => a.seq - b.seq);

// Escucha la señal y reintenta cada 30 s mientras haya cambios esperando.
let started = false;
export function startOfflineSync() {
  if (started) return;
  started = true;
  window.addEventListener("online", () => { netDown = false; setState({ online: true }); flush(); });
  window.addEventListener("offline", () => setState({ online: false }));
  setInterval(() => {
    if (state.pending > 0 && navigator.onLine) flush();
    else if (netDown && navigator.onLine && state.pending === 0) {
      // Prueba si volvió la red
      checkSession().then((r) => { if (r.userId) markUp(); });
    }
  }, 30000);
  refreshCounts().then(() => flush());
}

// ---------------------------------------------------------------------------------------------
// Barra de estado (arriba de la pantalla)
// ---------------------------------------------------------------------------------------------
const OP_KIND = {
  visit: "Llegada / salida", checklist_load: "Checklist cargado", checklist_update: "Checklist",
  order_update: "Orden", signature: "Firma del cliente", photo: "Foto", material_add: "Material usado",
};
const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString("es-DO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export function OfflineBar({ snapshotAt }) {
  const s = useOfflineState();
  const [showList, setShowList] = useState(false);
  const [ops, setOps] = useState([]);
  useEffect(() => { if (showList) listPendingOps().then(setOps); }, [showList, s.pending, s.failed.length]);

  const offline = !s.online;
  if (!offline && s.pending === 0 && s.failed.length === 0 && !s.needsLogin) return null;

  let bg = C.panelAlt, color = C.text, Icon = UploadCloud, text = "";
  if (offline) {
    bg = C.orange + "22"; color = C.orange; Icon = CloudOff;
    text = `Sin conexión${snapshotAt ? ` · datos guardados el ${fmtWhen(snapshotAt)}` : ""}${s.pending ? ` · ${s.pending} cambio${s.pending !== 1 ? "s" : ""} por enviar` : " · lo que hagas se envía al volver la señal"}`;
  } else if (s.needsLogin && s.pending) {
    bg = C.redBg; color = C.red; Icon = AlertTriangle;
    text = `Tienes ${s.pending} cambio${s.pending !== 1 ? "s" : ""} por enviar. Cierra sesión y vuelve a entrar con tu usuario para enviarlos.`;
  } else if (s.pending) {
    Icon = s.syncing ? RefreshCw : UploadCloud; color = C.amber;
    text = s.syncing ? `Enviando ${s.pending} cambio${s.pending !== 1 ? "s" : ""} guardados sin señal…` : `${s.pending} cambio${s.pending !== 1 ? "s" : ""} por enviar`;
  }
  if (!text && s.failed.length) {
    bg = C.redBg; color = C.red; Icon = AlertTriangle;
    text = `${s.failed.length} cambio${s.failed.length !== 1 ? "s" : ""} hecho${s.failed.length !== 1 ? "s" : ""} sin señal no se pudo guardar. Toca para ver.`;
  } else if (s.failed.length) {
    text += ` · ${s.failed.length} con problema`;
  }

  return (
    <>
      <button onClick={() => setShowList(true)} className="w-full px-4 py-2 text-xs flex items-center gap-2 text-left" style={{ background: bg, color }}>
        <Icon size={14} className={s.syncing ? "animate-spin" : ""} />
        <span className="flex-1">{text}</span>
        {!offline && s.pending > 0 && !s.syncing && <span className="underline" onClick={(e) => { e.stopPropagation(); flush(); }}>Enviar ahora</span>}
      </button>
      {showList && (
        <Modal title="Cambios hechos sin señal" onClose={() => setShowList(false)}>
          <div className="text-xs mb-3" style={{ color: C.muted }}>
            Se envían solos, en el mismo orden, cuando el teléfono tiene señal. No borres los datos del navegador ni cierres sesión mientras haya cambios por enviar.
          </div>
          {ops.length === 0 && <div className="text-sm py-4 text-center" style={{ color: C.muted }}>No hay cambios pendientes.</div>}
          <div className="space-y-1.5">
            {ops.map((op) => (
              <div key={op.seq} className="px-3 py-2 text-xs" style={{ background: C.panelAlt, border: `1px solid ${op.status === "failed" ? C.red + "80" : C.border}` }}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ color: C.text }}><b>{OP_KIND[op.type] || op.type}</b>{op.label ? ` · ${op.label}` : ""}</div>
                  <div style={{ color: C.muted }}>{fmtWhen(op.createdAt)}</div>
                </div>
                {op.status === "failed" ? (
                  <div className="mt-1">
                    <div style={{ color: C.red }}>No se guardó: {op.error}</div>
                    <div className="flex gap-3 mt-1.5">
                      <button onClick={() => retryFailed(op.seq)} className="flex items-center gap-1" style={{ color: C.amber }}><RefreshCw size={12} /> Reintentar</button>
                      <button onClick={() => { if (window.confirm("¿Descartar este cambio? No se va a guardar.")) discardFailed(op.seq); }} className="flex items-center gap-1" style={{ color: C.muted }}><Trash2 size={12} /> Descartar</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-0.5" style={{ color: C.muted }}>Esperando señal</div>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4 gap-2">
            {s.online && s.pending > 0 && <button onClick={() => flush()} className="px-3 py-2 text-xs font-semibold flex items-center gap-1" style={{ background: C.amber, color: "#1A1500" }}><UploadCloud size={13} /> Enviar ahora</button>}
            <button onClick={() => setShowList(false)} className="px-3 py-2 text-xs" style={{ border: `1px solid ${C.border}`, color: C.text }}><X size={13} className="inline" /> Cerrar</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// Pantalla cuando no hay señal y este teléfono nunca guardó una copia
export function NoCopyScreen({ onRetry }) {
  return (
    <div className="w-full min-h-screen flex items-center justify-center" style={{ background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="max-w-sm text-center p-6">
        <CloudOff size={36} color={C.orange} className="mx-auto mb-3" />
        <div className="text-lg font-bold mb-2">Sin conexión</div>
        <div className="text-sm mb-5" style={{ color: C.muted }}>
          Para usar MantenPro sin internet, entra una vez con señal en este teléfono: la app guarda tus órdenes y después puedes trabajar aunque no tengas conexión.
        </div>
        <button onClick={onRetry} className="px-4 py-2 text-sm font-semibold" style={{ background: "#8FD14F", color: "#1A1500" }}>Reintentar</button>
      </div>
    </div>
  );
}

