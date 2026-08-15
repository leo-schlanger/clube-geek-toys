/**
 * Verifica o Content-Security-Policy das SPAs contra o site no ar.
 *
 * Navega pelas telas reais e coleta `securitypolicyviolation`. Como roda contra
 * produção, API, fontes, Stripe, Turnstile, Umami e embeds se comportam
 * exatamente como para um visitante.
 *
 *   node scripts/qa/csp-probe.mjs                 # usa o CSP que o servidor manda
 *   node scripts/qa/csp-probe.mjs "<policy>"      # testa uma policy candidata
 *
 * Rode antes de subir qualquer integração externa nova (um CDN, um provedor de
 * pagamento, um embed): host que faltar na policy morre calado no navegador.
 */
import { chromium } from '@playwright/test'

const CANDIDATE = process.argv[2] || null

const BASE_SHOP = process.env.CSP_SHOP ?? 'https://shop.geeketoys.com.br'
const BASE_CLUB = process.env.CSP_CLUB ?? 'https://club.geeketoys.com.br'
const BASE_ADM = process.env.CSP_ADM ?? 'https://adm.geeketoys.com.br'

const PAGES = [
  ['shop home', `${BASE_SHOP}/`],
  ['shop carrinho', `${BASE_SHOP}/carrinho`],
  ['shop checkout', `${BASE_SHOP}/checkout`],
  ['shop entrar', `${BASE_SHOP}/entrar`],
  ['shop evento', `${BASE_SHOP}/evento`],
  ['club login', `${BASE_CLUB}/login`],
  ['club cadastro', `${BASE_CLUB}/cadastro`],
  ['admin login', `${BASE_ADM}/login`],
]

const browser = await chromium.launch()
const ctx = await browser.newContext()

// O Umami só é injetado após o consentimento — sem isso o script-src dele
// nunca seria exercitado.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem(
      'clube_geek_cookie_consent',
      JSON.stringify({ essential: true, analytics: true, acceptedAll: true, date: '2026-01-01' })
    )
  } catch {
    /* ignore */
  }
})

if (CANDIDATE) {
  await ctx.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue()
    const res = await route.fetch()
    const headers = { ...res.headers() }
    delete headers['content-security-policy']
    delete headers['content-security-policy-report-only']
    headers['content-security-policy'] = CANDIDATE
    route.fulfill({ response: res, headers })
  })
}

const all = new Map()
let failures = 0
let sawHeader = false

for (const [label, url] of PAGES) {
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    window.__csp = []
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blocked: (e.blockedURI || '').slice(0, 100),
        source: (e.sourceFile || '').slice(-70),
        line: e.lineNumber,
      })
    })
  })

  let header = ''
  page.on('response', (r) => {
    if (r.url() === url) header = r.headers()['content-security-policy'] || ''
  })

  let violations = []
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 })
    await page.waitForTimeout(2500)
    violations = await page.evaluate(() => window.__csp || [])
  } catch (err) {
    console.log(`  ⚠  ${label}: ${String(err).slice(0, 110)}`)
  }

  if (header) sawHeader = true
  if (violations.length) failures += violations.length
  for (const v of violations) {
    const key = `${v.directive} ← ${v.blocked || '(inline)'}`
    if (!all.has(key)) all.set(key, { ...v, pages: new Set() })
    all.get(key).pages.add(label)
  }

  console.log(
    `${violations.length ? '❌' : '✅'} ${label.padEnd(24)} ` +
      `violações=${violations.length}${!CANDIDATE && !header ? '  ⚠ SEM header CSP' : ''}`
  )
  await page.close()
}

console.log('\n═══ RESUMO ═══')
if (!CANDIDATE && !sawHeader) {
  console.log('⚠  nenhuma página devolveu Content-Security-Policy — o header não está no ar.')
}
if (all.size === 0) {
  console.log('✅ nenhuma violação')
} else {
  for (const [key, v] of all) {
    console.log(`❌ ${key}`)
    console.log(`     origem: ${v.source}:${v.line}`)
    console.log(`     páginas: ${[...v.pages].join(', ')}`)
  }
}

await browser.close()
process.exit(failures > 0 || (!CANDIDATE && !sawHeader) ? 1 : 0)
