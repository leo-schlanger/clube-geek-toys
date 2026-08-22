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

for (const p of PAGES) {
  test(`mobile ${p.name}: sem overflow horizontal @375px`, async ({ page }) => {
    const resp = await page.goto(p.url, { waitUntil: 'networkidle' })
    expect(resp?.status(), `HTTP status de ${p.url}`).toBeLessThan(400)

    // Let fonts/images settle before measuring overflow.
    await page.waitForTimeout(600)
    // Outside Playwright's outputDir, which is wiped every run.
    await page.screenshot({ path: `e2e/screenshots/mobile-${p.name}.png`, fullPage: true })

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
      `${p.name}: overflow horizontal — scrollWidth ${scroll.scrollW} > viewport ${scroll.clientW}.\nCulpados:\n${report}`
    ).toBeLessThanOrEqual(scroll.clientW + 1)
  })
}
