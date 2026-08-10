import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StarRating } from './StarRating'

describe('StarRating', () => {
  it('renders non-interactive stars', () => {
    render(<StarRating value={3} showValue count={10} />)
    expect(screen.getByLabelText(/3 de 5 estrelas/)).toBeInTheDocument()
    expect(screen.getByText(/3\.0/)).toBeInTheDocument()
    expect(screen.getByText(/\(10\)/)).toBeInTheDocument()
  })

  it('calls onChange when interactive', () => {
    const onChange = vi.fn()
    render(<StarRating value={2} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('4 estrelas'))
    expect(onChange).toHaveBeenCalledWith(4)
  })
})
