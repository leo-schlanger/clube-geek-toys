import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionErrorBoundary } from './section-error-boundary'

function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Section error')
  }
  return <div>Section content</div>
}

describe('SectionErrorBoundary', () => {
  const originalError = console.error
  beforeEach(() => {
    console.error = vi.fn()
  })
  afterEach(() => {
    console.error = originalError
  })

  it('should render children when no error', () => {
    render(
      <SectionErrorBoundary>
        <div>Normal content</div>
      </SectionErrorBoundary>
    )
    expect(screen.getByText('Normal content')).toBeInTheDocument()
  })

  it('should render default error message when child throws', () => {
    render(
      <SectionErrorBoundary>
        <ThrowError shouldThrow />
      </SectionErrorBoundary>
    )
    expect(screen.getByText('Erro ao carregar esta secao')).toBeInTheDocument()
  })

  it('should render custom fallback message', () => {
    render(
      <SectionErrorBoundary fallbackMessage="Custom error message">
        <ThrowError shouldThrow />
      </SectionErrorBoundary>
    )
    expect(screen.getByText('Custom error message')).toBeInTheDocument()
  })

  it('should render retry button', () => {
    render(
      <SectionErrorBoundary>
        <ThrowError shouldThrow />
      </SectionErrorBoundary>
    )
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument()
  })

  it('should recover after clicking retry when error is resolved', async () => {
    const user = userEvent.setup()
    let shouldThrow = true

    function MaybeThrow() {
      if (shouldThrow) throw new Error('fail')
      return <div>Recovered</div>
    }

    render(
      <SectionErrorBoundary>
        <MaybeThrow />
      </SectionErrorBoundary>
    )
    expect(screen.getByText('Erro ao carregar esta secao')).toBeInTheDocument()

    // Fix the error condition
    shouldThrow = false
    await user.click(screen.getByRole('button', { name: /tentar novamente/i }))
    expect(screen.getByText('Recovered')).toBeInTheDocument()
  })

  it('should not show children content when in error state', () => {
    render(
      <SectionErrorBoundary>
        <ThrowError shouldThrow />
      </SectionErrorBoundary>
    )
    expect(screen.queryByText('Section content')).not.toBeInTheDocument()
  })
})
