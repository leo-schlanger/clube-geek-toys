/**
 * Admin period report as a PDF.
 *
 * Built with pdf-lib and the standard fonts, same as the contract generator, so
 * no font file ships in the bundle. That choice has one consequence this file
 * has to handle: the standard fonts encode WinAnsi only, and a K-pop catalogue
 * routinely carries Hangul and emoji in product names — pdf-lib throws on the
 * first unencodable character, which would turn "download the report" into a
 * crash. Every string from the database goes through `toPdfText` first.
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import type { OverviewReport, OverviewPeriod } from './reports'

// Brand (DESIGN.md): Hot Pink primary, Pop Yellow accent.
const PINK = rgb(0xf0 / 255, 0x40 / 255, 0x80 / 255)
const YELLOW = rgb(0xfc / 255, 0xbe / 255, 0x04 / 255)
const INK = rgb(0.11, 0.11, 0.13)
const MUTED = rgb(0.42, 0.44, 0.5)
const RULE = rgb(0.87, 0.88, 0.9)
const POSITIVE = rgb(0.13, 0.6, 0.31)
const NEGATIVE = rgb(0.79, 0.19, 0.19)

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

/** WinAnsi's 0x80–0x9F block: typographic quotes, dashes, bullet, ellipsis. */
const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

/**
 * Drop anything the standard fonts cannot encode.
 *
 * Losing a Hangul product name to a placeholder is a cosmetic problem; throwing
 * mid-render is a broken feature.
 */
export function toPdfText(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    const encodable =
      (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.includes(char)
    if (encodable) out += char
  }
  return out.replace(/\s+/g, ' ').trim()
}

