import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { logger } from '../lib/logger'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { LoadingPage } from '../components/ui/loading'
import { PendingPaymentScreen } from '../components/PendingPaymentScreen'
import { MembershipCard } from '../components/member/MembershipCard'
import { DiscountStrip } from '../components/member/DiscountStrip'
import { PointsSummaryBar } from '../components/member/PointsSummaryBar'
import { QuickActions } from '../components/member/QuickActions'
import { OnboardingGuide } from '../components/member/OnboardingGuide'
import { BenefitsSection } from '../components/member/BenefitsSection'
import { SubscriptionCard } from '../components/member/SubscriptionCard'
import { PointsSection } from '../components/member/PointsSection'
import { AccountSection } from '../components/member/AccountSection'
import { MemberActivityHistory } from '../components/MemberActivityHistory'
import type { Member, PlanType, PointTransaction, Subscription, Contract } from '../types'
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
  Mail,
} from 'lucide-react'

// Modals are lazy-loaded — they're rarely opened, no need to ship them in the main bundle.
const RenewModal = lazy(() => import('../components/RenewModal').then(m => ({ default: m.RenewModal })))
const UpgradeModal = lazy(() => import('../components/UpgradeModal').then(m => ({ default: m.UpgradeModal })))
const ProfileEditModal = lazy(() => import('../components/ProfileEditModal').then(m => ({ default: m.ProfileEditModal })))

type ModalType = 'renew' | 'upgrade' | 'profile' | null

export default function MemberDashboard() {
  const { user, signOut, emailVerified, sendVerificationEmail } = useAuth()
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
      setFetchError('Não conseguimos carregar seus dados. Verifique sua conexão e tente novamente.')
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
              Você ainda não possui uma assinatura ativa. Assine agora e comece a aproveitar os benefícios!
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
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="glass border-b border-border sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-vip.png" alt="Geek & Toys VIP" className="h-10" />
            <span className="text-lg font-heading font-bold text-foreground hidden sm:block">Clube Geek & Toys</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setModal('profile')} title="Editar Perfil">
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Email Verification Banner */}
        {!emailVerified && (
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-3">
            <Mail className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-sm">
                <strong>Verifique seu email</strong> — Confirme para garantir acesso completo à sua conta.
              </p>
            </div>
            <Button
              size="sm"
              onClick={async () => {
                const result = await sendVerificationEmail()
                if (result.success) toast.success('Email de verificação enviado!')
                else toast.error(result.error || 'Erro ao enviar email')
              }}
            >
              Reenviar
            </Button>
          </div>
        )}

        {/* Expiry Alert */}
        {(isExpired || isExpiringSoon) && (
          <div
            className={`p-4 rounded-xl flex items-center gap-3 ${
              isExpired
                ? 'bg-destructive/15 border-2 border-destructive/50'
                : 'bg-warning/15 border-2 border-warning/50'
            }`}
          >
            <AlertTriangle className={`h-5 w-5 shrink-0 ${isExpired ? 'text-destructive animate-pulse' : 'text-warning'}`} />
            <div className="flex-1">
              {isExpired ? (
                <>
                  <strong>Sua assinatura expirou!</strong>
                  <p className="text-sm opacity-80">Renove agora para continuar aproveitando os benefícios.</p>
                </>
              ) : (
                <>
                  <strong>Faltam {daysUntilExpiry} dias para expirar</strong>
                  <p className="text-sm opacity-80">Renove agora e não perca seus benefícios.</p>
                </>
              )}
            </div>
            <Button variant="warning" size="sm" className="btn-glow shrink-0" onClick={() => setModal('renew')}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Renovar
            </Button>
          </div>
        )}

        {/* ═══ 1. Carteirinha Digital ═══ */}
        <MembershipCard member={member} />

        {/* ═══ 2. Faixa de Descontos ═══ */}
        <DiscountStrip plan={member.plan as PlanType} />

        {/* ═══ 3. Barra de Pontos ═══ */}
        <PointsSummaryBar member={member} expiringPoints={expiringPoints} />

        {/* ═══ 4. Ações Rápidas ═══ */}
        <QuickActions
          member={member}
          onRenew={() => setModal('renew')}
          onUpgrade={() => setModal('upgrade')}
          onEditProfile={() => setModal('profile')}
        />

        {/* ═══ 5. Guia de Boas-vindas ═══ */}
        <OnboardingGuide memberStartDate={member.startDate} />

        {/* ═══ 6. Benefícios ═══ */}
        <BenefitsSection plan={member.plan as PlanType} onUpgrade={() => setModal('upgrade')} />

        {/* ═══ 7. Assinatura ═══ */}
        <SubscriptionCard
          member={member}
          subscription={subscription}
          onSubscriptionChange={fetchMemberData}
        />

        {/* ═══ 8. Pontos (Resgate + Extrato) ═══ */}
        <PointsSection
          member={member}
          pointsHistory={pointsHistory}
          loadingPoints={loadingPoints}
        />

        {/* ═══ 9. Dados + Contrato ═══ */}
        <AccountSection
          member={member}
          contract={contract}
          onEditProfile={() => setModal('profile')}
        />

        {/* ═══ 10. Atividades Recentes ═══ */}
        <MemberActivityHistory memberId={member.id} limit={5} />
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
