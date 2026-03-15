import { useState, type ReactNode } from 'react'
import { logger } from '../../lib/logger'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Star, Crown, Sparkles, Plus, Search, Gift, Loader2, Download } from 'lucide-react'
import { PLANS, type Member, type PlanType } from '../../types'
import { formatCPF } from '../../lib/utils'
import { addBonusPoints } from '../../lib/points'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'

const planIcons: Record<PlanType, ReactNode> = {
  silver: <Star className="h-4 w-4" />,
  gold: <Crown className="h-4 w-4" />,
  black: <Sparkles className="h-4 w-4" />,
}

interface PointsTabProps {
  members: Member[]
  onRefresh?: () => void
}

export function PointsTab({ members, onRefresh }: PointsTabProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const pointsReport = [...members]
    .filter((m) => m.points > 0)
    .sort((a, b) => b.points - a.points)

  // Filter members for search
  const filteredMembers = searchTerm.length >= 2
    ? members.filter(
        (m) =>
          m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.cpf.includes(searchTerm.replace(/\D/g, ''))
      )
    : []

  const handleSelectMember = (member: Member) => {
    setSelectedMember(member)
    setSearchTerm('')
  }

  const handleSubmit = async () => {
    if (!selectedMember || !points || !reason) {
      toast.error('Preencha todos os campos')
      return
    }

    const pointsNum = parseInt(points)
    if (isNaN(pointsNum) || pointsNum <= 0) {
      toast.error('Quantidade de pontos inválida')
      return
    }

    setLoading(true)
    try {
      const result = await addBonusPoints(selectedMember.id, pointsNum, reason)
      if (result.success) {
        toast.success(result.message)
        setOpen(false)
        setSelectedMember(null)
        setPoints('')
        setReason('')
        onRefresh?.()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('Erro ao adicionar pontos')
      logger.error('Error adding bonus points:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setSelectedMember(null)
    setSearchTerm('')
    setPoints('')
    setReason('')
  }

  const handleExport = () => {
    if (pointsReport.length === 0) {
      toast.error('Nenhum dado para exportar')
      return
    }

    const headers = ['Posição', 'Nome', 'CPF', 'Email', 'Plano', 'Pontos']
    const rows = pointsReport.map((m, index) => [
      (index + 1).toString(),
      m.fullName,
      formatCPF(m.cpf),
      m.email,
      PLANS[m.plan as PlanType].name,
      m.points.toString(),
    ])

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ranking_pontos_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Arquivo exportado com sucesso!')
  }

  return (
    <div className="space-y-6">
      {/* Add Points Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Adicionar Pontos</CardTitle>
            <CardDescription>Adicione pontos bônus para membros</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={(isOpen) => isOpen ? setOpen(true) : handleClose()}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Dar Pontos
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Adicionar Pontos Bônus</DialogTitle>
                <DialogDescription>
                  Selecione um membro e adicione pontos de bonificação
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Member Selection */}
                {!selectedMember ? (
                  <div className="space-y-2">
                    <Label>Buscar Membro</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Nome ou CPF..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {filteredMembers.length > 0 && (
                      <div className="border rounded-lg max-h-48 overflow-y-auto">
                        {filteredMembers.slice(0, 5).map((member) => (
                          <button
                            key={member.id}
                            onClick={() => handleSelectMember(member)}
                            className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-center justify-between"
                          >
                            <div>
                              <p className="font-medium text-sm">{member.fullName}</p>
                              <p className="text-xs text-muted-foreground">{formatCPF(member.cpf)}</p>
                            </div>
                            <Badge variant={member.plan as 'silver' | 'gold' | 'black'} className="gap-1 text-xs">
                              {planIcons[member.plan as PlanType]}
                              {member.plan}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchTerm.length >= 2 && filteredMembers.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Nenhum membro encontrado
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Membro Selecionado</Label>
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium">{selectedMember.fullName}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatCPF(selectedMember.cpf)} • {selectedMember.points} pts
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMember(null)}
                      >
                        Trocar
                      </Button>
                    </div>
                  </div>
                )}

                {/* Points Input */}
                <div className="space-y-2">
                  <Label htmlFor="points">Quantidade de Pontos</Label>
                  <Input
                    id="points"
                    type="number"
                    min="1"
                    placeholder="100"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    disabled={!selectedMember}
                  />
                </div>

                {/* Reason Input */}
                <div className="space-y-2">
                  <Label htmlFor="reason">Motivo</Label>
                  <Input
                    id="reason"
                    placeholder="Ex: Bônus de boas-vindas, Promoção especial..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={!selectedMember}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!selectedMember || !points || !reason || loading}
                  className="flex-1"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Gift className="h-4 w-4 mr-2" />
                      Adicionar
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
      </Card>

      {/* Points Ranking */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Relatório de Pontos</CardTitle>
            <CardDescription>Ranking de membros por pontos acumulados</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={pointsReport.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium text-sm w-16">Posição</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Membro</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Plano</th>
                  <th className="text-right py-3 px-4 font-medium text-sm">Total de Pontos</th>
                </tr>
              </thead>
              <tbody>
                {pointsReport.map((member, index) => (
                  <tr key={member.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="py-4 px-4 font-bold text-muted-foreground">
                      #{index + 1}
                    </td>
                    <td className="py-4 px-4">
                      <p className="font-medium">{member.fullName}</p>
                      <p className="text-sm text-muted-foreground">{formatCPF(member.cpf)}</p>
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant={member.plan as 'silver' | 'gold' | 'black'} className="gap-1">
                        {planIcons[member.plan as PlanType]}
                        {PLANS[member.plan as PlanType].name}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="font-bold text-primary text-lg">
                        {member.points}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pointsReport.length === 0 && (
              <div className="text-center py-12">
                <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground font-medium">Nenhum membro com pontos</p>
                <p className="text-xs text-muted-foreground mt-1">Os pontos distribuídos no PDV aparecerão aqui</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
