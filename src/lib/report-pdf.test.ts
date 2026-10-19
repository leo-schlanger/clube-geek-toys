/**
 * Report PDF generation.
 *
 * What these tests protect, ordered by how much a regression would cost:
 *
 *  1. A product name pdf-lib cannot encode (Hangul, emoji — routine in a K-pop
 *     catalogue) must not throw. The whole export dies with it.
 *  2. The document is a real, non-empty PDF.
 *  3. The filename carries the period, so a folder of exports sorts by date.
 */

import { describe, it, expect } from 'vitest'
import { formatRange, generateReportPDF, reportFilename, revenueTotals, toPdfText } from './report-pdf'
import type { OverviewReport } from './reports'

function makeReport(overrides: Partial<OverviewReport> = {}): OverviewReport {
  return {
    period: { type: 'month', start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
    sales: {
      orders: 12,
      revenue: 3480.5,
      averageTicket: 290.04,
      subtotal: 3600,
      discount: 400,
      shipping: 280.5,
      storeCredit: 12,
      retailOrders: 10,
      retailRevenue: 2480.5,
      wholesaleOrders: 2,
      wholesaleRevenue: 1000,
      pixOrders: 7,
      cardOrders: 5,
      pixRevenue: 1480.5,
      cardRevenue: 2000,
      pendingOrders: 3,
      pendingRevenue: 310,
      cancelledOrders: 1,
      cancelledRevenue: 90,
      refundedOrders: 0,
      refundedRevenue: 0,
      grossRevenue: 3480.5,
      priorRefunds: 0,
      priorRefundsCount: 0,
      averageProductTicket: 266.67,
      shippedOrders: 0,
      labelCost: 0,
      shippingWithLabel: 0,
      labelsWithCost: 0,
      cancelledCustomers: 1,
      cancelledCartsValue: 90,
    },
    club: {
      revenue: 1499.9,
      payments: 10,
      newMembers: 4,
      activeMembers: 38,
      expiredInPeriod: 2,
      refunded: 0,
      refundedPayments: 0,
      grossRevenue: 1499.9,
      priorRefunds: 0,
      priorRefundsCount: 0,
      signups: 5,
      signupsPaid: 4,
      conversionPct: 80,
    },
    margin: {
      cogs: 1800,
      grossProfit: 1200,
      marginPct: 40,
      revenueWithCost: 3000,
      revenueWithoutCost: 500,
      costCoveragePct: 85.7,
      unitsWithoutCost: 9,
      inventoryValue: 12500,
      productsWithoutCost: 4,
    },
    products: {
      unitsSold: 96,
      distinctProducts: 21,
      top: [
        { name: 'Photocard NewJeans', quantity: 24, revenue: 720 },
        { name: 'Album BTS Proof', quantity: 8, revenue: 640 },
      ],
      ranking: [],
      activeSkus: 210,
      outOfStock: 6,
      lowStock: 14,
    },
    tickets: { revenue: 440, reservations: 9, tickets: 15 },
    ticketsByEvent: [],
    stale: { days: 60, count: 0, units: 0, shelfValue: 0, items: [] },
    series: { bucket: 'day', points: [] },
    byMethod: [
      { method: 'pix', count: 16, revenue: 3420.4 },
      { method: 'credit_card', count: 5, revenue: 2000 },
    ],
    byCategory: [{ name: 'K-pop', quantity: 40, revenue: 2100 }],
    ledger: {
      entries: [
        {
          kind: 'shop',
          id: 'o1',
          reference: '#48',
          at: '2026-08-13T22:30:00.000Z',
          customer: 'Larissa 라리사',
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
        },
      ],
      truncated: false,
    },
    previous: { salesRevenue: 3000, clubRevenue: 1200, ticketRevenue: 200, orders: 10, newMembers: 3 },
    ...overrides,
  }
}

describe('toPdfText', () => {
  it('keeps accented Portuguese, which the standard fonts do encode', () => {
    expect(toPdfText('Coleção de canecas — edição única')).toBe('Coleção de canecas — edição única')
  })

  it('drops characters the standard fonts cannot encode', () => {
    expect(toPdfText('BTS 방탄소년단 Photocard')).toBe('BTS Photocard')
    expect(toPdfText('Chaveiro 🧸 fofo')).toBe('Chaveiro fofo')
  })

  it('collapses the whitespace left behind by dropped characters', () => {
    expect(toPdfText('알파   베타')).toBe('')
    expect(toPdfText('Kit  🎀  Rosa')).toBe('Kit Rosa')
  })
})

describe('generateReportPDF', () => {
  it('produces a non-empty PDF document', async () => {
    const bytes = await generateReportPDF(makeReport())

    expect(bytes.byteLength).toBeGreaterThan(1000)
    // %PDF- magic number
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('does not throw on product names the font cannot encode', async () => {
    const report = makeReport({
      products: {
        ...makeReport().products,
        top: [
          { name: '방탄소년단 응원봉', quantity: 5, revenue: 500 },
          { name: 'Photocard ✨ Limited', quantity: 3, revenue: 90 },
        ],
      },
    })

    await expect(generateReportPDF(report)).resolves.toBeInstanceOf(Uint8Array)
  })

  it('renders a period with no sales at all', async () => {
    const empty = makeReport({
      sales: { ...makeReport().sales, orders: 0, revenue: 0, averageTicket: 0 },
      products: { ...makeReport().products, top: [], unitsSold: 0, distinctProducts: 0 },
      tickets: { revenue: 0, reservations: 0, tickets: 0 },
      ledger: { entries: [], truncated: false },
      byMethod: [],
      byCategory: [],
      previous: { salesRevenue: 0, clubRevenue: 0, ticketRevenue: 0, orders: 0, newMembers: 0 },
    })

    await expect(generateReportPDF(empty)).resolves.toBeInstanceOf(Uint8Array)
  })

  it('renders every period type', async () => {
    for (const type of ['day', 'month', 'year', 'range'] as const) {
      const report = makeReport({
        period: { type, start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
      })
      await expect(generateReportPDF(report)).resolves.toBeInstanceOf(Uint8Array)
    }
  })

  it('paginates a long ranking instead of drawing past the page', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      name: `Produto de nome bastante longo para forcar truncamento ${i}`,
      quantity: 10 - i,
      revenue: 1000 - i * 10,
    }))
    const bytes = await generateReportPDF(makeReport({ products: { ...makeReport().products, top: many } }))

    expect(bytes.byteLength).toBeGreaterThan(1000)
  })
})

