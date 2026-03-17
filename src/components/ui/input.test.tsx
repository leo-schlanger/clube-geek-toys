import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './input'

describe('Input', () => {
  it('should render input element', () => {
    render(<Input placeholder="Enter text" />)
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
  })

  it('should accept text input', async () => {
    const user = userEvent.setup()
    render(<Input placeholder="Enter text" />)

    const input = screen.getByPlaceholderText('Enter text')
    await user.type(input, 'Hello World')

    expect(input).toHaveValue('Hello World')
  })

  it('should render with different types', () => {
    const { rerender } = render(<Input type="text" data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'text')

    rerender(<Input type="password" data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'password')

    rerender(<Input type="email" data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'email')
  })

  it('should apply custom className', () => {
    render(<Input className="custom-class" data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveClass('custom-class')
  })

  it('should show error state', () => {
    render(<Input error data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('input')).toHaveClass('border-red-500')
  })

  it('should not have aria-invalid when not in error state', () => {
    render(<Input data-testid="input" />)
    expect(screen.getByTestId('input')).not.toHaveAttribute('aria-invalid')
  })

  it('should be disabled when disabled prop is passed', () => {
    render(<Input disabled data-testid="input" />)
    expect(screen.getByTestId('input')).toBeDisabled()
  })

  it('should forward ref', () => {
    const ref = { current: null } as React.MutableRefObject<HTMLInputElement | null>
    render(<Input ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('should pass through additional props', () => {
    render(<Input data-testid="input" maxLength={10} />)
    expect(screen.getByTestId('input')).toHaveAttribute('maxlength', '10')
  })
})
