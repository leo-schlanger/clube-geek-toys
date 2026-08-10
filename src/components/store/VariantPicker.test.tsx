import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VariantPicker, matchVariant } from './VariantPicker'
import type { Product } from '../../types'

const product: Product = {
  id: 'p1',
  name: 'Bolsa',
  slug: 'bolsa',
  description: null,
  price: 80,
  compareAtPrice: null,
  categoryId: null,
  images: [],
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
      images: [],
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
      images: [],
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
    fireEvent.click(screen.getByText('Preto'))
    expect(onChange).toHaveBeenCalled()
  })
})
