import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'geekpop-theme'

type ThemeContextValue = {
  /** The user's stored preference, including "system". */
  theme: ThemePreference
  /** Tema efetivo aplicado no DOM. */
  resolved: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
  /** Toggles light/dark, resolving 'system' to the opposite of the current look. */
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  // Default: light (marca / site institucional)
  return 'light'
}

function applyDomTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  // theme-color for mobile browser chrome
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#12121A' : '#F04080')
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() =>
    typeof window !== 'undefined' ? readStored() : 'light'
  )
  const [system, setSystem] = useState<ResolvedTheme>(() =>
    typeof window !== 'undefined' ? getSystemTheme() : 'light'
  )

  const resolved: ResolvedTheme = theme === 'system' ? system : theme

  // Apply class whenever resolved theme changes
  useEffect(() => {
    applyDomTheme(resolved)
  }, [resolved])

  // Listen to OS preference when on "system"
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light')
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved, setTheme])

  const value = useMemo(
    () => ({ theme, resolved, setTheme, toggle }),
    [theme, resolved, setTheme, toggle]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Fallback for unit tests / edge renders outside ThemeProvider. */
const THEME_FALLBACK: ThemeContextValue = {
  theme: 'light',
  resolved: 'light',
  setTheme: () => {},
  toggle: () => {},
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  return ctx ?? THEME_FALLBACK
}
