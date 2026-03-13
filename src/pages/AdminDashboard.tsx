import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { orderBy } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { LoadingSpinner } from '../components/ui/loading'
import { Skeleton, SkeletonStats } from '../components/ui/skeleton'
import { MemberModal } from '../components/MemberModal'
import { UserModal } from '../components/UserModal'
import { AdminSidebar, type AdminTab } from '../components/admin/AdminSidebar'
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
  Crown,
  Star,
  Sparkles,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// Lazy load tab components for code splitting
const MembersTab = lazy(() => import('../components/admin/MembersTab').then(m => ({ default: m.MembersTab })))
const UsersTab = lazy(() => import('../components/admin/UsersTab').then(m => ({ default: m.UsersTab })))
const LogsTab = lazy(() => import('../components/admin/LogsTab').then(m => ({ default: m.LogsTab })))
const ReportsTab = lazy(() => import('../components/admin/ReportsTab').then(m => ({ default: m.ReportsTab })))
const PointsTab = lazy(() => import('../components/admin/PointsTab').then(m => ({ default: m.PointsTab })))
const SettingsTab = lazy(() => import('../components/admin/SettingsTab').then(m => ({ default: m.SettingsTab })))

type ModalMode = 'create' | 'edit' | 'view' | 'role' | null

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
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard')
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

  const handleDeleteUser = useCallback(async (userId: string, userEmail: string) => {
    if (!confirm(`Tem certeza que deseja remover o usuário "${userEmail}"?\n\nIsso removerá o acesso ao sistema, mas não apaga a conta do Firebase Auth.`)) {
      return
    }

    try {
      await FirestoreManager.delete('users', userId)
      toast.success('Usuário removido com sucesso')
      fetchData(true)
    } catch (error) {
      console.error('Error deleting user:', error)
      toast.error('Erro ao remover usuário')
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
    return (
      <div className="min-h-screen bg-background">
        {/* Skeleton Sidebar */}
        <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-card border-r border-border flex-col z-50 p-4">
          <div className="flex items-center gap-3 pb-4 border-b">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </aside>

        {/* Mobile Header Skeleton */}
        <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-card border-b border-border p-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-4 w-16" />
          </div>
        </header>

        {/* Main Content Skeleton */}
        <main className="pt-16 lg:pt-0 lg:pl-64">
          <div className="p-4 lg:p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-9 w-24" />
            </div>

            {/* PDV Card Skeleton */}
            <Skeleton className="h-24 w-full rounded-xl" />

            {/* Stats Grid */}
            <SkeletonStats />

            {/* Quick Links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <AdminSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSignOut={signOut}
      />

      {/* Main Content */}
      <main className="pt-16 lg:pt-0 lg:pl-64">
        <div className="p-4 lg:p-8">
          {/* Header com Refresh */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold">
                {activeTab === 'dashboard' && 'Dashboard'}
                {activeTab === 'members' && 'Membros'}
                {activeTab === 'points' && 'Pontos'}
                {activeTab === 'users' && 'Usuários'}
                {activeTab === 'logs' && 'Logs de Auditoria'}
                {activeTab === 'reports' && 'Relatórios'}
                {activeTab === 'settings' && 'Configurações'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {activeTab === 'dashboard' && 'Visão geral do sistema'}
                {activeTab === 'members' && 'Gerencie os membros do clube'}
                {activeTab === 'points' && 'Ranking de pontos dos membros'}
                {activeTab === 'users' && 'Gerencie usuários do sistema'}
                {activeTab === 'logs' && 'Histórico de ações no sistema'}
                {activeTab === 'reports' && 'Métricas e análises'}
                {activeTab === 'settings' && 'Configure o sistema'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          </div>

          {/* Dashboard Content */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Quick Action - PDV */}
              <Card className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
                <CardContent className="p-4 lg:p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-lg">Ponto de Venda (PDV)</h3>
                      <p className="text-sm opacity-90">Registre compras e dê pontos aos membros</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => navigate('/pdv')}
                      className="w-full sm:w-auto"
                    >
                      <ShoppingCart className="h-5 w-5 mr-2" />
                      Abrir PDV
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                <Card>
                  <CardContent className="p-4 lg:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs lg:text-sm text-muted-foreground">Total Membros</p>
                        <p className="text-2xl lg:text-3xl font-bold">{stats.totalMembers}</p>
                      </div>
                      <div className="p-2 lg:p-3 rounded-full bg-primary/10 hidden sm:block">
                        <Users className="h-5 w-5 lg:h-6 lg:w-6 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 lg:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs lg:text-sm text-muted-foreground">Ativos</p>
                        <p className="text-2xl lg:text-3xl font-bold text-green-500">{stats.activeMembers}</p>
                      </div>
                      <div className="p-2 lg:p-3 rounded-full bg-green-500/10 hidden sm:block">
                        <TrendingUp className="h-5 w-5 lg:h-6 lg:w-6 text-green-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 lg:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs lg:text-sm text-muted-foreground">Pendentes</p>
                        <p className="text-2xl lg:text-3xl font-bold text-yellow-500">{stats.pendingPayments}</p>
                      </div>
                      <div className="p-2 lg:p-3 rounded-full bg-yellow-500/10 hidden sm:block">
                        <AlertTriangle className="h-5 w-5 lg:h-6 lg:w-6 text-yellow-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 lg:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs lg:text-sm text-muted-foreground">Receita/Mês</p>
                        <p className="text-xl lg:text-2xl font-bold">{formatCurrency(stats.monthlyRevenue)}</p>
                      </div>
                      <div className="p-2 lg:p-3 rounded-full bg-blue-500/10 hidden sm:block">
                        <CreditCard className="h-5 w-5 lg:h-6 lg:w-6 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Plan Distribution */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
                <Card className="bg-gradient-to-br from-slate-400 to-slate-600 text-white">
                  <CardContent className="p-4 lg:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm opacity-80">Silver</p>
                        <p className="text-2xl lg:text-3xl font-bold">{stats.membersByPlan.silver}</p>
                      </div>
                      <Star className="h-8 w-8 lg:h-10 lg:w-10 opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-yellow-400 to-amber-600 text-white">
                  <CardContent className="p-4 lg:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm opacity-80">Gold</p>
                        <p className="text-2xl lg:text-3xl font-bold">{stats.membersByPlan.gold}</p>
                      </div>
                      <Crown className="h-8 w-8 lg:h-10 lg:w-10 opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-violet-600 to-purple-800 text-white">
                  <CardContent className="p-4 lg:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm opacity-80">Black</p>
                        <p className="text-2xl lg:text-3xl font-bold">{stats.membersByPlan.black}</p>
                      </div>
                      <Sparkles className="h-8 w-8 lg:h-10 lg:w-10 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Links */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setActiveTab('members')}>
                  <Users className="h-5 w-5" />
                  <span className="text-xs">Ver Membros</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setActiveTab('points')}>
                  <Star className="h-5 w-5" />
                  <span className="text-xs">Ranking Pontos</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setActiveTab('reports')}>
                  <TrendingUp className="h-5 w-5" />
                  <span className="text-xs">Relatórios</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setActiveTab('settings')}>
                  <CreditCard className="h-5 w-5" />
                  <span className="text-xs">Configurações</span>
                </Button>
              </div>
            </div>
          )}

          {/* Other Tabs */}
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
                onDeleteUser={handleDeleteUser}
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
              <PointsTab members={members} onRefresh={() => fetchData(true)} />
            )}
            {activeTab === 'settings' && (
              <SettingsTab />
            )}
          </Suspense>
        </div>
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
