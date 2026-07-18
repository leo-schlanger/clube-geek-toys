import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Button } from '../ui/button'
import { Loading } from '../ui/loading'
import { PLANS, type Member, type PlanType } from '../../types'
import type { Contract } from '../../types'
import { resendContractEmail } from '../../lib/email'
import { logger } from '../../lib/logger'
import { toast } from 'sonner'
import {
  User,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  FileText,
  Download,
  Send,
  CheckCircle,
  Edit,
} from 'lucide-react'

interface AccountSectionProps {
  member: Member
  contract: Contract | null
  onEditProfile: () => void
}

export function AccountSection({ member, contract, onEditProfile }: AccountSectionProps) {
  const [resendingContract, setResendingContract] = useState(false)
  const plan = PLANS[member.plan as PlanType]

  const handleResendContract = useCallback(async () => {
    if (!contract) return

    setResendingContract(true)
    try {
      const result = await resendContractEmail(
        member.email,
        contract.memberName,
        plan.name,
        contract.signedAt,
        contract.documentHash,
        contract.pdfUrl
      )

      if (result.success) {
        toast.success('Contrato enviado para seu email!')
      } else {
        toast.error(result.error || 'Erro ao reenviar contrato')
      }
    } catch (error) {
      logger.error('Error resending contract:', error)
      toast.error('Erro ao reenviar contrato')
    } finally {
      setResendingContract(false)
    }
  }, [contract, member.email, plan.name])

  return (
    <div className="space-y-6">
      {/* Personal Data */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Meus Dados
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onEditProfile}>
              <Edit className="h-4 w-4 mr-1" />
              Editar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase">Email</p>
                <p className="text-sm font-medium truncate">{member.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase">Telefone</p>
                <p className="text-sm font-medium">{member.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase">Membro desde</p>
                <p className="text-sm font-medium">
                  {new Date(member.startDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase">Cobrança</p>
                <p className="text-sm font-medium">Anual</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contract */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Meu Contrato
          </CardTitle>
          <CardDescription>
            Seu termo de adesão ao Clube Geek & Toys
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contract ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="font-medium text-green-400">Contrato Assinado</p>
                  <p className="text-sm text-muted-foreground">
                    Assinado em {new Date(contract.signedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => window.open(contract.pdfUrl, '_blank')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleResendContract}
                  disabled={resendingContract}
                >
                  {resendingContract ? (
                    <Loading size="sm" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar por Email
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <FileText className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">Nenhum contrato encontrado</p>
              <p className="text-sm text-muted-foreground">
                Entre em contato com o suporte se precisar de uma cópia.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
