import { useState, useEffect, useCallback } from 'react'
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

// PagBank Checkout SDK types
declare global {
  interface Window {
    PagSeguro?: {
      encryptCard: (data: PagBankCardData) => PagBankEncryptResult
    }
  }
}

interface PagBankCardData {
  publicKey: string
  holder: string
  number: string
  expMonth: string
  expYear: string
  securityCode: string
}

interface PagBankEncryptResult {
  encryptedCard: string
  hasErrors: boolean
  errors: Array<{ code: string; message: string }>
}

interface CardTokenizationFormProps {
  amount: number
  onTokenGenerated: (encryptedCard: string, cardInfo: CardInfo) => void
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

const PAGBANK_PUBLIC_KEY = import.meta.env.VITE_PAGBANK_PUBLIC_KEY || ''
const SDK_URL = 'https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js'

export function CardTokenizationForm({
  amount: _,
  onTokenGenerated,
  onCancel,
  disabled = false,
}: CardTokenizationFormProps) {
  void _
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [, setSdkLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cardNumber, setCardNumber] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [securityCode, setSecurityCode] = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [identificationNumber, setIdentificationNumber] = useState('')

  // Load PagBank SDK
  useEffect(() => {
    if (!PAGBANK_PUBLIC_KEY) {
      setError('Chave pública do PagBank não configurada')
      setLoading(false)
      return
    }

    if (window.PagSeguro) {
      setSdkLoaded(true)
      setLoading(false)
      return
    }

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
      if (!window.PagSeguro && script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [])

  const formatCardNumber = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
  }, [])

  const formatExpirationDate = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4)
    if (digits.length > 2) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`
    }
    return digits
  }, [])

  const formatCVV = useCallback((value: string) => {
    return value.replace(/\D/g, '').slice(0, 4)
  }, [])

  const formatCPF = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }, [])

  const detectCardBrand = useCallback((number: string): { name: string; color: string } => {
    const clean = number.replace(/\D/g, '')
    if (clean.startsWith('4')) return { name: 'Visa', color: 'text-blue-600' }
    if (/^5[1-5]/.test(clean)) return { name: 'Mastercard', color: 'text-orange-600' }
    if (/^3[47]/.test(clean)) return { name: 'Amex', color: 'text-blue-500' }
    if (clean.startsWith('636368') || clean.startsWith('438935')) return { name: 'Elo', color: 'text-yellow-600' }
    if (clean.startsWith('606282')) return { name: 'Hipercard', color: 'text-red-600' }
    return { name: 'Cartão', color: 'text-muted-foreground' }
  }, [])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setSubmitting(true)
    setError(null)

    try {
      const cleanCardNumber = cardNumber.replace(/\D/g, '')
      const [month, year] = expirationDate.split('/')

      if (window.PagSeguro && PAGBANK_PUBLIC_KEY) {
        paymentLogger.info('Encrypting card with PagBank SDK...')

        const result = window.PagSeguro.encryptCard({
          publicKey: PAGBANK_PUBLIC_KEY,
          holder: cardholderName.trim().toUpperCase(),
          number: cleanCardNumber,
          expMonth: month.padStart(2, '0'),
          expYear: `20${year}`,
          securityCode: securityCode,
        })

        if (result.hasErrors) {
          const errorMsg = result.errors.map(e => e.message).join(', ')
          throw new Error(errorMsg || 'Erro ao encriptar cartão')
        }

        const cardInfo: CardInfo = {
          lastFourDigits: cleanCardNumber.slice(-4),
          brand: detectCardBrand(cleanCardNumber).name,
          expirationMonth: month.padStart(2, '0'),
          expirationYear: `20${year}`,
          cardholderName: cardholderName.trim().toUpperCase(),
        }

        paymentLogger.info('Card encrypted successfully')
        onTokenGenerated(result.encryptedCard, cardInfo)
      } else {
        // SDK failed to load — block payment regardless of environment.
        // Mock tokens are NEVER acceptable, even in dev: backend now rejects `dev_enc_*` prefixes
        // explicitly to prevent any chance of leaking into production.
        setError('Sistema de pagamento indisponível. Recarregue a página ou tente em alguns minutos.')
        toast.error('Erro de configuração do pagamento')
        return
      }
    } catch (err) {
      paymentLogger.error('Error encrypting card:', err)
      const errorMessage = err instanceof Error ? err.message : 'Erro ao processar cartão. Verifique os dados e tente novamente.'
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

  if (error && !PAGBANK_PUBLIC_KEY) {
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
          <span>Ambiente seguro. Seus dados são criptografados e processados via PagBank.</span>
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
