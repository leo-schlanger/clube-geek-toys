import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from './ErrorBoundary'

vi.mock('../lib/error-tracking', () => ({
  ErrorTracker: { captureException: vi.fn() },
}))
import { ErrorTracker } from '../lib/error-tracking'

function ThrowStaleChunk() {
  throw new Error(
    'Failed to fetch dynamically imported module: https://adm.geeketoys.com.br/assets/ProductsTab-a1b2.js'
  )
}

// Component that throws an error
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message')
  }
  return <div>No error</div>
}

describe('ErrorBoundary', () => {
  // Suppress console.error during error boundary tests
  const originalError = console.error
  beforeEach(() => {
    console.error = vi.fn()
  })
  afterEach(() => {
    console.error = originalError
  })

  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('should render error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument()
  })

  it('should show error details', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Detalhes do erro')).toBeInTheDocument()
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('should render reload button', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByRole('button', { name: /recarregar/i })).toBeInTheDocument()
  })

  it('should render home button', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByRole('button', { name: /início/i })).toBeInTheDocument()
  })

  it('should render custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Custom fallback')).toBeInTheDocument()
    expect(screen.queryByText('Algo deu errado')).not.toBeInTheDocument()
  })

  it('should call window.location.reload on reload button click', async () => {
    const user = userEvent.setup()
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock, href: '' },
      writable: true,
    })

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    await user.click(screen.getByRole('button', { name: /recarregar/i }))
    expect(reloadMock).toHaveBeenCalled()
  })

  it('should navigate to home on home button click', async () => {
    const user = userEvent.setup()
    let hrefValue = ''
    Object.defineProperty(window, 'location', {
      value: {
        reload: vi.fn(),
        get href() {
          return hrefValue
        },
        set href(value) {
          hrefValue = value
        },
      },
      writable: true,
    })

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    await user.click(screen.getByRole('button', { name: /início/i }))
    expect(hrefValue).toBe('/')
  })

  // `logger` is a no-op in production, so a crash in the panel used to leave no
  // trace at all: nothing in the console, nothing in error_logs. Diagnosing it
  // meant asking the person at the counter to describe a screen.
  it('files the crash so it reaches error_logs', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(ErrorTracker.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error message' }),
      expect.objectContaining({ context: 'react.error_boundary', staleBundle: false })
    )
  })

  describe('when the browser is holding a build the server no longer has', () => {
    const realLocation = window.location

    beforeEach(() => {
      const store = new Map<string, string>()
      vi.stubGlobal('sessionStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
      })
      vi.stubGlobal('navigator', {
        serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([]) },
      })
      vi.stubGlobal('caches', {
        keys: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
      })
      Object.defineProperty(window, 'location', {
        value: { ...realLocation, origin: realLocation.origin, reload: vi.fn() },
        writable: true,
        configurable: true,
      })
    })

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        value: realLocation,
        writable: true,
        configurable: true,
      })
      vi.unstubAllGlobals()
    })

    // A stale chunk is not something the person in front of the screen can act
    // on, and "Algo deu errado" invited them to reload into the same broken
    // shell. Recover instead, and say what is happening.
    it('recovers instead of blaming the user', async () => {
      render(
        <ErrorBoundary>
          <ThrowStaleChunk />
        </ErrorBoundary>
      )

      expect(await screen.findByText('Atualizando o painel…')).toBeInTheDocument()
      expect(screen.queryByText('Algo deu errado')).not.toBeInTheDocument()
    })

    it('shows the update prompt rather than a generic failure once it has tried', async () => {
      sessionStorage.setItem('clube_geek_stale_bundle_recovery', 'já tentou')

      render(
        <ErrorBoundary>
          <ThrowStaleChunk />
        </ErrorBoundary>
      )

      expect(await screen.findByText('Versão desatualizada')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /atualizar/i })).toBeInTheDocument()
    })
  })
})
