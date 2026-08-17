import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockVerify = vi.fn()
vi.mock('../lib/members', () => ({
  verifyMemberCard: (...args: unknown[]) => mockVerify(...args),
}))

vi.mock('../components/ui/loading', () => ({
  LoadingPage: () => <div>Carregando</div>,
}))

import MemberVerify from './MemberVerify'

function renderPage(id = 'abcd1234-5678-9012-3456-789012345678') {
  return render(
    <MemoryRouter initialEntries={[`/verificar/${id}`]}>
      <Routes>
        <Route path="/verificar/:id" element={<MemberVerify />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MemberVerify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows EM DIA for a current member', async () => {
    mockVerify.mockResolvedValue({
      fullName: 'Norberto Stanley Schlanger',
      status: 'active',
      expiryDate: '2027-08-16',
      isCurrent: true,
      discountPercent: 10,
      planName: 'Clube GeekPop & Toys',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('EM DIA')).toBeInTheDocument()
    })
    expect(screen.getByText('Norberto Stanley Schlanger')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
  })

  it('shows NÃO ESTÁ EM DIA when the membership lapsed', async () => {
    mockVerify.mockResolvedValue({
      fullName: 'Maria Silva',
      status: 'expired',
      expiryDate: '2025-01-01',
      isCurrent: false,
      discountPercent: 10,
      planName: 'Clube GeekPop & Toys',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('NÃO ESTÁ EM DIA')).toBeInTheDocument()
    })
  })

  it('shows not-found when the API returns nothing', async () => {
    mockVerify.mockResolvedValue(null)
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Não encontrada')).toBeInTheDocument()
    })
  })
})
