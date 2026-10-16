/**
 * Admin reports as Excel workbooks.
 *
 * Built from the same `OverviewReport` the panel and the PDF read, so the three
 * never disagree. exceljs is a large chunk: callers import this module only
 * when someone clicks "Baixar Excel".
 */

import ExcelJS from 'exceljs'
import {
  LEDGER_KIND_LABEL,
  LEDGER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  type MonthlyReportData,
  type OverviewReport,
} from './reports'
import { formatRange, reportBasename, revenueTotals } from './report-format'

const MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
const PERCENT = '0.0%'
const DATE_TIME = 'dd/mm/yyyy hh:mm'
const DATE = 'dd/mm/yyyy'
const MONTH = 'mmm/yyyy'
const PINK = 'FFF04080'

const PERIOD_TITLE: Record<OverviewReport['period']['type'], string> = {
  day: 'Relatório diário',
  month: 'Relatório mensal',
  year: 'Relatório anual',
  range: 'Relatório do período',
}

/**
 * The instant as the shop's wall clock, stored as a UTC date.
 *
 * Excel dates have no timezone and exceljs writes the Date's UTC fields, so a
 * sale at 22h in Rio must become 22h UTC — otherwise it shows on the next day.
 */
export function rioWallClock(isoValue: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(isoValue))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')))
}

/** A calendar date (YYYY-MM-DD or YYYY-MM) as a UTC midnight Excel shows unchanged. */
function calendarDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK } }
  row.alignment = { vertical: 'middle' }
}

function styleTotal(row: ExcelJS.Row) {
  row.font = { bold: true }
  row.border = { top: { style: 'thin' } }
}

/** A list sheet: pink header, frozen first row, filter on every column. */
function listSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: { header: string; key: string; width: number; numFmt?: string }[]
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = columns.map(({ header, key, width, numFmt }) => ({
    header,
    key,
    width,
    style: numFmt ? { numFmt } : {},
  }))
  styleHeader(ws.getRow(1))
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  return ws
}

function growth(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return (current - previous) / previous
}

/**
 * The period report as a workbook: summary first, then every sale, then the
 * cuts (by day, product, category, payment method) the PDF only summarises.
 */
