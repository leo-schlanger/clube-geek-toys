
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

  it('icon toggle starts on Sistema and cycles Claro → Escuro → Sistema with a 44px target', () => {
    wrap(<ThemeToggle variant="icon" />)
    const button = screen.getByRole('button', { name: /Tema: Sistema/ })
    expect(button).toHaveClass('h-11', 'w-11')
    // setup.ts replaces localStorage with vi.fn()s: assert what was written
    fireEvent.click(button)
    expect(localStorage.setItem).toHaveBeenLastCalledWith('geekpop-theme', 'light')
    fireEvent.click(screen.getByRole('button', { name: /Tema: Claro/ }))
    expect(localStorage.setItem).toHaveBeenLastCalledWith('geekpop-theme', 'dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Tema: Escuro/ }))
    expect(localStorage.setItem).toHaveBeenLastCalledWith('geekpop-theme', 'system')
  })
})
