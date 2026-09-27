/**
 * The active event, and the copy of it kept for the next visit.
 *
 * The bundled fallback is always a past event, and past events hide
 * themselves — so without the cache a slow phone showed no event at all until
 * `/events/active` answered. These pin what the cache may hold.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { FALLBACK_EVENT, type EventConfig } from '../data/event'

const getActiveEvent = vi.hoisted(() => vi.fn())
vi.mock('../lib/events', () => ({ getActiveEvent }))

import { useActiveEvent } from './useActiveEvent'

const KEY = 'active-event:v1'
const FUTURE: EventConfig = {
  ...FALLBACK_EVENT,
  id: 'evento-geekpop',
  title: 'Evento GeeKpop!',
  startsAt: '2099-10-11T17:00:00.000Z',
  endsAt: '2099-10-11T21:00:00.000Z',
}

// The test setup mocks localStorage with vi.fn(); a real map is what matters here.
let store: Record<string, string>
beforeEach(() => {
  vi.clearAllMocks()
  store = {}
  vi.mocked(localStorage.getItem).mockImplementation((k: string) => store[k] ?? null)
  vi.mocked(localStorage.setItem).mockImplementation((k: string, v: string) => {
    store[k] = v
  })
  vi.mocked(localStorage.removeItem).mockImplementation((k: string) => {
    delete store[k]
  })
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useActiveEvent', () => {
  it('stores what the API returned for the next first paint', async () => {
    getActiveEvent.mockResolvedValue(FUTURE)
    const { result } = renderHook(() => useActiveEvent(), { wrapper })
    await waitFor(() => expect(result.current.isPlaceholder).toBe(false))
    expect(result.current.visible).toBe(true)
    expect(JSON.parse(store[KEY]).id).toBe('evento-geekpop')
  })

  it('paints the cached event before the API answers', () => {
    store[KEY] = JSON.stringify(FUTURE)
    getActiveEvent.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useActiveEvent(), { wrapper })
    expect(result.current.isPlaceholder).toBe(true)
    expect(result.current.event.id).toBe('evento-geekpop')
    expect(result.current.visible).toBe(true)
  })

  it('never caches the bundled fallback — it is what a failed call returns', async () => {
    getActiveEvent.mockResolvedValue(FALLBACK_EVENT)
    const { result } = renderHook(() => useActiveEvent(), { wrapper })
    await waitFor(() => expect(result.current.isPlaceholder).toBe(false))
    expect(store[KEY]).toBeUndefined()
  })

  it('forgets the event once the admin archives everything', async () => {
    store[KEY] = JSON.stringify(FUTURE)
    getActiveEvent.mockResolvedValue(null)
    const { result } = renderHook(() => useActiveEvent(), { wrapper })
    await waitFor(() => expect(result.current.isPlaceholder).toBe(false))
    expect(result.current.visible).toBe(false)
    expect(store[KEY]).toBeUndefined()
  })

  it('ignores a corrupt cache and a storage that throws', () => {
    store[KEY] = '{not json'
    getActiveEvent.mockReturnValue(new Promise(() => {}))
    const first = renderHook(() => useActiveEvent(), { wrapper })
    expect(first.result.current.event.id).toBe(FALLBACK_EVENT.id)

    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error('private mode')
    })
    const second = renderHook(() => useActiveEvent(), { wrapper })
    expect(second.result.current.event.id).toBe(FALLBACK_EVENT.id)
  })
})
