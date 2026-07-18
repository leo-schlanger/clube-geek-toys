import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import { Button } from './button'

describe('Button', () => {
  it('should render with text content', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('should render as a button element', () => {
    render(<Button>Test</Button>)
    expect(screen.getByRole('button').tagName).toBe('BUTTON')
  })

  // --- Click handling ---

  it('should handle click events', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('should not fire click when disabled', () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Disabled</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  // --- Disabled state ---

  it('should be disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('should have disabled opacity class when disabled', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toHaveClass('disabled:opacity-50')
  })

  // --- Variants ---

  it('should render default variant', () => {
    render(<Button>Default</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-primary')
  })

  it('should render destructive variant', () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-destructive')
  })

  it('should render outline variant', () => {
    render(<Button variant="outline">Outline</Button>)
    expect(screen.getByRole('button')).toHaveClass('border')
  })

  it('should render secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-secondary')
  })

  it('should render ghost variant', () => {
    render(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByRole('button')).toHaveClass('hover:bg-accent')
  })

  it('should render link variant', () => {
    render(<Button variant="link">Link</Button>)
    expect(screen.getByRole('button')).toHaveClass('underline-offset-4')
  })

  it('should render success variant', () => {
    render(<Button variant="success">OK</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-green-500')
  })

  it('should render warning variant', () => {
    render(<Button variant="warning">Warn</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-yellow-500')
  })

  // --- Sizes ---

  it('should render default size', () => {
    render(<Button>Default</Button>)
    expect(screen.getByRole('button')).toHaveClass('h-10')
  })

  it('should render small size', () => {
    render(<Button size="sm">Small</Button>)
    expect(screen.getByRole('button')).toHaveClass('h-9')
  })

  it('should render large size', () => {
    render(<Button size="lg">Large</Button>)
    expect(screen.getByRole('button')).toHaveClass('h-11')
  })

  it('should render xl size', () => {
    render(<Button size="xl">XL</Button>)
    expect(screen.getByRole('button')).toHaveClass('h-14')
  })

  it('should render icon size', () => {
    render(<Button size="icon">X</Button>)
    expect(screen.getByRole('button')).toHaveClass('h-10', 'w-10')
  })

  // --- Custom class ---

  it('should apply custom className', () => {
    render(<Button className="custom-btn">Test</Button>)
    expect(screen.getByRole('button')).toHaveClass('custom-btn')
  })

  // --- Ref forwarding ---

  it('should forward ref', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Ref</Button>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    expect(ref.current?.textContent).toBe('Ref')
  })

  // --- Type attribute ---

  it('should support type="submit"', () => {
    render(<Button type="submit">Submit</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  // --- Accessibility ---

  it('should support aria-label', () => {
    render(<Button aria-label="Close dialog">X</Button>)
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument()
  })

  it('should have focus-visible ring styles', () => {
    render(<Button>Focus</Button>)
    expect(screen.getByRole('button')).toHaveClass('focus-visible:ring-2')
  })
})
