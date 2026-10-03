import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CLUB_PLAN, MEMBER_DISCOUNT_PERCENT } from '../types'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardFooter } from '../components/ui/card'
import { formatCurrency } from '../lib/utils'
import { getShopUrl } from '../lib/subdomain'
import {
  CLUB_BREAK_EVEN_SPEND,
  CLUB_MONTHLY_EQUIVALENT,
  DEFAULT_TICKET_PRICE,
  MEMBER_TICKET_DISCOUNT_PERCENT,
  estimateClubYear,
  memberSavingsOn,
} from '../lib/club-value'
import { useActiveEvent } from '../hooks/useActiveEvent'
import {
  Check,
  Sparkles,
  ArrowRight,
  Shield,
  Zap,
  Gift,
  CreditCard,
  ShoppingBag,
  Ticket,
  QrCode,
  Calculator,
  ChevronDown,
} from 'lucide-react'
import { motion } from 'framer-motion'
import RadioMiniPlayer from '../components/RadioMiniPlayer'
import { CreatorCredit } from '../components/CreatorCredit'

const SIGNUP_PATH = '/cadastro?plano=club&tipo=annual'

/** Illustrative baskets for the "money left on the table" strip. */
const EXAMPLES = [
  { label: 'Um photocard', price: 35 },
  { label: 'Um álbum', price: 150 },
  { label: 'Um lightstick', price: 300 },
]

