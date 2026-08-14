import { describe, it, expect } from 'vitest'
import {
  parseProductSort,
  isProductSort,
  sortProducts,
  parseCatalogPage,
  catalogPageCount,
  DEFAULT_PRODUCT_SORT,
} from './product-sort'

const items = [
  { name: 'Photocard Jungkook', price: 30, createdAt: '2026-08-01T10:00:00Z' },
  { name: 'Photocard Jimin', price: 25, createdAt: '2026-08-10T10:00:00Z' },
  { name: 'Álbum BTS', price: 120, createdAt: '2026-07-01T10:00:00Z' },
]

describe('product-sort', () => {
  it('parses known sorts and falls back to newest', () => {
    expect(parseProductSort('name')).toBe('name')
    expect(parseProductSort('price_asc')).toBe('price_asc')
    expect(parseProductSort('nope')).toBe(DEFAULT_PRODUCT_SORT)
    expect(parseProductSort(null)).toBe('newest')
    expect(isProductSort('oldest')).toBe(true)
    expect(isProductSort('featured')).toBe(false)
  })

  it('groups photocards together alphabetically', () => {
    const names = sortProducts(items, 'name').map((p) => p.name)
    expect(names).toEqual(['Álbum BTS', 'Photocard Jimin', 'Photocard Jungkook'])
  })

  it('sorts by price and posting date', () => {
    expect(sortProducts(items, 'price_asc').map((p) => p.price)).toEqual([25, 30, 120])
    expect(sortProducts(items, 'price_desc').map((p) => p.price)).toEqual([120, 30, 25])
    expect(sortProducts(items, 'newest').map((p) => p.name)[0]).toBe('Photocard Jimin')
    expect(sortProducts(items, 'oldest').map((p) => p.name)[0]).toBe('Álbum BTS')
  })

  it('parses catalog page and page count for LIMIT/OFFSET', () => {
    expect(parseCatalogPage(null)).toBe(1)
    expect(parseCatalogPage('0')).toBe(1)
    expect(parseCatalogPage('-2')).toBe(1)
    expect(parseCatalogPage('3')).toBe(3)
    expect(catalogPageCount(50, 24)).toBe(3)
    expect(catalogPageCount(0, 24)).toBe(1)
  })
})