function money(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function integer(value: number): string {
  return value.toLocaleString('pt-BR')
}

/** Growth vs the same window one period back. */
function growth(current: number, previous: number): { text: string; positive: boolean } | null {
  if (previous <= 0) return current > 0 ? { text: 'primeiro periodo com movimento', positive: true } : null
  const pct = ((current - previous) / previous) * 100
  const rounded = Math.round(pct * 10) / 10
  return {
    text: `${rounded >= 0 ? '+' : ''}${rounded.toLocaleString('pt-BR')}% vs periodo anterior`,
    positive: rounded >= 0,
  }
}

const PERIOD_LABEL: Record<OverviewPeriod, string> = {
  day: 'Relatorio diario',
  month: 'Relatorio mensal',
  year: 'Relatorio anual',
}

/** Inclusive end date — the API's `end` is the exclusive start of the next period. */
function formatRange(period: OverviewPeriod, startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const lastDay = new Date(new Date(endIso).getTime() - 1)
  const date = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  if (period === 'day') return date(start)
  return `${date(start)} a ${date(lastDay)}`
}

/** Cursor-based layout: every writer moves `y` down and asks for a page break. */
class Layout {
  private page: PDFPage
  private y = PAGE_HEIGHT - MARGIN
  readonly pages: PDFPage[] = []

  // Explicit fields, not constructor parameter properties: the project builds
  // with `erasableSyntaxOnly`.
  private doc: PDFDocument
  private font: PDFFont
  private bold: PDFFont

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.doc = doc
    this.font = font
    this.bold = bold
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.pages.push(this.page)
  }

  private ensure(space: number) {
    if (this.y - space >= MARGIN + 30) return
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.pages.push(this.page)
    this.y = PAGE_HEIGHT - MARGIN
  }

  header(title: string, subtitle: string, generatedAt: string) {
    this.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 96, width: PAGE_WIDTH, height: 96, color: INK })
    this.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 100, width: PAGE_WIDTH, height: 4, color: YELLOW })
    this.page.drawText('GeekPop & Toys', {
      x: MARGIN,
      y: PAGE_HEIGHT - 44,
      size: 18,
      font: this.bold,
      color: PINK,
    })
    this.page.drawText(toPdfText(title), {
      x: MARGIN,
      y: PAGE_HEIGHT - 64,
      size: 12,
      font: this.bold,
      color: rgb(1, 1, 1),
    })
    this.page.drawText(toPdfText(subtitle), {
      x: MARGIN,
      y: PAGE_HEIGHT - 80,
      size: 9,
      font: this.font,
      color: rgb(0.75, 0.76, 0.8),
    })
    const stamp = toPdfText(`Emitido em ${generatedAt}`)
    this.page.drawText(stamp, {
      x: PAGE_WIDTH - MARGIN - this.font.widthOfTextAtSize(stamp, 8),
      y: PAGE_HEIGHT - 80,
      size: 8,
      font: this.font,
      color: rgb(0.6, 0.62, 0.66),
    })
    this.y = PAGE_HEIGHT - 130
  }

  section(title: string) {
    this.ensure(46)
    this.page.drawText(toPdfText(title.toUpperCase()), {
      x: MARGIN,
      y: this.y,
      size: 10,
      font: this.bold,
      color: PINK,
    })
    this.y -= 6
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 1,
      color: PINK,
    })
    this.y -= 16
  }

  /** Big number with an optional growth line — the one figure per section that matters. */
  highlight(label: string, value: string, delta: { text: string; positive: boolean } | null) {
    this.ensure(52)
    this.page.drawText(toPdfText(label), { x: MARGIN, y: this.y, size: 9, font: this.font, color: MUTED })
    this.y -= 22
    this.page.drawText(toPdfText(value), { x: MARGIN, y: this.y, size: 20, font: this.bold, color: INK })
    if (delta) {
      this.page.drawText(toPdfText(delta.text), {
        x: MARGIN + this.bold.widthOfTextAtSize(toPdfText(value), 20) + 10,
        y: this.y + 4,
        size: 9,
        font: this.font,
        color: delta.positive ? POSITIVE : NEGATIVE,
      })
    }
    this.y -= 20
  }

  /** Label on the left, value right-aligned, one hairline per row. */
  rows(rows: [string, string][]) {
    for (const [label, value] of rows) {
      this.ensure(20)
      const text = toPdfText(value)
      this.page.drawText(toPdfText(label), { x: MARGIN, y: this.y, size: 9.5, font: this.font, color: INK })
      this.page.drawText(text, {
        x: PAGE_WIDTH - MARGIN - this.bold.widthOfTextAtSize(text, 9.5),
        y: this.y,
        size: 9.5,
        font: this.bold,
        color: INK,
      })
      this.y -= 6
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: PAGE_WIDTH - MARGIN, y: this.y },
        thickness: 0.5,
        color: RULE,
      })
      this.y -= 12
    }
    this.y -= 4
  }

  /** Ranked table: position, name, units, revenue. */
  ranking(entries: { name: string; quantity: number; revenue: number }[]) {
    const unitsX = MARGIN + CONTENT_WIDTH * 0.62
    const revenueRight = PAGE_WIDTH - MARGIN

    this.ensure(24)
    this.page.drawText('PRODUTO', { x: MARGIN, y: this.y, size: 7.5, font: this.bold, color: MUTED })
    this.page.drawText('UNID.', { x: unitsX, y: this.y, size: 7.5, font: this.bold, color: MUTED })
    const head = 'RECEITA'
    this.page.drawText(head, {
      x: revenueRight - this.bold.widthOfTextAtSize(head, 7.5),
      y: this.y,
      size: 7.5,
      font: this.bold,
      color: MUTED,
    })
    this.y -= 14

    entries.forEach((entry, index) => {
      this.ensure(20)
      const safeName = toPdfText(entry.name) || '(nome nao suportado no PDF)'
      const label = `${index + 1}. ${safeName}`
      // Truncate on width, not character count: proportional font.
      let shown = label
      const maxWidth = unitsX - MARGIN - 12
      while (shown.length > 4 && this.font.widthOfTextAtSize(shown, 9.5) > maxWidth) {
        shown = `${shown.slice(0, -2)}…`
      }
      this.page.drawText(shown, { x: MARGIN, y: this.y, size: 9.5, font: this.font, color: INK })
      this.page.drawText(integer(entry.quantity), {
        x: unitsX,
        y: this.y,
        size: 9.5,
        font: this.font,
        color: INK,
      })
      const revenue = money(entry.revenue)
      this.page.drawText(revenue, {
        x: revenueRight - this.bold.widthOfTextAtSize(revenue, 9.5),
        y: this.y,
        size: 9.5,
        font: this.bold,
        color: INK,
      })
      this.y -= 6
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: PAGE_WIDTH - MARGIN, y: this.y },
        thickness: 0.5,
        color: RULE,
      })
      this.y -= 12
    })
    this.y -= 4
  }

  note(text: string) {
    this.ensure(24)
    this.page.drawText(toPdfText(text), { x: MARGIN, y: this.y, size: 8.5, font: this.font, color: MUTED })
    this.y -= 20
  }

  /** Page numbers last, when the total is finally known. */
  finish() {
    this.pages.forEach((page, index) => {
      const label = `GeekPop & Toys - CNPJ 52.846.344/0001-10`
      page.drawText(label, { x: MARGIN, y: 28, size: 7.5, font: this.font, color: MUTED })
      const pageLabel = `${index + 1} / ${this.pages.length}`
      page.drawText(pageLabel, {
        x: PAGE_WIDTH - MARGIN - this.font.widthOfTextAtSize(pageLabel, 7.5),
        y: 28,
        size: 7.5,
        font: this.font,
        color: MUTED,
      })
    })
  }
}

