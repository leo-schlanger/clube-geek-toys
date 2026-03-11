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
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import type { MonthlyReportData, PlanDistribution } from '../../lib/reports'
import { Users, Crown, Star, Sparkles } from 'lucide-react'

interface MembersChartProps {
  data: MonthlyReportData[]
  planDistribution?: PlanDistribution[]
  loading?: boolean
}

const PLAN_COLORS = {
  silver: '#94a3b8',
  gold: '#fbbf24',
  black: '#374151',
}

const PLAN_LABELS = {
  silver: 'Silver',
  gold: 'Gold',
  black: 'Black',
}

export function MembersChart({ data, planDistribution, loading }: MembersChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      netGrowth: d.newMembers - d.churnedMembers,
    }))
  }, [data])

  const totalNewMembers = useMemo(() => {
    return data.reduce((sum, d) => sum + d.newMembers, 0)
  }, [data])

  const pieData = useMemo(() => {
    if (!planDistribution) return []
    return planDistribution.map((p) => ({
      name: PLAN_LABELS[p.plan],
      value: p.count,
      color: PLAN_COLORS[p.plan],
      plan: p.plan,
    }))
  }, [planDistribution])

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
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Bar Chart - New Members */}
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

      {/* Pie Chart - Plan Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Distribuicao por Plano
          </CardTitle>
          <CardDescription>
            Membros ativos por tipo de plano
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            {pieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Nenhum dado disponivel
              </div>
            ) : (
              <div className="flex items-center">
                <ResponsiveContainer width="60%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="w-[40%] space-y-3">
                  {pieData.map((entry) => (
                    <div key={entry.plan} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          {entry.plan === 'silver' && <Star className="h-3 w-3" />}
                          {entry.plan === 'gold' && <Crown className="h-3 w-3" />}
                          {entry.plan === 'black' && <Sparkles className="h-3 w-3" />}
                          <span className="text-sm font-medium">{entry.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">{entry.value} membros</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
