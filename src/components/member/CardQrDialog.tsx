import { useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { QRCodeSVG } from 'qrcode.react'
import { Sun, X } from 'lucide-react'
import { Button } from '../ui/button'
import { StatusChip } from './StatusChip'
import { getCardToken } from '../../lib/members'
import { getMemberVerifyUrl } from '../../lib/subdomain'
import { civilShortDate } from '../../lib/member-card-state'

/** Renew this long before the token expires, so a scan never lands on a stale one. */
const RENEW_MARGIN_MS = 60_000
const MIN_DELAY_MS = 20_000

interface CardQrDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId: string
  fullName: string
  displayNumber: string
  expiryDate: string
}

type WakeLockLike = { release: () => Promise<void> }

/**
 * Full-screen QR for the door. The QR carries a token that lives ~5 minutes:
 * the door can tell a live phone from a screenshot. White in both themes, the
 * scanner reads it better.
 */
export function CardQrDialog({ open, onOpenChange, memberId, fullName, displayNumber, expiryDate }: CardQrDialogProps) {
  const [token, setToken] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expiresAt = useRef(0)

  // Token: fetched on open, renewed before it expires and when the tab comes back
  useEffect(() => {
    if (!open) return
    let alive = true
    const schedule = (ms: number) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(refresh, ms)
    }
    async function refresh() {
      const fresh = await getCardToken().catch(() => null)
      if (!alive) return
      if (!fresh) {
        setOffline(true)
        schedule(MIN_DELAY_MS)
        return
      }
      setOffline(false)
      setToken(fresh.token)
      expiresAt.current = new Date(fresh.expiresAt).getTime()
      schedule(Math.max(MIN_DELAY_MS, expiresAt.current - Date.now() - RENEW_MARGIN_MS))
    }
    refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() > expiresAt.current - RENEW_MARGIN_MS) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      // Next open starts clean: never flash a token that may have expired
      setToken(null)
      expiresAt.current = 0
      document.removeEventListener('visibilitychange', onVisible)
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [open])

  // Keep the screen on while the QR is up (the web cannot raise brightness)
  useEffect(() => {
    if (!open) return
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockLike> } }
    if (!nav.wakeLock) return
    let lock: WakeLockLike | null = null
    let cancelled = false
    const acquire = () => {
      nav.wakeLock!.request('screen').then(
        (l) => {
          if (cancelled) l.release().catch(() => {})
          else lock = l
        },
        () => {}
      )
    }
    acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [open])

  const url = getMemberVerifyUrl(memberId, token)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white text-neutral-900 focus:outline-hidden"
          aria-describedby="card-qr-hint"
        >
          <div className="flex items-center justify-between px-4 pt-3">
            <DialogPrimitive.Title className="font-heading text-base font-bold">Carteirinha do clube</DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-neutral-100"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center px-4 pb-6 pt-4 text-center">
            <div className="rounded-2xl border-[3px] border-primary bg-white p-3" data-testid="card-qr" data-qr-url={url}>
              {token || offline ? (
                <QRCodeSVG value={url} size={280} level="M" includeMargin={false} />
              ) : (
                <div className="h-[280px] w-[280px] animate-pulse rounded-lg bg-neutral-100" aria-label="Gerando QR" />
              )}
            </div>

            <p className="mt-5 font-heading text-2xl font-extrabold">{fullName}</p>
            <StatusChip tone="success" className="mt-2 text-neutral-900">
              Em dia · válida até {civilShortDate(expiryDate)}
            </StatusChip>
            <p className="mt-2 font-mono text-base font-bold tracking-[0.2em]">{displayNumber}</p>

            <p id="card-qr-hint" className="mt-4 flex items-center gap-2 text-sm text-neutral-600">
              <Sun className="h-4 w-4 shrink-0" aria-hidden />
              Aumente o brilho da tela para o leitor da portaria.
            </p>
            {offline && (
              <p role="status" className="mt-3 rounded-lg border border-amber-600/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Sem conexão: o QR funciona, mas a portaria pode ver o aviso de QR antigo. Conecte-se para renovar.
              </p>
            )}

            <div className="mt-auto w-full pt-6">
              <DialogPrimitive.Close asChild>
                <Button variant="outline" className="h-12 w-full border-neutral-300 bg-white text-base text-neutral-900 hover:bg-neutral-100">
                  Fechar
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
