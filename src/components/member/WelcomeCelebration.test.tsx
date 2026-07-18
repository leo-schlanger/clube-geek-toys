import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WelcomeCelebration } from './WelcomeCelebration'

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}))

// Mock framer-motion to render children directly
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const filteredProps: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(props)) {
        if (!['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap'].includes(k)) {
          filteredProps[k] = v
        }
      }
      return <div {...filteredProps}>{children}</div>
    },
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const filteredProps: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(props)) {
        if (!['initial', 'animate', 'exit', 'transition'].includes(k)) {
          filteredProps[k] = v
        }
      }
      return <h2 {...filteredProps}>{children}</h2>
    },
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const filteredProps: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(props)) {
        if (!['initial', 'animate', 'exit', 'transition'].includes(k)) {
          filteredProps[k] = v
        }
      }
      return <p {...filteredProps}>{children}</p>
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

describe('WelcomeCelebration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null)
    ;(localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {})
  })

  it('renders welcome message with first name', () => {
    render(<WelcomeCelebration memberName="Maria Silva" memberId="m-1" />)
    expect(screen.getByText('Bem-vindo(a), Maria!')).toBeInTheDocument()
  })

  it('renders fallback name when memberName is empty', () => {
    render(<WelcomeCelebration memberName="" memberId="m-1" />)
    expect(screen.getByText('Bem-vindo(a), Membro!')).toBeInTheDocument()
  })

  it('renders description text', () => {
    render(<WelcomeCelebration memberName="Carlos" memberId="m-1" />)
    expect(screen.getByText(/Sua conta no Clube Geek & Toys está ativa!/)).toBeInTheDocument()
  })

  it('renders the action button', () => {
    render(<WelcomeCelebration memberName="Carlos" memberId="m-1" />)
    expect(screen.getByText('Vamos lá!')).toBeInTheDocument()
  })

  it('dismisses and persists when button is clicked', () => {
    render(<WelcomeCelebration memberName="Carlos" memberId="m-1" />)
    fireEvent.click(screen.getByText('Vamos lá!'))
    expect(localStorage.setItem).toHaveBeenCalledWith('clube_geek_welcome_seen_m-1', '1')
  })

  it('dismisses when close button is clicked', () => {
    render(<WelcomeCelebration memberName="Carlos" memberId="m-1" />)
    fireEvent.click(screen.getByLabelText('Fechar'))
    expect(localStorage.setItem).toHaveBeenCalledWith('clube_geek_welcome_seen_m-1', '1')
  })

  it('does not render when already seen', () => {
    ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('1')
    render(<WelcomeCelebration memberName="Carlos" memberId="m-1" />)
    // AnimatePresence wraps, so the welcome content should not be present
    expect(screen.queryByText('Bem-vindo(a), Carlos!')).not.toBeInTheDocument()
  })

  it('fires confetti on mount', async () => {
    const confetti = (await import('canvas-confetti')).default
    render(<WelcomeCelebration memberName="Carlos" memberId="m-1" />)
    expect(confetti).toHaveBeenCalled()
  })
})
