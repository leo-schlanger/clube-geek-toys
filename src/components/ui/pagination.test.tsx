import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './pagination'

describe('Pagination', () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 10,
    totalItems: 100,
    pageSize: 10,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
  }

  it('should render pagination controls', () => {
    render(<Pagination {...defaultProps} />)

    expect(screen.getByTitle('Primeira página')).toBeInTheDocument()
    expect(screen.getByTitle('Página anterior')).toBeInTheDocument()
    expect(screen.getByTitle('Próxima página')).toBeInTheDocument()
    expect(screen.getByTitle('Última página')).toBeInTheDocument()
  })

  it('should display items range', () => {
    render(<Pagination {...defaultProps} currentPage={2} />)
    expect(screen.getByText('11-20 de 100')).toBeInTheDocument()
  })

  it('should display 0-0 when no items', () => {
    render(<Pagination {...defaultProps} totalItems={0} />)
    expect(screen.getByText('0-0 de 0')).toBeInTheDocument()
  })

  it('should disable first/prev buttons on first page', () => {
    render(<Pagination {...defaultProps} />)

    expect(screen.getByTitle('Primeira página')).toBeDisabled()
    expect(screen.getByTitle('Página anterior')).toBeDisabled()
    expect(screen.getByTitle('Próxima página')).not.toBeDisabled()
    expect(screen.getByTitle('Última página')).not.toBeDisabled()
  })

  it('should disable next/last buttons on last page', () => {
    render(<Pagination {...defaultProps} currentPage={10} />)

    expect(screen.getByTitle('Primeira página')).not.toBeDisabled()
    expect(screen.getByTitle('Página anterior')).not.toBeDisabled()
    expect(screen.getByTitle('Próxima página')).toBeDisabled()
    expect(screen.getByTitle('Última página')).toBeDisabled()
  })

  it('should call onPageChange when clicking navigation buttons', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<Pagination {...defaultProps} currentPage={5} onPageChange={onPageChange} />)

    await user.click(screen.getByTitle('Primeira página'))
    expect(onPageChange).toHaveBeenCalledWith(1)

    await user.click(screen.getByTitle('Página anterior'))
    expect(onPageChange).toHaveBeenCalledWith(4)

    await user.click(screen.getByTitle('Próxima página'))
    expect(onPageChange).toHaveBeenCalledWith(6)

    await user.click(screen.getByTitle('Última página'))
    expect(onPageChange).toHaveBeenCalledWith(10)
  })

  it('should call onPageSizeChange when selecting page size', async () => {
    const user = userEvent.setup()
    const onPageSizeChange = vi.fn()
    render(<Pagination {...defaultProps} onPageSizeChange={onPageSizeChange} />)

    const select = screen.getByRole('combobox')
    await user.selectOptions(select, '25')

    expect(onPageSizeChange).toHaveBeenCalledWith(25)
  })

  it('should render page size options', () => {
    render(<Pagination {...defaultProps} pageSizeOptions={[5, 10, 20]} />)

    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('10')

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
  })

  it('should show all pages when total is small', () => {
    render(<Pagination {...defaultProps} totalPages={5} />)

    // Should have buttons for pages 1-5
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument()
  })

  it('should show ellipsis for many pages', () => {
    render(<Pagination {...defaultProps} currentPage={5} totalPages={20} />)

    // Should have ellipsis
    expect(screen.getAllByText('...').length).toBeGreaterThan(0)
  })

  it('should show correct end item on last page with partial items', () => {
    render(
      <Pagination
        {...defaultProps}
        currentPage={11}
        totalPages={11}
        totalItems={105}
        pageSize={10}
      />
    )
    expect(screen.getByText('101-105 de 105')).toBeInTheDocument()
  })
})
