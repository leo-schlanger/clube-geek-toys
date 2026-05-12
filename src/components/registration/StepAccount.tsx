import { useCallback, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  XCircle,
} from 'lucide-react'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { GoogleSignInButton } from '../GoogleSignInButton'
import { Turnstile } from '../Turnstile'
import { validateEmail, type EmailValidationResult } from '../../lib/email-validation'
import { PASSWORD_MIN_LENGTH } from '../../lib/password-validation'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = z
  .object({
    email: z.string().email('Email invalido'),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
      .refine((v) => /[A-Z]/.test(v), 'Deve conter 1 letra maiuscula')
      .refine((v) => /[0-9]/.test(v), 'Deve conter 1 numero'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Senhas nao conferem',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StepAccountProps {
  onNext: (data: { email: string; password: string; turnstileToken?: string }) => void
  onGoogleSuccess: (data: Record<string, unknown>) => void
  loading: boolean
  defaultEmail?: string
}

// ---------------------------------------------------------------------------
// Rate limiter for email validation (max 5 per minute)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60_000

// ---------------------------------------------------------------------------
// Password rules UI
// ---------------------------------------------------------------------------

interface PasswordRule {
  label: string
  test: (v: string) => boolean
  optional?: boolean
}

const passwordRules: PasswordRule[] = [
  { label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`, test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { label: 'Uma letra maiuscula', test: (v) => /[A-Z]/.test(v) },
  { label: 'Um numero', test: (v) => /[0-9]/.test(v) },
  { label: 'Um caractere especial (opcional)', test: (v) => /[^A-Za-z0-9]/.test(v), optional: true },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

const TURNSTILE_ENABLED = !!import.meta.env.VITE_TURNSTILE_SITE_KEY

export function StepAccount({ onNext, onGoogleSuccess, loading, defaultEmail }: StepAccountProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [emailValidation, setEmailValidation] = useState<EmailValidationResult | null>(null)
  const [emailValidating, setEmailValidating] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  // Rate limiting state
  const rateLimitRef = useRef<number[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: defaultEmail ?? '',
      password: '',
      confirmPassword: '',
    },
  })

  const passwordValue = watch('password', '')

  // -----------------------------------------------------------------------
  // Email blur validation with rate limiting
  // -----------------------------------------------------------------------

  const handleEmailBlur = useCallback(async (e: React.FocusEvent<HTMLInputElement>) => {
    const email = e.target.value.trim()
    if (!email) {
      setEmailValidation(null)
      return
    }

    // Rate limit check
    const now = Date.now()
    rateLimitRef.current = rateLimitRef.current.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
    if (rateLimitRef.current.length >= RATE_LIMIT_MAX) {
      setEmailValidation({ valid: false, error: 'Muitas tentativas. Aguarde um momento.' })
      return
    }
    rateLimitRef.current.push(now)

    // Cancel previous in-flight validation
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setEmailValidating(true)
    try {
      const result = await validateEmail(email)
      if (controller.signal.aborted) return
      setEmailValidation(result)
    } catch {
      if (controller.signal.aborted) return
      setEmailValidation(null)
    } finally {
      if (!controller.signal.aborted) setEmailValidating(false)
    }
  }, [])

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const onSubmit = (data: FormValues) => {
    if (TURNSTILE_ENABLED && !turnstileToken) {
      return // Turnstile not yet verified
    }
    onNext({ email: data.email, password: data.password, turnstileToken: turnstileToken || undefined })
  }

  // -----------------------------------------------------------------------
  // Email feedback icon
  // -----------------------------------------------------------------------

  function renderEmailFeedback() {
    if (emailValidating) {
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    }
    if (emailValidation?.valid) {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    }
    if (emailValidation && !emailValidation.valid) {
      return <XCircle className="h-4 w-4 text-red-500" />
    }
    return null
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Criar Conta</CardTitle>
          <CardDescription>
            Escolha como deseja se cadastrar
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* ---- Google sign-in ---- */}
          <div className="rounded-lg bg-muted/50 p-4">
            <GoogleSignInButton
              label="Cadastro rapido com Google"
              onSuccess={onGoogleSuccess}
              disabled={loading}
            />
          </div>

          {/* ---- Divider (only when Google is configured) ---- */}
          {GOOGLE_CLIENT_ID && (
            <div className="relative flex items-center gap-4">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground">
                ou cadastre com email
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
          )}

          {/* ---- Email + password form ---- */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="pl-10 pr-10"
                  error={!!errors.email || (emailValidation !== null && !emailValidation.valid)}
                  {...register('email', { onBlur: handleEmailBlur })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {renderEmailFeedback()}
                </span>
              </div>
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email.message}</p>
              )}
              {emailValidation && !emailValidation.valid && emailValidation.error && !errors.email && (
                <p className="text-sm text-red-500">{emailValidation.error}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Sua senha"
                  className="pr-10"
                  error={!!errors.password}
                  {...register('password')}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-red-500">{errors.password.message}</p>
              )}

              {/* Password strength checklist */}
              {passwordValue.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {passwordRules.map((rule) => {
                    const met = rule.test(passwordValue)
                    if (rule.optional) {
                      return (
                        <li key={rule.label} className="flex items-center gap-2">
                          {met ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-muted-foreground text-[8px] text-muted-foreground" />
                          )}
                          <span className={met ? 'text-green-500' : 'text-muted-foreground'}>
                            {rule.label}
                          </span>
                        </li>
                      )
                    }
                    return (
                      <li key={rule.label} className="flex items-center gap-2">
                        {met ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        <span className={met ? 'text-green-500' : 'text-red-500'}>
                          {rule.label}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Repita a senha"
                  className="pr-10"
                  error={!!errors.confirmPassword}
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Esconder senha' : 'Mostrar senha'}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Turnstile CAPTCHA */}
            <Turnstile
              onVerify={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
            />

            {/* Submit */}
            <Button type="submit" className="w-full" size="lg" disabled={loading || (TURNSTILE_ENABLED && !turnstileToken)}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Criar Conta
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  )
}
