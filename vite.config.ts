import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.jpg', 'favicon.ico'],
      manifest: {
        name: 'Clube Geek & Toys',
        short_name: 'Geek Club',
        description: 'Programa de fidelidade Geek & Toys',
        theme_color: '#7c3aed',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'logo.jpg',
            sizes: '192x192',
            type: 'image/jpeg',
          },
          {
            src: 'logo.jpg',
            sizes: '512x512',
            type: 'image/jpeg',
          },
          {
            src: 'logo.jpg',
            sizes: '512x512',
            type: 'image/jpeg',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff2}'],
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
          // Separar node_modules em chunks por biblioteca
          if (id.includes('node_modules')) {
            // React core - carrega sempre
            if (id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react-core'
            }
            // React Router - carrega sempre
            if (id.includes('react-router')) {
              return 'vendor-router'
            }
            // Firebase Auth - crítico para login
            if (id.includes('firebase/auth') || id.includes('@firebase/auth')) {
              return 'vendor-firebase-auth'
            }
            // Firebase Firestore - pode lazy load
            if (id.includes('firebase/firestore') || id.includes('@firebase/firestore')) {
              return 'vendor-firebase-firestore'
            }
            // Firebase Core
            if (id.includes('firebase') || id.includes('@firebase')) {
              return 'vendor-firebase-core'
            }
            // Framer Motion - lazy load
            if (id.includes('framer-motion')) {
              return 'vendor-framer'
            }
            // Radix UI - usado em vários lugares
            if (id.includes('@radix-ui')) {
              return 'vendor-radix'
            }
            // Sonner (toasts)
            if (id.includes('sonner')) {
              return 'vendor-sonner'
            }
            // Form libraries
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
              return 'vendor-forms'
            }
            // QR code libraries - lazy load
            if (id.includes('qrcode') || id.includes('jsqr') || id.includes('@zxing')) {
              return 'vendor-qr'
            }
            // TanStack Query
            if (id.includes('@tanstack')) {
              return 'vendor-query'
            }
            // Charts - lazy loaded with reports
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts'
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
