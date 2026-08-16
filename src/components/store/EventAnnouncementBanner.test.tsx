import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EventAnnouncementBanner } from './EventAnnouncementBanner'
import { ACTIVE_EVENT, isEventVisible } from '../../data/event'

/**
 * O bug que este teste tranca (encontrado na varredura de 16/08/2026):
 *
 * O banner era `sticky top-0 z-50` e o `ShopHeader` é `sticky top-0 z-40`. Os
 * dois grudavam no MESMO `top: 0`, e o banner — com z maior — cobria o header
 * inteiro assim que a pessoa rolava a página. Medido com `elementFromPoint`:
 * carrinho, login, busca, tema e o link do atacado paravam de responder, em
 * todas as larguras testadas (360, 390, 768 e 1440px), não só no celular.
 *
 * A correção é o banner ficar no **fluxo normal**: ele ocupa espaço no topo,
 * rola para fora, e o header assume o `top: 0` sozinho.
 */

beforeEach(() => {
  cleanup()
  vi.mocked(localStorage.getItem).mockReturnValue(null)
})

function renderBanner() {
  return render(
    <MemoryRouter>
      <EventAnnouncementBanner />
    </MemoryRouter>
  )
}

describe('EventAnnouncementBanner da loja — empilhamento', () => {
  it('o evento precisa estar ativo, senão este arquivo não testa nada', () => {
    expect(isEventVisible(ACTIVE_EVENT)).toBe(true)
  })

  it('NÃO é sticky — dois sticky em top-0 brigam e o header perde', () => {
    renderBanner()
    const banner = screen.getByRole('region', { name: /anúncio do evento/i })

    expect(banner.className).not.toMatch(/\bsticky\b/)
    expect(banner.className).not.toMatch(/\bfixed\b/)
  })

  it('não publica mais a var de altura — ela era lida por ninguém', () => {
    renderBanner()
    // Elemento no fluxo empurra o conteúdo sozinho; a var antiga carregava dois
    // números fixos (44px/72px) que nunca acompanhavam o texto real.
    expect(
      document.documentElement.style.getPropertyValue('--shop-event-banner-h')
    ).toBe('')
  })

  it('some quando o visitante dispensa', () => {
    // `localStorage` é um mock de vi.fn() no setup deste repo (src/test/setup.ts),
    // então `setItem` não guarda nada — o jeito é ensinar o `getItem`.
    vi.mocked(localStorage.getItem).mockImplementation((k: string) =>
      k === `shop-event-banner-dismissed:${ACTIVE_EVENT.id}` ? '1' : null
    )
    renderBanner()

    expect(screen.queryByRole('region', { name: /anúncio do evento/i })).toBeNull()
  })
})
