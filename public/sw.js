// Service worker de MantenPro
// - Recibe las notificaciones push.
// - Guarda en el teléfono todos los archivos de la app (la lista la arma el build en
//   precache-manifest.json), para que abra y funcione completa sin señal: modo sin conexión
//   del técnico. Los datos (órdenes, etc.) los guarda la app aparte (offline.jsx).
//
// Este archivo va en la carpeta "public" de tu proyecto Vite
// (queda accesible en https://tu-dominio.com/sw.js).

const CACHE_NAME = "mantenpro-cache-v2";
const NAV_TIMEOUT_MS = 6000;

// Baja los archivos de la versión publicada que falten y borra los de versiones viejas.
async function precache() {
  let list;
  try {
    const res = await fetch("/precache-manifest.json", { cache: "no-store" });
    if (!res.ok) return;
    list = await res.json();
  } catch { return; }
  const files = Array.isArray(list?.files) ? list.files : [];
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  const have = new Set(keys.map((r) => new URL(r.url).pathname));
  for (const f of files) {
    if (f === "/" || have.has(f)) continue;
    try {
      const r = await fetch(f, { cache: "no-cache" });
      if (r.ok) await cache.put(f, r);
    } catch { /* se intenta la próxima vez */ }
  }
  try {
    const r = await fetch("/", { cache: "no-cache" });
    if (r.ok) await cache.put("/", r);
  } catch { /* sin señal */ }
  const wanted = new Set(files);
  for (const req of keys) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/assets/") && !wanted.has(path)) await cache.delete(req);
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precache().catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// La app avisa al abrir: así cada versión nueva que se publica queda guardada completa.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "precache") event.waitUntil(precache().catch(() => {}));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo peticiones GET de nuestro propio dominio.
  // Todo lo demás (Supabase, imágenes externas, POST/PUT/DELETE) pasa de largo sin tocar.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  // Abrir la app: intenta la red (si ya hay una versión guardada, máximo unos segundos, por si la
  // señal es muy mala); si no responde, usa la versión guardada.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match("/");
      const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put("/", res.clone());
        return res;
      });
      network.catch(() => {}); // si ya se respondió con lo guardado, el error de red no importa
      if (!cached) return network;
      try {
        return await Promise.race([
          network,
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS)),
        ]);
      } catch {
        return cached;
      }
    })());
    return;
  }

  const url = new URL(req.url);
  // Archivos con nombre único por versión (/assets/...): lo guardado y, si no está, la red.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Lo demás (imágenes de ayuda, íconos, manifest): lo guardado al instante y se actualiza por detrás.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res.ok && !url.pathname.endsWith("precache-manifest.json")) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "MantenPro";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
