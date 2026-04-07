import { useCallback, useEffect, useRef, useState } from 'react'
import { api, setTokens } from '../lib/api-client'
import { logger } from '../lib/logger'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

// Google Identity Services types
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
            auto_select?: boolean
          }) => void
          prompt: () => void
          renderButton: (
            element: HTMLElement,
            config: {
              type?: string
              theme?: string
              size?: string
              text?: string
              shape?: string
              width?: number
            }
          ) => void
        }
      }
    }
  }
}

interface GoogleSignInButtonProps {
  /** Text label for the button */
  label?: string
  /** Called on successful auth with user data and tokens */
  onSuccess: (data: {
    accessToken: string
    refreshToken: string
    user: { id: string; email: string; role: string; emailVerified: boolean }
    isNewUser?: boolean
    googleName?: string
  }) => void
  /** Called on error */
  onError?: (error: string) => void
  /** Disable the button */
  disabled?: boolean
}

export function GoogleSignInButton({
  label = 'Entrar com Google',
  onSuccess,
  onError,
  disabled = false,
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const initializedRef = useRef(false)

  // Load GIS script
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return

    // Check if already loaded
    if (window.google?.accounts?.id) {
      setScriptLoaded(true)
      return
    }

    // Check if script tag already exists
    if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
      // Script loading, wait for it
      const check = setInterval(() => {
        if (window.google?.accounts?.id) {
          setScriptLoaded(true)
          clearInterval(check)
        }
      }, 100)
      return () => clearInterval(check)
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => setScriptLoaded(true)
    script.onerror = () => {
      logger.error('Failed to load Google Identity Services script')
    }
    document.head.appendChild(script)
  }, [])

  // Initialize Google Identity Services
  useEffect(() => {
    if (!scriptLoaded || !GOOGLE_CLIENT_ID || initializedRef.current) return
    if (!window.google?.accounts?.id) return

    initializedRef.current = true

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded])

  const handleCredentialResponse = useCallback(
    async (response: { credential: string }) => {
      setLoading(true)
      try {
        const result = await api.post('/auth/google', { idToken: response.credential }, { skipAuth: true })

        if (result.error) {
          onError?.(result.error)
          return
        }

        const { accessToken, refreshToken, user, isNewUser, googleName } = result.data as {
          accessToken: string
          refreshToken: string
          user: { id: string; email: string; role: string; emailVerified: boolean }
          isNewUser?: boolean
          googleName?: string
        }

        setTokens(accessToken, refreshToken)
        onSuccess({ accessToken, refreshToken, user, isNewUser, googleName })
      } catch (err) {
        logger.error('Google auth error:', err)
        onError?.('Erro ao autenticar com Google')
      } finally {
        setLoading(false)
      }
    },
    [onSuccess, onError]
  )

  function handleClick() {
    if (disabled || loading || !scriptLoaded) return

    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt()
    }
  }

  // Don't render if no client ID configured
  if (!GOOGLE_CLIENT_ID) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading || !scriptLoaded}
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-md border border-border bg-white text-gray-700 font-medium shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? (
        <div className="h-5 w-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      )}
      <span>{loading ? 'Conectando...' : label}</span>
    </button>
  )
}
