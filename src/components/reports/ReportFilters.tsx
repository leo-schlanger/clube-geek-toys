import { Button } from '../ui/button'
import { Calendar, RefreshCw } from 'lucide-react'

interface ReportFiltersProps {
  selectedPeriod: number
  onPeriodChange: (months: number) => void
  onRefresh: () => void
  refreshing?: boolean
}

export function ReportFilters({
  selectedPeriod,
  onPeriodChange,
  onRefresh,
  refreshing,
}: ReportFiltersProps) {
  const periods = [
    { value: 3, label: '3 meses' },
    { value: 6, label: '6 meses' },
    { value: 12, label: '12 meses' },
  ]

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium">Periodo:</span>
        <div className="flex gap-1">
          {periods.map((period) => (
            <Button
              key={period.value}
              variant={selectedPeriod === period.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPeriodChange(period.value)}
            >
              {period.label}
            </Button>
          ))}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
        Atualizar
      </Button>
    </div>
  )
}
