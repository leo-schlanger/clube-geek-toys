/**
 * Contract PDF Generator using pdf-lib
 * Generates professional PDF contracts with signature
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { CONTRACT_SECTIONS, CONTRACT_TITLE, CONTRACT_SUBTITLE, CONTRACT_DECLARATION } from '../data/contract-content'
import { PLANS, type PlanType, type PaymentType } from '../types'
import { formatDateExtensive } from './signature-utils'
import { logger } from './logger'

// Brand colors
const GOLD_COLOR = rgb(233 / 255, 184 / 255, 74 / 255) // #E9B84A
const DARK_COLOR = rgb(20 / 255, 20 / 255, 20 / 255)   // #141414
const TEXT_COLOR = rgb(40 / 255, 40 / 255, 40 / 255)   // Dark gray
const MUTED_COLOR = rgb(100 / 255, 100 / 255, 100 / 255) // Gray

// Page dimensions (A4)
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 50
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2)

interface ContractParams {
  memberId: string
  memberName: string
  memberCPF: string
  memberEmail: string
  memberPhone: string
  plan: PlanType
  paymentType: PaymentType
  signatureImage: string
  signedAt: string
  ipAddress: string
  userAgent: string
  documentHash: string
}

/**
 * Generate PDF contract with all content and signature
 */
