import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Loading } from './ui/loading'
import { PLANS, type Member, type PlanType, type MemberStatus } from '../types'
import { createMember, updateMember, activateMember } from '../lib/members'
import { formatCurrency, formatCPF, validateCPF, getStatusLabel } from '../lib/utils'
import { toast } from 'sonner'
import {
  X,
  User,
  Mail,
  Phone,
  CreditCard,
  Calendar,
  Star,
  Crown,
  Sparkles,
  Check,
  AlertTriangle,
} from 'lucide-react'

// Validation schema
const memberSchema = z.object({
  fullName: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  cpf: z.string().refine((val) => validateCPF(val), 'CPF inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  plan: z.enum(['silver', 'gold', 'black']),
  paymentType: z.enum(['monthly', 'annual']),
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
      plan: member?.plan || 'silver',
      paymentType: member?.paymentType || 'monthly',
      status: member?.status || 'pending',
    },
  })

  const selectedPlan = watch('plan')
  const paymentType = watch('paymentType')
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
    }
  }, [member, reset])

  const planIcons = {
    silver: <Star className="h-4 w-4" />,
    gold: <Crown className="h-4 w-4" />,
    black: <Sparkles className="h-4 w-4" />,
  }

  async function onSubmit(data: MemberFormData) {
    setLoading(true)

    try {
      if (isCreateMode) {
        // Create new member (without user_id since it's created by admin)
        const result = await createMember('admin-created', {
          fullName: data.fullName,
          email: data.email,
          cpf: data.cpf,
          phone: data.phone,
          plan: data.plan,
          paymentType: data.paymentType,
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
          fullName: data.fullName,
          email: data.email,
          cpf: data.cpf.replace(/\D/g, ''),
          phone: data.phone,
          plan: data.plan,
          paymentType: data.paymentType,
          status: data.status as MemberStatus,
        })

        if (success) {
          toast.success('Membro atualizado com sucesso!')
          onSuccess()
        } else {
          toast.error('Erro ao atualizar membro')
        }
      }
    } catch (error) {
      console.error('Error saving member:', error)
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
                  <Badge variant={member.plan as 'silver' | 'gold' | 'black'}>
                    {planIcons[member.plan as PlanType]}
                    {PLANS[member.plan as PlanType].name}
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
                    className="pl-10"
                    disabled={isViewMode}
                    maxLength={14}
                    {...register('cpf')}
                    onChange={(e) => {
                      e.target.value = formatCPFInput(e.target.value)
                      setValue('cpf', e.target.value)
                    }}
                  />
                </div>
                {errors.cpf && (
                  <p className="text-xs text-red-500">{errors.cpf.message}</p>
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

            {/* Plan selection */}
            <div className="space-y-3">
              <Label>Plano</Label>
              <div className="grid grid-cols-3 gap-3">
                {(Object.keys(PLANS) as PlanType[]).map((planId) => {
                  const plan = PLANS[planId]
                  const isSelected = selectedPlan === planId

                  return (
                    <button
                      key={planId}
                      type="button"
                      disabled={isViewMode}
                      onClick={() => setValue('plan', planId)}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      } ${isViewMode ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-center justify-center gap-2 mb-2">
                        {planIcons[planId]}
                        <span className="font-semibold">{plan.name}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {plan.discountProducts}% produtos
                      </p>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary mx-auto mt-2" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Payment type */}
            <div className="space-y-3">
              <Label>Tipo de Cobrança</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isViewMode}
                  onClick={() => setValue('paymentType', 'monthly')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    paymentType === 'monthly'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  } ${isViewMode ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <p className="font-semibold">Mensal</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(PLANS[selectedPlan].priceMonthly)}
                  </p>
                </button>
                <button
                  type="button"
                  disabled={isViewMode}
                  onClick={() => setValue('paymentType', 'annual')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    paymentType === 'annual'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  } ${isViewMode ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <p className="font-semibold">Anual</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(PLANS[selectedPlan].priceAnnual)}
                  </p>
                  <Badge variant="success" className="mt-1">Economia!</Badge>
                </button>
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
            {isViewMode && member && (
              <div className="space-y-4 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold">Informações Adicionais</h4>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Pontos:</span>
                    <span className="ml-2 font-medium">{member.points}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Membro desde:</span>
                    <span className="ml-2 font-medium">
                      {new Date(member.startDate).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Última atualização:</span>
                    <span className="ml-2 font-medium">
                      {new Date(member.updatedAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ID:</span>
                    <span className="ml-2 font-medium font-mono text-xs">{member.id}</span>
                  </div>
                </div>
              </div>
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
