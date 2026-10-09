import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Lista de todos los archivos de la app (precache-manifest.json). El service worker (public/sw.js)
// la lee y los guarda en el teléfono, para que la app abra y funcione completa sin señal,
// incluidas las pantallas que todavía no se habían abierto.
// Número de esta publicación: va en precache-manifest.json y dentro del código (__APP_VERSION__),
// para que la app abierta sepa cuándo hay una versión nueva (franja "Hay una versión nueva").
const BUILD_VERSION = Date.now().toString(36)

function precacheList() {
  return {
    name: 'mantenpro-precache-list',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => /\.(js|css|woff2?|svg|png|webp)$/.test(f) && !/pdf\.worker/.test(f))
        .map((f) => '/' + f)
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: JSON.stringify({ version: BUILD_VERSION, files: ['/', '/manifest.json', '/favicon.svg', '/icon-192.png', ...files] }),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), precacheList()],
  define: { __APP_VERSION__: JSON.stringify(BUILD_VERSION) },
})
