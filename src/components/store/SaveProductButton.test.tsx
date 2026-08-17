import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

let mockUser: { id: string } | null = null
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}))

const mockSave = vi.fn()
const mockUnsave = vi.fn()
const mockLoadIds = vi.fn()
const mockMark = vi.fn()
vi.mock('../../lib/profile', () => ({
  saveProduct: (...args: unknown[]) => mockSave(...args),
  unsaveProduct: (...args: unknown[]) => mockUnsave(...args),
  loadSavedIds: () => mockLoadIds(),
  markSavedInCache: (...args: unknown[]) => mockMark(...args),
}))

// vi.mock is hoisted to the top of the file, so the object has to come from
// vi.hoisted: a plain const does not exist yet when the factory runs.
const { mockToast } = vi.hoisted(() => ({
  mockToast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: mockToast }))

import { SaveProductButton } from './SaveProductButton'

beforeEach(() => {
  vi.clearAllMocks()
  mockUser = { id: 'u1' }
  mockLoadIds.mockResolvedValue(new Set<string>())
  mockSave.mockResolvedValue(true)
  mockUnsave.mockResolvedValue(true)
})

function renderButton(props: Partial<React.ComponentProps<typeof SaveProductButton>> = {}) {
  return render(
    <SaveProductButton productId="p1" productName="Photocard BTS" {...props} />
  )
}

describe('SaveProductButton — visitante', () => {
  // The signup hook: instead of hiding the button, it leads to creating an account.
  it('manda para o cadastro em vez de salvar', async () => {
    mockUser = null
    renderButton()

    await userEvent.click(screen.getByRole('button'))

    expect(mockNavigate).toHaveBeenCalledWith('/cadastro')
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockToast.info).toHaveBeenCalled()
  })

  it('does not fetch saved ids without an account', () => {
    mockUser = null
    renderButton()
    expect(mockLoadIds).not.toHaveBeenCalled()
  })
})

describe('SaveProductButton — logado', () => {
  it('saves and fills the heart', async () => {
    renderButton()

    await userEvent.click(screen.getByRole('button'))

    expect(mockSave).toHaveBeenCalledWith('p1')
    expect(mockMark).toHaveBeenCalledWith('p1', true)
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    )
  })

  it('reflects what was already saved, on mount', async () => {
    mockLoadIds.mockResolvedValue(new Set(['p1']))
    renderButton()

    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    )
  })

  it('removes when it was already saved', async () => {
    mockLoadIds.mockResolvedValue(new Set(['p1']))
    renderButton()
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    )

    await userEvent.click(screen.getByRole('button'))

    expect(mockUnsave).toHaveBeenCalledWith('p1')
    expect(mockMark).toHaveBeenCalledWith('p1', false)
  })

  // The optimism must revert, or the UI lies about what was saved.
  it('unfills the heart when the server refuses', async () => {
    mockSave.mockResolvedValue(false)
    renderButton()

    await userEvent.click(screen.getByRole('button'))

    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
    )
    expect(mockToast.error).toHaveBeenCalled()
    expect(mockMark).not.toHaveBeenCalled()
  })
})

describe('SaveProductButton — acessibilidade', () => {
  it('describes the action and the product in the label', async () => {
    renderButton()
    expect(screen.getByRole('button')).toHaveAccessibleName('Salvar Photocard BTS')

    await userEvent.click(screen.getByRole('button'))

    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAccessibleName(
        'Remover Photocard BTS dos salvos'
      )
    )
  })

  it('the full variant shows text alongside the icon', () => {
    renderButton({ variant: 'full' })
    expect(screen.getByRole('button')).toHaveTextContent('Salvar')
  })
})
