import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { PLANS, type PlanType, type PaymentType } from '../types'
import { formatCurrency } from '../lib/utils'
import { Check, Crown, Star, Sparkles, ArrowRight } from 'lucide-react'

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
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-gray-900 to-pink-900">
      {/* Header */}
      <header className="p-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-3xl">🎮</span>
            <span className="text-xl font-bold text-white">Clube Geek & Toys</span>
          </Link>
          <Link to="/login">
            <Button variant="outline">Já sou membro</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-12 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Faça parte do <span className="gradient-text">Clube Geek & Toys</span>
        </h1>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
          Descontos exclusivos, brindes mensais, acesso antecipado e muito mais!
        </p>

        {/* Payment Type Toggle */}
        <div className="inline-flex items-center gap-2 bg-white/10 p-1 rounded-lg">
          <button
            onClick={() => setPaymentType('monthly')}
            className={`px-4 py-2 rounded-md transition-all ${
              paymentType === 'monthly'
                ? 'bg-primary text-white'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setPaymentType('annual')}
            className={`px-4 py-2 rounded-md transition-all ${
              paymentType === 'annual'
                ? 'bg-primary text-white'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            Anual
            <Badge variant="success" className="ml-2 text-xs">Economize!</Badge>
          </button>
        </div>
      </section>

      {/* Plans */}
      <section className="py-8 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          {(Object.keys(PLANS) as PlanType[]).map((planId) => {
            const plan = PLANS[planId]
            const isSelected = selectedPlan === planId
            const isPopular = planId === 'gold'

            return (
              <Card
                key={planId}
                className={`relative overflow-hidden transition-all cursor-pointer hover:scale-105 ${
                  isSelected ? 'ring-2 ring-primary' : ''
                } ${isPopular ? 'md:-mt-4 md:mb-4' : ''}`}
                onClick={() => setSelectedPlan(planId)}
              >
                {isPopular && (
                  <div className="absolute top-0 right-0 bg-primary text-white text-xs px-3 py-1 rounded-bl-lg">
                    Mais Popular
                  </div>
                )}

                {/* Plan Header */}
                <div className={`p-6 bg-gradient-to-br ${planColors[planId]} text-white`}>
                  <div className="flex items-center gap-3 mb-3">
                    {planIcons[planId]}
                    <h3 className="text-2xl font-bold">{plan.name}</h3>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{formatCurrency(getPrice(planId))}</span>
                    <span className="text-sm opacity-80">
                      /{paymentType === 'monthly' ? 'mês' : 'ano'}
                    </span>
                  </div>
                  {paymentType === 'annual' && (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm opacity-80">
                        = {formatCurrency(getMonthlyEquivalent(planId))}/mês
                      </p>
                      <Badge variant="success" className="text-xs">
                        Economia de {formatCurrency(getSavings(planId))}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Benefits */}
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-lg font-semibold">
                      <span className="text-green-500">{plan.discountProducts}%</span>
                      <span>em produtos</span>
                    </div>
                    <div className="flex items-center gap-2 text-lg font-semibold">
                      <span className="text-green-500">{plan.discountServices}%</span>
                      <span>em serviços</span>
                    </div>
                    <hr className="my-4" />
                    <ul className="space-y-2">
                      {plan.benefits.slice(2).map((benefit, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>

                <CardFooter className="p-6 pt-0">
                  <Button className="w-full" size="lg" variant={isSelected ? 'default' : 'outline'}>
                    {isSelected ? 'Selecionado' : 'Selecionar'}
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </section>

      {/* CTA */}
      {selectedPlan && (
        <section className="py-8 px-6">
          <div className="max-w-md mx-auto">
            <Card className="bg-primary text-primary-foreground">
              <CardHeader>
                <CardTitle>Plano {PLANS[selectedPlan].name} selecionado</CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  {paymentType === 'monthly' ? 'Cobrança mensal' : 'Cobrança anual única'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {formatCurrency(getPrice(selectedPlan))}
                  <span className="text-lg font-normal opacity-80">
                    /{paymentType === 'monthly' ? 'mês' : 'ano'}
                  </span>
                </p>
              </CardContent>
              <CardFooter>
                <Link to={`/cadastro?plano=${selectedPlan}&tipo=${paymentType}`} className="w-full">
                  <Button variant="secondary" size="xl" className="w-full">
                    Continuar <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-8 px-6 text-center text-gray-400 text-sm">
        <p>© 2024 Geek & Toys Home. Todos os direitos reservados.</p>
        <p className="mt-2">
          <Link to="/termos" className="hover:text-white">Termos de Uso</Link>
          {' · '}
          <Link to="/privacidade" className="hover:text-white">Política de Privacidade</Link>
        </p>
      </footer>
    </div>
  )
}
