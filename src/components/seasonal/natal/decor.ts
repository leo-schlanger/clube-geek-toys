import { isNatalActive, isNatalDecorPath, parseSeasonOverride, type SeasonOverride } from './season'

const OVERRIDE_KEY = 'season-override'

// `?season=natal|off` sticks for the tab, so the qa can browse with it.
function readOverride(): SeasonOverride {
  const fromUrl = parseSeasonOverride(window.location.search)
  try {
    if (fromUrl) {
      sessionStorage.setItem(OVERRIDE_KEY, fromUrl)
      return fromUrl
    }
    const stored = sessionStorage.getItem(OVERRIDE_KEY)
    return stored === 'natal' || stored === 'off' ? stored : null
  } catch {
    return fromUrl
  }
}

/** Whether this page, now, gets the Christmas decoration. */
export function natalDecorHere(): boolean {
  if (typeof window === 'undefined') return false
  const override = readOverride()
  // Unit tests run with the theme off unless the URL forces it.
  if (import.meta.env.MODE === 'test' && override === null) return false
  return (
    isNatalActive(new Date(), override) &&
    isNatalDecorPath(window.location.hostname, window.location.pathname)
  )
}
