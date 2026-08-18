import { useState } from 'react'
import { toast } from 'sonner'
import { Download, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { getOverviewReport, type OverviewPeriod } from '../../lib/reports'

const PERIODS: { value: OverviewPeriod; label: string; hint: string }[] = [
  { value: 'day', label: 'Dia', hint: 'Fechamento de um dia' },
  { value: 'month', label: 'Mês', hint: 'Fechamento do mês' },
  { value: 'year', label: 'Ano', hint: 'Consolidado do ano' },
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Period report as a downloadable PDF.
 *
 * The charts above answer trends; this answers "me dá o fechamento" — one file
 * with shop, club, best sellers and current stock, for filing or sending to the
 * accountant. The date picks any day inside the period, so choosing 15/07 with
 * "Mês" gives all of July.
 */
export function ReportExport() {
  const [period, setPeriod] = useState<OverviewPeriod>('month')
  const [date, setDate] = useState(today())
  const [generating, setGenerating] = useState(false)

  const handleDownload = async () => {
    setGenerating(true)
    try {
      const report = await getOverviewReport(period, date)
      // Loaded only on click: pdf-lib is a large chunk and most admin visits
      // never export anything.
      const { generateReportPDF, reportFilename } = await import('../../lib/report-pdf')
      const { downloadPDF } = await import('../../lib/contract-generator')
      downloadPDF(await generateReportPDF(report), reportFilename(report))
      toast.success('Relatório gerado.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível gerar o relatório.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Relatório em PDF
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label>Período</Label>
            <div className="flex gap-2" role="group" aria-label="Período do relatório">
              {PERIODS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={period === option.value ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={period === option.value}
                  onClick={() => setPeriod(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-date">Data de referência</Label>
            <Input
              id="report-date"
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-44"
            />
          </div>

          <Button onClick={handleDownload} disabled={generating || !date} className="sm:ml-auto">
            <Download className="h-4 w-4" />
            {generating ? 'Gerando...' : 'Baixar PDF'}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {PERIODS.find((p) => p.value === period)?.hint} — inclui receita da loja e do clube, ticket médio,
          varejo × atacado, novos membros, produtos mais vendidos e a situação do estoque, com comparação
          contra o período anterior.
        </p>
      </CardContent>
    </Card>
  )
}
