import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './badge'

describe('Badge', () => {
  it('should render with text content', () => {
    render(<Badge>Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('should render as a div element', () => {
    render(<Badge>Test</Badge>)
    expect(screen.getByText('Test').tagName).toBe('DIV')
  })

  // --- Variants ---

  it('should render default variant', () => {
    const { container } = render(<Badge>Default</Badge>)
    expect(container.firstChild).toHaveClass('bg-primary')
  })

  it('should render secondary variant', () => {
    const { container } = render(<Badge variant="secondary">Secondary</Badge>)
    expect(container.firstChild).toHaveClass('bg-secondary')
  })

  it('should render destructive variant', () => {
    const { container } = render(<Badge variant="destructive">Error</Badge>)
    expect(container.firstChild).toHaveClass('bg-destructive')
  })

  it('should render outline variant', () => {
    const { container } = render(<Badge variant="outline">Outline</Badge>)
    expect(container.firstChild).toHaveClass('text-foreground')
  })

  it('should render success variant', () => {
    const { container } = render(<Badge variant="success">OK</Badge>)
    expect(container.firstChild).toHaveClass('bg-green-500')
  })

  it('should render warning variant', () => {
    const { container } = render(<Badge variant="warning">Warn</Badge>)
    expect(container.firstChild).toHaveClass('bg-yellow-500')
  })

  it('should render club variant', () => {
    const { container } = render(<Badge variant="club">Club</Badge>)
    expect(container.firstChild).toHaveClass('bg-violet-600')
  })

  // --- Custom class ---

  it('should apply custom className', () => {
    const { container } = render(<Badge className="my-class">Test</Badge>)
    expect(container.firstChild).toHaveClass('my-class')
  })

  // --- Base styles ---

  it('should always have rounded-full and inline-flex', () => {
    const { container } = render(<Badge>Test</Badge>)
    expect(container.firstChild).toHaveClass('rounded-full')
    expect(container.firstChild).toHaveClass('inline-flex')
  })

  // --- Additional HTML attributes ---

  it('should pass through HTML attributes', () => {
    render(<Badge data-testid="my-badge" role="status">Status</Badge>)
    expect(screen.getByTestId('my-badge')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