export function buildReportWorkbook(report: OverviewReport): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Clube GeekPop & Toys'
  wb.created = new Date()

  const { sales, club, tickets, margin, products, period } = report
  const totals = revenueTotals(report)

  // ── Resumo ──────────────────────────────────────────────────────────
  const summary = wb.addWorksheet('Resumo')
  summary.columns = [
    { key: 'label', width: 44 },
    { key: 'value', width: 20 },
    { key: 'extra', width: 20 },
  ]
  summary.addRow(['GeekPop & Toys — ' + PERIOD_TITLE[period.type]]).font = { bold: true, size: 14, color: { argb: PINK } }
  summary.addRow([formatRange(period.type, period.start, period.end)]).font = { italic: true }
  summary.addRow([`Emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`]).font = {
    size: 9,
    color: { argb: 'FF6B7280' },
  }
  summary.addRow([])

  const section = (title: string) => {
    summary.addRow([])
    const row = summary.addRow([title, 'Valor', 'Período anterior'])
    styleHeader(row)
  }
  const cents = (value: number) => Math.round(value * 100) / 100
  const money = (label: string, value: number, previous?: number) => {
    const row = summary.addRow([label, cents(value), previous === undefined ? null : cents(previous)])
    row.getCell(2).numFmt = MONEY
    row.getCell(3).numFmt = MONEY
    return row
  }
  const count = (label: string, value: number, previous?: number) => summary.addRow([label, value, previous ?? null])

  section('Resumo')
  styleTotal(money('Receita total (loja + ingressos + clube)', totals.current, totals.previous))
  const delta = growth(totals.current, totals.previous)
  if (delta !== null) {
    const row = summary.addRow(['Variação contra o período anterior', delta])
    row.getCell(2).numFmt = PERCENT
  }
  money('Receita da loja (inclui frete)', sales.revenue, report.previous.salesRevenue)
  money('Receita de ingressos', tickets.revenue, report.previous.ticketRevenue)
  money('Receita do clube (anuidades)', club.revenue, report.previous.clubRevenue)
  count('Pedidos pagos', sales.orders, report.previous.orders)
  money('Ticket médio da loja', sales.averageTicket)
  count('Novos membros', club.newMembers, report.previous.newMembers)

  section('Loja')
  money('Subtotal dos produtos', sales.subtotal)
  money('Descontos concedidos', sales.discount)
  money('Frete cobrado', sales.shipping)
  money('Crédito de loja usado', sales.storeCredit)
  money('Varejo', sales.retailRevenue).getCell(3).value = `${sales.retailOrders} pedido(s)`
  money('Atacado', sales.wholesaleRevenue).getCell(3).value = `${sales.wholesaleOrders} pedido(s)`
  money('PIX', sales.pixRevenue).getCell(3).value = `${sales.pixOrders} pedido(s)`
  money('Cartão', sales.cardRevenue).getCell(3).value = `${sales.cardOrders} pedido(s)`

  section('Não realizado (fora da receita)')
  money('Aguardando pagamento', sales.pendingRevenue).getCell(3).value = `${sales.pendingOrders} pedido(s)`
  money('Cancelados', sales.cancelledRevenue).getCell(3).value = `${sales.cancelledOrders} pedido(s)`
  money('Estornados (loja)', sales.refundedRevenue).getCell(3).value = `${sales.refundedOrders} pedido(s)`
  money('Estornados (clube)', club.refunded).getCell(3).value = `${club.refundedPayments} pagamento(s)`

  section('Resultado da loja')
  money('Lucro bruto', margin.grossProfit)
  money('CMV (custo dos produtos vendidos)', margin.cogs)
  money('Receita com custo conhecido', margin.revenueWithCost)
  money('Receita sem custo cadastrado', margin.revenueWithoutCost)
  const marginRow = summary.addRow(['Margem bruta', margin.marginPct / 100])
  marginRow.getCell(2).numFmt = PERCENT
  money('Valor imobilizado em estoque (hoje)', margin.inventoryValue)

  section('Ingressos e clube')
  count('Reservas pagas', tickets.reservations)
  count('Ingressos vendidos', tickets.tickets)
  count('Pagamentos do clube', club.payments)
  count('Membros que expiraram no período', club.expiredInPeriod)
  count('Membros ativos (hoje)', club.activeMembers)

  summary.addRow([])
  summary.addRow(['Valores brutos, antes das taxas da operadora de pagamento.']).font = {
    italic: true,
    size: 9,
    color: { argb: 'FF6B7280' },
  }

  // ── Vendas (razão) ──────────────────────────────────────────────────
  const ledger = listSheet(wb, 'Vendas', [
    { header: 'Data', key: 'at', width: 17, numFmt: DATE_TIME },
    { header: 'Origem', key: 'kind', width: 10 },
    { header: 'Referência', key: 'reference', width: 14 },
    { header: 'Cliente', key: 'customer', width: 30 },
    { header: 'Descrição', key: 'description', width: 48 },
    { header: 'Pagamento', key: 'method', width: 18 },
    { header: 'Parcelas', key: 'installments', width: 9 },
    { header: 'Canal', key: 'channel', width: 10 },
    { header: 'Situação', key: 'status', width: 20 },
    { header: 'Entra na receita', key: 'counted', width: 15 },
    { header: 'Subtotal', key: 'subtotal', width: 13, numFmt: MONEY },
    { header: 'Desconto', key: 'discount', width: 13, numFmt: MONEY },
    { header: 'Frete', key: 'shipping', width: 12, numFmt: MONEY },
    { header: 'Total', key: 'total', width: 14, numFmt: MONEY },
  ])
  const entries = report.ledger?.entries ?? []
  for (const entry of entries) {
    ledger.addRow({
      at: rioWallClock(entry.at),
      kind: LEDGER_KIND_LABEL[entry.kind] ?? entry.kind,
      reference: entry.reference,
      customer: entry.customer,
      description: entry.description,
      method: PAYMENT_METHOD_LABEL[entry.method] ?? entry.method,
      installments: entry.installments,
      channel: entry.channel === 'wholesale' ? 'Atacado' : entry.channel === 'retail' ? 'Varejo' : '',
      status: LEDGER_STATUS_LABEL[entry.status] ?? entry.status,
      counted: entry.counted ? 'Sim' : 'Não',
      subtotal: entry.subtotal,
      discount: entry.discount,
      shipping: entry.shipping,
      total: entry.total,
    })
  }
  if (entries.length > 0) {
    const last = entries.length + 1
    const countedTotal = entries.filter((e) => e.counted).reduce((sum, e) => sum + e.total, 0)
    const row = ledger.addRow({
      customer: 'Total que entra na receita',
      total: { formula: `SUMIFS(N2:N${last},J2:J${last},"Sim")`, result: Math.round(countedTotal * 100) / 100 },
    })
    styleTotal(row)
  }
  if (report.ledger?.truncated) {
    ledger.addRow({ customer: 'Lista cortada: escolha um período menor para ver todas as vendas.' }).font = {
      italic: true,
      color: { argb: 'FFB91C1C' },
    }
  }

  // ── Por dia / por mês ───────────────────────────────────────────────
  const byMonth = report.series?.bucket === 'month'
  const seriesSheet = listSheet(wb, byMonth ? 'Por mês' : 'Por dia', [
    { header: byMonth ? 'Mês' : 'Dia', key: 'date', width: 13, numFmt: byMonth ? MONTH : DATE },
    { header: 'Loja', key: 'shop', width: 14, numFmt: MONEY },
    { header: 'Ingressos', key: 'tickets', width: 14, numFmt: MONEY },
    { header: 'Clube', key: 'club', width: 14, numFmt: MONEY },
    { header: 'Total', key: 'total', width: 15, numFmt: MONEY },
    { header: 'Pedidos da loja', key: 'orders', width: 15 },
  ])
  const points = report.series?.points ?? []
  for (const point of points) seriesSheet.addRow({ ...point, date: calendarDate(point.date) })
  if (points.length > 0) {
    const last = points.length + 1
    const sum = (col: string, key: 'shop' | 'tickets' | 'club' | 'total' | 'orders') => ({
      formula: `SUM(${col}2:${col}${last})`,
      result: points.reduce((acc, p) => acc + p[key], 0),
    })
    styleTotal(
      seriesSheet.addRow({
        date: 'Total',
        shop: sum('B', 'shop'),
        tickets: sum('C', 'tickets'),
        club: sum('D', 'club'),
        total: sum('E', 'total'),
        orders: sum('F', 'orders'),
      })
    )
  }

  // ── Produtos ────────────────────────────────────────────────────────
  const productSheet = listSheet(wb, 'Produtos', [
    { header: 'Produto', key: 'name', width: 48 },
    { header: 'Unidades', key: 'quantity', width: 10 },
    { header: 'Receita (com desconto)', key: 'revenue', width: 20, numFmt: MONEY },
    { header: 'Custo', key: 'cost', width: 14, numFmt: MONEY },
    { header: 'Lucro bruto', key: 'profit', width: 14, numFmt: MONEY },
    { header: 'Margem', key: 'margin', width: 10, numFmt: PERCENT },
  ])
  for (const product of products.ranking ?? []) {
    const known = product.cost !== null
    productSheet.addRow({
      name: product.name,
      quantity: product.quantity,
      revenue: product.revenue,
      cost: known ? product.cost : 'sem custo',
      profit: known ? product.revenue - (product.cost ?? 0) : null,
      margin: known && product.revenue > 0 ? (product.revenue - (product.cost ?? 0)) / product.revenue : null,
    })
  }

  // ── Categorias ──────────────────────────────────────────────────────
  const categorySheet = listSheet(wb, 'Categorias', [
    { header: 'Categoria', key: 'name', width: 30 },
    { header: 'Unidades', key: 'quantity', width: 10 },
    { header: 'Receita (com desconto)', key: 'revenue', width: 20, numFmt: MONEY },
    { header: '% da loja', key: 'share', width: 11, numFmt: PERCENT },
  ])
  const categoryTotal = (report.byCategory ?? []).reduce((sum, c) => sum + c.revenue, 0)
  for (const category of report.byCategory ?? []) {
    categorySheet.addRow({
      ...category,
      share: categoryTotal > 0 ? category.revenue / categoryTotal : 0,
    })
  }

  // ── Pagamentos ──────────────────────────────────────────────────────
  const methodSheet = listSheet(wb, 'Pagamentos', [
    { header: 'Forma de pagamento', key: 'method', width: 22 },
    { header: 'Vendas', key: 'count', width: 10 },
    { header: 'Receita', key: 'revenue', width: 16, numFmt: MONEY },
    { header: '% do total', key: 'share', width: 11, numFmt: PERCENT },
  ])
  for (const method of report.byMethod ?? []) {
    methodSheet.addRow({
      method: PAYMENT_METHOD_LABEL[method.method] ?? method.method,
      count: method.count,
      revenue: method.revenue,
      share: totals.current > 0 ? method.revenue / totals.current : 0,
    })
  }

  return wb
}

