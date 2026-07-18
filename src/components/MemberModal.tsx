import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { logger } from '../lib/logger'
import { sanitizeName, normalizeEmail, normalizePhone, normalizeCPF } from '../lib/sanitize'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Loading } from './ui/loading'
import { PLANS, type Member, type MemberStatus, type MemberWithSubscription } from '../types'
import { createMember, updateMember, activateMember } from '../lib/members'
import { api } from '../lib/api-client'
import { formatCurrency, formatCPF, validateCPF, getStatusLabel } from '../lib/utils'
import { fullCPFValidation, type CPFValidationResult } from '../lib/cpf-validation'
import { toast } from 'sonner'
import {
  X,
  User,
  Mail,
  Phone,
  CreditCard,
  Calendar,
  Star,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Receipt,
  FileText,
  Download,
  ShieldCheck,
  Pause,
  Play,
  Ban,
} from 'lucide-react'

// Validation schema
const memberSchema = z.object({
  fullName: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  cpf: z.string().refine((val) => validateCPF(val), 'CPF inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  plan: z.literal('club'),
  paymentType: z.literal('annual'),
  status: z.enum(['active', 'pending', 'inactive', 'expired']).optional(),
})

type MemberFormData = z.infer<typeof memberSchema>

interface MemberModalProps {
  mode: 'create' | 'edit' | 'view'
  member?: Member | null
  onClose: () => void
  onSuccess: () => void
}

export function MemberModal({ mode, member, onClose, onSuccess }: MemberModalProps) {
  const [loading, setLoading] = useState(false)
  const [cpfValidation, setCpfValidation] = useState<CPFValidationResult | null>(null)
  const [validatingCpf, setValidatingCpf] = useState(false)
  const [localMember, setLocalMember] = useState<Member | null>(member || null)

  // Admin detail sections state
  const [payments, setPayments] = useState<Record<string, unknown>[] | null>(null)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [showPayments, setShowPayments] = useState(false)

  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [showSubscription, setShowSubscription] = useState(false)
  const [subscriptionActionLoading, setSubscriptionActionLoading] = useState(false)

  const [contract, setContract] = useState<Record<string, unknown> | null>(null)
  const [contractLoading, setContractLoading] = useState(false)
  const [showContract, setShowContract] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; message: string } | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)

  const fetchedRef = useRef(false)

  const isViewMode = mode === 'view'
  const isEditMode = mode === 'edit'
  const isCreateMode = mode === 'create'

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      fullName: member?.fullName || '',
      email: member?.email || '',
      cpf: member?.cpf ? formatCPF(member.cpf) : '',
      phone: member?.phone || '',
      plan: 'club',
      paymentType: 'annual',
      status: member?.status || 'pending',
    },
  })

  const selectedStatus = watch('status')

  useEffect(() => {
    if (member) {
      reset({
        fullName: member.fullName,
        email: member.email,
        cpf: formatCPF(member.cpf),
        phone: member.phone,
        plan: member.plan,
        paymentType: member.paymentType,
        status: member.status,
      })
      setLocalMember(member)
    }
  }, [member, reset])

  // Fetch admin detail data in view mode
  useEffect(() => {
    if (!isViewMode || !member?.id || fetchedRef.current) return
    fetchedRef.current = true

    // Fetch payments
    setPaymentsLoading(true)
    api.get<Record<string, unknown>[]>(`/members/${member.id}/payments`)
      .then((res) => { setPayments((res.data as Record<string, unknown>[]) || []) })
      .catch(() => { setPayments([]) })
      .finally(() => setPaymentsLoading(false))

    // Fetch subscription (only if member has subscriptionId)
    if ((member as MemberWithSubscription).subscriptionId) {
      setSubscriptionLoading(true)
      api.get<Record<string, unknown>>(`/members/${member.id}/subscription`)
        .then((res) => { setSubscription((res.data as Record<string, unknown>) || null) })
        .catch(() => { setSubscription(null) })
        .finally(() => setSubscriptionLoading(false))
    }

    // Fetch contract
    setContractLoading(true)
    api.get<Record<string, unknown>>(`/contracts/${member.id}`)
      .then((res) => { setContract((res.data as Record<string, unknown>) || null) })
      .catch(() => { setContract(null) })
      .finally(() => setContractLoading(false))
  }, [isViewMode, member?.id, member])

  async function handleSubscriptionAction(action: 'pause' | 'resume' | 'cancel') {
    if (!subscription) return
    if (action === 'cancel' && !window.confirm('Tem certeza que deseja cancelar a assinatura? Esta ação não pode ser desfeita.')) return

    setSubscriptionActionLoading(true)
    try {
      const subId = subscription.id as string
      if (action === 'pause') {
        await api.put(`/subscription/${subId}/pause`)
        setSubscription({ ...subscription, status: 'paused' })
        toast.success('Assinatura pausada')
      } else if (action === 'resume') {
        await api.put(`/subscription/${subId}/resume`)
        setSubscription({ ...subscription, status: 'authorized' })
        toast.success('Assinatura retomada')
      } else {
        await api.put(`/subscription/${subId}/cancel`)
        setSubscription({ ...subscription, status: 'cancelled' })
        toast.success('Assinatura cancelada')
      }
    } catch {
      toast.error('Erro ao atualizar assinatura')
    }
    setSubscriptionActionLoading(false)
  }

  async function handleVerifyContract() {
    if (!contract) return
    setVerifyLoading(true)
    setVerifyResult(null)
    try {
      const res = await api.get<{ valid: boolean; message: string }>(`/contracts/${contract.id as string}/verify`)
      setVerifyResult(res.data as { valid: boolean; message: string })
    } catch {
      setVerifyResult({ valid: false, message: 'Erro ao verificar integridade' })
    }
    setVerifyLoading(false)
  }

  // Keyboard shortcuts
  const handleSaveShortcut = useCallback(
    (e: KeyboardEvent) => {
      if (!isViewMode && !loading) {
        e.preventDefault()
        // Trigger form submit via handleSubmit
        handleSubmit(() => {
          const form = document.querySelector('form')
          if (form) form.requestSubmit()
        })()
      }
    },
    [isViewMode, loading, handleSubmit]
  )

  useKeyboardShortcuts({
    esc: onClose,
    'ctrl+s': handleSaveShortcut,
  })

  async function onSubmit(data: MemberFormData) {
    setLoading(true)

    // Sanitizar inputs
    const sanitizedData = {
      fullName: sanitizeName(data.fullName),
      email: normalizeEmail(data.email),
      phone: normalizePhone(data.phone),
      cpf: normalizeCPF(data.cpf),
      plan: data.plan,
      paymentType: data.paymentType,
      status: data.status,
    }

    try {
      if (isCreateMode) {
        // Create new member (without user_id since it's created by admin)
        const result = await createMember('admin-created', {
          fullName: sanitizedData.fullName,
          email: sanitizedData.email,
          cpf: sanitizedData.cpf,
          phone: sanitizedData.phone,
          plan: sanitizedData.plan,
          paymentType: sanitizedData.paymentType,
        })

        if (result) {
          toast.success('Membro criado com sucesso!')
          onSuccess()
        } else {
          toast.error('Erro ao criar membro')
        }
      } else if (isEditMode && member) {
        // Update existing member
        const success = await updateMember(member.id, {
          fullName: sanitizedData.fullName,
          email: sanitizedData.email,
          cpf: sanitizedData.cpf,
          phone: sanitizedData.phone,
          plan: sanitizedData.plan,
          paymentType: sanitizedData.paymentType,
          status: sanitizedData.status as MemberStatus,
        })

        if (success) {
          toast.success('Membro atualizado com sucesso!')
          onSuccess()
        } else {
          toast.error('Erro ao atualizar membro')
        }
      }
    } catch (error) {
      logger.error('Error saving member:', error)
      toast.error('Erro ao salvar membro')
    }

    setLoading(false)
  }

  async function handleActivate() {
    if (!member) return

    setLoading(true)
    const success = await activateMember(member.id)

    if (success) {
      toast.success('Membro ativado com sucesso!')
      onSuccess()
    } else {
      toast.error('Erro ao ativar membro')
    }

    setLoading(false)
  }

  function formatCPFInput(value: string) {
    const numbers = value.replace(/\D/g, '')
    return numbers
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  function formatPhoneInput(value: string) {
    const numbers = value.replace(/\D/g, '')
    if (numbers.length <= 10) {
      return numbers
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2')
    }
    return numbers
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
  }

  /**
   * Validate CPF via Brasil API
   */
  async function handleValidateCPF(cpf: string) {
    const cleaned = cpf.replace(/\D/g, '')
    if (cleaned.length !== 11) {
      setCpfValidation(null)
      return
    }

    setValidatingCpf(true)
    setCpfValidation(null)

    const result = await fullCPFValidation(cleaned)
    setCpfValidation(result)
    setValidatingCpf(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <CardTitle>
            {isCreateMode ? 'Novo Membro' : isEditMode ? 'Editar Membro' : 'Detalhes do Membro'}
          </CardTitle>
          <CardDescription>
            {isCreateMode
              ? 'Preencha os dados para cadastrar um novo membro'
              : isEditMode
              ? 'Atualize os dados do membro'
              : 'Visualize os dados do membro'}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {/* Current status (view/edit only) */}
            {member && (
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant="club" className="gap-1">
                    <Star className="h-4 w-4" />
                    {PLANS[member.plan].name}
                  </Badge>
                  <Badge
                    variant={
                      member.status === 'active'
                        ? 'success'
                        : member.status === 'pending'
                        ? 'warning'
                        : 'destructive'
                    }
                  >
                    {getStatusLabel(member.status)}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Expira: {new Date(member.expiryDate).toLocaleDateString('pt-BR')}
                </div>
              </div>
            )}

            {/* Personal data */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome Completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    placeholder="Nome completo"
                    className="pl-10"
                    disabled={isViewMode}
                    {...register('fullName')}
                  />
                </div>
                {errors.fullName && (
                  <p className="text-xs text-red-500">{errors.fullName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@exemplo.com"
                    className="pl-10"
                    disabled={isViewMode}
                    {...register('email')}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="cpf"
                    placeholder="000.000.000-00"
                    className={`pl-10 pr-10 ${
                      cpfValidation
                        ? cpfValidation.valid
                          ? 'border-green-500 focus-visible:ring-green-500'
                          : 'border-red-500 focus-visible:ring-red-500'
                        : ''
                    }`}
                    disabled={isViewMode}
                    maxLength={14}
                    {...register('cpf')}
                    onChange={(e) => {
                      e.target.value = formatCPFInput(e.target.value)
                      setValue('cpf', e.target.value)
                      setCpfValidation(null)
                    }}
                    onBlur={(e) => {
                      if (!isViewMode && e.target.value.replace(/\D/g, '').length === 11) {
                        handleValidateCPF(e.target.value)
                      }
                    }}
                  />
                  {/* Validation indicator */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2" title={cpfValidation?.message}>
                    {validatingCpf && (
                      <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                    )}
                    {!validatingCpf && cpfValidation && (
                      cpfValidation.valid ? (
                        cpfValidation.exists === true ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : cpfValidation.exists === null ? (
                          <HelpCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )
                    )}
                  </div>
                </div>
                {errors.cpf && (
                  <p className="text-xs text-red-500">{errors.cpf.message}</p>
                )}
                {cpfValidation && !errors.cpf && (
                  <p className={`text-xs ${
                    cpfValidation.valid
                      ? cpfValidation.exists === true
                        ? 'text-green-600'
                        : 'text-yellow-600'
                      : 'text-red-500'
                  }`}>
                    {cpfValidation.message}
                    {cpfValidation.name && ` - ${cpfValidation.name}`}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    placeholder="(00) 00000-0000"
                    className="pl-10"
                    disabled={isViewMode}
                    maxLength={15}
                    {...register('phone')}
                    onChange={(e) => {
                      e.target.value = formatPhoneInput(e.target.value)
                      setValue('phone', e.target.value)
                    }}
                  />
                </div>
                {errors.phone && (
                  <p className="text-xs text-red-500">{errors.phone.message}</p>
                )}
              </div>
            </div>

            {/* Plan (único e anual) */}
            <div className="space-y-3">
              <Label>Plano</Label>
              <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{PLANS.club.name} — Anual</span>
                  </div>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(PLANS.club.price)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {PLANS.club.discount}% de desconto em qualquer produto
                </p>
              </div>
            </div>

            {/* Status (edit mode only) */}
            {isEditMode && (
              <div className="space-y-3">
                <Label>Status</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['active', 'pending', 'inactive', 'expired'] as MemberStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setValue('status', status)}
                      className={`p-2 rounded-lg border-2 text-sm transition-all ${
                        selectedStatus === status
                          ? status === 'active'
                            ? 'border-green-500 bg-green-500/10 text-green-600'
                            : status === 'pending'
                            ? 'border-yellow-500 bg-yellow-500/10 text-yellow-600'
                            : 'border-red-500 bg-red-500/10 text-red-600'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {getStatusLabel(status)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Additional info (view only) */}
            {isViewMode && localMember && (
              <div className="space-y-4 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold">Informações Adicionais</h4>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Membro desde:</span>
                    <span className="ml-2 font-medium">
                      {new Date(localMember.startDate).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Última atualização:</span>
                    <span className="ml-2 font-medium">
                      {new Date(localMember.updatedAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ID:</span>
                    <span className="ml-2 font-medium font-mono text-xs">{localMember.id}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Payment History (view mode only) */}
            {isViewMode && localMember && (
              <Card>
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-4 text-left"
                  onClick={() => setShowPayments(!showPayments)}
                >
                  <h4 className="font-semibold flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-primary" />
                    Histórico de Pagamentos
                  </h4>
                  {showPayments ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showPayments && (
                  <CardContent className="pt-0">
                    {paymentsLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : !payments || payments.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">Nenhum pagamento registrado</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {payments.map((p, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm">
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground">
                                {new Date(p.created_at as string).toLocaleDateString('pt-BR')}
                              </span>
                              <span className="font-medium">
                                {formatCurrency(Number(p.amount) / 100)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {(p.method as string) === 'pix' ? 'PIX' : (p.method as string) === 'credit_card' ? 'Cartão' : String(p.method || 'N/A')}
                              </Badge>
                              <Badge
                                variant={
                                  (p.status as string) === 'paid' || (p.status as string) === 'approved'
                                    ? 'success'
                                    : (p.status as string) === 'pending'
                                    ? 'warning'
                                    : 'destructive'
                                }
                              >
                                {(p.status as string) === 'paid' || (p.status as string) === 'approved'
                                  ? 'Pago'
                                  : (p.status as string) === 'pending'
                                  ? 'Pendente'
                                  : 'Falhou'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )}

            {/* Subscription (view mode only, if member has subscriptionId) */}
            {isViewMode && localMember && (localMember as MemberWithSubscription).subscriptionId && (
              <Card>
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-4 text-left"
                  onClick={() => setShowSubscription(!showSubscription)}
                >
                  <h4 className="font-semibold flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Assinatura
                  </h4>
                  {showSubscription ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showSubscription && (
                  <CardContent className="pt-0">
                    {subscriptionLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : !subscription ? (
                      <p className="text-sm text-muted-foreground py-2">Dados da assinatura indisponíveis</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid sm:grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Status:</span>
                            <Badge
                              className="ml-2"
                              variant={
                                (subscription.status as string) === 'authorized'
                                  ? 'success'
                                  : (subscription.status as string) === 'paused'
                                  ? 'warning'
                                  : 'destructive'
                              }
                            >
                              {(subscription.status as string) === 'authorized'
                                ? 'Ativa'
                                : (subscription.status as string) === 'paused'
                                ? 'Pausada'
                                : String(subscription.status)}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Plano:</span>
                            <span className="ml-2 font-medium">{String(subscription.plan || 'N/A')}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Valor:</span>
                            <span className="ml-2 font-medium">
                              {formatCurrency(Number(subscription.transaction_amount || 0))}
                            </span>
                          </div>
                          {subscription.next_payment_date && (
                            <div>
                              <span className="text-muted-foreground">Próximo pagamento:</span>
                              <span className="ml-2 font-medium">
                                {new Date(subscription.next_payment_date as string).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          )}
                          {subscription.failed_payments != null && (
                            <div>
                              <span className="text-muted-foreground">Pagamentos falhos:</span>
                              <span className="ml-2 font-medium">{String(subscription.failed_payments)}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 pt-2">
                          {(subscription.status as string) === 'authorized' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={subscriptionActionLoading}
                              onClick={() => handleSubscriptionAction('pause')}
                            >
                              {subscriptionActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Pause className="h-4 w-4 mr-1" /> Pausar</>}
                            </Button>
                          )}
                          {(subscription.status as string) === 'paused' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={subscriptionActionLoading}
                              onClick={() => handleSubscriptionAction('resume')}
                            >
                              {subscriptionActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Play className="h-4 w-4 mr-1" /> Retomar</>}
                            </Button>
                          )}
                          {(subscription.status as string) !== 'cancelled' && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={subscriptionActionLoading}
                              onClick={() => handleSubscriptionAction('cancel')}
                            >
                              {subscriptionActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Ban className="h-4 w-4 mr-1" /> Cancelar</>}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )}

            {/* Contract (view mode only) */}
            {isViewMode && localMember && (
              <Card>
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-4 text-left"
                  onClick={() => setShowContract(!showContract)}
                >
                  <h4 className="font-semibold flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Contrato
                  </h4>
                  {showContract ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showContract && (
                  <CardContent className="pt-0">
                    {contractLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : !contract ? (
                      <p className="text-sm text-muted-foreground py-2">Nenhum contrato encontrado</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid sm:grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Assinado em:</span>
                            <span className="ml-2 font-medium">
                              {contract.signed_at
                                ? new Date(contract.signed_at as string).toLocaleDateString('pt-BR')
                                : 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Status:</span>
                            <Badge
                              className="ml-2"
                              variant={
                                (contract.status as string) === 'signed'
                                  ? 'success'
                                  : (contract.status as string) === 'pending'
                                  ? 'warning'
                                  : 'destructive'
                              }
                            >
                              {(contract.status as string) === 'signed'
                                ? 'Assinado'
                                : (contract.status as string) === 'pending'
                                ? 'Pendente'
                                : String(contract.status)}
                            </Badge>
                          </div>
                          {contract.hash && (
                            <div className="sm:col-span-2">
                              <span className="text-muted-foreground">Hash:</span>
                              <span className="ml-2 font-mono text-xs">
                                {String(contract.hash).slice(0, 20)}...
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 pt-2">
                          {contract.pdf_url && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(contract.pdf_url as string, '_blank')}
                            >
                              <Download className="h-4 w-4 mr-1" /> Baixar PDF
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={verifyLoading}
                            onClick={handleVerifyContract}
                          >
                            {verifyLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <><ShieldCheck className="h-4 w-4 mr-1" /> Verificar Integridade</>
                            )}
                          </Button>
                        </div>
                        {verifyResult && (
                          <div className={`flex items-center gap-2 text-sm p-2 rounded ${
                            verifyResult.valid
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          }`}>
                            {verifyResult.valid ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                            {verifyResult.message}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )}

            {/* Pending payment alert */}
            {member && member.status === 'pending' && (
              <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-700 dark:text-yellow-300">
                    Pagamento pendente
                  </p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Este membro ainda não teve o pagamento confirmado.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="warning"
                  size="sm"
                  onClick={handleActivate}
                  disabled={loading}
                >
                  {loading ? <Loading size="sm" /> : 'Ativar'}
                </Button>
              </div>
            )}
          </CardContent>

          <CardFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              {isViewMode ? 'Fechar' : 'Cancelar'}
            </Button>
            {!isViewMode && (
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? (
                  <Loading size="sm" />
                ) : isCreateMode ? (
                  'Criar Membro'
                ) : (
                  'Salvar Alterações'
                )}
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
