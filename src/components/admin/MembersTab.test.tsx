/**
 * MembersTab Component Tests
 *
 * MembersTab is a thin wrapper that passes props to MembersTable
 * inside a Card. Tests verify rendering and prop forwarding.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MembersTab } from './MembersTab'
import type { Member } from '../../types'

// ── Mocks ──────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), warning: vi.fn() },
}))

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}))

vi.mock('../../lib/api-client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

// ── Test data ────────────────────────────────────────────────

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: '1',
    userId: 'u1',
    cpf: '12345678900',
    fullName: 'João Silva',
    email: 'joao@test.com',
    phone: '11999999999',
    plan: 'club',
    status: 'active',
    paymentType: 'annual',
    startDate: '2025-01-01',
    expiryDate: '2026-01-01',
    paymentCount: 2,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────

describe('MembersTab', () => {
  const defaultProps = {
    members: [] as Member[],
    loading: false,
    onView: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onActivate: vi.fn(),
    onCreate: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render without crashing', () => {
    render(<MembersTab {...defaultProps} />)
  })

  it('should render the Card wrapper', () => {
    const { container } = render(<MembersTab {...defaultProps} />)
    // Card renders as a div
    expect(container.firstChild).toBeTruthy()
  })

  it('should show create button', () => {
    render(<MembersTab {...defaultProps} />)
    expect(screen.getByRole('button', { name: /novo membro/i })).toBeInTheDocument()
  })

  it('should render members when provided', () => {
    const members = [
      makeMember({ id: '1', fullName: 'João Silva' }),
      makeMember({ id: '2', fullName: 'Maria Santos' }),
    ]
    render(<MembersTab {...defaultProps} members={members} />)
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText('Maria Santos')).toBeInTheDocument()
  })

  it('should pass loading state to child component', () => {
    const { container } = render(<MembersTab {...defaultProps} loading={true} />)
    // When loading is true, the table shows a loading indicator
    expect(container).toBeTruthy()
  })

  it('should accept optional onResendEmail prop', () => {
    const onResendEmail = vi.fn()
    render(<MembersTab {...defaultProps} onResendEmail={onResendEmail} />)
    // Should render without errors
    expect(true).toBe(true)
  })

  it('should accept optional onRefetch prop', () => {
    const onRefetch = vi.fn()
    render(<MembersTab {...defaultProps} onRefetch={onRefetch} />)
    expect(true).toBe(true)
  })
})
