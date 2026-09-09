import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

/**
 * The card that tells the admin whether a label can be bought.
 *
 * It exists because the panel had no way to start the Melhor Envio
 * authorization at all, while the API returned "reauthorize in Settings" on
 * every label attempt. The admin pressed the label button six times in twelve
 * minutes and gave up. So the state that matters is not "connected" — it is
 * "can it buy a label right now", and those two differed.
 */

const mockStatus = vi.fn()
const mockAuthorize = vi.fn()
const mockOpen = vi.fn()

vi.mock('../../lib/shipping-oauth', () => ({
  getMelhorEnvioStatus: () => mockStatus(),
  startMelhorEnvioAuthorization: () => mockAuthorize(),
}))

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}))

import { MelhorEnvioCard } from './MelhorEnvioCard'

const base = {
  credentialsConfigured: true,
  authorized: true,
  sandbox: false,
  expiresAt: '2026-10-16T00:00:00.000Z',
  obtainedAt: '2026-09-16T00:00:00.000Z',
  canRefresh: true,
  redirectUri: 'https://api.example.com/shipping/melhor-envio/callback',
  manualTokenOverride: false,
  scopes: ['shipping-calculate', 'cart-read', 'cart-write', 'shipping-checkout', 'shipping-generate', 'shipping-print'],
  missingScopes: [],
  canBuyLabel: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('open', mockOpen)
})

describe('MelhorEnvioCard', () => {
  it('says so when the integration can buy a label', async () => {
    mockStatus.mockResolvedValue(base)
    render(<MelhorEnvioCard />)

    expect(await screen.findByText(/com permissão para comprar etiqueta/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reautorizar/i })).toBeInTheDocument()
  })

  /**
   * The exact state the shop was in: a token from before the label scopes
   * existed. Reporting this as simply "connected" is what hid the problem.
   */
  it('separates connected from able to buy', async () => {
    mockStatus.mockResolvedValue({
      ...base,
      scopes: ['shipping-calculate'],
      missingScopes: ['cart-read', 'cart-write', 'shipping-checkout'],
      canBuyLabel: false,
    })
    render(<MelhorEnvioCard />)

    expect(
      await screen.findByText(/Conectado, mas sem permissão para comprar etiqueta/i)
    ).toBeInTheDocument()
  })

  it('offers to authorize when there is no token yet', async () => {
    mockStatus.mockResolvedValue({ ...base, authorized: false, canBuyLabel: false, scopes: [] })
    render(<MelhorEnvioCard />)

    expect(await screen.findByText(/Ainda não autorizado/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Autorizar$/i })).toBeInTheDocument()
  })

  it('opens the authorization page in another tab', async () => {
    mockStatus.mockResolvedValue(base)
    mockAuthorize.mockResolvedValue('https://melhorenvio.example/oauth?x=1')
    render(<MelhorEnvioCard />)

    fireEvent.click(await screen.findByRole('button', { name: /Reautorizar/i }))

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith(
        'https://melhorenvio.example/oauth?x=1',
        '_blank',
        'noopener'
      )
    })
  })

  /** Closing the loop without reloading the panel. */
  it('re-reads the state on "check again"', async () => {
    mockStatus.mockResolvedValue({ ...base, canBuyLabel: false })
    render(<MelhorEnvioCard />)
    await screen.findByText(/sem permissão para comprar etiqueta/i)

    mockStatus.mockResolvedValue(base)
    fireEvent.click(screen.getByRole('button', { name: /verificar de novo/i }))

    expect(await screen.findByText(/com permissão para comprar etiqueta/i)).toBeInTheDocument()
  })

  it('points at the server config when the credentials are missing', async () => {
    mockStatus.mockResolvedValue({ ...base, credentialsConfigured: false, authorized: false })
    render(<MelhorEnvioCard />)

    expect(await screen.findByText(/MELHOR_ENVIO_CLIENT_ID/)).toBeInTheDocument()
  })

  it('warns that sandbox labels are not real', async () => {
    mockStatus.mockResolvedValue({ ...base, sandbox: true })
    render(<MelhorEnvioCard />)

    expect(await screen.findByText(/sandbox/i)).toBeInTheDocument()
  })

  it('does not crash when the status cannot be read', async () => {
    mockStatus.mockResolvedValue(null)
    render(<MelhorEnvioCard />)

    expect(await screen.findByText(/Não foi possível consultar o estado/i)).toBeInTheDocument()
  })
})
