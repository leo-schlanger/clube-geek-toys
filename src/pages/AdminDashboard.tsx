import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { orderBy } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { LoadingPage, LoadingSpinner } from '../components/ui/loading'
import { MemberModal } from '../components/MemberModal'
import { UserModal } from '../components/UserModal'
import { PLANS, type Member, type PlanType, type DashboardStats } from '../types'
import { formatCurrency } from '../lib/utils'
import { getAllMembers, updateMember } from '../lib/members'
import { getRecentLogs, type AuditLog } from '../lib/logs'
import {
  getMonthlyReport,
  getRevenueByPlan,
  getChurnRate,
  getPointsOverview,
  type MonthlyReportData,
  type PlanDistribution,
  type ChurnData,
  type PointsOverview,
} from '../lib/reports'
import { FirestoreManager } from '../lib/db-utils'
import { toast } from 'sonner'
import {
  Users,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  LogOut,
  Settings,
  Crown,
  Star,
  Sparkles,
  RefreshCw,
  FileText,
  UserCog,
  BarChart3,
} from 'lucide-react'

// Lazy load tab components for code splitting
const MembersTab = lazy(() => import('../components/admin/MembersTab').then(m => ({ default: m.MembersTab })))
const UsersTab = lazy(() => import('../components/admin/UsersTab').then(m => ({ default: m.UsersTab })))
const LogsTab = lazy(() => import('../components/admin/LogsTab').then(m => ({ default: m.LogsTab })))
const ReportsTab = lazy(() => import('../components/admin/ReportsTab').then(m => ({ default: m.ReportsTab })))
const PointsTab = lazy(() => import('../components/admin/PointsTab').then(m => ({ default: m.PointsTab })))

type ModalMode = 'create' | 'edit' | 'view' | 'role' | null
type DashboardTab = 'members' | 'logs' | 'users' | 'points' | 'reports'

function TabLoadingFallback() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </CardContent>
    </Card>
  )
}

