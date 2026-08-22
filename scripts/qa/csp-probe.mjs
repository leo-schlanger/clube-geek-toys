/**
 * Check the SPAs' Content-Security-Policy against the live site.
 *
 * Walks real screens and collects `securitypolicyviolation`. Against
 * production, API, fonts, Stripe, Turnstile, Umami and embeds behave as
 * they do for a visitor.
 *
 *   node scripts/qa/csp-probe.mjs                 # uses the server's CSP
 *   node scripts/qa/csp-probe.mjs "<policy>"      # tests a candidate policy
 *
 * Run before adding any new external integration (CDN, payment, embed):
 * a host missing from the policy dies silently in the browser.
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

// Umami is injected only after consent — without this, its script-src
// is never exercised.
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

/**
 * Known, harmless violation: zod probes `new Function("")` inside a
 * try/catch to decide whether it can compile an optimized validator.
 * Under CSP it falls back to the interpreted path — registration
 * validation checked in-browser with the live policy (15/08/2026).
 * Allowing 'unsafe-eval' for this would open all of script-src for a
 * report that breaks nothing.
 *
 * Listed, but does not fail the run. Any NEW violation fails.
 */
const BENIGNAS = [{ directive: 'script-src', blocked: 'eval', source: /schemas-.*\.js$/ }]

const isBenigna = (v) =>
  BENIGNAS.some(
    (b) =>
      v.directive === b.directive && v.blocked === b.blocked && b.source.test(v.source || '')
  )

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
  const novas = violations.filter((v) => !isBenigna(v))
  failures += novas.length
  for (const v of violations) {
    const key = `${v.directive} ← ${v.blocked || '(inline)'}`
    if (!all.has(key)) all.set(key, { ...v, benigna: isBenigna(v), pages: new Set() })
    all.get(key).pages.add(label)
  }

  const marca = novas.length ? '❌' : violations.length ? '🟡' : '✅'
  console.log(
    `${marca} ${label.padEnd(24)} ` +
      `novas=${novas.length}${violations.length - novas.length ? ` conhecidas=${violations.length - novas.length}` : ''}` +
      `${!CANDIDATE && !header ? '  ⚠ SEM header CSP' : ''}`
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
    console.log(`${v.benigna ? '🟡 conhecida' : '❌ NOVA'}: ${key}`)
    console.log(`     origem: ${v.source}:${v.line}`)
    console.log(`     páginas: ${[...v.pages].join(', ')}`)
  }
}
console.log(failures ? `\n❌ ${failures} violação(ões) nova(s)` : '\n✅ nenhuma violação nova')

await browser.close()
process.exit(failures > 0 || (!CANDIDATE && !sawHeader) ? 1 : 0)
