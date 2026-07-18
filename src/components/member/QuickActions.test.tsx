import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuickActions } from './QuickActions'
import type { Member } from '../../types'

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-1',
    userId: 'user-1',
    cpf: '123.456.789-00',
    fullName: 'Test User',
    email: 'test@test.com',
    phone: '(21) 99999-9999',
    plan: 'club',
    status: 'active',
    paymentType: 'annual',
    startDate: '2026-01-01',
    expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days from now
    paymentCount: 1,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

describe('QuickActions', () => {
  const defaultProps = {
    onRenew: vi.fn(),
    onEditProfile: vi.fn(),
  }

  it('should render profile and shop buttons when expiry is far', () => {
    const member = createMember() // 60 days out
    render(<QuickActions member={member} {...defaultProps} />)
    expect(screen.getByText(/meu perfil/i)).toBeInTheDocument()
    expect(screen.getByText(/ir para a loja/i)).toBeInTheDocument()
  })

  it('should render renew button when expiry is within 30 days', () => {
    const member = createMember({
      expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days
    })
    render(<QuickActions member={member} {...defaultProps} />)
    expect(screen.getByText(/renovar/i)).toBeInTheDocument()
  })

  it('should always render the shop button', () => {
    const member = createMember()
    render(<QuickActions member={member} {...defaultProps} />)
    expect(screen.getByText(/ir para a loja/i)).toBeInTheDocument()
  })

  it('should call onRenew when renew button is clicked', () => {
    const onRenew = vi.fn()
    const member = createMember({
      expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    })
    render(<QuickActions member={member} {...defaultProps} onRenew={onRenew} />)
    fireEvent.click(screen.getByText(/renovar/i))
    expect(onRenew).toHaveBeenCalledTimes(1)
  })

  it('should call onEditProfile when profile button is clicked', () => {
    const onEditProfile = vi.fn()
    const member = createMember()
    render(<QuickActions member={member} {...defaultProps} onEditProfile={onEditProfile} />)
    fireEvent.click(screen.getByText(/meu perfil/i))
    expect(onEditProfile).toHaveBeenCalledTimes(1)
  })

  it('should not render an upgrade button', () => {
    const member = createMember()
    render(<QuickActions member={member} {...defaultProps} />)
    expect(screen.queryByText(/fazer upgrade/i)).not.toBeInTheDocument()
  })
})
