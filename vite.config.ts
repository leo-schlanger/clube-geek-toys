import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.jpg', 'favicon.svg'],
      manifest: {
        name: 'Clube GeekPop & Toys',
        short_name: 'GeekPop',
        description: 'Clube de vantagens — 10% de desconto em qualquer produto, na loja física e online',
        theme_color: '#F04080',
        background_color: '#FDFBFC',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        categories: ['shopping', 'lifestyle'],
        icons: [
          {
            src: 'logo-vip.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'logo-vip.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'logo.jpg',
            sizes: '192x192',
            type: 'image/jpeg',
          },
        ],
      },
      workbox: {
        // Omit `jpg`: the 35 photos in `public/eventos/` used to join the
        // precache and the SW downloaded 11.2 MB on every first visit,
        // including 4G users who only wanted a product. Photos are content,
        // not app shell — runtimeCaching, on demand.
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024, // 2MB max per file
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            // Event/gallery/product images — cached when the screen asks,
            // not up front. Entry cap so the cache cannot grow unbounded
            // on a customer's phone.
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      // Two HTML shells, one bundle: club and shop share the SPA (mode
      // comes from the subdomain) but need different <head> because link
      // crawlers do not run JS — see the comment at the top of shop.html.
      input: {
        main: resolve(__dirname, 'index.html'),
        shop: resolve(__dirname, 'shop.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // React core — MUST stay together to avoid useLayoutEffect errors
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router') ||
              id.includes('/scheduler/') ||
              id.includes('use-sync-external-store')
            ) {
              return 'vendor-react'
            }
          }
        },
      },
    },
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    chunkSizeWarningLimit: 400,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})