describe('reportFilename', () => {
  it('names a daily report by its date', () => {
    const report = makeReport({
      period: { type: 'day', start: '2026-08-18T00:00:00.000Z', end: '2026-08-19T00:00:00.000Z' },
    })
    expect(reportFilename(report)).toBe('relatorio-geekpop-day-2026-08-18.pdf')
  })

  it('names a monthly report by its month', () => {
    expect(reportFilename(makeReport())).toBe('relatorio-geekpop-month-2026-08.pdf')
  })

  it('names a yearly report by its year', () => {
    const report = makeReport({
      period: { type: 'year', start: '2026-01-01T00:00:00.000Z', end: '2027-01-01T00:00:00.000Z' },
    })
    expect(reportFilename(report)).toBe('relatorio-geekpop-year-2026.pdf')
  })
})

describe('custom range', () => {
  const range = makeReport({
    period: { type: 'range', start: '2026-09-10T03:00:00.000Z', end: '2026-10-17T03:00:00.000Z' },
  })

  it('names the file by the first and the last day, on the Rio calendar', () => {
    expect(reportFilename(range)).toBe('relatorio-geekpop-periodo-2026-09-10_a_2026-10-16.pdf')
  })

  it('shows the range with the last day included', () => {
    expect(formatRange('range', range.period.start, range.period.end)).toBe('10/09/2026 a 16/10/2026')
  })

  // The sales list carries customer names, and K-pop fans write them in Hangul.
  it('lists hundreds of sales across pages without throwing', async () => {
    const entry = range.ledger.entries[0]
    const entries = Array.from({ length: 400 }, (_, i) => ({ ...entry, id: `o${i}`, customer: `Cliente 김 ${i}` }))
    const bytes = await generateReportPDF({ ...range, ledger: { entries, truncated: true } })
    expect(bytes.byteLength).toBeGreaterThan(5000)
  })
})

describe('report totals and period', () => {
  // Tickets were missing from every report; the PDF said "loja + clube".
  it('counts event tickets in the total and in the comparison', () => {
    const totals = revenueTotals(makeReport())
    expect(totals.current).toBeCloseTo(3480.5 + 440 + makeReport().club.revenue)
    expect(totals.previous).toBe(3000 + 200 + 1200)
  })

  // The API now cuts months at Rio midnight (03:00Z). Read in UTC, October
  // would have ended "01/11"; read in Rio it ends on the 31st.
  it('shows the period on the Rio calendar', () => {
    expect(formatRange('month', '2026-10-01T03:00:00.000Z', '2026-11-01T03:00:00.000Z')).toBe('01/10/2026 a 31/10/2026')
    expect(formatRange('day', '2026-10-09T03:00:00.000Z', '2026-10-10T03:00:00.000Z')).toBe('09/10/2026')
  })
})
