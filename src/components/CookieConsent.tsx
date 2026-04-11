import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Cookie, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadAnalytics } from '../lib/analytics'

const COOKIE_CONSENT_KEY = 'clube_geek_cookie_consent'

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY)
    if (!consent) {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  function accept() {
    localStorage.setItem(
      COOKIE_CONSENT_KEY,
      JSON.stringify({ essential: true, analytics: true, acceptedAll: true, date: new Date().toISOString() })
    )
    // LGPD: only NOW do we load analytics — never before consent.
    loadAnalytics()
    setVisible(false)
  }

  function acceptEssentialOnly() {
    localStorage.setItem(
      COOKIE_CONSENT_KEY,
      JSON.stringify({ essential: true, analytics: false, acceptedAll: false, date: new Date().toISOString() })
    )
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9998] p-4 animate-in slide-in-from-bottom duration-300">
      <div className="mx-auto max-w-xl bg-card border border-border rounded-xl shadow-2xl p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Cookie className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium mb-1">Este site utiliza cookies</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Usamos cookies essenciais para o funcionamento do site e cookies de analytics para
              melhorar sua experiência. Ao continuar, você concorda com nossa{' '}
              <Link to="/privacidade" className="text-primary underline">
                Política de Privacidade
              </Link>.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" onClick={accept}>
                Aceitar todos
              </Button>
              <Button size="sm" variant="outline" onClick={acceptEssentialOnly}>
                Apenas essenciais
              </Button>
            </div>
          </div>
          <button onClick={acceptEssentialOnly} className="p-1 hover:bg-muted rounded shrink-0" aria-label="Fechar">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}
