/**
 * QRScanner Component Tests
 *
 * Covers: rendering, camera error states, button interactions.
 * Camera/video APIs are mocked since jsdom doesn't support them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QRScanner } from './QRScanner'

// ── Mocks ──────────────────────────────────────────────────────

vi.mock('jsqr', () => ({
  default: vi.fn().mockReturnValue(null),
}))

vi.mock('../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock getUserMedia
const mockGetUserMedia = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()

  // Default: getUserMedia rejects (no camera)
  mockGetUserMedia.mockRejectedValue(new DOMException('No camera', 'NotFoundError'))

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  })
})

// ── Tests ──────────────────────────────────────────────────────

describe('QRScanner', () => {
  const onScan = vi.fn()
  const onClose = vi.fn()

  function renderScanner() {
    return render(<QRScanner onScan={onScan} onClose={onClose} />)
  }

  it('renders scanner title', () => {
    renderScanner()
    expect(screen.getByText('Scanner de QR Code')).toBeInTheDocument()
  })

  it('renders description text', () => {
    renderScanner()
    expect(screen.getByText(/Aponte a câmera para o QR Code/)).toBeInTheDocument()
  })

  it('renders cancel button', () => {
    renderScanner()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup()
    renderScanner()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders instructions', () => {
    renderScanner()
    expect(screen.getByText(/Posicione o QR Code dentro da área de leitura/)).toBeInTheDocument()
    expect(screen.getByText(/A leitura é automática/)).toBeInTheDocument()
  })

  it('shows camera-off UI and retry button when camera fails', async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException('No camera', 'NotFoundError'))
    renderScanner()

    // After camera init fails, the component shows retry button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tentar Novamente/i })).toBeInTheDocument()
    })
  })

  it('shows error text when camera access is denied', async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    renderScanner()

    // The component falls into the camera-off state with an error message
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tentar Novamente/i })).toBeInTheDocument()
    })
    // Verify some error text is displayed (could be specific or generic depending on race)
    const errorText = screen.getByText((_, element) => {
      return element?.tagName === 'P' && element.classList.contains('text-sm') &&
        element.textContent !== null && element.textContent.includes('câmera')
    })
    expect(errorText).toBeInTheDocument()
  })

  it('renders toggle camera button when camera is available', () => {
    // Simulate successful camera access
    const mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    }
    mockGetUserMedia.mockResolvedValue(mockStream)
    renderScanner()

    // The toggle button should be present (it renders before camera init resolves
    // because hasCamera starts as true)
    const toggleBtn = screen.getByLabelText('Alternar câmera frontal/traseira')
    expect(toggleBtn).toBeInTheDocument()
  })

  it('renders video element for camera feed', () => {
    renderScanner()
    const video = screen.getByLabelText('Câmera para leitura de QR Code')
    expect(video).toBeInTheDocument()
    expect(video.tagName).toBe('VIDEO')
  })

  it('calls getUserMedia on mount', async () => {
    renderScanner()
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled()
    })
  })
})
