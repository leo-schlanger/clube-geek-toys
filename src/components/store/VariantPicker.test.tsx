import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VariantPicker, matchVariant, resolveVariantImages } from './VariantPicker'
import type { Product } from '../../types'

const product: Product = {
  id: 'p1',
  name: 'Bolsa',
  slug: 'bolsa',
  description: null,
  price: 80,
  compareAtPrice: null,
  categoryId: null,
  images: ['https://example.com/listing.jpg'],
  stock: 5,
  sku: null,
  active: true,
  featured: false,
  hasVariants: true,
  variantAxes: [
    { name: 'Cor', options: ['Rosa', 'Preto'] },
    { name: 'Tamanho', options: ['P', 'M'] },
  ],
  variants: [
    {
      id: 'v1',
      productId: 'p1',
      name: 'Rosa / P',
      options: { Cor: 'Rosa', Tamanho: 'P' },
      sku: 'BP',
      price: 80,
      compareAtPrice: null,
      stock: 2,
      images: ['https://example.com/rosa.jpg'],
      active: true,
      sortOrder: 0,
    },
    {
      id: 'v2',
      productId: 'p1',
      name: 'Preto / M',
      options: { Cor: 'Preto', Tamanho: 'M' },
      sku: 'BM',
      price: 90,
      compareAtPrice: null,
      stock: 0,
      images: ['https://example.com/preto.jpg'],
      active: true,
      sortOrder: 1,
    },
  ],
  createdAt: '',
  updatedAt: '',
}

describe('VariantPicker / matchVariant', () => {
  it('matchVariant resolves combination', () => {
    expect(matchVariant(product, { Cor: 'Rosa', Tamanho: 'P' })?.id).toBe('v1')
    expect(matchVariant(product, { Cor: 'Preto', Tamanho: 'M' })?.stock).toBe(0)
    expect(matchVariant(product, { Cor: 'Rosa' })).toBeNull()
  })

  it('renders axes and selects option', () => {
    const onChange = vi.fn()
    render(
      <VariantPicker
        product={product}
        selected={{ Cor: 'Rosa', Tamanho: 'P' }}
        onChange={onChange}
        matched={product.variants![0]}
      />
    )
    expect(screen.getByText('Variações')).toBeInTheDocument()
    expect(screen.getByText('Rosa')).toBeInTheDocument()
    // Preto is unavailable (stock 0 / no valid combo with Tamanho P) — toggle selected Rosa instead
    fireEvent.click(screen.getByRole('button', { name: /Rosa/i }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ Cor: '', Tamanho: 'P' })
    )
  })

  it('shows image swatches when variants have photos', () => {
    render(
      <VariantPicker
        product={product}
        selected={{ Cor: 'Rosa', Tamanho: 'P' }}
        onChange={vi.fn()}
        matched={product.variants![0]}
      />
    )
    const imgs = screen.getAllByRole('img')
    expect(imgs.length).toBeGreaterThan(0)
  })

  it('resolveVariantImages prefers matched, then partial, then listing', () => {
    expect(resolveVariantImages(product, { Cor: 'Rosa', Tamanho: 'P' }, product.variants![0])).toEqual([
      'https://example.com/rosa.jpg',
    ])
    expect(resolveVariantImages(product, { Cor: 'Preto' }, null)).toEqual([
      'https://example.com/preto.jpg',
    ])
    expect(resolveVariantImages(product, {}, null)).toEqual(['https://example.com/listing.jpg'])
  })
})
