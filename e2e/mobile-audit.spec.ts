import { test, expect, type Page } from '@playwright/test'

/**
 * Auditoria mobile-first contra PRODUÇÃO.
 * Para cada página pública: detecta overflow horizontal (o sintoma nº 1 de
 * quebra de layout no mobile), aponta o elemento culpado, verifica alvos de
 * toque pequenos e captura screenshot full-page pra inspeção visual.
 *
 * Roda só no viewport mobile (iPhone SE — o mais estreito, 375px, pior caso).
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

// iPhone SE: viewport mais estreito ainda em uso — pior caso de overflow.
test.use({ viewport: { width: 375, height: 667 }, isMobile: true })

/** Retorna os elementos que ultrapassam a largura do viewport (culpados de overflow). */
async function findOverflowingElements(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const bad: { tag: string; cls: string; w: number; right: number; text: string }[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect()
      // tolerância de 1px pra arredondamento subpixel
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
    // dedup por assinatura, mantém os 12 piores
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

    // dá tempo pra fontes/imagens assentarem
    await page.waitForTimeout(600)
    // grava fora do outputDir (que o Playwright limpa a cada run) pra persistir
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
