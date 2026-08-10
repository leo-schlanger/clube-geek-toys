import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeContext'

function Probe() {
  const { theme, setTheme, toggle } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        dark
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        light
      </button>
      <button type="button" onClick={toggle}>
        toggle
      </button>
    </div>
  )
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark', 'light')
  })

  it('provides theme and toggles', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    expect(screen.getByTestId('theme')).toBeInTheDocument()
    fireEvent.click(screen.getByText('dark'))
    expect(screen.getByTestId('theme').textContent).toBe('dark')
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })
})
