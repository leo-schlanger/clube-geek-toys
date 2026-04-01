/**
 * Contract Modal - Digital contract with signature capture
 * Responsive: full-page on mobile, centered modal on desktop
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import SignaturePad from 'signature_pad'
import { Button } from './ui/button'
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
  Check,
  RotateCcw,
  Download,
  Loader2,
  ArrowLeft,
  ArrowRight,
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
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [signatureImage, setSignatureImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const modalRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)

  const planData = PLANS[plan]
  const price = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual

  // Scroll to top of modal when step changes
  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.scrollTop = 0
    }
  }, [step])

  // Initialize signature pad
  useEffect(() => {
    if (step === 'sign') {
      const timer = setTimeout(() => {
        const canvas = canvasRef.current
        const container = canvasContainerRef.current
        if (!canvas || !container) return

        const rect = container.getBoundingClientRect()
        const width = Math.max(rect.width - 4, 280) // -4 for border
        const height = 180

        canvas.width = width * 2
        canvas.height = height * 2
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`

        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.scale(2, 2)
          ctx.fillStyle = 'white'
          ctx.fillRect(0, 0, width, height)
        }

        if (signaturePadRef.current) {
          signaturePadRef.current.off()
        }

        signaturePadRef.current = new SignaturePad(canvas, {
          backgroundColor: 'rgb(255, 255, 255)',
          penColor: 'rgb(0, 0, 0)',
          minWidth: 1,
          maxWidth: 2.5,
        })
      }, 150)

      return () => clearTimeout(timer)
    }

    return () => {
      if (signaturePadRef.current) {
        signaturePadRef.current.off()
        signaturePadRef.current = null
      }
    }
  }, [step])

  const clearSignature = useCallback(() => {
    if (signaturePadRef.current && canvasRef.current) {
      signaturePadRef.current.clear()
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        const width = canvasRef.current.width / 2
        const height = canvasRef.current.height / 2
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, width, height)
      }
    }
  }, [])

  function confirmSignature() {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      toast.error('Por favor, desenhe sua assinatura')
      return
    }
    setSignatureImage(signaturePadRef.current.toDataURL('image/png'))
    setStep('confirm')
  }

  async function processContract() {
    if (!signatureImage) {
      toast.error('Assinatura não encontrada')
      return
    }

    setLoading(true)
    toast.loading('Processando contrato...', { id: 'contract' })

    try {
      // Get IP with timeout fallback
      let ipAddress = 'Não identificado'
      try {
        ipAddress = await Promise.race([
          getClientIP(),
          new Promise<string>((_, reject) => setTimeout(() => reject('timeout'), 3000))
        ]) as string
      } catch {
        ipAddress = 'Não identificado'
      }

      const userAgent = getUserAgent()
      const signedAt = new Date().toISOString()

      // Generate hash
      let documentHash = ''
      try {
        documentHash = await generateContractHash({
          memberId, memberName, memberCPF, memberEmail, plan, signedAt, ipAddress,
        })
      } catch (err) {
        logger.error('Hash generation failed:', err)
        documentHash = `fallback_${Date.now()}`
      }

      const contractData: ContractData = {
        memberId, memberName, memberCPF, memberEmail, memberPhone,
        plan, paymentType, signatureImage, signedAt, ipAddress,
        userAgent, documentHash, createdAt: signedAt,
      }

      // Generate PDF
      toast.loading('Gerando PDF...', { id: 'contract' })
      let pdfBytes: Uint8Array
      try {
        pdfBytes = await generateContractPDF({ ...contractData, signedAt })
      } catch (err) {
        logger.error('PDF generation failed:', err)
        toast.error('Erro ao gerar PDF. Tente novamente.', { id: 'contract' })
        setLoading(false)
        return
      }

      // Store contract
      toast.loading('Salvando contrato...', { id: 'contract' })
      let storedPdfUrl = ''
      try {
        const result = await storeContract(contractData, pdfBytes)
        storedPdfUrl = result.pdfUrl
        setPdfUrl(storedPdfUrl)
        contractData.pdfUrl = storedPdfUrl
      } catch (err) {
        logger.error('Contract storage failed:', err)
        toast.error('Erro ao salvar contrato. Verifique sua conexão e tente novamente.', { id: 'contract' })
        setLoading(false)
        return
      }

      // Send email (non-blocking, don't fail if this fails)
      try {
        const pdfBase64 = pdfToBase64(pdfBytes)
        sendContractEmail(
          memberEmail, memberName, planData.name, signedAt, documentHash, pdfBase64
        ).catch(err => logger.warn('Contract email failed:', err))
      } catch (err) {
        logger.warn('Email preparation failed:', err)
      }

      toast.success('Contrato assinado com sucesso!', { id: 'contract' })
      onSigned(contractData)

    } catch (error) {
      logger.error('Contract processing error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(`Erro: ${errorMessage}`, { id: 'contract' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload() {
    if (!signatureImage) return
    try {
      toast.loading('Gerando PDF...', { id: 'pdf' })
      const ipAddress = await getClientIP()
      const signedAt = new Date().toISOString()
      const documentHash = await generateContractHash({
        memberId, memberName, memberCPF, memberEmail, plan, signedAt, ipAddress,
      })
      const pdfBytes = await generateContractPDF({
        memberId, memberName, memberCPF, memberEmail, memberPhone,
        plan, paymentType, signatureImage, signedAt, ipAddress,
        userAgent: getUserAgent(), documentHash,
      })
      downloadPDF(pdfBytes, `contrato_${memberName.replace(/\s+/g, '_')}.pdf`)
      toast.success('PDF baixado!', { id: 'pdf' })
    } catch {
      toast.error('Erro ao gerar PDF', { id: 'pdf' })
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-0 md:p-4">
      {/* Modal container - full screen on mobile, centered box on desktop */}
      <div
        ref={modalRef}
        className="w-full min-h-screen md:min-h-0 md:max-h-[90vh] md:max-w-2xl md:rounded-lg bg-background md:border md:border-border overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">
                {step === 'read' && 'Passo 1: Leitura do Contrato'}
                {step === 'sign' && 'Passo 2: Assinatura Digital'}
                {step === 'confirm' && 'Passo 3: Confirmação'}
              </h2>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-2 hover:bg-muted rounded-full -mr-2"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Progress bar */}
          <div className="flex gap-1 mt-3">
            <div className={`h-1 flex-1 rounded ${step === 'read' || step === 'sign' || step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1 flex-1 rounded ${step === 'sign' || step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1 flex-1 rounded ${step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-6">

          {/* === STEP 1: READ === */}
          {step === 'read' && (
            <div className="space-y-5">
              {/* Header */}
              <div className="text-center">
                <img src="/logo.jpg" alt="Geek & Toys" className="h-14 mx-auto rounded mb-2" />
                <h1 className="text-lg font-bold text-primary">{CONTRACT_TITLE}</h1>
                <p className="text-sm text-muted-foreground">{CONTRACT_SUBTITLE}</p>
              </div>

              {/* Member Info */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-semibold text-primary mb-2">Dados do Assinante</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  <p><span className="text-muted-foreground">Nome:</span> {memberName}</p>
                  <p><span className="text-muted-foreground">CPF:</span> {memberCPF}</p>
                  <p><span className="text-muted-foreground">Email:</span> {memberEmail}</p>
                  <p><span className="text-muted-foreground">Tel:</span> {memberPhone}</p>
                </div>
                <p className="mt-2 pt-2 border-t border-border">
                  <span className="text-muted-foreground">Plano:</span>{' '}
                  <Badge variant={plan}>{planData.name}</Badge>{' '}
                  <span className="text-muted-foreground">
                    ({paymentType === 'monthly' ? 'Mensal' : 'Anual'})
                  </span>{' '}
                  - <span className="font-bold text-primary">{formatCurrency(price)}</span>
                </p>
              </div>

              {/* Contract Content */}
              <div className="space-y-4">
                {CONTRACT_SECTIONS.map((section, i) => (
                  <div key={i} className="pb-4 border-b border-border last:border-0">
                    <h3 className="font-semibold text-sm mb-2">{section.title}</h3>
                    <div className="space-y-1.5">
                      {section.content.map((p, j) => (
                        <p key={j} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-center text-muted-foreground text-sm py-2">
                — Fim do Regulamento —
              </div>

              {/* Acceptance Checkbox */}
              <div className="bg-primary/10 border-2 border-primary/30 rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded accent-primary cursor-pointer"
                  />
                  <span className="text-sm font-medium leading-tight">
                    Li e concordo com todos os termos do regulamento do Clube Geek & Toys VIP
                  </span>
                </label>
              </div>

              {/* Next Button */}
              <Button
                className="w-full h-12 text-base font-semibold"
                disabled={!acceptedTerms}
                onClick={() => setStep('sign')}
              >
                Continuar para Assinatura
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}

          {/* === STEP 2: SIGN === */}
          {step === 'sign' && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-bold">Desenhe sua Assinatura</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Use o mouse ou dedo para assinar no campo abaixo
                </p>
              </div>

              {/* Signature Canvas Container */}
              <div
                ref={canvasContainerRef}
                className="border-2 border-dashed border-primary/50 rounded-lg bg-white overflow-hidden"
                style={{ minHeight: '180px' }}
              >
                <canvas
                  ref={canvasRef}
                  style={{ touchAction: 'none', display: 'block' }}
                />
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Sua assinatura terá validade jurídica conforme Lei 14.063/2020
              </p>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep('read')}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
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
                  className="flex-1 h-11"
                  onClick={confirmSignature}
                >
                  Confirmar
                  <Check className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* === STEP 3: CONFIRM === */}
          {step === 'confirm' && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="h-14 w-14 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                  <Check className="h-7 w-7 text-green-500" />
                </div>
                <h2 className="text-lg font-bold">Revise e Confirme</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Verifique se tudo está correto
                </p>
              </div>

              {/* Signature Preview */}
              {signatureImage && (
                <div className="bg-white border rounded-lg p-3">
                  <p className="text-xs text-center text-muted-foreground mb-2">Sua assinatura:</p>
                  <img src={signatureImage} alt="Assinatura" className="max-h-16 mx-auto" />
                </div>
              )}

              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nome:</span>
                  <span className="font-medium">{memberName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CPF:</span>
                  <span className="font-medium">{memberCPF}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Plano:</span>
                  <Badge variant={plan}>{planData.name}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-medium">{formatTimestamp(new Date().toISOString())}</span>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Documento com validade jurídica conforme Lei 14.063/2020
              </p>

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep('sign')}
                  disabled={loading}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownload}
                  disabled={loading}
                >
                  <Download className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button
                  className="flex-1 h-12 text-base font-semibold"
                  onClick={processContract}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      Finalizar Contrato
                      <Check className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </div>

              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-primary text-sm hover:underline"
                >
                  <Download className="inline h-4 w-4 mr-1" />
                  Baixar contrato assinado
                </a>
              )}
            </div>
          )}
        </div>

        {/* Bottom padding for mobile safe area */}
        <div className="h-6 md:h-0" />
      </div>
    </div>
  )
}
