/**
 * StockTab — adjusting stock, which Laura does from her phone.
 *
 * On a phone the stock field used to sit past the right edge of a six-column
 * table. These pin that the card's field saves, and that a failed save gives
 * the field back instead of leaving it disabled.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { mockPhoneScreen } from '../../test/mobile'
import type { StockRow } from '../../lib/stock'

const mocks = vi.hoisted(() => ({
  listStock: vi.fn(),
  adjustStock: vi.fn(),
}))

vi.mock('../../lib/stock', () => ({
  listStock: mocks.listStock,
  adjustStock: mocks.adjustStock,
  setLowStockThreshold: vi.fn(),
  listStockMovements: vi.fn(),
  movementLabel: (m: string) => m,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { StockTab } from './StockTab'

const ROW: StockRow = {
  productId: 'p1',
  productName: 'Holder Photocard SKZOO',
  productSlug: 'holder-skzoo',
  variantId: 'v1',
  variantName: 'Dwaekki',
  sku: 'SKZ-01',
  stock: 3,
  lowStockThreshold: 2,
  active: true,
  imageUrl: null,
  status: 'ok',
}

describe('StockTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listStock.mockResolvedValue({
      rows: [ROW],
      total: 1,
      summary: { out: 0, low: 0, ok: 1 },
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('saves the stock typed in the phone card', async () => {
    mockPhoneScreen()
    mocks.adjustStock.mockResolvedValue({ ...ROW, stock: 7 })
    render(<StockTab />)

    const field = await screen.findByLabelText('Estoque de Holder Photocard SKZOO Dwaekki')
    expect(document.querySelector('table')).toBeNull()
    fireEvent.change(field, { target: { value: '7' } })
    fireEvent.blur(field)

    await waitFor(() =>
      expect(mocks.adjustStock).toHaveBeenCalledWith({ productId: 'p1', variantId: 'v1', stock: 7 })
    )
    expect(screen.getByRole('button', { name: /Histórico/ })).toBeInTheDocument()
  })

  it('gives the field back when the save returns nothing', async () => {
    mocks.adjustStock.mockResolvedValue(null)
    render(<StockTab />)

    const field = await screen.findByLabelText('Estoque de Holder Photocard SKZOO Dwaekki')
    fireEvent.change(field, { target: { value: '9' } })
    fireEvent.blur(field)

    await waitFor(() => expect(mocks.adjustStock).toHaveBeenCalled())
    await waitFor(() => expect(field).not.toBeDisabled())
  })
})
