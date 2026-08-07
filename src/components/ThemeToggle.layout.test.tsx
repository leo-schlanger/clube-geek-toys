
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../contexts/ThemeContext'
import { ThemeToggle } from './ThemeToggle'

function wrap(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

describe('ThemeToggle layout', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows full labels Claro Escuro Sistema without truncation class on spans', () => {
    wrap(<ThemeToggle variant="segmented" />)
    for (const label of ['Claro', 'Escuro', 'Sistema']) {
      const el = screen.getByText(label)
      expect(el).toBeInTheDocument()
      expect(el.textContent).toBe(label)
      expect(el.className).not.toMatch(/truncate/)
      expect(el.className).toMatch(/whitespace-nowrap/)
    }
  })

  it('switches to dark when Escuro is pressed', () => {
    wrap(<ThemeToggle variant="segmented" />)
    fireEvent.click(screen.getByRole('button', { name: /Escuro/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
