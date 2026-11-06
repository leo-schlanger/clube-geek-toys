import { useEffect, useState, useRef } from 'react'
import { MEMBER_DISCOUNT_PERCENT } from '../../types'
import confetti from 'canvas-confetti'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, X } from 'lucide-react'
import { Button } from '../ui/button'
import { NonoMascot } from '../store/NonoMascot'
import { markWelcomeSeen, welcomeStorageKey } from '../../lib/welcome'

interface WelcomeCelebrationProps {
  memberName: string
  memberId: string
  onDismiss?: () => void
}

export function WelcomeCelebration({ memberName, memberId, onDismiss }: WelcomeCelebrationProps) {
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(welcomeStorageKey(memberId))
  )
  const firedRef = useRef(false)

  useEffect(() => {
    if (!visible || firedRef.current) return
    firedRef.current = true

    const colors = ['#F04080', '#f72585', '#FCBE04', '#ffffff', '#ff8cbf']

    // Burst from the left
    confetti({ particleCount: 80, spread: 70, origin: { x: 0.15, y: 0.6 }, colors })
    // Burst from the right
    const t1 = setTimeout(() => {
      confetti({ particleCount: 80, spread: 70, origin: { x: 0.85, y: 0.6 }, colors })
    }, 300)
    // Center shower
    const t2 = setTimeout(() => {
      confetti({ particleCount: 120, spread: 100, origin: { x: 0.5, y: 0.3 }, colors, scalar: 1.2 })
    }, 700)

    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [visible])

  function dismiss() {
    markWelcomeSeen(memberId)
    setVisible(false)
    onDismiss?.()
  }

  const firstName = memberName?.split(' ')[0] || 'Membro'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-linear-to-br/srgb from-primary/15 via-primary/5 to-background p-6 text-center shadow-lg"
        >
          {/* Close button */}
          <button
            onClick={dismiss}
            aria-label="Fechar"
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Decorative stars */}
          <div className="absolute top-2 left-4 text-primary/30 animate-pulse">
            <Star className="h-5 w-5 fill-current" />
          </div>
          <div className="absolute top-8 right-12 text-primary/20 animate-pulse" style={{ animationDelay: '0.5s' }}>
            <Star className="h-4 w-4 fill-current" />
          </div>
          <div className="absolute bottom-4 left-8 text-primary/20 animate-pulse" style={{ animationDelay: '1s' }}>
            <Star className="h-3 w-3 fill-current" />
          </div>

          {/* Icon */}
          <motion.div
            initial={{ rotate: -20, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', delay: 0.2, stiffness: 200 }}
            className="mb-3 inline-flex justify-center"
          >
            <NonoMascot pose="heart" size={104} eager />
          </motion.div>

          {/* Welcome text */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-2xl font-heading font-bold gradient-text mb-2"
          >
            Bem-vindo(a), {firstName}!
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="text-muted-foreground text-sm mb-4 max-w-sm mx-auto"
          >
            Sua conta no Clube GeekPop & Toys está ativa!
            Aproveite {MEMBER_DISCOUNT_PERCENT}% de desconto em qualquer produto e os benefícios do clube.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <Button onClick={dismiss} className="btn-glow">
              Vamos lá!
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
