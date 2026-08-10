import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const refreshUser = vi.fn()
const navigate = vi.fn()

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, refreshUser }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

vi.mock('../../lib/wholesale', () => ({
  loginWholesale: vi.fn(),
}))

vi.mock('../../lib/api-client', () => ({
  setTokens: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { loginWholesale } from '../../lib/wholesale'
import WholesaleLogin from './WholesaleLogin'

const mockedLogin = vi.mocked(loginWholesale)

describe('WholesaleLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders CNPJ field', () => {
    render(
      <MemoryRouter>
        <WholesaleLogin />
      </MemoryRouter>
    )
    expect(screen.getByLabelText(/CNPJ/i)).toBeInTheDocument()
    expect(screen.getByText(/Entrar com CNPJ/i)).toBeInTheDocument()
  })

  it('rejects invalid CNPJ client-side', async () => {
    render(
      <MemoryRouter>
        <WholesaleLogin />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText(/^E-mail$/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/^CNPJ$/i), { target: { value: '111' } })
    fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: 'senha12345' } })
    fireEvent.click(screen.getByRole('button', { name: /Entrar no atacado/i }))
    await waitFor(() => {
      expect(screen.getByText(/CNPJ válido/i)).toBeInTheDocument()
    })
    expect(mockedLogin).not.toHaveBeenCalled()
  })

  it('submits valid form', async () => {
    mockedLogin.mockResolvedValue({
      account: {
        id: 'w1',
        userId: 'u1',
        cnpj: '11222333000181',
        companyName: 'Co',
        tradeName: null,
        stateRegistration: null,
        phone: null,
        contactName: 'A',
        businessActivity: null,
        status: 'approved',
        rejectionReason: null,
        reviewedBy: null,
        reviewedAt: null,
        adminNotes: null,
        createdAt: '',
        updatedAt: '',
      },
      accessToken: 'a',
      refreshToken: 'r',
    })
    render(
      <MemoryRouter>
        <WholesaleLogin />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText(/^E-mail$/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/^CNPJ$/i), {
      target: { value: '11.222.333/0001-81' },
    })
    fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: 'senha12345' } })
    fireEvent.click(screen.getByRole('button', { name: /Entrar no atacado/i }))
    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalledWith(
        expect.objectContaining({ cnpj: '11222333000181' })
      )
    })
  })
})

