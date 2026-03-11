import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import type { ChurnData } from '../../lib/reports'
import { calculateGrowthRate } from '../../lib/reports'
import { AlertTriangle, TrendingDown, TrendingUp, Users } from 'lucide-react'

interface ChurnMetricsProps {
  data: ChurnData[]
  loading?: boolean
}

export function ChurnMetrics({ data, loading }: ChurnMetricsProps) {
  const metrics = useMemo(() => {
    if (data.length === 0) {
      return {
        currentRate: 0,
        previousRate: 0,
        trend: 0,
        totalChurned: 0,
        avgRate: 0,
      }
    }

    const currentRate = data[data.length - 1]?.churnRate || 0
    const previousRate = data[data.length - 2]?.churnRate || 0
    const trend = calculateGrowthRate(currentRate, previousRate)
    const totalChurned = data.reduce((sum, d) => sum + d.churned, 0)
    const avgRate = data.reduce((sum, d) => sum + d.churnRate, 0) / data.length

    return {
      currentRate,
      previousRate,
      trend,
      totalChurned,
      avgRate: Math.round(avgRate * 10) / 10,
    }
  }, [data])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Taxa de Churn
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center">
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
              <AlertTriangle className="h-5 w-5" />
              Taxa de Churn
            </CardTitle>
            <CardDescription>
              Porcentagem de cancelamentos por mes
            </CardDescription>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Taxa Atual</div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${metrics.currentRate > 5 ? 'text-red-500' : metrics.currentRate > 2 ? 'text-yellow-500' : 'text-green-500'}`}>
                {metrics.currentRate}%
              </span>
              {metrics.trend !== 0 && (
                <span className={`flex items-center text-xs ${metrics.trend > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {metrics.trend > 0 ? (
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-0.5" />
                  )}
                  {Math.abs(metrics.trend)}%
                </span>
              )}
            </div>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Media</div>
            <span className="text-2xl font-bold">{metrics.avgRate}%</span>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              Total Cancelados
            </div>
            <span className="text-2xl font-bold text-red-500">{metrics.totalChurned}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          {data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Nenhum dado disponivel
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'churnRate') return [`${value}%`, 'Taxa de Churn']
                    return [String(value), String(name)]
                  }}
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="churnRate"
                  name="churnRate"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ fill: '#ef4444', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Health indicator */}
        <div className="mt-4 p-3 rounded-lg border">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              metrics.avgRate < 2 ? 'bg-green-500' :
              metrics.avgRate < 5 ? 'bg-yellow-500' :
              'bg-red-500'
            }`} />
            <span className="text-sm font-medium">
              {metrics.avgRate < 2 ? 'Saude Excelente' :
               metrics.avgRate < 5 ? 'Atencao Necessaria' :
               'Churn Alto - Acoes Urgentes'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {metrics.avgRate < 2 ? 'A taxa de churn esta dentro do esperado. Continue monitorando.' :
             metrics.avgRate < 5 ? 'A taxa de churn esta moderada. Considere acoes de retencao.' :
             'A taxa de churn esta alta. Recomendado analisar causas e implementar estrategias de retencao.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
