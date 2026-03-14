import { useMemo, useCallback } from 'react'
import { DataTable, type Column, type FilterConfig } from './DataTable'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { PLANS, type Member, type PlanType } from '../types'
import { formatCPF, getStatusLabel } from '../lib/utils'
import {
  Eye,
  Edit,
  UserX,
  CheckCircle,
  Star,
  Crown,
  Sparkles,
  Plus,
} from 'lucide-react'

interface MembersTableProps {
  members: Member[]
  loading?: boolean
  onView: (member: Member) => void
  onEdit: (member: Member) => void
  onDelete: (member: Member) => void
  onActivate: (member: Member) => void
  onCreate: () => void
}

// Plan icons (memoized outside component)
const PLAN_ICONS: Record<PlanType, React.ReactNode> = {
  silver: <Star className="h-4 w-4" />,
  gold: <Crown className="h-4 w-4" />,
  black: <Sparkles className="h-4 w-4" />,
}

export function MembersTable({
  members,
  loading = false,
  onView,
  onEdit,
  onDelete,
  onActivate,
  onCreate,
}: MembersTableProps) {
  // Table columns configuration
  const columns: Column<Member>[] = useMemo(
    () => [
      {
        key: 'fullName',
        header: 'Membro',
        sortable: true,
        render: (member) => (
          <div>
            <p className="font-medium">{member.fullName}</p>
            <p className="text-sm text-muted-foreground">{formatCPF(member.cpf)}</p>
            <p className="text-xs text-muted-foreground">{member.email}</p>
          </div>
        ),
      },
      {
        key: 'plan',
        header: 'Plano',
        sortable: true,
        render: (member) => (
          <Badge variant={member.plan as 'silver' | 'gold' | 'black'} className="gap-1">
            {PLAN_ICONS[member.plan as PlanType]}
            {PLANS[member.plan as PlanType].name}
          </Badge>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        render: (member) => (
          <div className="flex items-center gap-2">
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
            {member.status === 'pending' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation()
                  onActivate(member)
                }}
                title="Ativar membro"
              >
                <CheckCircle className="h-4 w-4 text-green-500" />
              </Button>
            )}
          </div>
        ),
      },
      {
        key: 'expiryDate',
        header: 'Validade',
        sortable: true,
        render: (member) => {
          const isExpired = new Date(member.expiryDate) < new Date()
          return (
            <span className={isExpired ? 'text-red-500 font-medium' : ''}>
              {new Date(member.expiryDate).toLocaleDateString('pt-BR')}
            </span>
          )
        },
      },
      {
        key: 'points',
        header: 'Pontos',
        sortable: true,
        className: 'text-right',
        render: (member) => (
          <span className="font-medium tabular-nums">{member.points.toLocaleString('pt-BR')}</span>
        ),
      },
    ],
    [onActivate]
  )

  // Filter configuration
  const filters: FilterConfig[] = useMemo(
    () => [
      {
        key: 'status',
        label: 'Status',
        type: 'multiselect',
        options: [
          { value: 'active', label: 'Ativo', color: 'bg-green-500' },
          { value: 'pending', label: 'Pendente', color: 'bg-yellow-500' },
          { value: 'inactive', label: 'Inativo', color: 'bg-gray-500' },
          { value: 'expired', label: 'Expirado', color: 'bg-red-500' },
        ],
      },
      {
        key: 'plan',
        label: 'Plano',
        type: 'multiselect',
        options: [
          { value: 'silver', label: 'Silver', icon: <Star className="h-3 w-3" /> },
          { value: 'gold', label: 'Gold', icon: <Crown className="h-3 w-3" /> },
          { value: 'black', label: 'Black', icon: <Sparkles className="h-3 w-3" /> },
        ],
      },
      {
        key: 'expiryDate',
        label: 'Validade',
        type: 'daterange',
      },
      {
        key: 'points',
        label: 'Pontos',
        type: 'numberrange',
      },
    ],
    []
  )

  // Row actions
  const renderActions = useCallback(
    (member: Member) => (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation()
            onView(member)
          }}
          title="Ver detalhes"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(member)
          }}
          title="Editar"
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(member)
          }}
          title="Desativar membro"
        >
          <UserX className="h-4 w-4" />
        </Button>
      </div>
    ),
    [onView, onEdit, onDelete]
  )

  // Export data function
  const exportData = useCallback((items: Member[]) => {
    const headers = ['Nome', 'Email', 'CPF', 'Telefone', 'Plano', 'Status', 'Validade', 'Pontos']
    const rows = items.map((m) => [
      m.fullName,
      m.email,
      formatCPF(m.cpf),
      m.phone,
      PLANS[m.plan as PlanType].name,
      getStatusLabel(m.status),
      new Date(m.expiryDate).toLocaleDateString('pt-BR'),
      m.points.toString(),
    ])
    return [headers, ...rows]
  }, [])

  // Empty state
  const emptyState = useMemo(
    () => (
      <div className="text-center py-8">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Plus className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="font-medium text-muted-foreground mb-2">Nenhum membro encontrado</p>
        <p className="text-sm text-muted-foreground mb-4">
          Cadastre o primeiro membro para começar
        </p>
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Cadastrar Membro
        </Button>
      </div>
    ),
    [onCreate]
  )

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Membros</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os membros do clube
          </p>
        </div>
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Membro
        </Button>
      </div>

      {/* Data table */}
      <DataTable
        data={members}
        columns={columns}
        keyExtractor={(m) => m.id}
        filters={filters}
        searchPlaceholder="Buscar por nome, CPF ou email..."
        searchKeys={['fullName', 'cpf', 'email']}
        onRowClick={onView}
        actions={renderActions}
        emptyState={emptyState}
        loading={loading}
        exportFilename="membros"
        exportData={exportData}
      />
    </div>
  )
}
