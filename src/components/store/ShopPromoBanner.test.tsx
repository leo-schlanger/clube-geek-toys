import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ShopPromoBanner } from './ShopPromoBanner'

const promoState = {
  enabled: true,
  percent: 5,
  bannerEnabled: true,
  bannerText: 'No site é 5% mais barato que na loja física.',
}
let channel: 'retail' | 'wholesale' = 'retail'

vi.mock('../../hooks/useShopPromo', () => ({
  useShopPromo: () => ({ promo: promoState, loading: false }),
}))
vi.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ channel }),
}))

beforeEach(() => {
  cleanup()
  // The shared setup replaces Storage with vi.fn()s that never store, so the
  // dismissal could not be exercised at all without a real one here.
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
  channel = 'retail'
  Object.assign(promoState, {
    enabled: true,
    percent: 5,
    bannerEnabled: true,
    bannerText: 'No site é 5% mais barato que na loja física.',
  })
})

describe('ShopPromoBanner', () => {
  it('announces the promotion', () => {
    render(<ShopPromoBanner />)
    expect(screen.getByText(/5% mais barato/)).toBeInTheDocument()
  })

  it.each([
    ['the promotion is off', { enabled: false }],
    ['the banner is switched off on its own', { bannerEnabled: false }],
    ['there is nothing to say', { bannerText: '   ' }],
  ])('stays out of the way when %s', (_label, patch) => {
    Object.assign(promoState, patch)
    const { container } = render(<ShopPromoBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  /**
   * B2B pricing is its own thing and the retail promotion never reaches it —
   * announcing it on /atacado would promise a discount checkout will not give.
   */
  it('never shows on the wholesale channel', () => {
    channel = 'wholesale'
    const { container } = render(<ShopPromoBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays dismissed once closed', () => {
    const { unmount } = render(<ShopPromoBanner />)
    fireEvent.click(screen.getByRole('button', { name: /fechar aviso/i }))
    expect(screen.queryByText(/5% mais barato/)).not.toBeInTheDocument()

    unmount()
    render(<ShopPromoBanner />)
    expect(screen.queryByText(/5% mais barato/)).not.toBeInTheDocument()
  })

  /**
   * Keyed by percentage, not by a single flag: someone who dismissed "5% mais
   * barato" in August must still see "20% mais barato" in November.
   */
  it('comes back when the offer changes', () => {
    const { unmount } = render(<ShopPromoBanner />)
    fireEvent.click(screen.getByRole('button', { name: /fechar aviso/i }))
    unmount()

    Object.assign(promoState, { percent: 20, bannerText: 'No site é 20% mais barato.' })
    render(<ShopPromoBanner />)
    expect(screen.getByText(/20% mais barato/)).toBeInTheDocument()
  })
})
