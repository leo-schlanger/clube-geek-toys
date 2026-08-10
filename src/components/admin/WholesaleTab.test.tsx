import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('../../lib/wholesale', () => ({
  adminListWholesaleAccounts: vi.fn(),
  adminReviewWholesale: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { adminListWholesaleAccounts, adminReviewWholesale } from '../../lib/wholesale'
import { WholesaleTab } from './WholesaleTab'

const mockedList = vi.mocked(adminListWholesaleAccounts)
const mockedReview = vi.mocked(adminReviewWholesale)

const pending = {
  id: 'w1',
  userId: 'u1',
  cnpj: '11222333000181',
  companyName: 'Loja Geek LTDA',
  tradeName: null,
  stateRegistration: null,
  phone: null,
  contactName: 'Ana',
  businessActivity: 'Revenda geek',
  status: 'pending' as const,
  rejectionReason: null,
  reviewedBy: null,
  reviewedAt: null,
  adminNotes: null,
  email: 'ana@b.com',
  createdAt: '',
  updatedAt: '',
}

describe('WholesaleTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state', async () => {
    mockedList.mockResolvedValue({ accounts: [], total: 0, page: 1, limit: 50 })
    render(<WholesaleTab />)
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma conta/i)).toBeInTheDocument()
    })
  })

  it('lists pending and approves', async () => {
    mockedList
      .mockResolvedValueOnce({ accounts: [pending], total: 1, page: 1, limit: 50 })
      .mockResolvedValue({ accounts: [{ ...pending, status: 'approved' }], total: 1, page: 1, limit: 50 })
    mockedReview.mockResolvedValue({ ...pending, status: 'approved' })
    render(<WholesaleTab />)
    await waitFor(() => {
      expect(screen.getByText('Loja Geek LTDA')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/i }))
    await waitFor(() => {
      expect(mockedReview).toHaveBeenCalledWith('w1', 'approve', expect.any(Object))
    })
  })
})
