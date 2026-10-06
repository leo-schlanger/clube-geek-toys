import { Link } from 'react-router-dom'
import { ArrowRight, Shield, ShoppingBag, Sparkles, Ticket } from 'lucide-react'
import { Button } from '../ui/button'
import { CLUB_PLAN, MEMBER_DISCOUNT_PERCENT } from '../../types'
import { formatCurrency } from '../../lib/utils'
import {
  CLUB_BREAK_EVEN_SPEND,
  CLUB_MONTHLY_EQUIVALENT,
  MEMBER_TICKET_DISCOUNT_PERCENT,
  clubSignupUrl,
  memberSavingsOn,
} from '../../lib/club-value'

/** Checkout nudge for a non-member: what this very order would have saved. */
export function ClubCheckoutPitch({ subtotal }: { subtotal: number }) {
  const savings = memberSavingsOn(subtotal)

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-2">
      <p className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <span>
          {savings > 0 ? (
            <>
              Membros do clube pagariam <strong className="text-primary">{formatCurrency(savings)} a menos</strong>{' '}
              neste pedido.
            </>
          ) : (
            <>Membros do clube ganham {MEMBER_DISCOUNT_PERCENT}% de desconto em qualquer produto.</>
          )}{' '}
          O clube custa {formatCurrency(CLUB_PLAN.price)} por ano ({formatCurrency(CLUB_MONTHLY_EQUIVALENT)}/mês), com
          7 dias de garantia.
        </span>
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6">
        <a href={clubSignupUrl()} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
          Conhecer o clube
        </a>
        <Link to="/entrar" className="text-muted-foreground hover:text-foreground">
          Já sou membro: entrar
        </Link>
      </div>
    </div>
  )
}

/** Shop home section that makes the case for joining. */
export function ClubHomePitch() {
  return (
    <section className="mb-8 rounded-2xl border border-accent/30 bg-linear-to-br/srgb from-accent/10 via-background to-primary/10 p-6 sm:p-8">
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            Clube GeekPop & Toys
          </span>
          <h2 className="mt-3 font-heading text-xl font-bold sm:text-2xl">
            Vale a pena ser membro? Faça a conta.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Por {formatCurrency(CLUB_PLAN.price)} no ano, o equivalente a{' '}
            <strong className="text-foreground">{formatCurrency(CLUB_MONTHLY_EQUIVALENT)} por mês</strong>, você paga{' '}
            {MEMBER_DISCOUNT_PERCENT}% menos em tudo, aqui e na loja física. Quem gasta{' '}
            {formatCurrency(Math.ceil(CLUB_BREAK_EVEN_SPEND / 12))} por mês já paga o clube só com o desconto, e os
            ingressos pela metade encurtam essa conta.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 shrink-0 text-primary" />
              Um álbum de R$ 150 sai por {formatCurrency(150 - memberSavingsOn(150))}
            </li>
            <li className="flex items-center gap-2">
              <Ticket className="h-4 w-4 shrink-0 text-accent" />
              {MEMBER_TICKET_DISCOUNT_PERCENT}% nos ingressos dos eventos
            </li>
            <li className="flex items-center gap-2">
              <Shield className="h-4 w-4 shrink-0 text-green-500" />
              7 dias para desistir com reembolso integral
            </li>
          </ul>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-center md:text-center">
          <p className="text-3xl font-extrabold">
            {formatCurrency(CLUB_PLAN.price)}
            <span className="text-sm font-normal text-muted-foreground">/ano</span>
          </p>
          <Button asChild className="gap-2">
            <a href={clubSignupUrl()} target="_blank" rel="noopener noreferrer">
              Quero ser membro
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Link to="/entrar" className="text-xs text-muted-foreground hover:text-foreground">
            Já sou membro: entrar
          </Link>
        </div>
      </div>
    </section>
  )
}
