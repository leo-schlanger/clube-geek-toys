import { describe, it, expect } from 'vitest'
import type { Product, ProductVariant } from '../types'
import { FALLBACK_EVENT } from '../data/event'
import { breadcrumbJsonLd, eventJsonLd, productJsonLd } from './structured-data'

const ORIGIN = 'https://shop.geekpoptoys.com.br'

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Álbum Proof',
    slug: 'album-proof',
    description: 'Álbum oficial.\n\n- Photocard aleatório',
    price: 199.9,
    compareAtPrice: null,
    categoryId: null,
    images: ['/uploads/products/p1/a.jpg', 'https://api.geeketoys.com.br/uploads/b.jpg'],
    stock: 3,
    sku: null,
    active: true,
    featured: false,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
    ...overrides,
  }
}

function variant(price: number, stock: number, active = true): ProductVariant {
  return {
    id: `v${price}`,
    productId: 'p1',
    name: String(price),
    options: {},
    sku: null,
    price,
    compareAtPrice: null,
    stock,
    images: [],
    active,
    sortOrder: 0,
  }
}

describe('productJsonLd', () => {
  it('describes the product with an absolute image and a BRL offer from the store', () => {
    const data = productJsonLd(product(), ORIGIN)!
    expect(data['@type']).toBe('Product')
    expect(data.image).toEqual([
      `${ORIGIN}/uploads/products/p1/a.jpg`,
      'https://api.geeketoys.com.br/uploads/b.jpg',
    ])
    expect(data.description).toBe('Álbum oficial. - Photocard aleatório')
    expect(data.sku).toBe('p1')
    expect(data.offers).toMatchObject({
      '@type': 'Offer',
      price: '199.90',
      priceCurrency: 'BRL',
      availability: 'https://schema.org/InStock',
      url: `${ORIGIN}/produto/album-proof`,
      seller: { '@id': `${ORIGIN}/#store` },
    })
    expect(data).not.toHaveProperty('aggregateRating')
  })

  it('reads availability from what can be sold, not the raw stock', () => {
    const data = productJsonLd(product({ stock: 2, available: 0 }), ORIGIN)!
    expect((data.offers as Record<string, unknown>).availability).toBe('https://schema.org/OutOfStock')
  })

  it('a product with variations is a price range over the active ones', () => {
    const data = productJsonLd(
      product({
        hasVariants: true,
        variants: [variant(50, 0), variant(80, 1), variant(10, 5, false)],
      }),
      ORIGIN
    )!
    expect(data.offers).toMatchObject({
      '@type': 'AggregateOffer',
      lowPrice: '50.00',
      highPrice: '80.00',
      offerCount: 2,
      availability: 'https://schema.org/InStock',
    })
  })

  // Google flags a R$ 0,00 offer, and the shelf already shows it as unavailable.
  it('emits nothing for a product without a sellable price', () => {
    expect(productJsonLd(product({ price: 0 }), ORIGIN)).toBeNull()
  })

  it('carries the rating only when there are reviews', () => {
    const data = productJsonLd(product({ ratingAvg: 4.666, ratingCount: 3 }), ORIGIN)!
    expect(data.aggregateRating).toMatchObject({ ratingValue: 4.7, reviewCount: 3 })
  })
})

describe('breadcrumbJsonLd', () => {
  it('starts at the store and numbers each step', () => {
    const data = breadcrumbJsonLd([{ name: 'Photocards', path: '/categoria/photocards' }], ORIGIN)
    expect(data.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Loja', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Photocards', item: `${ORIGIN}/categoria/photocards` },
    ])
  })
})

describe('eventJsonLd', () => {
  it('carries date, place and the ticket offer', () => {
    const data = eventJsonLd(FALLBACK_EVENT, ORIGIN)
    expect(data['@type']).toBe('Event')
    expect(data.startDate).toBe(FALLBACK_EVENT.startsAt)
    expect(data.location).toMatchObject({ name: 'Mar Palace Copacabana Hotel' })
    expect(data.offers).toMatchObject({ price: '20.00', priceCurrency: 'BRL' })
    expect(data.image).toEqual([`${ORIGIN}/og-image.png`])
  })
})
