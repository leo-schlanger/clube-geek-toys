import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const mockMode = vi.hoisted(() => ({ value: 'shop' as 'shop' | 'club' }))
const CANONICAL = { shop: 'https://shop.geekpoptoys.com.br', club: 'https://club.geeketoys.com.br' }
vi.mock('../../lib/subdomain', () => ({
  getAppMode: () => mockMode.value,
  getCanonicalOrigin: () => CANONICAL[mockMode.value],
}))

import { SeoHead } from './SeoHead'

/**
 * SPA-side SEO. Worth remembering the reach: link crawlers (WhatsApp,
 * Facebook) do not run JS and never see any of this — they are served by
 * `shop.html` / `index.html` and the nginx `/__share/` route. This covers
 * Google, which does execute JS.
 */

function meta(attr: 'name' | 'property', key: string): string | null {
  return (
    document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
  )?.content ?? null
}

function canonical(): string | null {
  return (document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href ?? null
}

const originalTitle = document.title

beforeEach(() => {
  document.title = ''
  document.head.querySelectorAll('meta, link[rel="canonical"]').forEach((el) => el.remove())
  mockMode.value = 'shop'
})

afterEach(() => {
  cleanup()
  document.title = originalTitle
})

describe('SeoHead — title and canonical', () => {
  it('appends the site name when the title lacks the brand', () => {
    render(<SeoHead title="Carrinho" path="/carrinho" />)
    expect(document.title).toBe('Carrinho | Loja GeekPop & Toys')
  })

  it('respects a title that already carries the brand', () => {
    render(<SeoHead title="Loja GeekPop & Toys | K-pop" />)
    expect(document.title).toBe('Loja GeekPop & Toys | K-pop')
  })

  it('uses the club site name in club mode', () => {
    mockMode.value = 'club'
    render(<SeoHead title="Assinar" />)
    expect(meta('property', 'og:site_name')).toBe('Clube GeekPop & Toys')
  })

  it('points the canonical at the origin and path', () => {
    render(<SeoHead title="Produto" path="/produto/x" />)
    expect(canonical()).toBe('https://shop.geekpoptoys.com.br/produto/x')
  })

  it('accepts a path without a leading slash', () => {
    render(<SeoHead title="X" path="carrinho" />)
    expect(canonical()).toBe('https://shop.geekpoptoys.com.br/carrinho')
  })
})

describe('SeoHead — imagem', () => {
  // Regression: the default came from a ternary with identical branches, and
  // product photos arrived relative, vanishing from the preview.
  it('torna caminho relativo absoluto', () => {
    render(<SeoHead title="Produto" image="/uploads/a.jpg" />)
    expect(meta('property', 'og:image')).toBe('https://shop.geekpoptoys.com.br/uploads/a.jpg')
  })

  it('preserves an already absolute URL', () => {
    render(<SeoHead title="Produto" image="https://api.geeketoys.com.br/uploads/a.jpg" />)
    expect(meta('property', 'og:image')).toBe('https://api.geeketoys.com.br/uploads/a.jpg')
  })

  it('falls back to the default og-image when there is no photo', () => {
    render(<SeoHead title="Carrinho" />)
    expect(meta('property', 'og:image')).toBe('https://shop.geekpoptoys.com.br/og-image.png')
  })

  it('keeps twitter:image and og:image identical', () => {
    render(<SeoHead title="P" image="/uploads/a.jpg" />)
    expect(meta('name', 'twitter:image')).toBe(meta('property', 'og:image'))
  })
})

describe('SeoHead — indexing', () => {
  it('allows indexing by default', () => {
    render(<SeoHead title="Vitrine" />)
    expect(meta('name', 'robots')).toBe('index, follow, max-image-preview:large')
  })

  it('blocks indexing when noIndex is set', () => {
    render(<SeoHead title="Checkout" noIndex />)
    expect(meta('name', 'robots')).toBe('noindex, nofollow')
  })

  it('sets og:type product on a product page', () => {
    render(<SeoHead title="P" type="product" />)
    expect(meta('property', 'og:type')).toBe('product')
  })
})

describe('SeoHead — stale meta across navigations', () => {
  // The bug: an empty value returned early and the previous tag stayed in the
  // head. Going from a product to the cart kept the product's description.
  it('removes the description when the new page has none', () => {
    const { unmount } = render(<SeoHead title="Produto" description="Photocard raro" />)
    expect(meta('name', 'description')).toBe('Photocard raro')
    unmount()

    render(<SeoHead title="Carrinho" />)
    expect(meta('name', 'description')).toBeNull()
    expect(meta('property', 'og:description')).toBeNull()
  })

  it('replaces the description on page change', () => {
    const { unmount } = render(<SeoHead title="A" description="primeira" />)
    unmount()
    render(<SeoHead title="B" description="segunda" />)

    expect(meta('name', 'description')).toBe('segunda')
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
  })

  it('does not duplicate tags on re-render', () => {
    const { rerender } = render(<SeoHead title="A" description="x" />)
    rerender(<SeoHead title="A" description="y" />)

    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
    expect(meta('property', 'og:description')).toBe('y')
  })
})

describe('SeoHead — canonical domain', () => {
  // Regression: the canonical came from window.location.origin, so each mirror
  // declared itself canonical. Google reads that as duplicate content and
  // splits the ranking authority instead of adding it up.
  it('uses the shop canonical, not the host in use', () => {
    render(<SeoHead title="Vitrine" path="/" />)

    expect(canonical()).toBe('https://shop.geekpoptoys.com.br/')
    expect(meta('property', 'og:url')).toBe('https://shop.geekpoptoys.com.br/')
  })

  it('uses the club canonical in club mode', () => {
    mockMode.value = 'club'
    render(<SeoHead title="Assinar" path="/assinar" />)

    expect(canonical()).toBe('https://club.geeketoys.com.br/assinar')
  })

  it('never lets the canonical vary with the window host', () => {
    // jsdom serves on localhost; a canonical reflecting it would show up here.
    render(<SeoHead title="X" path="/" />)
    expect(canonical()).not.toContain(window.location.hostname)
  })
})
