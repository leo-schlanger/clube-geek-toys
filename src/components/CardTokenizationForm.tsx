import { useState, useEffect, useRef, useCallback } from 'react'
import { paymentLogger } from '../lib/logger'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Loading } from './ui/loading'
import { toast } from 'sonner'
import {
  CreditCard,
  Calendar,
  Lock,
  User,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'

// MercadoPago SDK types
declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale: string }) => MercadoPagoInstance
  }
}

interface CardTokenData {
  cardNumber: string
  cardholderName: string
  cardExpirationMonth: string
  cardExpirationYear: string
  securityCode: string
  identificationType: string
  identificationNumber: string
}

interface CardTokenResponse {
  id: string
  public_key: string
  first_six_digits: string
  last_four_digits: string
  expiration_month: number
  expiration_year: number
  cardholder: {
    name: string
    identification: {
      type: string
      number: string
    }
  }
  status: string
  date_created: string
  date_last_updated: string
  date_due: string
  luhn_validation: boolean
  live_mode: boolean
  require_esc: boolean
  card_number_length: number
  security_code_length: number
}

interface MercadoPagoInstance {
  createCardToken: (data: CardTokenData) => Promise<CardTokenResponse>
  getIdentificationTypes: () => Promise<Array<{ id: string; name: string }>>
  getPaymentMethods: (options: { bin: string }) => Promise<{ results: Array<{ id: string; name: string; payment_type_id: string }> }>
  getIssuers: (options: { paymentMethodId: string; bin: string }) => Promise<Array<{ id: string; name: string }>>
  getInstallments: (options: { amount: string; bin: string; paymentTypeId: string }) => Promise<Array<{ payment_method_id: string; payment_type_id: string; issuer: { id: string; name: string }; payer_costs: Array<{ installments: number; installment_rate: number; labels: string[]; min_allowed_amount: number; max_allowed_amount: number; recommended_message: string; installment_amount: number; total_amount: number }> }>>
}

interface CardTokenizationFormProps {
  amount: number // Used by MercadoPago SDK for validation
  onTokenGenerated: (token: string, cardInfo: CardInfo) => void
  onCancel: () => void
  disabled?: boolean
}

export interface CardInfo {
  lastFourDigits: string
  brand: string
  expirationMonth: string
  expirationYear: string
  cardholderName: string
}

const MERCADOPAGO_PUBLIC_KEY = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || ''
const SDK_URL = 'https://sdk.mercadopago.com/js/v2'

