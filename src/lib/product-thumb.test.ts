import { describe, it, expect } from 'vitest'
import { productCardSrcSet, productThumbUrl } from './product-thumb'

const API = 'https://api.geekpoptoys.com.br/uploads/products/3f2504e0-4f89-11d3-9a0c-0305e82c3301'

describe('productThumbUrl', () => {
  it('derives the API thumbnail name for every photo format the upload accepts', () => {
    expect(productThumbUrl(`${API}/a.jpg`)).toBe(`${API}/a.thumb.webp`)
    expect(productThumbUrl(`${API}/a.JPEG`)).toBe(`${API}/a.thumb.webp`)
    expect(productThumbUrl(`${API}/a.png`)).toBe(`${API}/a.thumb.webp`)
    expect(productThumbUrl(`${API}/a.webp`)).toBe(`${API}/a.thumb.webp`)
  })

  it('has no thumbnail for pasted URLs, videos, thumbnails or nothing', () => {
    expect(productThumbUrl('https://example.com/a.jpg')).toBeNull()
    expect(productThumbUrl(`${API}/clip.mp4`)).toBeNull()
    expect(productThumbUrl(`${API}/a.thumb.webp`)).toBeNull()
    expect(productThumbUrl(null)).toBeNull()
    expect(productCardSrcSet('https://example.com/a.jpg')).toBeUndefined()
  })
})
