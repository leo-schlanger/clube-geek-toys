import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Loading } from '../ui/loading'
import { type Member, type PointTransaction } from '../../types'
import { getRedemptionRules, formatPoints } from '../../lib/points'
import {
  Coins,
  Gift,
  Clock,
  TrendingUp,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

interface PointsSectionProps {
  member: Member
  pointsHistory: PointTransaction[]
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
      return 'text-green-500'
    case 'redeem':
      return 'text-blue-500'
    case 'expire':
      return 'text-red-500'
    default:
      return 'text-muted-foreground'
  }
}

export function PointsSection({ member, pointsHistory, loadingPoints }: PointsSectionProps) {
  const [showAllHistory, setShowAllHistory] = useState(false)

  const redemptionRules = useMemo(() => getRedemptionRules(), [])
  const displayedHistory = useMemo(
    () => showAllHistory ? pointsHistory : pointsHistory.slice(0, 5),
    [showAllHistory, pointsHistory]
  )

  return (
    <div className="space-y-6">
      {/* Redemption Rules — always visible, horizontal scroll on mobile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gift className="h-5 w-5 text-primary" />
            Opções de Resgate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1">
            {redemptionRules.map((rule, index) => {
              const isAvailable = (member.points || 0) >= rule.points
              return (
                <div
                  key={index}
                  className={`min-w-[160px] flex-1 p-4 rounded-lg border text-center snap-center ${
                    isAvailable
                      ? 'bg-card border-green-500/30'
                      : 'bg-muted/50 border-border opacity-60'
                  }`}
                >
                  <p className="text-lg font-bold">{rule.description}</p>
                  <p className="text-sm text-muted-foreground mt-1">{formatPoints(rule.points)} pontos</p>
                  {isAvailable && (
                    <Badge variant="success" className="mt-2">Disponível</Badge>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Para resgatar seus pontos, apresente sua carteirinha na loja
          </p>
        </CardContent>
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
              <Loading size="md" text="Carregando histórico..." />
            </div>
          ) : pointsHistory.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Coins className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Nenhuma movimentação de pontos ainda</p>
              <p className="text-sm">Faça compras na loja para acumular pontos!</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                {displayedHistory.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {getTransactionIcon(transaction.type)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{transaction.description}</p>
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
                    <span className={`font-bold shrink-0 ml-2 ${getTransactionColor(transaction.type)}`}>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
