import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '../lib/api-client'
import { logger } from '../lib/logger'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog'
import { Badge } from './ui/badge'
import { Loading } from './ui/loading'
import { PASSWORD_MIN_LENGTH } from '../lib/password-validation'
import type { UserRole } from '../types'
import { toast } from 'sonner'
import {
  Mail,
  Lock,
  Shield,
  User,
  Eye,
  EyeOff,
} from 'lucide-react'

// Validation schema — password rules MUST match backend (auth.routes.ts passwordSchema):
// min 8 chars, 1 uppercase, 1 digit. See src/lib/password-validation.ts.
const userSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
    .refine((v) => /[A-Z]/.test(v), 'Senha deve conter pelo menos 1 letra maiúscula')
    .refine((v) => /[0-9]/.test(v), 'Senha deve conter pelo menos 1 número'),
  confirmPassword: z.string(),
  role: z.enum(['admin', 'seller', 'member']),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não conferem',
  path: ['confirmPassword'],
})

type UserFormData = z.infer<typeof userSchema>

interface UserModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function UserModal({ onClose, onSuccess }: UserModalProps) {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      role: 'seller',
    },
  })

  const selectedRole = watch('role')

  const roleInfo = {
    admin: {
      label: 'Administrador',
      description: 'Acesso total ao sistema',
      icon: Shield,
      color: 'bg-red-500',
    },
    seller: {
      label: 'Vendedor',
      description: 'Acesso ao PDV e verificação de membros',
      icon: User,
      color: 'bg-yellow-500',
    },
    member: {
      label: 'Membro',
      description: 'Acesso à área de membros',
      icon: User,
      color: 'bg-blue-500',
    },
  }

  async function onSubmit(data: UserFormData) {
    setLoading(true)

    try {
      // Create user via API (admin endpoint)
      const result = await api.post('/auth/register', {
        email: data.email,
        password: data.password,
      }, { skipAuth: false })

      if (result.error) {
        throw new Error(result.error)
      }

      // Set role if not member (default)
      if (data.role !== 'member' && result.data?.user?.id) {
        await api.patch(`/users/${result.data.user.id}/role`, { role: data.role })
      }

      toast.success(`Usuário ${data.role} criado com sucesso!`)
      onSuccess()
    } catch (error: unknown) {
      logger.error('Error creating user:', error)
      const err = error as { code?: string; message?: string }

      const message = err.message || 'desconhecido'
      if (message.includes('já cadastrado')) {
        toast.error('Este email já está em uso')
      } else {
        toast.error('Erro ao criar usuário: ' + message)
      }
    }

    setLoading(false)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Usuário do Sistema</DialogTitle>
          <DialogDescription>
            Crie um novo usuário com acesso ao painel administrativo
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-6 py-2">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="user-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="usuario@email.com"
                  className="pl-10"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="user-password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="user-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres, 1 maiúscula, 1 número`}
                  className="pl-10 pr-10"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="user-confirm-password">Confirmar Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="user-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repita a senha"
                  className="pl-10"
                  {...register('confirmPassword')}
                />
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Role Selection */}
            <div className="space-y-3">
              <Label>Cargo / Permissão</Label>
              <div className="grid gap-3">
                {(['admin', 'seller'] as UserRole[]).map((role) => {
                  const info = roleInfo[role]
                  const Icon = info.icon
                  const isSelected = selectedRole === role

                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setValue('role', role)}
                      className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className={`p-2 rounded-full ${info.color} text-white`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{info.label}</p>
                        <p className="text-sm text-muted-foreground">{info.description}</p>
                      </div>
                      {isSelected && (
                        <Badge variant="default">Selecionado</Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Warning for Admin */}
            {selectedRole === 'admin' && (
              <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <Shield className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-600 dark:text-red-400">
                    Atenção: Acesso Administrativo
                  </p>
                  <p className="text-red-600/80 dark:text-red-400/80">
                    Este usuário terá acesso total ao sistema, incluindo gerenciamento de membros,
                    usuários e configurações.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loading size="sm" /> : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
