import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiscountStrip } from './DiscountStrip'

describe('DiscountStrip', () => {
  it('renderiza o desconto único de 15%', () => {
    render(<DiscountStrip />)
    expect(screen.getByText('15%')).toBeInTheDocument()
  })

  it('mostra o texto "em qualquer produto"', () => {
    render(<DiscountStrip />)
    expect(screen.getByText('em qualquer produto')).toBeInTheDocument()
  })

  it('renderiza o rótulo "Seu desconto de membro"', () => {
    render(<DiscountStrip />)
    expect(screen.getByText('Seu desconto de membro')).toBeInTheDocument()
  })

  it('informa validade na loja física e online', () => {
    render(<DiscountStrip />)
    expect(screen.getByText('Válido na loja física e na loja online')).toBeInTheDocument()
  })

  it('não menciona pontos, serviços nem planos', () => {
    render(<DiscountStrip />)
    expect(screen.queryByText(/pontos/i)).not.toBeInTheDocument()
    expect(screen.queryByText('em serviços')).not.toBeInTheDocument()
    expect(screen.queryByText(/libera no 2º pgto/)).not.toBeInTheDocument()
  })
})
