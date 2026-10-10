// Código QR de equipos.
// - Etiquetas para imprimir y pegar en cada equipo (printEquipmentQrLabels).
// - Ficha rápida que se abre al escanear (EquipmentQrModal): datos, historial y botones
//   para abrir una orden o reportar una avería.
// - Lector dentro de la app (QrScannerModal): usa la cámara del celular. Funciona también
//   en iPhone, donde la app instalada no comparte la sesión con Safari.
//
// El QR guarda un enlace: https://app.manticrd.com/?eq=<id del equipo>. Abrirlo con la
// cámara normal del teléfono también funciona: la app lee "eq" al cargar y abre la ficha.
// Nadie de otra empresa puede ver el equipo: los datos siguen protegidos por RLS.
import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, ClipboardList, History, MapPin, Printer, QrCode, User, X } from "lucide-react";
import { APP_URL, C, fmtCapacity, INCIDENT_STATUS_CFG, Modal, Pill, STATUS_CFG, TYPE_CFG, fmtDate, todayStrRD } from "./base.jsx";

export const equipmentQrUrl = (id) => `${APP_URL}/?eq=${id}`;

// Saca el id del equipo de lo que leyó la cámara: el enlace completo o solo el id.
export function equipmentIdFromScan(text) {
  const raw = String(text || "").trim();
  try {
    const url = new URL(raw);
    const eq = url.searchParams.get("eq");
    if (eq) return eq;
  } catch { /* no es un enlace */ }
  return /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Abre la hoja de etiquetas (2 columnas × 5 filas en carta). La ventana se abre en el
// mismo clic, antes de generar los códigos, para que el navegador no la bloquee.
export async function printEquipmentQrLabels({ list, companyName, companyLogo, branchName, locationName }) {
  const win = window.open("", "_blank", "width=900,height=900");
  if (!win) { alert("Tu navegador bloqueó la ventana emergente. Permite las ventanas emergentes para poder imprimir."); return; }
  win.document.write("<p style='font-family:Arial;padding:20px'>Generando etiquetas…</p>");
  try {
    const QRCode = (await import("qrcode")).default;
    const svgs = await Promise.all(list.map((eq) => QRCode.toString(equipmentQrUrl(eq.id), { type: "svg", errorCorrectionLevel: "M", margin: 0 })));
    const labels = list.map((eq, i) => {
      const where = [locationName?.(eq.location_id), branchName?.(eq.branch_id)].filter(Boolean).join(" · ");
      const meta = [eq.brand, eq.model, fmtCapacity(eq)].filter(Boolean).join(" · ");
      return `<div class="label">
        <div class="qr">${svgs[i]}</div>
        <div class="txt">
          <div class="co">${companyLogo ? `<img src="${esc(companyLogo)}" alt="">` : ""}<span>${esc(companyName || "")}</span></div>
          <div class="name">${esc(eq.name)}</div>
          ${meta ? `<div class="meta">${esc(meta)}</div>` : ""}
          ${eq.serial_number ? `<div class="meta">S/N: ${esc(eq.serial_number)}</div>` : ""}
          ${where ? `<div class="meta">${esc(where)}</div>` : ""}
          <div class="hint">Escanea para ver el historial o reportar una avería</div>
        </div>
      </div>`;
    }).join("");
    win.document.open();
    win.document.write(`<html><head><title>Etiquetas QR de equipos</title><style>
      @page { size: letter; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
      .sheet { display: grid; grid-template-columns: repeat(2, 95mm); gap: 4mm 6mm; justify-content: center; }
      .label { height: 48mm; border: 1px dashed #999; border-radius: 3mm; padding: 4mm; display: flex; gap: 4mm; align-items: center; page-break-inside: avoid; break-inside: avoid; }
      .qr { width: 36mm; height: 36mm; flex-shrink: 0; }
      .qr svg { width: 100%; height: 100%; display: block; }
      .txt { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1mm; }
      .co { display: flex; align-items: center; gap: 2mm; font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: .04em; }
      .co img { max-height: 6mm; max-width: 18mm; object-fit: contain; }
      .name { font-size: 14px; font-weight: bold; line-height: 1.15; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .meta { font-size: 10px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .hint { font-size: 8.5px; color: #666; margin-top: 1mm; }
      .top { font-size: 12px; color: #666; margin: 0 0 4mm; text-align: center; }
      @media print { .top { display: none; } }
    </style></head><body>
      <p class="top">${list.length} etiqueta${list.length !== 1 ? "s" : ""}. Recorta por la línea punteada o imprime en papel adhesivo. Para que dure en exteriores o cuartos de máquinas, cúbrela con cinta transparente.</p>
      <div class="sheet">${labels}</div>
      <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
    </body></html>`);
    win.document.close();
    win.focus();
  } catch (err) {
    win.document.body.innerHTML = `<p style="font-family:Arial;padding:20px;color:#b00">No se pudieron generar las etiquetas: ${esc(err.message)}</p>`;
  }
}

const OPEN_INCIDENT = ["abierto", "en_revision"];

// Ficha que se abre al escanear el QR de un equipo.
export function EquipmentQrModal({ equipment, orders, incidents, branchName, locationName, techName, companyName, companyLogo, canCreateOrder, canReportIncident, onNewOrder, onReportIncident, onShowHistory, onClose }) {
  if (!equipment) {
    return (
      <Modal title="Equipo no encontrado" onClose={onClose}>
        <div className="text-sm" style={{ color: C.muted }}>
          Este código QR no corresponde a ningún equipo de tu empresa. Puede que el equipo se haya eliminado o que la etiqueta sea de otra empresa.
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Cerrar</button>
        </div>
      </Modal>
    );
  }
  const eqOrders = orders.filter((o) => o.equipment_id === equipment.id).sort((a, b) => String(b.scheduled || "").localeCompare(String(a.scheduled || "")));
  const openOrders = eqOrders.filter((o) => o.status !== "completada");
  const lastDone = eqOrders.find((o) => o.status === "completada");
  const openIncidents = incidents.filter((i) => i.equipment_id === equipment.id && OPEN_INCIDENT.includes(i.status));
  const out = equipment.operational_status === "fuera_servicio";
  const next = equipment.next_maintenance_date;
  const overdue = next && next < todayStrRD();
  const where = [locationName(equipment.location_id), branchName(equipment.branch_id)].filter(Boolean).join(" · ");
  const recent = eqOrders.slice(0, 6);

  return (
    <Modal title={equipment.name} onClose={onClose} wide>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {equipment.type && <span className="text-xs" style={{ color: C.muted }}>{equipment.type}</span>}
        <Pill label={out ? "Fuera de servicio" : "Operativo"} color={out ? C.red : C.green} />
        {openOrders.length > 0 && <Pill label={`${openOrders.length} orden${openOrders.length !== 1 ? "es" : ""} abierta${openOrders.length !== 1 ? "s" : ""}`} color={C.amber} />}
        {openIncidents.length > 0 && <Pill label={`${openIncidents.length} avería${openIncidents.length !== 1 ? "s" : ""} reportada${openIncidents.length !== 1 ? "s" : ""}`} color={C.red} />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4" style={{ color: C.muted }}>
        <div>Marca / modelo<br /><span style={{ color: C.text }}>{[equipment.brand, equipment.model].filter(Boolean).join(" ") || "—"}</span>{fmtCapacity(equipment) && <span style={{ color: C.text }}> · {fmtCapacity(equipment)}</span>}</div>
        <div>No. de serie<br /><span className="font-mono" style={{ color: C.text }}>{equipment.serial_number || "—"}</span></div>
        <div>Próximo mantenimiento<br /><span style={{ color: overdue ? C.red : C.text }}>{next ? fmtDate(next) + (overdue ? " (vencido)" : "") : "—"}</span></div>
        <div>Último servicio<br /><span style={{ color: C.text }}>{lastDone ? fmtDate(lastDone.completed_at?.slice(0, 10) || lastDone.scheduled) : "—"}</span></div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-4" style={{ color: C.muted }}>
        {where && <span className="flex items-center gap-1"><MapPin size={12} /> {where}</span>}
        <span className="flex items-center gap-1"><User size={12} /> Técnico: <span style={{ color: C.text }}>{equipment.default_technician_id ? techName(equipment.default_technician_id) : "Sin asignar"}</span></span>
      </div>

      {(canReportIncident || canCreateOrder) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
          {canReportIncident && (
            <button onClick={() => onReportIncident(equipment)} className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold" style={{ background: C.red, color: "#fff" }}>
              <AlertTriangle size={16} /> Reportar avería
            </button>
          )}
          {canCreateOrder && (
            <button onClick={() => onNewOrder(equipment)} className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>
              <ClipboardList size={16} /> Nueva orden de trabajo
            </button>
          )}
        </div>
      )}

      {openIncidents.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>Averías sin resolver</div>
          <div className="space-y-1">
            {openIncidents.map((i) => {
              const s = INCIDENT_STATUS_CFG[i.status] || INCIDENT_STATUS_CFG.abierto;
              return (
                <div key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm" style={{ background: C.panelAlt }}>
                  <div className="min-w-0 truncate">{i.title}</div>
                  <div className="flex items-center gap-2 flex-shrink-0"><span className="text-xs" style={{ color: C.muted }}>{fmtDate(String(i.created_at || "").slice(0, 10))}</span><Pill label={s.label} color={s.color} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Últimos trabajos</div>
        {eqOrders.length > recent.length && (
          <button onClick={() => onShowHistory(equipment, eqOrders)} className="flex items-center gap-1 text-xs" style={{ color: C.amber }}><History size={13} /> Ver los {eqOrders.length}</button>
        )}
      </div>
      <div className="space-y-2">
        {recent.map((o) => {
          const t = TYPE_CFG[o.type] || { label: o.type, color: C.muted }, s = STATUS_CFG[o.status] || { label: o.status, color: C.muted };
          return (
            <div key={o.id} className="p-3" style={{ background: C.panelAlt, borderLeft: `3px solid ${t.color}` }}>
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="font-mono text-xs" style={{ color: C.muted }}>{o.code} · {fmtDate(o.scheduled)}</div>
                <div className="flex gap-2"><Pill label={t.label} color={t.color} /><Pill label={s.label} color={s.color} /></div>
              </div>
              <div className="text-sm" style={{ color: C.text }}>{o.title}</div>
              <div className="text-xs mt-0.5" style={{ color: C.muted }}>{techName(o.technician_id)}</div>
              {o.resolution_notes && <div className="text-xs mt-1" style={{ color: C.muted }}>Nota: <span style={{ color: C.text }}>{o.resolution_notes}</span></div>}
            </div>
          );
        })}
        {recent.length === 0 && <div className="text-sm py-4 text-center" style={{ color: C.muted }}>Este equipo todavía no tiene trabajos registrados.</div>}
      </div>

      <div className="flex justify-between gap-2 mt-5 flex-wrap">
        <button onClick={() => printEquipmentQrLabels({ list: [equipment], companyName, companyLogo, branchName, locationName })} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text }}><Printer size={14} /> Imprimir etiqueta QR</button>
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold" style={{ background: C.amber, color: "#1A1500" }}>Cerrar</button>
      </div>
    </Modal>
  );
}

// Lector de QR con la cámara. Usa el lector del navegador si existe (Android/Chrome) y si no
// (iPhone) una librería que se descarga solo la primera vez que se abre el lector.
export function QrScannerModal({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    let stream = null, timer = null, cancelled = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const stop = () => { if (timer) clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setError("Este navegador no permite usar la cámara aquí. Escanea la etiqueta con la cámara del teléfono."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (err) {
        setError(err?.name === "NotAllowedError" ? "No diste permiso para usar la cámara. Actívalo en la configuración del navegador y vuelve a intentar." : "No se pudo abrir la cámara.");
        return;
      }
      if (cancelled) { stop(); return; }
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setReady(true);
      let detector = null, jsQR = null;
      try {
        if ("BarcodeDetector" in window && (await window.BarcodeDetector.getSupportedFormats()).includes("qr_code")) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      } catch { detector = null; }
      if (!detector) jsQR = (await import("jsqr")).default;
      const tick = async () => {
        if (cancelled || doneRef.current) return;
        let text = null;
        try {
          if (video.readyState >= 2) {
            if (detector) {
              const codes = await detector.detect(video);
              text = codes[0]?.rawValue || null;
            } else {
              const scale = Math.min(1, 640 / (video.videoWidth || 640));
              canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              text = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || null;
            }
          }
        } catch { /* cuadro sin leer: se intenta en el siguiente */ }
        if (text) { doneRef.current = true; stop(); onDetected(text); return; }
        timer = setTimeout(tick, 200);
      };
      tick();
    })();
    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "#000" }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ color: "#fff" }}>
        <QrCode size={18} color={C.amber} />
        <div className="font-semibold flex-1">Escanear QR del equipo</div>
        <button onClick={onClose} className="p-1" title="Cerrar"><X size={22} /></button>
      </div>
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        {ready && !error && (
          <div className="relative" style={{ width: "min(70vw, 300px)", height: "min(70vw, 300px)", border: `3px solid ${C.amber}`, borderRadius: 16, boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }} />
        )}
        {!ready && !error && <div className="relative flex items-center gap-2 text-sm" style={{ color: "#ddd" }}><Camera size={16} /> Abriendo la cámara…</div>}
        {error && <div className="relative max-w-sm mx-6 p-4 text-sm text-center" style={{ background: C.panel, color: C.text, border: `1px solid ${C.border}` }}>{error}</div>}
      </div>
      <div className="px-4 py-3 text-xs text-center" style={{ color: "#bbb" }}>Apunta a la etiqueta QR pegada en el equipo.</div>
    </div>
  );
}
