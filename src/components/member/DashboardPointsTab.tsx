import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Loading } from '../ui/loading'
import { POINTS_MULTIPLIER, type Member, type PlanType, type PointTransaction } from '../../types'
import {
  getRedemptionRules,
  formatPoints,
} from '../../lib/points'
import {
  Coins,
  Gift,
  Clock,
  TrendingUp,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

interface DashboardPointsTabProps {
  member: Member
  pointsHistory: PointTransaction[]
  expiringPoints: PointTransaction[]
  loadingPoints: boolean
}

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

export function DashboardPointsTab({
  member,
  pointsHistory,
  expiringPoints,
  loadingPoints,
}: DashboardPointsTabProps) {
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [showRedemptionRules, setShowRedemptionRules] = useState(false)

  const multiplier = POINTS_MULTIPLIER[member.plan as PlanType]
  const expiringPointsTotal = useMemo(
    () => expiringPoints.reduce((sum, t) => sum + t.points, 0),
    [expiringPoints]
  )
  const redemptionRules = useMemo(() => getRedemptionRules(), [])
  const displayedHistory = useMemo(
    () => showAllHistory ? pointsHistory : pointsHistory.slice(0, 5),
    [showAllHistory, pointsHistory]
  )

  return (
    <div className="space-y-6">
      {/* Points Balance */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Card className="flex-1">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="h-5 w-5 text-primary" />
              <span className="font-semibold">Saldo Atual</span>
            </div>
            <p className="text-4xl font-bold text-primary mb-1">{formatPoints(member.points || 0)}</p>
            <p className="text-sm text-muted-foreground">
              Voce ganha {multiplier}x pontos por real gasto
            </p>
          </CardContent>
        </Card>

        {expiringPointsTotal > 0 && (
          <Card className="flex-1 border-yellow-500/30">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                <span className="font-semibold text-yellow-700 dark:text-yellow-400">Expirando em Breve</span>
              </div>
              <p className="text-4xl font-bold text-yellow-600">{formatPoints(expiringPointsTotal)}</p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Nos proximos 30 dias
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Redemption Rules */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gift className="h-5 w-5" />
              Opcoes de Resgate
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRedemptionRules(!showRedemptionRules)}
            >
              {showRedemptionRules ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        {showRedemptionRules && (
          <CardContent className="pt-0">
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
                      <Badge variant="success" className="mt-2">Disponivel</Badge>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Para resgatar seus pontos, apresente sua carteirinha na loja
            </p>
          </CardContent>
        )}
      </Card>

      {/* Points History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5" />
            Extrato de Pontos
          </CardTitle>
          <CardDescription>
            Acumule pontos a cada compra e troque por descontos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPoints ? (
            <div className="py-8">
              <Loading size="md" text="Carregando historico..." />
            </div>
          ) : pointsHistory.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Coins className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Nenhuma movimentacao de pontos ainda</p>
              <p className="text-sm">Faca compras na loja para acumular pontos!</p>
            </div>
          ) : (
            <div className="space-y-3">
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
                      Ver mais ({pointsHistory.length - 5} transacoes)
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
