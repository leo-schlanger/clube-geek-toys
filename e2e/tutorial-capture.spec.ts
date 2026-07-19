import { test, type Page, type Locator } from '@playwright/test'

/**
 * Captura screenshots ANOTADOS (setas + caixas + legendas) do painel admin em
 * produção, para o tutorial de funcionários. Cria 2 produtos "[DEMO]" pra popular
 * a tela de produtos e os remove depois (via SQL, fora daqui).
 *
 * O Playwright resolve os elementos (locators) e passa só as bounding boxes pro
 * desenho no browser — evita seletores incompatíveis com querySelector.
 *
 * Roda só desktop. Precisa de E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 */

const ADMIN = 'https://admin.geeketoys.com.br'
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? ''
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''
const OUT = 'e2e/tutorial'

type Target = { loc: Locator; label: string }
type Box = { x: number; y: number; width: number; height: number }

test.use({ viewport: { width: 1440, height: 980 } })

test.describe('Captura tutorial admin', () => {
  test.skip(!EMAIL || !PASSWORD, 'sem creds')

  async function preConsent(page: Page) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'clube_geek_cookie_consent',
          JSON.stringify({ essential: true, analytics: false, acceptedAll: false, date: '2026-01-01' })
        )
      } catch { /* ignore */ }
    })
  }

  async function drawAnnotations(page: Page, resolved: { box: Box; label: string }[], blurSel: string[]) {
    await page.evaluate(
      ({ resolved, blurSel }) => {
        document.getElementById('__annot')?.remove()
        for (const bs of blurSel) {
          document.querySelectorAll<HTMLElement>(bs).forEach((el) => (el.style.filter = 'blur(6px)'))
        }
        const layer = document.createElement('div')
        layer.id = '__annot'
        layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:Arial,Helvetica,sans-serif'
        document.body.appendChild(layer)
        const NS = 'http://www.w3.org/2000/svg'
        const svg = document.createElementNS(NS, 'svg')
        svg.setAttribute('style', 'position:absolute;inset:0;width:100vw;height:100vh')
        const defs = document.createElementNS(NS, 'defs')
        defs.innerHTML =
          '<marker id="ah" markerWidth="12" markerHeight="12" refX="8" refY="4" orient="auto"><path d="M0,0 L9,4 L0,8 Z" fill="#ec4899"/></marker>'
        svg.appendChild(defs)
        layer.appendChild(svg)

        let stackTop = 16
        resolved.forEach(({ box: r, label }) => {
          const boxEl = document.createElement('div')
          boxEl.style.cssText = `position:fixed;left:${r.x - 4}px;top:${r.y - 4}px;width:${r.width + 8}px;height:${r.height + 8}px;border:3px solid #ec4899;border-radius:8px;box-shadow:0 0 0 3px rgba(236,72,153,.25)`
          layer.appendChild(boxEl)

          const toRight = r.x + r.width < window.innerWidth - 300
          const lw = 250
          const lx = toRight
            ? Math.min(r.x + r.width + 80, window.innerWidth - lw - 12)
            : Math.max(r.x - 80 - lw, 12)
          const ly = Math.max(stackTop, Math.min(r.y, window.innerHeight - 46))
          stackTop = ly + 54

          const lab = document.createElement('div')
          lab.textContent = label
          lab.style.cssText = `position:fixed;left:${lx}px;top:${ly}px;width:${lw}px;background:#ec4899;color:#fff;padding:7px 11px;border-radius:9px;font-size:14px;font-weight:700;line-height:1.25;box-shadow:0 3px 10px rgba(0,0,0,.45)`
          layer.appendChild(lab)

          const x1 = toRight ? lx : lx + lw
          const y1 = ly + 16
          const x2 = toRight ? r.x - 6 : r.x + r.width + 6
          const y2 = r.y + r.height / 2
          const ln = document.createElementNS(NS, 'line')
          ln.setAttribute('x1', String(x1))
          ln.setAttribute('y1', String(y1))
          ln.setAttribute('x2', String(x2))
          ln.setAttribute('y2', String(y2))
          ln.setAttribute('stroke', '#ec4899')
          ln.setAttribute('stroke-width', '3')
          ln.setAttribute('marker-end', 'url(#ah)')
          svg.appendChild(ln)
        })
      },
      { resolved, blurSel }
    )
  }

  async function shot(page: Page, name: string, targets: Target[] = [], blurSel: string[] = []) {
    await page.waitForTimeout(700)
    const resolved: { box: Box; label: string }[] = []
    for (const t of targets) {
      const box = await t.loc
        .first()
        .boundingBox()
        .catch(() => null)
      if (box && box.width > 0) resolved.push({ box, label: t.label })
    }
    if (resolved.length || blurSel.length) await drawAnnotations(page, resolved, blurSel)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    await page.evaluate(() => document.getElementById('__annot')?.remove())
  }

  async function gotoTab(page: Page, label: string) {
    await page.getByRole('button', { name: label, exact: true }).first().click()
    await page.waitForTimeout(1200)
  }

  test('captura', async ({ page }) => {
    test.setTimeout(200_000)
    await preConsent(page)

    // ── 01 Login ────────────────────────────────────────────────────────────
    await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill('••••••••')
    await shot(page, '01-login', [
      { loc: page.locator('#email'), label: '1. Digite seu e-mail de acesso' },
      { loc: page.locator('#password'), label: '2. Digite sua senha' },
      { loc: page.getByRole('button', { name: /Acessar Painel/i }), label: '3. Clique em "Acessar Painel"' },
    ])
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: /Acessar Painel/i }).click()
    await page.waitForURL(/\/admin/, { timeout: 20_000 })
    await page.waitForTimeout(1500)

    // ── 02 Dashboard + navegação ──────────────────────────────────────────────
    await shot(page, '02-dashboard', [
      { loc: page.locator('aside nav'), label: 'Menu lateral: navegue entre as seções' },
      { loc: page.getByRole('button', { name: /Abrir PDV/i }), label: 'Abrir PDV: vendas no balcão' },
      { loc: page.getByRole('button', { name: /^Sair$/i }), label: 'Sair: encerra a sessão' },
    ])

    // ── 05/06 Produtos ────────────────────────────────────────────────────────
    await gotoTab(page, 'Produtos')
    const demos = [
      { name: '[DEMO] Action Figure Goku', price: '149.90', stock: '12' },
      { name: '[DEMO] Caneca Geek Nivel 99', price: '49.90', stock: '30' },
    ]
    for (let i = 0; i < demos.length; i++) {
      const d = demos[i]
      await page.getByRole('button', { name: /Novo Produto/i }).click()
      await page.waitForTimeout(500)
      await page.locator('#product-name').fill(d.name)
      await page.locator('#product-price').fill(d.price)
      await page.locator('#product-stock').fill(d.stock)
      await page.getByPlaceholder(/Colar URL de imagem externa/i).fill('https://placehold.co/600x600.png')
      await page.getByRole('button', { name: /^Adicionar$/i }).click()
      if (i === 0) {
        await shot(page, '06-produto-modal', [
          { loc: page.locator('#product-name'), label: 'Nome do produto (obrigatório)' },
          { loc: page.locator('#product-price'), label: 'Preço de venda' },
          { loc: page.locator('#product-stock'), label: 'Quantidade em estoque' },
          { loc: page.locator('#product-category'), label: 'Categoria (crie novas aqui)' },
          { loc: page.getByPlaceholder(/URL de imagem/i), label: 'Imagens: por URL ou upload' },
          { loc: page.getByRole('button', { name: /Criar Produto/i }), label: 'Salvar o novo produto' },
        ])
      }
      await page.getByRole('button', { name: /Criar Produto/i }).click()
      await page.waitForTimeout(1500)
    }
    await shot(page, '05-produtos', [
      { loc: page.getByRole('button', { name: /Novo Produto/i }), label: 'Cadastrar novo produto' },
      { loc: page.getByPlaceholder(/Buscar/i), label: 'Buscar por nome, SKU ou categoria' },
      { loc: page.locator('table tbody tr').first().locator('button[title="Editar produto"]'), label: 'Editar este produto' },
      { loc: page.locator('table tbody tr').first().locator('button[title="Desativar produto"]'), label: 'Desativar (tira da loja)' },
      { loc: page.locator('table tbody tr').first().locator('td').nth(4), label: 'Status: Ativo = visível na loja' },
    ])

    // ── 03 Membros (PII borrada) ──────────────────────────────────────────────
    await gotoTab(page, 'Membros')
    await shot(
      page,
      '03-membros',
      [
        { loc: page.getByRole('button', { name: /Novo Membro/i }), label: 'Cadastrar membro manualmente' },
        { loc: page.getByPlaceholder(/Buscar/i), label: 'Buscar por nome, CPF ou e-mail' },
      ],
      ['table tbody td']
    )

    // ── 04 Pedidos ────────────────────────────────────────────────────────────
    await gotoTab(page, 'Pedidos')
    await shot(
      page,
      '04-pedidos',
      [{ loc: page.locator('select').first(), label: 'Filtrar pedidos por status' }],
      ['table tbody td']
    )

    // ── 07 Usuários ───────────────────────────────────────────────────────────
    await gotoTab(page, 'Usuários')
    await shot(
      page,
      '07-usuarios',
      [{ loc: page.getByRole('button', { name: /Novo Usuário/i }), label: 'Criar admin ou vendedor' }],
      ['table tbody td']
    )

    // ── 08 Logs ───────────────────────────────────────────────────────────────
    await gotoTab(page, 'Logs')
    await shot(page, '08-logs', [{ loc: page.locator('select, table').first(), label: 'Histórico de ações no sistema' }], ['table tbody td'])

    // ── 09 Relatórios ─────────────────────────────────────────────────────────
    await gotoTab(page, 'Relatórios')
    await page.waitForTimeout(1500)
    await shot(page, '09-relatorios', [{ loc: page.locator('select').first(), label: 'Escolha o período do relatório' }])

    // ── 10 Configurações ──────────────────────────────────────────────────────
    await gotoTab(page, 'Configurações')
    await shot(page, '10-configuracoes', [
      { loc: page.getByRole('button', { name: /Salvar/i }).first(), label: 'Salvar alterações' },
    ])

    // ── 11 PDV ────────────────────────────────────────────────────────────────
    await page.goto(`${ADMIN}/pdv`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await shot(page, '11-pdv', [{ loc: page.locator('input').first(), label: 'Busque produtos para a venda' }])
  })
})
