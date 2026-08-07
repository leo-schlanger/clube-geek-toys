import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { formatCurrency } from '../../lib/utils'
import type { MonthlyReportData, PlanDistribution } from '../../lib/reports'
import { Users } from 'lucide-react'

interface MembersChartProps {
  data: MonthlyReportData[]
  planDistribution?: PlanDistribution[]
  loading?: boolean
}

export function MembersChart({ data, planDistribution, loading }: MembersChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      netGrowth: d.newMembers - d.churnedMembers,
    }))
  }, [data])

  const totalNewMembers = useMemo(
    () => data.reduce((sum, d) => sum + d.newMembers, 0),
    [data]
  )
  const totalChurned = useMemo(
    () => data.reduce((sum, d) => sum + d.churnedMembers, 0),
    [data]
  )

  const plan = planDistribution?.[0]
  const hasAnyMemberSignal = data.some((d) => d.newMembers > 0 || d.churnedMembers > 0)

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Evolução de Membros
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Novos Membros
              </CardTitle>
              <CardDescription>
                Cadastros e cancelamentos/expirações por mês
              </CardDescription>
            </div>
            <div className="flex gap-6 text-left sm:text-right">
              <div>
                <p className="text-sm text-muted-foreground">Novos (período)</p>
                <p className="text-2xl font-bold text-blue-500">{totalNewMembers}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Saídas (período)</p>
                <p className="text-2xl font-bold text-red-500">{totalChurned}</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            {data.length === 0 || !hasAnyMemberSignal ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-center px-4">
                {data.length === 0
                  ? 'Nenhum dado disponível'
                  : 'Ainda não há cadastros ou saídas neste período. Quando o clube começar a ser usado, os números aparecem aqui.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="newMembers" name="Novos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="churnedMembers" name="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plano do clube</CardTitle>
            <CardDescription>
              Modelo atual: um único plano anual (15% de desconto na loja)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Membros ativos</p>
                <p className="text-2xl font-bold">{plan.count}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Receita paga (total)</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(plan.revenue)}
                </p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Participação do plano</p>
                <p className="text-2xl font-bold">{plan.percentage}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
