import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Loading } from './ui/loading'
import type { UserRole } from '../types'
import { toast } from 'sonner'
import {
  X,
  Mail,
  Lock,
  Shield,
  User,
  Eye,
  EyeOff,
} from 'lucide-react'

// Validation schema
const userSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
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
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      )

      // Create user document in Firestore with role
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: data.email,
        role: data.role,
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
      })

      toast.success(`Usuário ${data.role} criado com sucesso!`)
      onSuccess()
    } catch (error: any) {
      console.error('Error creating user:', error)

      if (error.code === 'auth/email-already-in-use') {
        toast.error('Este email já está em uso')
      } else if (error.code === 'auth/invalid-email') {
        toast.error('Email inválido')
      } else if (error.code === 'auth/weak-password') {
        toast.error('Senha muito fraca')
      } else {
        toast.error('Erro ao criar usuário: ' + error.message)
      }
    }

    setLoading(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <CardTitle>Novo Usuário do Sistema</CardTitle>
          <CardDescription>
            Crie um novo usuário com acesso ao painel administrativo
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
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
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  className="pl-10 pr-10"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
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
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
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
          </CardContent>

          <CardFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? <Loading size="sm" /> : 'Criar Usuário'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
