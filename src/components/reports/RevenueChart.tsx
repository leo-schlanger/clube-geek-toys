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
      periodLabel: d.period,
    }))
  }, [data])

  const totalClub = useMemo(() => data.reduce((sum, d) => sum + d.revenue, 0), [data])
  const totalShop = useMemo(
    () => data.reduce((sum, d) => sum + (d.shopRevenue || 0), 0),
    [data]
  )
  const hasShop = totalShop > 0
  const monthsWithActivity = useMemo(
    () => data.filter((d) => d.revenue > 0 || (d.shopRevenue || 0) > 0 || d.paymentCount > 0).length,
    [data]
  )
  const averageRevenue = useMemo(() => {
    const base = monthsWithActivity || data.length || 1
    return totalClub / base
  }, [totalClub, monthsWithActivity, data.length])

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Receita Mensal
            </CardTitle>
            <CardDescription>
              Assinaturas do clube (pagamentos confirmados)
              {hasShop ? ' e loja online' : ''}
              {data.length > 0 ? ` · últimos ${data.length} meses` : ''}
            </CardDescription>
          </div>
          <div className="text-left sm:text-right space-y-1">
            <div>
              <p className="text-sm text-muted-foreground">Clube (total)</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalClub)}</p>
            </div>
            {hasShop && (
              <div>
                <p className="text-sm text-muted-foreground">Loja (total)</p>
                <p className="text-lg font-semibold text-primary">{formatCurrency(totalShop)}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Média clube: {formatCurrency(averageRevenue)}/mês
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {data.length === 0 || (totalClub === 0 && totalShop === 0) ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-center px-4">
              Nenhum pagamento confirmado neste período ainda. Quando houver
              assinaturas ou pedidos pagos, a receita aparece mês a mês aqui.
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
                  formatter={(value, name) => {
                    const label =
                      name === 'revenue'
                        ? 'Clube'
                        : name === 'shopRevenue'
                          ? 'Loja'
                          : String(name)
                    return [formatCurrency(Number(value)), label]
                  }}
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
                  name="Clube"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: '#10b981', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
                {hasShop && (
                  <Line
                    type="monotone"
                    dataKey="shopRevenue"
                    name="Loja"
                    stroke="#F04080"
                    strokeWidth={2}
                    dot={{ fill: '#F04080', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
