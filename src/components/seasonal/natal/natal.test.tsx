import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NonoMascot } from '../../store/NonoMascot'
import { NatalBannerSlot, NatalLightsSlot } from '.'
import { natalDecorHere } from './decor'
import { natalBannerKey } from './season'

// Lazy chunks load slowly on a cold run in /mnt/d.
const LAZY = { timeout: 5000 }

// The gate reads window.location; the qa override (?season=) also works in tests.
function visit(url: string) {
  window.history.replaceState({}, '', url)
}

// The global setup stubs both storages with one bare vi.fn() object; back it with a Map here.
const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.mocked(localStorage.getItem).mockImplementation((k: string) => store.get(k) ?? null)
  vi.mocked(localStorage.setItem).mockImplementation((k: string, v: string) => void store.set(k, String(v)))
})

afterEach(() => {
  vi.mocked(localStorage.getItem).mockReset()
  vi.mocked(localStorage.setItem).mockReset()
  visit('/')
})

describe('Natal gate', () => {
  it('stays off in unit tests unless the URL forces it', () => {
    visit('/')
    expect(natalDecorHere()).toBe(false)
    visit('/?season=natal')
    expect(natalDecorHere()).toBe(true)
  })

  it('keeps the override for the tab and lets ?season=off win', () => {
    visit('/?season=natal')
    natalDecorHere()
    visit('/carrinho')
    expect(natalDecorHere()).toBe(true)
    visit('/?season=off')
    expect(natalDecorHere()).toBe(false)
  })

  it('never decorates checkout, even when forced', () => {
    visit('/checkout?season=natal')
    expect(natalDecorHere()).toBe(false)
    render(<NonoMascot />)
    expect(screen.queryByTestId('nono-natal-hat')).toBeNull()
  })

  it('shows the shop strip, closes it and remembers', async () => {
    visit('/?season=natal')
    const { unmount } = render(
      <MemoryRouter>
        <NatalBannerSlot variant="shop" />
        <header>
          <a href="/">Início</a>
        </header>
      </MemoryRouter>
    )
    expect(await screen.findByText('Feliz Natal geek! 🎄', {}, LAZY)).toBeInTheDocument()
    expect(screen.getByText('Presentes de K-pop, anime e colecionáveis')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar faixa de Natal' }))
    expect(screen.queryByText('Feliz Natal geek! 🎄')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Início' }))
    expect(store.get(natalBannerKey('shop'))).toBe('1')
    unmount()

    render(
      <MemoryRouter>
        <NatalBannerSlot variant="shop" />
      </MemoryRouter>
    )
    expect(screen.queryByText('Feliz Natal geek! 🎄')).toBeNull()
  })

  it('greets club members with their own copy', async () => {
    visit('/membro?season=natal')
    render(
      <MemoryRouter>
        <NatalBannerSlot variant="club-member" />
      </MemoryRouter>
    )
    expect(await screen.findByText('Boas festas, membro GeekPop! 🎄', {}, LAZY)).toBeInTheDocument()
  })

  it('hangs lights in the header and a hat on Nono, keeping the caller classes on the box', async () => {
    visit('/?season=natal')
    render(
      <MemoryRouter>
        <NatalLightsSlot />
        <NonoMascot pose="standing" size={64} className="absolute right-5" decorative />
      </MemoryRouter>
    )
    expect(screen.getByTestId('natal-lights')).toBeInTheDocument()
    const hat = await screen.findByTestId('nono-natal-hat', {}, LAZY)
    const box = hat.parentElement as HTMLElement
    expect(box.className).toContain('absolute')
    expect(box.className).toContain('right-5')
    expect(box.querySelector('img')?.className).not.toContain('right-5')
  })
})
