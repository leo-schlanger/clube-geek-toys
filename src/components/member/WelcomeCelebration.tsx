import { useEffect, useState, useRef } from 'react'
import confetti from 'canvas-confetti'
import { motion, AnimatePresence } from 'framer-motion'
import { PartyPopper, Star, X } from 'lucide-react'
import { Button } from '../ui/button'

const WELCOME_SEEN_KEY = 'clube_geek_welcome_seen'

interface WelcomeCelebrationProps {
  memberName: string
  memberId: string
}

export function WelcomeCelebration({ memberName, memberId }: WelcomeCelebrationProps) {
  const storageKey = `${WELCOME_SEEN_KEY}_${memberId}`
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(storageKey)
  )
  const firedRef = useRef(false)

  useEffect(() => {
    if (!visible || firedRef.current) return
    firedRef.current = true

    const colors = ['#ec4899', '#f72585', '#f5c518', '#ffffff', '#8b5cf6']

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
    localStorage.setItem(storageKey, '1')
    setVisible(false)
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
          className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-background p-6 text-center shadow-lg"
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
            className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/20 mb-4"
          >
            <PartyPopper className="h-8 w-8 text-primary" />
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
            Aproveite descontos exclusivos, acumule pontos e resgate recompensas incríveis.
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
