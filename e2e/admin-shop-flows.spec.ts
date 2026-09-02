import { test, expect, type Page } from '@playwright/test'

/**
 * Core production flows: admin product create + shop purchase funnel.
 *
 * Credentials come from env (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD) — never
 * in this file. The product is named "ZZZ E2E ..." and cleaned up via SQL.
 *
 * The funnel stops at the payment step — it must not click "Continuar para
 * o pagamento", which would create a live Pagar.me charge.
 */

const SHOP = 'https://shop.geeketoys.com.br'
const ADMIN = 'https://admin.geeketoys.com.br'

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? ''
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''

// One product name reused across serial steps.
const STAMP = process.env.E2E_STAMP ?? String(Date.now()).slice(-8)
const PRODUCT_NAME = `ZZZ E2E ${STAMP}`
const PRODUCT_PRICE = '99.90'
const PRODUCT_STOCK = '7'
const IMAGE_URL = 'https://placehold.co/600x600.png'
const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

test.describe.configure({ mode: 'serial' })

// Seed cookie consent so the banner (fixed bottom, z-9998) cannot intercept
// clicks on footer buttons (e.g. "Criar Produto").
async function preConsent(target: { addInitScript: (fn: () => void) => Promise<void> }) {
  await target.addInitScript(() => {
    try {
      localStorage.setItem(
        'clube_geek_cookie_consent',
        JSON.stringify({ essential: true, analytics: false, acceptedAll: false, date: '2026-01-01' })
      )
    } catch { /* ignore */ }
  })
}

