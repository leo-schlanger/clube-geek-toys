import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'
import type { CreateOrderResult } from '../../lib/orders'
import { createOrder, cartToOrderItems } from '../../lib/orders'
import { formatCurrency, cn } from '../../lib/utils'
import { useCart } from '../../contexts/CartContext'
import { ShopHeader } from '../../components/store/ShopHeader'
import { MemberDiscountBadge } from '../../components/store/MemberDiscountBadge'
import { useShopMember } from '../../components/store/useShopMember'
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

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentChoice>('pix')

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<CreateOrderResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Pré-preenche com os dados do membro logado.
  useEffect(() => {
    if (member) {
      setName((prev) => prev || member.fullName)
      setEmail((prev) => prev || member.email)
      setPhone((prev) => prev || member.phone || '')
    }
  }, [member])

  // Carrinho vazio (e sem pedido criado) → volta para a loja.
  useEffect(() => {
    if (items.length === 0 && !result) {
      navigate('/carrinho', { replace: true })
    }
  }, [items.length, result, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    if (!name.trim() || !email.trim()) {
      toast.error('Preencha seu nome e email.')
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
        paymentMethod,
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
              <ArrowLeft className="mr-1 h-4 w-4" />
              Voltar ao carrinho
            </Link>
          </Button>
        )}

        <h1 className="mb-6 text-2xl font-heading font-bold">Finalizar compra</h1>

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          {/* Coluna principal */}
          <div className="space-y-6">
            {!result ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Dados do cliente */}
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
                      <Label htmlFor="phone">Telefone (opcional)</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(11) 99999-9999"
                        disabled={submitting}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Pagamento */}
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
                      description="Aprovação em minutos. Pague com o app do seu banco."
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
                  </CardContent>
                </Card>

                <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    'Continuar para o pagamento'
                  )}
                </Button>
              </form>
            ) : paymentMethod === 'credit_card' && result.clientSecret ? (
              /* Pagamento com cartão via Stripe */
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
              /* Pagamento com PIX */
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
                      Após o pagamento, a confirmação leva de alguns segundos a poucos minutos.
                      Você pode acompanhar o status na página do pedido.
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

          {/* Resumo do pedido */}
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

                {/* Se o pedido já foi criado, o backend é a fonte da verdade. */}
                {order ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
                    </div>
                    {order.discount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>{order.discountReason || 'Desconto'}</span>
                        <span className="tabular-nums">-{formatCurrency(order.discount)}</span>
                      </div>
                    )}
                    {order.shippingCost > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Frete</span>
                        <span className="tabular-nums">{formatCurrency(order.shippingCost)}</span>
                      </div>
                    )}
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
                        <span className="text-xs">aplicado no total</span>
                      </div>
                    )}
                    <div className="h-px bg-border" />
                    <div className="flex justify-between text-base font-semibold">
                      <span>Total estimado</span>
                      <span className="tabular-nums">
                        {formatCurrency(isMember ? subtotal * 0.85 : subtotal)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O valor final é calculado ao criar o pedido.
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
        'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-60',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-input hover:bg-accent'
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full border-2',
          selected ? 'border-primary' : 'border-muted-foreground/40'
        )}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </span>
    </button>
  )
}
