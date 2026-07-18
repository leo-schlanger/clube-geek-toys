import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkipLink } from './skip-link'

describe('SkipLink', () => {
  it('should render a link element', () => {
    render(<SkipLink />)
    expect(screen.getByRole('link')).toBeInTheDocument()
  })

  it('should have default label text', () => {
    render(<SkipLink />)
    expect(screen.getByText('Pular para o conte\u00fado principal')).toBeInTheDocument()
  })

  it('should link to #main-content by default', () => {
    render(<SkipLink />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '#main-content')
  })

  it('should accept custom targetId', () => {
    render(<SkipLink targetId="content-area" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '#content-area')
  })

  it('should accept custom label', () => {
    render(<SkipLink label="Skip navigation" />)
    expect(screen.getByText('Skip navigation')).toBeInTheDocument()
  })

  it('should have sr-only class for screen-reader-only visibility', () => {
    render(<SkipLink />)
    expect(screen.getByRole('link')).toHaveClass('sr-only')
  })

  it('should become visible on focus (focus:not-sr-only)', () => {
    render(<SkipLink />)
    expect(screen.getByRole('link')).toHaveClass('focus:not-sr-only')
  })

  it('should have high z-index on focus', () => {
    render(<SkipLink />)
    expect(screen.getByRole('link')).toHaveClass('focus:z-[100]')
  })
})
