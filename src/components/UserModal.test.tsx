/**
 * UserModal Component Tests
 *
 * Covers: rendering create-user form, role selection, form validation,
 * admin warning, submit success, submit error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserModal } from './UserModal'

// ── Mocks ──────────────────────────────────────────────────────

vi.mock('../lib/api-client', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: { user: { id: 'new-user-1' } } }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

import { api } from '../lib/api-client'
import { toast } from 'sonner'

// ── Tests ──────────────────────────────────────────────────────

describe('UserModal', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderModal() {
    return render(<UserModal onClose={onClose} onSuccess={onSuccess} />)
  }

  it('renders dialog title', () => {
    renderModal()
    expect(screen.getByText('Novo Usuário do Sistema')).toBeInTheDocument()
  })

  it('renders email, password, and confirm password fields', () => {
    renderModal()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar Senha')).toBeInTheDocument()
  })

  it('renders role selection buttons (admin, seller)', () => {
    renderModal()
    expect(screen.getByText('Administrador')).toBeInTheDocument()
    expect(screen.getByText('Vendedor')).toBeInTheDocument()
  })

  it('defaults to seller role selected', () => {
    renderModal()
    // Seller should have the "Selecionado" badge by default
    const sellerButton = screen.getByText('Vendedor').closest('button')!
    expect(sellerButton).toHaveClass('border-primary')
  })

  it('shows admin warning when admin role is selected', async () => {
    const user = userEvent.setup()
    renderModal()

    const adminButton = screen.getByText('Administrador').closest('button')!
    await user.click(adminButton)

    expect(screen.getByText(/Atenção: Acesso Administrativo/)).toBeInTheDocument()
  })

  it('does not show admin warning for seller role', () => {
    renderModal()
    expect(screen.queryByText(/Atenção: Acesso Administrativo/)).not.toBeInTheDocument()
  })

  it('renders cancel and submit buttons', () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar Usuário' })).toBeInTheDocument()
  })

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('has password toggle button', async () => {
    const user = userEvent.setup()
    renderModal()

    const toggleBtn = screen.getByLabelText('Mostrar senha')
    expect(toggleBtn).toBeInTheDocument()

    await user.click(toggleBtn)
    expect(screen.getByLabelText('Ocultar senha')).toBeInTheDocument()
  })

  it('submits form successfully as seller', async () => {
    const user = userEvent.setup()
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { user: { id: 'new-user-1' } },
    })

    renderModal()

    await user.type(screen.getByLabelText('Email'), 'seller@test.com')
    await user.type(screen.getByLabelText('Senha'), 'StrongPass1')
    await user.type(screen.getByLabelText('Confirmar Senha'), 'StrongPass1')

    await user.click(screen.getByRole('button', { name: 'Criar Usuário' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/auth/register',
        { email: 'seller@test.com', password: 'StrongPass1' },
        { skipAuth: false }
      )
    })

    await waitFor(() => {
      // Seller role should trigger a PATCH to set role
      expect(api.patch).toHaveBeenCalledWith('/users/new-user-1/role', { role: 'seller' })
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled()
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('shows error toast on API failure', async () => {
    const user = userEvent.setup()
    vi.mocked(api.post).mockResolvedValueOnce({
      error: 'Email já cadastrado',
    })

    renderModal()

    await user.type(screen.getByLabelText('Email'), 'existing@test.com')
    await user.type(screen.getByLabelText('Senha'), 'StrongPass1')
    await user.type(screen.getByLabelText('Confirmar Senha'), 'StrongPass1')

    await user.click(screen.getByRole('button', { name: 'Criar Usuário' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })
})
