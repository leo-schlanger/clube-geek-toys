import { Link } from 'react-router-dom'
import { ArrowRight, BadgePercent, Store, Ticket } from 'lucide-react'
import { Button } from '../ui/button'
import { NonoMascot } from './NonoMascot'
import { MEMBER_DISCOUNT_PERCENT } from '../../types'
import { MEMBER_TICKET_DISCOUNT_PERCENT, clubSignupUrl } from '../../lib/club-value'
import { getSubdomainUrl } from '../../lib/subdomain'
import { cn } from '../../lib/utils'

interface ClubHeroCallProps {
  isMember: boolean
  /** Membership still loading: keep the box's height, show nothing yet. */
  loading?: boolean
  /** Off when another Nono is on the screen (one per screen). */
  showMascot?: boolean
  className?: string
}

/**
 * Club call in the shop hero. Nono sits here, so no price: the bubble and the
 * box carry no R$ figure (CONANDA 163/2014); the price lives in ClubHomePitch.
 */
export function ClubHeroCall({ isMember, loading = false, showMascot = true, className }: ClubHeroCallProps) {
  return (
    <section
      aria-labelledby="club-hero-title"
      aria-busy={loading || undefined}
      className={cn(
        // Phone: a divider inside the hero, not a nested box (saves the padding).
        'border-t border-accent/40 pt-4 sm:rounded-2xl sm:border sm:bg-card/80 sm:p-5 sm:shadow-xs',
        loading && 'invisible',
        className,
      )}
    >
      {isMember ? <MemberContent showMascot={showMascot} /> : <GuestContent showMascot={showMascot} />}
    </section>
  )
}

function GuestContent({ showMascot }: { showMascot: boolean }) {
  return (
    <>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-pink-700 dark:text-primary">Clube GeekPop &amp; Toys</p>
          <h2 id="club-hero-title" className="mt-1 font-heading text-lg font-bold leading-snug sm:text-xl">
            Associe-se e tenha vantagens incríveis
          </h2>
        </div>
        {showMascot && (
          <div className="flex shrink-0 flex-col items-center" data-testid="club-hero-nono">
            <p
              className="mb-1 rounded-xl rounded-br-sm border border-primary/30 bg-background px-2.5 py-1 text-xs font-semibold shadow-xs"
              role="note"
              aria-label="Nono, o tigre da GeekPop, diz: Vem pro clube!"
            >
              Vem pro clube!
            </p>
            <NonoMascot pose="standing" size={64} decorative eager />
          </div>
        )}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        <li className="flex items-center gap-2">
          <BadgePercent className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong>{MEMBER_DISCOUNT_PERCENT}% de desconto</strong> em qualquer produto
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Ticket className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong>Meia-entrada</strong> ({MEMBER_TICKET_DISCOUNT_PERCENT}%) nos eventos
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Store className="h-4 w-4 shrink-0 text-primary" />
          <span>Vale no site e na loja física</span>
        </li>
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* Dark text on the pink in both themes: white on #F04080 is 3.7:1. */}
        <Button asChild size="lg" className="min-h-11 gap-2 px-4 text-accent-foreground">
          <a href={clubSignupUrl()}>
            Quero ser membro
            <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
        <Link
          to="/entrar"
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
        >
          Sou membro: entrar
        </Link>
      </div>
    </>
  )
}

function MemberContent({ showMascot }: { showMascot: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-500">
          Membro do clube
        </p>
        <h2 id="club-hero-title" className="mt-1 font-heading text-lg font-bold leading-snug sm:text-xl">
          Seu desconto de membro já está ativo
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Os preços com {MEMBER_DISCOUNT_PERCENT}% a menos já aparecem nos produtos, e o desconto entra sozinho no
          checkout.
        </p>
        <a
          href={`${getSubdomainUrl('member')}/membro`}
          className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-pink-700 hover:underline dark:text-primary"
        >
          Ver minha carteirinha
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
      {showMascot && (
        <div className="shrink-0" data-testid="club-hero-nono">
          <NonoMascot pose="heart" size={72} decorative eager />
        </div>
      )}
    </div>
  )
}

export default ClubHeroCall
