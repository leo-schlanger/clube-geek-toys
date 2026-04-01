/**
 * Contract Modal - Digital contract with signature capture
 * Full-page approach for maximum compatibility
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

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)

  const planData = PLANS[plan]
  const price = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  // Initialize signature pad
  useEffect(() => {
    if (step === 'sign') {
      const timer = setTimeout(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const container = canvas.parentElement
        if (!container) return

        const rect = container.getBoundingClientRect()
        const width = rect.width || 300
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

        signaturePadRef.current = new SignaturePad(canvas, {
          backgroundColor: 'rgb(255, 255, 255)',
          penColor: 'rgb(0, 0, 0)',
          minWidth: 1,
          maxWidth: 2.5,
        })
      }, 100)

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
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
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
      const ipAddress = await getClientIP()
      const userAgent = getUserAgent()
      const signedAt = new Date().toISOString()

      const documentHash = await generateContractHash({
        memberId, memberName, memberCPF, memberEmail, plan, signedAt, ipAddress,
      })

      const contractData: ContractData = {
        memberId, memberName, memberCPF, memberEmail, memberPhone,
        plan, paymentType, signatureImage, signedAt, ipAddress,
        userAgent, documentHash, createdAt: signedAt,
      }

      toast.loading('Gerando PDF...', { id: 'contract' })
      const pdfBytes = await generateContractPDF({ ...contractData, signedAt })

      toast.loading('Salvando contrato...', { id: 'contract' })
      const { pdfUrl: storedPdfUrl } = await storeContract(contractData, pdfBytes)
      setPdfUrl(storedPdfUrl)
      contractData.pdfUrl = storedPdfUrl

      sendContractEmail(
        memberEmail, memberName, planData.name, signedAt, documentHash, pdfToBase64(pdfBytes)
      ).catch(err => logger.error('Contract email error:', err))

      toast.success('Contrato assinado com sucesso!', { id: 'contract' })
      onSigned(contractData)
    } catch (error) {
      logger.error('Contract error:', error)
      toast.error('Erro ao processar contrato. Tente novamente.', { id: 'contract' })
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
    <div className="fixed inset-0 z-[100] bg-background overflow-auto">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {step === 'read' && '1. Leitura'}
              {step === 'sign' && '2. Assinatura'}
              {step === 'confirm' && '3. Confirmação'}
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 hover:bg-muted rounded-full"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-1 bg-primary transition-all duration-300"
            style={{ width: step === 'read' ? '33%' : step === 'sign' ? '66%' : '100%' }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6">

        {/* === STEP 1: READ === */}
        {step === 'read' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
              <img src="/logo.jpg" alt="Geek & Toys" className="h-16 mx-auto rounded mb-3" />
              <h1 className="text-xl font-bold text-primary">{CONTRACT_TITLE}</h1>
              <p className="text-sm text-muted-foreground">{CONTRACT_SUBTITLE}</p>
            </div>

            {/* Member Info */}
            <div className="bg-muted rounded-lg p-4 text-sm space-y-1">
              <p className="font-semibold text-primary mb-2">Seus Dados</p>
              <p><strong>Nome:</strong> {memberName}</p>
              <p><strong>CPF:</strong> {memberCPF}</p>
              <p><strong>Email:</strong> {memberEmail}</p>
              <p><strong>Telefone:</strong> {memberPhone}</p>
              <p className="pt-2">
                <strong>Plano:</strong>{' '}
                <Badge variant={plan}>{planData.name}</Badge>{' '}
                ({paymentType === 'monthly' ? 'Mensal' : 'Anual'}) - <strong>{formatCurrency(price)}</strong>
              </p>
            </div>

            {/* Contract Sections */}
            <div className="space-y-6">
              {CONTRACT_SECTIONS.map((section, i) => (
                <div key={i} className="border-b border-border pb-4 last:border-0">
                  <h3 className="font-semibold text-sm mb-2">{section.title}</h3>
                  <div className="space-y-2">
                    {section.content.map((p, j) => (
                      <p key={j} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center text-muted-foreground text-sm py-4">
              — Fim do Regulamento —
            </div>

            {/* Acceptance */}
            <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-2 border-primary accent-primary"
                />
                <span className="text-sm font-medium">
                  Li e concordo com todos os termos do regulamento acima
                </span>
              </label>
            </div>

            {/* Action */}
            <Button
              className="w-full h-12 text-base"
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
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold">Assinatura Digital</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Desenhe sua assinatura no campo abaixo
              </p>
            </div>

            {/* Signature Area */}
            <div className="border-2 border-dashed border-primary/50 rounded-lg p-1 bg-white">
              <canvas
                ref={canvasRef}
                className="w-full rounded"
                style={{ touchAction: 'none', minHeight: '180px' }}
              />
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Use o dedo ou mouse para desenhar sua assinatura
            </p>

            {/* Actions */}
            <div className="space-y-3">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
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
              </div>
              <Button
                className="w-full h-12 text-base"
                onClick={confirmSignature}
              >
                Confirmar Assinatura
                <Check className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        )}

        {/* === STEP 3: CONFIRM === */}
        {step === 'confirm' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="h-16 w-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold">Confirmar Assinatura</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Revise os dados e finalize
              </p>
            </div>

            {/* Signature Preview */}
            {signatureImage && (
              <div className="bg-white border rounded-lg p-4">
                <p className="text-xs text-center text-muted-foreground mb-2">Sua assinatura:</p>
                <img src={signatureImage} alt="Assinatura" className="max-h-20 mx-auto" />
              </div>
            )}

            {/* Summary */}
            <div className="bg-muted rounded-lg p-4 text-sm space-y-2">
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
            <div className="space-y-3">
              <div className="flex gap-3">
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
              </div>
              <Button
                className="w-full h-12 text-base"
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

      {/* Bottom safe area for mobile */}
      <div className="h-8" />
    </div>
  )
}
