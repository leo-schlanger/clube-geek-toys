import { useState, useCallback, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { PLANS, type Member, type PlanType } from '../../types'
import { formatCPF, getStatusLabel } from '../../lib/utils'
import { toast } from 'sonner'
import {
  Star,
  Crown,
  Sparkles,
  Copy,
  Share2,
  CheckCircle,
  RotateCcw,
  Wifi,
} from 'lucide-react'

// ─── Plan Visuals ──────────────────────────────────────────────────────────────

const planIcons: Record<PlanType, React.ReactNode> = {
  silver: <Star className="h-3.5 w-3.5" />,
  gold: <Crown className="h-3.5 w-3.5" />,
  black: <Sparkles className="h-3.5 w-3.5" />,
}

/** Metallic gradients mimicking real card finishes */
const planStyles: Record<PlanType, {
  bg: string
  chip: string
  accent: string
  glow: string
  text: string
  mutedText: string
}> = {
  silver: {
    bg: 'linear-gradient(135deg, #5a6577 0%, #8695a8 15%, #6b7a8d 35%, #94a3b8 50%, #6b7a8d 65%, #8695a8 85%, #5a6577 100%)',
    chip: 'linear-gradient(135deg, #b8c4d0, #dde4ea, #a8b8c8)',
    accent: '#c0cfe0',
    glow: 'rgba(148, 163, 184, 0.3)',
    text: '#ffffff',
    mutedText: 'rgba(255,255,255,0.6)',
  },
  gold: {
    bg: 'linear-gradient(135deg, #8b6914 0%, #d4a520 15%, #b8860b 30%, #e8c54a 50%, #b8860b 70%, #d4a520 85%, #8b6914 100%)',
    chip: 'linear-gradient(135deg, #e8c54a, #fff1c1, #d4a520)',
    accent: '#f5d061',
    glow: 'rgba(212, 165, 32, 0.4)',
    text: '#1a1000',
    mutedText: 'rgba(26,16,0,0.55)',
  },
  black: {
    bg: 'linear-gradient(135deg, #0a0a0a 0%, #2a2a2a 15%, #111111 35%, #333333 50%, #111111 65%, #2a2a2a 85%, #0a0a0a 100%)',
    chip: 'linear-gradient(135deg, #d4a520, #f5e6a3, #d4a520)',
    accent: '#d4a520',
    glow: 'rgba(212, 165, 32, 0.25)',
    text: '#f0f0f0',
    mutedText: 'rgba(240,240,240,0.5)',
  },
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function maskCPF(cpf: string): string {
  const formatted = formatCPF(cpf)
  return formatted.replace(/^\d{3}\.\d{3}/, '***. ***')
}

function formatMemberNumber(id: string): string {
  // Show last 12 chars in groups of 4 like a card number
  const clean = id.replace(/-/g, '').slice(-12).toUpperCase()
  return `${clean.slice(0, 4)}  ${clean.slice(4, 8)}  ${clean.slice(8, 12)}`
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface MembershipCardProps {
  member: Member
}

export function MembershipCard({ member }: MembershipCardProps) {
  const [flipped, setFlipped] = useState(false)
  const [copied, setCopied] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const plan = PLANS[member.plan as PlanType]
  const style = planStyles[member.plan as PlanType]

  const qrData = JSON.stringify({
    id: member.id,
    cpf: member.cpf,
    plan: member.plan,
    status: member.status,
    expiry: member.expiryDate,
    v: 1,
  })

  const copyMemberId = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(member.id)
    setCopied(true)
    toast.success('ID copiado!')
    setTimeout(() => setCopied(false), 2000)
  }, [member.id])

  const shareCard = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (navigator.share) {
      navigator.share({
        title: 'Minha Carteirinha Clube Geek & Toys',
        text: `Sou membro ${plan.name} do Clube Geek & Toys!`,
        url: window.location.href,
      }).catch(() => {})
    } else {
      copyMemberId(e)
    }
  }, [plan.name, copyMemberId])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-md mx-auto w-full select-none">
      {/* 3D Flip Container */}
      <div
        ref={cardRef}
        className="cursor-pointer"
        style={{ perspective: '1200px' }}
        onClick={() => setFlipped(!flipped)}
      >
        <div
          className="relative w-full"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            aspectRatio: '1.586 / 1',
          }}
        >
          {/* ═══════════════════════ FRONT ═══════════════════════ */}
          <div
            className="absolute inset-0 rounded-2xl overflow-hidden"
            style={{
              backfaceVisibility: 'hidden',
              background: style.bg,
              boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 60px ${style.glow}`,
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
                background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.15) 42%, rgba(255,219,112,0.08) 48%, rgba(200,120,255,0.06) 52%, transparent 60%)',
                backgroundSize: '250% 100%',
                animation: 'shimmer 5s ease-in-out infinite',
              }}
            />

            {/* Card Content */}
            <div className="relative h-full p-5 sm:p-6 flex flex-col justify-between">

              {/* ── Top Row: Logo + Plan Badge ── */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src="/logo-vip.png"
                    alt="Clube Geek & Toys"
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
                    textShadow: member.plan === 'gold'
                      ? '0 1px 1px rgba(0,0,0,0.2)'
                      : '0 1px 2px rgba(0,0,0,0.4), 0 0 8px rgba(255,255,255,0.08)',
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
                      textShadow: member.plan === 'gold'
                        ? '0 1px 1px rgba(0,0,0,0.15)'
                        : '0 1px 2px rgba(0,0,0,0.3)',
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
                    {member.expiryDate
                      ? new Date(member.expiryDate).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' })
                      : '—'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════ BACK ═══════════════════════ */}
          <div
            className="absolute inset-0 rounded-2xl overflow-hidden"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: style.bg,
              boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 60px ${style.glow}`,
            }}
          >
            {/* Circuit board pattern */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `
                  repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(255,255,255,0.025) 23px, rgba(255,255,255,0.025) 24px),
                  repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(255,255,255,0.025) 23px, rgba(255,255,255,0.025) 24px)
                `,
              }}
            />

            {/* Magnetic stripe */}
            <div
              className="w-full h-9 mt-4"
              style={{ background: 'linear-gradient(180deg, #1a1a1a, #333, #1a1a1a)' }}
            />

            <div className="relative px-5 sm:px-6 py-3 flex flex-col items-center gap-2 flex-1">
              {/* QR Code */}
              <div
                className="p-2.5 rounded-xl shadow-lg"
                style={{
                  background: '#ffffff',
                  boxShadow: `0 4px 16px rgba(0,0,0,0.3), 0 0 20px ${style.glow}`,
                }}
              >
                <QRCodeSVG value={qrData} size={120} level="M" includeMargin={false} />
              </div>

              {/* Scan instruction */}
              <p className="text-[10px] text-center tracking-wide" style={{ color: style.mutedText }}>
                Apresente na loja para aplicar seus descontos
              </p>

              {/* Discount badges */}
              <div className="flex gap-2 w-full">
                <div
                  className="flex-1 text-center py-1.5 rounded-lg"
                  style={{
                    background: 'rgba(74, 222, 128, 0.1)',
                    border: '1px solid rgba(74, 222, 128, 0.25)',
                  }}
                >
                  <span className="text-sm font-bold text-green-400">{plan.discountProducts}%</span>
                  <span className="text-[9px] text-green-400/70 ml-1">produtos</span>
                </div>
                <div
                  className="flex-1 text-center py-1.5 rounded-lg"
                  style={{
                    background: 'rgba(74, 222, 128, 0.1)',
                    border: '1px solid rgba(74, 222, 128, 0.25)',
                  }}
                >
                  <span className="text-sm font-bold text-green-400">{plan.discountServices}%</span>
                  <span className="text-[9px] text-green-400/70 ml-1">serviços</span>
                </div>
              </div>

              {/* CPF + Status */}
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-mono tracking-wider" style={{ color: style.mutedText }}>
                  CPF: {maskCPF(member.cpf)}
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                  style={{ color: member.status === 'active' ? '#4ade80' : '#fbbf24' }}
                >
                  {member.status === 'active'
                    ? <><CheckCircle className="h-3 w-3" />{getStatusLabel(member.status)}</>
                    : getStatusLabel(member.status)
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Actions below card ── */}
      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={() => setFlipped(!flipped)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {flipped ? 'Ver carteirinha' : 'Ver QR Code'}
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={copyMemberId}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {copied ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            ID
          </button>
          <button
            onClick={shareCard}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Share2 className="h-3.5 w-3.5" />
            Compartilhar
          </button>
        </div>
      </div>
    </div>
  )
}
