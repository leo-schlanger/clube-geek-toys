import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { api } from '../lib/api-client'
import { useAuth } from '../contexts/AuthContext'
import { logger } from '../lib/logger'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { LoadingSpinner } from '../components/ui/loading'
import { Skeleton, SkeletonStats } from '../components/ui/skeleton'
import { MemberModal } from '../components/MemberModal'
import { UserModal } from '../components/UserModal'
import { AdminSidebar, type AdminTab } from '../components/admin/AdminSidebar'
import { PLANS, type Member, type PlanType } from '../types'
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
import { toast } from 'sonner'
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendRenewalReminderEmail,
} from '../lib/email'
import {
  Users,
  CreditCard,
  TrendingUp,
  Star,
  RefreshCw,
  ShoppingCart,
  AlertCircle,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

// Lazy load tab components for code splitting
const MembersTab = lazy(() => import('../components/admin/MembersTab').then(m => ({ default: m.MembersTab })))
const UsersTab = lazy(() => import('../components/admin/UsersTab').then(m => ({ default: m.UsersTab })))
const LogsTab = lazy(() => import('../components/admin/LogsTab').then(m => ({ default: m.LogsTab })))
const ReportsTab = lazy(() => import('../components/admin/ReportsTab').then(m => ({ default: m.ReportsTab })))
const PointsTab = lazy(() => import('../components/admin/PointsTab').then(m => ({ default: m.PointsTab })))
const SettingsTab = lazy(() => import('../components/admin/SettingsTab').then(m => ({ default: m.SettingsTab })))
const RealtimeMetrics = lazy(() => import('../components/admin/RealtimeMetrics').then(m => ({ default: m.RealtimeMetrics })))

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

const VALID_TABS: AdminTab[] = ['dashboard', 'members', 'users', 'points', 'reports', 'logs', 'settings']

function isValidTab(t: string | null): t is AdminTab {
  return !!t && (VALID_TABS as string[]).includes(t)
}

export default function AdminDashboard() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Active tab is synchronized with the URL ?tab=... so:
  //  - Reload preserves the current tab
  //  - Back/forward navigation feels natural
  //  - Sharing a link to the admin lands on the right tab
  const initialTab = searchParams.get('tab')
  const [activeTab, setActiveTabState] = useState<AdminTab>(isValidTab(initialTab) ? initialTab : 'dashboard')

  const setActiveTab = useCallback((tab: AdminTab) => {
    setActiveTabState(tab)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (tab === 'dashboard') {
        next.delete('tab')
      } else {
        next.set('tab', tab)
      }
      return next
    }, { replace: true })
  }, [setSearchParams])
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally empty - only fetch on mount

  // Fetch reports when tab changes to reports or period changes
  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReports()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reportPeriod]) // fetchReports is stable via useCallback

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
      logger.error('Error fetching reports:', error)
      toast.error('Erro ao carregar relatórios')
    } finally {
      setLoadingReports(false)
    }
  }, [reportPeriod])

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
        api.get('/users').then(r => r.data || [])
      ])

      setMembers(membersData || [])

      setLogs(logsData)
      setSystemUsers(usersData as { id: string; email: string; role: string; createdAt?: string }[])
    } catch (error) {
      logger.error('Error fetching data:', error)
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const handleUpdateRole = useCallback(async (userId: string, newRole: string) => {
    try {
      const result = await api.patch(`/users/${userId}/role`, { role: newRole })
      if (result.error) throw new Error(result.error)
      toast.success('Cargo atualizado com sucesso')
      fetchData(true)
    } catch (error) {
      logger.error('Error updating role:', error)
      toast.error('Erro ao atualizar cargo')
    }
  }, [fetchData])

  const handleDeleteUser = useCallback(async (userId: string, userEmail: string) => {
    if (!confirm(`Tem certeza que deseja desativar o usuário "${userEmail}"?\n\nO usuário perderá acesso ao sistema. Para reativar, altere o status para um cargo válido.`)) {
      return
    }

    try {
      // Soft-delete: marca como 'disabled' em vez de deletar
      const result = await api.patch(`/users/${userId}/role`, { role: 'disabled' })
      if (result.error) throw new Error(result.error)
      toast.success('Usuário desativado com sucesso')
      fetchData(true)
    } catch (error) {
      logger.error('Error disabling user:', error)
      toast.error('Erro ao desativar usuário')
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
      logger.error('Error deleting member:', error)
      toast.error('Erro ao desativar membro')
    }
  }, [fetchData])

  const handleQuickActivate = useCallback(async (member: Member) => {
    const plan = PLANS[member.plan as PlanType]
    const expectedAmount = member.paymentType === 'monthly' ? plan.priceMonthly : plan.priceAnnual

    const confirmed = confirm(
      `⚠️ VERIFICAÇÃO DE PAGAMENTO OBRIGATÓRIA\n\n` +
      `Antes de ativar, confirme que o pagamento foi recebido:\n\n` +
      `Membro: ${member.fullName}\n` +
      `CPF: ${member.cpf}\n` +
      `Plano: ${plan.name}\n` +
      `Tipo: ${member.paymentType === 'monthly' ? 'Mensal' : 'Anual'}\n` +
      `Valor esperado: ${formatCurrency(expectedAmount)}\n\n` +
      `Clique em OK apenas se você VERIFICOU o pagamento.`
    )

    if (!confirmed) return

    try {
      // Find pending PIX payment for this member and confirm it via the proper endpoint.
      // This sets payment status to 'paid', calculates expiry dates, and sends confirmation email.
      const payments = await api.get<{ id: string; status: string; method: string }[]>(
        `/payments?member_id=${member.id}&status=pending&limit=1`
      )
      const pendingPayment = (payments.data || []).find(p => p.method === 'pix')

      if (pendingPayment) {
        const result = await api.post(`/payments/${pendingPayment.id}/confirm`)
        if (result.error) throw new Error(result.error)
        toast.success('Pagamento PIX confirmado e membro ativado!')
      } else {
        // No pending PIX payment found — activate directly (manual/admin override)
        await updateMember(member.id, { status: 'active' })
        toast.success('Membro ativado manualmente')
      }
      fetchData(true)
    } catch (error) {
      logger.error('Error activating member:', error)
      toast.error('Erro ao ativar membro')
    }
  }, [fetchData])

  const handleResendEmail = useCallback(async (member: Member, type: 'verification' | 'welcome' | 'renewal') => {
    const plan = PLANS[member.plan as PlanType]

    try {
      let result

      switch (type) {
        case 'verification':
          result = await sendVerificationEmail(member.email, member.id, member.fullName)
          break
        case 'welcome':
          result = await sendWelcomeEmail(member.email, member.fullName, plan.name, member.id)
          break
        case 'renewal':
          result = await sendRenewalReminderEmail(member.email, member.fullName, member.expiryDate, member.id)
          break
      }

      if (result.success) {
        const emailTypes = {
          verification: 'verificação',
          welcome: 'boas-vindas',
          renewal: 'lembrete de renovação'
        }
        toast.success(`Email de ${emailTypes[type]} enviado para ${member.email}`)
      } else {
        toast.error(result.error || 'Erro ao enviar email')
      }
    } catch (error) {
      logger.error('Error sending email:', error)
      toast.error('Erro ao enviar email')
    }
  }, [])


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
          {activeTab === 'dashboard' && (() => {
            const pendingMembers = members.filter(m => m.status === 'pending')
            return (
            <div className="space-y-6">
              {/* Pending PIX Payments Alert */}
              {pendingMembers.length > 0 && (
                <Card className="border-2 border-yellow-500/60 bg-yellow-500/10">
                  <CardContent className="p-4 lg:p-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-6 w-6 text-yellow-500 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-bold text-lg text-yellow-200">
                          {pendingMembers.length} pagamento{pendingMembers.length > 1 ? 's' : ''} aguardando confirmação
                        </h3>
                        <p className="text-sm text-yellow-200/80 mt-1">
                          Verifique o extrato bancário. Se o PIX foi recebido, clique em <strong>Confirmar Pagamento</strong>.
                        </p>
                      </div>
                    </div>

                    {/* Direct activation buttons for each pending member */}
                    <div className="space-y-2">
                      {pendingMembers.map(m => {
                        const planData = PLANS[m.plan as PlanType]
                        const expectedAmount = m.paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual
                        return (
                          <div key={m.id} className="flex items-center justify-between gap-3 p-3 bg-yellow-500/10 rounded-lg">
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{m.fullName}</p>
                              <p className="text-sm text-muted-foreground">
                                {planData.name} · {formatCurrency(expectedAmount)}
                              </p>
                            </div>
                            <Button
                              variant="warning"
                              size="sm"
                              className="shrink-0"
                              onClick={() => handleQuickActivate(m)}
                            >
                              Confirmar Pagamento
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

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

              {/* Real-time Metrics */}
              <Suspense fallback={<TabLoadingFallback />}>
                <RealtimeMetrics />
              </Suspense>

              {/* Quick Links */}
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-auto py-5 flex-col gap-2" onClick={() => setActiveTab('members')}>
                  <Users className="h-6 w-6" />
                  <span className="text-sm font-medium">Ver Membros</span>
                </Button>
                <Button variant="outline" className="h-auto py-5 flex-col gap-2" onClick={() => setActiveTab('points')}>
                  <Star className="h-6 w-6" />
                  <span className="text-sm font-medium">Ranking de Pontos</span>
                </Button>
                <Button variant="outline" className="h-auto py-5 flex-col gap-2" onClick={() => setActiveTab('reports')}>
                  <TrendingUp className="h-6 w-6" />
                  <span className="text-sm font-medium">Relatórios</span>
                </Button>
                <Button variant="outline" className="h-auto py-5 flex-col gap-2" onClick={() => setActiveTab('settings')}>
                  <CreditCard className="h-6 w-6" />
                  <span className="text-sm font-medium">Configurações</span>
                </Button>
              </div>
            </div>
            )
          })()}

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
                onResendEmail={handleResendEmail}
                onRefetch={() => fetchData(true)}
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
