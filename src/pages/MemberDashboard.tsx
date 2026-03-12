import { useState, useEffect, useMemo, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { LoadingPage, Loading } from '../components/ui/loading'
import { RenewModal } from '../components/RenewModal'
import { UpgradeModal } from '../components/UpgradeModal'
import { ProfileEditModal } from '../components/ProfileEditModal'
import { PLANS, POINTS_MULTIPLIER, type Member, type PlanType, type PointTransaction } from '../types'
import { formatCurrency, formatCPF, calculateDaysUntilExpiry, getStatusLabel } from '../lib/utils'
import { getMemberByUserId } from '../lib/members'
import {
  getPointsHistory,
  getExpiringPoints,
  getRedemptionRules,
  formatPoints,
} from '../lib/points'
import { toast } from 'sonner'
import {
  CreditCard,
  Calendar,
  Gift,
  Star,
  Crown,
  Sparkles,
  LogOut,
  Settings,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowUp,
  Share2,
  User,
  Mail,
  Phone,
  Copy,
  Coins,
  TrendingUp,
  History,
  ChevronDown,
  ChevronUp,
  Edit,
} from 'lucide-react'

type ModalType = 'renew' | 'upgrade' | 'profile' | null

export default function MemberDashboard() {
  const { user, signOut } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalType>(null)
  const [copied, setCopied] = useState(false)
  const [pointsHistory, setPointsHistory] = useState<PointTransaction[]>([])
  const [expiringPoints, setExpiringPoints] = useState<PointTransaction[]>([])
  const [loadingPoints, setLoadingPoints] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [showRedemptionRules, setShowRedemptionRules] = useState(false)

  useEffect(() => {
    if (user) {
      fetchMemberData()
    }
  }, [user])

  async function fetchMemberData() {
    if (!user) return

    try {
      const memberData = await getMemberByUserId(user.uid)
      setMember(memberData)

      if (memberData) {
        setLoadingPoints(true)
        const [history, expiring] = await Promise.all([
          getPointsHistory(memberData.id, 20),
          getExpiringPoints(memberData.id),
        ])
        setPointsHistory(history)
        setExpiringPoints(expiring)
        setLoadingPoints(false)
      }
    } catch (error) {
      console.error('Error fetching member data:', error)
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleModalSuccess = useCallback(() => {
    setModal(null)
    fetchMemberData()
  }, [])

  const copyMemberId = useCallback(() => {
    if (member) {
      navigator.clipboard.writeText(member.id)
      setCopied(true)
      toast.success('ID copiado!')
      setTimeout(() => setCopied(false), 2000)
    }
  }, [member])

  const shareCard = useCallback(() => {
    if (navigator.share && member) {
      navigator.share({
        title: 'Minha Carteirinha Clube Geek & Toys',
        text: `Sou membro ${PLANS[member.plan as PlanType].name} do Clube Geek & Toys!`,
        url: window.location.href,
      }).catch(() => {
        // User cancelled or share not supported
      })
    } else {
      copyMemberId()
    }
  }, [member, copyMemberId])

  function getTransactionIcon(type: string) {
    switch (type) {
      case 'earn':
        return <TrendingUp className="h-4 w-4 text-green-500" />
      case 'redeem':
        return <Gift className="h-4 w-4 text-blue-500" />
      case 'expire':
        return <Clock className="h-4 w-4 text-red-500" />
      default:
        return <Coins className="h-4 w-4 text-muted-foreground" />
    }
  }

  function getTransactionColor(type: string) {
    switch (type) {
      case 'earn':
        return 'text-green-600'
      case 'redeem':
        return 'text-blue-600'
      case 'expire':
        return 'text-red-600'
      default:
        return 'text-muted-foreground'
    }
  }

  if (loading) {
    return <LoadingPage />
  }

  if (!member) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <img src="/logo.jpg" alt="Geek & Toys" className="h-14 rounded mx-auto" />
            </div>
            <div className="mx-auto mb-4 p-4 bg-warning/20 rounded-full w-fit">
              <AlertTriangle className="h-12 w-12 text-warning" />
            </div>
            <CardTitle className="font-heading">Nenhuma assinatura encontrada</CardTitle>
            <CardDescription>
              Você ainda não possui uma assinatura ativa. Assine agora e comece a aproveitar os benefícios!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => window.location.href = '/assinar'} size="lg" className="w-full">
              Assinar agora
            </Button>
            <Button variant="outline" onClick={signOut} className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const plan = PLANS[member.plan as PlanType]
  const multiplier = POINTS_MULTIPLIER[member.plan as PlanType]
  const daysUntilExpiry = calculateDaysUntilExpiry(new Date(member.expiryDate))
  const isExpiringSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0
  const isExpired = daysUntilExpiry <= 0

  // Memoized computed values to avoid recalculation on every render
  const expiringPointsTotal = useMemo(
    () => expiringPoints.reduce((sum, t) => sum + t.points, 0),
    [expiringPoints]
  )
  const redemptionRules = useMemo(() => getRedemptionRules(), [])
  const displayedHistory = useMemo(
    () => showAllHistory ? pointsHistory : pointsHistory.slice(0, 5),
    [showAllHistory, pointsHistory]
  )

  // QR Code data
  const qrData = JSON.stringify({
    id: member.id,
    cpf: member.cpf,
    plan: member.plan,
    status: member.status,
    expiry: member.expiryDate,
    v: 1,
  })

  const planIcons = {
    silver: <Star className="h-5 w-5" />,
    gold: <Crown className="h-5 w-5" />,
    black: <Sparkles className="h-5 w-5" />,
  }

  const planColors = {
    silver: 'from-slate-400 to-slate-600',
    gold: 'from-yellow-400 to-amber-600',
    black: 'from-gray-700 to-gray-900',
  }

  const statusColors = {
    active: 'success',
    pending: 'warning',
    inactive: 'destructive',
    expired: 'destructive',
  } as const

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b border-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="Geek & Toys" className="h-10 rounded" />
            <span className="text-lg font-heading font-bold text-foreground">Clube Geek & Toys</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setModal('profile')} title="Editar Perfil">
              <Settings className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Status Alert */}
        {(isExpired || isExpiringSoon) && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              isExpired
                ? 'bg-red-500/20 border border-red-500/50 text-red-200'
                : 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-200'
            }`}
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              {isExpired ? (
                <>
                  <strong>Sua assinatura expirou!</strong>
                  <p className="text-sm opacity-80">
                    Renove agora para continuar aproveitando os benefícios.
                  </p>
                </>
              ) : (
                <>
                  <strong>Sua assinatura expira em {daysUntilExpiry} dias</strong>
                  <p className="text-sm opacity-80">
                    Renove agora e não perca seus benefícios.
                  </p>
                </>
              )}
            </div>
            <Button variant="warning" size="sm" onClick={() => setModal('renew')}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Renovar
            </Button>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Digital Card */}
          <div className="lg:col-span-1">
            <Card className="overflow-hidden">
              {/* Card header */}
              <div className={`p-6 text-white bg-gradient-to-br ${planColors[member.plan as PlanType]}`}>
                <div className="flex items-center justify-between mb-4">
                  <img src="/logo.jpg" alt="Geek & Toys" className="h-8 rounded" />
                  <Badge variant={member.plan as 'silver' | 'gold' | 'black'} className="gap-1">
                    {planIcons[member.plan as PlanType]}
                    {plan.name}
                  </Badge>
                </div>
                <h2 className="text-xl font-bold mb-1">{member.fullName}</h2>
                <p className="text-sm opacity-80">{formatCPF(member.cpf)}</p>
              </div>

              <CardContent className="p-6">
                {/* QR Code */}
                <div className="flex justify-center mb-6">
                  <div className="bg-white p-4 rounded-xl shadow-lg">
                    <QRCodeSVG value={qrData} size={180} level="H" includeMargin />
                  </div>
                </div>

                {/* Status */}
                <div className="text-center mb-4">
                  <div className="flex items-center justify-center gap-2">
                    {member.status === 'active' ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <Clock className="h-5 w-5 text-yellow-500" />
                    )}
                    <Badge variant={statusColors[member.status]}>
                      {getStatusLabel(member.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Válido até {new Date(member.expiryDate).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                {/* Discounts */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-500">{plan.discountProducts}%</p>
                    <p className="text-xs text-muted-foreground">em produtos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-500">{plan.discountServices}%</p>
                    <p className="text-xs text-muted-foreground">em serviços</p>
                  </div>
                </div>

                {/* Card actions */}
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" className="flex-1" onClick={shareCard}>
                    <Share2 className="h-4 w-4 mr-1" />
                    Compartilhar
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={copyMemberId}>
                    {copied ? (
                      <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4 mr-1" />
                    )}
                    {copied ? 'Copiado!' : 'Copiar ID'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Info Cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Stats */}
            <div className="grid sm:grid-cols-3 gap-4">
              <Card className="hover:shadow-lg transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Coins className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{formatPoints(member.points || 0)}</p>
                    <p className="text-sm text-muted-foreground">Pontos ({multiplier}x)</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 rounded-full bg-green-500/10">
                    <CreditCard className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(
                        member.paymentType === 'monthly' ? plan.priceMonthly : plan.priceAnnual
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {member.paymentType === 'monthly' ? '/mês' : '/ano'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 rounded-full bg-yellow-500/10">
                    <Calendar className="h-6 w-6 text-yellow-500" />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${daysUntilExpiry <= 0 ? 'text-red-500' : daysUntilExpiry <= 7 ? 'text-yellow-500' : ''}`}>
                      {daysUntilExpiry > 0 ? daysUntilExpiry : 0}
                    </p>
                    <p className="text-sm text-muted-foreground">dias restantes</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Points Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5" />
                    Programa de Pontos
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRedemptionRules(!showRedemptionRules)}
                  >
                    <Gift className="h-4 w-4 mr-1" />
                    Resgates
                    {showRedemptionRules ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
                  </Button>
                </div>
                <CardDescription>
                  Acumule pontos a cada compra e troque por descontos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Points Info */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Coins className="h-5 w-5 text-primary" />
                      <span className="font-semibold">Saldo Atual</span>
                    </div>
                    <p className="text-3xl font-bold text-primary">{formatPoints(member.points || 0)}</p>
                    <p className="text-sm text-muted-foreground">
                      Você ganha {multiplier}x pontos por real gasto
                    </p>
                  </div>

                  {expiringPointsTotal > 0 && (
                    <div className="flex-1 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-5 w-5 text-yellow-600" />
                        <span className="font-semibold text-yellow-700 dark:text-yellow-400">Expirando em Breve</span>
                      </div>
                      <p className="text-3xl font-bold text-yellow-600">{formatPoints(expiringPointsTotal)}</p>
                      <p className="text-sm text-yellow-600 dark:text-yellow-400">
                        Nos próximos 30 dias
                      </p>
                    </div>
                  )}
                </div>

                {/* Redemption Rules */}
                {showRedemptionRules && (
                  <div className="p-4 bg-muted rounded-lg space-y-3 animate-in fade-in slide-in-from-top-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Gift className="h-4 w-4" />
                      Opções de Resgate
                    </h4>
                    <div className="grid sm:grid-cols-3 gap-3">
                      {redemptionRules.map((rule, index) => {
                        const isAvailable = (member.points || 0) >= rule.points
                        return (
                          <div
                            key={index}
                            className={`p-3 rounded-lg border text-center ${
                              isAvailable
                                ? 'bg-card border-green-200 dark:border-green-800'
                                : 'bg-muted/50 border-border opacity-60'
                            }`}
                          >
                            <p className="text-lg font-bold">{rule.description}</p>
                            <p className="text-sm text-muted-foreground">{formatPoints(rule.points)} pontos</p>
                            {isAvailable && (
                              <Badge variant="success" className="mt-2">Disponível</Badge>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Para resgatar seus pontos, apresente sua carteirinha na loja
                    </p>
                  </div>
                )}

                {/* Points History */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Extrato de Pontos
                    </h4>
                  </div>

                  {loadingPoints ? (
                    <div className="py-8">
                      <Loading size="md" text="Carregando histórico..." />
                    </div>
                  ) : pointsHistory.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      <Coins className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p>Nenhuma movimentação de pontos ainda</p>
                      <p className="text-sm">Faça compras na loja para acumular pontos!</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {displayedHistory.map((transaction) => (
                          <div
                            key={transaction.id}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              {getTransactionIcon(transaction.type)}
                              <div>
                                <p className="text-sm font-medium">{transaction.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(transaction.createdAt).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                  {transaction.expiresAt && transaction.type === 'earn' && (
                                    <> · Expira em {new Date(transaction.expiresAt).toLocaleDateString('pt-BR')}</>
                                  )}
                                </p>
                              </div>
                            </div>
                            <span className={`font-bold ${getTransactionColor(transaction.type)}`}>
                              {transaction.points > 0 ? '+' : ''}{formatPoints(transaction.points)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {pointsHistory.length > 5 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => setShowAllHistory(!showAllHistory)}
                        >
                          {showAllHistory ? (
                            <>
                              <ChevronUp className="h-4 w-4 mr-1" />
                              Ver menos
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4 mr-1" />
                              Ver mais ({pointsHistory.length - 5} transações)
                            </>
                          )}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Personal data */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Meus Dados
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setModal('profile')}>
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Telefone</p>
                      <p className="font-medium">{member.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Membro desde</p>
                      <p className="font-medium">
                        {new Date(member.startDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Tipo de cobrança</p>
                      <p className="font-medium">
                        {member.paymentType === 'monthly' ? 'Mensal' : 'Anual'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Benefits */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5" />
                  Seus Benefícios
                </CardTitle>
                <CardDescription>
                  Plano {plan.name} - Aproveite todas as vantagens
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid sm:grid-cols-2 gap-3">
                  {plan.benefits.map((benefit, index) => (
                    <li key={index} className="flex items-start gap-2 p-3 bg-muted rounded-lg">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Button variant="outline" size="lg" className="w-full" onClick={() => setModal('renew')}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Renovar Assinatura
              </Button>
              <Button variant="outline" size="lg" className="w-full" onClick={() => setModal('upgrade')}>
                <ArrowUp className="h-4 w-4 mr-2" />
                Fazer Upgrade
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {modal === 'renew' && (
        <RenewModal member={member} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />
      )}

      {modal === 'upgrade' && (
        <UpgradeModal member={member} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />
      )}

      {modal === 'profile' && (
        <ProfileEditModal member={member} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />
      )}
    </div>
  )
}
