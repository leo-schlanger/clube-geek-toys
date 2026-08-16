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

// vi.mock é içado para o topo do arquivo, então o objeto precisa nascer em
// vi.hoisted — um const comum ainda não existe quando a factory roda.
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
  // É o gancho do cadastro: em vez de esconder o botão, ele leva a criar conta.
  it('manda para o cadastro em vez de salvar', async () => {
    mockUser = null
    renderButton()

    await userEvent.click(screen.getByRole('button'))

    expect(mockNavigate).toHaveBeenCalledWith('/cadastro')
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockToast.info).toHaveBeenCalled()
  })

  it('não consulta os salvos sem conta', () => {
    mockUser = null
    renderButton()
    expect(mockLoadIds).not.toHaveBeenCalled()
  })
})

describe('SaveProductButton — logado', () => {
  it('salva e marca o coração', async () => {
    renderButton()

    await userEvent.click(screen.getByRole('button'))

    expect(mockSave).toHaveBeenCalledWith('p1')
    expect(mockMark).toHaveBeenCalledWith('p1', true)
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    )
  })

  it('reflete o que já estava salvo ao montar', async () => {
    mockLoadIds.mockResolvedValue(new Set(['p1']))
    renderButton()

    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    )
  })

  it('remove quando já estava salvo', async () => {
    mockLoadIds.mockResolvedValue(new Set(['p1']))
    renderButton()
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    )

    await userEvent.click(screen.getByRole('button'))

    expect(mockUnsave).toHaveBeenCalledWith('p1')
    expect(mockMark).toHaveBeenCalledWith('p1', false)
  })

  // O otimismo precisa reverter, senão a UI mente sobre o que foi salvo.
  it('desfaz o coração quando o servidor recusa', async () => {
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
  it('descreve a ação e o produto no rótulo', async () => {
    renderButton()
    expect(screen.getByRole('button')).toHaveAccessibleName('Salvar Photocard BTS')

    await userEvent.click(screen.getByRole('button'))

    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAccessibleName(
        'Remover Photocard BTS dos salvos'
      )
    )
  })

  it('na variante full mostra texto além do ícone', () => {
    renderButton({ variant: 'full' })
    expect(screen.getByRole('button')).toHaveTextContent('Salvar')
  })
})
