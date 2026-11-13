/**
 * Christmas theme gate (shop.* and club.*), 13 Nov to 26 Dec 2026 (Rio).
 * Outside the window, or on a route outside the allowlist in ./season.ts,
 * the slots render null and the lazy chunks (CSS and art) are never fetched.
 * To remove: delete this folder and its slots in App.tsx, ShopHeader,
 * Subscribe, MemberDashboard and NonoMascot.
 */
import { lazy, Suspense, useState } from 'react'
import type { NonoPose } from '../../store/NonoMascot'
import type { NatalBannerVariant } from './NatalBanner'
import { natalDecorHere } from './decor'
import { natalBannerKey } from './season'

const Banner = lazy(() => import('./NatalBanner'))
const Lights = lazy(() => import('./NatalLights'))
const Hat = lazy(() => import('./NonoHat'))

function readClosed(area: 'shop' | 'club'): boolean {
  try {
    return localStorage.getItem(natalBannerKey(area)) === '1'
  } catch {
    return false
  }
}

/**
 * Greeting strip in normal flow above the page (never sticky: the headers
 * own top: 0). The fallback has the strip's height, so nothing shifts.
 * Reads the route at render: a parent that outlives navigation must
 * re-render on it (App's ShopSeasonalBanner).
 */
export function NatalBannerSlot({ variant }: { variant: NatalBannerVariant }) {
  const area = variant === 'shop' ? 'shop' : 'club'
  const [closed, setClosed] = useState(() => readClosed(area))
  if (closed || !natalDecorHere()) return null

  const close = () => {
    try {
      localStorage.setItem(natalBannerKey(area), '1')
    } catch {
      /* private mode: closes for this view only */
    }
    setClosed(true)
  }

  return (
    <Suspense fallback={<div className="h-12 bg-[#145a37] sm:h-9 dark:bg-[#0f4a2c]" aria-hidden="true" />}>
      <Banner variant={variant} onClose={close} />
    </Suspense>
  )
}

/**
 * Lights inside a header, below its content row: in flow (12 px), so they
 * never cover the page under a sticky header.
 */
export function NatalLightsSlot() {
  if (!natalDecorHere()) return null
  return (
    <div className="pointer-events-none h-3 overflow-hidden" aria-hidden="true" data-testid="natal-lights">
      <Suspense fallback={null}>
        <Lights />
      </Suspense>
    </div>
  )
}

/** Santa hat over Nono. The parent box must be `relative`. */
export function NatalNonoHat({ pose }: { pose: NonoPose }) {
  return (
    <Suspense fallback={null}>
      <Hat pose={pose} />
    </Suspense>
  )
}
