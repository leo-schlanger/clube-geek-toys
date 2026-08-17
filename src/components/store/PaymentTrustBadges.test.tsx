import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaymentTrustBadges } from './PaymentTrustBadges'

describe('PaymentTrustBadges', () => {
  it('shows each brand as an accessible badge', () => {
    render(<PaymentTrustBadges />)
    // The marks are SVG, so the accessible name is all a screen reader has.
    for (const brand of ['PIX', 'Visa', 'Mastercard', 'Elo', 'Stripe']) {
      expect(screen.getByRole('img', { name: brand })).toBeInTheDocument()
    }
  })

  it('informa envio pelos Correios', () => {
    render(<PaymentTrustBadges />)
    expect(screen.getByText(/Correios/i)).toBeInTheDocument()
  })

  it('centraliza a fileira quando pedido', () => {
    const { container } = render(<PaymentTrustBadges center />)
    const row = container.querySelector('.flex-wrap')
    expect(row?.className).toMatch(/justify-center/)
  })

  it('hides the title in compact mode', () => {
    render(<PaymentTrustBadges compact />)
    expect(screen.queryByText('Formas de pagamento')).not.toBeInTheDocument()
  })
})
