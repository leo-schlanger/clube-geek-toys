import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // WSL + /mnt/d is I/O bound — few workers avoid pool timeouts
    pool: 'forks',
    maxWorkers: 2,
    minWorkers: 1,
    fileParallelism: true,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'server/api/src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}',
    ],
    exclude: ['node_modules', 'dist', 'api-worker', 'server/api/node_modules'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './.coverage',
      include: [
        'src/**/*.{ts,tsx}',
        'server/api/src/utils/**/*.{ts}',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**/*',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'server/api/src/**/*.test.ts',
        'server/api/src/**/*.spec.ts',
      ],
      // Meta do projeto: 70% (docs/TODO). Thresholds de CI em 70% lines/statements.
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
