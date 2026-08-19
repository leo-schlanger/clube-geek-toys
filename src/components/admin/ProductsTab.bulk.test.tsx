/**
 * Bulk category editing in the catalogue.
 *
 * The shop moved a whole shelf from "Música" to "K-pop" one product at a time.
 * What these tests protect is the safety of doing it in one shot: the action
 * only ever reaches the products actually ticked, it asks before firing, and a
 * selection never survives a change of the list underneath it — a tick that
 * outlives its row is a product being edited off-screen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Product } from '../../types'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), warning: vi.fn() },
}))

vi.mock('../../lib/products', () => ({
  adminListProducts: vi.fn(),
  bulkSetProductCategories: vi.fn(),
  deleteProduct: vi.fn(),
  duplicateProduct: vi.fn(),
  listCategories: vi.fn(),
  getProductForEdit: vi.fn(),
}))

vi.mock('./ProductModal', () => ({ ProductModal: () => null }))

import {
  adminListProducts,
  bulkSetProductCategories,
  listCategories,
} from '../../lib/products'
import { ProductsTab } from './ProductsTab'

const mockedList = vi.mocked(adminListProducts)
const mockedBulk = vi.mocked(bulkSetProductCategories)
const mockedCategories = vi.mocked(listCategories)

function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Photocard BTS',
    slug: 'photocard-bts',
    price: 30,
    stock: 5,
    active: true,
    featured: false,
    images: [],
    ...over,
  } as Product
}

const PRODUCTS = [
  makeProduct({ id: 'p1', name: 'Photocard BTS' }),
  makeProduct({ id: 'p2', name: 'Álbum NewJeans' }),
]

describe('ProductsTab — categoria em massa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedList.mockResolvedValue({ products: PRODUCTS, total: 2 } as never)
    mockedCategories.mockResolvedValue([
      { id: 'c-musica', name: 'Música' },
      { id: 'c-kpop', name: 'K-pop' },
    ] as never)
    mockedBulk.mockResolvedValue(2)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  async function renderTab() {
    render(<ProductsTab />)
    await waitFor(() => expect(screen.getByText('Photocard BTS')).toBeInTheDocument())
  }

  it('keeps the bulk bar out of the way until something is ticked', async () => {
    await renderTab()
    expect(screen.queryByLabelText('Categoria')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Selecionar Photocard BTS'))

    expect(screen.getByText('1 selecionado(s)')).toBeInTheDocument()
  })

  it('sends only the ticked products', async () => {
    await renderTab()
    fireEvent.click(screen.getByLabelText('Selecionar Álbum NewJeans'))
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'c-kpop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    await waitFor(() => expect(mockedBulk).toHaveBeenCalledWith(['p2'], ['c-kpop'], 'replace'))
  })

  it('selects and clears the whole page from the header tick', async () => {
    await renderTab()
    const all = screen.getByLabelText('Selecionar todos os produtos desta página')

    fireEvent.click(all)
    expect(screen.getByText('2 selecionado(s)')).toBeInTheDocument()

    fireEvent.click(all)
    expect(screen.queryByText(/selecionado\(s\)/)).not.toBeInTheDocument()
  })

  it('carries the chosen mode through instead of always replacing', async () => {
    await renderTab()
    fireEvent.click(screen.getByLabelText('Selecionar Photocard BTS'))
    fireEvent.change(screen.getByLabelText('Ação na categoria'), { target: { value: 'remove' } })
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'c-musica' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    await waitFor(() => expect(mockedBulk).toHaveBeenCalledWith(['p1'], ['c-musica'], 'remove'))
  })

  it('does nothing when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await renderTab()
    fireEvent.click(screen.getByLabelText('Selecionar Photocard BTS'))
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'c-kpop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(mockedBulk).not.toHaveBeenCalled()
  })

  it('drops the selection when the list is reloaded', async () => {
    await renderTab()
    fireEvent.click(screen.getByLabelText('Selecionar Photocard BTS'))
    expect(screen.getByText('1 selecionado(s)')).toBeInTheDocument()

    // A new search brings different rows; the old ticks must not ride along.
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/i), {
      target: { value: 'newjeans' },
    })

    await waitFor(() => expect(screen.queryByText(/selecionado\(s\)/)).not.toBeInTheDocument())
  })
})