export default function AdminDashboard() {
  const { signOut } = useAuth()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<DashboardTab>('members')
  const [stats, setStats] = useState<DashboardStats>({
    totalMembers: 0,
    activeMembers: 0,
    pendingPayments: 0,
    monthlyRevenue: 0,
    membersByPlan: { silver: 0, gold: 0, black: 0 },
  })
  const [members, setMembers] = useState<Member[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [systemUsers, setSystemUsers] = useState<{ id: string; email: string; role: string; createdAt?: string }[]>([])

  // Report states
  const [reportPeriod, setReportPeriod] = useState(6)
  const [monthlyReportData, setMonthlyReportData] = useState<MonthlyReportData[]>([])
  const [planDistribution, setPlanDistribution] = useState<PlanDistribution[]>([])
  const [churnData, setChurnData] = useState<ChurnData[]>([])
  const [pointsOverviewData, setPointsOverviewData] = useState<PointsOverview[]>([])
  const [loadingReports, setLoadingReports] = useState(false)

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [showUserModal, setShowUserModal] = useState(false)

  // Log filter state
  const [logDateFrom, setLogDateFrom] = useState('')
  const [logDateTo, setLogDateTo] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  // Fetch reports when tab changes to reports or period changes
  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReports()
    }
  }, [activeTab, reportPeriod])

  const fetchReports = useCallback(async () => {
    setLoadingReports(true)
    try {
      const [monthly, plans, churn, points] = await Promise.all([
        getMonthlyReport(reportPeriod),
        getRevenueByPlan(),
        getChurnRate(reportPeriod),
        getPointsOverview(Math.min(reportPeriod, 6)),
      ])

      setMonthlyReportData(monthly)
      setPlanDistribution(plans)
      setChurnData(churn)
      setPointsOverviewData(points)
    } catch (error) {
      console.error('Error fetching reports:', error)
      toast.error('Erro ao carregar relatórios')
    } finally {
      setLoadingReports(false)
    }
  }, [reportPeriod])

  const calculateStats = useCallback((membersData: Member[]) => {
    const activeMembers = membersData.filter((m) => m.status === 'active')
    const pendingMembers = membersData.filter((m) => m.status === 'pending')

    let monthlyRevenue = 0
    activeMembers.forEach((m) => {
      const plan = PLANS[m.plan as PlanType]
      if (m.paymentType === 'monthly') {
        monthlyRevenue += plan.priceMonthly
      } else {
        monthlyRevenue += plan.priceAnnual / 12
      }
    })

    setStats({
      totalMembers: membersData.length,
      activeMembers: activeMembers.length,
      pendingPayments: pendingMembers.length,
      monthlyRevenue,
      membersByPlan: {
        silver: membersData.filter((m) => m.plan === 'silver').length,
        gold: membersData.filter((m) => m.plan === 'gold').length,
        black: membersData.filter((m) => m.plan === 'black').length,
      },
    })
  }, [])

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const [membersData, logsData, usersData] = await Promise.all([
        getAllMembers(),
        getRecentLogs(),
        FirestoreManager.findMany('users', [orderBy('createdAt', 'desc')], (id, data) => ({ id, ...data }))
      ])

      if (membersData && membersData.length > 0) {
        setMembers(membersData)
        calculateStats(membersData)
      } else {
        setMembers([])
        setStats({
          totalMembers: 0,
          activeMembers: 0,
          pendingPayments: 0,
          monthlyRevenue: 0,
          membersByPlan: { silver: 0, gold: 0, black: 0 },
        })
      }

      setLogs(logsData)
      setSystemUsers(usersData as { id: string; email: string; role: string; createdAt?: string }[])
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [calculateStats])

  const handleUpdateRole = useCallback(async (userId: string, newRole: string) => {
    try {
      await FirestoreManager.update('users', userId, { role: newRole })
      toast.success('Cargo atualizado com sucesso')
      fetchData(true)
    } catch (error) {
      console.error('Error updating role:', error)
      toast.error('Erro ao atualizar cargo')
    }
  }, [fetchData])

  const openModal = useCallback((mode: ModalMode, member?: Member) => {
    setModalMode(mode)
    setSelectedMember(member || null)
  }, [])

  const closeModal = useCallback(() => {
    setModalMode(null)
    setSelectedMember(null)
  }, [])

  const handleModalSuccess = useCallback(() => {
    closeModal()
    fetchData(true)
  }, [closeModal, fetchData])

  const handleDeleteMember = useCallback(async (member: Member) => {
    if (!confirm(`Tem certeza que deseja desativar o membro ${member.fullName}?`)) {
      return
    }

    try {
      await updateMember(member.id, { status: 'inactive' })
      toast.success('Membro desativado com sucesso')
      fetchData(true)
    } catch (error) {
      console.error('Error deleting member:', error)
      toast.error('Erro ao desativar membro')
    }
  }, [fetchData])

  const handleQuickActivate = useCallback(async (member: Member) => {
    try {
      await updateMember(member.id, { status: 'active' })
      toast.success('Membro ativado com sucesso')
      fetchData(true)
    } catch (error) {
      console.error('Error activating member:', error)
      toast.error('Erro ao ativar membro')
    }
  }, [fetchData])


  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="Geek & Toys" className="h-10 rounded" />
            <div>
              <h1 className="font-heading font-bold text-lg">Clube Geek & Toys</h1>
              <p className="text-xs text-muted-foreground">Painel Administrativo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => fetchData(true)} disabled={refreshing}>
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total de Membros</p>
                  <p className="text-3xl font-bold">{stats.totalMembers}</p>
                </div>
                <div className="p-3 rounded-full bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Membros Ativos</p>
                  <p className="text-3xl font-bold text-green-500">{stats.activeMembers}</p>
                </div>
                <div className="p-3 rounded-full bg-green-500/10">
                  <TrendingUp className="h-6 w-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pagamentos Pendentes</p>
                  <p className="text-3xl font-bold text-yellow-500">{stats.pendingPayments}</p>
                </div>
                <div className="p-3 rounded-full bg-yellow-500/10">
                  <AlertTriangle className="h-6 w-6 text-yellow-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Receita Mensal</p>
                  <p className="text-3xl font-bold">{formatCurrency(stats.monthlyRevenue)}</p>
                </div>
                <div className="p-3 rounded-full bg-blue-500/10">
                  <CreditCard className="h-6 w-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plan Distribution */}
        <div className="grid lg:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-slate-400 to-slate-600 text-white hover:scale-[1.02] transition-transform">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-80">Plano Silver</p>
                  <p className="text-3xl font-bold">{stats.membersByPlan.silver}</p>
                </div>
                <Star className="h-10 w-10 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-400 to-amber-600 text-white hover:scale-[1.02] transition-transform">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-80">Plano Gold</p>
                  <p className="text-3xl font-bold">{stats.membersByPlan.gold}</p>
                </div>
                <Crown className="h-10 w-10 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-gray-700 to-gray-900 text-white hover:scale-[1.02] transition-transform">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-80">Plano Black</p>
                  <p className="text-3xl font-bold">{stats.membersByPlan.black}</p>
                </div>
                <Sparkles className="h-10 w-10 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <Button
            variant={activeTab === 'members' ? 'default' : 'outline'}
            onClick={() => setActiveTab('members')}
            className="flex-shrink-0"
          >
            <Users className="h-4 w-4 mr-2" />
            Membros
          </Button>
          <Button
            variant={activeTab === 'logs' ? 'default' : 'outline'}
            onClick={() => setActiveTab('logs')}
            className="flex-shrink-0"
          >
            <FileText className="h-4 w-4 mr-2" />
            Logs
          </Button>
          <Button
            variant={activeTab === 'users' ? 'default' : 'outline'}
            onClick={() => setActiveTab('users')}
            className="flex-shrink-0 relative"
          >
            <UserCog className="h-4 w-4 mr-2" />
            Usuários
            {systemUsers.length > 0 && (
              <span className="ml-2 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs font-bold">
                {systemUsers.length}
              </span>
            )}
          </Button>
          <Button
            variant={activeTab === 'points' ? 'default' : 'outline'}
            onClick={() => setActiveTab('points')}
            className="flex-shrink-0"
          >
            <Star className="h-4 w-4 mr-2" />
            Pontos
          </Button>
          <Button
            variant={activeTab === 'reports' ? 'default' : 'outline'}
            onClick={() => setActiveTab('reports')}
            className="flex-shrink-0"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Relatórios
          </Button>
        </div>

        {/* Tab Content with Lazy Loading */}
        <Suspense fallback={<TabLoadingFallback />}>
          {activeTab === 'members' && (
            <MembersTab
              members={members}
              loading={refreshing}
              onView={(member) => openModal('view', member)}
              onEdit={(member) => openModal('edit', member)}
              onDelete={handleDeleteMember}
              onActivate={handleQuickActivate}
              onCreate={() => openModal('create')}
            />
          )}
          {activeTab === 'users' && (
            <UsersTab
              users={systemUsers}
              onCreateUser={() => setShowUserModal(true)}
              onUpdateRole={handleUpdateRole}
            />
          )}
          {activeTab === 'logs' && (
            <LogsTab
              logs={logs}
              logDateFrom={logDateFrom}
              logDateTo={logDateTo}
              onDateFromChange={setLogDateFrom}
              onDateToChange={setLogDateTo}
            />
          )}
          {activeTab === 'reports' && (
            <ReportsTab
              reportPeriod={reportPeriod}
              monthlyReportData={monthlyReportData}
              planDistribution={planDistribution}
              churnData={churnData}
              pointsOverviewData={pointsOverviewData}
              loadingReports={loadingReports}
              onPeriodChange={setReportPeriod}
              onRefresh={fetchReports}
            />
          )}
          {activeTab === 'points' && (
            <PointsTab members={members} />
          )}
        </Suspense>
      </main>

      {/* Member Modal */}
      {modalMode && (
        <MemberModal mode={modalMode as 'create' | 'edit' | 'view'} member={selectedMember} onClose={closeModal} onSuccess={handleModalSuccess} />
      )}

      {/* User Modal */}
      {showUserModal && (
        <UserModal
          onClose={() => setShowUserModal(false)}
          onSuccess={() => {
            setShowUserModal(false)
            fetchData(true)
          }}
        />
      )}

    </div>
  )
}
