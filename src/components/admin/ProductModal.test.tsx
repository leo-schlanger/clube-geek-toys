import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Product, Category } from '../../types'

vi.mock('../../lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('../../lib/products', () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  uploadProductImages: vi.fn(),
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  replaceProductVariants: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { ProductModal } from './ProductModal'
import { updateProduct, replaceProductVariants } from '../../lib/products'
import { toast } from 'sonner'

const mockedUpdate = vi.mocked(updateProduct)
const mockedReplace = vi.mocked(replaceProductVariants)

const categories: Category[] = [
  {
    id: 'c1',
    name: 'Acessório',
    slug: 'acessorio',
    description: null,
    active: true,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  },
]

const product: Product = {
  id: 'p1',
  name: 'Bolsa',
  slug: 'bolsa',
  description: null,
  price: 80,
  compareAtPrice: null,
  categoryId: 'c1',
  images: ['https://example.com/listing.jpg', 'https://example.com/extra.jpg'],
  stock: 10,
  sku: null,
  active: true,
  featured: false,
  hasVariants: true,
  variantAxes: [{ name: 'Cor', options: ['Rosa', 'Preto'] }],
  variants: [
    {
      id: 'v1',
      productId: 'p1',
      name: 'Rosa',
      options: { Cor: 'Rosa' },
      sku: 'R',
      price: 80,
      compareAtPrice: null,
      stock: 4,
      images: [],
      active: true,
      sortOrder: 0,
    },
    {
      id: 'v2',
      productId: 'p1',
      name: 'Preto',
      options: { Cor: 'Preto' },
      sku: 'P',
      price: 85,
      compareAtPrice: null,
      stock: 2,
      images: ['https://example.com/preto.jpg'],
      active: true,
      sortOrder: 1,
    },
  ],
  createdAt: '',
  updatedAt: '',
}

describe('ProductModal — foto por variação', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows per-SKU photo controls and gallery picker', () => {
    render(
      <ProductModal
        mode="edit"
        product={product}
        categories={categories}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    expect(screen.getByText(/SKU\(s\) — foto própria/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Enviar foto da variação Rosa/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Enviar foto da variação Preto/i)).toBeInTheDocument()
    // Galeria do listing disponível para atribuir
    expect(screen.getAllByText(/Da galeria/i).length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('Usar esta imagem na variação').length).toBeGreaterThan(0)
  })

  it('assigns gallery image to a variant row', async () => {
    mockedUpdate.mockResolvedValue(product)
    mockedReplace.mockResolvedValue(product)
    const onSuccess = vi.fn()

    render(
      <ProductModal
        mode="edit"
        product={product}
        categories={categories}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    )

    // Primeira miniatura "Da galeria" da linha Rosa
    const galleryThumbs = screen.getAllByTitle('Usar esta imagem na variação')
    expect(galleryThumbs.length).toBeGreaterThan(0)
    fireEvent.click(galleryThumbs[0])

    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() => {
      expect(mockedReplace).toHaveBeenCalled()
    })

    const variantsArg = mockedReplace.mock.calls[0][2] as { name: string; images?: string[] }[]
    const rosa = variantsArg.find((v) => v.name === 'Rosa')
    expect(rosa?.images?.[0]).toBe('https://example.com/listing.jpg')
    expect(toast.success).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalled()
  })

  it('applies pasted URL as variant image', async () => {
    mockedUpdate.mockResolvedValue(product)
    mockedReplace.mockResolvedValue(product)

    render(
      <ProductModal
        mode="edit"
        product={product}
        categories={categories}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    const urlInputs = screen.getAllByPlaceholderText(/cole URL da foto desta variação/i)
    fireEvent.change(urlInputs[0], { target: { value: 'https://cdn.example.com/rosa-sku.jpg' } })
    // OK next to first URL field
    const okButtons = screen.getAllByRole('button', { name: 'OK' })
    fireEvent.click(okButtons[0])

    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))
    await waitFor(() => expect(mockedReplace).toHaveBeenCalled())

    const variantsArg = mockedReplace.mock.calls[0][2] as { name: string; images?: string[] }[]
    expect(variantsArg.find((v) => v.name === 'Rosa')?.images?.[0]).toBe(
      'https://cdn.example.com/rosa-sku.jpg'
    )
  })
})
