import {
  RevenueChart,
  MembersChart,
  ChurnMetrics,
  ReportFilters,
} from '../reports'
import type {
  MonthlyReportData,
  PlanDistribution,
  ChurnData,
} from '../../lib/reports'
import { ReportExport } from './ReportExport'
import { Button } from '../ui/button'

interface ReportsTabProps {
  reportPeriod: number
  monthlyReportData: MonthlyReportData[]
  planDistribution: PlanDistribution[]
  churnData: ChurnData[]
  loadingReports: boolean
  /** The reports failed to load; shown instead of charts that would read as zero. */
  reportsError?: string | null
  onPeriodChange: (period: number) => void
  onRefresh: () => void
}

export function ReportsTab({
  reportPeriod,
  monthlyReportData,
  planDistribution,
  churnData,
  loadingReports,
  reportsError,
  onPeriodChange,
  onRefresh,
}: ReportsTabProps) {
  return (
    <div className="space-y-6">
      <ReportFilters
        selectedPeriod={reportPeriod}
        onPeriodChange={onPeriodChange}
        onRefresh={onRefresh}
        refreshing={loadingReports}
      />

      <ReportExport />

      {reportsError && !loadingReports ? (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm">
          <p className="font-semibold text-red-600 dark:text-red-400">
            Não foi possível carregar os relatórios
          </p>
          <p className="mt-1 text-muted-foreground">
            {reportsError}. Sem os dados, os gráficos ficam de fora — isso não quer dizer que não houve vendas.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRefresh}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <>
          {/* Revenue Chart */}
          <RevenueChart data={monthlyReportData} loading={loadingReports} />

          {/* Members Charts */}
          <MembersChart
            data={monthlyReportData}
            planDistribution={planDistribution}
            loading={loadingReports}
          />

          {/* Churn */}
          <ChurnMetrics data={churnData} loading={loadingReports} />
        </>
      )}
    </div>
  )
}
