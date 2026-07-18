import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardFooter } from '../components/ui/card'
import { CLUB_PLAN } from '../types'
import { formatCurrency } from '../lib/utils'
import { getShopUrl } from '../lib/subdomain'
import { Check, X, Sparkles, ArrowRight, Shield, Zap, Gift, CreditCard, ShoppingBag } from 'lucide-react'
import { motion } from 'framer-motion'
import RadioMiniPlayer from '../components/RadioMiniPlayer'

export default function Subscribe() {
  const shopUrl = getShopUrl()
  const extraBenefits = [
    'Carteirinha digital com QR Code',
    'Desconto válido na loja física e online',
    'Renovação anual, sem fidelidade',
  ]

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <header className="glass border-b border-border/50 sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-vip.png" alt="Geek & Toys VIP" className="h-10 sm:h-12" />
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

      {/* Hero Section */}
      <section className="hero-glow relative py-16 sm:py-20 md:py-28 px-4 sm:px-6 text-center">
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

          <motion.h1
            className="text-xl sm:text-2xl md:text-3xl font-semibold text-muted-foreground mb-6 max-w-lg mx-auto"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            Seu universo geek com{' '}
            <span className="text-shimmer font-extrabold">vantagens VIP</span>
          </motion.h1>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <span className="text-sm text-muted-foreground">
              Apenas <strong className="text-primary text-lg">{formatCurrency(CLUB_PLAN.price)}</strong>/ano
            </span>
            <a href="#plano">
              <Button size="lg" className="btn-glow font-bold text-base px-8 h-12 rounded-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black">
                ASSINE AGORA
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>
          </motion.div>

          <motion.div
            className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-green-500" /> Pagamento seguro</span>
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Ativação imediata</span>
            <span className="flex items-center gap-1.5"><ShoppingBag className="h-3.5 w-3.5 text-purple-400" /> 15% em qualquer produto</span>
            <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-blue-400" /> PIX ou cartão</span>
          </motion.div>
        </div>
      </section>

      {/* Single Plan */}
      <section id="plano" className="py-8 sm:py-12 px-4 sm:px-6 scroll-mt-20">
        <div className="text-center mb-8">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">Plano do Clube</h2>
          <p className="text-sm text-muted-foreground">Um único plano, anual, com tudo incluso.</p>
        </div>

        <motion.div
          className="max-w-md mx-auto"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
        >
          <Card className="relative overflow-hidden flex flex-col ring-2 ring-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 via-purple-400 to-violet-600 text-black/80">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{CLUB_PLAN.name}</h3>
                  <span className="text-green-400 font-semibold text-sm">{CLUB_PLAN.discount}% em qualquer produto</span>
                </div>
              </div>

              <div className="mb-1">
                <span className="text-4xl font-extrabold">{formatCurrency(CLUB_PLAN.price)}</span>
                <span className="text-sm text-muted-foreground ml-1">/ano</span>
              </div>
              <p className="text-xs text-muted-foreground">Renovação anual · cancele quando quiser</p>
            </div>

            <CardContent className="px-6 pb-4 flex-grow">
              <ul className="space-y-2.5">
                {[...CLUB_PLAN.benefits, ...extraBenefits].map((benefit, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{benefit}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="p-6 pt-0">
              <Link to="/cadastro?plano=club&tipo=annual" className="w-full">
                <Button className="w-full h-11 font-semibold bg-gradient-to-r from-yellow-500 to-amber-600 text-black hover:from-yellow-400 hover:to-amber-500">
                  ASSINAR <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 border-t border-border/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">Por que ser VIP?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {[
              { icon: <ShoppingBag className="h-6 w-6 text-purple-400" />, title: '15% de desconto', desc: 'Em qualquer produto, na loja física e na loja online' },
              { icon: <Gift className="h-6 w-6 text-pink-400" />, title: 'Brinde especial', desc: 'Um mimo geek de boas-vindas ao entrar no clube' },
              { icon: <Zap className="h-6 w-6 text-blue-400" />, title: 'Eventos participantes', desc: 'Entrada gratuita nos eventos do Clube Geek & Toys' },
              { icon: <Shield className="h-6 w-6 text-green-400" />, title: 'Carteirinha digital', desc: 'QR Code exclusivo para identificação na loja' },
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
                <ShoppingBag className="h-6 w-6 text-purple-400" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">15% desde o 1º dia</span>
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
          <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
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
