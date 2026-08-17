import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiscountStrip } from './DiscountStrip'

describe('DiscountStrip', () => {
  it('renders the single 15% discount', () => {
    render(<DiscountStrip />)
    expect(screen.getByText('15%')).toBeInTheDocument()
  })

  it('shows the "em qualquer produto" copy', () => {
    render(<DiscountStrip />)
    expect(screen.getByText('em qualquer produto')).toBeInTheDocument()
  })

  it('renders the "Seu desconto de membro" label', () => {
    render(<DiscountStrip />)
    expect(screen.getByText('Seu desconto de membro')).toBeInTheDocument()
  })

  it('states it is valid in the physical store and online', () => {
    render(<DiscountStrip />)
    expect(screen.getByText('Válido na loja física e na loja online')).toBeInTheDocument()
  })

  it('mentions no points, services or plans', () => {
    render(<DiscountStrip />)
    expect(screen.queryByText(/pontos/i)).not.toBeInTheDocument()
    expect(screen.queryByText('em serviços')).not.toBeInTheDocument()
    expect(screen.queryByText(/libera no 2º pgto/)).not.toBeInTheDocument()
  })
})
