import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaymentTrustBadges } from './PaymentTrustBadges'

describe('PaymentTrustBadges', () => {
  it('mostra cada bandeira como selo acessível', () => {
    render(<PaymentTrustBadges />)
    // As marcas são SVG, então o nome acessível é o que resta para leitor de tela.
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

  it('esconde o título no modo compacto', () => {
    render(<PaymentTrustBadges compact />)
    expect(screen.queryByText('Formas de pagamento')).not.toBeInTheDocument()
  })
})
