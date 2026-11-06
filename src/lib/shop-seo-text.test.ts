import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { categoryIntro, categoryTitle, clip, productPhotoAlt } from './shop-seo-text'
import { COMPANY, STORE_LOCATION } from './company'
import { STORE_PICKUP } from './shipping'

describe('categoryIntro', () => {
  it('prefers the description typed in the panel, flattened', () => {
    expect(categoryIntro({ name: 'K-pop', description: '  Álbuns\n\ne photocards.  ' })).toBe(
      'Álbuns e photocards.'
    )
  })

  it('builds a short sentence from the name when there is no description', () => {
    const text = categoryIntro({ name: 'Pokémon', description: null })
    expect(text).toMatch(/^Pokémon na GeekPop & Toys, loja geek e de K-pop em Copacabana/)
    expect(text).toContain('10% de desconto')
    // One mention of the name: an intro, not a keyword list.
    expect(text.match(/Pokémon/g)).toHaveLength(1)
  })
})

describe('categoryTitle', () => {
  it('numbers page 2+ so each page has its own title', () => {
    expect(categoryTitle('Anime')).toBe('Anime')
    expect(categoryTitle('Anime', 3)).toBe('Anime — página 3')
  })
})

describe('clip', () => {
  it('cuts at a word boundary with an ellipsis', () => {
    const out = clip('palavra '.repeat(40), 50)
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out.endsWith('palavra…')).toBe(true)
  })
})

describe('productPhotoAlt', () => {
  it('joins name, variation and position in a gallery', () => {
    expect(productPhotoAlt('Moletom BTS', 'Rosa / M', 1, 5)).toBe('Moletom BTS — Rosa / M — foto 2 de 5')
    expect(productPhotoAlt('Moletom BTS', null, 0, 1)).toBe('Moletom BTS')
    expect(productPhotoAlt('Moletom BTS', '  ')).toBe('Moletom BTS')
  })
})

// shop.html is static; this keeps its Store block in step with company.ts.
describe('shop.html Store JSON-LD', () => {
  const html = readFileSync(resolve(process.cwd(), 'shop.html'), 'utf-8')
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]) as Record<string, unknown>
  )
  const store = blocks.find((b) => b['@type'] === 'Store') as Record<string, unknown>

  it('matches the company facts', () => {
    expect(store['@id']).toBe('https://shop.geekpoptoys.com.br/#store')
    expect(store.name).toBe(COMPANY.brand)
    expect(store.legalName).toBe(COMPANY.legalName)
    expect(store.taxID).toBe(COMPANY.cnpj)
    expect(store.email).toBe(COMPANY.email)
    expect(store.address).toMatchObject({
      streetAddress: COMPANY.street,
      addressLocality: COMPANY.city,
      addressRegion: COMPANY.state,
      postalCode: STORE_LOCATION.postalCode,
      addressCountry: 'BR',
    })
    expect(store.telephone).toBe(STORE_LOCATION.telephone)
    expect(store.geo).toEqual({ '@type': 'GeoCoordinates', ...STORE_LOCATION.geo })
    expect(store.sameAs).toEqual(STORE_LOCATION.sameAs)
    expect(STORE_LOCATION.sameAs).toContain(STORE_LOCATION.instagram)
    expect(store.openingHoursSpecification).toEqual(
      STORE_LOCATION.openingHours.map((h) => ({ '@type': 'OpeningHoursSpecification', ...h }))
    )
  })

  it('declares the Google Business hours, the same the pickup text shows', () => {
    expect(STORE_LOCATION.openingHours).toEqual([
      { dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '19:00' },
      { dayOfWeek: ['Saturday'], opens: '09:00', closes: '16:00' },
    ])
    expect(STORE_PICKUP.hours).toBe('Segunda a sexta, 9h às 19h; sábado, 9h às 16h')
    expect(STORE_LOCATION.geo).toEqual({ latitude: -22.9652592, longitude: -43.1800191 })
    expect(STORE_LOCATION.telephone).toBe('+55-21-98546-4666')
  })

  // The API snapshots the pickup text onto the order and its e-mail.
  it('says the same pickup hours in the API', () => {
    const api = readFileSync(resolve(process.cwd(), 'server/api/src/services/shipping.service.ts'), 'utf-8')
    expect(api).toContain(`hours: '${STORE_PICKUP.hours}'`)
  })

  it('keeps the share tags above every script', () => {
    expect(html.indexOf('og:image')).toBeLessThan(html.indexOf('<script'))
  })
})
