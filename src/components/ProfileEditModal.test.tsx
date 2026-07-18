import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileEditModal } from './ProfileEditModal'
import type { Member } from '../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUpdateMember = vi.fn()
vi.mock('../lib/members', () => ({
  updateMember: (...args: unknown[]) => mockUpdateMember(...args),
}))

const mockApiPatch = vi.fn()
vi.mock('../lib/api-client', () => ({
  api: {
    patch: (...args: unknown[]) => mockApiPatch(...args),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('lucide-react', () => {
  const icon = (name: string) => {
    const Comp = (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />
    Comp.displayName = name
    return Comp
  }
  return {
    X: icon('X'),
    User: icon('User'),
    Phone: icon('Phone'),
    Mail: icon('Mail'),
    Lock: icon('Lock'),
    Save: icon('Save'),
    AlertTriangle: icon('AlertTriangle'),
    Eye: icon('Eye'),
    EyeOff: icon('EyeOff'),
  }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMember(overrides?: Partial<Member>): Member {
  return {
    id: 'member-1',
    userId: 'user-1',
    cpf: '52998224725',
    fullName: 'Joao Da Silva',
    email: 'joao@test.com',
    phone: '(11) 99999-8888',
    plan: 'gold',
    status: 'active',
    paymentType: 'monthly',
    startDate: '2025-01-01',
    expiryDate: '2025-06-01',
    points: 100,
    paymentCount: 2,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileEditModal', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateMember.mockResolvedValue(true)
    mockApiPatch.mockResolvedValue({ data: { success: true } })
  })

  // ---------- Rendering ----------
  it('should render modal with form fields', () => {
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    expect(screen.getByText('Editar Perfil')).toBeInTheDocument()
    expect(screen.getByText('Atualize suas informações pessoais')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Seu nome completo')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('(00) 00000-0000')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument()
  })

  it('should populate fields with member data', () => {
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    expect(screen.getByDisplayValue('Joao Da Silva')).toBeInTheDocument()
    expect(screen.getByDisplayValue('(11) 99999-8888')).toBeInTheDocument()
    expect(screen.getByDisplayValue('joao@test.com')).toBeInTheDocument()
  })

  it('should render cancel and save buttons', () => {
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    expect(screen.getByText('Cancelar')).toBeInTheDocument()
    expect(screen.getByText('Salvar')).toBeInTheDocument()
  })

  it('should have save button disabled when form is pristine', () => {
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const saveBtn = screen.getByText('Salvar').closest('button')!
    expect(saveBtn).toBeDisabled()
  })

  it('should render password section divider', () => {
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    expect(screen.getByText('Alterar Senha (opcional)')).toBeInTheDocument()
  })

  it('should render new password field', () => {
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    expect(screen.getByPlaceholderText('Deixe em branco para manter')).toBeInTheDocument()
  })

  // ---------- Close behavior ----------
  it('should call onClose when Cancelar is clicked', () => {
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    fireEvent.click(screen.getByText('Cancelar'))
    expect(onClose).toHaveBeenCalled()
  })

  it('should call onClose when X button is clicked', () => {
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    // X button is a ghost icon button
    const xBtn = screen.getByTestId('icon-X').closest('button')!
    fireEvent.click(xBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('should call onClose when backdrop is clicked', () => {
    const { container } = render(
      <ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />
    )

    // Backdrop is the div with bg-black/60
    const backdrop = container.querySelector('.bg-black\\/60')!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  // ---------- Name update ----------
  it('should enable save button when name is changed', async () => {
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const nameInput = screen.getByDisplayValue('Joao Da Silva')
    await user.clear(nameInput)
    await user.type(nameInput, 'Maria Santos')

    const saveBtn = screen.getByText('Salvar').closest('button')!
    expect(saveBtn).not.toBeDisabled()
  })

  it('should successfully update profile (name only)', async () => {
    const { toast } = await import('sonner')
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const nameInput = screen.getByDisplayValue('Joao Da Silva')
    await user.clear(nameInput)
    await user.type(nameInput, 'Maria Santos')

    const saveBtn = screen.getByText('Salvar').closest('button')!
    await user.click(saveBtn)

    await waitFor(() => {
      expect(mockUpdateMember).toHaveBeenCalledWith('member-1', expect.objectContaining({
        fullName: 'Maria Santos',
      }))
      expect(toast.success).toHaveBeenCalledWith('Perfil atualizado com sucesso!')
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  // ---------- Email change ----------
  it('should show warning when email is changed', async () => {
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const emailInput = screen.getByDisplayValue('joao@test.com')
    await user.clear(emailInput)
    await user.type(emailInput, 'new@test.com')

    await waitFor(() => {
      expect(screen.getByText(/Alterar email requer sua senha atual/)).toBeInTheDocument()
    })
  })

  it('should show current password field when email changes', async () => {
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const emailInput = screen.getByDisplayValue('joao@test.com')
    await user.clear(emailInput)
    await user.type(emailInput, 'new@test.com')

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Digite sua senha atual')).toBeInTheDocument()
    })
  })

  it('should show error when email changed without current password', async () => {
    const { toast } = await import('sonner')
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const emailInput = screen.getByDisplayValue('joao@test.com')
    await user.clear(emailInput)
    await user.type(emailInput, 'new@test.com')

    const saveBtn = screen.getByText('Salvar').closest('button')!
    await user.click(saveBtn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Senha atual é necessária para alterar email ou senha')
    })
  })

  it('should call API patch when email changed with password', async () => {
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const emailInput = screen.getByDisplayValue('joao@test.com')
    await user.clear(emailInput)
    await user.type(emailInput, 'new@test.com')

    const passwordInput = screen.getByPlaceholderText('Digite sua senha atual')
    await user.type(passwordInput, 'MyPassword1')

    const saveBtn = screen.getByText('Salvar').closest('button')!
    await user.click(saveBtn)

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/auth/update-profile', expect.objectContaining({
        email: 'new@test.com',
        currentPassword: 'MyPassword1',
      }))
    })
  })

  // ---------- Password change ----------
  it('should show confirm password field when new password is entered', async () => {
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const newPwdInput = screen.getByPlaceholderText('Deixe em branco para manter')
    await user.type(newPwdInput, 'NewPass123')

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Confirme a nova senha')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Digite sua senha atual')).toBeInTheDocument()
    })
  })

  it('should show error when new password is too short', async () => {
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const newPwdInput = screen.getByPlaceholderText('Deixe em branco para manter')
    await user.type(newPwdInput, 'Ab1')

    // Also type current password and confirm
    const currentPwdInput = screen.getByPlaceholderText('Digite sua senha atual')
    await user.type(currentPwdInput, 'OldPass1')

    const confirmPwdInput = screen.getByPlaceholderText('Confirme a nova senha')
    await user.type(confirmPwdInput, 'Ab1')

    const saveBtn = screen.getByText('Salvar').closest('button')!
    await user.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText(/pelo menos 8 caracteres/)).toBeInTheDocument()
    })
  })

  it('should show error when passwords do not match', async () => {
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const newPwdInput = screen.getByPlaceholderText('Deixe em branco para manter')
    await user.type(newPwdInput, 'NewPass123')

    const currentPwdInput = screen.getByPlaceholderText('Digite sua senha atual')
    await user.type(currentPwdInput, 'OldPass1')

    const confirmPwdInput = screen.getByPlaceholderText('Confirme a nova senha')
    await user.type(confirmPwdInput, 'DifferentPass1')

    const saveBtn = screen.getByText('Salvar').closest('button')!
    await user.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText('Senhas não conferem')).toBeInTheDocument()
    })
  })

  // ---------- Password toggle visibility ----------
  it('should toggle new password visibility', async () => {
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const newPwdInput = screen.getByPlaceholderText('Deixe em branco para manter')
    expect(newPwdInput).toHaveAttribute('type', 'password')

    // Find the toggle button near the new password field
    // The new password label says "Nova Senha"
    const newPwdLabel = screen.getByText('Nova Senha')
    const newPwdContainer = newPwdLabel.closest('.space-y-2')!
    const toggleBtn = newPwdContainer.querySelector('button[type="button"]')!
    await user.click(toggleBtn)

    expect(newPwdInput).toHaveAttribute('type', 'text')
  })

  // ---------- API error handling ----------
  it('should show error toast when API patch fails', async () => {
    const { toast } = await import('sonner')
    const user = userEvent.setup()
    mockApiPatch.mockResolvedValue({ error: 'Senha incorreta' })

    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const emailInput = screen.getByDisplayValue('joao@test.com')
    await user.clear(emailInput)
    await user.type(emailInput, 'new@test.com')

    const passwordInput = screen.getByPlaceholderText('Digite sua senha atual')
    await user.type(passwordInput, 'WrongPass1')

    const saveBtn = screen.getByText('Salvar').closest('button')!
    await user.click(saveBtn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Senha incorreta')
    })
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('should show generic error toast when update throws', async () => {
    const { toast } = await import('sonner')
    const user = userEvent.setup()
    mockUpdateMember.mockRejectedValue(new Error('Network error'))

    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const nameInput = screen.getByDisplayValue('Joao Da Silva')
    await user.clear(nameInput)
    await user.type(nameInput, 'Maria Santos')

    const saveBtn = screen.getByText('Salvar').closest('button')!
    await user.click(saveBtn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network error')
    })
  })

  // ---------- Form labels ----------
  it('should show all form labels', () => {
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    expect(screen.getByText('Nome Completo')).toBeInTheDocument()
    expect(screen.getByText('Telefone')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Nova Senha')).toBeInTheDocument()
  })

  // ---------- Password validation: uppercase ----------
  it('should show error when password has no uppercase', async () => {
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const newPwdInput = screen.getByPlaceholderText('Deixe em branco para manter')
    await user.type(newPwdInput, 'newpass123')

    const currentPwdInput = screen.getByPlaceholderText('Digite sua senha atual')
    await user.type(currentPwdInput, 'OldPass1')

    const confirmPwdInput = screen.getByPlaceholderText('Confirme a nova senha')
    await user.type(confirmPwdInput, 'newpass123')

    const saveBtn = screen.getByText('Salvar').closest('button')!
    await user.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText(/pelo menos 1 letra maiúscula/)).toBeInTheDocument()
    })
  })

  // ---------- Password validation: digit ----------
  it('should show error when password has no digit', async () => {
    const user = userEvent.setup()
    render(<ProfileEditModal member={makeMember()} onClose={onClose} onSuccess={onSuccess} />)

    const newPwdInput = screen.getByPlaceholderText('Deixe em branco para manter')
    await user.type(newPwdInput, 'NewPassNoDigit')

    const currentPwdInput = screen.getByPlaceholderText('Digite sua senha atual')
    await user.type(currentPwdInput, 'OldPass1')

    const confirmPwdInput = screen.getByPlaceholderText('Confirme a nova senha')
    await user.type(confirmPwdInput, 'NewPassNoDigit')

    const saveBtn = screen.getByText('Salvar').closest('button')!
    await user.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText(/pelo menos 1 número/)).toBeInTheDocument()
    })
  })
})
