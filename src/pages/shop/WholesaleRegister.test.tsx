import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ refreshUser: vi.fn() }),
}))

vi.mock('../../lib/wholesale', () => ({
  registerWholesale: vi.fn(),
}))

vi.mock('../../lib/api-client', () => ({
  setTokens: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { registerWholesale } from '../../lib/wholesale'
import WholesaleRegister from './WholesaleRegister'

const mockedReg = vi.mocked(registerWholesale)

describe('WholesaleRegister', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders company fields', () => {
    render(
      <MemoryRouter>
        <WholesaleRegister />
      </MemoryRouter>
    )
    expect(screen.getByLabelText(/Razão social/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/CNPJ/i)).toBeInTheDocument()
  })

  it('blocks invalid CNPJ', async () => {
    render(
      <MemoryRouter>
        <WholesaleRegister />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText(/^CNPJ/i), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText(/Razão social/i), { target: { value: 'Co' } })
    fireEvent.change(screen.getByLabelText(/Responsável/i), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText(/^E-mail/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/^Senha/i), { target: { value: 'senha12345' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar cadastro/i }))
    await waitFor(() => {
      expect(screen.getByText(/CNPJ inválido/i)).toBeInTheDocument()
    })
    expect(mockedReg).not.toHaveBeenCalled()
  })
})
