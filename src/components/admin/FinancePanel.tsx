import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { FileSpreadsheet, FileText, RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { formatCurrency } from '../../lib/utils'
import { useIsMobile } from '../../hooks/useIsMobile'
import {
  getOverviewReport,
  LEDGER_KIND_LABEL,
  LEDGER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  type LedgerEntry,
  type OverviewReport,
} from '../../lib/reports'
import { formatRange, revenueTotals } from '../../lib/report-format'
import {
  previousMonth,
  resolveFinanceQuery,
  todayInRio,
  type FinancePreset,
  type FinanceQuery,
} from '../../lib/finance-period'

const PRESETS: { value: FinancePreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'month', label: 'Escolher mês' },
  { value: 'this_year', label: 'Este ano' },
  { value: 'range', label: 'Intervalo' },
]

const SOURCE_COLORS = { shop: '#F04080', tickets: '#FCBE04', club: '#10b981' }
const LEDGER_PAGE = 50

type KindFilter = 'all' | LedgerEntry['kind']

function growthPct(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function shortDate(value: string, bucket: 'day' | 'month'): string {
  const [y, m, d] = value.split('-')
  return bucket === 'month' ? `${m}/${y.slice(2)}` : `${d}/${m}`
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Kpi({
  label,
  value,
  hint,
  delta,
  emphasis,
}: {
  label: string
  value: string
  hint?: string
  delta?: number | null
  emphasis?: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 ${emphasis ? 'border-primary/50 bg-primary/5' : 'bg-card'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-bold tabular-nums ${emphasis ? 'text-2xl' : 'text-lg'}`}>{value}</p>
      {delta !== undefined && delta !== null && (
        <p
          className={`mt-0.5 flex items-center gap-1 text-xs ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
        >
          {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta >= 0 ? '+' : ''}
          {delta.toLocaleString('pt-BR')}% vs período anterior
        </p>
      )}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Horizontal share bars: label, value and how much of the whole it is. */
function ShareList({ rows, empty }: { rows: { label: string; value: number; detail: string }[]; empty: string }) {
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const share = total > 0 ? (row.value / total) * 100 : 0
        return (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{row.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(row.value)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${share}%` }} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.detail} · {share.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </p>
          </li>
        )
      })}
    </ul>
  )
}

function LedgerStatus({ entry }: { entry: LedgerEntry }) {
  const label = LEDGER_STATUS_LABEL[entry.status] ?? entry.status
  return <Badge variant={entry.counted ? 'secondary' : 'outline'}>{label}</Badge>
}

function SalesLedger({ report }: { report: OverviewReport }) {
  const isMobile = useIsMobile()
  const [kind, setKind] = useState<KindFilter>('all')
  const [showUnpaid, setShowUnpaid] = useState(false)
  const [visible, setVisible] = useState(LEDGER_PAGE)

  const entries = useMemo(
    () =>
      report.ledger.entries.filter(
        (entry) => (kind === 'all' || entry.kind === kind) && (showUnpaid || entry.counted)
      ),
    [report, kind, showUnpaid]
  )
  const shownTotal = entries.filter((e) => e.counted).reduce((sum, e) => sum + e.total, 0)
  const page = entries.slice(0, visible)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Vendas do período</CardTitle>
        <CardDescription>
          Cada venda da loja, dos ingressos e do clube. {entries.length} na lista ·{' '}
          <strong className="text-foreground">{formatCurrency(shownTotal)}</strong> entram na receita.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'shop', 'ticket', 'club'] as KindFilter[]).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={kind === value ? 'default' : 'outline'}
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value)
                setVisible(LEDGER_PAGE)
              }}
            >
              {value === 'all' ? 'Todas' : LEDGER_KIND_LABEL[value]}
            </Button>
          ))}
          <label className="ml-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={showUnpaid}
              onChange={(e) => setShowUnpaid(e.target.checked)}
            />
            Mostrar não pagos, cancelados e estornados
          </label>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma venda neste período com esses filtros.</p>
        ) : isMobile ? (
          <ul className="space-y-2">
            {page.map((entry) => (
              <li key={`${entry.kind}-${entry.id}`} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{entry.customer}</p>
                    <p className="text-xs text-muted-foreground">
                      {LEDGER_KIND_LABEL[entry.kind]} {entry.reference} · {dateTime(entry.at)}
                    </p>
                  </div>
                  <p className={`shrink-0 font-bold tabular-nums ${entry.counted ? '' : 'text-muted-foreground line-through'}`}>
                    {formatCurrency(entry.total)}
                  </p>
                </div>
                {entry.description && <p className="mt-1 line-clamp-2 text-xs">{entry.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <LedgerStatus entry={entry} />
                  <span>{PAYMENT_METHOD_LABEL[entry.method]}</span>
                  {entry.installments && entry.installments > 1 && <span>{entry.installments}x</span>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            {/* Fixed columns keep Total in view; the min width stops Descrição
                from collapsing to nothing on a 1280px screen. */}
            <table className="w-full min-w-[52rem] table-fixed text-sm">
              <colgroup>
                <col className="w-[7.75rem]" />
                <col className="w-[7rem]" />
                <col className="w-[10rem]" />
                <col />
                <col className="w-[7.5rem]" />
                <col className="w-[8rem]" />
                <col className="w-[6.5rem]" />
              </colgroup>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="py-2 pr-3 font-medium">Origem</th>
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 font-medium">Descrição</th>
                  <th className="py-2 pr-3 font-medium">Pagamento</th>
                  <th className="py-2 pr-3 font-medium">Situação</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {page.map((entry) => (
                  <tr key={`${entry.kind}-${entry.id}`} className="border-b last:border-0">
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{dateTime(entry.at)}</td>
                    <td className="truncate py-2 pr-3">
                      {LEDGER_KIND_LABEL[entry.kind]} <span className="text-muted-foreground">{entry.reference}</span>
                    </td>
                    <td className="truncate py-2 pr-3" title={entry.customer}>
                      {entry.customer}
                    </td>
                    <td className="truncate py-2 pr-3 text-muted-foreground" title={entry.description}>
                      {entry.description}
                    </td>
                    <td className="truncate py-2 pr-3" title={PAYMENT_METHOD_LABEL[entry.method]}>
                      {PAYMENT_METHOD_LABEL[entry.method]}
                      {entry.installments && entry.installments > 1 ? ` ${entry.installments}x` : ''}
                    </td>
                    <td className="py-2 pr-3">
                      <LedgerStatus entry={entry} />
                    </td>
                    <td
                      className={`whitespace-nowrap py-2 text-right font-semibold tabular-nums ${entry.counted ? '' : 'text-muted-foreground line-through'}`}
                    >
                      {formatCurrency(entry.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entries.length > visible && (
          <Button type="button" variant="outline" className="w-full" onClick={() => setVisible((v) => v + LEDGER_PAGE)}>
            Mostrar mais {Math.min(LEDGER_PAGE, entries.length - visible)} de {entries.length - visible}
          </Button>
        )}
        {report.ledger.truncated && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            O período tem mais vendas do que a lista mostra. Escolha um intervalo menor para ver todas.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The finance panel: pick a day, a month, a year or any range, and see what
 * came in, from where, how it was paid and every sale behind the total —
 * with the same numbers as the PDF and the spreadsheet of that period.
 */
export function FinancePanel() {
  const today = todayInRio()
  const [preset, setPreset] = useState<FinancePreset>('this_month')
  const [month, setMonth] = useState(previousMonth(today))
  const [start, setStart] = useState(`${today.slice(0, 8)}01`)
  const [end, setEnd] = useState(today)
  const [report, setReport] = useState<OverviewReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null)

  const financeQuery = useMemo(
    () => resolveFinanceQuery(preset, { month, start, end }, today),
    [preset, month, start, end, today]
  )

  const load = useCallback(async (q: FinanceQuery) => {
    setLoading(true)
    setError(null)
    try {
      setReport(await getOverviewReport(q.period, q.date, q.range))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o financeiro')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (financeQuery) void load(financeQuery)
  }, [financeQuery, load])

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!report) return
    setExporting(format)
    try {
      // Loaded only on click: pdf-lib and exceljs are large chunks and most
      // admin visits never export anything.
      if (format === 'pdf') {
        const { generateReportPDF, reportFilename } = await import('../../lib/report-pdf')
        const { downloadPDF } = await import('../../lib/contract-generator')
        downloadPDF(await generateReportPDF(report), reportFilename(report))
      } else {
        const { buildReportWorkbook, downloadWorkbook, reportExcelFilename } = await import('../../lib/report-excel')
        await downloadWorkbook(buildReportWorkbook(report), reportExcelFilename(report))
      }
      toast.success(format === 'pdf' ? 'PDF gerado.' : 'Planilha gerada.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível gerar o arquivo.')
    } finally {
      setExporting(null)
    }
  }

  const rangeInvalid = preset === 'range' && !financeQuery

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            Financeiro
          </CardTitle>
          <CardDescription>Escolha o período. Os arquivos em PDF e Excel saem com os mesmos números da tela.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Período do financeiro">
            {PRESETS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={preset === option.value ? 'default' : 'outline'}
                aria-pressed={preset === option.value}
                onClick={() => setPreset(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {preset === 'month' && (
            <div className="space-y-1.5">
              <Label htmlFor="finance-month">Mês</Label>
              <Input
                id="finance-month"
                type="month"
                value={month}
                max={today.slice(0, 7)}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full sm:w-48"
              />
            </div>
          )}

          {preset === 'range' && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="finance-start">De</Label>
                <Input
                  id="finance-start"
                  type="date"
                  value={start}
                  max={end || today}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full sm:w-44"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="finance-end">Até</Label>
                <Input
                  id="finance-end"
                  type="date"
                  value={end}
                  min={start}
                  max={today}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full sm:w-44"
                />
              </div>
            </div>
          )}
          {rangeInvalid && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Escolha a data inicial e a final, com a inicial antes da final.
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {report && (
              <p className="text-sm text-muted-foreground sm:mr-auto">
                {formatRange(report.period.type, report.period.start, report.period.end)}
                {report.period.previousStart &&
                  ` · comparado com ${formatRange(report.period.type, report.period.previousStart, report.period.start)}`}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 sm:flex">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => financeQuery && load(financeQuery)}
                disabled={loading || !financeQuery}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button type="button" size="sm" onClick={() => handleExport('pdf')} disabled={!report || loading || !!exporting}>
                <FileText className="h-4 w-4" />
                {exporting === 'pdf' ? 'Gerando...' : 'PDF'}
              </Button>
              <Button type="button" size="sm" onClick={() => handleExport('excel')} disabled={!report || loading || !!exporting}>
                <FileSpreadsheet className="h-4 w-4" />
                {exporting === 'excel' ? 'Gerando...' : 'Excel'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && !loading && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm">
          <p className="font-semibold text-red-600 dark:text-red-400">Não foi possível carregar o financeiro</p>
          <p className="mt-1 text-muted-foreground">
            {error}. Sem os dados, os números ficam de fora — isso não quer dizer que não houve vendas.
          </p>
        </div>
      )}

      {loading && !report && <p className="text-sm text-muted-foreground">Carregando o financeiro...</p>}

      {report && !error && <FinanceReport report={report} loading={loading} />}
    </div>
  )
}

function FinanceReport({ report, loading }: { report: OverviewReport; loading: boolean }) {
  const { sales, club, tickets, margin, products, previous } = report
  const totals = revenueTotals(report)
  const bucket = report.series.bucket
  const chartData = report.series.points.map((p) => ({ ...p, label: shortDate(p.date, bucket) }))
  const unrealized = sales.pendingRevenue + sales.cancelledRevenue + sales.refundedRevenue + club.refunded

  return (
    <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <div className="col-span-2">
          <Kpi
            emphasis
            label="Receita total (loja + ingressos + clube)"
            value={formatCurrency(totals.current)}
            delta={growthPct(totals.current, totals.previous)}
            hint={`Período anterior: ${formatCurrency(totals.previous)}`}
          />
        </div>
        <Kpi
          label="Loja"
          value={formatCurrency(sales.revenue)}
          delta={growthPct(sales.revenue, previous.salesRevenue)}
          hint={`${sales.orders} pedido(s) pago(s)`}
        />
        <Kpi
          label="Ingressos"
          value={formatCurrency(tickets.revenue)}
          delta={growthPct(tickets.revenue, previous.ticketRevenue)}
          hint={`${tickets.tickets} ingresso(s) em ${tickets.reservations} reserva(s)`}
        />
        <Kpi label="Clube" value={formatCurrency(club.revenue)} hint={`${club.payments} anuidade(s) · ${club.newMembers} novo(s) membro(s)`} />
        <Kpi label="Ticket médio da loja" value={formatCurrency(sales.averageTicket)} hint={`Frete cobrado: ${formatCurrency(sales.shipping)}`} />
        <Kpi label="Descontos concedidos" value={formatCurrency(sales.discount)} hint={`Sobre ${formatCurrency(sales.subtotal)} em produtos`} />
        <Kpi
          label="Lucro bruto da loja"
          value={margin.revenueWithCost > 0 ? formatCurrency(margin.grossProfit) : '—'}
          hint={
            margin.revenueWithCost > 0
              ? `Margem ${margin.marginPct.toFixed(1)}% sobre ${margin.costCoveragePct.toFixed(0)}% das vendas`
              : 'Sem custo cadastrado nos produtos vendidos'
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{bucket === 'month' ? 'Receita por mês' : 'Receita por dia'}</CardTitle>
        </CardHeader>
        <CardContent>
          {totals.current === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma venda paga neste período.</p>
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={8} />
                  <YAxis tickFormatter={(v) => `R$ ${Number(v).toLocaleString('pt-BR')}`} tick={{ fontSize: 11 }} width={70} />
                  <Tooltip
                    formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
                    labelStyle={{ color: 'var(--foreground)' }}
                    contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Bar dataKey="shop" name="Loja" stackId="r" fill={SOURCE_COLORS.shop} />
                  <Bar dataKey="tickets" name="Ingressos" stackId="r" fill={SOURCE_COLORS.tickets} />
                  <Bar dataKey="club" name="Clube" stackId="r" fill={SOURCE_COLORS.club} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* min-w-0: a long product name must truncate, not widen the page on a phone. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Formas de pagamento</CardTitle>
            <CardDescription>Valores brutos, antes das taxas da operadora.</CardDescription>
          </CardHeader>
          <CardContent>
            <ShareList
              empty="Nenhum pagamento no período."
              rows={report.byMethod.map((m) => ({
                label: PAYMENT_METHOD_LABEL[m.method],
                value: m.revenue,
                detail: `${m.count} venda(s)`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Loja por categoria</CardTitle>
            <CardDescription>Já com o desconto do pedido abatido.</CardDescription>
          </CardHeader>
          <CardContent>
            <ShareList
              empty="Nenhum produto vendido no período."
              rows={report.byCategory.map((c) => ({ label: c.name, value: c.revenue, detail: `${c.quantity} unidade(s)` }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Produtos que mais venderam</CardTitle>
            <CardDescription>
              {products.unitsSold} unidade(s) de {products.distinctProducts} produto(s) no período.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {products.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum produto vendido no período.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {products.top.map((p, i) => (
                  <li key={p.name} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground">{i + 1}.</span> {p.name}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="text-muted-foreground">{p.quantity} un. · </span>
                      <strong>{formatCurrency(p.revenue)}</strong>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fora da receita</CardTitle>
            <CardDescription>
              {formatCurrency(unrealized)} que não entraram — nada disto está somado acima.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {[
                ['Aguardando pagamento', sales.pendingOrders, sales.pendingRevenue],
                ['Cancelados (inclui PIX vencido e cartão abandonado)', sales.cancelledOrders, sales.cancelledRevenue],
                ['Estornados na loja', sales.refundedOrders, sales.refundedRevenue],
                ['Estornados no clube', club.refundedPayments, club.refunded],
              ].map(([label, count, value]) => (
                <div key={label as string} className="flex items-baseline justify-between gap-3">
                  <dt className="min-w-0">
                    {label} <span className="text-muted-foreground">({count as number})</span>
                  </dt>
                  <dd className="shrink-0 font-semibold tabular-nums">{formatCurrency(value as number)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <SalesLedger key={`${report.period.start}-${report.period.end}`} report={report} />
    </div>
  )
}
