import {
  RevenueChart,
  MembersChart,
  PointsChart,
  ChurnMetrics,
  ReportFilters,
} from '../reports'
import type {
  MonthlyReportData,
  PlanDistribution,
  ChurnData,
  PointsOverview,
} from '../../lib/reports'

interface ReportsTabProps {
  reportPeriod: number
  monthlyReportData: MonthlyReportData[]
  planDistribution: PlanDistribution[]
  churnData: ChurnData[]
  pointsOverviewData: PointsOverview[]
  loadingReports: boolean
  onPeriodChange: (period: number) => void
  onRefresh: () => void
}

export function ReportsTab({
  reportPeriod,
  monthlyReportData,
  planDistribution,
  churnData,
  pointsOverviewData,
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

      {/* Points and Churn */}
      <div className="grid lg:grid-cols-2 gap-6">
        <PointsChart data={pointsOverviewData} loading={loadingReports} />
        <ChurnMetrics data={churnData} loading={loadingReports} />
      </div>
    </div>
  )
}
