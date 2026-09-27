import { useQuery } from '@tanstack/react-query'
import { getActiveEvent } from '../lib/events'
import { FALLBACK_EVENT, isEventVisible, type EventConfig } from '../data/event'

/** Shared cache key — banner, header, card, and event page share it. */
export const ACTIVE_EVENT_QUERY_KEY = ['events', 'active'] as const

const CACHE_KEY = 'active-event:v1'

/**
 * The last event the API returned. Painted while the next answer is on its
 * way: the bundled fallback is always a past event, which now hides itself,
 * so without this a slow phone saw no event until `/events/active` answered.
 * A cached event that has since ended hides itself the same way.
 */
function readCachedEvent(): EventConfig | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return undefined
    const event = JSON.parse(raw) as EventConfig
    return event && typeof event.id === 'string' && Array.isArray(event.description)
      ? event
      : undefined
  } catch {
    return undefined
  }
}

function writeCachedEvent(event: EventConfig | null) {
  try {
    // Never cache the bundled fallback: it is what a failed call returns.
    if (event && event !== FALLBACK_EVENT) localStorage.setItem(CACHE_KEY, JSON.stringify(event))
    else if (event === null) localStorage.removeItem(CACHE_KEY)
  } catch {
    // Private mode or blocked storage: the fallback still covers first paint.
  }
}

/**
 * The published event, loaded from the database.
 *
 * `placeholderData` is the bundled fallback so the banner paints immediately
 * instead of flashing; the API response then replaces it. Because the fallback
 * can be stale, `isPlaceholder` lets callers wait (the event page must not
 * redirect until the API answers).
 */
export function useActiveEvent(): {
  event: EventConfig
  visible: boolean
  loading: boolean
  isPlaceholder: boolean
} {
  const { data, isLoading, isPlaceholderData } = useQuery<EventConfig | null>({
    queryKey: ACTIVE_EVENT_QUERY_KEY,
    queryFn: async () => {
      const event = await getActiveEvent()
      writeCachedEvent(event)
      return event
    },
    placeholderData: () => readCachedEvent() ?? FALLBACK_EVENT,
    staleTime: 1000 * 60 * 5,
  })

  // `event` is never null so renderers skip a guard; `visible` means something
  // is on the bill. `data === null` = admin archived everything.
  return {
    event: data ?? FALLBACK_EVENT,
    visible: data != null && isEventVisible(data),
    loading: isLoading,
    isPlaceholder: isPlaceholderData,
  }
}
