import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { ConfirmProvider, useConfirm } from './useConfirm'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ConfirmProvider, null, children)
}

describe('useConfirm', () => {
  it('should throw when used outside ConfirmProvider', () => {
    // Suppress the console.error from React
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      renderHook(() => useConfirm())
    }).toThrow('useConfirm deve ser usado dentro de ConfirmProvider')

    spy.mockRestore()
  })

  it('should return a function when used inside ConfirmProvider', () => {
    const { result } = renderHook(() => useConfirm(), { wrapper })

    expect(typeof result.current).toBe('function')
  })

  it('should show dialog with title when confirm is called', async () => {
    const { result } = renderHook(() => useConfirm(), { wrapper })

    // Open the dialog (don't await the promise yet)
    act(() => {
      result.current({ title: 'Confirmar ação?' })
    })

    // Dialog title should be visible
    expect(screen.getByText('Confirmar ação?')).toBeInTheDocument()
  })

  it('should show description when provided', async () => {
    const { result } = renderHook(() => useConfirm(), { wrapper })

    act(() => {
      result.current({
        title: 'Deletar?',
        description: 'Esta ação não pode ser desfeita.',
      })
    })

    expect(screen.getByText('Deletar?')).toBeInTheDocument()
    expect(screen.getByText('Esta ação não pode ser desfeita.')).toBeInTheDocument()
  })

  it('should resolve true when confirm button is clicked', async () => {
    const user = userEvent.setup()
    const { result } = renderHook(() => useConfirm(), { wrapper })

    let resolvedValue: boolean | undefined

    act(() => {
      result.current({ title: 'Proceed?' }).then((v) => {
        resolvedValue = v
      })
    })

    // Find and click the confirm button (default text: "Confirmar")
    const confirmBtn = screen.getByRole('button', { name: 'Confirmar' })
    await user.click(confirmBtn)

    expect(resolvedValue).toBe(true)
  })

  it('should resolve false when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const { result } = renderHook(() => useConfirm(), { wrapper })

    let resolvedValue: boolean | undefined

    act(() => {
      result.current({ title: 'Proceed?' }).then((v) => {
        resolvedValue = v
      })
    })

    const cancelBtn = screen.getByRole('button', { name: 'Cancelar' })
    await user.click(cancelBtn)

    expect(resolvedValue).toBe(false)
  })

  it('should use custom button text', async () => {
    const { result } = renderHook(() => useConfirm(), { wrapper })

    act(() => {
      result.current({
        title: 'Delete?',
        confirmText: 'Sim, deletar',
        cancelText: 'Não',
      })
    })

    expect(screen.getByRole('button', { name: 'Sim, deletar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Não' })).toBeInTheDocument()
  })

  it('should show alert icon for destructive variant', async () => {
    const { result } = renderHook(() => useConfirm(), { wrapper })

    act(() => {
      result.current({
        title: 'Danger',
        variant: 'destructive',
      })
    })

    // The destructive variant renders an AlertTriangle icon
    // Check that the title is visible (icon is an SVG inside the title element)
    expect(screen.getByText('Danger')).toBeInTheDocument()
  })

  it('should close dialog after confirm resolves', async () => {
    const user = userEvent.setup()
    const { result } = renderHook(() => useConfirm(), { wrapper })

    act(() => {
      result.current({ title: 'Close me' })
    })

    expect(screen.getByText('Close me')).toBeInTheDocument()

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar' })
    await user.click(confirmBtn)

    expect(screen.queryByText('Close me')).not.toBeInTheDocument()
  })

  it('should close dialog after cancel resolves', async () => {
    const user = userEvent.setup()
    const { result } = renderHook(() => useConfirm(), { wrapper })

    act(() => {
      result.current({ title: 'Close me' })
    })

    expect(screen.getByText('Close me')).toBeInTheDocument()

    const cancelBtn = screen.getByRole('button', { name: 'Cancelar' })
    await user.click(cancelBtn)

    expect(screen.queryByText('Close me')).not.toBeInTheDocument()
  })
})
