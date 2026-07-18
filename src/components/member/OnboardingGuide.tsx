import { useState } from 'react'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { QrCode, ShoppingBag, Gift, ChevronDown, ChevronUp, X } from 'lucide-react'

const DISMISS_KEY = 'clube_geek_onboarding_dismissed'

interface OnboardingGuideProps {
  memberStartDate: string
}

export function OnboardingGuide({ memberStartDate }: OnboardingGuideProps) {
  const [expanded, setExpanded] = useState(true)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1'
  )

  // Only show for members < 30 days old
  const [daysSinceJoin] = useState(() =>
    Math.floor((Date.now() - new Date(memberStartDate).getTime()) / (1000 * 60 * 60 * 24))
  )
  if (daysSinceJoin > 30 || dismissed) return null

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  const steps = [
    {
      icon: <QrCode className="h-5 w-5 text-primary" />,
      title: 'Mostre sua carteirinha',
      description: 'Toque no cartão acima para ver o QR Code. Apresente na loja física para receber seu desconto.',
    },
    {
      icon: <ShoppingBag className="h-5 w-5 text-primary" />,
      title: 'Ganhe 15% em qualquer produto',
      description: 'Seu desconto de membro vale na loja física e na loja online — em toda a sua compra.',
    },
    {
      icon: <Gift className="h-5 w-5 text-primary" />,
      title: 'Brinde e eventos',
      description: 'Retire seu brinde especial e entre de graça nos eventos participantes.',
    },
  ]

  return (
    <Card className="border-primary/20 card-glow overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
        >
          <h3 className="font-heading font-bold text-lg gradient-text">
            Bem-vindo ao Clube!
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); handleDismiss() }}
              title="Dispensar"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {/* Steps */}
        {expanded && (
          <div className="px-4 pb-4 space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 shrink-0">
                  {step.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