export async function generateContractPDF(params: ContractParams): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()

  // Embed fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Try to embed logo
  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedJpg>> | null = null
  try {
    const logoResponse = await fetch('/logo.jpg')
    if (logoResponse.ok) {
      const logoBytes = await logoResponse.arrayBuffer()
      logoImage = await pdfDoc.embedJpg(logoBytes)
    }
  } catch (error) {
    logger.warn('Failed to load logo for PDF:', error)
  }

  // Embed signature image
  let signatureImageEmbed: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null
  try {
    const signatureData = params.signatureImage.replace('data:image/png;base64,', '')
    const signatureBytes = Uint8Array.from(atob(signatureData), c => c.charCodeAt(0))
    signatureImageEmbed = await pdfDoc.embedPng(signatureBytes)
  } catch (error) {
    logger.warn('Failed to embed signature image:', error)
  }

  // Create pages
  let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let yPosition = PAGE_HEIGHT - MARGIN

  /**
   * Helper to add new page if needed
   */
  function checkNewPage(neededHeight: number): void {
    if (yPosition - neededHeight < MARGIN + 50) {
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      yPosition = PAGE_HEIGHT - MARGIN
    }
  }

  /**
   * Draw wrapped text and return new Y position
   */
  function drawWrappedText(
    text: string,
    fontSize: number,
    font: typeof helvetica,
    color = TEXT_COLOR,
    lineHeight = 1.4
  ): number {
    const words = text.split(' ')
    let line = ''
    const lines: string[] = []

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word
      const testWidth = font.widthOfTextAtSize(testLine, fontSize)

      if (testWidth > CONTENT_WIDTH) {
        if (line) lines.push(line)
        line = word
      } else {
        line = testLine
      }
    }
    if (line) lines.push(line)

    for (const l of lines) {
      checkNewPage(fontSize * lineHeight + 5)
      currentPage.drawText(l, {
        x: MARGIN,
        y: yPosition,
        size: fontSize,
        font,
        color,
      })
      yPosition -= fontSize * lineHeight
    }

    return yPosition
  }

  // ============================================
  // HEADER
  // ============================================

  // Logo
  if (logoImage) {
    const logoWidth = 100
    const logoHeight = (logoImage.height / logoImage.width) * logoWidth
    const logoX = (PAGE_WIDTH - logoWidth) / 2
    currentPage.drawImage(logoImage, {
      x: logoX,
      y: yPosition - logoHeight,
      width: logoWidth,
      height: logoHeight,
    })
    yPosition -= logoHeight + 20
  }

  // Title
  const titleFontSize = 18
  const titleWidth = helveticaBold.widthOfTextAtSize(CONTRACT_TITLE, titleFontSize)
  currentPage.drawText(CONTRACT_TITLE, {
    x: (PAGE_WIDTH - titleWidth) / 2,
    y: yPosition,
    size: titleFontSize,
    font: helveticaBold,
    color: GOLD_COLOR,
  })
  yPosition -= 25

  // Subtitle
  const subtitleFontSize = 12
  const subtitleWidth = helvetica.widthOfTextAtSize(CONTRACT_SUBTITLE, subtitleFontSize)
  currentPage.drawText(CONTRACT_SUBTITLE, {
    x: (PAGE_WIDTH - subtitleWidth) / 2,
    y: yPosition,
    size: subtitleFontSize,
    font: helvetica,
    color: TEXT_COLOR,
  })
  yPosition -= 15

  // Divider line
  currentPage.drawLine({
    start: { x: MARGIN + 50, y: yPosition },
    end: { x: PAGE_WIDTH - MARGIN - 50, y: yPosition },
    thickness: 1,
    color: GOLD_COLOR,
  })
  yPosition -= 30

  // ============================================
  // CONTRACT SECTIONS
  // ============================================

  for (const section of CONTRACT_SECTIONS) {
    // Section title
    checkNewPage(40)
    currentPage.drawText(section.title, {
      x: MARGIN,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: DARK_COLOR,
    })
    yPosition -= 18

    // Section content
    for (const paragraph of section.content) {
      drawWrappedText(paragraph, 9, helvetica, TEXT_COLOR, 1.5)
      yPosition -= 8
    }

    yPosition -= 10
  }

  // ============================================
  // MEMBER DATA BOX
  // ============================================

  checkNewPage(150)
  yPosition -= 20

  // Box title
  currentPage.drawText('DADOS DO ASSINANTE', {
    x: MARGIN,
    y: yPosition,
    size: 11,
    font: helveticaBold,
    color: GOLD_COLOR,
  })
  yPosition -= 20

  // Box background
  const boxHeight = 100
  currentPage.drawRectangle({
    x: MARGIN,
    y: yPosition - boxHeight + 15,
    width: CONTENT_WIDTH,
    height: boxHeight,
    color: rgb(245 / 255, 245 / 255, 245 / 255),
    borderColor: GOLD_COLOR,
    borderWidth: 1,
  })

  // Member data
  const planInfo = PLANS[params.plan]
  const price = params.paymentType === 'monthly' ? planInfo.priceMonthly : planInfo.priceAnnual
  const priceFormatted = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const paymentLabel = params.paymentType === 'monthly' ? 'Mensal' : 'Anual'

  const dataLines = [
    `Nome: ${params.memberName}`,
    `CPF: ${params.memberCPF}`,
    `E-mail: ${params.memberEmail}`,
    `Telefone: ${params.memberPhone}`,
    `Plano: ${planInfo.name} (${paymentLabel}) - ${priceFormatted}`,
  ]

  let dataY = yPosition - 5
  for (const line of dataLines) {
    currentPage.drawText(line, {
      x: MARGIN + 15,
      y: dataY,
      size: 9,
      font: helvetica,
      color: TEXT_COLOR,
    })
    dataY -= 16
  }

  yPosition -= boxHeight + 20

  // ============================================
  // DECLARATION
  // ============================================

  checkNewPage(120)
  yPosition -= 10

  currentPage.drawText('DECLARAÇÃO DE ACEITE', {
    x: MARGIN,
    y: yPosition,
    size: 11,
    font: helveticaBold,
    color: DARK_COLOR,
  })
  yPosition -= 18

  drawWrappedText(CONTRACT_DECLARATION, 9, helvetica, TEXT_COLOR, 1.5)
  yPosition -= 20

  // ============================================
  // SIGNATURE SECTION
  // ============================================

  checkNewPage(180)
  yPosition -= 20

  // Signature date
  const signedDate = new Date(params.signedAt)
  const dateText = `Assinado digitalmente em ${formatDateExtensive(signedDate)}`
  currentPage.drawText(dateText, {
    x: MARGIN,
    y: yPosition,
    size: 9,
    font: helvetica,
    color: MUTED_COLOR,
  })
  yPosition -= 25

  // Signature image
  if (signatureImageEmbed) {
    const sigWidth = 200
    const sigHeight = (signatureImageEmbed.height / signatureImageEmbed.width) * sigWidth
    const maxHeight = 80

    const finalHeight = Math.min(sigHeight, maxHeight)
    const finalWidth = (finalHeight / sigHeight) * sigWidth

    currentPage.drawImage(signatureImageEmbed, {
      x: MARGIN,
      y: yPosition - finalHeight,
      width: finalWidth,
      height: finalHeight,
    })
    yPosition -= finalHeight + 10
  }

  // Signature line
  currentPage.drawLine({
    start: { x: MARGIN, y: yPosition },
    end: { x: MARGIN + 250, y: yPosition },
    thickness: 1,
    color: DARK_COLOR,
  })
  yPosition -= 15

  // Name and CPF below signature
  currentPage.drawText(params.memberName, {
    x: MARGIN,
    y: yPosition,
    size: 10,
    font: helveticaBold,
    color: TEXT_COLOR,
  })
  yPosition -= 14

  currentPage.drawText(`CPF: ${params.memberCPF}`, {
    x: MARGIN,
    y: yPosition,
    size: 9,
    font: helvetica,
    color: MUTED_COLOR,
  })
  yPosition -= 30

  // ============================================
  // VALIDATION FOOTER
  // ============================================

  checkNewPage(100)

  // Validation box
  const footerBoxHeight = 70
  currentPage.drawRectangle({
    x: MARGIN,
    y: yPosition - footerBoxHeight + 15,
    width: CONTENT_WIDTH,
    height: footerBoxHeight,
    color: rgb(250 / 255, 250 / 255, 250 / 255),
    borderColor: rgb(200 / 255, 200 / 255, 200 / 255),
    borderWidth: 0.5,
  })

  let footerY = yPosition

  currentPage.drawText('REGISTRO DE VALIDAÇÃO', {
    x: MARGIN + 10,
    y: footerY,
    size: 8,
    font: helveticaBold,
    color: MUTED_COLOR,
  })
  footerY -= 14

  // Truncate user agent for display
  const userAgentDisplay = params.userAgent.length > 80
    ? params.userAgent.substring(0, 80) + '...'
    : params.userAgent

  const validationLines = [
    `IP: ${params.ipAddress}`,
    `User-Agent: ${userAgentDisplay}`,
    `Hash SHA-256: ${params.documentHash}`,
  ]

  for (const line of validationLines) {
    currentPage.drawText(line, {
      x: MARGIN + 10,
      y: footerY,
      size: 7,
      font: helvetica,
      color: MUTED_COLOR,
    })
    footerY -= 12
  }

  // Generate PDF bytes
  const pdfBytes = await pdfDoc.save()
  return pdfBytes
}

/**
 * Convert PDF bytes to base64 string
 */
export function pdfToBase64(pdfBytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < pdfBytes.length; i++) {
    binary += String.fromCharCode(pdfBytes[i])
  }
  return btoa(binary)
}

/**
 * Create downloadable PDF blob
 */
export function createPDFBlob(pdfBytes: Uint8Array): Blob {
  return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
}

/**
 * Trigger PDF download in browser
 */
export function downloadPDF(pdfBytes: Uint8Array, filename: string): void {
  const blob = createPDFBlob(pdfBytes)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
