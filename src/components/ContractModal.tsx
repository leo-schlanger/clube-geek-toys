/**
 * Contract Modal - Digital contract with signature capture
 * Implements electronic signature per Lei 14.063/2020
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
  ScrollText,
  PenTool,
  Check,
  RotateCcw,
  Download,
  FileCheck,
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
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [signatureImage, setSignatureImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)

  const planData = PLANS[plan]
  const price = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual

  // Initialize signature pad
  useEffect(() => {
    if (step === 'sign' && canvasRef.current) {
      const canvas = canvasRef.current

      // Set fixed dimensions
      const width = Math.min(500, window.innerWidth - 80)
      const height = 200

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
        maxWidth: 3,
      })
    }

    return () => {
      if (signaturePadRef.current) {
        signaturePadRef.current.off()
        signaturePadRef.current = null
      }
    }
  }, [step])

  // Clear signature
  const clearSignature = useCallback(() => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear()
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = 'white'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
      }
    }
  }, [])

  // Confirm signature
  function confirmSignature() {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      toast.error('Por favor, desenhe sua assinatura')
      return
    }
    setSignatureImage(signaturePadRef.current.toDataURL('image/png'))
    setStep('confirm')
  }

  // Process contract
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

      // Send email (non-blocking)
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

  // Download PDF
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
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm overflow-y-auto"
      style={{ padding: '20px' }}
    >
      <div
        className="bg-background border border-border rounded-lg mx-auto my-4 w-full shadow-xl"
        style={{ maxWidth: '600px' }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border rounded-t-lg p-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                {step === 'read' && <ScrollText className="h-5 w-5 text-primary" />}
                {step === 'sign' && <PenTool className="h-5 w-5 text-primary" />}
                {step === 'confirm' && <FileCheck className="h-5 w-5 text-primary" />}
              </div>
              <div>
                <h2 className="font-semibold">
                  {step === 'read' && 'Leitura do Contrato'}
                  {step === 'sign' && 'Assinatura Digital'}
                  {step === 'confirm' && 'Confirmação'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Passo {step === 'read' ? 1 : step === 'sign' ? 2 : 3} de 3
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Progress */}
          <div className="flex gap-2">
            <div className={`h-1 flex-1 rounded ${step === 'read' || step === 'sign' || step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1 flex-1 rounded ${step === 'sign' || step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1 flex-1 rounded ${step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Step 1: Read */}
          {step === 'read' && (
            <div className="space-y-4">
              {/* Title */}
              <div className="text-center py-4">
                <img src="/logo.jpg" alt="Geek & Toys" className="h-14 mx-auto rounded mb-3" />
                <h3 className="text-lg font-bold text-primary">{CONTRACT_TITLE}</h3>
                <p className="text-sm text-muted-foreground">{CONTRACT_SUBTITLE}</p>
              </div>

              {/* Member Info */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-semibold text-primary mb-2">Dados do Assinante</p>
                <div className="grid grid-cols-2 gap-1">
                  <p><span className="text-muted-foreground">Nome:</span> {memberName}</p>
                  <p><span className="text-muted-foreground">CPF:</span> {memberCPF}</p>
                  <p><span className="text-muted-foreground">Email:</span> {memberEmail}</p>
                  <p><span className="text-muted-foreground">Tel:</span> {memberPhone}</p>
                </div>
                <p className="mt-2">
                  <span className="text-muted-foreground">Plano:</span>{' '}
                  <Badge variant={plan}>{planData.name}</Badge>{' '}
                  ({paymentType === 'monthly' ? 'Mensal' : 'Anual'}) - {formatCurrency(price)}
                </p>
              </div>

              {/* Contract Content */}
              <div
                className="border rounded-lg p-4 space-y-4 bg-white dark:bg-zinc-900"
                style={{ maxHeight: '300px', overflowY: 'auto' }}
              >
                {CONTRACT_SECTIONS.map((section, i) => (
                  <div key={i}>
                    <h4 className="font-semibold text-sm mb-1">{section.title}</h4>
                    {section.content.map((p, j) => (
                      <p key={j} className="text-sm text-muted-foreground mb-1">{p}</p>
                    ))}
                  </div>
                ))}
                <p className="text-center text-muted-foreground text-sm pt-4 border-t">
                  — Fim do Regulamento —
                </p>
              </div>

              {/* Checkbox */}
              <label className="flex items-start gap-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-gray-300"
                />
                <span className="text-sm">
                  Li e concordo com todos os termos do regulamento do Clube Geek & Toys VIP
                </span>
              </label>

              {/* Action */}
              <Button
                className="w-full"
                size="lg"
                disabled={!acceptedTerms}
                onClick={() => setStep('sign')}
              >
                Continuar para Assinatura
                <PenTool className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Sign */}
          {step === 'sign' && (
            <div className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                Desenhe sua assinatura abaixo usando o mouse ou o dedo
              </p>

              {/* Canvas */}
              <div className="flex justify-center">
                <div className="border-2 border-dashed border-border rounded-lg overflow-hidden bg-white">
                  <canvas
                    ref={canvasRef}
                    style={{ touchAction: 'none', display: 'block' }}
                  />
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Sua assinatura será usada no contrato digital
              </p>

              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('read')}>
                  Voltar
                </Button>
                <Button variant="outline" onClick={clearSignature}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Limpar
                </Button>
                <Button className="flex-1" size="lg" onClick={confirmSignature}>
                  Confirmar
                  <Check className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="h-14 w-14 mx-auto rounded-full bg-primary/20 flex items-center justify-center mb-3">
                  <FileCheck className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-semibold">Confirme sua assinatura</h3>
                <p className="text-sm text-muted-foreground">Revise e finalize</p>
              </div>

              {/* Signature Preview */}
              {signatureImage && (
                <div className="border rounded-lg p-3 bg-white">
                  <p className="text-xs text-center text-muted-foreground mb-2">Sua assinatura:</p>
                  <img src={signatureImage} alt="Assinatura" className="max-h-16 mx-auto" />
                </div>
              )}

              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nome:</span>
                  <span>{memberName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CPF:</span>
                  <span>{memberCPF}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plano:</span>
                  <Badge variant={plan}>{planData.name}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data:</span>
                  <span>{formatTimestamp(new Date().toISOString())}</span>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Este documento tem validade jurídica conforme Lei 14.063/2020.
              </p>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setStep('sign')} disabled={loading}>
                  Voltar
                </Button>
                <Button variant="outline" onClick={handleDownload} disabled={loading}>
                  <Download className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button className="flex-1" size="lg" onClick={processContract} disabled={loading}>
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
      </div>
    </div>
  )
}