/** Filename with the period baked in, so a folder of them sorts by date. */
export function reportFilename(report: OverviewReport): string {
  const start = report.period.start.slice(0, 10)
  const suffix = report.period.type === 'day' ? start : report.period.type === 'month' ? start.slice(0, 7) : start.slice(0, 4)
  return `relatorio-geekpop-${report.period.type}-${suffix}.pdf`
}

/**
 * Render the consolidated period report.
 *
 * Ordered the way a manager reads it: total first, then where it came from
 * (shop vs club), then what sold, then what the shelf looks like right now.
 */
export async function generateReportPDF(report: OverviewReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const layout = new Layout(doc, font, bold)

  const { sales, club, products, previous, period } = report
  const totalRevenue = sales.revenue + club.revenue
  const previousTotal = previous.salesRevenue + previous.clubRevenue

  doc.setTitle(`${PERIOD_LABEL[period.type]} - GeekPop & Toys`)
  doc.setProducer('Clube GeekPop & Toys')

  layout.header(
    PERIOD_LABEL[period.type],
    formatRange(period.type, period.start, period.end),
    new Date().toLocaleString('pt-BR')
  )

  layout.section('Resumo')
  layout.highlight('Receita total (loja + clube)', money(totalRevenue), growth(totalRevenue, previousTotal))
  layout.rows([
    ['Receita da loja', money(sales.revenue)],
    ['Receita do clube (assinaturas)', money(club.revenue)],
    ['Pedidos pagos', integer(sales.orders)],
    ['Ticket medio da loja', money(sales.averageTicket)],
    ['Novos membros', integer(club.newMembers)],
    ['Membros ativos (hoje)', integer(club.activeMembers)],
  ])

  layout.section('Loja')
  layout.rows([
    ['Subtotal dos produtos', money(sales.subtotal)],
    ['Descontos concedidos', money(sales.discount)],
    ['Frete cobrado', money(sales.shipping)],
    ['Credito de loja usado', money(sales.storeCredit)],
    ['Pedidos varejo', `${integer(sales.retailOrders)} - ${money(sales.retailRevenue)}`],
    ['Pedidos atacado', `${integer(sales.wholesaleOrders)} - ${money(sales.wholesaleRevenue)}`],
    ['Pagos por PIX', integer(sales.pixOrders)],
    ['Pagos por cartao', integer(sales.cardOrders)],
    ['Aguardando pagamento', integer(sales.pendingOrders)],
    ['Cancelados', integer(sales.cancelledOrders)],
    ['Estornados', integer(sales.refundedOrders)],
  ])
  layout.note('Receita conta apenas pedidos pagos, em separacao, enviados ou entregues.')

  layout.section('Clube')
  layout.rows([
    ['Pagamentos confirmados', integer(club.payments)],
    ['Receita de assinaturas', money(club.revenue)],
    ['Novos membros no periodo', integer(club.newMembers)],
    ['Membros que expiraram no periodo', integer(club.expiredInPeriod)],
    ['Membros ativos agora', integer(club.activeMembers)],
  ])

  layout.section('Produtos mais vendidos')
  if (products.top.length === 0) {
    layout.note('Nenhum produto vendido neste periodo.')
  } else {
    layout.ranking(products.top)
    layout.rows([
      ['Unidades vendidas no periodo', integer(products.unitsSold)],
      ['Produtos distintos vendidos', integer(products.distinctProducts)],
    ])
  }

  layout.section('Estoque hoje')
  layout.rows([
    ['SKUs ativos', integer(products.activeSkus)],
    ['Esgotados', integer(products.outOfStock)],
    ['No estoque minimo', integer(products.lowStock)],
  ])
  layout.note('Estoque e uma fotografia do momento da emissao, nao um acumulado do periodo.')

  layout.finish()
  return doc.save()
}
