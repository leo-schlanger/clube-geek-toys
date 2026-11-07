import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockGetMyActivity = vi.fn()
vi.mock('../lib/members', () => ({
  getMyActivity: (...args: unknown[]) => mockGetMyActivity(...args),
}))

import { MemberActivityHistory } from './MemberActivityHistory'

describe('MemberActivityHistory', () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads the member's own endpoint and labels the real audit actions", async () => {
    mockGetMyActivity.mockResolvedValue([
      { id: 'a2', action: 'payment.pix_confirmed', timestamp: '2026-11-02T12:00:00Z' },
      { id: 'a1', action: 'contract_signed', timestamp: '2026-11-01T12:00:00Z' },
    ])
    render(<MemberActivityHistory limit={5} />)
    expect(await screen.findByText('Pagamento confirmado')).toBeInTheDocument()
    expect(screen.getByText('Contrato assinado')).toBeInTheDocument()
    expect(mockGetMyActivity).toHaveBeenCalledWith(5)
  })

  it('an empty timeline says so', async () => {
    mockGetMyActivity.mockResolvedValue([])
    render(<MemberActivityHistory limit={5} />)
    expect(await screen.findByText('Nenhuma atividade registrada ainda')).toBeInTheDocument()
  })

  // A 403 used to read as "no activity yet".
  it('a failed load is not shown as an empty history', async () => {
    mockGetMyActivity.mockRejectedValue(new Error('Acesso negado'))
    render(<MemberActivityHistory limit={5} />)
    expect(await screen.findByText(/Não foi possível carregar o histórico/)).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma atividade registrada ainda')).not.toBeInTheDocument()
  })
})
