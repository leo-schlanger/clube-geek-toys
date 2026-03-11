import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { formatCurrency } from '../../lib/utils'
import type { MonthlyReportData } from '../../lib/reports'
import { TrendingUp } from 'lucide-react'

interface RevenueChartProps {
  data: MonthlyReportData[]
  loading?: boolean
}

export function RevenueChart({ data, loading }: RevenueChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      revenueFormatted: formatCurrency(d.revenue),
    }))
  }, [data])

  const totalRevenue = useMemo(() => {
    return data.reduce((sum, d) => sum + d.revenue, 0)
  }, [data])

  const averageRevenue = useMemo(() => {
    return data.length > 0 ? totalRevenue / data.length : 0
  }, [totalRevenue, data.length])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Receita Mensal
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
              <TrendingUp className="h-5 w-5" />
              Receita Mensal
            </CardTitle>
            <CardDescription>
              Evolucao da receita nos ultimos {data.length} meses
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-green-500">{formatCurrency(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground">
              Media: {formatCurrency(averageRevenue)}/mes
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
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickFormatter={(value) => formatCurrency(value)}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), 'Receita']}
                  labelStyle={{ color: 'var(--foreground)' }}
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Receita"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: '#10b981', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
