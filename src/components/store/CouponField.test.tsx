import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { CouponField } from './CouponField'

// `vi.mock` is hoisted above the imports, so the spy has to be hoisted with it.
const { checkCouponMock } = vi.hoisted(() => ({ checkCouponMock: vi.fn() }))
vi.mock('../../lib/promo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/promo')>()
  return { ...actual, checkCoupon: checkCouponMock }
})

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function open() {
  fireEvent.click(screen.getByRole('button', { name: /tenho um cupom/i }))
}

describe('CouponField', () => {
  it('applies a code that works', async () => {
    checkCouponMock.mockResolvedValue({ valid: true, code: 'VERAO20', percent: 20, description: null })
    const onApply = vi.fn()

    render(<CouponField subtotal={100} email="laura@example.com" applied={null} onApply={onApply} />)
    open()
    fireEvent.change(screen.getByLabelText(/código do cupom/i), { target: { value: 'verao20' } })
    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith({ code: 'VERAO20', percent: 20 })
    })
    expect(checkCouponMock).toHaveBeenCalledWith('VERAO20', 100, 'laura@example.com')
  })

  it('shows why a code was refused, and applies nothing', async () => {
    checkCouponMock.mockResolvedValue({
      valid: false,
      code: 'COUPON_EXPIRED',
      message: 'Este cupom expirou.',
    })
    const onApply = vi.fn()

    render(<CouponField subtotal={100} applied={null} onApply={onApply} />)
    open()
    fireEvent.change(screen.getByLabelText(/código do cupom/i), { target: { value: 'VELHO' } })
    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))

    expect(await screen.findByText('Este cupom expirou.')).toBeInTheDocument()
    expect(onApply).toHaveBeenCalledWith(null)
  })

  it('lets the customer take the coupon back off', () => {
    const onApply = vi.fn()
    render(
      <CouponField subtotal={100} applied={{ code: 'VERAO20', percent: 20 }} onApply={onApply} />
    )

    fireEvent.click(screen.getByRole('button', { name: /remover cupom verao20/i }))
    expect(onApply).toHaveBeenCalledWith(null)
  })

  /**
   * Only one discount applies. Without this the customer types a valid code,
   * the total does not move, and nothing on the page explains it.
   */
  it('says which discount beat the coupon', () => {
    render(
      <CouponField
        subtotal={100}
        applied={{ code: 'MINI3', percent: 3 }}
        onApply={vi.fn()}
        beaten="Desconto membro (10%)"
      />
    )
    expect(screen.getByText(/Desconto membro \(10%\) é maior/)).toBeInTheDocument()
  })

  // The field lives inside the checkout <form>; without preventDefault, Enter
  // would submit the order instead of checking the code.
  it('checks the code on Enter instead of placing the order', async () => {
    checkCouponMock.mockResolvedValue({ valid: true, code: 'X', percent: 5, description: null })
    render(<CouponField subtotal={100} applied={null} onApply={vi.fn()} />)
    open()

    const input = screen.getByLabelText(/código do cupom/i)
    fireEvent.change(input, { target: { value: 'X' } })
    const event = fireEvent.keyDown(input, { key: 'Enter' })

    expect(event).toBe(false) // preventDefault was called
    await waitFor(() => expect(checkCouponMock).toHaveBeenCalled())
  })
})
