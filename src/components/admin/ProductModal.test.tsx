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
  uploadProductMedia: vi.fn(),
  uploadProductVideo: vi.fn(),
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  replaceProductVariants: vi.fn(),
  MAX_PRODUCT_IMAGES: 30,
  MAX_VARIANT_IMAGES: 10,
  MAX_IMAGE_UPLOAD_BATCH: 20,
  MAX_PRODUCT_CATEGORIES: 5,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
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

describe('ProductModal — per-variant photo', () => {
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

    expect(screen.getByText(/SKU\(s\) — cada um com fotos próprias/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Enviar imagens/i)).toBeInTheDocument()
    const listingInput = screen.getByLabelText(/Enviar imagens/i)
    expect(listingInput).toHaveAttribute('type', 'file')
    expect(listingInput.className).not.toMatch(/\bhidden\b/)
    expect(screen.getByLabelText(/Enviar foto da variação Rosa/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Enviar foto da variação Preto/i)).toBeInTheDocument()
    // Listing gallery available to assign from
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

  it('opens the crop dialog when a listing image is picked', () => {
    render(
      <ProductModal
        mode="edit"
        product={product}
        categories={categories}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )
    const input = screen.getByLabelText(/Enviar imagens/i) as HTMLInputElement
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'foto.jpg', {
      type: 'image/jpeg',
    })
    fireEvent.change(input, { target: { files: [file] } })
    expect(screen.getByRole('dialog', { name: /Cortar imagem/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aplicar recorte/i })).toBeInTheDocument()
  })
})

describe('ProductModal — generating combinations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const semVariacao: Product = { ...product, hasVariants: false, variantAxes: [], variants: [] }

  it('uses the typed option even without pressing "+"', () => {
    // The natural path for someone who skipped the hint: type "Rosa" and go
    // straight to generate. That text used to be discarded, generating nothing.
    render(
      <ProductModal
        mode="edit"
        product={semVariacao}
        categories={categories}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    fireEvent.click(screen.getByLabelText(/Ativar variações/i))
    fireEvent.change(screen.getByPlaceholderText('Ex.: Rosa'), { target: { value: 'Rosa' } })
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/i }))

    expect(screen.getByText(/1 SKU\(s\)/)).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('complains about the axis name, not the options, when the axis is empty', () => {
    render(
      <ProductModal
        mode="edit"
        product={semVariacao}
        categories={categories}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    fireEvent.click(screen.getByLabelText(/Ativar variações/i))
    fireEvent.change(screen.getByPlaceholderText('Cor'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Ex.: Rosa'), { target: { value: 'Rosa' } })
    fireEvent.click(screen.getByRole('button', { name: /Gerar combinações/i }))

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/nome ao tipo/i))
  })
})

