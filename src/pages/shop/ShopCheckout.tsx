import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  CreditCard,
  QrCode,
  Copy,
  Check,
  ArrowLeft,
  ShoppingBag,
  Sparkles,
  Loader2,
  Clock,
  Truck,
  MapPin,
} from 'lucide-react'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'
import type { CreateOrderResult } from '../../lib/orders'
import { createOrder, cartToOrderItems } from '../../lib/orders'
import {
  lookupCep,
  quoteShipping,
  maskCep,
  type ShippingOption,
  type ShippingQuoteResult,
} from '../../lib/shipping'
import { formatCurrency, cn } from '../../lib/utils'
import { useCart } from '../../contexts/CartContext'
import { ShopHeader } from '../../components/store/ShopHeader'
import { MemberDiscountBadge } from '../../components/store/MemberDiscountBadge'
import { useShopMember } from '../../components/store/useShopMember'
import { PaymentTrustBadges } from '../../components/store/PaymentTrustBadges'
import { SeoHead } from '../../components/store/SeoHead'
import { getStoreCredit } from '../../lib/reviews'
import { useAuth } from '../../contexts/AuthContext'
import { StripePaymentForm } from '../../components/StripePaymentForm'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'

type PaymentChoice = 'credit_card' | 'pix'

export default function ShopCheckout() {
  const navigate = useNavigate()
  const { items, subtotal } = useCart()
  const { member, isMember } = useShopMember()
  const { user } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentChoice>('pix')
  const [storeCreditBalance, setStoreCreditBalance] = useState(0)
  const [applyStoreCredit, setApplyStoreCredit] = useState(true)

  // Address
  const [cep, setCep] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [complement, setComplement] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [cepLoading, setCepLoading] = useState(false)

  // Shipping
  const [quote, setQuote] = useState<ShippingQuoteResult | null>(null)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<CreateOrderResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (member) {
      setName((prev) => prev || member.fullName)
      setEmail((prev) => prev || member.email)
      setPhone((prev) => prev || member.phone || '')
    }
  }, [member])

  useEffect(() => {
    let active = true
    if (!user) {
      queueMicrotask(() => {
        if (active) setStoreCreditBalance(0)
      })
      return () => {
        active = false
      }
    }
    getStoreCredit()
      .then((c) => {
        if (active) setStoreCreditBalance(c.balance)
      })
      .catch(() => {
        if (active) setStoreCreditBalance(0)
      })
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (items.length === 0 && !result) {
      navigate('/carrinho', { replace: true })
    }
  }, [items.length, result, navigate])

  const selectedOption: ShippingOption | null =
    quote?.options.find((o) => o.id === selectedServiceId) ?? null

  const estimatedCredit = (() => {
    if (!applyStoreCredit || storeCreditBalance <= 0) return 0
    const goods = isMember ? subtotal * 0.85 : subtotal
    return Math.min(storeCreditBalance, goods)
  })()

  const estimatedTotal = (() => {
    const goods = isMember ? subtotal * 0.85 : subtotal
    const ship = selectedOption?.price ?? 0
    return Math.max(0, goods - estimatedCredit + ship)
  })()

  const handleCepBlur = useCallback(async () => {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const data = await lookupCep(digits)
      setStreet(data.street || '')
      setNeighborhood(data.neighborhood || '')
      setCity(data.city)
      setState(data.state)
      setCep(maskCep(data.cep))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'CEP não encontrado')
    } finally {
      setCepLoading(false)
    }
  }, [cep])

  const handleQuote = useCallback(async () => {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) {
      toast.error('Informe um CEP válido para calcular o frete.')
      return
    }
    if (items.length === 0) return
    setQuoteLoading(true)
    setSelectedServiceId(null)
    try {
      const q = await quoteShipping(digits, cartToOrderItems(items))
      setQuote(q)
      if (q.options[0]) setSelectedServiceId(q.options[0].id)
      if (q.source === 'fallback') {
        toast.message('Frete estimado (tabela)', {
          description: 'Conecte o Melhor Envio em produção para cotação em tempo real.',
        })
      }
    } catch (err) {
      setQuote(null)
      toast.error(err instanceof Error ? err.message : 'Erro ao calcular frete')
    } finally {
      setQuoteLoading(false)
    }
  }, [cep, items])

  // Auto-quote when CEP is complete and city is filled
  useEffect(() => {
    const digits = cep.replace(/\D/g, '')
    if (digits.length === 8 && city && items.length > 0 && !result) {
      void handleQuote()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-quote when CEP/city/items change
  }, [city, cep, items.length])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    if (!name.trim() || !email.trim()) {
      toast.error('Preencha seu nome e email.')
      return
    }
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8 || !street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || !state.trim()) {
      toast.error('Preencha o endereço completo de entrega.')
      return
    }
    if (!quote || !selectedServiceId) {
      toast.error('Calcule e selecione o frete pelos Correios.')
      return
    }

    setSubmitting(true)
    try {
      const res = await createOrder({
        items: cartToOrderItems(items),
        customer: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
        },
        shippingAddress: {
          cep: digits,
          street: street.trim(),
          number: number.trim(),
          complement: complement.trim() || undefined,
          neighborhood: neighborhood.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase().slice(0, 2),
          recipientName: name.trim(),
        },
        shipping: {
          quoteToken: quote.quoteToken,
          serviceId: selectedServiceId,
        },
        paymentMethod,
        applyStoreCredit: Boolean(user && applyStoreCredit && storeCreditBalance > 0),
      })
      setResult(res)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível criar o pedido.'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function copyEmv() {
    const code = result?.pixData?.emvCode
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success('Código PIX copiado!')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Não foi possível copiar. Copie manualmente.')
    }
  }

  const order = result?.order

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title="Finalizar compra"
        description="Checkout seguro GeekPop & Toys — frete Correios, PIX e cartão."
        path="/checkout"
        noIndex
      />
      <ShopHeader isMember={isMember} />

      <main className="mx-auto max-w-4xl px-4 py-6">
        {!result && (
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="mb-4 -ml-2 text-muted-foreground"
          >
            <Link to="/carrinho">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao carrinho
            </Link>
          </Button>
        )}

        <h1 className="mb-6 text-2xl font-heading font-bold">Finalizar compra</h1>

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            {!result ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Seus dados</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome completo</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Seu nome"
                        required
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        required
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone / WhatsApp</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(21) 99999-9999"
                        disabled={submitting}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <MapPin className="h-5 w-5 text-primary" />
                      Endereço de entrega
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                      <div className="space-y-2">
                        <Label htmlFor="cep">CEP</Label>
                        <Input
                          id="cep"
                          value={cep}
                          onChange={(e) => setCep(maskCep(e.target.value))}
                          onBlur={() => void handleCepBlur()}
                          placeholder="00000-000"
                          inputMode="numeric"
                          required
                          disabled={submitting || cepLoading}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleCepBlur().then(() => handleQuote())}
                          disabled={cepLoading || quoteLoading || submitting}
                        >
                          {(cepLoading || quoteLoading) && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          Buscar CEP e frete
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="street">Rua / Avenida</Label>
                      <Input
                        id="street"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        required
                        disabled={submitting}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="number">Número</Label>
                        <Input
                          id="number"
                          value={number}
                          onChange={(e) => setNumber(e.target.value)}
                          required
                          disabled={submitting}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="complement">Complemento</Label>
                        <Input
                          id="complement"
                          value={complement}
                          onChange={(e) => setComplement(e.target.value)}
                          placeholder="Apto, bloco…"
                          disabled={submitting}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="neighborhood">Bairro</Label>
                      <Input
                        id="neighborhood"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        required
                        disabled={submitting}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="city">Cidade</Label>
                        <Input
                          id="city"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          required
                          disabled={submitting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">UF</Label>
                        <Input
                          id="state"
                          value={state}
                          onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                          maxLength={2}
                          required
                          disabled={submitting}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Truck className="h-5 w-5 text-primary" />
                      Frete (Correios)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {quoteLoading && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Calculando frete…
                      </div>
                    )}
                    {!quoteLoading && quote && quote.options.length > 0 && (
                      <div className="space-y-2">
                        {quote.options.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSelectedServiceId(opt.id)}
                            disabled={submitting}
                            className={cn(
                              'flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors',
                              selectedServiceId === opt.id
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'border-border hover:border-primary/40'
                            )}
                          >
                            <div>
                              <p className="font-medium">
                                {opt.company} — {opt.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Prazo estimado: {opt.days} dia{opt.days === 1 ? '' : 's'} útil
                                {opt.days === 1 ? '' : 'eis'}
                              </p>
                            </div>
                            <span className="shrink-0 font-semibold tabular-nums">
                              {formatCurrency(opt.price)}
                            </span>
                          </button>
                        ))}
                        <p className="text-xs text-muted-foreground">
                          Envio pelos Correios a partir da loja em Copacabana, RJ.
                        </p>
                      </div>
                    )}
                    {!quoteLoading && !quote && (
                      <p className="text-sm text-muted-foreground">
                        Informe o CEP para ver as opções PAC e SEDEX.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Forma de pagamento</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <PaymentOption
                      selected={paymentMethod === 'pix'}
                      onSelect={() => setPaymentMethod('pix')}
                      icon={<QrCode className="h-5 w-5" />}
                      title="PIX"
                      description="QR Code e copia-e-cola. Confirmação após identificação do pagamento."
                      disabled={submitting}
                    />
                    <PaymentOption
                      selected={paymentMethod === 'credit_card'}
                      onSelect={() => setPaymentMethod('credit_card')}
                      icon={<CreditCard className="h-5 w-5" />}
                      title="Cartão de crédito"
                      description="Pagamento seguro processado pela Stripe."
                      disabled={submitting}
                    />
                    <PaymentTrustBadges className="pt-2" />
                  </CardContent>
                </Card>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={submitting || !selectedServiceId}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    `Continuar · ${formatCurrency(estimatedTotal)}`
                  )}
                </Button>
              </form>
            ) : paymentMethod === 'credit_card' && result.clientSecret ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Pagamento com cartão</CardTitle>
                </CardHeader>
                <CardContent>
                  <StripePaymentForm
                    clientSecret={result.clientSecret}
                    amount={order?.total}
                    submitLabel={order ? `Pagar ${formatCurrency(order.total)}` : undefined}
                    onSuccess={() => navigate(`/pedido/${order?.id}`)}
                    onError={(msg) => toast.error(msg)}
                    onCancel={() => setResult(null)}
                  />
                </CardContent>
              </Card>
            ) : result.pixData ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <QrCode className="h-5 w-5" />
                    Pague com PIX
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-center">
                    <div className="rounded-xl bg-white p-4">
                      <QRCodeSVG value={result.pixData.emvCode} size={200} level="M" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emv">PIX Copia e Cola</Label>
                    <div className="flex gap-2">
                      <Input
                        id="emv"
                        readOnly
                        value={result.pixData.emvCode}
                        className="font-mono text-xs"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button type="button" variant="outline" size="icon" onClick={copyEmv}>
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Após o pagamento, a confirmação pode levar alguns minutos. Acompanhe o status
                      na página do pedido ou em Minhas compras.
                    </span>
                  </div>

                  <Button asChild size="lg" className="w-full">
                    <Link to={`/pedido/${order?.id}`}>Acompanhar pedido</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Pedido criado. Redirecionando...
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="h-4 w-4" />
                  Resumo do pedido
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  {items.map((item) => (
                    <li key={item.productId} className="flex justify-between gap-2">
                      <span className="line-clamp-1 text-muted-foreground">
                        {item.quantity}× {item.name}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="h-px bg-border" />

                {order ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
                    </div>
                    {order.discount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>
                          {(order.storeCreditApplied ?? 0) > 0 &&
                          order.discountReason?.includes('member')
                            ? 'Descontos'
                            : order.discountReason === 'store_credit'
                              ? 'Crédito de avaliação'
                              : 'Desconto clube 15%'}
                        </span>
                        <span className="tabular-nums">-{formatCurrency(order.discount)}</span>
                      </div>
                    )}
                    {(order.storeCreditApplied ?? 0) > 0 && (
                      <p className="text-xs text-green-600">
                        Inclui {formatCurrency(order.storeCreditApplied!)} de crédito de loja
                      </p>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Frete{order.shippingService ? ` (${order.shippingService})` : ''}
                      </span>
                      <span className="tabular-nums">{formatCurrency(order.shippingCost)}</span>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex justify-between text-base font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">{formatCurrency(order.total)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                    </div>
                    {isMember && (
                      <div className="flex items-center justify-between text-green-600">
                        <MemberDiscountBadge />
                        <span className="tabular-nums">-{formatCurrency(subtotal * 0.15)}</span>
                      </div>
                    )}
                    {user && storeCreditBalance > 0 && (
                      <label className="flex items-center justify-between gap-2 text-green-600 cursor-pointer">
                        <span className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={applyStoreCredit}
                            onChange={(e) => setApplyStoreCredit(e.target.checked)}
                            className="rounded border-input"
                          />
                          Usar crédito ({formatCurrency(storeCreditBalance)})
                        </span>
                        {applyStoreCredit && estimatedCredit > 0 && (
                          <span className="tabular-nums text-sm">
                            -{formatCurrency(estimatedCredit)}
                          </span>
                        )}
                      </label>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Frete</span>
                      <span className="tabular-nums">
                        {selectedOption
                          ? formatCurrency(selectedOption.price)
                          : 'Calcular'}
                      </span>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex justify-between text-base font-semibold">
                      <span>Total estimado</span>
                      <span className="tabular-nums">{formatCurrency(estimatedTotal)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O valor final é confirmado ao criar o pedido (frete revalidado no servidor).
                    </p>
                  </div>
                )}

                {!order && !isMember && (
                  <Link
                    to="/entrar"
                    className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs transition-colors hover:bg-primary/10"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      Membros ganham 15% de desconto.{' '}
                      <strong className="text-primary">Entrar</strong>
                    </span>
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

function PaymentOption({
  selected,
  onSelect,
  icon,
  title,
  description,
  disabled,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  description: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/40',
        disabled && 'opacity-60'
      )}
    >
      <span className="mt-0.5 text-primary">{icon}</span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}
