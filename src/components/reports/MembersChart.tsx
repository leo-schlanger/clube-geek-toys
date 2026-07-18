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
import type { MonthlyReportData, PlanDistribution } from '../../lib/reports'
import { Users } from 'lucide-react'

interface MembersChartProps {
  data: MonthlyReportData[]
  planDistribution?: PlanDistribution[]
  loading?: boolean
}

export function MembersChart({ data, loading }: MembersChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      netGrowth: d.newMembers - d.churnedMembers,
    }))
  }, [data])

  const totalNewMembers = useMemo(() => {
    return data.reduce((sum, d) => sum + d.newMembers, 0)
  }, [data])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Evolucao de Membros
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
              <Users className="h-5 w-5" />
              Novos Membros
            </CardTitle>
            <CardDescription>
              Novos cadastros por mes
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-blue-500">{totalNewMembers}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          {data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Nenhum dado disponivel
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
                <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="newMembers" name="Novos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="churnedMembers" name="Cancelados" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