describe('ProductModal — rascunho pendente no Salvar', () => {
  // All of these silently dropped data: the admin typed, hit save, saw
  // "product updated" and the value did not exist. No error anywhere.
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUpdate.mockResolvedValue(product)
    mockedReplace.mockResolvedValue(product)
  })

  const semVariacao: Product = { ...product, hasVariants: false, variantAxes: [], variants: [] }

  function renderModal(p: Product) {
    render(
      <ProductModal
        mode="edit"
        product={p}
        categories={categories}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )
  }

  it('saves a pasted video link without pressing add', async () => {
    renderModal(semVariacao)

    fireEvent.change(screen.getByPlaceholderText(/Colar link do YouTube/i), {
      target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled())
    const payload = mockedUpdate.mock.calls[0][1] as { videos?: { url: string }[] }
    expect(payload.videos).toEqual([
      { kind: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    ])
  })

  it('blocks the save when the pasted video link is invalid', async () => {
    renderModal(semVariacao)

    fireEvent.change(screen.getByPlaceholderText(/Colar link do YouTube/i), {
      target: { value: 'https://vimeo.com/12345' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('generates the SKUs when axes were filled without pressing generate', async () => {
    renderModal(semVariacao)

    fireEvent.click(screen.getByLabelText(/Ativar variações/i))
    fireEvent.change(screen.getByPlaceholderText('Cor'), { target: { value: 'Cor' } })
    fireEvent.change(screen.getByPlaceholderText(/Ou cole várias/i), {
      target: { value: 'Rosa, Preto' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() => expect(mockedReplace).toHaveBeenCalled())
    expect(mockedReplace.mock.calls[0][1]).toEqual([{ name: 'Cor', options: ['Rosa', 'Preto'] }])
    const rows = mockedReplace.mock.calls[0][2] as { name: string }[]
    expect(rows.map((r) => r.name)).toEqual(['Rosa', 'Preto'])
  })

  it('adds a new option to a product that already has variants', async () => {
    renderModal(product)

    // "Azul" joins the axes without regenerating; the existing rows keep their
    // ids, prices and photos.
    fireEvent.change(screen.getByPlaceholderText(/Ou cole várias/i), {
      target: { value: 'Rosa, Preto, Azul' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() => expect(mockedReplace).toHaveBeenCalled())
    const rows = mockedReplace.mock.calls[0][2] as {
      id?: string
      name: string
      images?: string[]
    }[]
    expect(rows.map((r) => r.name)).toEqual(['Rosa', 'Preto', 'Azul'])
    expect(rows.find((r) => r.name === 'Preto')?.id).toBe('v2')
    expect(rows.find((r) => r.name === 'Preto')?.images).toEqual(['https://example.com/preto.jpg'])
    expect(rows.find((r) => r.name === 'Azul')?.id).toBeUndefined()
  })

  it('warns instead of saving silently when variants are enabled with no axis', async () => {
    renderModal(semVariacao)

    fireEvent.click(screen.getByLabelText(/Ativar variações/i))
    fireEvent.change(screen.getByPlaceholderText('Cor'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/tipo \+ opções/i))
    )
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('saves a pasted variant photo URL without pressing OK', async () => {
    renderModal(product)

    const urlInputs = screen.getAllByPlaceholderText(/cole URL da foto desta variação/i)
    fireEvent.change(urlInputs[0], { target: { value: 'https://cdn.example.com/rosa-draft.jpg' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() => expect(mockedReplace).toHaveBeenCalled())
    const rows = mockedReplace.mock.calls[0][2] as { name: string; images?: string[] }[]
    expect(rows.find((r) => r.name === 'Rosa')?.images).toEqual([
      'https://cdn.example.com/rosa-draft.jpg',
    ])
  })
})

describe('ProductModal — multiple photos per variant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderEdit() {
    render(
      <ProductModal
        mode="edit"
        product={product}
        categories={categories}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )
  }

  it('accumulates variant photos instead of replacing the previous one', async () => {
    mockedUpdate.mockResolvedValue(product)
    mockedReplace.mockResolvedValue(product)
    renderEdit()

    // "Preto" already has a photo in the fixture; pasting a URL must add, not replace.
    const urlInputs = screen.getAllByPlaceholderText(/cole URL da foto desta variação/i)
    fireEvent.change(urlInputs[1], { target: { value: 'https://cdn.example.com/preto-2.jpg' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'OK' })[1])

    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))
    await waitFor(() => expect(mockedReplace).toHaveBeenCalled())

    const variantsArg = mockedReplace.mock.calls[0][2] as { name: string; images?: string[] }[]
    expect(variantsArg.find((v) => v.name === 'Preto')?.images).toEqual([
      'https://example.com/preto.jpg',
      'https://cdn.example.com/preto-2.jpg',
    ])
  })

  it('does not append a variant photo to the listing gallery', async () => {
    mockedUpdate.mockResolvedValue(product)
    mockedReplace.mockResolvedValue(product)
    renderEdit()

    const before = screen.getByText(/^\(2\/30\)$/)
    expect(before).toBeInTheDocument()

    const urlInputs = screen.getAllByPlaceholderText(/cole URL da foto desta variação/i)
    fireEvent.change(urlInputs[0], { target: { value: 'https://cdn.example.com/rosa.jpg' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'OK' })[0])

    // The listing gallery count must not move: that is what used to blow the cap.
    expect(screen.getByText(/^\(2\/30\)$/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled())
    const payload = mockedUpdate.mock.calls[0][1] as { images?: string[] }
    expect(payload.images).toEqual([
      'https://example.com/listing.jpg',
      'https://example.com/extra.jpg',
    ])
  })

  it('rejects a photo above the per-variant cap', () => {
    const cheio: Product = {
      ...product,
      variants: [
        {
          ...product.variants![0],
          images: Array.from({ length: 10 }, (_, i) => `https://example.com/rosa-${i}.jpg`),
        },
      ],
      variantAxes: [{ name: 'Cor', options: ['Rosa'] }],
    }
    render(
      <ProductModal
        mode="edit"
        product={cheio}
        categories={categories}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    const urlInput = screen.getByPlaceholderText(/cole URL da foto desta variação/i)
    fireEvent.change(urlInput, { target: { value: 'https://cdn.example.com/mais-uma.jpg' } })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))

    expect(toast.error).toHaveBeenCalledWith('Máximo de 10 fotos por variação')
  })
})

describe('ProductModal — form tabs', () => {
  // The modal was ~1100 lines of fields in one scroll and the video block sat
  // in the final third, where it went unfound. Tabs fix that, but only if they
  // hide no work and break no save.
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUpdate.mockResolvedValue(product)
    mockedReplace.mockResolvedValue(product)
  })

  function renderEdit(p: Product = product) {
    render(
      <ProductModal
        mode="edit"
        product={p}
        categories={categories}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )
  }

  function painelDaAba(nome: RegExp): HTMLElement {
    const aba = screen.getByRole('tab', { name: nome })
    // The panel is the tablist's sibling, in the order the groups were mounted.
    const idx = screen.getAllByRole('tab').indexOf(aba)
    const tablist = aba.closest('[role="tablist"]') as HTMLElement
    const paineis = Array.from(tablist.parentElement!.children).filter(
      (el) => el !== tablist
    ) as HTMLElement[]
    return paineis[idx]
  }

  it('opens on the first tab and hides the other sections', () => {
    renderEdit()

    expect(screen.getByRole('tab', { name: /Básico/ })).toHaveAttribute('aria-selected', 'true')
    expect(painelDaAba(/Básico/)).not.toHaveClass('hidden')
    expect(painelDaAba(/Fotos e vídeos/)).toHaveClass('hidden')
    expect(painelDaAba(/Variações/)).toHaveClass('hidden')
  })

  it('the tab counter reveals content hidden inside', () => {
    // This was the gap: with no counter, hiding behind a tab merely swaps one
    // problema de descoberta por outro.
    renderEdit()

    // 2 photos in the fixture.
    expect(screen.getByRole('tab', { name: /Fotos e vídeos/ })).toHaveTextContent('2')
    // 2 SKUs in the fixture.
    expect(screen.getByRole('tab', { name: /Variações/ })).toHaveTextContent('2')
  })

  it('switching tabs reveals a section without unmounting the others', () => {
    renderEdit()

    fireEvent.click(screen.getByRole('tab', { name: /Fotos e vídeos/ }))

    expect(painelDaAba(/Fotos e vídeos/)).not.toHaveClass('hidden')
    expect(painelDaAba(/Básico/)).toHaveClass('hidden')
    // The hidden tab's field stays in the DOM, which is what lets a draft typed
    // there survive the tab switch and reach the save.
    expect(screen.getByLabelText(/Nome do Produto/i)).toBeInTheDocument()
  })

  it('a draft typed in one tab survives the switch and reaches the save', async () => {
    const semVariacao: Product = { ...product, hasVariants: false, variantAxes: [], variants: [] }
    renderEdit(semVariacao)

    fireEvent.click(screen.getByRole('tab', { name: /Fotos e vídeos/ }))
    fireEvent.change(screen.getByPlaceholderText(/Colar link do YouTube/i), {
      target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    })
    // Return to Basics and save from there; the video must not be lost.
    fireEvent.click(screen.getByRole('tab', { name: /Básico/ }))
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled())
    const payload = mockedUpdate.mock.calls[0][1] as { videos?: { url: string }[] }
    expect(payload.videos).toHaveLength(1)
  })

  it('a validation error jumps to the tab holding the field', async () => {
    const semVariacao: Product = { ...product, hasVariants: false, variantAxes: [], variants: [] }
    renderEdit(semVariacao)

    // The invalid link lives on Media; the save fires from Basics.
    fireEvent.click(screen.getByRole('tab', { name: /Fotos e vídeos/ }))
    fireEvent.change(screen.getByPlaceholderText(/Colar link do YouTube/i), {
      target: { value: 'https://vimeo.com/12345' },
    })
    fireEvent.click(screen.getByRole('tab', { name: /Básico/ }))
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(mockedUpdate).not.toHaveBeenCalled()
    // Without the jump, the warning would point at an off-screen field.
    expect(screen.getByRole('tab', { name: /Fotos e vídeos/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('an empty name returns to the first tab even after leaving it', async () => {
    renderEdit()

    fireEvent.change(screen.getByLabelText(/Nome do Produto/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('tab', { name: /Variações/ }))
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Informe o nome do produto')
    )
    expect(screen.getByRole('tab', { name: /Básico/ })).toHaveAttribute('aria-selected', 'true')
  })
})
