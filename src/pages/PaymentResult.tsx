import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { CheckCircle, XCircle, Clock, Home, RefreshCw, Loader2 } from 'lucide-react'
import { checkPaymentById } from '../lib/payments'

type ResultType = 'success' | 'error' | 'pending'

interface PaymentResultProps {
  type: ResultType
}

// Configuration for each result type
const resultConfig = {
  success: {
    icon: <CheckCircle className="h-20 w-20 text-green-500" />,
    title: 'Pagamento Confirmado!',
    description: 'Sua assinatura foi ativada com sucesso.',
    color: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-500',
  },
  error: {
    icon: <XCircle className="h-20 w-20 text-red-500" />,
    title: 'Pagamento Não Aprovado',
    description: 'Houve um problema com seu pagamento. Tente novamente.',
    color: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-500',
  },
  pending: {
    icon: <Clock className="h-20 w-20 text-yellow-500" />,
    title: 'Pagamento Pendente',
    description: 'Seu pagamento está sendo processado. Você receberá uma confirmação em breve.',
    color: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-500',
  },
}

export default function PaymentResult({ type: initialType }: PaymentResultProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isValidating, setIsValidating] = useState(false)
  const [validatedType, setValidatedType] = useState<ResultType | null>(null)

  // Get payment_id from URL (Mercado Pago redirect includes this)
  const paymentId = searchParams.get('payment_id')

  // Validate payment status on mount
  useEffect(() => {
    async function validatePayment() {
      if (!paymentId) {
        // No payment_id, trust the URL route type
        setValidatedType(initialType)
        return
      }

      setIsValidating(true)

      try {
        const result = await checkPaymentById(paymentId)

        if (result) {
          // Map actual status to result type
          switch (result.status) {
            case 'paid':
              setValidatedType('success')
              break
            case 'failed':
            case 'refunded':
              setValidatedType('error')
              break
            default:
              setValidatedType('pending')
          }
        } else {
          // API call failed, fall back to URL type
          setValidatedType(initialType)
        }
      } catch {
        // Error checking, fall back to URL type
        setValidatedType(initialType)
      } finally {
        setIsValidating(false)
      }
    }

    validatePayment()
  }, [paymentId, initialType])

  // Show loading while validating
  if (isValidating || validatedType === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Loader2 className="h-20 w-20 text-primary animate-spin" />
            </div>
            <CardTitle className="text-2xl">Verificando Pagamento...</CardTitle>
            <CardDescription className="text-base">
              Aguarde enquanto confirmamos o status do seu pagamento.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const type = validatedType
  const { icon, title, description, color, borderColor } = resultConfig[type]

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className={`w-full max-w-md border-2 ${borderColor}`}>
        <CardHeader className={`text-center ${color} rounded-t-lg`}>
          <div className="flex justify-center mb-4">
            {icon}
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription className="text-base">
            {description}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {type === 'success' && (
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground">
                Acesse sua área de membro para ver sua carteirinha digital e aproveitar os descontos!
              </p>
            </div>
          )}

          {type === 'error' && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                Possíveis motivos:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li>• Saldo insuficiente</li>
                <li>• Dados do cartão incorretos</li>
                <li>• Limite excedido</li>
              </ul>
            </div>
          )}

          {type === 'pending' && (
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground">
                Pagamentos por boleto podem levar até 3 dias úteis para serem confirmados.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            {type === 'success' ? (
              <Button
                className="flex-1"
                onClick={() => navigate('/membro')}
              >
                <Home className="h-4 w-4 mr-2" />
                Ir para Minha Área
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate('/')}
                >
                  <Home className="h-4 w-4 mr-2" />
                  Início
                </Button>
                {type === 'error' && (
                  <Button
                    className="flex-1"
                    onClick={() => navigate('/assinar')}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Tentar Novamente
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
