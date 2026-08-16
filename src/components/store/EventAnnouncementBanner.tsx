import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarHeart, Ticket, X } from 'lucide-react'
import { ACTIVE_EVENT, isEventVisible } from '../../data/event'

const STORAGE_PREFIX = 'shop-event-banner-dismissed:'

function storageKey(eventId: string) {
  return `${STORAGE_PREFIX}${eventId}`
}

function readBannerVisible(eventId: string): boolean {
  if (!isEventVisible(ACTIVE_EVENT)) return false
  try {
    return localStorage.getItem(storageKey(eventId)) !== '1'
  } catch {
    return true
  }
}

/**
 * Banner de evento no topo da loja (shop.*).
 *
 * **Fica no fluxo normal, não `sticky`.** Até 16/08/2026 era `sticky top-0
 * z-50` — e o `ShopHeader` é `sticky top-0 z-40`. Os dois grudavam no mesmo
 * `top: 0`, e o banner, com z maior, cobria o header **inteiro** assim que a
 * pessoa rolava: carrinho, login, busca e tema paravam de responder, em todas
 * as larguras, inclusive no desktop.
 *
 * No fluxo normal o banner ocupa espaço no topo da página, rola para fora e o
 * header assume o `top: 0` sozinho — que é como barra de anúncio funciona em
 * loja. O X de dispensar continua ali para quem não quiser vê-lo de novo.
 *
 * Não existe var de altura aqui de propósito: elemento no fluxo empurra o
 * conteúdo sozinho. A antiga `--shop-event-banner-h` publicava 44px/72px
 * fixos e **nenhum arquivo a lia** — foi removida junto.
 */
export function EventAnnouncementBanner() {
  const event = ACTIVE_EVENT
  const [visible, setVisible] = useState(() => readBannerVisible(event.id))

  if (!visible || !isEventVisible(event)) return null

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey(event.id), '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  const primaryIsRoute = event.ctaPrimary.href.startsWith('/')
  const secondaryIsRoute = event.ctaSecondary?.href.startsWith('/')

  return (
    <div
      role="region"
      aria-label="Anúncio do evento"
      className="relative z-50 border-b border-primary/30 bg-gradient-to-r from-primary via-primary to-primary/90 text-primary-foreground shadow-md"
    >
      <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 px-4 py-2.5 pr-10 text-center md:flex-row md:gap-4 md:pr-12 md:text-left">
        <p className="flex items-center gap-2 text-sm font-semibold leading-snug md:text-[15px]">
          <CalendarHeart className="hidden h-4 w-4 shrink-0 opacity-90 sm:inline" aria-hidden />
          <span>{event.bannerText}</span>
        </p>

        <div className="flex shrink-0 items-center gap-2">
          {event.ctaSecondary &&
            (secondaryIsRoute ? (
              <Link
                to={event.ctaSecondary.href}
                className="text-xs font-medium underline-offset-2 hover:underline md:text-sm opacity-95"
              >
                {event.ctaSecondary.label}
              </Link>
            ) : (
              <a
                href={event.ctaSecondary.href}
                className="text-xs font-medium underline-offset-2 hover:underline md:text-sm opacity-95"
              >
                {event.ctaSecondary.label}
              </a>
            ))}
          {primaryIsRoute ? (
            <Link
              to={event.ctaPrimary.href}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground shadow-sm transition-all hover:brightness-105 md:text-sm"
            >
              <Ticket className="h-3.5 w-3.5" aria-hidden />
              {event.ctaPrimary.label}
            </Link>
          ) : (
            <a
              href={event.ctaPrimary.href}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground shadow-sm transition-all hover:brightness-105 md:text-sm"
            >
              <Ticket className="h-3.5 w-3.5" aria-hidden />
              {event.ctaPrimary.label}
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 transition-colors hover:bg-white/15"
          aria-label="Fechar anúncio"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default EventAnnouncementBanner
