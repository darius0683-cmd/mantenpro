import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Lista de todos los archivos de la app (precache-manifest.json). El service worker (public/sw.js)
// la lee y los guarda en el teléfono, para que la app abra y funcione completa sin señal,
// incluidas las pantallas que todavía no se habían abierto.
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
        source: JSON.stringify({ version: Date.now().toString(36), files: ['/', '/manifest.json', '/favicon.svg', '/icon-192.png', ...files] }),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), precacheList()],
})
