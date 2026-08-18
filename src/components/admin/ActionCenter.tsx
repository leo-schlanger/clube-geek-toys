import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  HelpCircle,
  Hourglass,
  PackageCheck,
  PackageX,
  RefreshCw,
  Star,
  Truck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Loading } from '../ui/loading'
import { getActionItems, type ActionItem, type ActionItemKey } from '../../lib/reports'
import type { AdminTab } from './AdminSidebar'

/** How urgent a queue is once it has anything in it. */
type Severity = 'urgent' | 'attention' | 'routine'

interface QueueMeta {
  label: string
  /** What clearing the queue actually means, so the card is self-explanatory. */
  hint: string
  tab: AdminTab
  icon: React.ReactNode
  severity: Severity
  /** How to read `oldestDays` for this queue. */
  age: 'waiting' | 'until' | 'none'
}

// Presentation lives here, not in the API: the icons and the tab each card
// jumps to are frontend concerns. The server only counts.
const QUEUES: Record<ActionItemKey, QueueMeta> = {
  pix_pending: {
    label: 'PIX a confirmar',
    hint: 'Confira o extrato e confirme — o estoque só baixa depois',
    tab: 'orders',
    icon: <Banknote className="h-5 w-5" />,
    severity: 'urgent',
    age: 'waiting',
  },
  to_separate: {
    label: 'Pedidos a separar',
    hint: 'Pagos e esperando separação',
    tab: 'orders',
    icon: <PackageCheck className="h-5 w-5" />,
    severity: 'attention',
    age: 'waiting',
  },
  to_ship: {
    label: 'Pedidos a postar',
    hint: 'Separados, aguardando código de rastreio',
    tab: 'orders',
    icon: <Truck className="h-5 w-5" />,
    severity: 'attention',
    age: 'waiting',
  },
  shipped_stale: {
    label: 'Enviados sem entrega',
    hint: 'Mais de 10 dias em trânsito — verifique com o cliente',
    tab: 'orders',
    icon: <AlertTriangle className="h-5 w-5" />,
    severity: 'urgent',
    age: 'waiting',
  },
  questions_unanswered: {
    label: 'Perguntas sem resposta',
    hint: 'Cliente perguntou na página do produto',
    tab: 'questions',
    icon: <HelpCircle className="h-5 w-5" />,
    severity: 'attention',
    age: 'waiting',
  },
  reviews_pending: {
    label: 'Avaliações a moderar',
    hint: 'Aguardando publicar ou ocultar',
    tab: 'reviews',
    icon: <Star className="h-5 w-5" />,
    severity: 'routine',
    age: 'waiting',
  },
  wholesale_pending: {
    label: 'Atacado a aprovar',
    hint: 'CNPJ cadastrado esperando aprovação',
    tab: 'wholesale',
    icon: <Building2 className="h-5 w-5" />,
    severity: 'attention',
    age: 'waiting',
  },
  stock_out: {
    label: 'SKUs esgotados',
    hint: 'Sem estoque — some da vitrine',
    tab: 'stock',
    icon: <PackageX className="h-5 w-5" />,
    severity: 'urgent',
    age: 'none',
  },
  stock_low: {
    label: 'SKUs no mínimo',
    hint: 'No limite do estoque mínimo — hora de repor',
    tab: 'stock',
    icon: <AlertTriangle className="h-5 w-5" />,
    severity: 'attention',
    age: 'none',
  },
  members_expiring: {
    label: 'Assinaturas vencendo',
    hint: 'Vencem nos próximos 7 dias',
    tab: 'members',
    icon: <CalendarClock className="h-5 w-5" />,
    severity: 'routine',
    age: 'until',
  },
  members_pending: {
    label: 'Membros sem pagar',
    hint: 'Cadastraram e não concluíram o pagamento',
    tab: 'members',
    icon: <Hourglass className="h-5 w-5" />,
    severity: 'routine',
    age: 'waiting',
  },
}

const SEVERITY_ORDER: Record<Severity, number> = { urgent: 0, attention: 1, routine: 2 }

const SEVERITY_STYLE: Record<Severity, { text: string; ring: string; badge: 'destructive' | 'default' | 'secondary' }> = {
  urgent: { text: 'text-destructive', ring: 'ring-1 ring-destructive/30', badge: 'destructive' },
  attention: { text: 'text-primary', ring: 'ring-1 ring-primary/20', badge: 'default' },
  routine: { text: 'text-muted-foreground', ring: '', badge: 'secondary' },
}

/** Plain-language age, so the card says how bad it is without doing date math. */
function ageLabel(meta: QueueMeta, days: number | null): string | null {
  if (meta.age === 'none' || days === null) return null
  if (meta.age === 'until') {
    if (days <= 0) return 'vence hoje'
    return days === 1 ? 'vence amanhã' : `vence em ${days} dias`
  }
  if (days <= 0) return 'chegou hoje'
  return days === 1 ? 'espera há 1 dia' : `espera há ${days} dias`
}

interface QueueCardProps {
  item: ActionItem
  meta: QueueMeta
  onOpen: (tab: AdminTab) => void
}

function QueueCard({ item, meta, onOpen }: QueueCardProps) {
  const style = SEVERITY_STYLE[meta.severity]
  const age = ageLabel(meta, item.oldestDays)

  return (
    <button
      type="button"
      onClick={() => onOpen(meta.tab)}
      aria-label={`${item.count} ${meta.label} — abrir`}
      className={`text-left rounded-lg border bg-card p-4 transition-all hover:shadow-lg hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${style.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-medium truncate">{meta.label}</p>
          <p className={`text-2xl font-bold ${style.text}`}>{item.count}</p>
          <p className="text-xs text-muted-foreground">{meta.hint}</p>
          {age && (
            <Badge variant={style.badge} className="mt-1 text-[10px] h-4 px-1.5">
              {age}
            </Badge>
          )}
        </div>
        <div className={`p-2 rounded-lg bg-muted shrink-0 ${style.text}`}>{meta.icon}</div>
      </div>
    </button>
  )
}

interface ActionCenterProps {
  onNavigate: (tab: AdminTab) => void
}

/**
 * The worklist half of the dashboard.
 *
 * The metrics below answer "how did we do"; this answers "what is waiting on
 * me" — the question a shift actually starts with. Empty queues are hidden so
 * the panel is only as long as the day's work, and every card is a shortcut
 * into the tab that clears it.
 */
export function ActionCenter({ onNavigate }: ActionCenterProps) {
  const [items, setItems] = useState<ActionItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const report = await getActionItems()
      setItems(report.items)
      setTotal(report.totalPending)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <Loading size="lg" text="Carregando pendências..." />
        </CardContent>
      </Card>
    )
  }

  const pending = items
    .filter((item) => item.count > 0 && QUEUES[item.key])
    .sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[QUEUES[a.key].severity] - SEVERITY_ORDER[QUEUES[b.key].severity]
      return bySeverity !== 0 ? bySeverity : b.count - a.count
    })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Painel do dia</CardTitle>
          {total > 0 && (
            <Badge variant="default" className="text-[10px] h-5">
              {total} pendência{total === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={refreshing} aria-label="Atualizar pendências">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {pending.length === 0 ? (
          <div className="flex items-center gap-3 py-6 text-muted-foreground">
            <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Nada pendente</p>
              <p className="text-xs">Sem PIX a confirmar, pedidos parados, perguntas ou estoque no mínimo.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((item) => (
              <QueueCard key={item.key} item={item} meta={QUEUES[item.key]} onOpen={onNavigate} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
