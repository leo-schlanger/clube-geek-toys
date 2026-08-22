import { useQuery } from '@tanstack/react-query'
import { getActiveEvent } from '../lib/events'
import { FALLBACK_EVENT, isEventVisible, type EventConfig } from '../data/event'

/** Shared cache key — banner, header, card, and event page share it. */
export const ACTIVE_EVENT_QUERY_KEY = ['events', 'active'] as const

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
    queryFn: getActiveEvent,
    placeholderData: FALLBACK_EVENT,
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
