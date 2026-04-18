import { useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { PLANS, type Member, type PlanType } from '../../types'
import { formatCPF, getStatusLabel } from '../../lib/utils'
import { toast } from 'sonner'
import {
  Star,
  Crown,
  Sparkles,
  CheckCircle,
  Clock,
  Share2,
  Copy,
  RotateCcw,
} from 'lucide-react'

const planIcons: Record<PlanType, React.ReactNode> = {
  silver: <Star className="h-4 w-4" />,
  gold: <Crown className="h-4 w-4" />,
  black: <Sparkles className="h-4 w-4" />,
}

const planGradients: Record<PlanType, string> = {
  silver: 'from-slate-700 to-slate-900',
  gold: 'from-yellow-600 to-amber-900',
  black: 'from-gray-800 to-black',
}

const statusBadge: Record<string, 'success' | 'warning' | 'destructive'> = {
  active: 'success',
  pending: 'warning',
  inactive: 'destructive',
  expired: 'destructive',
}

function maskCPF(cpf: string): string {
  const formatted = formatCPF(cpf)
  // ***.***.789-00
  return formatted.replace(/^\d{3}\.\d{3}/, '***. ***')
}

interface MembershipCardProps {
  member: Member
}

export function MembershipCard({ member }: MembershipCardProps) {
  const [flipped, setFlipped] = useState(false)
  const [copied, setCopied] = useState(false)
  const plan = PLANS[member.plan as PlanType]

  const qrData = JSON.stringify({
    id: member.id,
    cpf: member.cpf,
    plan: member.plan,
    status: member.status,
    expiry: member.expiryDate,
    v: 1,
  })

  const copyMemberId = useCallback(() => {
    navigator.clipboard.writeText(member.id)
    setCopied(true)
    toast.success('ID copiado!')
    setTimeout(() => setCopied(false), 2000)
  }, [member.id])

  const shareCard = useCallback(() => {
    if (navigator.share) {
      navigator.share({
        title: 'Minha Carteirinha Clube Geek & Toys',
        text: `Sou membro ${plan.name} do Clube Geek & Toys!`,
        url: window.location.href,
      }).catch(() => {})
    } else {
      copyMemberId()
    }
  }, [plan.name, copyMemberId])

  return (
    <div className="max-w-md mx-auto w-full">
      <div
        className="card-flip-container cursor-pointer"
        style={{ perspective: '1000px' }}
        onClick={() => setFlipped(!flipped)}
      >
        <div
          className="relative w-full transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            aspectRatio: '1.586 / 1',
          }}
        >
          {/* ═══ FRONT ═══ */}
          <div
            className={`absolute inset-0 rounded-2xl overflow-hidden bg-gradient-to-br ${planGradients[member.plan as PlanType]} shadow-xl card-glow`}
            style={{ backfaceVisibility: 'hidden' }}
          >
            {/* Shimmer overlay */}
            <div className="absolute inset-0 opacity-[0.07] pointer-events-none bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.5)_45%,transparent_50%)] bg-[length:200%_100%] animate-[shimmer_4s_linear_infinite]" />

            <div className="relative h-full p-5 sm:p-6 flex flex-col justify-between text-white">
              {/* Top row: logo + plan badge */}
              <div className="flex items-center justify-between">
                <img src="/logo-vip.png" alt="Geek & Toys VIP" className="h-7" />
                <Badge variant={member.plan as 'silver' | 'gold' | 'black'} className="gap-1">
                  {planIcons[member.plan as PlanType]}
                  {plan.name}
                </Badge>
              </div>

              {/* Center: member name */}
              <div>
                <h2 className="text-xl sm:text-2xl font-heading font-bold truncate">
                  {member.fullName}
                </h2>
                <p className="text-sm opacity-70 mt-0.5 font-mono tracking-wider">
                  {maskCPF(member.cpf)}
                </p>
              </div>

              {/* Bottom row: dates + status */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-50 mb-0.5">
                    Membro desde
                  </p>
                  <p className="text-xs opacity-80">
                    {new Date(member.startDate).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest opacity-50 mt-2 mb-0.5">
                    Válido até
                  </p>
                  <p className="text-sm font-semibold">
                    {new Date(member.expiryDate).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {member.status === 'active' ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-300" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-yellow-300" />
                  )}
                  <Badge variant={statusBadge[member.status]} className="text-[10px]">
                    {getStatusLabel(member.status)}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ BACK ═══ */}
          <div
            className={`absolute inset-0 rounded-2xl overflow-hidden bg-gradient-to-br ${planGradients[member.plan as PlanType]} shadow-xl`}
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="relative h-full p-5 sm:p-6 flex flex-col items-center justify-between text-white">
              {/* QR Code */}
              <div className="bg-white p-3 rounded-xl shadow-lg">
                <QRCodeSVG value={qrData} size={140} level="M" includeMargin={false} />
              </div>

              {/* Instruction */}
              <p className="text-xs text-center opacity-80">
                Apresente este código na loja para aplicar seus descontos
              </p>

              {/* Discount pills */}
              <div className="flex gap-2 w-full">
                <div className="flex-1 text-center py-1.5 rounded-full bg-green-500/20 border border-green-500/30">
                  <span className="text-sm font-bold text-green-300">{plan.discountProducts}%</span>
                  <span className="text-[10px] text-green-300/80 ml-1">produtos</span>
                </div>
                <div className="flex-1 text-center py-1.5 rounded-full bg-green-500/20 border border-green-500/30">
                  <span className="text-sm font-bold text-green-300">{plan.discountServices}%</span>
                  <span className="text-[10px] text-green-300/80 ml-1">serviços</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" onClick={copyMemberId} className="text-white hover:bg-white/10">
                  {copied ? <CheckCircle className="h-4 w-4 text-green-300" /> : <Copy className="h-4 w-4" />}
                  <span className="ml-1 text-xs">Copiar ID</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={shareCard} className="text-white hover:bg-white/10">
                  <Share2 className="h-4 w-4" />
                  <span className="ml-1 text-xs">Compartilhar</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Flip hint */}
      <button
        onClick={() => setFlipped(!flipped)}
        className="mt-3 w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <RotateCcw className="h-3 w-3" />
        {flipped ? 'Ver carteirinha' : 'Ver QR Code'}
      </button>
    </div>
  )
}
