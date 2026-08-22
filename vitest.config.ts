import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // WSL + /mnt/d is I/O bound — few workers avoid pool timeouts.
    // Measured 15/08/2026 (20 cores, 14 component files): 2 workers =
    // 126s, 6 = 85s, 10 = 78s. From 6 to 10, per-worker setup eats the
    // gain, so 6 is the knee of the curve.
    pool: 'forks',
    maxWorkers: 6,
    minWorkers: 1,
    fileParallelism: true,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    exclude: ['node_modules', 'dist', 'api-worker', 'server/api/node_modules'],
    /**
     * Two environments. jsdom setup dominates wall time (`environment` was
     * 1876s of 1382s wall on 15/08/2026); server code never touches the
     * DOM — running it under jsdom was pure cost.
     */
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'api',
          environment: 'node',
          include: ['server/api/src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './.coverage',
      /**
       * Whole backend is in the include since 16/08/2026.
       *
       * Previously `include` was `src/**` + `server/api/src/utils/**`, so
       * the TODO's "74% coverage" was essentially the front. The ~10k
       * lines that move money and stock — `order.service` (840),
       * `webhook.service` (569), `payment.service` (521), `stock.service`
       * (409) — sat at 0% and were not in the number. The metric existed
       * and did not look at the highest-risk code.
       */
      include: [
        'src/**/*.{ts,tsx}',
        'server/api/src/**/*.ts',
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
      /**
       * Per-area thresholds; each floor is the value **measured 16/08/2026**.
       *
       * These are regression ratchets, not goals. The goal remains 70% on
       * both sides; the floor rises with each test wave.
       *
       * Why not 70 outright: `src/**` was 67.55% and the backend 11.80%.
       * A lock above the real number stays red, and a lock that lives red
       * is a lock someone turns off — that is what happened here. The
       * TODO advertised 74% since 10/08; catalogue work (variants, stock,
       * videos, questions, gallery, wholesale) outran the tests, the
       * number dropped ~6.5 points, and the global 70% threshold **already
       * failed** — unnoticed, because a full run takes ~26 min and is not
       * on CI.
       *
       * Next backend targets, by cost if they break: `webhook.service`
       * (confirms payment and decrements stock), `payment.service`,
       * `stock.service`.
       */
      /*
       * Measured 16/08/2026 (2278 tests):
       *   src/**          67.55 stmts · 69.31 lines · 64.94 funcs · 64.18 branch
       *   server/api/src  11.80 stmts · 11.78 lines ·  9.07 funcs · 10.59 branch
       *
       * Floors sit ~1 point below measured, on purpose. Zero slack turns
       * any new untested function into red CI noise — and a false alarm
       * teaches people to ignore the alarm. With 1 point, only a real
       * drop fires. Raise the floor when coverage rises.
       */
      thresholds: {
        'src/**': {
          statements: 66,
          branches: 63,
          functions: 64,
          lines: 68,
        },
        'server/api/src/**': {
          statements: 11,
          branches: 10,
          functions: 8,
          lines: 11,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
