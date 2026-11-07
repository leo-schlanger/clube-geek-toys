import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeContext'

function Probe() {
  const { theme, resolved, setTheme, toggle } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolved}</span>
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

function systemPrefers(dark: boolean) {
  return vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: dark && query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList
  )
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark', 'light')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('provides theme and toggles', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    fireEvent.click(screen.getByText('dark'))
    expect(screen.getByTestId('theme').textContent).toBe('dark')
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('defaults to system, like the home site, and follows a dark OS', () => {
    systemPrefers(true)
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    expect(screen.getByTestId('theme').textContent).toBe('system')
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('defaults to system and stays light on a light OS', () => {
    systemPrefers(false)
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    expect(screen.getByTestId('theme').textContent).toBe('system')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('a stored choice wins over the OS', () => {
    systemPrefers(true)
    // setup.ts replaces localStorage with vi.fn()s
    const getItem = vi.mocked(localStorage.getItem)
    getItem.mockImplementation((key: string) => (key === 'geekpop-theme' ? 'light' : null))
    try {
      render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      )
      expect(screen.getByTestId('resolved').textContent).toBe('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    } finally {
      getItem.mockReset()
    }
  })
})
