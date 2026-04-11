import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { updateMember } from '../lib/members'
import { api } from '../lib/api-client'
import { logger } from '../lib/logger'
import { PASSWORD_MIN_LENGTH } from '../lib/password-validation'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { toast } from 'sonner'
import type { Member } from '../types'
import {
  X,
  User,
  Phone,
  Mail,
  Lock,
  Save,
  AlertTriangle,
  Eye,
  EyeOff,
} from 'lucide-react'

// Profile schema — password rules MUST match backend (auth.routes.ts passwordSchema):
// min 8 chars, 1 uppercase, 1 digit. Centralized in src/lib/password-validation.ts.
const profileSchema = z.object({
  fullName: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  phone: z.string().min(14, 'Telefone inválido').max(15, 'Telefone inválido'),
  email: z.string().email('Email inválido'),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine((data) => {
  if (!data.newPassword) return true
  return data.newPassword.length >= PASSWORD_MIN_LENGTH
}, {
  message: `Nova senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
  path: ['newPassword'],
}).refine((data) => {
  if (!data.newPassword) return true
  return /[A-Z]/.test(data.newPassword)
}, {
  message: 'Nova senha deve conter pelo menos 1 letra maiúscula',
  path: ['newPassword'],
}).refine((data) => {
  if (!data.newPassword) return true
  return /[0-9]/.test(data.newPassword)
}, {
  message: 'Nova senha deve conter pelo menos 1 número',
  path: ['newPassword'],
}).refine((data) => {
  if (data.newPassword && data.newPassword !== data.confirmPassword) {
    return false
  }
  return true
}, {
  message: 'Senhas não conferem',
  path: ['confirmPassword'],
})

type ProfileFormData = z.infer<typeof profileSchema>

interface ProfileEditModalProps {
  member: Member
  onClose: () => void
  onSuccess: () => void
}

export function ProfileEditModal({ member, onClose, onSuccess }: ProfileEditModalProps) {
  const [saving, setSaving] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: member.fullName,
      phone: member.phone,
      email: member.email,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const watchedEmail = watch('email')
  const watchedNewPassword = watch('newPassword')
  const emailChanged = watchedEmail !== member.email
  const passwordChanging = watchedNewPassword && watchedNewPassword.length > 0

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 2) return digits
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  async function onSubmit(data: ProfileFormData) {
    // Check if auth changes need password
    if ((emailChanged || passwordChanging) && !data.currentPassword) {
      toast.error('Senha atual é necessária para alterar email ou senha')
      return
    }

    setSaving(true)

    try {
      // Update auth (email/password) if changed
      if (emailChanged || passwordChanging) {
        const authUpdate: Record<string, unknown> = {}
        if (emailChanged) authUpdate.email = data.email
        if (data.currentPassword) authUpdate.currentPassword = data.currentPassword
        if (data.newPassword) authUpdate.newPassword = data.newPassword

        const result = await api.patch('/auth/update-profile', authUpdate)
        if (result.error) {
          toast.error(result.error)
          setSaving(false)
          return
        }
      }

      // Update member profile data
      const updateData: Partial<Member> = {
        fullName: data.fullName,
        phone: data.phone.replace(/\D/g, ''),
        updatedAt: new Date().toISOString(),
      }

      if (emailChanged) {
        updateData.email = data.email
      }

      await updateMember(member.id, updateData)

      toast.success('Perfil atualizado com sucesso!')
      onSuccess()
    } catch (error: unknown) {
      logger.error('Profile update error:', error)
      const err = error as { message?: string }
      toast.error(err.message || 'Erro ao atualizar perfil')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <Card className="relative w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Editar Perfil
              </CardTitle>
              <CardDescription>
                Atualize suas informações pessoais
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Full Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Nome Completo
              </label>
              <Input
                {...register('fullName')}
                placeholder="Seu nome completo"
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                Telefone
              </label>
              <Input
                {...register('phone', {
                  onChange: (e) => {
                    e.target.value = formatPhone(e.target.value)
                  },
                })}
                placeholder="(00) 00000-0000"
              />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email
              </label>
              <Input
                {...register('email')}
                type="email"
                placeholder="seu@email.com"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
              {emailChanged && (
                <p className="text-sm text-warning flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Alterar email requer sua senha atual
                </p>
              )}
            </div>

            {/* Divider */}
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Alterar Senha (opcional)</span>
              </div>
            </div>

            {/* Current Password */}
            {(emailChanged || passwordChanging) && (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Senha Atual *
                </label>
                <div className="relative">
                  <Input
                    {...register('currentPassword')}
                    type={showCurrentPassword ? 'text' : 'password'}
                    placeholder="Digite sua senha atual"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.currentPassword && (
                  <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
                )}
              </div>
            )}

            {/* New Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Nova Senha
              </label>
              <div className="relative">
                <Input
                  {...register('newPassword')}
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Deixe em branco para manter"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {errors.newPassword && (
                <p className="text-sm text-destructive">{errors.newPassword.message}</p>
              )}
            </div>

            {/* Confirm Password */}
            {passwordChanging && (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Confirmar Nova Senha
                </label>
                <div className="relative">
                  <Input
                    {...register('confirmPassword')}
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirme a nova senha"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={saving || !isDirty}>
                {saving ? (
                  <>
                    <span className="animate-spin mr-2">
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </span>
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
