/**
 * CouponsTab — codes the shop posts on Instagram.
 *
 * What these pin: a code is sent upper-cased and trimmed, the percentage stays
 * within 1–90, an empty limit means "no limit" (null) and not zero, the date is
 * the whole last day, and removing asks first. The status badge tells active,
 * scheduled, expired and sold out apart.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Coupon } from '../../lib/promo'

const mocks = vi.hoisted(() => ({
  listCoupons: vi.fn(),
  createCoupon: vi.fn(),
  updateCoupon: vi.fn(),
  deactivateCoupon: vi.fn(),
  confirm: vi.fn(async () => true),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../../lib/promo', () => ({
  listCoupons: mocks.listCoupons,
  createCoupon: mocks.createCoupon,
  updateCoupon: mocks.updateCoupon,
  deactivateCoupon: mocks.deactivateCoupon,
  MAX_COUPON_CODE_LENGTH: 20,
}))
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('../../lib/admin-errors', () => ({ reportAdminError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }))

import { CouponsTab } from './CouponsTab'

const day = 86_400_000
function coupon(over: Partial<Coupon> = {}): Coupon {
  return {
    id: 'c1', code: 'VERAO20', description: null, percent: 20, active: true, startsAt: null, endsAt: null,
    maxUses: null, usedCount: 0, maxUsesPerCustomer: null, minSubtotal: null, createdAt: 'x', updatedAt: 'x', ...over,
  }
}

async function renderTab(list: Coupon[] = []) {
  mocks.listCoupons.mockResolvedValue(list)
  render(<CouponsTab />)
  await waitFor(() => expect(mocks.listCoupons).toHaveBeenCalled())
}

beforeEach(() => vi.clearAllMocks())

describe('CouponsTab', () => {
  it('creates a coupon with the code upper-cased and empty limits as null', async () => {
    mocks.createCoupon.mockResolvedValue(coupon())
    await renderTab()

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: ' verao20 ' } })
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Válido até'), { target: { value: '2026-12-31' } })
    fireEvent.change(screen.getByLabelText('Usos no total'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: /Criar cupom/ }))

    await waitFor(() =>
      expect(mocks.createCoupon).toHaveBeenCalledWith({
        code: 'VERAO20',
        description: null,
        percent: 20,
        endsAt: '2026-12-31T23:59:59.000Z',
        maxUses: 100,
        maxUsesPerCustomer: null,
        minSubtotal: null,
      })
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Cupom VERAO20 criado')
  })

  it('refuses a short code and a percentage outside 1–90', async () => {
    await renderTab()
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'AB' } })
    fireEvent.click(screen.getByRole('button', { name: /Criar cupom/ }))
    expect(mocks.toastError).toHaveBeenCalledWith('O código precisa de pelo menos 3 caracteres.')

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'NATAL' } })
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '95' } })
    fireEvent.click(screen.getByRole('button', { name: /Criar cupom/ }))
    expect(mocks.toastError).toHaveBeenCalledWith('Informe um desconto entre 1% e 90%.')
    expect(mocks.createCoupon).not.toHaveBeenCalled()
  })

  it('shows the server error when creation fails', async () => {
    mocks.createCoupon.mockRejectedValue(new Error('Código já existe'))
    await renderTab()
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'VERAO20' } })
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /Criar cupom/ }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Código já existe'))
  })

  it('labels active, scheduled, expired, sold out and inactive coupons', async () => {
    const now = Date.now()
    await renderTab([
      coupon({ id: '1', code: 'ATIVO' }),
      coupon({ id: '2', code: 'AGENDADO', startsAt: new Date(now + day).toISOString() }),
      coupon({ id: '3', code: 'VENCIDO', endsAt: new Date(now - day).toISOString() }),
      coupon({ id: '4', code: 'ESGOTADO', maxUses: 5, usedCount: 5 }),
      coupon({ id: '5', code: 'DESLIGADO', active: false }),
    ])
    expect(await screen.findByText('ATIVO')).toBeInTheDocument()
    for (const label of ['Ativo', 'Agendado', 'Expirado', 'Esgotado', 'Inativo']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })

  it('switches a coupon off and removes one after confirming', async () => {
    mocks.updateCoupon.mockResolvedValue(coupon({ active: false }))
    mocks.deactivateCoupon.mockResolvedValue(undefined)
    await renderTab([coupon({ usedCount: 3 })])
    await screen.findByText('VERAO20')

    fireEvent.click(screen.getByTitle('Desligar cupom'))
    await waitFor(() => expect(mocks.updateCoupon).toHaveBeenCalledWith('c1', { active: false }))

    fireEvent.click(screen.getByTitle('Remover cupom'))
    await waitFor(() => expect(mocks.deactivateCoupon).toHaveBeenCalledWith('c1'))
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('3 vez(es)') }))
  })

  it('keeps the coupon when the removal is not confirmed', async () => {
    mocks.confirm.mockResolvedValueOnce(false)
    await renderTab([coupon()])
    await screen.findByText('VERAO20')
    fireEvent.click(screen.getByTitle('Remover cupom'))
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
    expect(mocks.deactivateCoupon).not.toHaveBeenCalled()
  })

  it('says so when the list cannot load', async () => {
    mocks.listCoupons.mockRejectedValue(new Error('offline'))
    render(<CouponsTab />)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('offline'))
  })
})
