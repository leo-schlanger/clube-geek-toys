import { test, expect, type Page } from '@playwright/test'

/**
 * Mobile-first audit against production.
 * Per public page: catch horizontal overflow (the #1 mobile layout break),
 * name the culprit, check small tap targets, and save a full-page screenshot.
 *
 * Mobile viewport only (iPhone SE — 375px, the narrowest still in use).
 */

const SHOP = 'https://shop.geeketoys.com.br'
const CLUB = 'https://club.geeketoys.com.br'

const PAGES: { name: string; url: string }[] = [
  { name: 'shop-home', url: `${SHOP}/` },
  { name: 'shop-login', url: `${SHOP}/entrar` },
  { name: 'shop-cart', url: `${SHOP}/carrinho` },
  { name: 'club-subscribe', url: `${CLUB}/assinar` },
  { name: 'club-login', url: `${CLUB}/login` },
  { name: 'club-register', url: `${CLUB}/cadastro` },
  { name: 'club-forgot', url: `${CLUB}/recuperar-senha` },
  { name: 'club-terms', url: `${CLUB}/termos` },
  { name: 'club-privacy', url: `${CLUB}/privacidade` },
]

// iPhone SE: narrowest viewport still in use — worst-case overflow.
test.use({ viewport: { width: 375, height: 667 }, isMobile: true })

/** Elements that exceed the viewport width (overflow culprits). */
async function findOverflowingElements(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const bad: { tag: string; cls: string; w: number; right: number; text: string }[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect()
      // 1px tolerance for subpixel rounding
      if (r.width > 0 && r.right > vw + 1) {
        bad.push({
          tag: el.tagName.toLowerCase(),
          cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
          w: Math.round(r.width),
          right: Math.round(r.right),
          text: (el.textContent ?? '').trim().slice(0, 40),
        })
      }
    }
    // Dedup by tag+class; keep the 12 worst.
    const seen = new Set<string>()
    return bad
      .sort((a, b) => b.right - a.right)
      .filter((e) => {
        const k = `${e.tag}.${e.cls}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .slice(0, 12)
  })
}

async function expectNoOverflow(page: Page, name: string) {
  // Let fonts/images settle before measuring overflow.
  await page.waitForTimeout(600)
  // Outside Playwright's outputDir, which is wiped every run.
  await page.screenshot({ path: `e2e/screenshots/mobile-${name}.png`, fullPage: true })

  const scroll = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }))
  const culprits = await findOverflowingElements(page)
  const report = culprits
    .map((c) => `  <${c.tag} class="${c.cls}"> w=${c.w} right=${c.right} "${c.text}"`)
    .join('\n')

  expect(
    scroll.scrollW,
    `${name}: overflow horizontal — scrollWidth ${scroll.scrollW} > viewport ${scroll.clientW}.\nCulpados:\n${report}`
  ).toBeLessThanOrEqual(scroll.clientW + 1)
}

for (const p of PAGES) {
  test(`mobile ${p.name}: sem overflow horizontal @375px`, async ({ page }) => {
    const resp = await page.goto(p.url, { waitUntil: 'networkidle' })
    expect(resp?.status(), `HTTP status de ${p.url}`).toBeLessThan(400)
    await expectNoOverflow(page, p.name)
  })
}

/**
 * The product page was missing from the list above, and it overflowed: from six
 * photos on, the thumbnail strip widened the grid column and the whole page
 * scrolled sideways on a phone. Audit the product with the most photos — the
 * catalogue changes, the worst case is what matters. Products with variants are
 * skipped: their gallery shows only the selected variant's photos.
 */
test('mobile shop-product (mais fotos do catálogo): sem overflow horizontal @375px', async ({
  page,
  request,
}) => {
  let best = { slug: '', photos: 0 }
  for (let pageNo = 1; pageNo <= 5; pageNo++) {
    const res = await request.get(`https://api.geeketoys.com.br/products?limit=100&page=${pageNo}`)
    const { products } = (await res.json()) as {
      products: { slug: string; images?: string[]; hasVariants?: boolean }[]
    }
    for (const p of products) {
      if (p.hasVariants) continue
      if ((p.images?.length ?? 0) > best.photos) best = { slug: p.slug, photos: p.images!.length }
    }
    if (products.length < 100) break
  }
  expect(best.slug, 'nenhum produto no catálogo').not.toBe('')

  const resp = await page.goto(`${SHOP}/produto/${best.slug}`, { waitUntil: 'networkidle' })
  expect(resp?.status()).toBeLessThan(400)
  await expectNoOverflow(page, `shop-product-${best.photos}-fotos`)
})
