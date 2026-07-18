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

interface ReportsTabProps {
  reportPeriod: number
  monthlyReportData: MonthlyReportData[]
  planDistribution: PlanDistribution[]
  churnData: ChurnData[]
  loadingReports: boolean
  onPeriodChange: (period: number) => void
  onRefresh: () => void
}

export function ReportsTab({
  reportPeriod,
  monthlyReportData,
  planDistribution,
  churnData,
  loadingReports,
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
    </div>
  )
}
