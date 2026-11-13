import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { logger } from '../lib/logger'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { LoadingPage } from '../components/ui/loading'
import { PendingPaymentScreen } from '../components/PendingPaymentScreen'
import { WelcomeCelebration } from '../components/member/WelcomeCelebration'
import { NonoMascot } from '../components/store/NonoMascot'
import { isWelcomePending } from '../lib/welcome'
import { BenefitsSection } from '../components/member/BenefitsSection'
import { MembershipCard } from '../components/member/MembershipCard'
import { CardQrDialog } from '../components/member/CardQrDialog'
import { StatusChip } from '../components/member/StatusChip'
import { MemberDiscount } from '../components/member/MemberDiscount'
import { MemberEvents } from '../components/member/MemberEvents'
import { MemberOrders } from '../components/member/MemberOrders'
import { MemberAccount } from '../components/member/MemberAccount'
import { RenewNotice } from '../components/member/RenewNotice'
import { SectionErrorBoundary } from '../components/ui/section-error-boundary'
import { cardChipLabel, cardState, civilDayMonth, formatMemberNumber, longDate, plural } from '../lib/member-card-state'
import { formatCurrency } from '../lib/utils'
import { CLUB_PLAN, MEMBER_DISCOUNT_PERCENT } from '../types'
import type { Member, Subscription, Contract } from '../types'
import { getMemberByUserId } from '../lib/members'
import { getMemberContract } from '../lib/contract-storage'
import { getActiveSubscriptionByMemberId } from '../lib/subscriptions'
import { toast } from 'sonner'
import {
  LogOut,
  Settings,
  RefreshCw,
  AlertTriangle,
  Mail,
  UserRound,
} from 'lucide-react'
import { ThemeToggle } from '../components/ThemeToggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { NatalBannerSlot, NatalLightsSlot } from '../components/seasonal/natal'

// Modals are lazy-loaded — they're rarely opened, no need to ship them in the main bundle.
const RenewModal = lazy(() => import('../components/RenewModal').then(m => ({ default: m.RenewModal })))
const ProfileEditModal = lazy(() => import('../components/ProfileEditModal').then(m => ({ default: m.ProfileEditModal })))

type ModalType = 'renew' | 'profile' | null

