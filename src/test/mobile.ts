import { vi } from 'vitest'
import { MOBILE_QUERY } from '../hooks/useIsMobile'

/** Makes `useIsMobile()` answer true, as on a 390px phone. Undo with `vi.restoreAllMocks()`. */
export function mockPhoneScreen() {
  return vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === MOBILE_QUERY,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList
  )
}
