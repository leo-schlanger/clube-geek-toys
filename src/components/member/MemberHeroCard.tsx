import { useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Card, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { PLANS, type Member, type PlanType } from '../../types'
import { formatCPF } from '../../lib/utils'
import { toast } from 'sonner'
import {
  Star,
  Crown,
  Sparkles,
  CheckCircle,
  Clock,
  Share2,
  Copy,
  Edit,
} from 'lucide-react'
import { getStatusLabel } from '../../lib/utils'

const planIcons: Record<PlanType, React.ReactNode> = {
  silver: <Star className="h-5 w-5" />,
  gold: <Crown className="h-5 w-5" />,
  black: <Sparkles className="h-5 w-5" />,
}

const planGradients: Record<PlanType, string> = {
  silver: 'from-slate-700 to-slate-900',
  gold: 'from-yellow-600 to-amber-900',
  black: 'from-gray-800 to-black',
}

const statusColors = {
  active: 'success',
  pending: 'warning',
  inactive: 'destructive',
  expired: 'destructive',
} as const

interface MemberHeroCardProps {
  member: Member
  onEditProfile: () => void
}

export function MemberHeroCard({ member, onEditProfile }: MemberHeroCardProps) {
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
    <Card className="overflow-hidden">
      {/* Gradient header with member info + QR side by side */}
      <div className={`p-5 sm:p-6 text-white bg-gradient-to-br ${planGradients[member.plan as PlanType]}`}>
        <div className="flex gap-4">
          {/* Left: member info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo-vip.png" alt="Geek & Toys VIP" className="h-7" />
              <Badge variant={member.plan as 'silver' | 'gold' | 'black'} className="gap-1">
                {planIcons[member.plan as PlanType]}
                {plan.name}
              </Badge>
            </div>

            <h2 className="text-lg sm:text-xl font-bold mb-1 truncate">{member.fullName}</h2>
            <p className="text-sm opacity-80 mb-3">{formatCPF(member.cpf)}</p>

            {/* Status */}
            <div className="flex items-center gap-2 mb-2">
              {member.status === 'active' ? (
                <CheckCircle className="h-4 w-4 text-green-300" />
              ) : (
                <Clock className="h-4 w-4 text-yellow-300" />
              )}
              <Badge variant={statusColors[member.status]} className="text-xs">
                {getStatusLabel(member.status)}
              </Badge>
            </div>

            <p className="text-xs opacity-70">
              Valido ate {new Date(member.expiryDate).toLocaleDateString('pt-BR')}
            </p>
          </div>

          {/* Right: QR code */}
          <div className="flex-shrink-0">
            <div className="bg-white p-2 rounded-lg shadow-lg">
              <QRCodeSVG value={qrData} size={100} level="H" includeMargin={false} />
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-4">
        {/* Discounts row */}
        <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg mb-4">
          <div className="text-center">
            <p className="text-xl font-bold text-green-500">{plan.discountProducts}%</p>
            <p className="text-xs text-muted-foreground">em produtos</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-green-500">{plan.discountServices}%</p>
            <p className="text-xs text-muted-foreground">em servicos</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyMemberId} title="Copiar ID">
            {copied ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={shareCard} title="Compartilhar">
            <Share2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onEditProfile} title="Editar Perfil">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
