import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseNowPlaying = vi.fn()

vi.mock('../hooks/useNowPlaying', () => ({
  useNowPlaying: () => mockUseNowPlaying(),
}))

// Mock framer-motion: render children directly, forward button props
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, className }: Record<string, unknown>) => (
      <div className={className as string} data-testid="motion-div">
        {children as React.ReactNode}
      </div>
    ),
    button: ({ children, onClick, className, ...rest }: Record<string, unknown>) => (
      <button
        onClick={onClick as React.MouseEventHandler}
        className={className as string}
        aria-label={(rest as Record<string, string>)['aria-label']}
        data-testid="motion-button"
      >
        {children as React.ReactNode}
      </button>
    ),
  },
}))

vi.mock('lucide-react', () => {
  const icon = (name: string) => {
    const Comp = (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />
    Comp.displayName = name
    return Comp
  }
  return {
    ChevronDown: icon('ChevronDown'),
    Music: icon('Music'),
    Pause: icon('Pause'),
    Play: icon('Play'),
    Radio: icon('Radio'),
    Users: icon('Users'),
    Volume2: icon('Volume2'),
    VolumeX: icon('VolumeX'),
    X: icon('X'),
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultNowPlaying() {
  return {
    song: {
      title: 'Dynamite',
      artist: 'BTS',
      album: 'BE',
      art: 'https://example.com/art.jpg',
    },
    listeners: 42,
    streamUrl: 'https://radio.geeketoys.com.br/listen/geek_e_toys/radio.mp3',
    loading: false,
  }
}

// We need to properly mock HTMLMediaElement for the audio element
function mockAudioElement() {
  const playMock = vi.fn().mockResolvedValue(undefined)
  const pauseMock = vi.fn()
  const loadMock = vi.fn()

  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: playMock,
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: pauseMock,
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    value: loadMock,
  })

  return { playMock, pauseMock, loadMock }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RadioMiniPlayer', () => {
  let audioMocks: ReturnType<typeof mockAudioElement>

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseNowPlaying.mockReturnValue(defaultNowPlaying())
    audioMocks = mockAudioElement()
  })

  it('should render in collapsed state by default', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    // Collapsed shows "Ouça a rádio geek" text
    expect(screen.getByText(/Ouça a rádio geek/)).toBeInTheDocument()
    // Should have a button to expand
    expect(screen.getByLabelText('Abrir player da rádio')).toBeInTheDocument()
  })

  it('should render audio element with stream URL', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    const { container } = render(<RadioMiniPlayer />)

    const audio = container.querySelector('audio')
    expect(audio).toBeInTheDocument()
    expect(audio?.getAttribute('src')).toBe(
      'https://radio.geeketoys.com.br/listen/geek_e_toys/radio.mp3'
    )
    expect(audio?.getAttribute('preload')).toBe('none')
  })

  it('should expand when collapsed button is clicked', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    const expandBtn = screen.getByLabelText('Abrir player da rádio')
    fireEvent.click(expandBtn)

    // In expanded mode, shows full player UI
    await waitFor(() => {
      expect(screen.getByText('Ao Vivo')).toBeInTheDocument()
    })
  })

  it('should show song info in expanded view', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    // Expand the player
    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))

    await waitFor(() => {
      expect(screen.getByText('Dynamite')).toBeInTheDocument()
      expect(screen.getByText('BTS')).toBeInTheDocument()
    })
  })

  it('should show listener count in expanded view', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
    })
  })

  it('should show loading skeleton when loading', async () => {
    mockUseNowPlaying.mockReturnValue({
      ...defaultNowPlaying(),
      song: null,
      loading: true,
    })
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    const { container } = render(<RadioMiniPlayer />)

    // Expand first
    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))

    // Should show pulse placeholders
    await waitFor(() => {
      const pulses = container.querySelectorAll('.animate-pulse')
      expect(pulses.length).toBeGreaterThan(0)
    })
  })

  it('should show fallback text when no song data', async () => {
    mockUseNowPlaying.mockReturnValue({
      ...defaultNowPlaying(),
      song: null,
      loading: false,
    })
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))

    await waitFor(() => {
      expect(screen.getByText('Clique para ouvir')).toBeInTheDocument()
    })
  })

  it('should show Music icon instead of art when no art URL', async () => {
    mockUseNowPlaying.mockReturnValue({
      ...defaultNowPlaying(),
      song: { title: 'Test', artist: 'Artist', album: '', art: '' },
    })
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))

    await waitFor(() => {
      expect(screen.getByTestId('icon-Music')).toBeInTheDocument()
    })
  })

  it('should minimize when ChevronDown button is clicked', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    // Expand
    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))
    await waitFor(() => {
      expect(screen.getByLabelText('Minimizar')).toBeInTheDocument()
    })

    // Minimize
    fireEvent.click(screen.getByLabelText('Minimizar'))

    await waitFor(() => {
      // Back to collapsed state
      expect(screen.getByLabelText('Abrir player da rádio')).toBeInTheDocument()
    })
  })

  it('should hide completely when X button is clicked', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    // Expand
    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))
    await waitFor(() => {
      expect(screen.getByLabelText('Fechar player')).toBeInTheDocument()
    })

    // Close
    fireEvent.click(screen.getByLabelText('Fechar player'))

    // Should render nothing except the audio element
    await waitFor(() => {
      expect(screen.queryByLabelText('Abrir player da rádio')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Fechar player')).not.toBeInTheDocument()
    })
  })

  it('should toggle play/pause on album art click', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    // Expand
    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))

    await waitFor(() => {
      expect(screen.getByLabelText('Tocar')).toBeInTheDocument()
    })

    // Play
    fireEvent.click(screen.getByLabelText('Tocar'))

    await waitFor(() => {
      expect(audioMocks.playMock).toHaveBeenCalled()
    })
  })

  it('should show volume slider', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))

    await waitFor(() => {
      expect(screen.getByLabelText('Volume')).toBeInTheDocument()
    })
  })

  it('should toggle mute on mute button click', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))

    await waitFor(() => {
      expect(screen.getByLabelText('Silenciar')).toBeInTheDocument()
    })

    // Mute
    fireEvent.click(screen.getByLabelText('Silenciar'))

    await waitFor(() => {
      expect(screen.getByLabelText('Ativar som')).toBeInTheDocument()
    })
  })

  it('should change volume via slider', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))

    const slider = screen.getByLabelText('Volume')
    fireEvent.change(slider, { target: { value: '50' } })

    expect((slider as HTMLInputElement).value).toBe('50')
  })

  it('should unmute when volume slider changed from 0', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))

    // Mute first
    fireEvent.click(screen.getByLabelText('Silenciar'))
    await waitFor(() => {
      expect(screen.getByLabelText('Ativar som')).toBeInTheDocument()
    })

    // Change volume > 0 should unmute
    const slider = screen.getByLabelText('Volume')
    fireEvent.change(slider, { target: { value: '60' } })

    await waitFor(() => {
      expect(screen.getByLabelText('Silenciar')).toBeInTheDocument()
    })
  })

  it('should show artist name in collapsed view when playing', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    // Expand and play
    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))
    await waitFor(() => {
      expect(screen.getByLabelText('Tocar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByLabelText('Tocar'))

    // Minimize
    await waitFor(() => {
      expect(screen.getByLabelText('Minimizar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByLabelText('Minimizar'))

    // In collapsed view, should show artist name
    await waitFor(() => {
      expect(screen.getByText('BTS')).toBeInTheDocument()
    })
  })

  it('should render album art image when available', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    fireEvent.click(screen.getByLabelText('Abrir player da rádio'))

    await waitFor(() => {
      const img = screen.getByAltText('Dynamite \u2014 BTS')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', 'https://example.com/art.jpg')
    })
  })

  it('should show radio branding text', async () => {
    const RadioMiniPlayer = (await import('./RadioMiniPlayer')).default
    render(<RadioMiniPlayer />)

    // Collapsed state shows "Rádio" label
    expect(screen.getByText('Rádio')).toBeInTheDocument()
  })
})
