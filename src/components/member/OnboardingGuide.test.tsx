import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingGuide } from './OnboardingGuide'

describe('OnboardingGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null)
    ;(localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {})
  })

  function recentDate(daysAgo: number): string {
    return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  }

  it('renders for a new member (< 30 days old)', () => {
    render(<OnboardingGuide memberStartDate={recentDate(5)} />)
    expect(screen.getByText('Bem-vindo ao Clube!')).toBeInTheDocument()
  })

  it('renders the three onboarding steps', () => {
    render(<OnboardingGuide memberStartDate={recentDate(5)} />)
    expect(screen.getByText('Mostre sua carteirinha')).toBeInTheDocument()
    expect(screen.getByText('Ganhe 15% em qualquer produto')).toBeInTheDocument()
    expect(screen.getByText('Brinde e eventos')).toBeInTheDocument()
  })

  it('renders step descriptions', () => {
    render(<OnboardingGuide memberStartDate={recentDate(5)} />)
    expect(screen.getByText(/Toque no cartão acima para ver o QR Code/)).toBeInTheDocument()
    expect(screen.getByText(/Seu desconto de membro vale na loja física e na loja online/)).toBeInTheDocument()
    expect(screen.getByText(/Retire seu brinde especial e entre de graça nos eventos participantes/)).toBeInTheDocument()
  })

  it('does not mention points anywhere', () => {
    render(<OnboardingGuide memberStartDate={recentDate(5)} />)
    expect(screen.queryByText(/pontos/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Acumule pontos')).not.toBeInTheDocument()
    expect(screen.queryByText('Resgate recompensas')).not.toBeInTheDocument()
  })

  it('does not render for members older than 30 days', () => {
    const { container } = render(<OnboardingGuide memberStartDate={recentDate(35)} />)
    expect(container.innerHTML).toBe('')
  })

  it('does not render when previously dismissed', () => {
    ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('1')
    const { container } = render(<OnboardingGuide memberStartDate={recentDate(5)} />)
    expect(container.innerHTML).toBe('')
  })

  it('dismisses and persists to localStorage on X click', () => {
    render(<OnboardingGuide memberStartDate={recentDate(5)} />)
    fireEvent.click(screen.getByTitle('Dispensar'))
    expect(localStorage.setItem).toHaveBeenCalledWith('clube_geek_onboarding_dismissed', '1')
  })

  it('collapses steps when header is clicked', () => {
    render(<OnboardingGuide memberStartDate={recentDate(5)} />)
    // Steps visible initially
    expect(screen.getByText('Mostre sua carteirinha')).toBeInTheDocument()
    // Click header to collapse
    fireEvent.click(screen.getByText('Bem-vindo ao Clube!'))
    // Steps should be hidden
    expect(screen.queryByText('Mostre sua carteirinha')).not.toBeInTheDocument()
  })

  it('expands steps when header is clicked again after collapse', () => {
    render(<OnboardingGuide memberStartDate={recentDate(5)} />)
    // Collapse
    fireEvent.click(screen.getByText('Bem-vindo ao Clube!'))
    expect(screen.queryByText('Mostre sua carteirinha')).not.toBeInTheDocument()
    // Expand
    fireEvent.click(screen.getByText('Bem-vindo ao Clube!'))
    expect(screen.getByText('Mostre sua carteirinha')).toBeInTheDocument()
  })
})
