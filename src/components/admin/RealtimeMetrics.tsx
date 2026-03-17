import { useRealtimeStats, type StatsTrend } from '../../hooks/useRealtimeStats'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Loading } from '../ui/loading'
import { formatCurrency } from '../../lib/utils'
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  Coins,
  Gift,
  Star,
  Crown,
  Sparkles,
  Activity,
  RefreshCw,
  Calendar,
  Zap,
} from 'lucide-react'

interface TrendIndicatorProps {
  trend: StatsTrend
  label?: string
}

function TrendIndicator({ trend, label }: TrendIndicatorProps) {
  if (trend.direction === 'stable') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        {label || 'Estável'}
      </span>
    )
  }

  const isUp = trend.direction === 'up'
  const Icon = isUp ? TrendingUp : TrendingDown
  const colorClass = isUp ? 'text-green-500' : 'text-red-500'

  return (
    <span className={`flex items-center gap-1 text-xs ${colorClass}`}>
      <Icon className="h-3 w-3" />
      {trend.percentage > 0 && `${trend.percentage}%`}
      {label && ` ${label}`}
    </span>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: StatsTrend
  trendLabel?: string
  colorClass?: string
  highlight?: boolean
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendLabel,
  colorClass = 'text-primary',
  highlight = false,
}: StatCardProps) {
  return (
    <Card className={`transition-all duration-300 hover:shadow-lg ${highlight ? 'ring-2 ring-primary/20' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && <TrendIndicator trend={trend} label={trendLabel} />}
          </div>
          <div className={`p-2 rounded-lg bg-muted ${colorClass}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface PlanCardProps {
  plan: 'silver' | 'gold' | 'black'
  count: number
  total: number
}

function PlanCard({ plan, count, total }: PlanCardProps) {
  const config = {
    silver: {
      label: 'Silver',
      icon: <Star className="h-4 w-4" />,
      color: 'from-slate-400 to-slate-600',
      textColor: 'text-slate-500',
    },
    gold: {
      label: 'Gold',
      icon: <Crown className="h-4 w-4" />,
      color: 'from-yellow-400 to-amber-600',
      textColor: 'text-yellow-600',
    },
    black: {
      label: 'Black',
      icon: <Sparkles className="h-4 w-4" />,
      color: 'from-gray-700 to-gray-900',
      textColor: 'text-gray-700 dark:text-gray-300',
    },
  }

  const { label, icon, color, textColor } = config[plan]
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      <div className={`p-2 rounded-full bg-gradient-to-br ${color} text-white`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`font-medium ${textColor}`}>{label}</span>
          <span className="text-lg font-bold">{count}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 mt-1">
          <div
            className={`h-1.5 rounded-full bg-gradient-to-r ${color}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-muted-foreground">{percentage}%</span>
    </div>
  )
}

export function RealtimeMetrics() {
  const { stats, trends, loading, error, lastUpdate } = useRealtimeStats()

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <Loading size="lg" text="Carregando métricas em tempo real..." />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6 text-center">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Métricas em Tempo Real
          </h2>
          <p className="text-sm text-muted-foreground">
            Atualização automática quando os dados mudam
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Zap className="h-3 w-3 text-green-500" />
            Live
          </Badge>
          {lastUpdate && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              {lastUpdate.toLocaleTimeString('pt-BR')}
            </span>
          )}
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total de Membros"
          value={stats.totalMembers}
          icon={<Users className="h-5 w-5" />}
          trend={trends.totalMembers}
          colorClass="text-blue-500"
        />
        <StatCard
          title="Membros Ativos"
          value={stats.activeMembers}
          subtitle={`${Math.round((stats.activeMembers / Math.max(stats.totalMembers, 1)) * 100)}% do total`}
          icon={<UserCheck className="h-5 w-5" />}
          trend={trends.activeMembers}
          colorClass="text-green-500"
        />
        <StatCard
          title="Receita Mensal"
          value={formatCurrency(stats.monthlyRevenue)}
          subtitle="Projeção baseada em ativos"
          icon={<DollarSign className="h-5 w-5" />}
          trend={trends.monthlyRevenue}
          colorClass="text-emerald-500"
        />
        <StatCard
          title="Receita Hoje"
          value={formatCurrency(stats.todayRevenue)}
          icon={<DollarSign className="h-5 w-5" />}
          trend={trends.todayRevenue}
          trendLabel="vs ontem"
          colorClass="text-emerald-500"
          highlight={stats.todayRevenue > 0}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Pendentes"
          value={stats.pendingMembers}
          icon={<Clock className="h-5 w-5" />}
          colorClass="text-yellow-500"
        />
        <StatCard
          title="Expirados"
          value={stats.expiredMembers}
          icon={<UserX className="h-5 w-5" />}
          colorClass="text-red-500"
        />
        <StatCard
          title="Novos Hoje"
          value={stats.newMembersToday}
          subtitle={`${stats.newMembersThisWeek} esta semana`}
          icon={<Calendar className="h-5 w-5" />}
          colorClass="text-purple-500"
          highlight={stats.newMembersToday > 0}
        />
        <StatCard
          title="Pontos Hoje"
          value={`+${stats.pointsEarnedToday}`}
          subtitle={`-${stats.pointsRedeemedToday} resgatados`}
          icon={<Coins className="h-5 w-5" />}
          colorClass="text-amber-500"
        />
      </div>

      {/* Plan Distribution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Distribuição por Plano
          </CardTitle>
          <CardDescription>
            {stats.totalMembers} membros em {Object.values(stats.membersByPlan).filter(v => v > 0).length} planos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <PlanCard plan="silver" count={stats.membersByPlan.silver} total={stats.totalMembers} />
          <PlanCard plan="gold" count={stats.membersByPlan.gold} total={stats.totalMembers} />
          <PlanCard plan="black" count={stats.membersByPlan.black} total={stats.totalMembers} />
        </CardContent>
      </Card>
    </div>
  )
}
