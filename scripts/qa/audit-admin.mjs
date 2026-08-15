import { chromium } from '@playwright/test'

const BASE = 'https://adm.geeketoys.com.br'
const TABS = [
  'dashboard', 'members', 'products', 'stock', 'orders',
  'wholesale', 'reviews', 'questions', 'gallery', 'users',
  'logs', 'reports', 'settings',
]
const WIDTHS = [1440, 900, 390]

/** Mesma sonda usada na loja: mede o DOM renderizado, não o código. */
const probe = () => {
  const problems = []
  for (const el of document.querySelectorAll('a, button')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el)

    if (el.tagName === 'BUTTON' && el.querySelector('a')) {
      problems.push({ tipo: 'a-dentro-de-button', texto: el.textContent.trim().slice(0, 40) })
      continue
    }
    if (!cs.display.includes('flex') || cs.flexDirection !== 'row') continue

    const kids = [...el.children].filter((c) => c.getBoundingClientRect().height > 0)
    if (kids.length < 2) continue
    const boxes = kids.map((c) => c.getBoundingClientRect())
    for (let i = 1; i < boxes.length; i++) {
      if (boxes[i].left <= boxes[i - 1].left && boxes[i].top >= boxes[i - 1].bottom - 1) {
        problems.push({
          tipo: 'conteudo-quebrado',
          texto: el.textContent.trim().slice(0, 40),
          altura: Math.round(r.height),
        })
        break
      }
    }
  }

  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    problems.push({
      tipo: 'overflow-horizontal',
      largura: document.documentElement.scrollWidth,
      janela: window.innerWidth,
    })
  }

  // Texto que vaza do próprio container (nome de produto, e-mail longo…)
  for (const el of document.querySelectorAll('td, th, p, span, h1, h2, h3')) {
    const cs = getComputedStyle(el)
    if (cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis') continue
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      const t = el.textContent.trim()
      if (t.length > 3) problems.push({ tipo: 'texto-vazando', texto: t.slice(0, 40) })
    }
  }
  return problems
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })

// Login uma vez; o estado de sessão é reaproveitado nas abas.
const login = await ctx.newPage()
await login.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await login.getByRole('button', { name: /Aceitar todos/i }).click().catch(() => {})
await login.getByLabel(/e-?mail/i).fill(process.env.E2E_ADMIN_EMAIL)
await login.getByLabel(/senha/i).first().fill(process.env.E2E_ADMIN_PASSWORD)
await login.getByRole('button', { name: /Acessar Painel/i }).click()
await login.waitForURL(/\/admin/, { timeout: 30000 })
const storage = await ctx.storageState()
await login.close()

let total = 0
for (const theme of ['light', 'dark']) {
  for (const w of WIDTHS) {
    const c = await b.newContext({ viewport: { width: w, height: 900 }, storageState: storage })
    await c.addInitScript((t) => localStorage.setItem('geekpop-theme', t), theme)
    for (const tab of TABS) {
      const p = await c.newPage()
      try {
        await p.goto(`${BASE}/admin?tab=${tab}`, { waitUntil: 'networkidle', timeout: 40000 })
        await p.waitForTimeout(1200)
        const found = await p.evaluate(probe)
        const stats = await p.evaluate(() => ({
          botoes: document.querySelectorAll('a, button').length,
          titulo: (document.querySelector('h1, h2')?.textContent || '').trim().slice(0, 30),
          login: !!document.querySelector('input[type=password]'),
        }))
        if (theme === 'light' && w === 1440) {
          console.log(`  ${tab}: ${stats.botoes} elementos | "${stats.titulo}" | tela de login: ${stats.login}`)
        }
        if (found.length) {
          total += found.length
          console.log(`\n[${theme} ${w}px] ${tab}`)
          const seen = new Set()
          for (const f of found) {
            const k = JSON.stringify(f)
            if (seen.has(k)) continue
            seen.add(k)
            console.log('   ', k)
          }
        }
      } catch (e) {
        console.log(`[${theme} ${w}px] ${tab} -> erro: ${e.message.slice(0, 70)}`)
      }
      await p.close()
    }
    await c.close()
  }
}
console.log(`\nTOTAL: ${total}`)
await b.close()
