import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Cookie, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadAnalytics } from '../lib/analytics'
import { isAdminSubdomain } from '../lib/subdomain'

const COOKIE_CONSENT_KEY = 'clube_geek_cookie_consent'

export function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)

  // While the banner is up, pad the page by its height so nothing (the
  // login button, a form's last field) stays stuck behind it.
  useEffect(() => {
    const el = bannerRef.current
    if (!visible || !el) return
    const body = document.body
    const previous = body.style.paddingBottom
    const sync = () => {
      body.style.paddingBottom = `${el.offsetHeight}px`
    }
    sync()
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('resize', sync)
      body.style.paddingBottom = previous
    }
  }, [visible])

  useEffect(() => {
    // The staff panel keeps only the login (essential) and never loads
    // analytics, so there is nothing to consent to — and on a phone the banner
    // sat on top of the "Acessar Painel" button.
    if (isAdminSubdomain()) return
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
    <div
      ref={bannerRef}
      className="fixed bottom-0 left-0 right-0 z-9998 p-2 sm:p-4 animate-in slide-in-from-bottom duration-300"
    >
      <div className="mx-auto max-w-xl bg-card border border-border rounded-xl shadow-2xl p-3 sm:p-5">
        <div className="flex items-start gap-2 sm:gap-3">
          <Cookie className="hidden h-5 w-5 text-primary shrink-0 mt-0.5 sm:block" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Este site utiliza cookies</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="hidden sm:inline">
                Usamos cookies essenciais para o funcionamento do site e cookies de analytics para
                melhorar sua experiência. Ao continuar, você concorda com nossa{' '}
              </span>
              <span className="sm:hidden">Essenciais e de analytics. Veja a{' '}</span>
              <Link to="/privacidade" className="text-primary underline">
                Política de Privacidade
              </Link>.
            </p>
            <div className="mt-2 flex gap-2 sm:mt-3">
              <Button className="h-11 flex-1 sm:h-9 sm:flex-none" size="sm" onClick={accept}>
                Aceitar todos
              </Button>
              <Button className="h-11 flex-1 sm:h-9 sm:flex-none" size="sm" variant="outline" onClick={acceptEssentialOnly}>
                Apenas essenciais
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={acceptEssentialOnly}
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}
