import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { MailCheck, Loader2, RefreshCw, CheckCircle, Inbox } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StepEmailVerificationProps {
  email: string
  onVerified: () => void
  onResend: () => Promise<{ success: boolean; error?: string }>
  onRefreshUser: () => Promise<void>
  emailVerified: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000
const COOLDOWN_SECONDS = 60

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepEmailVerification({
  email,
  onVerified,
  onResend,
  onRefreshUser,
  emailVerified,
}: StepEmailVerificationProps) {
  const [checking, setChecking] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const verifiedRef = useRef(false)

  // -----------------------------------------------------------------------
  // Auto-polling every 5s
  // -----------------------------------------------------------------------

  useEffect(() => {
    const id = setInterval(() => {
      onRefreshUser()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [onRefreshUser])

  // -----------------------------------------------------------------------
  // React to emailVerified becoming true
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (emailVerified && !verifiedRef.current) {
      verifiedRef.current = true
      toast.success('Email verificado com sucesso!')
      onVerified()
    }
  }, [emailVerified, onVerified])

  // -----------------------------------------------------------------------
  // Cooldown timer
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1))
    }, 1_000)
    return () => clearInterval(id)
  }, [cooldown])

  // -----------------------------------------------------------------------
  // Manual check
  // -----------------------------------------------------------------------

  const handleManualCheck = useCallback(async () => {
    setChecking(true)
    try {
      await onRefreshUser()
      if (!verifiedRef.current) {
        toast.info('Ainda nao verificado. Verifique seu email e tente novamente.')
      }
    } finally {
      setChecking(false)
    }
  }, [onRefreshUser])

  // -----------------------------------------------------------------------
  // Resend
  // -----------------------------------------------------------------------

  const handleResend = useCallback(async () => {
    setResending(true)
    try {
      const result = await onResend()
      if (result.success) {
        toast.success('Email reenviado com sucesso!')
        setCooldown(COOLDOWN_SECONDS)
      } else {
        toast.error(result.error || 'Erro ao reenviar email')
      }
    } catch {
      toast.error('Erro ao reenviar email')
    } finally {
      setResending(false)
    }
  }, [onResend])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const cooldownProgress = cooldown > 0 ? (cooldown / COOLDOWN_SECONDS) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <Card>
        <CardHeader className="text-center">
          {/* Animated envelope icon */}
          <div className="mx-auto mb-4 flex flex-col items-center gap-3">
            <motion.div
              className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <MailCheck className="h-10 w-10 text-primary" />
            </motion.div>
          </div>

          <CardTitle className="text-2xl">Verifique seu email</CardTitle>
          <CardDescription>
            Enviamos um link de verificacao para
          </CardDescription>

          {/* Email badge */}
          <div className="mt-2 flex justify-center">
            <span className="rounded-full bg-muted px-4 py-1 font-medium text-sm">
              {email}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Auto-polling indicator */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Verificando automaticamente...</span>
          </div>

          {/* "Ja verifiquei" button */}
          <Button
            className="w-full"
            size="lg"
            disabled={checking}
            onClick={handleManualCheck}
          >
            {checking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            Ja verifiquei
          </Button>

          {/* Resend button with cooldown */}
          <div className="relative">
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              disabled={resending || cooldown > 0}
              onClick={handleResend}
            >
              {resending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {cooldown > 0
                ? `Reenviar email (${cooldown}s)`
                : 'Reenviar email'}
            </Button>

            {/* Cooldown progress bar */}
            {cooldown > 0 && (
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full bg-primary/50 rounded-full"
                  initial={{ width: '100%' }}
                  animate={{ width: `${cooldownProgress}%` }}
                  transition={{ duration: 0.3, ease: 'linear' }}
                />
              </div>
            )}
          </div>

          {/* Help text */}
          <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Inbox className="h-3.5 w-3.5" />
            Nao recebeu? Verifique sua caixa de spam
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
