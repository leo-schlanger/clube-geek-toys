import { defineConfig, devices } from '@playwright/test'

// Production E2E (no local webServer). Covers the public shop and subscribe
// funnel. Admin/live-payment flows stay out by default.
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // Two retries absorb transient production latency without masking a real
  // failure (that one survives the retry).
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
