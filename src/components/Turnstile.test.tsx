import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

// We need to control SITE_KEY via import.meta.env before importing the component
const MOCK_SITE_KEY = 'test-site-key-123'

// Mock import.meta.env at module level
vi.stubEnv('VITE_TURNSTILE_SITE_KEY', MOCK_SITE_KEY)

describe('Turnstile', () => {
  let renderMock: ReturnType<typeof vi.fn>
  let removeMock: ReturnType<typeof vi.fn>
  let resetMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    renderMock = vi.fn().mockReturnValue('widget-id-1')
    removeMock = vi.fn()
    resetMock = vi.fn()
    window.turnstile = {
      render: renderMock,
      remove: removeMock,
      reset: resetMock,
    }
    vi.useFakeTimers()
  })

  afterEach(() => {
    delete window.turnstile
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should render the container div when SITE_KEY is set', async () => {
    const { Turnstile } = await import('./Turnstile')
    const { container } = render(<Turnstile onVerify={vi.fn()} />)
    const div = container.querySelector('.flex.justify-center')
    expect(div).toBeInTheDocument()
  })

  it('should call window.turnstile.render on mount when turnstile is available', async () => {
    const { Turnstile } = await import('./Turnstile')
    const onVerify = vi.fn()
    render(<Turnstile onVerify={onVerify} />)
    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(renderMock).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        sitekey: MOCK_SITE_KEY,
        theme: 'dark',
        language: 'pt-br',
      }),
    )
  })

  it('should invoke onVerify callback when turnstile calls back with a token', async () => {
    const { Turnstile } = await import('./Turnstile')
    const onVerify = vi.fn()
    renderMock.mockImplementation((_el: HTMLElement, options: { callback: (t: string) => void }) => {
      options.callback('test-token-abc')
      return 'widget-id-1'
    })
    render(<Turnstile onVerify={onVerify} />)
    expect(onVerify).toHaveBeenCalledWith('test-token-abc')
  })

  it('should invoke onExpire callback when token expires', async () => {
    const { Turnstile } = await import('./Turnstile')
    const onExpire = vi.fn()
    renderMock.mockImplementation((_el: HTMLElement, options: { 'expired-callback'?: () => void }) => {
      options['expired-callback']?.()
      return 'widget-id-1'
    })
    render(<Turnstile onVerify={vi.fn()} onExpire={onExpire} />)
    expect(onExpire).toHaveBeenCalled()
  })

  it('should invoke onError callback when turnstile encounters an error', async () => {
    const { Turnstile } = await import('./Turnstile')
    const onError = vi.fn()
    renderMock.mockImplementation((_el: HTMLElement, options: { 'error-callback'?: () => void }) => {
      options['error-callback']?.()
      return 'widget-id-1'
    })
    render(<Turnstile onVerify={vi.fn()} onError={onError} />)
    expect(onError).toHaveBeenCalled()
  })

  it('should remove widget on unmount', async () => {
    const { Turnstile } = await import('./Turnstile')
    const { unmount } = render(<Turnstile onVerify={vi.fn()} />)
    unmount()
    expect(removeMock).toHaveBeenCalledWith('widget-id-1')
  })

  it('should poll for turnstile if not yet loaded on mount', async () => {
    delete window.turnstile
    const { Turnstile } = await import('./Turnstile')
    render(<Turnstile onVerify={vi.fn()} />)
    expect(renderMock).not.toHaveBeenCalled()

    // Now simulate turnstile becoming available after a delay
    window.turnstile = {
      render: renderMock,
      remove: removeMock,
      reset: resetMock,
    }
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(renderMock).toHaveBeenCalledTimes(1)
  })
})

describe('Turnstile without SITE_KEY', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should return null when SITE_KEY is empty', async () => {
    // Re-import to get fresh module with empty SITE_KEY
    vi.resetModules()
    const { Turnstile } = await import('./Turnstile')
    const { container } = render(<Turnstile onVerify={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
})
