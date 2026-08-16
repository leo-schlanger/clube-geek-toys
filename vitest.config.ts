import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // WSL + /mnt/d is I/O bound — few workers avoid pool timeouts.
    // Medido em 15/08/2026 (20 cores, 14 arquivos de componente): 2 workers =
    // 126s, 6 = 85s, 10 = 78s. De 6 para 10 o custo por worker de montar o
    // ambiente já come o ganho, então 6 é o joelho da curva.
    pool: 'forks',
    maxWorkers: 6,
    minWorkers: 1,
    fileParallelism: true,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    exclude: ['node_modules', 'dist', 'api-worker', 'server/api/node_modules'],
    /**
     * Dois ambientes. Montar o jsdom é o que domina o relógio da suíte
     * (`environment` foi 1876s de 1382s de parede em 15/08/2026), e o código do
     * servidor não toca em DOM nenhum — rodar aquilo sob jsdom era só custo.
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
       * O backend inteiro entra aqui desde 16/08/2026.
       *
       * Antes o `include` era `src/**` + `server/api/src/utils/**`, então os
       * "74% de cobertura" do TODO mediam essencialmente o front. As 10 mil
       * linhas que mexem em dinheiro e estoque — `order.service` (840),
       * `webhook.service` (569), `payment.service` (521), `stock.service` (409)
       * — ficavam fora da conta, todas em 0%. A métrica existia e não olhava
       * para o lugar de maior risco.
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
       * Thresholds por área, não um número só.
       *
       * O front já sustenta 70% e continua com essa trava. O backend entrou na
       * medição em 7% — pôr 70% aqui deixaria o CI vermelho para sempre e a
       * trava viraria ruído que se desliga. O piso é o valor **medido hoje**,
       * para não regredir, e sobe a cada leva de teste. É catraca, não meta.
       *
       * Próximos alvos, por prejuízo se quebrar: `webhook.service` (confirma
       * pagamento e baixa estoque), `payment.service`, `stock.service`.
       */
      thresholds: {
        'src/**': {
          statements: 70,
          branches: 60,
          functions: 70,
          lines: 70,
        },
        'server/api/src/**': {
          statements: 10,
          branches: 8,
          functions: 9,
          lines: 10,
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
