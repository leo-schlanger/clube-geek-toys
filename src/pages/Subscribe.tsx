import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardFooter } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { PLANS, type PlanType, type PaymentType } from '../types'
import { formatCurrency } from '../lib/utils'
import { Check, Crown, Star, Sparkles, ArrowRight, Shield, Zap, Gift, CreditCard } from 'lucide-react'
import { motion } from 'framer-motion'

export default function Subscribe() {
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null)
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
            className="animate-float mb-6 sm:mb-8"
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
              A partir de <strong className="text-primary text-lg">R$ 19,90</strong>/mês
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
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Ativação imediata</span>
            <span className="flex items-center gap-1.5"><Gift className="h-3.5 w-3.5 text-purple-400" /> Acúmulo de pontos</span>
            <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-blue-400" /> PIX ou cartão</span>
          </motion.div>
        </div>
      </section>

      {/* Payment Toggle */}
      <section id="planos" className="pt-8 sm:pt-12 px-4 sm:px-6 text-center scroll-mt-20">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">Escolha seu plano</h2>
        <p className="text-sm text-muted-foreground mb-6">Cancele quando quiser. Sem fidelidade.</p>

        <div className="inline-flex items-center gap-1 glass border border-border p-1 rounded-full">
          <button
            onClick={() => setPaymentType('monthly')}
            className={`px-4 sm:px-6 py-2 rounded-full text-sm font-medium transition-all ${
              paymentType === 'monthly'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setPaymentType('annual')}
            className={`px-4 sm:px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              paymentType === 'annual'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Anual
            <Badge variant="success" className="text-[10px]">Economize!</Badge>
          </button>
        </div>
      </section>

      {/* Plans Grid */}
      <section className="py-8 sm:py-12 px-4 sm:px-6">
        <motion.div
          className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-50px' }}
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { staggerChildren: 0.12 } },
          }}
        >
          {(Object.keys(PLANS) as PlanType[]).map((planId) => {
            const plan = PLANS[planId]
            const isSelected = selectedPlan === planId
            const isPopular = planId === 'gold'

            return (
              <motion.div
                key={planId}
                variants={{ hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0 } }}
              >
                <Card
                  className={`relative overflow-hidden transition-all duration-300 cursor-pointer flex flex-col h-full group
                    ${isSelected ? 'ring-2 ring-primary border-glow-primary scale-[1.02]' : 'hover:border-primary/50'}
                    ${isPopular ? 'lg:-mt-4 lg:mb-4' : ''}`}
                  onClick={() => setSelectedPlan(planId)}
                >
                  {isPopular && (
                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-yellow-500 to-amber-500 text-black text-xs font-bold text-center py-1 z-10">
                      MAIS POPULAR
                    </div>
                  )}

                  {/* Plan Header */}
                  <div className={`p-5 sm:p-6 ${isPopular ? 'pt-10' : ''}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${planGradients[planId]} text-black/80`}>
                        {planIcons[planId]}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">{plan.name}</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-green-400 font-semibold text-sm">{plan.discountProducts}% produtos</span>
                          <span className="text-muted-foreground text-xs">|</span>
                          <span className="text-green-400 font-semibold text-sm">{plan.discountServices}% serviços</span>
                        </div>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="mb-1">
                      <span className="text-3xl sm:text-4xl font-extrabold">{formatCurrency(getPrice(planId))}</span>
                      <span className="text-sm text-muted-foreground ml-1">
                        /{paymentType === 'monthly' ? 'mês' : 'ano'}
                      </span>
                    </div>
                    {paymentType === 'annual' && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">
                          = {formatCurrency(getMonthlyEquivalent(planId))}/mês
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
                      {plan.benefits.map((benefit, index) => (
                        <li key={index} className="flex items-start gap-2.5 text-sm">
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
                    <Button
                      className={`w-full h-11 font-semibold transition-all ${
                        isSelected
                          ? 'bg-gradient-to-r from-yellow-500 to-amber-600 text-black hover:from-yellow-400 hover:to-amber-500'
                          : ''
                      }`}
                      variant={isSelected ? 'default' : 'outline'}
                    >
                      {isSelected ? (
                        <><Check className="mr-2 h-4 w-4" /> Selecionado</>
                      ) : (
                        'Selecionar'
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>
      </section>

      {/* CTA Sticky */}
      {selectedPlan && (
        <motion.section
          className="py-6 px-4 sm:px-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="max-w-lg mx-auto">
            <Card className="border-primary/50 border-glow-primary bg-gradient-to-br from-card to-card/80">
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-lg">
                      Plano {PLANS[selectedPlan].name}
                      <span className="text-muted-foreground font-normal text-sm ml-2">
                        {paymentType === 'monthly' ? 'Mensal' : 'Anual'}
                      </span>
                    </p>
                    <p className="text-2xl font-extrabold text-primary">
                      {formatCurrency(getPrice(selectedPlan))}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{paymentType === 'monthly' ? 'mês' : 'ano'}
                      </span>
                    </p>
                  </div>
                  <Link to={`/cadastro?plano=${selectedPlan}&tipo=${paymentType}`}>
                    <Button size="lg" className="btn-glow font-bold px-8 h-12 rounded-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black whitespace-nowrap">
                      ASSINE AGORA <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.section>
      )}

      {/* Features Grid */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 border-t border-border/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">Por que ser VIP?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {[
              { icon: <Gift className="h-6 w-6 text-purple-400" />, title: 'Descontos exclusivos', desc: 'Até 50% de desconto em produtos e serviços da loja' },
              { icon: <Star className="h-6 w-6 text-yellow-400" />, title: 'Programa de pontos', desc: 'Acumule pontos a cada compra e troque por descontos' },
              { icon: <Shield className="h-6 w-6 text-green-400" />, title: 'Carteirinha digital', desc: 'QR Code exclusivo para identificação na loja' },
              { icon: <Zap className="h-6 w-6 text-blue-400" />, title: 'Acesso antecipado', desc: 'Seja o primeiro a saber de promoções e lançamentos' },
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
    </div>
  )
}
