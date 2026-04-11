import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { verifyEmailToken } from '../lib/email'
import { logger } from '../lib/logger'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Loading } from '../components/ui/loading'
import { Mail, CheckCircle, RefreshCw, LogOut, AlertCircle } from 'lucide-react'

export default function VerifyEmail() {
  const { user, emailVerified, loading, sendVerificationEmail, refreshUser, signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [sending, setSending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [tokenVerified, setTokenVerified] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [cooldown, setCooldown] = useState(0)

  const token = searchParams.get('token')
  const verificationAttempted = useRef(false)

  // Verificar token da URL automaticamente (executa apenas uma vez)
  useEffect(() => {
    async function verifyToken() {
      if (!token || verificationAttempted.current) return
      verificationAttempted.current = true

      setVerifying(true)
      setMessage(null)

      try {
        const result = await verifyEmailToken(token)

        if (result.success) {
          setTokenVerified(true)
          setMessage({
            type: 'success',
            text: 'Email verificado com sucesso!',
          })

          // Atualizar estado do usuário
          await refreshUser()

          setTimeout(() => {
            navigate('/membro', { replace: true })
          }, 3000)
        } else {
          // Branch on backend error code (Wave 1.9 / 1.11 standardized errors).
          let text: string
          switch (result.code) {
            case 'TOKEN_ALREADY_USED':
              text = 'Este link já foi usado. Se você acabou de verificar, faça login normalmente.'
              break
            case 'TOKEN_INVALID':
              text = 'Link de verificação inválido ou expirado. Solicite um novo link abaixo.'
              break
            case 'USER_NOT_FOUND':
              text = 'Usuário não encontrado. Verifique se o link está correto.'
              break
            default:
              text = result.error || 'Não foi possível verificar o email.'
          }
          setMessage({ type: 'error', text })
        }
      } catch (err: unknown) {
        logger.error('Erro ao verificar token:', err)
        const error = err as { message?: string }
        setMessage({
          type: 'error',
          text: error?.message || 'Erro ao verificar email',
        })
      } finally {
        setVerifying(false)
      }
    }

    verifyToken()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Redirecionar se não autenticado (apenas se não tem token).
  // Se houver rascunho de cadastro em andamento, voltar pro fluxo de cadastro
  // (preserva contexto). Caso contrário, vai pro login.
  useEffect(() => {
    if (!loading && !user && !token) {
      const hasDraft = localStorage.getItem('clube_geek_register_draft')
      if (hasDraft) {
        navigate('/cadastro?step=verify', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    }
  }, [loading, user, token, navigate])

  // Redirecionar se email já verificado
  useEffect(() => {
    if (!loading && emailVerified && !token) {
      navigate('/membro', { replace: true })
    }
  }, [loading, emailVerified, token, navigate])

  // Countdown do cooldown
  useEffect(() => {
    if (cooldown <= 0) return

    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [cooldown])

  async function handleResendEmail() {
    if (cooldown > 0) return

    setSending(true)
    setMessage(null)

    try {
      const result = await sendVerificationEmail()

      if (result.success) {
        setMessage({ type: 'success', text: 'Email de verificação enviado! Verifique sua caixa de entrada e spam.' })
        setCooldown(60) // 60 segundos de cooldown
      } else {
        setMessage({ type: 'error', text: result.error || 'Erro ao enviar email' })
      }
    } catch (err: unknown) {
      logger.error('Erro ao reenviar:', err)
      const error = err as { message?: string }
      setMessage({ type: 'error', text: `Erro: ${error?.message || 'desconhecido'}` })
    }

    setSending(false)
  }

  async function handleCheckVerification() {
    setChecking(true)
    setMessage(null)

    await refreshUser()

    // Pequeno delay para a UI atualizar
    setTimeout(() => {
      setChecking(false)
      if (!emailVerified) {
        setMessage({ type: 'error', text: 'Email ainda não verificado. Verifique sua caixa de entrada.' })
      }
    }, 500)
  }

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (loading || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loading size="lg" />
          {verifying && (
            <p className="text-muted-foreground">Verificando seu email...</p>
          )}
        </div>
      </div>
    )
  }

  // Se tem token e foi verificado com sucesso
  if (token && tokenVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 rounded-full bg-green-500/10">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Email Verificado!</CardTitle>
            <CardDescription>
              Seu email foi verificado com sucesso.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-3">
            <p className="text-muted-foreground text-sm">
              Se estava preenchendo o cadastro, volte para a aba anterior — o sistema detectará a verificação automaticamente.
            </p>
            <p className="text-muted-foreground text-xs">Redirecionando em instantes...</p>
            <Loading size="sm" className="mt-2" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Se tem token mas falhou
  if (token && message?.type === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 rounded-full bg-red-500/10">
              <AlertCircle className="h-12 w-12 text-red-500" />
            </div>
            <CardTitle className="text-2xl">Erro na Verificação</CardTitle>
            <CardDescription>
              {message.text}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              O link de verificação pode ter expirado ou já foi utilizado.
            </p>
            <Button
              onClick={() => navigate('/login', { replace: true })}
              className="w-full"
            >
              Fazer Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10">
            <Mail className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">Verifique seu Email</CardTitle>
          <CardDescription>
            Enviamos um link de verificação para:
          </CardDescription>
          <p className="font-medium text-foreground mt-2">{user?.email}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Mensagem de feedback */}
          {message && (
            <div className={`p-3 rounded-md text-sm ${
              message.type === 'success'
                ? 'bg-green-500/10 border border-green-500/50 text-green-600'
                : 'bg-red-500/10 border border-red-500/50 text-red-600'
            }`}>
              {message.text}
            </div>
          )}

          {/* Instruções */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <p className="text-sm text-muted-foreground">
              <strong>1.</strong> Acesse sua caixa de entrada
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>2.</strong> Clique no link de verificação
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>3.</strong> Volte aqui e clique em "Verificar"
            </p>
          </div>

          {/* Verificar se já clicou no link */}
          <Button
            onClick={handleCheckVerification}
            disabled={checking}
            className="w-full"
            size="lg"
          >
            {checking ? (
              <Loading size="sm" />
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Já Verifiquei
              </>
            )}
          </Button>

          {/* Reenviar email */}
          <Button
            variant="outline"
            onClick={handleResendEmail}
            disabled={sending || cooldown > 0}
            className="w-full"
          >
            {sending ? (
              <Loading size="sm" />
            ) : cooldown > 0 ? (
              `Reenviar em ${cooldown}s`
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reenviar Email
              </>
            )}
          </Button>

          {/* Dica sobre spam */}
          <p className="text-xs text-center text-muted-foreground">
            Não recebeu? Verifique a pasta de spam ou lixo eletrônico.
          </p>

          {/* Sair */}
          <div className="pt-4 border-t">
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full text-muted-foreground"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Usar outro email
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
