import { useState } from 'react'
import { z } from 'zod'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Loading } from '../components/ui/loading'
import { QRScanner } from '../components/QRScanner'
import { PLANS, POINTS_MULTIPLIER, type Member, type PlanType, type RedemptionRule } from '../types'
import { formatCPF, getStatusLabel } from '../lib/utils'
import { getMemberByCPF, isMemberActive } from '../lib/members'
import {
  addPoints,
  redeemPoints,
  getRedemptionRules,
  getAvailableRedemptions,
  getExpiringPoints,
  formatPoints,
} from '../lib/points'
import { toast } from 'sonner'

// Schema de validação para QR Code do membro
const qrCodeSchema = z.object({
  cpf: z.string().min(11).max(14),
  id: z.string().optional(),
  plan: z.string().optional(),
  status: z.string().optional(),
  expiry: z.string().optional(),
  v: z.number().optional(),
})
import {
  Camera,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  RefreshCw,
  LogOut,
  Gift,
  Tag,
  Coins,
  Clock,
  Percent,
} from 'lucide-react'

interface VerificationResult {
  member: Member | null
  isValid: boolean
  message: string
}

export default function PDV() {
  const { user, signOut } = useAuth()
  const [mode, setMode] = useState<'scanner' | 'search'>('search')
  const [showScanner, setShowScanner] = useState(false)
  const [cpfSearch, setCpfSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [purchaseValue, setPurchaseValue] = useState('')
  const [isPromotion, setIsPromotion] = useState(false)
  const [addingPoints, setAddingPoints] = useState(false)
  const [showRedemption, setShowRedemption] = useState(false)
  const [redeemingPoints, setRedeemingPoints] = useState(false)
  const [expiringPointsCount, setExpiringPointsCount] = useState(0)

  /**
   * Handle adding points
   */
  async function handleAddPoints() {
    if (!result?.member || !purchaseValue) return

    const value = parseFloat(purchaseValue.replace(',', '.'))
    if (isNaN(value) || value <= 0) {
      toast.error('Valor de compra inválido')
      return
    }

    setAddingPoints(true)
    try {
      const response = await addPoints(result.member.id, value, isPromotion, user?.uid)

      if (response.success) {
        if (isPromotion) {
          toast.info(response.message)
        } else {
          toast.success(response.message)
          // Update local member data
          setResult({
            ...result,
            member: {
              ...result.member,
              points: (result.member.points || 0) + response.pointsAdded,
            },
          })
        }
        setPurchaseValue('')
        setIsPromotion(false)
      } else {
        toast.error(response.message)
      }
    } catch (error) {
      console.error('Error adding points:', error)
      toast.error('Erro ao adicionar pontos. Tente novamente.')
    } finally {
      setAddingPoints(false)
    }
  }

  /**
   * Handle redeeming points
   */
  async function handleRedeemPoints(rule: RedemptionRule) {
    if (!result?.member) return

    setRedeemingPoints(true)
    try {
      const response = await redeemPoints(result.member.id, rule, user?.uid)

      if (response.success) {
        toast.success(response.message)
        // Update local member data
        setResult({
          ...result,
          member: {
            ...result.member,
            points: (result.member.points || 0) - rule.points,
          },
        })
        setShowRedemption(false)
      } else {
        toast.error(response.message)
      }
    } catch (error) {
      console.error('Error redeeming points:', error)
      toast.error('Erro ao resgatar pontos. Tente novamente.')
    } finally {
      setRedeemingPoints(false)
    }
  }

  /**
   * Handle QR Code scan
   * Validates QR data with Zod schema before processing
   */
  async function handleQRScan(data: string) {
    setShowScanner(false)
    setLoading(true)
    setResult(null)

    try {
      // Parse e valida com Zod
      const parsed = JSON.parse(data)
      const qrData = qrCodeSchema.parse(parsed)

      await verifyMember(qrData.cpf)
    } catch (error) {
      // Diferencia erros de validação de outros erros
      if (error instanceof z.ZodError) {
        setResult({
          member: null,
          isValid: false,
          message: 'QR Code com formato inválido',
        })
      } else if (error instanceof SyntaxError) {
        setResult({
          member: null,
          isValid: false,
          message: 'QR Code não reconhecido',
        })
      } else {
        setResult({
          member: null,
          isValid: false,
          message: 'Erro ao processar QR Code',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  /**
   * Handle CPF search
   */
  async function handleCPFSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!cpfSearch.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const cleanCPF = cpfSearch.replace(/\D/g, '')
      await verifyMember(cleanCPF)
    } catch (error) {
      console.error('Error searching CPF:', error)
      setResult({
        member: null,
        isValid: false,
        message: 'Erro ao buscar membro',
      })
    } finally {
      setLoading(false)
    }
  }

  /**
   * Verify member by CPF
   * Optimized: non-blocking expiring points check
   */
  async function verifyMember(cpf: string) {
    try {
      const member = await getMemberByCPF(cpf)

      if (!member) {
        setResult({
          member: null,
          isValid: false,
          message: 'CPF não encontrado no sistema',
        })
        return
      }

      const isActive = isMemberActive(member)
      const isExpired = new Date(member.expiryDate) < new Date()

      // Set result immediately (fast path)
      setResult({
        member,
        isValid: isActive,
        message: isActive
          ? 'Membro ativo - pode aplicar desconto!'
          : isExpired
            ? 'Assinatura expirada - desconto não disponível'
            : 'Assinatura pendente - desconto não disponível',
      })

      // Check expiring points in background (non-blocking)
      if (isActive && member.points > 0) {
        getExpiringPoints(member.id).then((expiring) => {
          const expiringTotal = expiring.reduce((sum, t) => sum + t.points, 0)
          setExpiringPointsCount(expiringTotal)
        }).catch(() => {
          // Ignore errors for non-critical data
          setExpiringPointsCount(0)
        })
      } else {
        setExpiringPointsCount(0)
      }
    } catch (error) {
      console.error('Error verifying member:', error)
      setResult({
        member: null,
        isValid: false,
        message: 'Erro ao verificar membro',
      })
    }
  }

  /**
   * Reset verification
   */
  function resetVerification() {
    setResult(null)
    setCpfSearch('')
    setPurchaseValue('')
    setIsPromotion(false)
    setShowRedemption(false)
    setExpiringPointsCount(0)
  }

  const multiplier = result?.member ? POINTS_MULTIPLIER[result.member.plan as PlanType] : 1
  const previewPoints = purchaseValue && !isPromotion
    ? Math.floor(parseFloat(purchaseValue.replace(',', '.') || '0') * multiplier)
    : 0
  const availableRedemptions = result?.member
    ? getAvailableRedemptions(result.member.points || 0)
    : []

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="Geek & Toys" className="h-10 rounded" />
            <div>
              <h1 className="font-heading font-bold">PDV - Clube Geek & Toys</h1>
              <p className="text-xs text-muted-foreground">Verificação de membros</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={mode === 'search' ? 'default' : 'outline'}
            onClick={() => { setMode('search'); setShowScanner(false) }}
            className="flex-1"
          >
            <Search className="h-4 w-4 mr-2" />
            Buscar CPF
          </Button>
          <Button
            variant={mode === 'scanner' ? 'default' : 'outline'}
            onClick={() => { setMode('scanner'); setShowScanner(true) }}
            className="flex-1"
          >
            <Camera className="h-4 w-4 mr-2" />
            Scanner QR
          </Button>
        </div>

        {/* Search Mode */}
        {mode === 'search' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Buscar por CPF</CardTitle>
              <CardDescription>Digite o CPF do cliente para verificar a assinatura</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCPFSearch} className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Digite o CPF..."
                  value={cpfSearch}
                  onChange={(e) => setCpfSearch(e.target.value)}
                  className="flex-1"
                  disabled={loading}
                />
                <Button type="submit" disabled={loading || !cpfSearch.trim()}>
                  {loading ? <Loading size="sm" /> : <Search className="h-4 w-4" />}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Scanner Mode */}
        {mode === 'scanner' && showScanner && (
          <div className="mb-6">
            <QRScanner
              onScan={handleQRScan}
              onClose={() => { setShowScanner(false); setMode('search') }}
            />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <Card className="mb-6">
            <CardContent className="py-12">
              <Loading size="lg" text="Verificando..." />
            </CardContent>
          </Card>
        )}

        {/* Result */}
        {result && !loading && (
          <Card
            className={`mb-6 border-2 ${result.isValid
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
              : 'border-red-500 bg-red-50 dark:bg-red-900/20'
              }`}
          >
            <CardContent className="py-8">
              {/* Status Icon */}
              <div className="flex justify-center mb-6">
                {result.isValid ? (
                  <div className="p-4 rounded-full bg-green-500 text-white">
                    <CheckCircle className="h-16 w-16" />
                  </div>
                ) : (
                  <div className="p-4 rounded-full bg-red-500 text-white">
                    <XCircle className="h-16 w-16" />
                  </div>
                )}
              </div>

              {/* Message */}
              <p
                className={`text-center text-xl font-bold mb-6 ${result.isValid ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                  }`}
              >
                {result.message}
              </p>

              {/* Member Info */}
              {result.member && (
                <div className="bg-card rounded-lg p-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-primary/10">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">{result.member.fullName}</h3>
                      <p className="text-sm text-muted-foreground">{formatCPF(result.member.cpf)}</p>
                    </div>
                    <Badge
                      variant={
                        result.member.plan === 'silver'
                          ? 'silver'
                          : result.member.plan === 'gold'
                            ? 'gold'
                            : 'black'
                      }
                      className="ml-auto"
                    >
                      {PLANS[result.member.plan as PlanType].icon}{' '}
                      {PLANS[result.member.plan as PlanType].name}
                    </Badge>
                  </div>

                  <hr />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant={result.member.status === 'active' ? 'success' : 'destructive'}>
                        {getStatusLabel(result.member.status)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Validade</p>
                      <p className="font-medium">
                        {new Date(result.member.expiryDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  {result.isValid && (
                    <>
                      <hr />
                      {/* Discounts */}
                      <div className="grid grid-cols-2 gap-4 p-4 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <div className="text-center">
                          <p className="text-3xl font-bold text-green-600">
                            {PLANS[result.member.plan as PlanType].discountProducts}%
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            Desconto em Produtos
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-3xl font-bold text-green-600">
                            {PLANS[result.member.plan as PlanType].discountServices}%
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            Desconto em Serviços
                          </p>
                        </div>
                      </div>

                      <hr />

                      {/* Points Summary */}
                      <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
                        <div className="flex items-center gap-3">
                          <Coins className="h-6 w-6 text-primary" />
                          <div>
                            <p className="font-bold text-lg">{formatPoints(result.member.points || 0)} pontos</p>
                            <p className="text-xs text-muted-foreground">
                              Multiplicador {PLANS[result.member.plan as PlanType].name}: {multiplier}x
                            </p>
                          </div>
                        </div>
                        {availableRedemptions.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowRedemption(!showRedemption)}
                          >
                            <Gift className="h-4 w-4 mr-1" />
                            Resgatar
                          </Button>
                        )}
                      </div>

                      {/* Expiring Points Warning */}
                      {expiringPointsCount > 0 && (
                        <div className="flex items-center gap-2 p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg border border-yellow-500/30">
                          <Clock className="h-5 w-5 text-yellow-600" />
                          <p className="text-sm text-yellow-700 dark:text-yellow-300">
                            <strong>{formatPoints(expiringPointsCount)} pontos</strong> expiram nos próximos 30 dias
                          </p>
                        </div>
                      )}

                      {/* Redemption Panel */}
                      {showRedemption && availableRedemptions.length > 0 && (
                        <div className="space-y-3 p-4 bg-muted rounded-lg">
                          <h4 className="font-semibold flex items-center gap-2">
                            <Gift className="h-5 w-5 text-primary" />
                            Resgatar Pontos
                          </h4>
                          <div className="grid gap-2">
                            {getRedemptionRules().map((rule, index) => {
                              const isAvailable = (result.member?.points || 0) >= rule.points
                              return (
                                <div
                                  key={index}
                                  className={`flex items-center justify-between p-3 rounded-lg border ${
                                    isAvailable
                                      ? 'bg-card border-primary/30'
                                      : 'bg-muted/50 border-border opacity-50'
                                  }`}
                                >
                                  <div>
                                    <p className="font-medium">{rule.description}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {formatPoints(rule.points)} pontos
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    disabled={!isAvailable || redeemingPoints}
                                    onClick={() => handleRedeemPoints(rule)}
                                  >
                                    {redeemingPoints ? <Loading size="sm" /> : 'Resgatar'}
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      <hr />

                      {/* Add Points */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Coins className="h-5 w-5 text-primary" />
                          <h4 className="font-semibold">Adicionar Pontos de Fidelidade</h4>
                        </div>

                        {/* Promotion Checkbox */}
                        <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={isPromotion}
                            onChange={(e) => setIsPromotion(e.target.checked)}
                            className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
                          />
                          <div className="flex items-center gap-2">
                            <Tag className="h-5 w-5 text-orange-500" />
                            <div>
                              <p className="font-medium">Compra em Promoção</p>
                              <p className="text-xs text-muted-foreground">
                                Pontos não acumulam em compras promocionais
                              </p>
                            </div>
                          </div>
                        </label>

                        {/* Purchase Value Input */}
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                R$
                              </span>
                              <Input
                                type="text"
                                placeholder="0,00"
                                value={purchaseValue}
                                onChange={(e) => setPurchaseValue(e.target.value)}
                                disabled={addingPoints}
                                className="pl-10"
                              />
                            </div>
                            <Button
                              onClick={handleAddPoints}
                              disabled={addingPoints || !purchaseValue}
                              className="whitespace-nowrap"
                            >
                              {addingPoints ? <Loading size="sm" /> : 'Registrar'}
                            </Button>
                          </div>

                          {/* Points Preview */}
                          {purchaseValue && parseFloat(purchaseValue.replace(',', '.')) > 0 && (
                            <div className={`flex items-center justify-between text-sm p-3 rounded-lg border animate-in fade-in slide-in-from-top-1 ${
                              isPromotion
                                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                                : 'bg-primary/5 border-primary/20'
                            }`}>
                              {isPromotion ? (
                                <>
                                  <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                                    <Percent className="h-4 w-4" />
                                    <span>Compra em promoção</span>
                                  </div>
                                  <span className="font-bold text-orange-600 dark:text-orange-400">
                                    0 pontos
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-muted-foreground">
                                    Base: {Math.floor(parseFloat(purchaseValue.replace(',', '.')))} pts x {multiplier}
                                  </span>
                                  <span className="font-bold text-primary">
                                    +{formatPoints(previewPoints)} pontos
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {!result.isValid && (
                    <div className="flex items-center gap-2 p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        Cliente precisa renovar a assinatura para usar os descontos e acumular pontos
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Reset Button */}
              <div className="mt-6 text-center">
                <Button onClick={resetVerification} size="lg">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Nova Verificação
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
