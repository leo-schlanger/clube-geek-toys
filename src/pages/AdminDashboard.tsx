import { useState, useEffect } from 'react'
import { orderBy } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { LoadingPage } from '../components/ui/loading'
import { MemberModal } from '../components/MemberModal'
import { UserModal } from '../components/UserModal'
import { PLANS, type Member, type PlanType, type DashboardStats } from '../types'
import { formatCurrency, formatCPF, getStatusLabel } from '../lib/utils'
import { getAllMembers, updateMember } from '../lib/members'
import { getRecentLogs, type AuditLog } from '../lib/logs'
import { FirestoreManager } from '../lib/db-utils'
import { toast } from 'sonner'
import {
  Users,
  Shield,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  Search,
  Plus,
  LogOut,
  Settings,
  Eye,
  Edit,
  Trash2,
  Crown,
  Star,
  Sparkles,
  RefreshCw,
  Download,
  MoreVertical,
  CheckCircle,
  FileText,
  Clock,
  UserCog,
} from 'lucide-react'

type ModalMode = 'create' | 'edit' | 'view' | 'role' | null
type FilterStatus = 'all' | 'active' | 'pending' | 'inactive' | 'expired'
type DashboardTab = 'members' | 'logs' | 'users' | 'points'

export default function AdminDashboard() {
  const { signOut } = useAuth()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<DashboardTab>('members')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterPlan, setFilterPlan] = useState<PlanType | 'all'>('all')
  const [stats, setStats] = useState<DashboardStats>({
    totalMembers: 0,
    activeMembers: 0,
    pendingPayments: 0,
    monthlyRevenue: 0,
    membersByPlan: { silver: 0, gold: 0, black: 0 },
  })
  const [members, setMembers] = useState<Member[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [systemUsers, setSystemUsers] = useState<any[]>([])

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [showUserModal, setShowUserModal] = useState(false)

  // Dropdown state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  // Pagination state
  const PAGE_SIZE = 10
  const [currentPage, setCurrentPage] = useState(1)

  // Log filter state
  const [logDateFrom, setLogDateFrom] = useState('')
  const [logDateTo, setLogDateTo] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData(showRefreshing = false) {
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
      setSystemUsers(usersData)
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function handleUpdateRole(userId: string, newRole: string) {
    try {
      await FirestoreManager.update('users', userId, { role: newRole })
      toast.success('Cargo atualizado com sucesso')
      fetchData(true)
    } catch (error) {
      console.error('Error updating role:', error)
      toast.error('Erro ao atualizar cargo')
    }
  }

  function calculateStats(membersData: Member[]) {
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
  }

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.cpf.includes(searchTerm.replace(/\D/g, '')) ||
      m.email.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = filterStatus === 'all' || m.status === filterStatus
    const matchesPlan = filterPlan === 'all' || m.plan === filterPlan

    return matchesSearch && matchesStatus && matchesPlan
  })

  // Pagination derived values
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE))
  const paginatedMembers = filteredMembers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Reset to page 1 whenever filters change
  function applyFilter() { setCurrentPage(1) }

  // Filtered logs
  const filteredLogs = logs.filter((log) => {
    if (!logDateFrom && !logDateTo) return true
    const ts = new Date(log.timestamp)
    if (logDateFrom && ts < new Date(logDateFrom)) return false
    if (logDateTo) {
      const to = new Date(logDateTo)
      to.setHours(23, 59, 59, 999)
      if (ts > to) return false
    }
    return true
  })

  // Points summary per member
  const pointsReport = [...members]
    .filter((m) => m.points > 0)
    .sort((a, b) => b.points - a.points)

  const planIcons = {
    silver: <Star className="h-4 w-4" />,
    gold: <Crown className="h-4 w-4" />,
    black: <Sparkles className="h-4 w-4" />,
  }

  function getActionLabel(action: string): { label: string; color: string } {
    const actions: Record<string, { label: string; color: string }> = {
      member_activated: { label: 'Membro Ativado', color: 'text-green-500' },
      member_created: { label: 'Membro Cadastrado', color: 'text-blue-500' },
      member_updated: { label: 'Membro Atualizado', color: 'text-yellow-500' },
      member_deactivated: { label: 'Membro Desativado', color: 'text-red-500' },
      payment_created: { label: 'Pagamento Registrado', color: 'text-blue-500' },
      payment_confirmed: { label: 'Pagamento Confirmado', color: 'text-green-500' },
      payment_failed: { label: 'Pagamento Falhou', color: 'text-red-500' },
      points_added: { label: 'Pontos Adicionados', color: 'text-purple-500' },
      role_updated: { label: 'Cargo Atualizado', color: 'text-orange-500' },
    }
    return actions[action] ?? { label: action.replace(/_/g, ' '), color: 'text-muted-foreground' }
  }

  function openModal(mode: ModalMode, member?: Member) {
    setModalMode(mode)
    setSelectedMember(member || null)
    setOpenDropdown(null)
  }

  function closeModal() {
    setModalMode(null)
    setSelectedMember(null)
  }

  function handleModalSuccess() {
    closeModal()
    fetchData(true)
  }

  async function handleDeleteMember(member: Member) {
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

    setOpenDropdown(null)
  }

  async function handleQuickActivate(member: Member) {
    try {
      await updateMember(member.id, { status: 'active' })
      toast.success('Membro ativado com sucesso')
      fetchData(true)
    } catch (error) {
      console.error('Error activating member:', error)
      toast.error('Erro ao ativar membro')
    }
  }

  function exportCSV() {
    const headers = ['Nome', 'Email', 'CPF', 'Telefone', 'Plano', 'Status', 'Validade', 'Pontos']
    const rows = filteredMembers.map((m) => [
      m.fullName,
      m.email,
      formatCPF(m.cpf),
      m.phone,
      PLANS[m.plan as PlanType].name,
      getStatusLabel(m.status),
      new Date(m.expiryDate).toLocaleDateString('pt-BR'),
      m.points.toString(),
    ])

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `membros_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)

    toast.success('Exportação concluída')
  }

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
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === 'members' ? 'default' : 'outline'}
            onClick={() => setActiveTab('members')}
            className="flex-1 sm:flex-none"
          >
            <Users className="h-4 w-4 mr-2" />
            Membros
          </Button>
          <Button
            variant={activeTab === 'logs' ? 'default' : 'outline'}
            onClick={() => setActiveTab('logs')}
            className="flex-1 sm:flex-none"
          >
            <FileText className="h-4 w-4 mr-2" />
            Logs de Atividade
          </Button>
          <Button
            variant={activeTab === 'users' ? 'default' : 'outline'}
            onClick={() => setActiveTab('users')}
            className="flex-1 sm:flex-none relative"
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
            className="flex-1 sm:flex-none"
          >
            <Star className="h-4 w-4 mr-2" />
            Relatório de Pontos
          </Button>
        </div>

        {/* Members Table */}
        {/* Main Content Area */}
        {activeTab === 'members' ? (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Membros</CardTitle>
                  <CardDescription>Gerencie os membros do clube</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={exportCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                  <Button onClick={() => openModal('create')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Membro
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, CPF ou email..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); applyFilter() }}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={filterStatus}
                    onChange={(e) => { setFilterStatus(e.target.value as FilterStatus); applyFilter() }}
                    className="px-3 py-2 rounded-md border bg-background text-sm"
                  >
                    <option value="all">Todos os status</option>
                    <option value="active">Ativos</option>
                    <option value="pending">Pendentes</option>
                    <option value="inactive">Inativos</option>
                    <option value="expired">Expirados</option>
                  </select>
                  <select
                    value={filterPlan}
                    onChange={(e) => { setFilterPlan(e.target.value as PlanType | 'all'); applyFilter() }}
                    className="px-3 py-2 rounded-md border bg-background text-sm"
                  >
                    <option value="all">Todos os planos</option>
                    <option value="silver">Silver</option>
                    <option value="gold">Gold</option>
                    <option value="black">Black</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-3 px-4 font-medium text-sm">Membro</th>
                      <th className="text-left py-3 px-4 font-medium text-sm">Plano</th>
                      <th className="text-left py-3 px-4 font-medium text-sm">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-sm">Validade</th>
                      <th className="text-left py-3 px-4 font-medium text-sm">Pontos</th>
                      <th className="text-right py-3 px-4 font-medium text-sm">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedMembers.map((member) => (
                      <tr key={member.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-medium">{member.fullName}</p>
                            <p className="text-sm text-muted-foreground">{formatCPF(member.cpf)}</p>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant={member.plan as 'silver' | 'gold' | 'black'} className="gap-1">
                            {planIcons[member.plan as PlanType]}
                            {PLANS[member.plan as PlanType].name}
                          </Badge>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                member.status === 'active'
                                  ? 'success'
                                  : member.status === 'pending'
                                    ? 'warning'
                                    : 'destructive'
                              }
                            >
                              {getStatusLabel(member.status)}
                            </Badge>
                            {member.status === 'pending' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleQuickActivate(member)}
                                title="Ativar membro"
                              >
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className={new Date(member.expiryDate) < new Date() ? 'text-red-500' : ''}>
                            {new Date(member.expiryDate).toLocaleDateString('pt-BR')}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-medium">{member.points}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="relative inline-block">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openModal('view', member)} title="Ver detalhes">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openModal('edit', member)} title="Editar">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setOpenDropdown(openDropdown === member.id ? null : member.id)}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* Dropdown menu */}
                            {openDropdown === member.id && (
                              <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-card ring-1 ring-border z-50">
                                <div className="py-1">
                                  <button
                                    onClick={() => openModal('view', member)}
                                    className="flex items-center w-full px-4 py-2 text-sm text-left hover:bg-muted"
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    Ver detalhes
                                  </button>
                                  <button
                                    onClick={() => openModal('edit', member)}
                                    className="flex items-center w-full px-4 py-2 text-sm text-left hover:bg-muted"
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Editar
                                  </button>
                                  <hr className="my-1" />
                                  <button
                                    onClick={() => handleDeleteMember(member)}
                                    className="flex items-center w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Desativar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredMembers.length === 0 && (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nenhum membro encontrado</p>
                    {members.length === 0 && (
                      <Button className="mt-4" onClick={() => openModal('create')}>
                        <Plus className="h-4 w-4 mr-2" />
                        Cadastrar primeiro membro
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Pagination info */}
              {filteredMembers.length > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground border-t pt-4">
                  <div>
                    Exibindo {(currentPage - 1) * PAGE_SIZE + 1} a {Math.min(currentPage * PAGE_SIZE, filteredMembers.length)} de {filteredMembers.length} membros filtrados (Total: {members.length})
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Anterior
                    </Button>
                    <span className="font-medium text-foreground">
                      Página {currentPage} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : activeTab === 'users' ? (
          /* Users View */
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Usuários do Sistema</CardTitle>
                  <CardDescription>Gerencie o acesso e cargos dos usuários cadastrados</CardDescription>
                </div>
                <Button onClick={() => setShowUserModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Usuário
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-3 px-4 font-medium text-sm">Usuário</th>
                      <th className="text-left py-3 px-4 font-medium text-sm">Cargo</th>
                      <th className="text-left py-3 px-4 font-medium text-sm">Cadastro em</th>
                      <th className="text-right py-3 px-4 font-medium text-sm">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemUsers.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-medium">{user.email}</p>
                            <p className="text-xs text-muted-foreground font-mono">{user.id}</p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant={user.role === 'admin' ? 'black' : user.role === 'seller' ? 'gold' : 'silver'}>
                            {user.role === 'admin' && <Shield className="h-3 w-3 mr-1 inline" />}
                            {user.role}
                          </Badge>
                        </td>
                        <td className="py-4 px-4 text-sm text-muted-foreground">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : 'N/A'}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <select
                            value={user.role}
                            onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                            className="bg-muted text-xs p-1 rounded border border-border"
                          >
                            <option value="member">Membro</option>
                            <option value="seller">Vendedor</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {systemUsers.length === 0 && (
                  <div className="text-center py-12">
                    <UserCog className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground font-medium">Nenhum usuário encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Os usuários aparecem aqui após se cadastrarem na plataforma
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : activeTab === 'logs' ? (
          /* Logs View */
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle>Histórico de Atividade</CardTitle>
                  <CardDescription>Acompanhe as últimas ações registradas no sistema</CardDescription>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Input
                    type="date"
                    value={logDateFrom}
                    onChange={(e) => setLogDateFrom(e.target.value)}
                    className="flex-1 sm:w-auto"
                    title="Data Inicial"
                  />
                  <Input
                    type="date"
                    value={logDateTo}
                    onChange={(e) => setLogDateTo(e.target.value)}
                    className="flex-1 sm:w-auto"
                    title="Data Final"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => {
                    const { label, color } = getActionLabel(log.action)
                    return (
                      <div key={log.id} className="flex items-start gap-4 p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                        <div className="p-2 rounded-full bg-primary/10 mt-0.5">
                          <Clock className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className={`font-semibold text-sm ${color}`}>{label}</p>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          <div className="flex gap-4 text-xs text-muted-foreground font-mono">
                            {log.member_id && (
                              <span>Membro: <span className="text-foreground">{log.member_id.slice(0, 10)}…</span></span>
                            )}
                            {log.payment_id && (
                              <span>Pagamento: <span className="text-foreground">{log.payment_id.slice(0, 10)}…</span></span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground font-medium">Nenhum log de atividade encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">Os logs aparecem aqui automaticamente conforme o sistema é utilizado</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Points Report View */
          <Card>
            <CardHeader>
              <CardTitle>Relatório de Pontos</CardTitle>
              <CardDescription>Ranking de membros por pontos acumulados</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-3 px-4 font-medium text-sm w-16">Posição</th>
                      <th className="text-left py-3 px-4 font-medium text-sm">Membro</th>
                      <th className="text-left py-3 px-4 font-medium text-sm">Plano</th>
                      <th className="text-right py-3 px-4 font-medium text-sm">Total de Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pointsReport.map((member, index) => (
                      <tr key={member.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-4 px-4 font-bold text-muted-foreground">
                          #{index + 1}
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-medium">{member.fullName}</p>
                          <p className="text-sm text-muted-foreground">{formatCPF(member.cpf)}</p>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant={member.plan as 'silver' | 'gold' | 'black'} className="gap-1">
                            {planIcons[member.plan as PlanType]}
                            {PLANS[member.plan as PlanType].name}
                          </Badge>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="font-bold text-primary text-lg">
                            {member.points}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {pointsReport.length === 0 && (
                  <div className="text-center py-12">
                    <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground font-medium">Nenhum membro com pontos</p>
                    <p className="text-xs text-muted-foreground mt-1">Os pontos distribuídos no PDV aparecerão aqui</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Member Modal */}
      {modalMode && (
        <MemberModal mode={modalMode as any} member={selectedMember} onClose={closeModal} onSuccess={handleModalSuccess} />
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

      {/* Click outside to close dropdown */}
      {openDropdown && <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />}
    </div>
  )
}
