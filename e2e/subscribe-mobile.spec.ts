import { test, expect } from '@playwright/test'

// Regressão mobile: o card do plano (com CTA ASSINAR) usa framer-motion
// `whileInView` + opacity:0 inicial. Rolamos a página de verdade e garantimos
// que o conteúdo crítico de conversão fica visível (opacity 1) — protege contra
// o CTA principal ficar preso invisível se a animação por scroll regredir.
test.use({ viewport: { width: 375, height: 667 }, isMobile: true })

test('assinar: card do plano visível ao rolar (mobile)', async ({ page }) => {
  await page.goto('https://club.geeketoys.com.br/assinar', { waitUntil: 'networkidle' })

  // dispensa o banner de cookies se estiver cobrindo
  const aceitar = page.getByRole('button', { name: /Aceitar todos/i })
  if (await aceitar.isVisible().catch(() => false)) await aceitar.click()

  // rola em passos pra disparar os IntersectionObservers do whileInView
  for (let y = 0; y <= 3000; y += 400) {
    await page.evaluate((v) => window.scrollTo(0, v), y)
    await page.waitForTimeout(150)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)

  // agora o card do plano e o CTA ASSINAR devem estar visíveis
  const assinar = page.getByRole('link', { name: /^ASSINAR/i }).first()
  await assinar.scrollIntoViewIfNeeded()
  await expect(assinar, 'CTA ASSINAR do card do plano').toBeVisible()

  // e a opacidade computada deve ser 1 (animação concluída)
  const opacity = await page
    .locator('a[href*="/cadastro?plano=club"]')
    .first()
    .evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement
      while (node) {
        const o = parseFloat(getComputedStyle(node).opacity)
        if (o < 1) return o
        node = node.parentElement
      }
      return 1
    })
  expect(opacity, 'opacidade da cadeia do card do plano').toBeGreaterThan(0.99)

  await page.screenshot({ path: 'e2e/screenshots/subscribe-mobile-scrolled.png', fullPage: true })
})
