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
  const totalShop = useMemo(() => data.reduce((sum, d) => sum + (d.shopRevenue || 0), 0), [data])
  const totalTickets = useMemo(() => data.reduce((sum, d) => sum + (d.ticketRevenue || 0), 0), [data])
  // The headline is everything that came in. It used to be the club alone,
  // the smallest of the three, with the shop as a footnote.
  const total = totalClub + totalShop + totalTickets
  const averageRevenue = total / (data.length || 1)

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
              Loja, ingressos e clube — só o que foi pago
              {data.length > 0 ? ` · últimos ${data.length} meses` : ''}
            </CardDescription>
          </div>
          <div className="text-left sm:text-right space-y-1">
            <div>
              <p className="text-sm text-muted-foreground">Total no período</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(total)}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Loja {formatCurrency(totalShop)} · Ingressos {formatCurrency(totalTickets)} · Clube{' '}
              {formatCurrency(totalClub)}
            </p>
            <p className="text-xs text-muted-foreground">Média: {formatCurrency(averageRevenue)}/mês</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {data.length === 0 || total === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-center px-4">
              Nenhum pagamento confirmado neste período ainda. Quando houver
              pedidos, ingressos ou assinaturas pagos, a receita aparece mês a mês aqui.
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
                  formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
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
                <Line
                  type="monotone"
                  dataKey="shopRevenue"
                  name="Loja"
                  stroke="#F04080"
                  strokeWidth={2}
                  dot={{ fill: '#F04080', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="ticketRevenue"
                  name="Ingressos"
                  stroke="#FCBE04"
                  strokeWidth={2}
                  dot={{ fill: '#FCBE04', strokeWidth: 2 }}
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
