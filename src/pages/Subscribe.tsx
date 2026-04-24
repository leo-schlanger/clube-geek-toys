import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardFooter } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { PLANS, type PlanType, type PaymentType } from '../types'
import { formatCurrency } from '../lib/utils'
import { Check, X, Crown, Star, Sparkles, ArrowRight, Shield, Zap, Gift, CreditCard } from 'lucide-react'
import { motion } from 'framer-motion'
import RadioMiniPlayer from '../components/RadioMiniPlayer'

export default function Subscribe() {
  const [paymentType, setPaymentType] = useState<PaymentType>('monthly')

  const planIcons = {
    silver: <Star className="h-7 w-7" />,
    gold: <Crown className="h-7 w-7" />,
    black: <Sparkles className="h-7 w-7" />,
  }

  const planGradients = {
    silver: 'from-slate-400 via-slate-300 to-slate-500',
    gold: 'from-yellow-400 via-amber-300 to-yellow-500',
    black: 'from-gray-600 via-gray-400 to-gray-600',
  }

  function getPrice(planId: PlanType) {
    const plan = PLANS[planId]
    return paymentType === 'monthly' ? plan.priceMonthly : plan.priceAnnual
  }

  function getMonthlyEquivalent(planId: PlanType) {
    return PLANS[planId].priceAnnual / 12
  }

  function getSavings(planId: PlanType) {
    const plan = PLANS[planId]
    return plan.priceMonthly * 12 - plan.priceAnnual
  }

  function getSavingsPercent(planId: PlanType) {
    const plan = PLANS[planId]
    const yearlyAtMonthly = plan.priceMonthly * 12
    return Math.round(((yearlyAtMonthly - plan.priceAnnual) / yearlyAtMonthly) * 100)
  }

  // Average savings across all plans for the toggle badge
  const avgSavingsPercent = Math.round(
    (Object.keys(PLANS) as PlanType[]).reduce((sum, id) => sum + getSavingsPercent(id), 0) / 3
  )

  // Feature comparison data
  const comparisonFeatures: { label: string; key: string }[] = [
    { label: 'Desconto em produtos', key: 'discountProducts' },
    { label: 'Desconto em servicos', key: 'discountServices' },
    { label: 'Acesso antecipado', key: 'earlyAccess' },
    { label: 'Sorteio mensal', key: 'raffle' },
    { label: 'Multiplicador de pontos', key: 'pointsMultiplier' },
  ]

  function getComparisonValue(planId: PlanType, key: string): string | boolean {
    const plan = PLANS[planId]
    switch (key) {
      case 'discountProducts': return `${plan.discountProducts}%`
      case 'discountServices': return `${plan.discountServices}%`
      case 'earlyAccess': return planId === 'gold' || planId === 'black'
      case 'raffle': return planId === 'black'
      case 'pointsMultiplier': return planId === 'silver' ? '1x' : planId === 'gold' ? '2x' : '3x'
      default: return false
    }
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <header className="glass border-b border-border/50 sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-vip.png" alt="Geek & Toys VIP" className="h-10 sm:h-12" />
          </Link>
          <div className="flex items-center gap-3">
            <a href="https://geeketoys.com.br" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground hidden sm:inline transition-colors">
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

      {/* Hero Section */}
      <section className="hero-glow relative py-16 sm:py-20 md:py-28 px-4 sm:px-6 text-center">
        {/* Floating sparkles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-primary/60"
              style={{
                top: `${15 + i * 14}%`,
                left: `${10 + i * 15}%`,
                animation: `sparkle ${2 + i * 0.5}s ${i * 0.3}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10">
          {/* Logo */}
          <motion.div
            className="animate-float mb-2 sm:mb-3"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <img
              src="/logo-vip.png"
              alt="Clube Geek & Toys VIP"
              className="w-64 sm:w-80 md:w-[420px] lg:w-[500px] mx-auto drop-shadow-[0_0_40px_rgba(212,165,32,0.35)]"
              width="1536"
              height="1024"
              loading="eager"
              style={{ aspectRatio: '3/2', objectFit: 'contain' }}
            />
          </motion.div>

          {/* Tagline */}
          <motion.h1
            className="text-xl sm:text-2xl md:text-3xl font-semibold text-muted-foreground mb-6 max-w-lg mx-auto"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            Seu universo geek com{' '}
            <span className="text-shimmer font-extrabold">vantagens VIP</span>
          </motion.h1>

          {/* Price tag + CTA */}
          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <span className="text-sm text-muted-foreground">
              A partir de <strong className="text-primary text-lg">R$ 19,90</strong>/mes
            </span>
            <a href="#planos">
              <Button size="lg" className="btn-glow font-bold text-base px-8 h-12 rounded-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black">
                ASSINE AGORA
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>
          </motion.div>

          {/* Trust badges */}
          <motion.div
            className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-green-500" /> Pagamento seguro</span>
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Ativacao imediata</span>
            <span className="flex items-center gap-1.5"><Gift className="h-3.5 w-3.5 text-purple-400" /> Acumulo de pontos</span>
            <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-blue-400" /> PIX ou cartao</span>
          </motion.div>
        </div>
      </section>

      {/* Payment Toggle */}
      <section id="planos" className="pt-8 sm:pt-12 px-4 sm:px-6 text-center scroll-mt-20">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">Escolha seu plano</h2>
        <p className="text-sm text-muted-foreground mb-6">Cancele quando quiser. Sem fidelidade.</p>

        {/* Pill Toggle */}
        <div className="inline-flex items-center relative bg-muted rounded-full p-1">
          {/* Sliding indicator */}
          <motion.div
            className="absolute top-1 bottom-1 rounded-full bg-primary shadow-lg"
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            style={{
              left: paymentType === 'monthly' ? '4px' : '50%',
              right: paymentType === 'annual' ? '4px' : '50%',
            }}
          />
          <button
            onClick={() => setPaymentType('monthly')}
            className={`relative z-10 px-5 sm:px-7 py-2.5 rounded-full text-sm font-semibold transition-colors ${
              paymentType === 'monthly'
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setPaymentType('annual')}
            className={`relative z-10 px-5 sm:px-7 py-2.5 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 ${
              paymentType === 'annual'
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Anual
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">
              Economize {avgSavingsPercent}%
            </span>
          </button>
        </div>
      </section>

      {/* Plans Grid */}
      <section className="py-8 sm:py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {(Object.keys(PLANS) as PlanType[]).map((planId, index) => {
            const plan = PLANS[planId]
            const isPopular = planId === 'gold'

            return (
              <motion.div
                key={planId}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ scale: 1.03 }}
              >
                <Card
                  className={`relative overflow-hidden transition-all duration-300 flex flex-col h-full group
                    hover:shadow-lg hover:shadow-primary/10 hover:border-primary/50
                    ${isPopular ? 'lg:-mt-4 lg:mb-4 ring-2 ring-primary/50' : ''}`}
                >
                  {/* "Mais Popular" badge — absolute top-right */}
                  {isPopular && (
                    <div className="absolute top-3 right-3 z-10">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gradient-to-r from-yellow-500 to-amber-500 text-black shadow-lg">
                        <Crown className="h-3 w-3" />
                        Mais Popular
                      </span>
                    </div>
                  )}

                  {/* Plan Header */}
                  <div className="p-5 sm:p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${planGradients[planId]} text-black/80`}>
                        {planIcons[planId]}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">{plan.name}</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-green-400 font-semibold text-sm">{plan.discountProducts}% produtos</span>
                          <span className="text-muted-foreground text-xs">|</span>
                          <span className="text-green-400 font-semibold text-sm">{plan.discountServices}% servicos{planId === 'black' ? '*' : ''}</span>
                        </div>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="mb-1">
                      <span className="text-3xl sm:text-4xl font-extrabold">{formatCurrency(getPrice(planId))}</span>
                      <span className="text-sm text-muted-foreground ml-1">
                        /{paymentType === 'monthly' ? 'mes' : 'ano'}
                      </span>
                    </div>
                    {paymentType === 'annual' && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">
                          = {formatCurrency(getMonthlyEquivalent(planId))}/mes
                        </p>
                        <Badge variant="success" className="text-[10px]">
                          Economia de {formatCurrency(getSavings(planId))}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Benefits */}
                  <CardContent className="px-5 sm:px-6 pb-4 flex-grow">
                    <ul className="space-y-2.5">
                      {plan.benefits.map((benefit, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm">
                          <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground group-hover:text-foreground transition-colors">{benefit}</span>
                        </li>
                      ))}
                      <li className="flex items-start gap-2.5 text-sm">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground group-hover:text-foreground transition-colors">Carteirinha digital com QR Code</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-sm">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground group-hover:text-foreground transition-colors">Programa de pontos ({planId === 'silver' ? '1x' : planId === 'gold' ? '2x' : '3x'} por real)</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-sm">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground group-hover:text-foreground transition-colors">Cancele quando quiser</span>
                      </li>
                    </ul>
                  </CardContent>

                  <CardFooter className="p-5 sm:p-6 pt-0">
                    <Link to={`/cadastro?plano=${planId}&tipo=${paymentType}`} className="w-full">
                      <Button
                        className="w-full h-11 font-semibold bg-gradient-to-r from-yellow-500 to-amber-600 text-black hover:from-yellow-400 hover:to-amber-500"
                      >
                        ASSINAR <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 border-t border-border/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">Compare os planos</h2>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm border-collapse min-w-[480px]">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Beneficio</th>
                  {(Object.keys(PLANS) as PlanType[]).map((planId) => (
                    <th key={planId} className="text-center py-3 px-3 font-semibold">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`p-1 rounded-md bg-gradient-to-br ${planGradients[planId]} text-black/80`}>
                          {planId === 'silver' ? <Star className="h-3.5 w-3.5" /> : planId === 'gold' ? <Crown className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                        </div>
                        {PLANS[planId].name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((feature, i) => (
                  <tr key={feature.key} className={`border-b border-border/20 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
                    <td className="py-3 px-3 text-muted-foreground">{feature.label}</td>
                    {(Object.keys(PLANS) as PlanType[]).map((planId) => {
                      const value = getComparisonValue(planId, feature.key)
                      return (
                        <td key={planId} className="text-center py-3 px-3">
                          {typeof value === 'boolean' ? (
                            value ? (
                              <Check className="h-5 w-5 text-green-500 mx-auto" />
                            ) : (
                              <X className="h-5 w-5 text-muted-foreground/40 mx-auto" />
                            )
                          ) : (
                            <span className="font-semibold text-foreground">{value}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            * No plano Black, o desconto em servicos passa a valer a partir do 2º pagamento.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 border-t border-border/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">Por que ser VIP?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {[
              { icon: <Gift className="h-6 w-6 text-purple-400" />, title: 'Descontos exclusivos', desc: 'Ate 20% em produtos e 50% em servicos da loja' },
              { icon: <Star className="h-6 w-6 text-yellow-400" />, title: 'Programa de pontos', desc: 'Acumule pontos a cada compra e troque por descontos' },
              { icon: <Shield className="h-6 w-6 text-green-400" />, title: 'Carteirinha digital', desc: 'QR Code exclusivo para identificacao na loja' },
              { icon: <Zap className="h-6 w-6 text-blue-400" />, title: 'Acesso antecipado', desc: 'Seja o primeiro a saber de promocoes e lancamentos' },
            ].map((feature, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-4 p-4 rounded-xl bg-card/50 border border-border/30 hover:border-primary/30 transition-colors"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="p-2 rounded-lg bg-background">{feature.icon}</div>
                <div>
                  <h3 className="font-semibold mb-0.5">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Badges Section */}
      <section className="py-10 px-4 sm:px-6 border-t border-border/30">
        <div className="max-w-3xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-3 rounded-full bg-green-500/10 border border-green-500/20">
                <Shield className="h-6 w-6 text-green-500" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Pagamento seguro</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-3 rounded-full bg-red-500/10 border border-red-500/20">
                <X className="h-6 w-6 text-red-400" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Cancele quando quiser</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-3 rounded-full bg-purple-500/10 border border-purple-500/20">
                <Gift className="h-6 w-6 text-purple-400" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Pontos desde o 1o dia</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 text-center border-t border-border/30">
        <div className="flex justify-center mb-4">
          <img src="/logo-vip.png" alt="Geek & Toys VIP" className="h-16 drop-shadow-[0_0_15px_rgba(212,165,32,0.2)]" />
        </div>
        <p className="text-xs text-muted-foreground mb-1">club.geeketoys.com.br</p>
        <p className="text-muted-foreground text-xs">&copy; 2026 Geek & Toys. Todos os direitos reservados.</p>
        <p className="mt-3 text-xs flex flex-wrap justify-center gap-3">
          <a href="https://geeketoys.com.br" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            Visite a loja
          </a>
          <Link to="/termos" className="text-muted-foreground hover:text-foreground">Termos</Link>
          <Link to="/privacidade" className="text-muted-foreground hover:text-foreground">Privacidade</Link>
        </p>
      </footer>

      {/* Radio Geek & Toys -- mini-player flutuante (portfolio publico) */}
      <RadioMiniPlayer />
    </div>
  )
}
