import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useNowPlaying } from './useNowPlaying'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const fullAzuraResponse = {
  now_playing: {
    song: {
      title: 'Dynamite',
      artist: 'BTS',
      album: 'BE',
      art: 'https://radio.geeketoys.com.br/art/1.jpg',
    },
  },
  listeners: {
    current: 42,
  },
  station: {
    listen_url: 'https://radio.geeketoys.com.br/listen/geek_e_toys/stream.mp3',
  },
}

describe('useNowPlaying', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should start in loading state', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})) // never resolves

    const { result } = renderHook(() => useNowPlaying(), { wrapper: createWrapper() })

    expect(result.current.loading).toBe(true)
    expect(result.current.song).toBeNull()
    expect(result.current.listeners).toBe(0)
  })

  it('should parse full AzuraCast response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fullAzuraResponse),
    })

    const { result } = renderHook(() => useNowPlaying(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.song).toEqual({
      title: 'Dynamite',
      artist: 'BTS',
      album: 'BE',
      art: 'https://radio.geeketoys.com.br/art/1.jpg',
    })
    expect(result.current.listeners).toBe(42)
    expect(result.current.streamUrl).toBe(
      'https://radio.geeketoys.com.br/listen/geek_e_toys/stream.mp3'
    )
  })

  it('should return null song when song data is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ now_playing: {}, listeners: { current: 5 } }),
    })

    const { result } = renderHook(() => useNowPlaying(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.song).toBeNull()
    expect(result.current.listeners).toBe(5)
  })

  it('should return null song when title is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        now_playing: { song: { artist: 'BTS' } },
      }),
    })

    const { result } = renderHook(() => useNowPlaying(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.song).toBeNull()
  })

  it('should return null song when artist is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        now_playing: { song: { title: 'Dynamite' } },
      }),
    })

    const { result } = renderHook(() => useNowPlaying(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.song).toBeNull()
  })

  it('should use default album and art when missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        now_playing: { song: { title: 'Dynamite', artist: 'BTS' } },
      }),
    })

    const { result } = renderHook(() => useNowPlaying(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.song?.album).toBe('')
    expect(result.current.song?.art).toBe('')
  })

  it('should use fallback stream URL when not provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ now_playing: {} }),
    })

    const { result } = renderHook(() => useNowPlaying(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.streamUrl).toBe(
      'https://radio.geeketoys.com.br/listen/geek_e_toys/radio.mp3'
    )
  })

  it('should default listeners to 0 when not provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const { result } = renderHook(() => useNowPlaying(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.listeners).toBe(0)
  })

  it('should call fetch with correct URL and no-store cache', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fullAzuraResponse),
    })

    const { result } = renderHook(() => useNowPlaying(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://radio.geeketoys.com.br/api/nowplaying_static/geek_e_toys.json',
      { cache: 'no-store' }
    )
  })

  it('should handle HTTP errors gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useNowPlaying(), { wrapper: createWrapper() })

    // Should remain in loading or complete with defaults
    await waitFor(() => {
      // react-query will put it in error state after retries exhausted
      expect(result.current.loading).toBe(false)
    })

    // With error, data should be empty/default
    expect(result.current.song).toBeNull()
    expect(result.current.listeners).toBe(0)
  })
})
