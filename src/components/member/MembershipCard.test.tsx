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
    expect(screen.getByText('Clube Geek & Toys')).toBeInTheDocument()
  })

  it('displays formatted expiry date', () => {
    render(<MembershipCard member={createMember({ expiryDate: '2026-12-31' })} />)
    // Format: MM/YY
    expect(screen.getByText('12/26')).toBeInTheDocument()
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

  it('shows "Ver QR Code" button initially', () => {
    render(<MembershipCard member={createMember()} />)
    expect(screen.getByText('Ver QR Code')).toBeInTheDocument()
  })

  it('flips the card on click and shows "Ver carteirinha"', () => {
    render(<MembershipCard member={createMember()} />)
    fireEvent.click(screen.getByText('Ver QR Code'))
    expect(screen.getByText('Ver carteirinha')).toBeInTheDocument()
  })

  it('renders QR code on the back of the card', () => {
    render(<MembershipCard member={createMember()} />)
    expect(screen.getByTestId('qr-code')).toBeInTheDocument()
  })

  it('shows the single 15% discount badge on the back', () => {
    render(<MembershipCard member={createMember()} />)
    expect(screen.getByText('15%')).toBeInTheDocument()
    expect(screen.getByText('em qualquer produto')).toBeInTheDocument()
  })

  it('displays masked CPF on the back', () => {
    render(<MembershipCard member={createMember({ cpf: '12345678900' })} />)
    // maskCPF: formatCPF then replace first two groups with ***. ***
    expect(screen.getByText(/CPF: \*\*\*\. \*\*\*/)).toBeInTheDocument()
  })

  it('shows active status label on the back', () => {
    render(<MembershipCard member={createMember({ status: 'active' })} />)
    expect(screen.getByText('Ativo')).toBeInTheDocument()
  })

  it('shows pending status label', () => {
    render(<MembershipCard member={createMember({ status: 'pending' })} />)
    expect(screen.getByText('Pendente')).toBeInTheDocument()
  })

  it('copies member ID when ID button is clicked', async () => {
    const { toast } = await import('sonner')
    render(<MembershipCard member={createMember({ id: 'test-id-123' })} />)
    fireEvent.click(screen.getByText('ID'))
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

  it('renders scan instruction text', () => {
    render(<MembershipCard member={createMember()} />)
    expect(screen.getByText('Apresente na loja para aplicar seus descontos')).toBeInTheDocument()
  })

  it('renders labels for front of card', () => {
    render(<MembershipCard member={createMember()} />)
    expect(screen.getByText('Nome do Membro')).toBeInTheDocument()
    expect(screen.getByText(/Válido até/)).toBeInTheDocument()
  })
})
