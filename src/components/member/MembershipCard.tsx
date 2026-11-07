import { useState, useCallback, forwardRef, type ReactNode } from 'react'
import { PLANS, type Member, type PlanType } from '../../types'
import { civilShortDate, formatMemberNumber } from '../../lib/member-card-state'
import { cn } from '../../lib/utils'
import { toast } from 'sonner'
import { NonoMascot } from '../store/NonoMascot'
import {
  Sparkles,
  Copy,
  Share2,
  CheckCircle,
  Wifi,
  QrCode,
} from 'lucide-react'
import { Button } from '../ui/button'

// ─── Plan Visuals ──────────────────────────────────────────────────────────────

const planIcons: Record<PlanType, React.ReactNode> = {
  club: <Sparkles className="h-3.5 w-3.5" />,
}

/** Geek gradient finish for the single club card */
const planStyles: Record<PlanType, {
  bg: string
  chip: string
  accent: string
  glow: string
  text: string
  mutedText: string
}> = {
  club: {
    // Hot Pink → Pop Yellow metallic (brand GeekPop & Toys)
    bg: 'linear-gradient(135deg, #1a0610 0%, #4a1028 18%, #F04080 45%, #FCBE04 55%, #F04080 70%, #3a0d20 88%, #1a0610 100%)',
    chip: 'linear-gradient(135deg, #FCBE04, #FFE566, #F04080)',
    accent: '#FCBE04',
    glow: 'rgba(240, 64, 128, 0.4)',
    text: '#fff7fb',
    mutedText: 'rgba(255,247,251,0.6)',
  },
}

// ─── Helpers ───────────────────────────────────────────────────────────────────


// ─── Component ─────────────────────────────────────────────────────────────────

interface MembershipCardProps {
  member: Member
  /** Tiny Nono on the front; off when another Nono is on the screen. */
  showMascot?: boolean
  /** Expired membership: grey card, QR paused until renewal. */
  paused?: boolean
  /** Opens the full-screen QR (CardQrDialog). Without it the button is hidden. */
  onShowQr?: () => void
  /** Rendered between the card and its buttons (status chip, validity). */
  below?: ReactNode
}

