import { chromium } from '@playwright/test'

const BASE = process.env.BASE || 'https://adm.geeketoys.com.br'
const WIDTHS = [1440, 900, 390]

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
        problems.push({ tipo: 'conteudo-quebrado', texto: el.textContent.trim().slice(0, 40) })
        break
      }
    }
  }
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    problems.push({ tipo: 'overflow-horizontal', largura: document.documentElement.scrollWidth })
  }
  for (const el of document.querySelectorAll('.modal-overlay *, [role=dialog] *')) {
    const p = el.parentElement
    if (!p) continue
    // <option> is not in the parent's layout: its box always "overflows".
    if (el.tagName === 'OPTION' || p.tagName === 'SELECT') continue
    // display:contents generates no box. Both sides: as parent it would
    // accuse every child; as element it has a degenerate rect and looks
    // like it is overflowing its own parent.
    if (getComputedStyle(p).display === 'contents') continue
    if (getComputedStyle(el).display === 'contents') continue
    const a = el.getBoundingClientRect()
    const b = p.getBoundingClientRect()
    if (b.width > 0 && (a.right > b.right + 2 || a.left < b.left - 2)) {
      const cs = getComputedStyle(p)
      if (cs.overflowX === 'visible') {
        problems.push({
          tipo: 'vaza-do-container',
          texto: (el.textContent || el.tagName).trim().slice(0, 35),
          sobra: Math.round(Math.max(a.right - b.right, b.left - a.left)),
        })
      }
    }
  }
  return problems
}

const cenarios = [
  {
    nome: 'ProductModal (novo)',
    tab: 'products',
    abrir: async (p) => {
      await p.getByRole('button', { name: /Novo Produto/i }).click()
      await p.waitForTimeout(900)
    },
  },
  {
    nome: 'ProductModal (com variações geradas)',
    tab: 'products',
    abrir: async (p) => {
      await p.getByRole('button', { name: /Novo Produto/i }).click()
      await p.waitForTimeout(700)
      await p.getByLabel(/Ativar variações/i).check()
      await p.getByPlaceholder('Ex.: Rosa').fill('Rosa')
      await p.getByRole('button', { name: /Gerar combinações/i }).click()
      await p.waitForTimeout(900)
    },
  },
  {
    nome: 'StockTab histórico',
    tab: 'stock',
    abrir: async (p) => {
      const btn = p.getByRole('button', { name: /^Histórico de / }).first()
      if ((await btn.count()) === 0) return false
      await btn.click()
      await p.waitForTimeout(900)
    },
  },
  {
    nome: 'MemberModal (novo)',
    tab: 'members',
    abrir: async (p) => {
      const btn = p.getByRole('button', { name: /Novo Membro|Adicionar Membro/i }).first()
      if ((await btn.count()) === 0) return false
      await btn.click()
      await p.waitForTimeout(900)
    },
  },
  {
    nome: 'UserModal (novo)',
    tab: 'users',
    abrir: async (p) => {
      const btn = p.getByRole('button', { name: /Novo Usuário|Adicionar Usuário/i }).first()
      if ((await btn.count()) === 0) return false
      await btn.click()
      await p.waitForTimeout(900)
    },
  },
]

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
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
for (const w of WIDTHS) {
  const c = await b.newContext({ viewport: { width: w, height: 900 }, storageState: storage })
  for (const cen of cenarios) {
    const p = await c.newPage()
    try {
      await p.goto(`${BASE}/admin?tab=${cen.tab}`, { waitUntil: 'networkidle', timeout: 40000 })
      await p.waitForTimeout(1200)
      const r = await cen.abrir(p)
      if (r === false) {
        console.log(`[${w}px] ${cen.nome}: nao abriu (sem gatilho na tela)`)
        await p.close()
        continue
      }
      const found = await p.evaluate(probe)
      const temModal = await p.evaluate(
        () => !!document.querySelector('.modal-overlay, [role=dialog]')
      )
      if (!temModal) {
        console.log(`[${w}px] ${cen.nome}: modal nao apareceu`)
      } else if (found.length) {
        total += found.length
        console.log(`\n[${w}px] ${cen.nome}`)
        const seen = new Set()
        for (const f of found) {
          const k = JSON.stringify(f)
          if (seen.has(k)) continue
          seen.add(k)
          console.log('   ', k)
        }
      } else {
        console.log(`[${w}px] ${cen.nome}: ok`)
      }
    } catch (e) {
      console.log(`[${w}px] ${cen.nome} -> erro: ${e.message.slice(0, 70)}`)
    }
    await p.close()
  }
  await c.close()
}
console.log(`\nTOTAL: ${total}`)
await b.close()
