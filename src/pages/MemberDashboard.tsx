import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { logger } from '../lib/logger'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { LoadingPage } from '../components/ui/loading'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { PendingPaymentScreen } from '../components/PendingPaymentScreen'
import { MemberHeroCard } from '../components/member/MemberHeroCard'
import { DashboardOverviewTab } from '../components/member/DashboardOverviewTab'
import { DashboardPointsTab } from '../components/member/DashboardPointsTab'
import { DashboardSubscriptionTab } from '../components/member/DashboardSubscriptionTab'
import { DashboardHistoryTab } from '../components/member/DashboardHistoryTab'
import type { Member, PointTransaction, Subscription, Contract } from '../types'
import { calculateDaysUntilExpiry } from '../lib/utils'
import { getMemberByUserId } from '../lib/members'
import { getMemberContract } from '../lib/contract-storage'
import { getPointsHistory, getExpiringPoints } from '../lib/points'
import { getActiveSubscriptionByMemberId } from '../lib/subscriptions'
import { toast } from 'sonner'
import {
  LogOut,
  Settings,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'

// Modals are lazy-loaded — they're rarely opened, no need to ship them in the main bundle.
const RenewModal = lazy(() => import('../components/RenewModal').then(m => ({ default: m.RenewModal })))
const UpgradeModal = lazy(() => import('../components/UpgradeModal').then(m => ({ default: m.UpgradeModal })))
const ProfileEditModal = lazy(() => import('../components/ProfileEditModal').then(m => ({ default: m.ProfileEditModal })))

type ModalType = 'renew' | 'upgrade' | 'profile' | null

export default function MemberDashboard() {
  const { user, signOut } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalType>(null)
  const [pointsHistory, setPointsHistory] = useState<PointTransaction[]>([])
  const [expiringPoints, setExpiringPoints] = useState<PointTransaction[]>([])
  const [loadingPoints, setLoadingPoints] = useState(false)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchMemberData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Auto-poll while member status is pending (waiting for webhook activation)
  useEffect(() => {
    if (!member || member.status !== 'pending') return
    const interval = setInterval(() => {
      fetchMemberData()
    }, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.status])

  async function fetchMemberData() {
    if (!user) return

    setFetchError(null)
    try {
      const memberData = await getMemberByUserId(user.id)
      setMember(memberData)

      if (memberData) {
        setLoadingPoints(true)
        const [history, expiring, sub, memberContract] = await Promise.all([
          getPointsHistory(memberData.id, 20),
          getExpiringPoints(memberData.id),
          getActiveSubscriptionByMemberId(memberData.id),
          getMemberContract(memberData.id),
        ])
        setPointsHistory(history)
        setExpiringPoints(expiring)
        setSubscription(sub)
        setContract(memberContract)
        setLoadingPoints(false)
      }
    } catch (error) {
      logger.error('Error fetching member data:', error)
      setFetchError('Nao conseguimos carregar seus dados. Verifique sua conexao e tente novamente.')
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleModalSuccess = useCallback(() => {
    setModal(null)
    fetchMemberData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return <LoadingPage />
  }

  // Error state
  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 p-4 bg-destructive/15 rounded-full w-fit">
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="font-heading">Erro ao carregar dados</CardTitle>
            <CardDescription>{fetchError}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => { setLoading(true); fetchMemberData() }} size="lg" className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
            <Button variant="outline" onClick={signOut} className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Empty state — no member record
  if (!member) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <img src="/logo-vip.png" alt="Clube Geek & Toys VIP" className="w-40 mx-auto" />
            </div>
            <div className="mx-auto mb-4 p-4 bg-warning/20 rounded-full w-fit">
              <AlertTriangle className="h-12 w-12 text-warning" />
            </div>
            <CardTitle className="font-heading">Nenhuma assinatura encontrada</CardTitle>
            <CardDescription>
              Voce ainda nao possui uma assinatura ativa. Assine agora e comece a aproveitar os beneficios!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => window.location.href = '/assinar'} size="lg" className="w-full">
              Assinar agora
            </Button>
            <Button variant="outline" onClick={signOut} className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Pending payment screen
  if (member.status === 'pending') {
    return (
      <PendingPaymentScreen
        member={member}
        onPaymentSuccess={fetchMemberData}
      />
    )
  }

  const daysUntilExpiry = calculateDaysUntilExpiry(new Date(member.expiryDate))
  const isExpiringSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0
  const isExpired = daysUntilExpiry <= 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b border-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-vip.png" alt="Geek & Toys VIP" className="h-10" />
            <span className="text-lg font-heading font-bold text-foreground">Clube Geek & Toys</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setModal('profile')} title="Editar Perfil">
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Expiry Alert */}
        {(isExpired || isExpiringSoon) && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              isExpired
                ? 'bg-red-500/20 border border-red-500/50 text-red-200'
                : 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-200'
            }`}
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              {isExpired ? (
                <>
                  <strong>Sua assinatura expirou!</strong>
                  <p className="text-sm opacity-80">Renove agora para continuar aproveitando os beneficios.</p>
                </>
              ) : (
                <>
                  <strong>Sua assinatura expira em {daysUntilExpiry} dias</strong>
                  <p className="text-sm opacity-80">Renove agora e nao perca seus beneficios.</p>
                </>
              )}
            </div>
            <Button variant="warning" size="sm" onClick={() => setModal('renew')}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Renovar
            </Button>
          </div>
        )}

        {/* Hero Card */}
        <div className="mb-6">
          <MemberHeroCard member={member} onEditProfile={() => setModal('profile')} />
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="overview">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Visao Geral</TabsTrigger>
            <TabsTrigger value="points">Pontos</TabsTrigger>
            <TabsTrigger value="subscription">Assinatura</TabsTrigger>
            <TabsTrigger value="history">Historico</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <DashboardOverviewTab
              member={member}
              onRenew={() => setModal('renew')}
              onUpgrade={() => setModal('upgrade')}
            />
          </TabsContent>

          <TabsContent value="points">
            <DashboardPointsTab
              member={member}
              pointsHistory={pointsHistory}
              expiringPoints={expiringPoints}
              loadingPoints={loadingPoints}
            />
          </TabsContent>

          <TabsContent value="subscription">
            <DashboardSubscriptionTab
              member={member}
              subscription={subscription}
              onSubscriptionChange={fetchMemberData}
            />
          </TabsContent>

          <TabsContent value="history">
            <DashboardHistoryTab
              member={member}
              contract={contract}
              onEditProfile={() => setModal('profile')}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Modals — lazy-loaded */}
      <Suspense fallback={null}>
        {modal === 'renew' && (
          <RenewModal member={member} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />
        )}
        {modal === 'upgrade' && (
          <UpgradeModal member={member} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />
        )}
        {modal === 'profile' && (
          <ProfileEditModal member={member} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />
        )}
      </Suspense>
    </div>
  )
}