export default function MemberDashboard() {
  const { user, signOut, emailVerified, sendVerificationEmail } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalType>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const cardAnchor = useRef<HTMLDivElement>(null)
  const qrButton = useRef<HTMLButtonElement>(null)

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
        const [sub, memberContract] = await Promise.all([
          getActiveSubscriptionByMemberId(memberData.id),
          getMemberContract(memberData.id),
        ])
        setSubscription(sub)
        setContract(memberContract)
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
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </Button>
            <Button variant="outline" onClick={signOut} className="w-full">
              <LogOut className="h-4 w-4" />
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
              <img src="/logo-vip.png" alt="Clube GeekPop & Toys" className="w-40 mx-auto" />
            </div>
            <div className="mx-auto mb-2">
              <NonoMascot pose="wave" size={104} />
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
              <LogOut className="h-4 w-4" />
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

  const welcomePending = !welcomeDismissed && isWelcomePending(member)
  const state = cardState(member)
  const paused = state.kind === 'expired'
  const firstName = member.fullName?.split(' ')[0] || 'membro'

  const viewCard = () => {
    cardAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    qrButton.current?.focus({ preventScroll: true })
  }

  const chipTone = state.kind === 'expired' ? 'destructive' : state.kind === 'soon' ? 'warning' : 'success'

  // Left column on desktop (sticky): card, chip, QR, discount
  const cardColumn = (
    <div className="space-y-4 lg:sticky lg:top-[88px]">
      <div ref={cardAnchor} className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sua carteirinha</p>
        {/* One Nono per screen: the welcome's heart while it shows, else the card's. */}
        <MembershipCard
          ref={qrButton}
          member={member}
          showMascot={!welcomePending}
          paused={paused}
          onShowQr={() => setQrOpen(true)}
          below={
            <div className="space-y-1">
              <StatusChip tone={chipTone}>{cardChipLabel(state)}</StatusChip>
              <p className="text-sm text-muted-foreground">Válida até {longDate(member.expiryDate)}</p>
            </div>
          }
        />
      </div>
      <MemberDiscount paused={paused} />
    </div>
  )

  return (
    <div className="min-h-screen bg-background pb-10">
      <NatalBannerSlot variant="club-member" />
      {/* Header */}
      <header className="glass border-b border-border sticky top-0 z-40">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-2 lg:px-8">
          <div className="flex items-center gap-3">
            <img src="/logo-vip.png" alt="GeekPop & Toys" className="h-10" />
            <span className="font-heading text-lg font-bold text-foreground">Clube</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle variant="icon" />
            {/* Sign out lives in the menu: a bare icon next to the others was too easy to hit by mistake */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Menu da conta" title="Menu da conta">
                  <UserRound className="h-5 w-5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setModal('profile')}>
                  <Settings className="h-4 w-4" aria-hidden />
                  Meu perfil
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setModal('renew')}>
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Renovar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => signOut()}>
                  <LogOut className="h-4 w-4" aria-hidden />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <NatalLightsSlot />
      </header>

      <main className="mx-auto max-w-[1120px] space-y-4 px-4 py-5 lg:space-y-6 lg:px-8">
        <div>
          <h1 className="font-heading text-[26px] font-extrabold leading-tight lg:text-[30px]">Olá, {firstName}</h1>
          <p className="text-sm text-muted-foreground">
            {paused ? 'Sua carteirinha está vencida.' : 'Sua carteirinha e seus descontos, tudo aqui.'}
          </p>
        </div>

        {/* Email Verification Banner */}
        {!emailVerified && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
            <Mail className="h-5 w-5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-sm">
              <strong>Verifique seu email</strong> — Confirme para garantir acesso completo à sua conta.
            </p>
            <Button
              variant="outline"
              className="h-11"
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

        {/* One notice at a time, above the card */}
        {paused ? (
          <RenewNotice
            tone="destructive"
            title={`Sua carteirinha venceu em ${civilDayMonth(member.expiryDate)}`}
            text={`O desconto de ${MEMBER_DISCOUNT_PERCENT}% e a meia nos eventos estão pausados. Renove por ${formatCurrency(CLUB_PLAN.price)} e volta na hora.`}
            onRenew={() => setModal('renew')}
          />
        ) : state.kind === 'soon' ? (
          <RenewNotice
            tone="warning"
            title={state.days === 0 ? 'Sua carteirinha vence hoje' : `Sua carteirinha vence em ${plural(state.days, 'dia', 'dias')}`}
            text="Renove agora: o novo ano começa no fim do atual, sem perder nenhum dia."
            onRenew={() => setModal('renew')}
          />
        ) : (
          welcomePending && (
            <WelcomeCelebration
              memberName={member.fullName}
              memberId={member.id}
              onDismiss={() => setWelcomeDismissed(true)}
              onViewCard={viewCard}
            />
          )
        )}

        <div className="grid gap-4 lg:grid-cols-[420px_1fr] lg:items-start lg:gap-6">
          <div className="min-w-0">{cardColumn}</div>
          <div className="min-w-0 space-y-4 lg:space-y-6">
            <SectionErrorBoundary fallbackMessage="Não deu para carregar os eventos agora.">
              <MemberEvents paused={paused} />
            </SectionErrorBoundary>
            <SectionErrorBoundary fallbackMessage="Não deu para carregar suas compras agora.">
              <MemberOrders />
            </SectionErrorBoundary>
            <BenefitsSection />
            <MemberAccount
              member={member}
              contract={contract}
              subscription={subscription}
              showEarlyRenew={state.kind === 'active'}
              onEditProfile={() => setModal('profile')}
              onRenew={() => setModal('renew')}
              onSubscriptionChange={fetchMemberData}
            />
          </div>
        </div>
      </main>

      <CardQrDialog
        open={qrOpen && !paused}
        onOpenChange={setQrOpen}
        memberId={member.id}
        fullName={member.fullName}
        displayNumber={formatMemberNumber(member.id).replace(/\s+/g, ' ')}
        expiryDate={member.expiryDate}
      />

      {/* Modals — lazy-loaded */}
      <Suspense fallback={null}>
        {modal === 'renew' && (
          <RenewModal member={member} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />
        )}
        {modal === 'profile' && (
          <ProfileEditModal member={member} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />
        )}
      </Suspense>
    </div>
  )
}
