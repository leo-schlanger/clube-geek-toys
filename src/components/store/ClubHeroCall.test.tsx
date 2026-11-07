import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClubHeroCall } from './ClubHeroCall'
import { MEMBER_DISCOUNT_PERCENT } from '../../types'
import { MEMBER_TICKET_DISCOUNT_PERCENT } from '../../lib/club-value'

function renderCall(props: Partial<Parameters<typeof ClubHeroCall>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ClubHeroCall isMember={false} {...props} />
    </MemoryRouter>,
  )
}

describe('ClubHeroCall', () => {
  it('invites a visitor, with benefits from the constants and the signup link', () => {
    renderCall()
    expect(screen.getByRole('heading', { name: 'Associe-se e tenha vantagens incríveis' })).toBeInTheDocument()
    expect(screen.getByText(`${MEMBER_DISCOUNT_PERCENT}% de desconto`)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`\\(${MEMBER_TICKET_DISCOUNT_PERCENT}%\\) nos eventos`))).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /Quero ser membro/ })
    expect(cta.getAttribute('href')).toMatch(/\/assinar$/)
    expect(screen.getByRole('link', { name: 'Sou membro: entrar' })).toHaveAttribute('href', '/entrar')
    expect(screen.getByRole('note')).toHaveTextContent('Vem pro clube!')
    expect(screen.getByTestId('club-hero-nono').querySelector('img')).toHaveAttribute('src', '/mascot/nono-standing.webp')
  })

  it('never shows a price next to Nono (CONANDA)', () => {
    const { container } = renderCall()
    expect(container.textContent).not.toMatch(/R\$/)
  })

  it('tells an active member the discount is on, without the invitation', () => {
    const { container } = renderCall({ isMember: true })
    expect(screen.getByRole('heading', { name: 'Seu desconto de membro já está ativo' })).toBeInTheDocument()
    expect(screen.queryByText(/Associe-se/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Quero ser membro/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver minha carteirinha/ }).getAttribute('href')).toMatch(/\/membro$/)
    expect(screen.getByTestId('club-hero-nono').querySelector('img')).toHaveAttribute('src', '/mascot/nono-heart.webp')
    expect(container.textContent).not.toMatch(/R\$/)
  })

  it('drops Nono when another one is on the screen', () => {
    renderCall({ showMascot: false })
    expect(screen.queryByTestId('club-hero-nono')).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('keeps its space but hides the content while membership loads', () => {
    renderCall({ loading: true })
    const box = screen.getByRole('heading', { hidden: true, name: /Associe-se/ }).closest('section')
    expect(box).toHaveClass('invisible')
    expect(box).toHaveAttribute('aria-busy', 'true')
  })
})
