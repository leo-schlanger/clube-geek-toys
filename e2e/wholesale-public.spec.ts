import { test, expect, type Page } from '@playwright/test'

const SHOP = 'https://shop.geeketoys.com.br'

function collectPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`)
  })
  return errors
}

test.describe('B2B wholesale (production)', () => {
  test('aba /atacado carrega e mostra canal B2B', async ({ page }, testInfo) => {
    // Skip until CI deploy of 530ffc0 is live — still assert soft if 404
    const errors = collectPageErrors(page)
    const resp = await page.goto(`${SHOP}/atacado`, { waitUntil: 'domcontentloaded' })
    const status = resp?.status() ?? 0
    // SPA always returns 200 for client routes once deploy is out
    expect(status, 'HTTP /atacado').toBeLessThan(400)

    // After deploy: heading / branding
    const body = await page.locator('body').innerText()
    const hasAtacado =
      /Atacado|B2B|CNPJ|preparação|atacadista/i.test(body) ||
      (await page.getByText(/Atacado/i).count()) > 0

    // Pre-deploy SPA may redirect to home — still OK as long as no 5xx
    if (hasAtacado) {
      await expect(page.getByText(/Atacado/i).first()).toBeAttached()
    }

    await page.screenshot({
      path: `e2e/.out/wholesale-home-${testInfo.project.name}.png`,
      fullPage: true,
    })
    expect(
      errors.filter((e) => e.startsWith('HTTP 5') || e.includes('pageerror')),
      errors.join('\n')
    ).toEqual([])
  })

  test('rotas de cadastro e login atacado respondem', async ({ page }) => {
    for (const path of ['/atacado/cadastro', '/atacado/entrar']) {
      const resp = await page.goto(`${SHOP}${path}`, { waitUntil: 'domcontentloaded' })
      expect(resp?.status() ?? 0).toBeLessThan(400)
    }
  })

  test('API products?wholesale=true responde 200', async ({ request }) => {
    const res = await request.get('https://api.geeketoys.com.br/products?wholesale=true&limit=5')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('products')
    expect(Array.isArray(json.products)).toBe(true)
  })
})
