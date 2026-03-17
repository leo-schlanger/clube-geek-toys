import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts, formatShortcut, ADMIN_SHORTCUTS } from './useKeyboardShortcuts'

// Helper to create keyboard events
function createKeyboardEvent(
  key: string,
  options: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}
): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    ctrlKey: options.ctrl || false,
    altKey: options.alt || false,
    shiftKey: options.shift || false,
    metaKey: options.meta || false,
    bubbles: true,
  })
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should call handler for matching shortcut', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ 'ctrl+s': handler }))

    const event = createKeyboardEvent('s', { ctrl: true })
    window.dispatchEvent(event)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should handle escape key', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ esc: handler }))

    const event = createKeyboardEvent('Escape')
    window.dispatchEvent(event)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should not call handler when disabled', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ 'ctrl+s': handler }, false))

    const event = createKeyboardEvent('s', { ctrl: true })
    window.dispatchEvent(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it('should handle multiple shortcuts', () => {
    const saveHandler = vi.fn()
    const closeHandler = vi.fn()
    renderHook(() =>
      useKeyboardShortcuts({
        'ctrl+s': saveHandler,
        esc: closeHandler,
      })
    )

    window.dispatchEvent(createKeyboardEvent('s', { ctrl: true }))
    window.dispatchEvent(createKeyboardEvent('Escape'))

    expect(saveHandler).toHaveBeenCalledTimes(1)
    expect(closeHandler).toHaveBeenCalledTimes(1)
  })

  it('should handle shift modifier', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ 'ctrl+shift+s': handler }))

    const event = createKeyboardEvent('s', { ctrl: true, shift: true })
    window.dispatchEvent(event)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should handle meta key as ctrl', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ 'ctrl+s': handler }))

    const event = createKeyboardEvent('s', { meta: true })
    window.dispatchEvent(event)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should not call handler for unmatched shortcut', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ 'ctrl+s': handler }))

    const event = createKeyboardEvent('d', { ctrl: true })
    window.dispatchEvent(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it('should cleanup listener on unmount', () => {
    const handler = vi.fn()
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useKeyboardShortcuts({ 'ctrl+s': handler }))

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})

describe('formatShortcut', () => {
  it('should format ctrl shortcuts', () => {
    expect(formatShortcut('ctrl+s')).toBe('⌘/Ctrl+S')
  })

  it('should format escape', () => {
    expect(formatShortcut('esc')).toBe('Esc')
  })

  it('should format complex shortcuts', () => {
    expect(formatShortcut('ctrl+shift+s')).toBe('⌘/Ctrl+Shift+S')
  })

  it('should format alt shortcuts', () => {
    expect(formatShortcut('alt+a')).toBe('Alt+A')
  })
})

describe('ADMIN_SHORTCUTS', () => {
  it('should have correct shortcuts defined', () => {
    expect(ADMIN_SHORTCUTS.SAVE).toBe('ctrl+s')
    expect(ADMIN_SHORTCUTS.NEW).toBe('ctrl+n')
    expect(ADMIN_SHORTCUTS.SEARCH).toBe('ctrl+k')
    expect(ADMIN_SHORTCUTS.CLOSE).toBe('esc')
    expect(ADMIN_SHORTCUTS.REFRESH).toBe('ctrl+r')
  })
})