export function CardTokenizationForm({
  amount: _, // Amount passed for future installment calculations
  onTokenGenerated,
  onCancel,
  disabled = false,
}: CardTokenizationFormProps) {
  void _ // Suppress unused variable warning - amount reserved for installments API
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [sdkLoaded, setSdkLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Manual form state (fallback when SDK is not available)
  const [cardNumber, setCardNumber] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [securityCode, setSecurityCode] = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [identificationNumber, setIdentificationNumber] = useState('')

  const mpInstanceRef = useRef<MercadoPagoInstance | null>(null)

  // Load MercadoPago SDK
  useEffect(() => {
    if (!MERCADOPAGO_PUBLIC_KEY) {
      setError('Chave pública do Mercado Pago não configurada')
      setLoading(false)
      return
    }

    // Check if SDK is already loaded
    if (window.MercadoPago) {
      setSdkLoaded(true)
      setLoading(false)
      return
    }

    // Load SDK dynamically
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = () => {
      setSdkLoaded(true)
      setLoading(false)
    }
    script.onerror = () => {
      setError('Erro ao carregar SDK de pagamento')
      setLoading(false)
    }
    document.body.appendChild(script)

    return () => {
      // Cleanup: remove script if component unmounts during loading
      if (!window.MercadoPago && script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [])

  // Initialize MercadoPago form
  useEffect(() => {
    if (!sdkLoaded || !window.MercadoPago || !MERCADOPAGO_PUBLIC_KEY) return

    try {
      mpInstanceRef.current = new window.MercadoPago(MERCADOPAGO_PUBLIC_KEY, {
        locale: 'pt-BR',
      })
      setLoading(false)
    } catch (err) {
      paymentLogger.error('Error initializing MercadoPago:', err)
      setError('Erro ao inicializar pagamento')
      setLoading(false)
    }
  }, [sdkLoaded])

  // Format card number (add spaces)
  const formatCardNumber = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
  }, [])

  // Format expiration date
  const formatExpirationDate = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4)
    if (digits.length > 2) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`
    }
    return digits
  }, [])

  // Format CVV
  const formatCVV = useCallback((value: string) => {
    return value.replace(/\D/g, '').slice(0, 4)
  }, [])

  // Format CPF
  const formatCPF = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }, [])

  // Detect card brand with emoji icons
  const detectCardBrand = useCallback((number: string): { name: string; color: string } => {
    const clean = number.replace(/\D/g, '')
    if (clean.startsWith('4')) return { name: 'Visa', color: 'text-blue-600' }
    if (/^5[1-5]/.test(clean)) return { name: 'Mastercard', color: 'text-orange-600' }
    if (/^3[47]/.test(clean)) return { name: 'Amex', color: 'text-blue-500' }
    if (clean.startsWith('636368') || clean.startsWith('438935')) return { name: 'Elo', color: 'text-yellow-600' }
    if (clean.startsWith('606282')) return { name: 'Hipercard', color: 'text-red-600' }
    return { name: 'Cartão', color: 'text-muted-foreground' }
  }, [])

  // Validate form
  const validateForm = useCallback((): boolean => {
    const cleanCardNumber = cardNumber.replace(/\D/g, '')
    if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
      toast.error('Número do cartão inválido')
      return false
    }

    const [month, year] = expirationDate.split('/')
    const currentYear = new Date().getFullYear() % 100
    const currentMonth = new Date().getMonth() + 1

    if (!month || !year || parseInt(month) < 1 || parseInt(month) > 12) {
      toast.error('Data de validade inválida')
      return false
    }

    if (parseInt(year) < currentYear || (parseInt(year) === currentYear && parseInt(month) < currentMonth)) {
      toast.error('Cartão expirado')
      return false
    }

    if (securityCode.length < 3) {
      toast.error('CVV inválido')
      return false
    }

    if (cardholderName.trim().length < 3) {
      toast.error('Nome no cartão inválido')
      return false
    }

    const cleanCPF = identificationNumber.replace(/\D/g, '')
    if (cleanCPF.length !== 11) {
      toast.error('CPF inválido')
      return false
    }

    return true
  }, [cardNumber, expirationDate, securityCode, cardholderName, identificationNumber])

  // Map Mercado Pago error codes to user-friendly messages
  const getMercadoPagoErrorMessage = (error: unknown): string => {
    const errorMessages: Record<string, string> = {
      '205': 'Número do cartão inválido',
      '208': 'Mês de expiração inválido',
      '209': 'Ano de expiração inválido',
      '212': 'Tipo de documento inválido',
      '213': 'Número de documento inválido',
      '214': 'Número de documento inválido',
      '220': 'Banco emissor não encontrado',
      '221': 'Nome do titular inválido',
      '224': 'Código de segurança inválido',
      'E301': 'Número do cartão inválido',
      'E302': 'Código de segurança inválido',
      '316': 'Nome do titular inválido',
      '322': 'Tipo de documento inválido',
      '323': 'Documento inválido',
      '324': 'Documento inválido',
      '325': 'Mês de expiração inválido',
      '326': 'Ano de expiração inválido',
    }

    if (error && typeof error === 'object' && 'cause' in error) {
      const cause = (error as { cause?: Array<{ code: string }> }).cause
      if (Array.isArray(cause) && cause.length > 0) {
        const code = cause[0].code
        return errorMessages[code] || `Erro de validação: ${code}`
      }
    }

    if (error && typeof error === 'object' && 'message' in error) {
      return (error as { message: string }).message
    }

    return 'Erro ao processar cartão. Verifique os dados e tente novamente.'
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setSubmitting(true)
    setError(null)

    try {
      const cleanCardNumber = cardNumber.replace(/\D/g, '')
      const [month, year] = expirationDate.split('/')
      const cleanCPF = identificationNumber.replace(/\D/g, '')

      // If MercadoPago SDK is available, use it to create real token
      if (mpInstanceRef.current && MERCADOPAGO_PUBLIC_KEY) {
        paymentLogger.info('Creating card token with MercadoPago SDK...')

        const tokenData: CardTokenData = {
          cardNumber: cleanCardNumber,
          cardholderName: cardholderName.trim().toUpperCase(),
          cardExpirationMonth: month.padStart(2, '0'),
          cardExpirationYear: `20${year}`,
          securityCode: securityCode,
          identificationType: 'CPF',
          identificationNumber: cleanCPF,
        }

        const tokenResponse = await mpInstanceRef.current.createCardToken(tokenData)

        if (!tokenResponse || !tokenResponse.id) {
          throw new Error('Token inválido retornado pelo Mercado Pago')
        }

        const cardInfo: CardInfo = {
          lastFourDigits: tokenResponse.last_four_digits,
          brand: detectCardBrand(cleanCardNumber).name,
          expirationMonth: String(tokenResponse.expiration_month).padStart(2, '0'),
          expirationYear: String(tokenResponse.expiration_year),
          cardholderName: tokenResponse.cardholder?.name || cardholderName.trim().toUpperCase(),
        }

        paymentLogger.info('Card token generated successfully:', tokenResponse.id.substring(0, 8) + '...')
        onTokenGenerated(tokenResponse.id, cardInfo)
      } else {
        // Fallback: generate mock token ONLY in development mode
        const isDevelopment = import.meta.env.VITE_ENVIRONMENT === 'development'

        if (!isDevelopment) {
          setError('Mercado Pago SDK não disponível. Tente novamente.')
          toast.error('Erro de configuração do pagamento')
          return
        }

        // Development mock token
        const mockToken = `dev_tok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const cardInfo: CardInfo = {
          lastFourDigits: cleanCardNumber.slice(-4),
          brand: detectCardBrand(cleanCardNumber).name,
          expirationMonth: month,
          expirationYear: `20${year}`,
          cardholderName: cardholderName.trim().toUpperCase(),
        }

        paymentLogger.warn('Using MOCK token (development mode only)')
        toast.info('Modo desenvolvimento: usando token de teste')
        onTokenGenerated(mockToken, cardInfo)
      }
    } catch (err) {
      paymentLogger.error('Error generating card token:', err)
      const errorMessage = getMercadoPagoErrorMessage(err)
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="py-8">
        <Loading size="lg" text="Carregando formulário de pagamento..." />
      </div>
    )
  }

  if (error && !MERCADOPAGO_PUBLIC_KEY) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
        <p className="text-red-500 font-medium mb-2">Pagamento não disponível</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button variant="outline" onClick={onCancel}>
          Voltar
        </Button>
      </div>
    )
  }

  const cardBrand = detectCardBrand(cardNumber)
  const isCardNumberValid = cardNumber.replace(/\D/g, '').length >= 13

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Card visualization */}
      <div className="relative p-5 bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-xl text-white shadow-lg">
        <div className="flex justify-between items-start mb-8">
          <div className="text-xs opacity-70">Cartão de Crédito</div>
          {isCardNumberValid && (
            <span className={`text-sm font-bold ${cardBrand.color.replace('text-', 'text-')}`}>
              {cardBrand.name}
            </span>
          )}
        </div>
        <div className="font-mono text-lg tracking-wider mb-6">
          {cardNumber || '•••• •••• •••• ••••'}
        </div>
        <div className="flex justify-between">
          <div>
            <div className="text-xs opacity-70 mb-1">TITULAR</div>
            <div className="text-sm font-medium truncate max-w-[180px]">
              {cardholderName || 'NOME NO CARTÃO'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-70 mb-1">VALIDADE</div>
            <div className="text-sm font-medium">
              {expirationDate || 'MM/AA'}
            </div>
          </div>
        </div>
      </div>

      {/* Card Number */}
      <div className="space-y-2">
        <Label htmlFor="cardNumber" className="flex items-center gap-2 text-sm font-medium">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          Número do Cartão
        </Label>
        <div className="relative">
          <Input
            id="cardNumber"
            type="text"
            inputMode="numeric"
            placeholder="0000 0000 0000 0000"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            disabled={disabled || submitting}
            required
            autoComplete="cc-number"
            className="pr-10"
          />
          {isCardNumberValid && (
            <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
          )}
        </div>
      </div>

      {/* Expiration and CVV */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="expirationDate" className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Validade
          </Label>
          <Input
            id="expirationDate"
            type="text"
            inputMode="numeric"
            placeholder="MM/AA"
            value={expirationDate}
            onChange={(e) => setExpirationDate(formatExpirationDate(e.target.value))}
            disabled={disabled || submitting}
            required
            autoComplete="cc-exp"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="securityCode" className="flex items-center gap-2 text-sm font-medium">
            <Lock className="h-4 w-4 text-muted-foreground" />
            CVV
          </Label>
          <Input
            id="securityCode"
            type="password"
            inputMode="numeric"
            placeholder="•••"
            value={securityCode}
            onChange={(e) => setSecurityCode(formatCVV(e.target.value))}
            disabled={disabled || submitting}
            required
            autoComplete="cc-csc"
            maxLength={4}
          />
        </div>
      </div>

      {/* Cardholder Name */}
      <div className="space-y-2">
        <Label htmlFor="cardholderName" className="flex items-center gap-2 text-sm font-medium">
          <User className="h-4 w-4 text-muted-foreground" />
          Nome no Cartão
        </Label>
        <Input
          id="cardholderName"
          type="text"
          placeholder="NOME COMO NO CARTÃO"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
          disabled={disabled || submitting}
          required
          autoComplete="cc-name"
        />
      </div>

      {/* CPF */}
      <div className="space-y-2">
        <Label htmlFor="identificationNumber" className="text-sm font-medium">
          CPF do Titular
        </Label>
        <Input
          id="identificationNumber"
          type="text"
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={identificationNumber}
          onChange={(e) => setIdentificationNumber(formatCPF(e.target.value))}
          disabled={disabled || submitting}
          required
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Security note */}
      <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
        <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-2">
          <Lock className="h-4 w-4 flex-shrink-0" />
          <span>Ambiente seguro. Seus dados são criptografados e processados via Mercado Pago.</span>
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={submitting}
        >
          Voltar
        </Button>
        <Button
          type="submit"
          className="flex-1 bg-green-600 hover:bg-green-700"
          disabled={disabled || submitting}
        >
          {submitting ? (
            <Loading size="sm" />
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" />
              Confirmar Cartão
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
