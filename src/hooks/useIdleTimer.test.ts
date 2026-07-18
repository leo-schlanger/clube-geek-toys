import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIdleTimer } from './useIdleTimer'

describe('useIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should call onIdle after timeout', () => {
    const onIdle = vi.fn()

    renderHook(() => useIdleTimer({ timeout: 5000, onIdle }))

    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(5000)

    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('should not call onIdle before timeout', () => {
    const onIdle = vi.fn()

    renderHook(() => useIdleTimer({ timeout: 5000, onIdle }))

    vi.advanceTimersByTime(4999)

    expect(onIdle).not.toHaveBeenCalled()
  })

  it('should reset timer on user activity events', () => {
    const onIdle = vi.fn()

    renderHook(() => useIdleTimer({ timeout: 5000, onIdle }))

    // Advance 3 seconds
    vi.advanceTimersByTime(3000)
    expect(onIdle).not.toHaveBeenCalled()

    // Simulate user activity (mousedown)
    window.dispatchEvent(new Event('mousedown'))

    // Need to flush requestAnimationFrame for throttle
    // Advance another 4 seconds — wouldn't fire if timer was reset
    vi.advanceTimersByTime(4000)
    expect(onIdle).not.toHaveBeenCalled()

    // Advance remaining 1 second (total 5 since last activity)
    vi.advanceTimersByTime(1000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('should reset timer on keydown', () => {
    const onIdle = vi.fn()

    renderHook(() => useIdleTimer({ timeout: 3000, onIdle }))

    vi.advanceTimersByTime(2000)
    window.dispatchEvent(new Event('keydown'))

    vi.advanceTimersByTime(2000)
    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('should not fire when disabled', () => {
    const onIdle = vi.fn()

    renderHook(() => useIdleTimer({ timeout: 1000, onIdle, disabled: true }))

    vi.advanceTimersByTime(5000)

    expect(onIdle).not.toHaveBeenCalled()
  })

  it('should stop firing after unmount', () => {
    const onIdle = vi.fn()

    const { unmount } = renderHook(() => useIdleTimer({ timeout: 2000, onIdle }))

    vi.advanceTimersByTime(1000)
    unmount()

    vi.advanceTimersByTime(5000)

    expect(onIdle).not.toHaveBeenCalled()
  })

  it('should remove event listeners on unmount', () => {
    const onIdle = vi.fn()
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useIdleTimer({ timeout: 5000, onIdle }))

    unmount()

    const removedEvents = removeSpy.mock.calls.map(c => c[0])
    expect(removedEvents).toContain('mousedown')
    expect(removedEvents).toContain('keydown')
    expect(removedEvents).toContain('touchstart')
    expect(removedEvents).toContain('scroll')
    expect(removedEvents).toContain('mousemove')
  })

  it('should use the latest onIdle callback', () => {
    const onIdle1 = vi.fn()
    const onIdle2 = vi.fn()

    const { rerender } = renderHook(
      ({ onIdle }) => useIdleTimer({ timeout: 3000, onIdle }),
      { initialProps: { onIdle: onIdle1 } }
    )

    vi.advanceTimersByTime(1000)

    // Update onIdle callback
    rerender({ onIdle: onIdle2 })

    vi.advanceTimersByTime(2000)

    expect(onIdle1).not.toHaveBeenCalled()
    expect(onIdle2).toHaveBeenCalledTimes(1)
  })

  it('should re-enable timer when disabled changes to false', () => {
    const onIdle = vi.fn()

    const { rerender } = renderHook(
      ({ disabled }) => useIdleTimer({ timeout: 2000, onIdle, disabled }),
      { initialProps: { disabled: true } }
    )

    vi.advanceTimersByTime(5000)
    expect(onIdle).not.toHaveBeenCalled()

    // Enable the timer
    rerender({ disabled: false })

    vi.advanceTimersByTime(2000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })
})
