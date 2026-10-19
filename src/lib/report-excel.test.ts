/**
 * Report spreadsheets.
 *
 * What these tests protect:
 *  1. The workbook opens and carries the sheets the manager looks for.
 *  2. A sale at 22h in Rio stays on its day (Excel dates have no timezone).
 *  3. The ledger total counts only what entered the revenue.
 */

import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildMonthlyWorkbook, buildReportWorkbook, monthlyExcelFilename, reportExcelFilename, rioWallClock } from './report-excel'
import type { LedgerEntry, MonthlyReportData, OverviewReport } from './reports'

function entry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    kind: 'shop',
    id: 'o1',
    reference: '#48',
    at: '2026-10-14T01:00:00.000Z',
    customer: 'Larissa',
    description: '1x Pepero',
    method: 'pix',
    channel: 'retail',
    installments: null,
    status: 'delivered',
    subtotal: 20,
    discount: 1,
    shipping: 0,
    total: 19,
    counted: true,
    ...overrides,
  }
}

function makeReport(): OverviewReport {
  return {
    period: { type: 'month', start: '2026-10-01T03:00:00.000Z', end: '2026-11-01T03:00:00.000Z' },
    sales: {
      orders: 1, revenue: 19, averageTicket: 19, subtotal: 20, discount: 1, shipping: 0, storeCredit: 0,
      retailOrders: 1, retailRevenue: 19, wholesaleOrders: 0, wholesaleRevenue: 0, pixOrders: 1, cardOrders: 0,
      pixRevenue: 19, cardRevenue: 0, pendingOrders: 1, pendingRevenue: 50, cancelledOrders: 0, cancelledRevenue: 0,
      refundedOrders: 0, refundedRevenue: 0,
      grossRevenue: 19, priorRefunds: 0, priorRefundsCount: 0, averageProductTicket: 19, shippedOrders: 0, labelCost: 0, shippingWithLabel: 0, labelsWithCost: 0, cancelledCustomers: 0, cancelledCartsValue: 0,
    },
    club: { revenue: 0, payments: 0, newMembers: 0, activeMembers: 4, expiredInPeriod: 0, refunded: 0, refundedPayments: 0, grossRevenue: 0, priorRefunds: 0, priorRefundsCount: 0, signups: 0, signupsPaid: 0, conversionPct: 0 },
    tickets: { revenue: 75, reservations: 1, tickets: 3 },
    ticketsByEvent: [],
    stale: { days: 60, count: 0, units: 0, shelfValue: 0, items: [] },
    margin: {
      cogs: 0, grossProfit: 0, marginPct: 0, revenueWithCost: 0, revenueWithoutCost: 19, costCoveragePct: 0,
      unitsWithoutCost: 1, inventoryValue: 9000, productsWithoutCost: 3,
    },
    products: {
      unitsSold: 1, distinctProducts: 1, top: [{ name: 'Pepero', quantity: 1, revenue: 19 }],
      ranking: [
        { name: 'Pepero', quantity: 1, revenue: 19, cost: null },
        { name: 'Bolsa', quantity: 1, revenue: 100, cost: 60 },
      ],
      activeSkus: 10, outOfStock: 1, lowStock: 2,
    },
    series: { bucket: 'day', points: [{ date: '2026-10-13', shop: 19, club: 0, tickets: 75, total: 94, orders: 1 }] },
    byMethod: [{ method: 'pix', count: 2, revenue: 94 }],
    byCategory: [{ name: 'Comidas', quantity: 1, revenue: 19 }],
    ledger: {
      entries: [
        entry({}),
        entry({ id: 'o2', reference: '#49', status: 'pending', total: 50, counted: false }),
        entry({ kind: 'ticket', id: 't1', reference: 'R-1', total: 75, status: 'confirmed', channel: null }),
      ],
      truncated: false,
    },
    previous: { salesRevenue: 10, clubRevenue: 0, ticketRevenue: 0, orders: 1, newMembers: 0 },
  }
}

async function roundTrip(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buffer = await wb.xlsx.writeBuffer()
  const back = new ExcelJS.Workbook()
  await back.xlsx.load(buffer as ArrayBuffer)
  return back
}

describe('rioWallClock', () => {
  it('keeps a 22h sale in Rio on its own day', () => {
    // 01:00 UTC on the 14th is 22:00 on the 13th in Rio.
    expect(rioWallClock('2026-10-14T01:00:00.000Z').toISOString()).toBe('2026-10-13T22:00:00.000Z')
  })
})

describe('buildReportWorkbook', () => {
  it('writes a workbook with every sheet', async () => {
    const wb = await roundTrip(buildReportWorkbook(makeReport()))
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      'Resumo', 'Vendas', 'Por dia', 'Produtos', 'Categorias', 'Pagamentos',
    ])
  })

  it('lists every sale and totals only what entered the revenue', async () => {
    const wb = await roundTrip(buildReportWorkbook(makeReport()))
    const ws = wb.getWorksheet('Vendas')!
    expect(ws.getRow(1).getCell(1).value).toBe('Data')
    expect(ws.getRow(3).getCell(9).value).toBe('Aguardando pagamento')
    expect(ws.getRow(3).getCell(10).value).toBe('Não')
    const total = ws.getRow(5).getCell(14).value as { formula: string; result: number }
    expect(total.formula).toBe('SUMIFS(N2:N4,J2:J4,"Sim")')
    expect(total.result).toBe(94)
  })

  it('leaves the product cost empty when it is unknown', async () => {
    const wb = await roundTrip(buildReportWorkbook(makeReport()))
    const ws = wb.getWorksheet('Produtos')!
    expect(ws.getRow(2).getCell(4).value).toBe('sem custo')
    expect(ws.getRow(2).getCell(5).value).toBeNull()
    expect(ws.getRow(3).getCell(5).value).toBe(40)
  })

  it('names the file like the PDF', () => {
    expect(reportExcelFilename(makeReport())).toBe('relatorio-geekpop-month-2026-10.xlsx')
  })
})

describe('buildMonthlyWorkbook', () => {
  const rows: MonthlyReportData[] = [
    { period: '2026-09', month: '2026-09', revenue: 12.5, paymentCount: 1, newMembers: 2, churnedMembers: 0, shopRevenue: 1000, shopOrders: 8, ticketRevenue: 440, ticketCount: 9 },
    { period: '2026-10', month: '2026-10', revenue: 0, paymentCount: 0, newMembers: 0, churnedMembers: 0, shopRevenue: 781.31, shopOrders: 4, ticketRevenue: 675, ticketCount: 17 },
  ]

  it('has one row per month and a total row', async () => {
    const wb = await roundTrip(buildMonthlyWorkbook(rows))
    const ws = wb.getWorksheet('Vendas por mês')!
    expect(ws.rowCount).toBe(4)
    expect(ws.getRow(2).getCell(9).value).toBe(1452.5)
    const total = ws.getRow(4).getCell(9).value as { result: number }
    expect(total.result).toBeCloseTo(2908.81)
    expect(monthlyExcelFilename(rows)).toBe('vendas-por-mes-geekpop-2026-09_a_2026-10.xlsx')
  })
})