export const MembershipCard = forwardRef<HTMLButtonElement, MembershipCardProps>(function MembershipCard(
  { member, showMascot = true, paused = false, onShowQr, below },
  qrButtonRef
) {
  const [copied, setCopied] = useState(false)
  const plan = PLANS[member.plan as PlanType]
  const style = planStyles[member.plan as PlanType]

  const copyMemberId = useCallback(() => {
    navigator.clipboard.writeText(member.id)
    setCopied(true)
    toast.success('ID copiado!')
    setTimeout(() => setCopied(false), 2000)
  }, [member.id])

  const shareCard = useCallback(() => {
    if (navigator.share) {
      navigator.share({
        title: 'Minha Carteirinha Clube GeekPop & Toys',
        text: `Sou membro ${plan.name} do Clube GeekPop & Toys!`,
        url: window.location.href,
      }).catch(() => {})
    } else {
      copyMemberId()
    }
  }, [plan.name, copyMemberId])

  return (
    <div className="max-w-md mx-auto w-full select-none">
      <div
        data-testid="card-face"
        className={cn('relative w-full rounded-2xl overflow-hidden transition-[filter]', paused && 'grayscale opacity-80')}
        style={{
          aspectRatio: '1.586 / 1',
          background: style.bg,
          boxShadow: paused ? '0 8px 24px rgba(0,0,0,0.25)' : `0 8px 32px rgba(0,0,0,0.4), 0 0 60px ${style.glow}`,
        }}
      >
        {/* Circuit board pattern (geek texture) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(255,255,255,0.025) 23px, rgba(255,255,255,0.025) 24px),
              repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(255,255,255,0.025) 23px, rgba(255,255,255,0.025) 24px)
            `,
          }}
        />

        {/* Holographic shimmer overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.15) 42%, rgba(255,219,112,0.10) 48%, rgba(240,64,128,0.08) 52%, transparent 60%)',
            backgroundSize: '250% 100%',
            animation: 'shimmer 5s ease-in-out infinite',
          }}
        />

        {/* Nono right of the member number, clear of the badge, the name and the expiry */}
        {showMascot && (
          <NonoMascot
            pose="glasses"
            size={44}
            decorative
            className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 drop-shadow-md sm:right-6"
          />
        )}

        {/* Card Content */}
        <div className="relative h-full p-5 sm:p-6 flex flex-col justify-between">

          {/* ── Top Row: Logo + Plan Badge ── */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <img
                src="/logo-vip.png"
                alt="Clube GeekPop & Toys"
                className="h-7 sm:h-8 drop-shadow-lg"
              />
            </div>
            <div className="flex items-center gap-2">
              {/* Contactless icon */}
              <Wifi
                className="h-5 w-5 rotate-90"
                style={{ color: style.mutedText }}
              />
              {/* Plan tier badge */}
              <div
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                style={{
                  background: 'rgba(0,0,0,0.25)',
                  backdropFilter: 'blur(8px)',
                  color: style.accent,
                  border: `1px solid ${style.accent}40`,
                }}
              >
                {planIcons[member.plan as PlanType]}
                {plan.name}
              </div>
            </div>
          </div>

          {/* ── Chip ── */}
          <div className="mt-1">
            <div
              className="w-11 h-8 rounded-md relative overflow-hidden"
              style={{
                background: style.chip,
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4), 0 1px 3px rgba(0,0,0,0.3)',
              }}
            >
              {/* Chip lines */}
              <div className="absolute inset-0" style={{
                backgroundImage: `
                  linear-gradient(0deg, transparent 35%, rgba(0,0,0,0.08) 35%, rgba(0,0,0,0.08) 65%, transparent 65%),
                  linear-gradient(90deg, transparent 25%, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.06) 75%, transparent 75%)
                `,
              }} />
            </div>
          </div>

          {/* ── Member Number (card-style) ── */}
          <div className="mt-1">
            <p
              className="text-base sm:text-lg font-mono tracking-[0.18em] font-semibold"
              style={{
                color: style.text,
                textShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 8px rgba(255,255,255,0.08)',
              }}
            >
              {formatMemberNumber(member.id)}
            </p>
          </div>

          {/* ── Bottom: Name + Dates ── */}
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p
                className="text-[9px] uppercase tracking-[0.2em] mb-0.5"
                style={{ color: style.mutedText }}
              >
                Nome do Membro
              </p>
              <p
                className="text-sm sm:text-base font-bold truncate uppercase tracking-wide"
                style={{
                  color: style.text,
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}
              >
                {member.fullName}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p
                className="text-[9px] uppercase tracking-[0.2em] mb-0.5"
                style={{ color: style.mutedText }}
              >
                Válido até
              </p>
              <p
                className="text-sm font-bold tabular-nums"
                style={{ color: style.text }}
              >
                {member.expiryDate ? civilShortDate(member.expiryDate) : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {below && <div className="mt-3">{below}</div>}

      {/* ── Actions below card ── */}
      <div className="mt-4 space-y-2">
        {onShowQr &&
          (paused ? (
            <Button type="button" variant="outline" disabled className="h-14 w-full text-base">
              <QrCode className="h-5 w-5" />
              QR pausado até renovar
            </Button>
          ) : (
            <Button
              ref={qrButtonRef}
              type="button"
              onClick={onShowQr}
              className="h-14 w-full text-[19px] font-bold"
            >
              <QrCode className="h-5 w-5" />
              Mostrar QR na portaria
            </Button>
          ))}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="ghost" onClick={copyMemberId} className="h-11 text-sm">
            {copied ? <CheckCircle className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            Copiar ID
          </Button>
          <Button type="button" variant="ghost" onClick={shareCard} className="h-11 text-sm">
            <Share2 className="h-4 w-4" />
            Compartilhar
          </Button>
        </div>
      </div>
    </div>
  )
})
