import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { PLANS, type PlanType, type PaymentType } from '../types'
import { formatCurrency } from '../lib/utils'
import { Check, Crown, Star, Sparkles, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'

export default function Subscribe() {
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null)
  const [paymentType, setPaymentType] = useState<PaymentType>('monthly')

  const planIcons = {
    silver: <Star className="h-8 w-8" />,
    gold: <Crown className="h-8 w-8" />,
    black: <Sparkles className="h-8 w-8" />,
  }

  const planColors = {
    silver: 'from-slate-400 to-slate-600',
    gold: 'from-yellow-400 to-amber-600',
    black: 'from-gray-700 to-gray-900',
  }

  function getPrice(planId: PlanType) {
    const plan = PLANS[planId]
    return paymentType === 'monthly' ? plan.priceMonthly : plan.priceAnnual
  }

  function getMonthlyEquivalent(planId: PlanType) {
    const plan = PLANS[planId]
    return plan.priceAnnual / 12
  }

  function getSavings(planId: PlanType) {
    const plan = PLANS[planId]
    const annualIfMonthly = plan.priceMonthly * 12
    return annualIfMonthly - plan.priceAnnual
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b border-border sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 sm:h-16 md:h-20 px-4 sm:px-6">
          <Link to="/" className="flex items-center">
            <img src="/logo.jpg" alt="Geek & Toys" className="h-10 sm:h-12 md:h-14 rounded" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/login">
              <Button variant="outline" size="sm" className="border-primary/50 hover:border-primary text-xs sm:text-sm">
                Já sou membro
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-8 sm:py-12 md:py-16 px-4 sm:px-6 text-center">
        <motion.h1
          className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-heading font-bold text-foreground mb-3 sm:mb-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Faça parte do <span className="gradient-text text-glow-primary">Clube</span>
        </motion.h1>
        <motion.p
          className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-6 sm:mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Descontos exclusivos em produtos e serviços, acesso antecipado a promoções e muito mais!
        </motion.p>

        {/* Payment Type Toggle */}
        <div className="inline-flex items-center gap-1 sm:gap-2 glass border border-border p-1 rounded-lg">
          <button
            onClick={() => setPaymentType('monthly')}
            className={`px-3 sm:px-6 py-1.5 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-all ${paymentType === 'monthly'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setPaymentType('annual')}
            className={`px-3 sm:px-6 py-1.5 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-all flex items-center gap-1 sm:gap-2 ${paymentType === 'annual'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Anual
            <Badge variant="success" className="text-[10px] sm:text-xs">Economize!</Badge>
          </button>
        </div>
      </section>

      {/* Plans */}
      <section className="py-6 sm:py-8 px-4 sm:px-6">
        <motion.div
          className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: {
                staggerChildren: 0.1
              }
            }
          }}
        >
          {(Object.keys(PLANS) as PlanType[]).map((planId) => {
            const plan = PLANS[planId]
            const isSelected = selectedPlan === planId
            const isPopular = planId === 'gold'

            return (
              <motion.div
                key={planId}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: { opacity: 1, y: 0 }
                }}
              >
                <Card
                  className={`relative overflow-hidden transition-all cursor-pointer hover-glow-primary flex flex-col h-full ${isSelected ? 'ring-2 ring-primary border-glow-primary' : ''
                    } ${isPopular ? 'lg:-mt-4 lg:mb-4' : ''}`}
                  onClick={() => setSelectedPlan(planId)}
                >
                  {isPopular && (
                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] sm:text-xs font-medium px-2 sm:px-3 py-1 rounded-bl-lg z-10">
                      Mais Popular
                    </div>
                  )}

                  {/* Plan Header */}
                  <div className={`p-4 sm:p-6 bg-gradient-to-br ${planColors[planId]} text-white`}>
                    <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                      <div className="[&>svg]:h-6 [&>svg]:w-6 sm:[&>svg]:h-8 sm:[&>svg]:w-8">
                        {planIcons[planId]}
                      </div>
                      <h3 className="text-xl sm:text-2xl font-heading font-bold">{plan.name}</h3>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl sm:text-3xl md:text-4xl font-bold">{formatCurrency(getPrice(planId))}</span>
                      <span className="text-xs sm:text-sm opacity-80">
                        /{paymentType === 'monthly' ? 'mês' : 'ano'}
                      </span>
                    </div>
                    {paymentType === 'annual' && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs sm:text-sm opacity-80">
                          = {formatCurrency(getMonthlyEquivalent(planId))}/mês
                        </p>
                        <Badge variant="success" className="text-[10px] sm:text-xs">
                          Economia de {formatCurrency(getSavings(planId))}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Benefits */}
                  <CardContent className="p-4 sm:p-6 flex-grow">
                    <div className="space-y-2 sm:space-y-3">
                      <div className="flex items-center gap-2 text-base sm:text-lg font-semibold">
                        <span className="text-green-500">{plan.discountProducts}%</span>
                        <span>em produtos</span>
                      </div>
                      <div className="flex items-center gap-2 text-base sm:text-lg font-semibold">
                        <span className="text-green-500">{plan.discountServices}%</span>
                        <span>em serviços</span>
                      </div>
                      <hr className="my-3 sm:my-4 border-border" />
                      <ul className="space-y-1.5 sm:space-y-2">
                        {plan.benefits.slice(2).map((benefit, index) => (
                          <li key={index} className="flex items-start gap-2 text-xs sm:text-sm">
                            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>

                  <CardFooter className="p-4 sm:p-6 pt-0">
                    <Button className="w-full" size="default" variant={isSelected ? 'default' : 'outline'}>
                      {isSelected ? 'Selecionado' : 'Selecionar'}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>
      </section>

      {/* CTA */}
      {selectedPlan && (
        <section className="py-6 sm:py-8 px-4 sm:px-6">
          <motion.div
            className="max-w-md mx-auto"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="bg-primary text-primary-foreground border-glow-primary">
              <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                <CardTitle className="font-heading text-lg sm:text-xl">Plano {PLANS[selectedPlan].name} selecionado</CardTitle>
                <CardDescription className="text-primary-foreground/80 text-sm">
                  {paymentType === 'monthly' ? 'Cobrança mensal' : 'Cobrança anual única'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <p className="text-2xl sm:text-3xl font-bold">
                  {formatCurrency(getPrice(selectedPlan))}
                  <span className="text-base sm:text-lg font-normal opacity-80">
                    /{paymentType === 'monthly' ? 'mês' : 'ano'}
                  </span>
                </p>
              </CardContent>
              <CardFooter className="p-4 sm:p-6 pt-0">
                <Link to={`/cadastro?plano=${selectedPlan}&tipo=${paymentType}`} className="w-full">
                  <Button variant="secondary" size="lg" className="w-full font-semibold text-sm sm:text-base">
                    Continuar <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </motion.div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-6 sm:py-8 px-4 sm:px-6 text-center border-t border-border mt-8 sm:mt-12">
        <div className="flex justify-center mb-3 sm:mb-4">
          <img src="/logo.jpg" alt="Geek & Toys" className="h-8 sm:h-10 rounded" />
        </div>
        <p className="text-muted-foreground text-xs sm:text-sm">© 2026 Geek & Toys. Todos os direitos reservados.</p>
        <p className="mt-2 text-xs sm:text-sm flex flex-wrap justify-center gap-1 sm:gap-0">
          <a href="https://geeketoys.com.br" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            Visite nossa loja
          </a>
          <span className="hidden sm:inline">{' · '}</span>
          <span className="sm:hidden"> · </span>
          <Link to="/termos" className="text-muted-foreground hover:text-foreground">Termos de Uso</Link>
          <span className="hidden sm:inline">{' · '}</span>
          <span className="sm:hidden"> · </span>
          <Link to="/privacidade" className="text-muted-foreground hover:text-foreground">Privacidade</Link>
        </p>
      </footer>
    </div>
  )
}
