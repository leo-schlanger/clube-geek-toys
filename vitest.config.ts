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
       * Thresholds por área, e cada piso é o valor **medido em 16/08/2026**.
       *
       * São catracas contra regressão, não metas. A meta continua sendo 70% nos
       * dois lados; o piso sobe a cada leva de teste.
       *
       * Por que não 70 direto: o `src/**` estava em 67,55% e o backend em
       * 11,80%. Deixar a trava acima do real a mantém vermelha, e trava que vive
       * vermelha é trava que alguém desliga — foi exatamente o que aconteceu
       * aqui. O TODO anunciava 74% desde 10/08; com o catálogo (variações,
       * estoque, vídeos, perguntas, galeria, atacado) entrando mais rápido que
       * os testes, o número caiu ~6,5 pontos e o threshold global de 70%
       * **já falhava** — sem ninguém notar, porque a run completa leva ~26 min
       * e não está no CI.
       *
       * Próximos alvos no backend, por prejuízo se quebrarem:
       * `webhook.service` (confirma pagamento e baixa estoque),
       * `payment.service`, `stock.service`.
       */
      /*
       * Medido em 16/08/2026 (2278 testes):
       *   src/**          67,55 stmts · 69,31 lines · 64,94 funcs · 64,18 branch
       *   server/api/src  11,80 stmts · 11,78 lines ·  9,07 funcs · 10,59 branch
       *
       * Os pisos ficam ~1 ponto abaixo do medido, de propósito. Zero de folga
       * transforma qualquer função nova sem teste em CI vermelho por ruído — e
       * o que se aprende com alarme falso é a ignorar o alarme. Com 1 ponto,
       * só uma queda real dispara. Ao subir a cobertura, suba o piso junto.
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
