/**
 * FinancePanel — the "Financeiro" block of the reports tab.
 *
 * What these tests protect:
 *  1. The period the admin picks reaches the API unchanged (asking for August
 *     and getting September is worse than an error), and a broken range is
 *     never sent.
 *  2. The sales list shows only what entered the revenue unless asked.
 *  3. PDF and Excel are built from the report on screen, so the files and the
 *     panel never disagree.
 *  4. A failure reads as a failure, not as a month without sales.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockPhoneScreen } from '../../test/mobile'
import type { OverviewReport } from '../../lib/reports'

const mocks = vi.hoisted(() => ({
  getOverviewReport: vi.fn(),
  generateReportPDF: vi.fn(async () => new Uint8Array([1])),
  downloadPDF: vi.fn(),
  buildReportWorkbook: vi.fn(() => ({ wb: true })),
  downloadWorkbook: vi.fn(async () => {}),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../../lib/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/reports')>()),
  getOverviewReport: mocks.getOverviewReport,
}))
vi.mock('../../lib/report-pdf', () => ({
  generateReportPDF: mocks.generateReportPDF,
  reportFilename: () => 'relatorio.pdf',
}))
vi.mock('../../lib/contract-generator', () => ({ downloadPDF: mocks.downloadPDF }))
vi.mock('../../lib/report-excel', () => ({
  buildReportWorkbook: mocks.buildReportWorkbook,
  downloadWorkbook: mocks.downloadWorkbook,
  reportExcelFilename: () => 'relatorio.xlsx',
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    ResponsiveContainer: Box,
    BarChart: Box,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  }
})
vi.mock('../../lib/finance-period', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/finance-period')>()),
  todayInRio: () => '2026-10-16',
}))

import { FinancePanel } from './FinancePanel'

function makeReport(): OverviewReport {
  return {
    period: {
      type: 'month',
      start: '2026-10-01T03:00:00.000Z',
      end: '2026-11-01T03:00:00.000Z',
      previousStart: '2026-09-01T03:00:00.000Z',
      days: 31,
    },
    sales: {
      orders: 2, revenue: 300, averageTicket: 150, subtotal: 320, discount: 20, shipping: 0, storeCredit: 0,
      retailOrders: 2, retailRevenue: 300, wholesaleOrders: 0, wholesaleRevenue: 0, pixOrders: 1, cardOrders: 1,
      pixRevenue: 100, cardRevenue: 200, pendingOrders: 1, pendingRevenue: 80, cancelledOrders: 2, cancelledRevenue: 120,
      refundedOrders: 0, refundedRevenue: 0,
      grossRevenue: 300, priorRefunds: 0, priorRefundsCount: 0, averageProductTicket: 150, shippedOrders: 0, labelCost: 0, shippingWithLabel: 0, labelsWithCost: 0, cancelledCustomers: 1, cancelledCartsValue: 120,
    },
    club: { revenue: 0, payments: 0, newMembers: 0, activeMembers: 4, expiredInPeriod: 0, refunded: 0, refundedPayments: 0, grossRevenue: 0, priorRefunds: 0, priorRefundsCount: 0, signups: 0, signupsPaid: 0, conversionPct: 0 },
    tickets: { revenue: 75, reservations: 1, tickets: 3 },
    ticketsByEvent: [],
    stale: { days: 60, count: 0, units: 0, shelfValue: 0, items: [] },
    margin: {
      cogs: 0, grossProfit: 0, marginPct: 0, revenueWithCost: 0, revenueWithoutCost: 300, costCoveragePct: 0,
      unitsWithoutCost: 3, inventoryValue: 0, productsWithoutCost: 0,
    },
    products: {
      unitsSold: 3, distinctProducts: 2, top: [{ name: 'Mochila Stray Kids', quantity: 2, revenue: 200 }],
      ranking: [], activeSkus: 10, outOfStock: 0, lowStock: 0,
    },
    series: { bucket: 'day', points: [{ date: '2026-10-04', shop: 300, club: 0, tickets: 75, total: 375, orders: 2 }] },
    byMethod: [
      { method: 'pix', count: 2, revenue: 175 },
      { method: 'credit_card', count: 1, revenue: 200 },
    ],
    byCategory: [{ name: 'K-pop', quantity: 3, revenue: 300 }],
    ledger: {
      entries: [
        {
          kind: 'shop', id: 'o1', reference: '#48', at: '2026-10-13T19:59:00.000Z', customer: 'Larissa Abreu',
          description: '1x Mochila', method: 'credit_card', channel: 'retail', installments: 3, status: 'delivered',
          subtotal: 200, discount: 0, shipping: 0, total: 200, counted: true,
        },
        {
          kind: 'shop', id: 'o2', reference: '#49', at: '2026-10-14T10:00:00.000Z', customer: 'Cliente Sem Pagar',
          description: '1x Bolsa', method: 'pix', channel: 'retail', installments: null, status: 'cancelled',
          subtotal: 120, discount: 0, shipping: 0, total: 120, counted: false,
        },
        {
          kind: 'ticket', id: 't1', reference: 'R-MMS3', at: '2026-10-15T22:00:00.000Z', customer: 'Adriana Cravo',
          description: '3 ingresso(s) - Halloween K-Pop', method: 'pix', channel: null, installments: null,
          status: 'confirmed', subtotal: 75, discount: 0, shipping: 0, total: 75, counted: true,
        },
      ],
      truncated: false,
    },
    previous: { salesRevenue: 250, clubRevenue: 0, ticketRevenue: 0, orders: 1, newMembers: 0 },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getOverviewReport.mockResolvedValue(makeReport())
})

afterEach(() => vi.restoreAllMocks())

describe('FinancePanel', () => {
  it('opens on this month and shows the total of the three sources', async () => {
    render(<FinancePanel />)

    await waitFor(() => expect(mocks.getOverviewReport).toHaveBeenCalledWith('month', '2026-10-16', undefined))
    // 300 shop + 75 tickets, +50% over the 250 before.
    expect(await screen.findByText('R$ 375,00')).toBeInTheDocument()
    expect(screen.getByText(/\+50% vs período anterior/)).toBeInTheDocument()
  })

  it('asks for the month the admin picks', async () => {
    const user = userEvent.setup()
    render(<FinancePanel />)
    await screen.findByText('R$ 375,00')

    await user.click(screen.getByRole('button', { name: 'Escolher mês' }))
    fireEvent.change(screen.getByLabelText('Mês'), { target: { value: '2026-08' } })

    await waitFor(() => expect(mocks.getOverviewReport).toHaveBeenLastCalledWith('month', '2026-08-01', undefined))
  })

  it('sends a custom range, and never one that ends before it starts', async () => {
    const user = userEvent.setup()
    render(<FinancePanel />)
    await screen.findByText('R$ 375,00')

    await user.click(screen.getByRole('button', { name: 'Intervalo' }))
    await waitFor(() =>
      expect(mocks.getOverviewReport).toHaveBeenLastCalledWith('range', undefined, { start: '2026-10-01', end: '2026-10-16' })
    )

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-10' } })
    await waitFor(() =>
      expect(mocks.getOverviewReport).toHaveBeenLastCalledWith('range', undefined, { start: '2026-09-10', end: '2026-10-16' })
    )

    const calls = mocks.getOverviewReport.mock.calls.length
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-09-01' } })
    expect(await screen.findByText(/com a inicial antes da final/)).toBeInTheDocument()
    expect(mocks.getOverviewReport).toHaveBeenCalledTimes(calls)
  })

  it('lists only the sales that entered the revenue until asked for the rest', async () => {
    const user = userEvent.setup()
    render(<FinancePanel />)
    await screen.findByText('Larissa Abreu')

    expect(screen.getByText('Adriana Cravo')).toBeInTheDocument()
    expect(screen.queryByText('Cliente Sem Pagar')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText(/Mostrar não pagos/))
    expect(screen.getByText('Cliente Sem Pagar')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ingresso' }))
    expect(screen.queryByText('Larissa Abreu')).not.toBeInTheDocument()
    expect(screen.getByText('Adriana Cravo')).toBeInTheDocument()
  })

  it('keeps money that did not come in apart from the revenue', async () => {
    render(<FinancePanel />)
    await screen.findByText('Fora da receita')
    // 80 waiting + the largest cancelled cart of the one customer who retried.
    expect(screen.getByText(/R\$ 200,00 que não ficaram com a loja/)).toBeInTheDocument()
    expect(screen.getByText(/1 cliente\(s\), 2 tentativa\(s\)/)).toBeInTheDocument()
  })

  it('builds the PDF and the spreadsheet from the report on screen', async () => {
    const user = userEvent.setup()
    render(<FinancePanel />)
    await screen.findByText('R$ 375,00')

    await user.click(screen.getByRole('button', { name: /Excel/ }))
    await waitFor(() => expect(mocks.downloadWorkbook).toHaveBeenCalledWith({ wb: true }, 'relatorio.xlsx'))
    expect(mocks.buildReportWorkbook).toHaveBeenCalledWith(makeReport())

    await user.click(screen.getByRole('button', { name: /PDF/ }))
    await waitFor(() => expect(mocks.downloadPDF).toHaveBeenCalledWith(new Uint8Array([1]), 'relatorio.pdf'))
    expect(mocks.generateReportPDF).toHaveBeenCalledWith(makeReport())
  })

  it('says the report failed instead of showing zeros', async () => {
    mocks.getOverviewReport.mockRejectedValue(new Error('Erro 500'))
    render(<FinancePanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent('não quer dizer que não houve vendas')
    expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Excel/ })).toBeDisabled()
  })

  it('shows the sales as cards on a phone', async () => {
    mockPhoneScreen()
    render(<FinancePanel />)

    expect(await screen.findByText('Larissa Abreu')).toBeInTheDocument()
    expect(document.querySelector('table')).toBeNull()
    expect(screen.getByText('3x')).toBeInTheDocument()
  })
})
