import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import type { PointsOverview } from '../../lib/reports'
import { formatPoints } from '../../lib/points'
import { Coins, TrendingUp, TrendingDown, Gift } from 'lucide-react'

interface PointsChartProps {
  data: PointsOverview[]
  loading?: boolean
}

export function PointsChart({ data, loading }: PointsChartProps) {
  const totals = useMemo(() => {
    return {
      earned: data.reduce((sum, d) => sum + d.earned, 0),
      redeemed: data.reduce((sum, d) => sum + d.redeemed, 0),
      expired: data.reduce((sum, d) => sum + d.expired, 0),
      netChange: data.reduce((sum, d) => sum + d.netChange, 0),
    }
  }, [data])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Fluxo de Pontos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Carregando...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Fluxo de Pontos
            </CardTitle>
            <CardDescription>
              Pontos ganhos vs resgatados nos ultimos {data.length} meses
            </CardDescription>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
              <TrendingUp className="h-4 w-4" />
              Ganhos
            </div>
            <p className="text-xl font-bold text-green-600">{formatPoints(totals.earned)}</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center gap-1 text-blue-600 text-sm font-medium">
              <Gift className="h-4 w-4" />
              Resgatados
            </div>
            <p className="text-xl font-bold text-blue-600">{formatPoints(totals.redeemed)}</p>
          </div>
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="flex items-center gap-1 text-red-600 text-sm font-medium">
              <TrendingDown className="h-4 w-4" />
              Expirados
            </div>
            <p className="text-xl font-bold text-red-600">{formatPoints(totals.expired)}</p>
          </div>
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="flex items-center gap-1 text-purple-600 text-sm font-medium">
              <Coins className="h-4 w-4" />
              Variacao
            </div>
            <p className={`text-xl font-bold ${totals.netChange >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
              {totals.netChange >= 0 ? '+' : ''}{formatPoints(totals.netChange)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Nenhum dado disponivel
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickFormatter={(value) => formatPoints(value)}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      earned: 'Ganhos',
                      redeemed: 'Resgatados',
                      expired: 'Expirados',
                    }
                    return [formatPoints(Number(value)), labels[String(name)] || String(name)]
                  }}
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                />
                <Legend
                  formatter={(value) => {
                    const labels: Record<string, string> = {
                      earned: 'Ganhos',
                      redeemed: 'Resgatados',
                      expired: 'Expirados',
                    }
                    return labels[value] || value
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="earned"
                  stackId="1"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="redeemed"
                  stackId="2"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="expired"
                  stackId="3"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
