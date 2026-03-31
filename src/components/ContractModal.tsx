/**
 * Contract Modal - Digital contract with signature capture
 * Implements electronic signature per Lei 14.063/2020
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import SignaturePad from 'signature_pad'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { CONTRACT_SECTIONS, CONTRACT_TITLE, CONTRACT_SUBTITLE } from '../data/contract-content'
import { PLANS, type PlanType, type PaymentType, type ContractData } from '../types'
import { formatCurrency } from '../lib/utils'
import { generateContractPDF, pdfToBase64, downloadPDF } from '../lib/contract-generator'
import { storeContract } from '../lib/contract-storage'
import { generateContractHash, getClientIP, getUserAgent, formatTimestamp } from '../lib/signature-utils'
import { sendContractEmail } from '../lib/email'
import { logger } from '../lib/logger'
import { toast } from 'sonner'
import {
  X,
  ScrollText,
  PenTool,
  Check,
  ChevronDown,
  RotateCcw,
  Download,
  FileCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react'

type ContractStep = 'read' | 'sign' | 'confirm'

interface ContractModalProps {
  memberId: string
  memberName: string
  memberCPF: string
  memberEmail: string
  memberPhone: string
  plan: PlanType
  paymentType: PaymentType
  onClose: () => void
  onSigned: (contractData: ContractData) => void
}

export function ContractModal({
  memberId,
  memberName,
  memberCPF,
  memberEmail,
  memberPhone,
  plan,
  paymentType,
  onClose,
  onSigned,
}: ContractModalProps) {
  const [step, setStep] = useState<ContractStep>('read')
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false)
  const [signatureImage, setSignatureImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)

  const planData = PLANS[plan]
  const price = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual

  // Initialize signature pad when entering sign step
  useEffect(() => {
    if (step === 'sign' && canvasRef.current && !signaturePadRef.current) {
      const canvas = canvasRef.current
      const ratio = Math.max(window.devicePixelRatio || 1, 1)

      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      canvas.getContext('2d')?.scale(ratio, ratio)

      signaturePadRef.current = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
      })
    }
  }, [step])

  // Handle resize for signature pad
  useEffect(() => {
    function handleResize() {
      if (step === 'sign' && canvasRef.current && signaturePadRef.current) {
        const canvas = canvasRef.current
        const ratio = Math.max(window.devicePixelRatio || 1, 1)
        const data = signaturePadRef.current.toData()

        canvas.width = canvas.offsetWidth * ratio
        canvas.height = canvas.offsetHeight * ratio
        canvas.getContext('2d')?.scale(ratio, ratio)

        signaturePadRef.current.clear()
        signaturePadRef.current.fromData(data)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [step])

  // Handle scroll detection
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
      // Consider "scrolled to end" when within 50px of bottom
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        setHasScrolledToEnd(true)
      }
    }
  }, [])

  // Clear signature
  function clearSignature() {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear()
    }
  }

  // Confirm signature and move to next step
  function confirmSignature() {
    if (signaturePadRef.current) {
      if (signaturePadRef.current.isEmpty()) {
        toast.error('Por favor, desenhe sua assinatura')
        return
      }

      const dataUrl = signaturePadRef.current.toDataURL('image/png')
      setSignatureImage(dataUrl)
      setStep('confirm')
    }
  }

  // Process contract signing
  async function processContract() {
    if (!signatureImage) {
      toast.error('Assinatura não encontrada')
      return
    }

    setLoading(true)
    toast.loading('Processando contrato...', { id: 'contract-process' })

    try {
      // Get client info
      const [ipAddress] = await Promise.all([getClientIP()])
      const userAgent = getUserAgent()
      const signedAt = new Date().toISOString()

      // Generate document hash
      const documentHash = await generateContractHash({
        memberId,
        memberName,
        memberCPF,
        memberEmail,
        plan,
        signedAt,
        ipAddress,
      })

      // Create contract data
      const contractData: ContractData = {
        memberId,
        memberName,
        memberCPF,
        memberEmail,
        memberPhone,
        plan,
        paymentType,
        signatureImage,
        signedAt,
        ipAddress,
        userAgent,
        documentHash,
        createdAt: signedAt,
      }

      // Generate PDF
      toast.loading('Gerando PDF...', { id: 'contract-process' })
      const pdfBytes = await generateContractPDF({
        ...contractData,
        signedAt,
      })

      // Store contract (upload PDF + save to Firestore)
      toast.loading('Salvando contrato...', { id: 'contract-process' })
      const { pdfUrl: storedPdfUrl } = await storeContract(contractData, pdfBytes)
      setPdfUrl(storedPdfUrl)

      // Update contract data with PDF URL
      contractData.pdfUrl = storedPdfUrl

      // Send email with PDF (non-blocking)
      const pdfBase64 = pdfToBase64(pdfBytes)
      sendContractEmail(
        memberEmail,
        memberName,
        planData.name,
        signedAt,
        documentHash,
        pdfBase64
      ).catch(err => logger.error('Failed to send contract email:', err))

      toast.success('Contrato assinado com sucesso!', { id: 'contract-process' })

      // Callback to parent
      onSigned(contractData)

    } catch (error) {
      logger.error('Contract processing error:', error)
      toast.error('Erro ao processar contrato. Tente novamente.', { id: 'contract-process' })
    } finally {
      setLoading(false)
    }
  }

  // Download PDF
  async function handleDownloadPDF() {
    if (!signatureImage) return

    try {
      const ipAddress = await getClientIP()
      const userAgent = getUserAgent()
      const signedAt = new Date().toISOString()
      const documentHash = await generateContractHash({
        memberId,
        memberName,
        memberCPF,
        memberEmail,
        plan,
        signedAt,
        ipAddress,
      })

      const pdfBytes = await generateContractPDF({
        memberId,
        memberName,
        memberCPF,
        memberEmail,
        memberPhone,
        plan,
        paymentType,
        signatureImage,
        signedAt,
        ipAddress,
        userAgent,
        documentHash,
      })

      downloadPDF(pdfBytes, `contrato_${memberName.replace(/\s+/g, '_')}.pdf`)
      toast.success('PDF baixado com sucesso!')
    } catch (error) {
      logger.error('Download error:', error)
      toast.error('Erro ao gerar PDF')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-background border-border">
        {/* Header */}
        <CardHeader className="flex-shrink-0 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                {step === 'read' && <ScrollText className="h-5 w-5 text-primary" />}
                {step === 'sign' && <PenTool className="h-5 w-5 text-primary" />}
                {step === 'confirm' && <FileCheck className="h-5 w-5 text-primary" />}
              </div>
              <div>
                <CardTitle className="text-lg">
                  {step === 'read' && 'Leitura do Contrato'}
                  {step === 'sign' && 'Assinatura Digital'}
                  {step === 'confirm' && 'Confirmação'}
                </CardTitle>
                <CardDescription className="text-sm">
                  {step === 'read' && 'Leia o regulamento completo'}
                  {step === 'sign' && 'Desenhe sua assinatura'}
                  {step === 'confirm' && 'Revise e confirme'}
                </CardDescription>
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
              disabled={loading}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-2 mt-4">
            {(['read', 'sign', 'confirm'] as const).map((s, i) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    step === s
                      ? 'bg-primary text-primary-foreground'
                      : ['read', 'sign', 'confirm'].indexOf(step) > i
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {['read', 'sign', 'confirm'].indexOf(step) > i ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    i + 1
                  )}
                </div>
                {i < 2 && (
                  <div
                    className={`w-8 h-1 transition-colors ${
                      ['read', 'sign', 'confirm'].indexOf(step) > i
                        ? 'bg-primary/50'
                        : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </CardHeader>

        {/* Content */}
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          {/* Step 1: Read Contract */}
          {step === 'read' && (
            <div className="h-full flex flex-col min-h-0">
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6"
              >
                {/* Logo and Title */}
                <div className="text-center space-y-3">
                  <img
                    src="/logo.jpg"
                    alt="Geek & Toys"
                    className="h-16 mx-auto rounded"
                  />
                  <h2 className="text-xl font-bold text-primary">{CONTRACT_TITLE}</h2>
                  <p className="text-sm text-muted-foreground">{CONTRACT_SUBTITLE}</p>
                </div>

                {/* Member Data */}
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold text-sm text-primary">Dados do Assinante</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Nome:</span>{' '}
                      <span className="font-medium">{memberName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">CPF:</span>{' '}
                      <span className="font-medium">{memberCPF}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email:</span>{' '}
                      <span className="font-medium">{memberEmail}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Telefone:</span>{' '}
                      <span className="font-medium">{memberPhone}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Plano:</span>{' '}
                      <Badge variant={plan}>{planData.name}</Badge>{' '}
                      <span className="text-muted-foreground">
                        ({paymentType === 'monthly' ? 'Mensal' : 'Anual'}) -{' '}
                      </span>
                      <span className="font-bold text-primary">{formatCurrency(price)}</span>
                    </div>
                  </div>
                </div>

                {/* Contract Sections */}
                <div className="space-y-6">
                  {CONTRACT_SECTIONS.map((section, index) => (
                    <div key={index} className="space-y-2">
                      <h3 className="font-semibold text-sm">{section.title}</h3>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {section.content.map((paragraph, pIndex) => (
                          <p key={pIndex}>{paragraph}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Scroll indicator */}
                {!hasScrolledToEnd && (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground animate-bounce">
                    <ChevronDown className="h-4 w-4" />
                    <span className="text-sm">Role para ler todo o contrato</span>
                    <ChevronDown className="h-4 w-4" />
                  </div>
                )}
              </div>

              {/* Action button */}
              <div className="flex-shrink-0 p-4 border-t border-border">
                <Button
                  className="w-full"
                  onClick={() => setStep('sign')}
                  disabled={!hasScrolledToEnd}
                >
                  {hasScrolledToEnd ? (
                    <>
                      Li e concordo - Assinar Contrato
                      <PenTool className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      <AlertCircle className="mr-2 h-4 w-4" />
                      Leia o contrato completo
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Sign */}
          {step === 'sign' && (
            <div className="h-full flex flex-col min-h-0 p-6">
              <div className="text-center mb-4">
                <p className="text-sm text-muted-foreground">
                  Desenhe sua assinatura no campo abaixo usando o mouse ou toque
                </p>
              </div>

              {/* Signature canvas */}
              <div className="flex-1 border-2 border-dashed border-border rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  className="w-full h-full touch-none"
                  style={{ minHeight: '200px' }}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep('read')}
                >
                  Voltar
                </Button>
                <Button
                  variant="outline"
                  onClick={clearSignature}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Limpar
                </Button>
                <Button
                  className="flex-1"
                  onClick={confirmSignature}
                >
                  Confirmar Assinatura
                  <Check className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && (
            <div className="h-full flex flex-col min-h-0 p-6 space-y-6 overflow-y-auto">
              <div className="text-center">
                <div className="h-16 w-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center mb-4">
                  <FileCheck className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">Confirme sua assinatura</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Revise os dados e confirme para finalizar
                </p>
              </div>

              {/* Signature preview */}
              {signatureImage && (
                <div className="border rounded-lg p-4 bg-white">
                  <p className="text-xs text-muted-foreground mb-2 text-center">Sua assinatura:</p>
                  <img
                    src={signatureImage}
                    alt="Assinatura"
                    className="max-h-24 mx-auto"
                  />
                </div>
              )}

              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nome:</span>
                  <span className="font-medium">{memberName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CPF:</span>
                  <span className="font-medium">{memberCPF}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plano:</span>
                  <Badge variant={plan}>{planData.name}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data/Hora:</span>
                  <span className="font-medium">{formatTimestamp(new Date().toISOString())}</span>
                </div>
              </div>

              {/* Legal notice */}
              <p className="text-xs text-muted-foreground text-center">
                Ao clicar em "Confirmar e Finalizar", você concorda com todos os termos
                do regulamento e declara que as informações fornecidas são verdadeiras.
                Este documento tem validade jurídica conforme Lei 14.063/2020.
              </p>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep('sign')}
                  disabled={loading}
                >
                  Voltar
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadPDF}
                  disabled={loading}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Baixar PDF
                </Button>
                <Button
                  className="flex-1"
                  onClick={processContract}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      Confirmar e Finalizar
                      <Check className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>

              {/* PDF download link after success */}
              {pdfUrl && (
                <div className="text-center">
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm inline-flex items-center gap-1"
                  >
                    <Download className="h-4 w-4" />
                    Baixar contrato assinado
                  </a>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
