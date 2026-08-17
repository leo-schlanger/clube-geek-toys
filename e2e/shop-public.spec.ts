import { test, expect, type Page } from '@playwright/test'

const SHOP = 'https://shop.geeketoys.com.br'
const CLUB = 'https://club.geeketoys.com.br'

/** Attach console/page/network error collectors to a page. */
function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('response', (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`)
  })
  page.on('requestfailed', (r) => {
    // ignore benign aborted/analytics
    const url = r.url()
    if (!/analytics|umami|turnstile|favicon/.test(url)) errors.push(`requestfailed: ${url} (${r.failure()?.errorText})`)
  })
  return errors
}

test.describe('Public shop (production)', () => {
  test('home: carrega a vitrine da loja, sem erros', async ({ page }, testInfo) => {
    const errors = collectErrors(page)
    const resp = await page.goto(SHOP, { waitUntil: 'domcontentloaded' })
    expect(resp?.status(), 'status HTTP da home').toBeLessThan(400)
    await expect(page).toHaveTitle(/GeekPop/i)
    // logo da loja — âncora visível em ambos os viewports
    await expect(page.getByAltText(/GeekPop & Toys/i).first()).toBeVisible()
    // cabeçalho da loja (confirma que getAppMode detectou 'shop').
    // O texto "Loja GeekPop & Toys" é `hidden sm:inline` (some no mobile),
    // então checamos presença no DOM, não visibilidade.
    await expect(page.getByText('Loja GeekPop & Toys')).toBeAttached()
    // hero/heading
    await expect(page.getByRole('heading').first()).toBeVisible()
    await page.screenshot({ path: `e2e/.out/shop-home-${testInfo.project.name}.png`, fullPage: true })
    expect(errors, `erros no console/rede:\n${errors.join('\n')}`).toEqual([])
  })

  test('home: the API catalogue appears, or a friendly empty state', async ({ page }) => {
    await page.goto(SHOP, { waitUntil: 'networkidle' })
    // Com estoque real: lista produtos; sem estoque: mensagem amigável (API 200 em ambos)
    const empty = page.getByText(/Nenhum produto disponível|Nenhum produto encontrado/i)
    const productLink = page.locator('a[href^="/produto/"]').first()
    const hasProducts = (await productLink.count()) > 0
    if (hasProducts) {
      await expect(productLink).toBeVisible()
    } else {
      await expect(empty.first()).toBeVisible()
    }
  })

  test('event: /evento loads with the date and reservation', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto(`${SHOP}/evento`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading').first()).toBeVisible()
    // conteúdo ativo: preço e/ou data de setembro
    await expect(page.getByText(/R\$\s*20|setembro|ingresso/i).first()).toBeVisible({
      timeout: 15_000,
    })
    await page.screenshot({ path: 'e2e/.out/shop-evento.png', fullPage: true })
    expect(errors.filter((e) => e.startsWith('pageerror')), errors.join('\n')).toEqual([])
  })

  test('carrinho: abre a gaveta e mostra carrinho vazio', async ({ page }) => {
    await page.goto(SHOP, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /Abrir carrinho/i }).first().click()
    // gaveta abre (algum texto de carrinho/vazio)
    await expect(page.getByText(/carrinho/i).first()).toBeVisible()
    await page.screenshot({ path: 'e2e/.out/shop-cart-drawer.png' })
  })

  test('login: the "Entrar" link reaches the shop login page', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto(SHOP, { waitUntil: 'domcontentloaded' })
    // Desktop mostra botão-texto "Entrar"; mobile mostra ícone (aria-label="Entrar").
    // Ambos linkam /entrar — filtramos pelo que está de fato visível no viewport.
    await page.locator('a[href="/entrar"]:visible').first().click()
    await expect(page).toHaveURL(/\/entrar/)
    // form de login (email/senha)
    await expect(page.getByRole('textbox').first()).toBeVisible()
    await page.screenshot({ path: 'e2e/.out/shop-login.png', fullPage: true })
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('a nonexistent product route does not break the app', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto(`${SHOP}/produto/produto-que-nao-existe-123`, { waitUntil: 'networkidle' })
    // não deve haver tela branca/erro fatal — o app segue renderizando (header presente ou redireciona)
    await expect(page.locator('#root')).not.toBeEmpty()
    await page.screenshot({ path: 'e2e/.out/shop-product-404.png', fullPage: true })
    expect(errors.filter((e) => e.startsWith('pageerror')), errors.join('\n')).toEqual([])
  })
})

test.describe('Club subscription (production)', () => {
  test('/assinar: single plan R$ 149.99 / 10%, with no errors', async ({ page }, testInfo) => {
    const errors = collectErrors(page)
    const resp = await page.goto(`${CLUB}/assinar`, { waitUntil: 'domcontentloaded' })
    expect(resp?.status()).toBeLessThan(400)
    await expect(page.getByText(/149,99/).first()).toBeVisible()
    await expect(page.getByText(/10%/).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /ASSINAR/i }).first()).toBeVisible()
    // não deve mais existir Silver/Gold/Black/mensal
    await expect(page.getByText(/Silver|Gold|Black|\/m[êe]s/i)).toHaveCount(0)
    await page.screenshot({ path: `e2e/.out/subscribe-${testInfo.project.name}.png`, fullPage: true })
    expect(errors, errors.join('\n')).toEqual([])
  })
})
