import { defineConfig, devices } from '@playwright/test'

// E2E contra PRODUÇÃO (sem webServer local). Testa a loja pública e o fluxo de
// assinatura. Fluxos que exigem admin/pagamento real ficam de fora por padrão.
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // E2E contra produção: 2 retries absorvem latência/soluços de rede transitórios
  // sem mascarar falha real (que persiste após o retry).
  retries: 2,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: './e2e/.out',
  use: {
    headless: true,
    ignoreHTTPSErrors: false,
    screenshot: 'on',
    video: 'off',
    trace: 'off',
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
