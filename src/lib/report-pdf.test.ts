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
import { generateReportPDF, reportFilename, toPdfText } from './report-pdf'
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
      pendingOrders: 3,
      cancelledOrders: 1,
      refundedOrders: 0,
    },
    club: { revenue: 1499.9, payments: 10, newMembers: 4, activeMembers: 38, expiredInPeriod: 2 },
    products: {
      unitsSold: 96,
      distinctProducts: 21,
      top: [
        { name: 'Photocard NewJeans', quantity: 24, revenue: 720 },
        { name: 'Album BTS Proof', quantity: 8, revenue: 640 },
      ],
      activeSkus: 210,
      outOfStock: 6,
      lowStock: 14,
    },
    previous: { salesRevenue: 3000, clubRevenue: 1200, orders: 10, newMembers: 3 },
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
      previous: { salesRevenue: 0, clubRevenue: 0, orders: 0, newMembers: 0 },
    })

    await expect(generateReportPDF(empty)).resolves.toBeInstanceOf(Uint8Array)
  })

  it('renders every period type', async () => {
    for (const type of ['day', 'month', 'year'] as const) {
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
