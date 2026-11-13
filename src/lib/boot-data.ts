/**
 * First-screen data fetched by public/boot.js while the bundle downloads
 * (shop only: promo, active event, home highlights). Pages wait for it a
 * moment before mounting, so the promo and event strips and the highlights
 * are there on first paint instead of pushing the page down later.
 */

import type { QueryClient } from '@tanstack/react-query'
import type { EventConfig } from '../data/event'
import { ACTIVE_EVENT_QUERY_KEY } from '../hooks/useActiveEvent'
import { SHOP_PROMO_QUERY_KEY } from '../hooks/useShopPromo'
import type { ShopPromo } from './promo'

type BootPromises = Record<string, Promise<unknown>>

declare global {
  interface Window {
    __geekpopBoot?: BootPromises
  }
}

// Boot answers are only trusted briefly: after that the app's own call rules.
const FRESH_MS = 60_000

const settled = new Map<string, { data: unknown; at: number }>()
let watching: Promise<void> | null = null

function watch(): Promise<void> {
  if (watching) return watching
  const boot = typeof window !== 'undefined' ? window.__geekpopBoot : undefined
  if (!boot) return (watching = Promise.resolve())
  watching = Promise.all(
    Object.entries(boot).map(([path, promise]) =>
      Promise.resolve(promise)
        .then((data) => {
          if (data != null) settled.set(path, { data, at: Date.now() })
        })
        .catch(() => undefined)
    )
  ).then(() => undefined)
  return watching
}

/** Resolves when the boot answers are in, or after `capMs`, whichever first. */
export function bootDataReady(capMs = 400): Promise<void> {
  return Promise.race([watch(), new Promise<void>((resolve) => setTimeout(resolve, capMs))])
}

/** Wraps a lazy page import so it mounts with the boot data when possible. */
export function withBootData<T>(load: Promise<T>, capMs = 400): Promise<T> {
  return Promise.all([load, bootDataReady(capMs)]).then(([module]) => module)
}

/** The boot answer for `path`, if it arrived and is still fresh. */
export function peekBootData<T>(path: string): T | undefined {
  const hit = settled.get(path)
  if (!hit || Date.now() - hit.at > FRESH_MS) return undefined
  return hit.data as T
}

/** Test helper. */
export function resetBootData(): void {
  settled.clear()
  watching = null
}

/**
 * Puts the promo and event answers in the query cache, so the strips that
 * read them render with data on the page's first paint.
 */
export function seedQueriesFromBoot(client: QueryClient): void {
  const promo = peekBootData<ShopPromo>('/promo')
  if (promo) client.setQueryData(SHOP_PROMO_QUERY_KEY, promo)
  const active = peekBootData<{ event?: EventConfig | null }>('/events/active')
  if (active) client.setQueryData(ACTIVE_EVENT_QUERY_KEY, active.event ?? null)
}
