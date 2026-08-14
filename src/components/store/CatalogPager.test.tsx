import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CatalogPager } from './CatalogPager'

describe('CatalogPager', () => {
  it('hides when everything fits in one page', () => {
    const { container } = render(
      <CatalogPager page={1} total={10} pageSize={24} onPageChange={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('pages through a multi-page catalog', () => {
    const onPageChange = vi.fn()
    render(<CatalogPager page={2} total={50} pageSize={24} onPageChange={onPageChange} />)
    expect(screen.getByText(/25–48 de 50/)).toBeInTheDocument()
    expect(screen.getByText(/Página 2 de 3/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Anterior/i }))
    expect(onPageChange).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: /Próxima/i }))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })
})