/** Sales month by month — the "Vendas por mês" table, as a sheet. */
export function buildMonthlyWorkbook(rows: MonthlyReportData[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Clube GeekPop & Toys'
  wb.created = new Date()
  const ws = listSheet(wb, 'Vendas por mês', [
    { header: 'Mês', key: 'month', width: 12, numFmt: MONTH },
    { header: 'Loja', key: 'shopRevenue', width: 14, numFmt: MONEY },
    { header: 'Pedidos', key: 'shopOrders', width: 10 },
    { header: 'Ticket médio', key: 'average', width: 14, numFmt: MONEY },
    { header: 'Ingressos', key: 'ticketRevenue', width: 14, numFmt: MONEY },
    { header: 'Reservas', key: 'ticketCount', width: 10 },
    { header: 'Clube', key: 'revenue', width: 14, numFmt: MONEY },
    { header: 'Pagamentos do clube', key: 'paymentCount', width: 19 },
    { header: 'Total', key: 'total', width: 15, numFmt: MONEY },
    { header: 'Novos membros', key: 'newMembers', width: 15 },
  ])
  for (const row of rows) {
    ws.addRow({
      ...row,
      month: calendarDate(row.month),
      average: row.shopOrders > 0 ? row.shopRevenue / row.shopOrders : 0,
      total: row.shopRevenue + row.ticketRevenue + row.revenue,
    })
  }
  if (rows.length > 0) {
    const last = rows.length + 1
    const sum = (col: string, value: number) => ({ formula: `SUM(${col}2:${col}${last})`, result: value })
    const total = (pick: (r: MonthlyReportData) => number) => rows.reduce((acc, r) => acc + pick(r), 0)
    styleTotal(
      ws.addRow({
        month: 'Total',
        shopRevenue: sum('B', total((r) => r.shopRevenue)),
        shopOrders: sum('C', total((r) => r.shopOrders)),
        ticketRevenue: sum('E', total((r) => r.ticketRevenue)),
        ticketCount: sum('F', total((r) => r.ticketCount)),
        revenue: sum('G', total((r) => r.revenue)),
        paymentCount: sum('H', total((r) => r.paymentCount)),
        total: sum('I', total((r) => r.shopRevenue + r.ticketRevenue + r.revenue)),
        newMembers: sum('J', total((r) => r.newMembers)),
      })
    )
  }
  return wb
}

export function reportExcelFilename(report: OverviewReport): string {
  return `${reportBasename(report)}.xlsx`
}

export function monthlyExcelFilename(rows: MonthlyReportData[]): string {
  if (rows.length === 0) return 'vendas-por-mes-geekpop.xlsx'
  return `vendas-por-mes-geekpop-${rows[0].month}_a_${rows[rows.length - 1].month}.xlsx`
}

/** Save a workbook through the browser. */
export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked on the next tick: Safari cancels a download whose URL dies first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
