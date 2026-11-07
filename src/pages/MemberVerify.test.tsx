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

function renderPage(id = 'abcd1234-5678-9012-3456-789012345678', search = '') {
  return render(
    <MemoryRouter initialEntries={[`/verificar/${id}${search}`]}>
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

  describe('anti-print token', () => {
    const current = {
      fullName: 'Ana Teste',
      status: 'active',
      expiryDate: '2027-08-16',
      isCurrent: true,
      discountPercent: 10,
      planName: 'Clube GeekPop & Toys',
    }

    it('sends the QR token and shows no warning when it is fresh', async () => {
      mockVerify.mockResolvedValue({ ...current, token: 'valid' })
      renderPage('abcd1234-5678-9012-3456-789012345678', '?t=mgz1.abc')
      await waitFor(() => expect(screen.getByText('EM DIA')).toBeInTheDocument())
      expect(mockVerify).toHaveBeenCalledWith('abcd1234-5678-9012-3456-789012345678', 'mgz1.abc')
      expect(screen.queryByText(/QR antigo/)).not.toBeInTheDocument()
    })

    it.each(['expired', 'invalid', 'missing'])('flags a %s token as a possible screenshot, status still shown', async (token) => {
      mockVerify.mockResolvedValue({ ...current, token })
      renderPage()
      await waitFor(() => expect(screen.getByText('EM DIA')).toBeInTheDocument())
      expect(screen.getByRole('alert')).toHaveTextContent('QR antigo (possível print)')
      expect(screen.getByRole('alert')).toHaveTextContent('abrir a carteirinha no celular')
    })

    it('an expired membership stays NÃO ESTÁ EM DIA even with a valid token', async () => {
      mockVerify.mockResolvedValue({ ...current, isCurrent: false, status: 'expired', token: 'valid' })
      renderPage()
      await waitFor(() => expect(screen.getByText('NÃO ESTÁ EM DIA')).toBeInTheDocument())
      expect(screen.queryByText(/QR antigo/)).not.toBeInTheDocument()
    })
  })
})
