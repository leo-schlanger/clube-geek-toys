import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Loading, LoadingPage, LoadingOverlay, LoadingSpinner } from './loading'

describe('Loading', () => {
  it('should render with default size', () => {
    render(<Loading />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('should render with small size', () => {
    const { container } = render(<Loading size="sm" />)
    expect(container.querySelector('.h-4.w-4')).toBeInTheDocument()
  })

  it('should render with medium size', () => {
    const { container } = render(<Loading size="md" />)
    expect(container.querySelector('.h-8.w-8')).toBeInTheDocument()
  })

  it('should render with large size', () => {
    const { container } = render(<Loading size="lg" />)
    expect(container.querySelector('.h-12.w-12')).toBeInTheDocument()
  })

  it('should render with custom text', () => {
    render(<Loading text="Please wait" />)
    expect(screen.getByText('Please wait')).toBeInTheDocument()
  })

  it('should have accessible label', () => {
    render(<Loading text="Loading data" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading data')
  })

  it('should have default accessible label when no text provided', () => {
    render(<Loading />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Carregando')
  })

  it('should apply custom className', () => {
    const { container } = render(<Loading className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})

describe('LoadingPage', () => {
  it('should render full page loading', () => {
    render(<LoadingPage />)
    expect(screen.getByText('Carregando...')).toBeInTheDocument()
  })

  it('should have large spinner', () => {
    const { container } = render(<LoadingPage />)
    expect(container.querySelector('.h-12.w-12')).toBeInTheDocument()
  })
})

describe('LoadingOverlay', () => {
  it('should render overlay', () => {
    render(<LoadingOverlay />)
    expect(screen.getByText('Processando...')).toBeInTheDocument()
  })

  it('should have fixed positioning', () => {
    const { container } = render(<LoadingOverlay />)
    expect(container.firstChild).toHaveClass('fixed')
  })
})

describe('LoadingSpinner', () => {
  it('should render medium spinner without text', () => {
    render(<LoadingSpinner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText(/./)).not.toBeInTheDocument()
  })
})
