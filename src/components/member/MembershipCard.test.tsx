import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MembershipCard } from './MembershipCard'
import type { Member } from '../../types'

// Mock sonner
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

// Mock qrcode.react
vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props: Record<string, unknown>) => (
    <svg data-testid="qr-code" data-value={props.value as string} />
  ),
}))

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'abcd1234-5678-9012-3456-789012345678',
    userId: 'user-1',
    cpf: '12345678900',
    fullName: 'Maria Silva',
    email: 'maria@test.com',
    phone: '21999999999',
    plan: 'club',
    status: 'active',
    paymentType: 'annual',
    startDate: '2026-01-01',
    expiryDate: '2026-12-31',
    paymentCount: 1,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

describe('MembershipCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
    })
  })

  it('renders the member full name', () => {
    render(<MembershipCard member={createMember()} />)
    expect(screen.getByText('Maria Silva')).toBeInTheDocument()
  })

  it('renders the club plan badge', () => {
    render(<MembershipCard member={createMember()} />)
    expect(screen.getByText('Clube GeekPop & Toys')).toBeInTheDocument()
  })

  it('displays the expiry date in full (dd/mm/aaaa)', () => {
    render(<MembershipCard member={createMember({ expiryDate: '2026-12-31T15:00:00Z' })} />)
    expect(screen.getByText('31/12/2026')).toBeInTheDocument()
  })

  it('displays dash when no expiry date', () => {
    render(<MembershipCard member={createMember({ expiryDate: '' })} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('displays formatted member number from ID', () => {
    const member = createMember({ id: 'abcd1234-5678-9012-3456-789012345678' })
    render(<MembershipCard member={member} />)
    // formatMemberNumber removes hyphens, takes last 12, uppercases, groups by 4
    const numberEl = screen.getByText((_, el) => {
      return el?.tagName === 'P' && el?.classList.contains('font-mono') && /\w{4}/.test(el?.textContent || '') || false
    })
    expect(numberEl).toBeInTheDocument()
  })

  it('opens the full-screen QR from a large primary button', () => {
    const onShowQr = vi.fn()
    render(<MembershipCard member={createMember()} onShowQr={onShowQr} />)
    const button = screen.getByRole('button', { name: /Mostrar QR na portaria/ })
    expect(button).toHaveClass('h-14')
    fireEvent.click(button)
    expect(onShowQr).toHaveBeenCalled()
  })

  it('has no QR on the card itself (a static QR could be printed)', () => {
    render(<MembershipCard member={createMember()} onShowQr={() => {}} />)
    expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument()
  })

  it('paused (expired): grey card and the QR button disabled', () => {
    const onShowQr = vi.fn()
    render(<MembershipCard member={createMember()} paused onShowQr={onShowQr} />)
    expect(screen.getByTestId('card-face')).toHaveClass('grayscale')
    const button = screen.getByRole('button', { name: /QR pausado até renovar/ })
    expect(button).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Mostrar QR/ })).not.toBeInTheDocument()
  })

  it('Copiar ID and Compartilhar are 44px targets', () => {
    render(<MembershipCard member={createMember()} />)
    expect(screen.getByRole('button', { name: /Copiar ID/ })).toHaveClass('h-11')
    expect(screen.getByRole('button', { name: /Compartilhar/ })).toHaveClass('h-11')
  })

  it('copies member ID when ID button is clicked', async () => {
    const { toast } = await import('sonner')
    render(<MembershipCard member={createMember({ id: 'test-id-123' })} />)
    fireEvent.click(screen.getByText('Copiar ID'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-id-123')
    expect(toast.success).toHaveBeenCalledWith('ID copiado!')
  })

  it('renders Compartilhar button', () => {
    render(<MembershipCard member={createMember()} />)
    expect(screen.getByText('Compartilhar')).toBeInTheDocument()
  })

  it('falls back to copy when navigator.share is not available', async () => {
    const { toast } = await import('sonner')
    Object.defineProperty(navigator, 'share', { value: undefined, writable: true })
    render(<MembershipCard member={createMember()} />)
    fireEvent.click(screen.getByText('Compartilhar'))
    expect(navigator.clipboard.writeText).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('ID copiado!')
  })

  it('renders labels for front of card', () => {
    render(<MembershipCard member={createMember()} />)
    expect(screen.getByText('Nome do Membro')).toBeInTheDocument()
    expect(screen.getByText(/Válido até/)).toBeInTheDocument()
  })

  describe('Nono', () => {
    it('sits on the card, tiny and decorative', () => {
      const { container } = render(<MembershipCard member={createMember()} />)
      const nono = container.querySelector('img[src="/mascot/nono-glasses.webp"]')
      expect(nono).not.toBeNull()
      expect(nono).toHaveAttribute('alt', '')
      expect(nono).toHaveAttribute('width', '44')
    })

    it('can be turned off when another Nono is on the screen', () => {
      const { container } = render(<MembershipCard member={createMember()} showMascot={false} />)
      expect(container.querySelector('img[src^="/mascot/"]')).toBeNull()
    })
  })
})