export default function Subscribe() {
  const shopUrl = getShopUrl()
  const { event } = useActiveEvent()
  const ticketPrice = event.priceCents ? event.priceCents / 100 : DEFAULT_TICKET_PRICE

  const price = formatCurrency(CLUB_PLAN.price)
  const perMonth = formatCurrency(CLUB_MONTHLY_EQUIVALENT)

  const benefits = [
    {
      icon: <ShoppingBag className="h-6 w-6 text-primary" />,
      title: `${MEMBER_DISCOUNT_PERCENT}% em qualquer produto`,
      desc: 'Na loja física e na online. Sem cupom para lembrar: entrou na sua conta, o desconto aparece sozinho.',
    },
    {
      icon: <Ticket className="h-6 w-6 text-accent" />,
      title: `${MEMBER_TICKET_DISCOUNT_PERCENT}% nos ingressos`,
      desc: `Os eventos de K-pop e cultura geek da GeekPop pela metade do preço. Um ingresso de ${formatCurrency(ticketPrice)} sai por ${formatCurrency(ticketPrice / 2)}.`,
    },
    {
      icon: <Gift className="h-6 w-6 text-primary" />,
      title: 'Brinde na primeira compra',
      desc: 'Um mimo geek para estrear a carteirinha, na loja física ou na online.',
    },
    {
      icon: <QrCode className="h-6 w-6 text-accent" />,
      title: 'Carteirinha digital',
      desc: 'Fica no celular, com QR Code. Mostrou no caixa, o desconto está garantido.',
    },
    {
      icon: <Zap className="h-6 w-6 text-primary" />,
      title: 'Vale na hora',
      desc: 'Pagou, ativou. O PIX confirma sozinho em segundos, e a próxima compra já sai com desconto.',
    },
  ]

  const faq = [
    {
      q: 'Preciso pagar todo mês?',
      a: `Não. É um pagamento só, de ${price}, que vale por 12 meses. Dá ${perMonth} por mês, sem mensalidade para lembrar.`,
    },
    {
      q: 'E se eu me arrepender?',
      a: 'Você tem 7 dias, a contar da assinatura, para desistir e receber 100% do valor de volta, sem precisar explicar o motivo.',
    },
    {
      q: 'Renova sozinho?',
      a: 'No cartão, renova a cada 12 meses e avisamos por e-mail antes da cobrança. Dá para desligar a renovação quando quiser, e os benefícios seguem até o fim do ano pago. No PIX não renova sozinho: você decide se continua.',
    },
    {
      q: 'O desconto vale na loja física?',
      a: 'Vale. Mostre a carteirinha digital ou informe seu CPF no caixa.',
    },
    {
      q: 'Soma com outras promoções?',
      a: 'Não soma. Quando houver outra promoção, vale o maior desconto, então ser membro nunca faz você pagar mais.',
    },
    {
      q: 'Posso parcelar?',
      a: 'O plano é pago à vista, no PIX ou no cartão de crédito.',
    },
  ]

  return (
    <div className="min-h-screen bg-background overflow-x-hidden pb-20 sm:pb-0">
      {/* Header */}
      <header className="glass border-b border-border/50 sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-vip.png" alt="GeekPop & Toys" className="h-10 sm:h-12" />
          </Link>
          <div className="flex items-center gap-3">
            <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground hidden sm:inline transition-colors">
              Visite a loja
            </a>
            <Link to="/login">
              <Button variant="outline" size="sm" className="border-primary/50 hover:border-primary text-xs sm:text-sm">
                Entrar
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero-glow relative py-14 sm:py-20 md:py-24 px-4 sm:px-6 text-center">
        <div className="relative z-10 max-w-3xl mx-auto">
          <motion.div
            className="mb-4"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <img
              src="/logo-vip.png"
              alt="Clube GeekPop & Toys"
              className="w-52 sm:w-64 md:w-80 mx-auto drop-shadow-[0_0_40px_rgba(240,64,128,0.35)]"
              width="1536"
              height="1024"
              loading="eager"
              style={{ aspectRatio: '3/2', objectFit: 'contain' }}
            />
          </motion.div>

          <motion.h1
            className="font-heading text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight mb-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Pague menos em tudo o que você ama.{' '}
            <span className="text-shimmer">O ano inteiro.</span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <p className="text-base sm:text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
              {MEMBER_DISCOUNT_PERCENT}% de desconto em qualquer produto, metade do preço nos eventos e brinde
              na primeira compra. Tudo por <strong className="text-foreground">{price} no ano</strong>, o
              equivalente a <strong className="text-primary">{perMonth} por mês</strong>.
            </p>

            <a href="#plano">
              <Button size="lg" className="btn-glow font-bold text-base px-8 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
                QUERO SER MEMBRO
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-green-500" /> Garantia de 7 dias</span>
              <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Ativação imediata</span>
              <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-accent" /> PIX ou cartão</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Money left on the table */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 border-t border-border/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold mb-2">
            Toda compra sem o clube deixa dinheiro na mesa
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mb-8">
            A cada R$ 100 em compras, R$ {MEMBER_DISCOUNT_PERCENT} poderiam ter ficado com você.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {EXAMPLES.map((ex) => (
              <div key={ex.label} className="rounded-xl border border-border/40 bg-card/50 p-5">
                <p className="text-sm text-muted-foreground">{ex.label} de {formatCurrency(ex.price)}</p>
                <p className="mt-1 text-2xl font-bold">
                  {formatCurrency(ex.price - memberSavingsOn(ex.price))}
                </p>
                <p className="text-xs font-semibold text-green-400">
                  você guarda {formatCurrency(memberSavingsOn(ex.price))}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 border-t border-border/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-center mb-8">O que você leva</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {benefits.map((b, i) => (
              <motion.div
                key={b.title}
                className="flex items-start gap-4 p-5 rounded-xl bg-card/50 border border-border/30 hover:border-primary/30 transition-colors"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <div className="p-2 rounded-lg bg-background shrink-0">{b.icon}</div>
                <div>
                  <h3 className="font-semibold mb-0.5">{b.title}</h3>
                  <p className="text-sm text-muted-foreground">{b.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Calculator */}
      <SavingsCalculator ticketPrice={ticketPrice} />

      {/* Plan */}
      <section id="plano" className="py-12 sm:py-16 px-4 sm:px-6 border-t border-border/30 scroll-mt-20">
        <div className="text-center mb-8">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold mb-2">Plano do Clube</h2>
          <p className="text-sm text-muted-foreground">Um plano só, anual, com tudo incluso.</p>
        </div>

        <motion.div
          className="max-w-md mx-auto"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
        >
          <Card className="relative overflow-hidden flex flex-col ring-2 ring-primary/50 shadow-lg shadow-primary/10">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary via-primary/80 to-accent text-primary-foreground">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{CLUB_PLAN.name}</h3>
                  <span className="text-green-400 font-semibold text-sm">{CLUB_PLAN.discount}% em qualquer produto</span>
                </div>
              </div>

              <div className="mb-1">
                <span className="text-4xl font-extrabold">{price}</span>
                <span className="text-sm text-muted-foreground ml-1">/ano</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Equivale a {perMonth}/mês · pagamento único, à vista
              </p>
            </div>

            <CardContent className="px-6 pb-4 flex-grow">
              <ul className="space-y-2.5">
                {[
                  ...CLUB_PLAN.benefits,
                  'Carteirinha digital com QR Code',
                  'Desconto na loja física e na online',
                  'Garantia de 7 dias com reembolso integral',
                ].map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2.5 text-sm">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{benefit}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="p-6 pt-0 flex-col gap-2">
              <Link to={SIGNUP_PATH} className="w-full">
                <Button className="w-full h-11 font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
                  ASSINAR POR {price} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <p className="text-[11px] text-muted-foreground text-center">
                Só com o desconto de {MEMBER_DISCOUNT_PERCENT}%, o clube se paga com{' '}
                {formatCurrency(CLUB_BREAK_EVEN_SPEND)} em compras no ano. Os ingressos encurtam essa conta.
              </p>
            </CardFooter>
          </Card>
        </motion.div>
      </section>

      {/* Guarantee */}
      <section className="py-12 px-4 sm:px-6 border-t border-border/30">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-green-500/30 bg-green-500/5 p-6 text-center sm:text-left">
          <div className="p-4 rounded-full bg-green-500/10 border border-green-500/20 shrink-0">
            <Shield className="h-8 w-8 text-green-500" />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold mb-1">Risco zero: 7 dias para desistir</h2>
            <p className="text-sm text-muted-foreground">
              Assinou e não curtiu? Peça em até 7 dias e devolvemos 100% do valor, sem precisar explicar o
              motivo. Quem decide se vale a pena é você, depois de experimentar.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 border-t border-border/30">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-center mb-8">Perguntas frequentes</h2>
          <div className="space-y-3">
            {faq.map((item) => (
              <details key={item.q} className="group rounded-xl border border-border/40 bg-card/50 px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {item.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final call */}
      <section className="py-14 sm:py-20 px-4 sm:px-6 border-t border-border/30 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-heading text-2xl sm:text-4xl font-extrabold mb-3">
            Sua próxima compra já pode sair {MEMBER_DISCOUNT_PERCENT}% mais barata
          </h2>
          <p className="text-muted-foreground mb-6">
            {price} por um ano inteiro de vantagens. Ativa na hora, com 7 dias de garantia.
          </p>
          <Link to={SIGNUP_PATH}>
            <Button size="lg" className="btn-glow font-bold text-base px-8 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
              ENTRAR PARA O CLUBE
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-green-500" /> Pagamento seguro</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-green-500" /> Sem mensalidade</span>
            <span className="flex items-center gap-1.5"><ShoppingBag className="h-3.5 w-3.5 text-primary" /> {MEMBER_DISCOUNT_PERCENT}% desde o 1º dia</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 text-center border-t border-border/30">
        <div className="flex justify-center mb-4">
          <img src="/logo-vip.png" alt="GeekPop & Toys" className="h-16 drop-shadow-[0_0_15px_rgba(212,165,32,0.2)]" />
        </div>
        <p className="text-xs text-muted-foreground mb-1">club.geeketoys.com.br</p>
        <p className="text-muted-foreground text-xs">&copy; 2026 GeekPop & Toys. Todos os direitos reservados.</p>
        <CreatorCredit className="mt-2" />
        <p className="mt-3 text-xs flex flex-wrap justify-center gap-3">
          <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            Visite a loja
          </a>
          <Link to="/termos" className="text-muted-foreground hover:text-foreground">Termos</Link>
          <Link to="/privacidade" className="text-muted-foreground hover:text-foreground">Privacidade</Link>
        </p>
      </footer>

      {/* Sticky call on phones; the radio pill sits above it (bottom-20). */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 glass px-4 py-3 sm:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="leading-tight">
            <p className="text-sm font-bold">{price}<span className="text-xs font-normal text-muted-foreground">/ano</span></p>
            <p className="text-[11px] text-muted-foreground">= {perMonth}/mês · 7 dias de garantia</p>
          </div>
          <Link to={SIGNUP_PATH}>
            <Button size="sm" className="font-bold bg-primary text-primary-foreground hover:bg-primary/90">
              Assinar <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <RadioMiniPlayer />
    </div>
  )
}

function SavingsCalculator({ ticketPrice }: { ticketPrice: number }) {
  const [monthlySpend, setMonthlySpend] = useState(150)
  const [tickets, setTickets] = useState(2)
  const year = estimateClubYear({ monthlySpend, tickets, ticketPrice })
  const paysOff = year.net >= 0
  // Extra monthly spend that closes the gap, rounded up to the next R$ 5.
  const extraPerMonth = paysOff
    ? 0
    : Math.ceil(-year.net / (MEMBER_DISCOUNT_PERCENT / 100) / 12 / 5) * 5

  return (
    <section className="py-12 sm:py-16 px-4 sm:px-6 border-t border-border/30">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            <Calculator className="h-3.5 w-3.5" />
            Faça a conta
          </span>
          <h2 className="font-heading text-2xl sm:text-3xl font-bold mt-3">O clube se paga para você?</h2>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card/50 p-5 sm:p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <label htmlFor="calc-spend" className="font-medium">Quanto você gasta por mês na GeekPop</label>
              <span className="font-bold tabular-nums">{formatCurrency(monthlySpend)}</span>
            </div>
            <input
              id="calc-spend"
              type="range"
              min={0}
              max={600}
              step={10}
              value={monthlySpend}
              onChange={(e) => setMonthlySpend(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <label htmlFor="calc-tickets" className="font-medium">Ingressos de evento por ano</label>
              <span className="font-bold tabular-nums">{tickets}</span>
            </div>
            <input
              id="calc-tickets"
              type="range"
              min={0}
              max={12}
              step={1}
              value={tickets}
              onChange={(e) => setTickets(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Considerando ingresso de {formatCurrency(ticketPrice)}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Desconto na loja</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(year.shopSavings)}</p>
            </div>
            <div className="rounded-xl bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Desconto nos ingressos</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(year.ticketSavings)}</p>
            </div>
          </div>

          <div
            className={`rounded-xl p-4 text-center ${paysOff ? 'border border-green-500/30 bg-green-500/10' : 'border border-accent/30 bg-accent/10'}`}
            aria-live="polite"
          >
            <p className="text-sm text-muted-foreground">Você economiza no ano</p>
            <p className="text-3xl font-extrabold tabular-nums">{formatCurrency(year.totalSavings)}</p>
            {paysOff ? (
              <p className="mt-1 text-sm font-semibold text-green-400">
                O clube se paga e ainda sobram {formatCurrency(year.net)} no seu bolso.
              </p>
            ) : (
              <p className="mt-1 text-sm">
                Faltam {formatCurrency(-year.net)} para o clube se pagar: cerca de{' '}
                {formatCurrency(extraPerMonth)} a mais em compras por mês, ou mais ingressos.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
