import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { Label } from './label'

describe('Label', () => {
  it('should render with text content', () => {
    render(<Label>Email</Label>)
    expect(screen.getByText('Email')).toBeInTheDocument()
  })

  it('should render as a label element', () => {
    render(<Label>Name</Label>)
    expect(screen.getByText('Name').tagName).toBe('LABEL')
  })

  it('should have font-medium and text-sm classes', () => {
    render(<Label data-testid="lbl">Name</Label>)
    const el = screen.getByTestId('lbl')
    expect(el).toHaveClass('text-sm')
    expect(el).toHaveClass('font-medium')
  })

  it('should apply custom className', () => {
    render(<Label data-testid="lbl" className="my-label">Name</Label>)
    expect(screen.getByTestId('lbl')).toHaveClass('my-label')
  })

  it('should support htmlFor attribute', () => {
    render(<Label htmlFor="email-input">Email</Label>)
    expect(screen.getByText('Email')).toHaveAttribute('for', 'email-input')
  })

  it('should forward ref', () => {
    const ref = createRef<HTMLLabelElement>()
    render(<Label ref={ref}>Ref</Label>)
    expect(ref.current).toBeInstanceOf(HTMLLabelElement)
  })

  it('should have peer-disabled styles', () => {
    render(<Label data-testid="lbl">Disabled peer</Label>)
    const el = screen.getByTestId('lbl')
    expect(el).toHaveClass('peer-disabled:cursor-not-allowed')
    expect(el).toHaveClass('peer-disabled:opacity-70')
  })

  it('should associate with an input via htmlFor', () => {
    render(
      <div>
        <Label htmlFor="test-input">Username</Label>
        <input id="test-input" type="text" />
      </div>
    )
    const input = screen.getByLabelText('Username')
    expect(input).toBeInTheDocument()
    expect(input.tagName).toBe('INPUT')
  })
})
