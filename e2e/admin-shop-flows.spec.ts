import { test, expect, type Page } from '@playwright/test'

/**
 * Fluxos-núcleo em PRODUÇÃO: cadastro de produto (admin) + funil de compra (loja).
 *
 * Credenciais vêm de env (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD) — nunca no arquivo.
 * O produto é criado com nome-âncora "ZZZ E2E ..." e limpo depois via SQL.
 *
 * IMPORTANTE: o funil de compra vai até a etapa de pagamento e PARA — não clica
 * em "Continuar para o pagamento", que criaria um pedido/cobrança real (Stripe LIVE).
 */

const SHOP = 'https://shop.geeketoys.com.br'
const ADMIN = 'https://admin.geeketoys.com.br'

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? ''
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''

// Identidade estável do produto durante a run (um nome, reusado nos passos seriais).
const STAMP = process.env.E2E_STAMP ?? String(Date.now()).slice(-8)
const PRODUCT_NAME = `ZZZ E2E ${STAMP}`
const PRODUCT_PRICE = '99.90'
const PRODUCT_STOCK = '7'
const IMAGE_URL = 'https://placehold.co/600x600.png'

test.describe.configure({ mode: 'serial' })

// Pré-semeia o consentimento de cookies pra o banner (fixed bottom, z-9998) nunca
// aparecer e interceptar cliques em botões de rodapé (ex.: "Criar Produto").
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

test.describe('Fluxos admin + loja (produção)', () => {
  // Rodar sempre com --project=desktop (evita criar o produto em dobro no mobile).
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
    // redireciona para /admin após autenticar
    await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 })
  }

  test('1) admin cadastra um produto ativo com imagem', async ({ page }) => {
    await adminLogin(page)
    // navega para Produtos pela sidebar (client-side — preserva a sessão)
    await page.getByRole('button', { name: 'Produtos' }).first().click()
    await expect(page.getByRole('button', { name: /Novo Produto/i })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /Novo Produto/i }).click()
    await expect(page.getByText('Novo Produto').first()).toBeVisible()

    await page.locator('#product-name').fill(PRODUCT_NAME)
    await page.locator('#product-description').fill('Produto de teste automatizado E2E — pode apagar.')
    await page.locator('#product-price').fill(PRODUCT_PRICE)
    await page.locator('#product-stock').fill(PRODUCT_STOCK)

    // adiciona imagem por URL externa
    await page.getByPlaceholder(/Colar URL de imagem externa/i).fill(IMAGE_URL)
    await page.getByRole('button', { name: /^Adicionar$/i }).click()

    await page.getByRole('button', { name: /Criar Produto/i }).click()

    // toast de sucesso + linha na tabela
    await expect(page.getByText(/Produto criado!/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('cell', { name: PRODUCT_NAME }).first()).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: 'e2e/screenshots/flow-1-admin-created.png', fullPage: true })
  })

  test('2) produto aparece na loja e vai ao carrinho', async ({ page }) => {
    await page.goto(`${SHOP}/?search=${encodeURIComponent('ZZZ E2E')}`, { waitUntil: 'networkidle' })
    await dismissCookies(page)

    // card do produto na vitrine
    const card = page.getByText(PRODUCT_NAME).first()
    await expect(card, 'produto ativo deve aparecer na loja').toBeVisible({ timeout: 15_000 })
    await card.click()

    // página de detalhe → adicionar ao carrinho
    await expect(page).toHaveURL(/\/produto\//)
    await expect(page.getByRole('heading', { name: PRODUCT_NAME }).first()).toBeVisible()
    await page.getByRole('button', { name: /Adicionar ao carrinho/i }).click()
    await expect(page.getByText(/adicionado ao carrinho/i)).toBeVisible({ timeout: 10_000 })

    // vai ao carrinho e confirma o item
    await page.goto(`${SHOP}/carrinho`, { waitUntil: 'networkidle' })
    await expect(page.getByText(PRODUCT_NAME).first()).toBeVisible()
    await expect(page.getByText(/R\$\s*99,90/).first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/flow-2-cart.png', fullPage: true })

    // salva o estado do carrinho pra reusar no próximo teste (localStorage)
    const storage = await page.context().storageState()
    process.env.__CART_STORAGE = JSON.stringify(storage)
  })

  test('3) checkout até a etapa de pagamento (sem cobrar)', async ({ browser }) => {
    // reusa o carrinho do teste anterior
    const state = process.env.__CART_STORAGE ? JSON.parse(process.env.__CART_STORAGE) : undefined
    const ctx = await browser.newContext({ storageState: state })
    await preConsent(ctx)
    const page = await ctx.newPage()
    try {
      await page.goto(`${SHOP}/checkout`, { waitUntil: 'networkidle' })
      await dismissCookies(page)
      await expect(page.getByRole('heading', { name: /Finalizar compra/i })).toBeVisible()

      // dados do cliente
      await page.locator('#name').fill('Cliente Teste E2E')
      await page.locator('#email').fill('e2e-buyer@example.com')

      // formas de pagamento presentes
      await expect(page.getByText('PIX', { exact: true })).toBeVisible()
      await expect(page.getByText('Cartão de crédito')).toBeVisible()
      await page.getByText('Cartão de crédito').click()
      await page.getByText('PIX', { exact: true }).click()

      // resumo com o total e o CTA — mas NÃO clicamos (evita cobrança real)
      await expect(page.getByText(/Resumo do pedido/i)).toBeVisible()
      await expect(page.getByRole('button', { name: /Continuar para o pagamento/i })).toBeEnabled()
      await page.screenshot({ path: 'e2e/screenshots/flow-3-checkout.png', fullPage: true })
    } finally {
      await ctx.close()
    }
  })

  test('4) admin edita o produto e desativa; some da loja', async ({ page }) => {
    await adminLogin(page)
    await page.getByRole('button', { name: 'Produtos' }).first().click()
    await expect(page.getByRole('button', { name: /Novo Produto/i })).toBeVisible({ timeout: 15_000 })

    // localiza a linha do produto e clica em editar
    const row = page.getByRole('row', { name: new RegExp(PRODUCT_NAME) })
    await expect(row.first()).toBeVisible({ timeout: 15_000 })
    await row.first().getByRole('button', { name: /Editar produto/i }).click()

    // edita o preço
    await expect(page.getByText('Editar Produto').first()).toBeVisible()
    await page.locator('#product-price').fill('79.90')
    await page.getByRole('button', { name: /Salvar Alterações/i }).click()
    await expect(page.getByText(/Produto atualizado!/i)).toBeVisible({ timeout: 15_000 })

    // desativa (soft-delete). window.confirm → aceita
    page.once('dialog', (d) => d.accept())
    await row.first().getByRole('button', { name: /Desativar produto/i }).click()
    await expect(page.getByText(/Produto desativado/i)).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: 'e2e/screenshots/flow-4-deactivated.png', fullPage: true })

    // agora não deve mais aparecer na loja pública
    const shop = await page.context().newPage()
    await shop.goto(`${SHOP}/?search=${encodeURIComponent('ZZZ E2E')}`, { waitUntil: 'networkidle' })
    await expect(shop.getByText(PRODUCT_NAME)).toHaveCount(0)
    await shop.close()
  })
})