test.describe('Admin and shop flows (production)', () => {
  // Always --project=desktop or the product is created twice (mobile).
  test.beforeEach(async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, 'defina E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD')
    await preConsent(page.context())
  })

  async function dismissCookies(page: Page) {
    const btn = page.getByRole('button', { name: /Aceitar todos/i })
    if (await btn.isVisible().catch(() => false)) await btn.click()
  }

  async function adminLogin(page: Page) {
    await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' })
    await dismissCookies(page)
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: /Acessar Painel/i }).click()
    await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 })
  }

  /**
   * Product form became tabs on 16/08/2026 (the modal was ~1100 lines of
   * fields in one scroll and the video block sat hidden at the end).
   * Inactive panels are `display:none`, so Playwright must open the tab
   * before touching a field — same as a human operator.
   */
  async function abaDoProduto(page: Page, nome: RegExp) {
    await page.getByRole('tab', { name: nome }).click()
  }

  test('1) admin cadastra um produto ativo com imagem', async ({ page }) => {
    await adminLogin(page)
    // Sidebar nav is client-side — preserves the session.
    await page.getByRole('button', { name: 'Produtos' }).first().click()
    await expect(page.getByRole('button', { name: /Novo Produto/i })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /Novo Produto/i }).click()
    await expect(page.getByText('Novo Produto').first()).toBeVisible()

    await page.locator('#product-name').fill(PRODUCT_NAME)
    await page.locator('#product-description').fill('Produto de teste automatizado E2E — pode apagar.')
    await page.locator('#product-price').fill(PRODUCT_PRICE)
    await page.locator('#product-stock').fill(PRODUCT_STOCK)

    await abaDoProduto(page, /Fotos e vídeos/)
    await page.getByPlaceholder(/Colar URL de imagem externa/i).fill(IMAGE_URL)
    await page.getByRole('button', { name: /^Adicionar$/i }).click()

    await page.getByRole('button', { name: /Criar Produto/i }).click()

    await expect(page.getByText(/Produto criado!/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('cell', { name: PRODUCT_NAME }).first()).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: 'e2e/screenshots/flow-1-admin-created.png', fullPage: true })
  })

  test('2) produto aparece na loja e vai ao carrinho', async ({ page }) => {
    await page.goto(`${SHOP}/?search=${encodeURIComponent('ZZZ E2E')}`, { waitUntil: 'networkidle' })
    await dismissCookies(page)

    const card = page.getByText(PRODUCT_NAME).first()
    await expect(card, 'produto ativo deve aparecer na loja').toBeVisible({ timeout: 15_000 })
    await card.click()

    await expect(page).toHaveURL(/\/produto\//)
    await expect(page.getByRole('heading', { name: PRODUCT_NAME }).first()).toBeVisible()
    await page.getByRole('button', { name: /Adicionar ao carrinho/i }).click()
    await expect(page.getByText(/adicionado ao carrinho/i)).toBeVisible({ timeout: 10_000 })

    await page.goto(`${SHOP}/carrinho`, { waitUntil: 'networkidle' })
    await expect(page.getByText(PRODUCT_NAME).first()).toBeVisible()
    await expect(page.getByText(/R\$\s*99,90/).first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/flow-2-cart.png', fullPage: true })

    // Persist cart localStorage for the next serial test.
    const storage = await page.context().storageState()
    process.env.__CART_STORAGE = JSON.stringify(storage)
  })

  test('3) checkout up to the payment step, without charging', async ({ browser }) => {
    const state = process.env.__CART_STORAGE ? JSON.parse(process.env.__CART_STORAGE) : undefined
    const ctx = await browser.newContext({ storageState: state })
    await preConsent(ctx)
    const page = await ctx.newPage()
    try {
      await page.goto(`${SHOP}/checkout`, { waitUntil: 'networkidle' })
      await dismissCookies(page)
      await expect(page.getByRole('heading', { name: /Finalizar compra/i })).toBeVisible()

      await page.locator('#name').fill('Cliente Teste E2E')
      await page.locator('#email').fill('e2e-buyer@example.com')

      await expect(page.getByText('PIX', { exact: true })).toBeVisible()
      await expect(page.getByText('Cartão de crédito')).toBeVisible()
      await page.getByText('Cartão de crédito').click()
      await page.getByText('PIX', { exact: true }).click()

      // Assert the CTA is enabled, but do not click — that would charge live.
      await expect(page.getByText(/Resumo do pedido/i)).toBeVisible()
      await expect(page.getByRole('button', { name: /Continuar para o pagamento/i })).toBeEnabled()
      await page.screenshot({ path: 'e2e/screenshots/flow-3-checkout.png', fullPage: true })
    } finally {
      await ctx.close()
    }
  })

  /**
   * Regression 15/08/2026 — variant and video save dropped on the floor.
   *
   * Walk the path of someone who did not read the hint: fill the axes and
   * save without clicking "Gerar combinações", paste the video URL without
   * clicking "Adicionar". That is exactly how the panel stored a product
   * with no SKU and no video while toasting "Produto atualizado!".
   *
   * Clicking those buttons first would make the test pass with the bug
   * back — so they stay out.
   */
  test('3b) admin saves variants and a video without pressing generate or add', async ({ page }) => {
    await adminLogin(page)
    await page.getByRole('button', { name: 'Produtos' }).first().click()
    await expect(page.getByRole('button', { name: /Novo Produto/i })).toBeVisible({ timeout: 15_000 })

    const row = page.getByRole('row', { name: new RegExp(PRODUCT_NAME) })
    await expect(row.first()).toBeVisible({ timeout: 15_000 })
    await row.first().getByRole('button', { name: /Editar produto/i }).click()
    await expect(page.getByText('Editar Produto').first()).toBeVisible()

    await abaDoProduto(page, /Variações/)
    await page.getByLabel(/Ativar variações/i).check()
    await page.getByPlaceholder('Cor', { exact: true }).fill('Cor')
    await page.getByPlaceholder(/Ou cole várias/i).fill('Rosa, Preto')

    // Paste the video URL on another tab and leave it. Saving from
    // Variações is the break-test that the hidden tab's draft is in the save.
    await abaDoProduto(page, /Fotos e vídeos/)
    await page.getByPlaceholder(/Colar link do YouTube/i).fill(VIDEO_URL)
    await abaDoProduto(page, /Variações/)

    await page.getByRole('button', { name: /Salvar Alterações/i }).click()
    await expect(page.getByText(/Produto atualizado!/i)).toBeVisible({ timeout: 20_000 })

    // Reopen: what was stored, not what the screen showed before close.
    await row.first().getByRole('button', { name: /Editar produto/i }).click()
    await expect(page.getByText('Editar Produto').first()).toBeVisible()

    // Tab badge proves the tab did not hide the work.
    await expect(page.getByRole('tab', { name: /Variações/ })).toContainText('2')

    await abaDoProduto(page, /Variações/)
    await expect(
      page.getByText(/2 SKU\(s\)/),
      'as duas variações precisam ter sido gravadas'
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Rosa', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Preto', { exact: true }).first()).toBeVisible()

    await abaDoProduto(page, /Fotos e vídeos/)
    await expect(
      page.getByText(VIDEO_URL, { exact: false }).first(),
      'o link de vídeo colado precisa ter sido gravado'
    ).toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/flow-3b-variants-video.png', fullPage: true })
    await page.getByRole('button', { name: /Cancelar/i }).first().click().catch(() => {})
  })

  test('4) admin edita o produto e desativa; some da loja', async ({ page }) => {
    await adminLogin(page)
    await page.getByRole('button', { name: 'Produtos' }).first().click()
    await expect(page.getByRole('button', { name: /Novo Produto/i })).toBeVisible({ timeout: 15_000 })

    const row = page.getByRole('row', { name: new RegExp(PRODUCT_NAME) })
    await expect(row.first()).toBeVisible({ timeout: 15_000 })
    await row.first().getByRole('button', { name: /Editar produto/i }).click()

    await expect(page.getByText('Editar Produto').first()).toBeVisible()
    await page.locator('#product-price').fill('79.90')
    await page.getByRole('button', { name: /Salvar Alterações/i }).click()
    await expect(page.getByText(/Produto atualizado!/i)).toBeVisible({ timeout: 15_000 })

    // Deactivate fires window.confirm.
    page.once('dialog', (d) => d.accept())
    await row.first().getByRole('button', { name: /Desativar produto/i }).click()
    await expect(page.getByText(/Produto desativado/i)).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: 'e2e/screenshots/flow-4-deactivated.png', fullPage: true })

    const shop = await page.context().newPage()
    await shop.goto(`${SHOP}/?search=${encodeURIComponent('ZZZ E2E')}`, { waitUntil: 'networkidle' })
    await expect(shop.getByText(PRODUCT_NAME)).toHaveCount(0)
    await shop.close()
  })
})
