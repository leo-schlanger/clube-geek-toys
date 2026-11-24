import { describe, it, expect } from 'vitest'

// geekpoptoys.com.br is the main domain (Leo, 06/11/2026). geeketoys stays only
// where it is functional: API, radio, analytics, e-mail, social handles, the
// printed QR origin and the host routing. Anything else a customer can see or
// click (text, links) says geekpoptoys. Family: every source file.
const sources = import.meta.glob(['../**/*.{ts,tsx,css}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const ALLOWED =
  /(?:api|radio|analytics)\.geeketoys\.com\.br|[\w.-]+@geeketoys\.com\.br|MEMBER_VERIFY_ORIGIN = 'https:\/\/club\.geeketoys\.com\.br'|endsWith\('geeketoys\.com\.br'\)|\(geeketoys\.com\.br and geekpoptoys\.com\.br\)/g

describe('legacy domain (family: every source file of the SPA)', () => {
  it('scans the app', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100)
  })

  it('no visible geeketoys.com.br outside the functional hosts', () => {
    const hits = Object.entries(sources).flatMap(([file, src]) =>
      src
        .split('\n')
        .map((line, i) => ({ line: line.replace(ALLOWED, ''), n: i + 1 }))
        .filter(({ line }) => /geeketoys\.com\.br/.test(line))
        .map(({ n, line }) => `${file}:${n}: ${line.trim().slice(0, 80)}`)
    )
    expect(hits).toEqual([])
  })
})
