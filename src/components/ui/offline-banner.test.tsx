import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock useOnlineStatus hook
const mockUseOnlineStatus = vi.fn()
vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}))

import { OfflineBanner } from './offline-banner'

describe('OfflineBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render nothing when online and was never offline', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true, wasOffline: false })
    const { container } = render(<OfflineBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('should render offline message when offline', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: false, wasOffline: true })
    render(<OfflineBanner />)
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
    expect(screen.getByText(/verifique sua conexão/i)).toBeInTheDocument()
  })

  it('should have role="alert" for accessibility', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: false, wasOffline: false })
    render(<OfflineBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('should have aria-live="polite"', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: false, wasOffline: false })
    render(<OfflineBanner />)
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite')
  })

  it('should apply yellow background when offline', () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: false, wasOffline: false })
    render(<OfflineBanner />)
    expect(screen.getByRole('alert')).toHaveClass('bg-yellow-500')
  })

  it('should show reconnected message when back online after being offline', async () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true, wasOffline: true })
    render(<OfflineBanner />)
    // The reconnected message appears via queueMicrotask, so wait a tick
    await vi.waitFor(() => {
      expect(screen.getByText(/conexão restaurada/i)).toBeInTheDocument()
    })
  })

  it('should apply green background when reconnected', async () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true, wasOffline: true })
    render(<OfflineBanner />)
    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveClass('bg-green-500')
    })
  })
})
