import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CLUB_PLAN } from '../types'
import { clubOrganizationJsonLd, clubPlanJsonLd, faqJsonLd } from './club-structured-data'
import { clubSeoDescription } from './club-value'
import { SHOP_DEFAULT_SEO } from '../components/store/SeoHead'

const ORIGIN = 'https://club.geekpoptoys.com.br'
const shell = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('club structured data', () => {
  it('declares the plan at the price the club charges', () => {
    const offer = clubPlanJsonLd(ORIGIN).offers as Record<string, unknown>
    expect(offer.price).toBe(CLUB_PLAN.price.toFixed(2))
    expect(offer.url).toBe(`${ORIGIN}/assinar`)
  })

  it('builds the FAQ from the questions given, in order', () => {
    const faq = faqJsonLd([{ q: 'P1?', a: 'R1' }, { q: 'P2?', a: 'R2' }])
    expect((faq.mainEntity as { name: string }[]).map((x) => x.name)).toEqual(['P1?', 'P2?'])
  })

  it('points the organization at the canonical club host', () => {
    expect(clubOrganizationJsonLd(ORIGIN).url).toBe(`${ORIGIN}/assinar`)
  })

  // The club shell is served on every club route and on the admin panel.
  it('is no longer in the club shell, which keeps no canonical either', () => {
    const html = shell('index.html')
    expect(html).not.toContain('application/ld+json')
    for (const f of ['index.html', 'shop.html']) expect(shell(f), f).not.toMatch(/rel="canonical"/)
  })
})

// Google cuts titles near 60 characters and descriptions near 155.
describe('search snippet length', () => {
  const decode = (s: string) => s.replace(/&amp;/g, '&')
  it.each(['index.html', 'shop.html'])('%s shell title ≤ 60 and description ≤ 155', (f) => {
    const html = shell(f)
    const title = decode(html.match(/<title>([^<]*)<\/title>/)![1])
    const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)![1])
    expect(title.length, title).toBeLessThanOrEqual(60)
    expect(desc.length, desc).toBeLessThanOrEqual(155)
  })

  it('shop home title ≤ 60 and description ≤ 155', () => {
    expect(SHOP_DEFAULT_SEO.title.length).toBeLessThanOrEqual(60)
    expect(SHOP_DEFAULT_SEO.description.length).toBeLessThanOrEqual(155)
  })

  it('/assinar description ≤ 155 with the whole offer in it', () => {
    const d = clubSeoDescription()
    expect(d.length, d).toBeLessThanOrEqual(155)
    for (const part of ['159,90', '13,33', '10%', '50%', 'brinde']) expect(d).toContain(part)
  })
})
