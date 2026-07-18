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
        description: 'Clube de vantagens — 15% de desconto em qualquer produto, na loja física e online',
        theme_color: '#ec4899',
        background_color: '#0d0d0d',
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
        globPatterns: ['**/*.{js,css,html,ico,jpg,svg,woff2}'],
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
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
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
    // Gerar sourcemaps apenas em dev
    sourcemap: false,
    // Minificar agressivamente
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs em produção
        drop_debugger: true,
      },
    },
    chunkSizeWarningLimit: 400,
  },
  // Otimizações de dependências
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})
