/**
 * Contract Modal - Digital contract with signature capture
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
  const [canvasReady, setCanvasReady] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)

  const planData = PLANS[plan]
  const price = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual

  // Scroll to top when step changes
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
    if (step !== 'sign') {
      setCanvasReady(false)
    }
  }, [step])

  // Setup signature pad
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = canvasContainerRef.current
    if (!canvas || !container) return false

    const rect = container.getBoundingClientRect()
    const width = Math.max(rect.width - 8, 280)
    const height = 150

    // Set canvas dimensions
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    // Setup context
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
    }

    // Destroy old pad if exists
    if (signaturePadRef.current) {
      signaturePadRef.current.off()
    }

    // Create new signature pad
    signaturePadRef.current = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
      minWidth: 0.5,
      maxWidth: 2.5,
    })

    setCanvasReady(true)
    return true
  }, [])

  // Initialize signature pad when entering sign step
  useEffect(() => {
    if (step !== 'sign') {
      if (signaturePadRef.current) {
        signaturePadRef.current.off()
        signaturePadRef.current = null
      }
      return
    }

    // Try multiple times with increasing delays
    const attempts = [50, 150, 300, 500]
    let attemptIndex = 0
    let timeoutId: ReturnType<typeof setTimeout>

    const trySetup = () => {
      if (setupCanvas()) {
        return // Success
      }
      attemptIndex++
      if (attemptIndex < attempts.length) {
        timeoutId = setTimeout(trySetup, attempts[attemptIndex])
      }
    }

    timeoutId = setTimeout(trySetup, attempts[0])

    return () => {
      clearTimeout(timeoutId)
    }
  }, [step, setupCanvas])

  // Handle resize
  useEffect(() => {
    if (step !== 'sign') return

    const handleResize = () => {
      if (signaturePadRef.current) {
        const data = signaturePadRef.current.toData()
        setupCanvas()
        if (data.length > 0 && signaturePadRef.current) {
          signaturePadRef.current.fromData(data)
        }
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [step, setupCanvas])

  const clearSignature = useCallback(() => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear()
    }
    setupCanvas()
  }, [setupCanvas])

  function confirmSignature() {
    if (!signaturePadRef.current) {
      toast.error('Área de assinatura não carregada')
      return
    }
    if (signaturePadRef.current.isEmpty()) {
      toast.error('Desenhe sua assinatura')
      return
    }
    setSignatureImage(signaturePadRef.current.toDataURL('image/png'))
    setStep('confirm')
  }

  async function processContract() {
    if (!signatureImage) return

    setLoading(true)
    toast.loading('Processando...', { id: 'contract' })

    try {
      let ipAddress = 'N/A'
      try {
        ipAddress = await Promise.race([
          getClientIP(),
          new Promise<string>((_, reject) => setTimeout(() => reject('timeout'), 3000))
        ]) as string
      } catch {
        // Use fallback
      }

      const userAgent = getUserAgent()
      const signedAt = new Date().toISOString()

      let documentHash = `${Date.now()}`
      try {
        documentHash = await generateContractHash({
          memberId, memberName, memberCPF, memberEmail, plan, signedAt, ipAddress,
        })
      } catch {
        // Use fallback
      }

      const contractData: ContractData = {
        memberId, memberName, memberCPF, memberEmail, memberPhone,
        plan, paymentType, signatureImage, signedAt, ipAddress,
        userAgent, documentHash, createdAt: signedAt,
      }

      toast.loading('Gerando PDF...', { id: 'contract' })
      const pdfBytes = await generateContractPDF({ ...contractData, signedAt })

      toast.loading('Salvando...', { id: 'contract' })
      const { pdfUrl: url } = await storeContract(contractData, pdfBytes)
      setPdfUrl(url)
      contractData.pdfUrl = url

      sendContractEmail(
        memberEmail, memberName, planData.name, signedAt, documentHash, pdfToBase64(pdfBytes)
      ).catch(() => {})

      toast.success('Contrato assinado!', { id: 'contract' })
      onSigned(contractData)
    } catch (e) {
      logger.error('Contract error:', e)
      toast.error('Erro ao salvar. Tente novamente.', { id: 'contract' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload() {
    if (!signatureImage) return
    try {
      toast.loading('Gerando PDF...', { id: 'pdf' })
      const ipAddress = await getClientIP().catch(() => 'N/A')
      const signedAt = new Date().toISOString()
      const documentHash = await generateContractHash({
        memberId, memberName, memberCPF, memberEmail, plan, signedAt, ipAddress,
      }).catch(() => `${Date.now()}`)
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
    <div className="fixed inset-0 z-[9999]">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-background rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div>
              <h2 className="font-bold text-lg">
                {step === 'read' ? 'Contrato de Adesão' : step === 'sign' ? 'Assinatura Digital' : 'Confirmação'}
              </h2>
              <p className="text-sm text-muted-foreground">Passo {step === 'read' ? 1 : step === 'sign' ? 2 : 3} de 3</p>
            </div>
            <button onClick={onClose} disabled={loading} className="p-2 hover:bg-muted rounded-full" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Progress */}
          <div className="flex gap-1 px-4 py-2 shrink-0 bg-muted/30">
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${step !== undefined ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${step === 'sign' || step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
          </div>

          {/* Content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto p-4 min-h-0">
            {/* STEP 1: READ */}
            {step === 'read' && (
              <div className="space-y-4">
                <div className="text-center">
                  <img src="/logo.jpg" alt="Logo" className="h-12 mx-auto rounded mb-2" />
                  <h3 className="font-bold text-primary">{CONTRACT_TITLE}</h3>
                  <p className="text-xs text-muted-foreground">{CONTRACT_SUBTITLE}</p>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-semibold mb-1">Seus Dados:</p>
                  <p>{memberName} • CPF: {memberCPF}</p>
                  <p className="break-all">{memberEmail}</p>
                  <p>{memberPhone}</p>
                  <p className="mt-2 pt-2 border-t">
                    <span className="text-muted-foreground">Plano:</span>{' '}
                    <Badge variant={plan}>{planData.name}</Badge>{' '}
                    ({paymentType === 'monthly' ? 'Mensal' : 'Anual'}) - <strong>{formatCurrency(price)}</strong>
                  </p>
                </div>

                <div className="space-y-4 text-sm">
                  {CONTRACT_SECTIONS.map((s, i) => (
                    <div key={i} className="pb-3 border-b border-border last:border-0">
                      <h4 className="font-semibold mb-1">{s.title}</h4>
                      {s.content.map((p, j) => (
                        <p key={j} className="text-muted-foreground leading-relaxed">{p}</p>
                      ))}
                    </div>
                  ))}
                </div>

                <p className="text-center text-xs text-muted-foreground py-2">— Fim do Regulamento —</p>

                <label className="flex items-start gap-3 p-4 border-2 border-primary/40 rounded-lg bg-primary/10 cursor-pointer hover:bg-primary/15 transition-colors">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={e => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-5 w-5 accent-primary cursor-pointer"
                  />
                  <span className="text-sm font-medium">Li e concordo com todos os termos do regulamento acima</span>
                </label>
              </div>
            )}

            {/* STEP 2: SIGN */}
            {step === 'sign' && (
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="font-bold text-lg">Desenhe sua Assinatura</h3>
                  <p className="text-sm text-muted-foreground">Use o mouse ou toque na tela</p>
                </div>

                <div
                  ref={canvasContainerRef}
                  className="border-2 border-dashed border-primary/50 rounded-lg bg-white overflow-hidden"
                  style={{ minHeight: '160px' }}
                >
                  <canvas
                    ref={canvasRef}
                    className="block w-full"
                    style={{ touchAction: 'none', minHeight: '150px' }}
                  />
                </div>

                {!canvasReady && (
                  <div className="text-center text-sm text-muted-foreground">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    Carregando área de assinatura...
                  </div>
                )}

                <p className="text-xs text-center text-muted-foreground">
                  Assinatura com validade jurídica conforme Lei 14.063/2020
                </p>
              </div>
            )}

            {/* STEP 3: CONFIRM */}
            {step === 'confirm' && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="h-14 w-14 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                    <Check className="h-7 w-7 text-green-500" />
                  </div>
                  <h3 className="font-bold text-lg">Revise e Finalize</h3>
                  <p className="text-sm text-muted-foreground">Confirme os dados abaixo</p>
                </div>

                {signatureImage && (
                  <div className="bg-white border-2 border-border rounded-lg p-4">
                    <p className="text-xs text-center text-muted-foreground mb-2">Sua assinatura:</p>
                    <img src={signatureImage} alt="Assinatura" className="max-h-16 mx-auto" />
                  </div>
                )}

                <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
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
                    <span className="text-muted-foreground">Data/Hora:</span>
                    <span className="font-medium">{formatTimestamp(new Date().toISOString())}</span>
                  </div>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Documento com validade jurídica conforme Lei 14.063/2020
                </p>

                {pdfUrl && (
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-primary text-sm hover:underline">
                    <Download className="h-4 w-4" /> Baixar contrato assinado
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t shrink-0 bg-muted/20">
            {step === 'read' && (
              <Button className="w-full h-11" disabled={!acceptedTerms} onClick={() => setStep('sign')}>
                Continuar para Assinatura
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === 'sign' && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('read')}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Voltar
                </Button>
                <Button variant="outline" onClick={clearSignature} disabled={!canvasReady}>
                  <RotateCcw className="mr-1 h-4 w-4" />
                  Limpar
                </Button>
                <Button className="flex-1 h-11" onClick={confirmSignature} disabled={!canvasReady}>
                  Confirmar
                  <Check className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}

            {step === 'confirm' && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('sign')} disabled={loading}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Voltar
                </Button>
                <Button variant="outline" onClick={handleDownload} disabled={loading}>
                  <Download className="mr-1 h-4 w-4" />
                  PDF
                </Button>
                <Button className="flex-1 h-11" onClick={processContract} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="mr-1 h-4 w-4" />
                      Finalizar Contrato
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
