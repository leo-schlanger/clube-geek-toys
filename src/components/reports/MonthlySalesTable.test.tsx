import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MonthlyReportData } from '../../lib/reports'

const mocks = vi.hoisted(() => ({
  buildMonthlyWorkbook: vi.fn(() => ({ wb: true })),
  downloadWorkbook: vi.fn(async () => {}),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../lib/report-excel', () => ({
  buildMonthlyWorkbook: mocks.buildMonthlyWorkbook,
  downloadWorkbook: mocks.downloadWorkbook,
  monthlyExcelFilename: () => 'vendas.xlsx',
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import { MonthlySalesTable } from './MonthlySalesTable'

const rows: MonthlyReportData[] = [
  { period: '2026-09', month: '2026-09', revenue: 12.5, paymentCount: 1, newMembers: 2, churnedMembers: 0, shopRevenue: 1000, shopOrders: 8, ticketRevenue: 440, ticketCount: 9 },
  { period: '2026-10', month: '2026-10', revenue: 0, paymentCount: 0, newMembers: 0, churnedMembers: 0, shopRevenue: 781.31, shopOrders: 4, ticketRevenue: 675, ticketCount: 17 },
]

beforeEach(() => vi.clearAllMocks())

describe('MonthlySalesTable', () => {
  it('lists the newest month first, with the total of the three sources', () => {
    render(<MonthlySalesTable data={rows} />)
    const months = screen.getAllByRole('row').slice(1, 3).map((r) => r.textContent)
    expect(months[0]).toMatch(/^out\/2026/)
    expect(months[1]).toMatch(/^set\/2026/)
    expect(screen.getByText('R$ 1.452,50')).toBeInTheDocument()
    expect(screen.getByText('R$ 2.908,81')).toBeInTheDocument()
  })

  it('exports the same months to Excel', async () => {
    render(<MonthlySalesTable data={rows} />)
    await userEvent.click(screen.getByRole('button', { name: /Baixar Excel/ }))
    await waitFor(() => expect(mocks.downloadWorkbook).toHaveBeenCalledWith({ wb: true }, 'vendas.xlsx'))
    expect(mocks.buildMonthlyWorkbook).toHaveBeenCalledWith(rows)
  })
})
