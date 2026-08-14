import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProductSortSelect } from './ProductSortSelect'

describe('ProductSortSelect', () => {
  it('renders options and reports changes', () => {
    const onChange = vi.fn()
    render(<ProductSortSelect value="newest" onChange={onChange} />)
    const select = screen.getByLabelText('Ordenar produtos')
    expect(select).toHaveValue('newest')
    fireEvent.change(select, { target: { value: 'name' } })
    expect(onChange).toHaveBeenCalledWith('name')
    expect(screen.getByRole('option', { name: /A–Z/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Menor preço/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /postagem/i })).toBeInTheDocument()
  })
})
