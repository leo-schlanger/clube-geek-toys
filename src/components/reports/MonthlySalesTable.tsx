import { useState } from 'react'
import { toast } from 'sonner'
import { FileSpreadsheet } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { formatCurrency } from '../../lib/utils'
import type { MonthlyReportData } from '../../lib/reports'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${MONTHS[Number(m) - 1] ?? m}/${y}`
}

interface MonthlySalesTableProps {
  data: MonthlyReportData[]
  loading?: boolean
}

/**
 * Sales month by month — the table the charts summarise, newest month first,
 * with a total row and an Excel export.
 */
export function MonthlySalesTable({ data, loading }: MonthlySalesTableProps) {
  const [exporting, setExporting] = useState(false)
  const rows = [...data].reverse()
  const sum = (pick: (r: MonthlyReportData) => number) => data.reduce((acc, r) => acc + pick(r), 0)
  const total = (r: MonthlyReportData) => r.shopRevenue + r.ticketRevenue + r.revenue

  const handleExport = async () => {
    setExporting(true)
    try {
      const { buildMonthlyWorkbook, downloadWorkbook, monthlyExcelFilename } = await import('../../lib/report-excel')
      await downloadWorkbook(buildMonthlyWorkbook(data), monthlyExcelFilename(data))
      toast.success('Planilha gerada.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível gerar a planilha.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Vendas por mês</CardTitle>
          <CardDescription>Loja, ingressos e clube, mês a mês, no horário do Rio.</CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={handleExport} disabled={loading || exporting || data.length === 0}>
          <FileSpreadsheet className="h-4 w-4" />
          {exporting ? 'Gerando...' : 'Baixar Excel'}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b text-right text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">Mês</th>
                  <th className="py-2 pr-3 font-medium">Loja</th>
                  <th className="py-2 pr-3 font-medium">Pedidos</th>
                  <th className="py-2 pr-3 font-medium">Ingressos</th>
                  <th className="py-2 pr-3 font-medium">Clube</th>
                  <th className="py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month} className="border-b text-right tabular-nums">
                    <td className="py-2 pr-3 text-left font-medium">{monthLabel(r.month)}</td>
                    <td className="py-2 pr-3">{formatCurrency(r.shopRevenue)}</td>
                    <td className="py-2 pr-3">{r.shopOrders}</td>
                    <td className="py-2 pr-3">{formatCurrency(r.ticketRevenue)}</td>
                    <td className="py-2 pr-3">{formatCurrency(r.revenue)}</td>
                    <td className="py-2 font-semibold">{formatCurrency(total(r))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-right font-bold tabular-nums">
                  <td className="py-2 pr-3 text-left">Total</td>
                  <td className="py-2 pr-3">{formatCurrency(sum((r) => r.shopRevenue))}</td>
                  <td className="py-2 pr-3">{sum((r) => r.shopOrders)}</td>
                  <td className="py-2 pr-3">{formatCurrency(sum((r) => r.ticketRevenue))}</td>
                  <td className="py-2 pr-3">{formatCurrency(sum((r) => r.revenue))}</td>
                  <td className="py-2">{formatCurrency(sum(total))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
