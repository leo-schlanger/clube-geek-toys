import type { ComponentType, ReactNode } from 'react'
import { ChevronRight, FileText, History, UserRound } from 'lucide-react'
import { AccountSection } from './AccountSection'
import { SubscriptionCard } from './SubscriptionCard'
import { MemberActivityHistory } from '../MemberActivityHistory'
import { CLUB_PLAN, type Contract, type Member, type Subscription } from '../../types'
import { formatCurrency } from '../../lib/utils'

function Row({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <details className="group border-b border-border last:border-b-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <div className="px-2 pb-4 pt-1 sm:px-4">{children}</div>
    </details>
  )
}

/** Account details, collapsed: data, contract and history open on demand. */
export function MemberAccount({
  member,
  contract,
  subscription,
  showEarlyRenew,
  onEditProfile,
  onRenew,
  onSubscriptionChange,
}: {
  member: Member
  contract: Contract | null
  subscription: Subscription | null
  showEarlyRenew: boolean
  onEditProfile: () => void
  onRenew: () => void
  onSubscriptionChange: () => void
}) {
  return (
    <section aria-label="Conta" className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      <Row icon={UserRound} title="Meus dados" subtitle="E-mail, telefone, plano">
        <div className="space-y-3">
          <p className="px-2 text-sm text-muted-foreground">
            Plano: {member.paymentType === 'annual' ? `Anual · ${formatCurrency(CLUB_PLAN.price)}` : 'Mensal'}
          </p>
          <AccountSection member={member} contract={contract} onEditProfile={onEditProfile} only="data" />
          {/* Only legacy monthly members still have a recurring subscription */}
          {subscription && (
            <SubscriptionCard member={member} subscription={subscription} onSubscriptionChange={onSubscriptionChange} />
          )}
          {showEarlyRenew && (
            <button
              type="button"
              onClick={onRenew}
              className="inline-flex min-h-11 items-center px-2 text-sm font-semibold underline decoration-primary decoration-2 underline-offset-4"
            >
              Renovar antes do prazo
            </button>
          )}
        </div>
      </Row>
      <Row icon={FileText} title="Contrato" subtitle={contract ? 'Termo de adesão assinado' : 'Termo de adesão do clube'}>
        <AccountSection member={member} contract={contract} onEditProfile={onEditProfile} only="contract" />
      </Row>
      <Row icon={History} title="Histórico" subtitle="O que aconteceu na sua conta">
        <MemberActivityHistory limit={5} />
      </Row>
    </section>
  )
}
