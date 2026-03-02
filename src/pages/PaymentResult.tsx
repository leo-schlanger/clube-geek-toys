import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { CheckCircle, XCircle, Clock, Home, RefreshCw } from 'lucide-react'

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

export default function PaymentResult({ type }: PaymentResultProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const paymentId = searchParams.get('payment_id')
  const status = searchParams.get('status')

  // Log payment info for debugging
  useEffect(() => {
    console.log('Payment ID:', paymentId)
    console.log('Status:', status)
  }, [paymentId, status])

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
