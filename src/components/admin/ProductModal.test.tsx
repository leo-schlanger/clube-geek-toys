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

    expect(screen.getByText(/SKU\(s\) — cada um com fotos próprias/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Enviar imagens/i)).toBeInTheDocument()
    const listingInput = screen.getByLabelText(/Enviar imagens/i)
    expect(listingInput).toHaveAttribute('type', 'file')
    expect(listingInput.className).not.toMatch(/\bhidden\b/)
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

describe('ProductModal — gerar combinações', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const semVariacao: Product = { ...product, hasVariants: false, variantAxes: [], variants: [] }

  it('usa a opção digitada mesmo sem clicar no "+"', () => {
    // Caminho natural de quem não leu a dica: digita "Rosa" e vai direto em
    // Gerar combinações. Antes disso o texto era descartado e nada era gerado.
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

  it('reclama do nome do tipo, não das opções, quando o tipo está vazio', () => {
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
  // Todos estes casos caíam no vazio: o admin digitava, clicava em Salvar, via
  // "Produto atualizado!" e o dado não existia. Nada de erro na tela.
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

  it('salva o link de vídeo colado sem clicar em Adicionar', async () => {
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

  it('bloqueia o save quando o link de vídeo colado é inválido', async () => {
    renderModal(semVariacao)

    fireEvent.change(screen.getByPlaceholderText(/Colar link do YouTube/i), {
      target: { value: 'https://vimeo.com/12345' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('gera os SKUs quando os eixos foram preenchidos sem clicar em Gerar combinações', async () => {
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

  it('acrescenta a opção nova ao produto que já tem variações', async () => {
    renderModal(product)

    // "Azul" entra nos eixos sem regerar a matriz; Rosa e Preto continuam com
    // os seus ids, preço e foto.
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

  it('avisa em vez de salvar mudo quando Ativar está marcado e não há eixo', async () => {
    renderModal(semVariacao)

    fireEvent.click(screen.getByLabelText(/Ativar variações/i))
    fireEvent.change(screen.getByPlaceholderText('Cor'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/tipo \+ opções/i))
    )
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('salva a URL de foto da variação colada sem clicar em OK', async () => {
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

describe('ProductModal — várias fotos por variação', () => {
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

  it('acumula fotos na variação em vez de substituir a anterior', async () => {
    mockedUpdate.mockResolvedValue(product)
    mockedReplace.mockResolvedValue(product)
    renderEdit()

    // "Preto" já tem uma foto no fixture; colar uma URL deve somar, não trocar.
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

  it('não anexa foto de variação na galeria do listing', async () => {
    mockedUpdate.mockResolvedValue(product)
    mockedReplace.mockResolvedValue(product)
    renderEdit()

    const before = screen.getByText(/^\(2\/30\)$/)
    expect(before).toBeInTheDocument()

    const urlInputs = screen.getAllByPlaceholderText(/cole URL da foto desta variação/i)
    fireEvent.change(urlInputs[0], { target: { value: 'https://cdn.example.com/rosa.jpg' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'OK' })[0])

    // Contador da galeria do listing não se mexe — era exatamente o que estourava o teto.
    expect(screen.getByText(/^\(2\/30\)$/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled())
    const payload = mockedUpdate.mock.calls[0][1] as { images?: string[] }
    expect(payload.images).toEqual([
      'https://example.com/listing.jpg',
      'https://example.com/extra.jpg',
    ])
  })

  it('recusa a foto acima do teto por variação', () => {
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
