import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      pwaAssets: { config: true },
      includeAssets: ['favicon.svg', 'capture-worklet.js'],
      manifest: {
        name: 'شاشة التراويح · Tarawih Display',
        short_name: 'Tarawih',
        description: 'The verse the imam is reciting, live on the mosque screen. Warsh and Hafs.',
        theme_color: '#0b0f0d',
        background_color: '#0b0f0d',
        display: 'standalone',
        start_url: '/',
      },
      workbox: {
        // the whole app works offline in the mosque: text, fonts, translations. The model caches itself.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // says whether this copy runs on the LAN server, so it must always come from the server
        globIgnores: ['lan.json'],
        maximumFileSizeToCacheInBytes: 3_000_000,
        navigateFallbackDenylist: [/^\/lan\.json/],
        // the recognition runtime is large, so it is cached on first use rather than for every visitor
        runtimeCaching: [{ urlPattern: /\.wasm$/, handler: 'CacheFirst', options: { cacheName: 'ort-wasm', expiration: { maxEntries: 4 } } }],
      },
    }),
  ],
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1500 },
  test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], css: false },
})
