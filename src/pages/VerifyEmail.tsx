import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Loading } from '../components/ui/loading'
import { Mail, CheckCircle, RefreshCw, LogOut } from 'lucide-react'

export default function VerifyEmail() {
  const { user, emailVerified, loading, sendVerificationEmail, refreshUser, signOut } = useAuth()
  const navigate = useNavigate()
  const [sending, setSending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [cooldown, setCooldown] = useState(0)

  // Redirecionar se não autenticado
  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true })
    }
  }, [loading, user, navigate])

  // Redirecionar se email já verificado
  useEffect(() => {
    if (!loading && emailVerified) {
      navigate('/membro', { replace: true })
    }
  }, [loading, emailVerified, navigate])

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

    const result = await sendVerificationEmail()

    if (result.success) {
      setMessage({ type: 'success', text: 'Email de verificação enviado!' })
      setCooldown(60) // 60 segundos de cooldown
    } else {
      setMessage({ type: 'error', text: result.error || 'Erro ao enviar email' })
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading size="lg" />
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
