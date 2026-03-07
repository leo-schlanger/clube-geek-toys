import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Separar node_modules em chunks por biblioteca
          if (id.includes('node_modules')) {
            // React e React DOM
            if (id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react'
            }
            // Firebase
            if (id.includes('firebase') || id.includes('@firebase')) {
              return 'vendor-firebase'
            }
            // UI libraries
            if (id.includes('framer-motion') || id.includes('@radix-ui') || id.includes('sonner')) {
              return 'vendor-ui'
            }
            // Form libraries
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
              return 'vendor-forms'
            }
            // QR code libraries
            if (id.includes('qrcode') || id.includes('jsqr') || id.includes('@zxing')) {
              return 'vendor-qr'
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
