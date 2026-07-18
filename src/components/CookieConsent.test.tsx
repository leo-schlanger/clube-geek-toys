/**
 * CookieConsent Component Tests
 *
 * Covers: rendering, accept all, accept essential only,
 * close button, localStorage persistence, analytics loading.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CookieConsent } from './CookieConsent'

// ── Mocks ──────────────────────────────────────────────────────

const mockLoadAnalytics = vi.fn()
vi.mock('../lib/analytics', () => ({
  loadAnalytics: () => mockLoadAnalytics(),
}))

// ── Tests ──────────────────────────────────────────────────────

describe('CookieConsent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Default: no consent stored
    vi.mocked(localStorage.getItem).mockReturnValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function renderConsent() {
    return render(
      <MemoryRouter>
        <CookieConsent />
      </MemoryRouter>
    )
  }

  it('does not show immediately (has a delay)', () => {
    renderConsent()
    expect(screen.queryByText('Este site utiliza cookies')).not.toBeInTheDocument()
  })

  it('shows after the delay', async () => {
    renderConsent()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(screen.getByText('Este site utiliza cookies')).toBeInTheDocument()
  })

  it('does not show if consent already exists in localStorage', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ essential: true, analytics: true, acceptedAll: true })
    )
    renderConsent()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(screen.queryByText('Este site utiliza cookies')).not.toBeInTheDocument()
  })

  it('renders accept all and essential-only buttons', async () => {
    renderConsent()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(screen.getByRole('button', { name: 'Aceitar todos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apenas essenciais' })).toBeInTheDocument()
  })

  it('renders close button', async () => {
    renderConsent()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(screen.getByLabelText('Fechar')).toBeInTheDocument()
  })

  it('renders privacy policy link', async () => {
    renderConsent()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    const link = screen.getByText('Política de Privacidade')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/privacidade')
  })

  it('saves full consent and loads analytics on accept all', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderConsent()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    await user.click(screen.getByRole('button', { name: 'Aceitar todos' }))

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'clube_geek_cookie_consent',
      expect.stringContaining('"acceptedAll":true')
    )
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'clube_geek_cookie_consent',
      expect.stringContaining('"analytics":true')
    )
    expect(mockLoadAnalytics).toHaveBeenCalled()
    expect(screen.queryByText('Este site utiliza cookies')).not.toBeInTheDocument()
  })

  it('saves essential-only consent without loading analytics', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderConsent()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    await user.click(screen.getByRole('button', { name: 'Apenas essenciais' }))

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'clube_geek_cookie_consent',
      expect.stringContaining('"analytics":false')
    )
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'clube_geek_cookie_consent',
      expect.stringContaining('"acceptedAll":false')
    )
    expect(mockLoadAnalytics).not.toHaveBeenCalled()
    expect(screen.queryByText('Este site utiliza cookies')).not.toBeInTheDocument()
  })

  it('closes and saves essential-only on X button click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderConsent()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    await user.click(screen.getByLabelText('Fechar'))

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'clube_geek_cookie_consent',
      expect.stringContaining('"acceptedAll":false')
    )
    expect(screen.queryByText('Este site utiliza cookies')).not.toBeInTheDocument()
  })
})
