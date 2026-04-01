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

  const contentRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)

  const planData = PLANS[plan]
  const price = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual

  // Scroll to top when step changes
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [step])

  // Initialize signature pad
  useEffect(() => {
    if (step !== 'sign') {
      if (signaturePadRef.current) {
        signaturePadRef.current.off()
        signaturePadRef.current = null
      }
      return
    }

    const timer = setTimeout(() => {
      const canvas = canvasRef.current
      const container = canvasContainerRef.current
      if (!canvas || !container) return

      const width = container.clientWidth - 4
      const height = 160

      canvas.width = width * 2
      canvas.height = height * 2
      canvas.style.width = width + 'px'
      canvas.style.height = height + 'px'

      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(2, 2)
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, width, height)
      }

      signaturePadRef.current = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255,255,255)',
        penColor: 'rgb(0,0,0)',
      })
    }, 100)

    return () => clearTimeout(timer)
  }, [step])

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current
    if (signaturePadRef.current && canvas) {
      signaturePadRef.current.clear()
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width / 2, canvas.height / 2)
      }
    }
  }, [])

  function confirmSignature() {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
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
        const res = await Promise.race([
          getClientIP(),
          new Promise<string>((_, r) => setTimeout(() => r('timeout'), 3000))
        ])
        ipAddress = res as string
      } catch { /* ignore */ }

      const userAgent = getUserAgent()
      const signedAt = new Date().toISOString()

      let documentHash = `${Date.now()}`
      try {
        documentHash = await generateContractHash({
          memberId, memberName, memberCPF, memberEmail, plan, signedAt, ipAddress,
        })
      } catch { /* use fallback */ }

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
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/70 z-[9998]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-xl md:max-h-[85vh] bg-background rounded-lg shadow-2xl z-[9999] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h2 className="font-bold">
              {step === 'read' ? 'Contrato de Adesão' : step === 'sign' ? 'Assinatura' : 'Confirmação'}
            </h2>
            <p className="text-sm text-muted-foreground">Passo {step === 'read' ? 1 : step === 'sign' ? 2 : 3} de 3</p>
          </div>
          <button onClick={onClose} disabled={loading} className="p-2 hover:bg-muted rounded-full">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="flex gap-1 px-4 py-2 shrink-0">
          <div className={`h-1 flex-1 rounded ${['read','sign','confirm'].includes(step) ? 'bg-primary' : 'bg-muted'}`} />
          <div className={`h-1 flex-1 rounded ${['sign','confirm'].includes(step) ? 'bg-primary' : 'bg-muted'}`} />
          <div className={`h-1 flex-1 rounded ${step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
        </div>

        {/* Content - scrollable */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4">

          {/* STEP 1: READ */}
          {step === 'read' && (
            <div className="space-y-4">
              <div className="text-center">
                <img src="/logo.jpg" alt="Logo" className="h-12 mx-auto rounded mb-2" />
                <h3 className="font-bold text-primary">{CONTRACT_TITLE}</h3>
                <p className="text-xs text-muted-foreground">{CONTRACT_SUBTITLE}</p>
              </div>

              <div className="bg-muted/50 rounded p-3 text-sm">
                <p className="font-semibold mb-1">Seus Dados:</p>
                <p>{memberName} • CPF: {memberCPF}</p>
                <p>{memberEmail} • {memberPhone}</p>
                <p className="mt-1">
                  Plano: <Badge variant={plan}>{planData.name}</Badge> ({paymentType === 'monthly' ? 'Mensal' : 'Anual'}) - {formatCurrency(price)}
                </p>
              </div>

              <div className="space-y-3 text-sm">
                {CONTRACT_SECTIONS.map((s, i) => (
                  <div key={i}>
                    <h4 className="font-semibold">{s.title}</h4>
                    {s.content.map((p, j) => (
                      <p key={j} className="text-muted-foreground mt-1">{p}</p>
                    ))}
                  </div>
                ))}
              </div>

              <p className="text-center text-xs text-muted-foreground py-2">— Fim do Regulamento —</p>

              <label className="flex items-start gap-3 p-3 border-2 border-primary/30 rounded-lg bg-primary/5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-5 w-5 accent-primary"
                />
                <span className="text-sm">Li e concordo com os termos acima</span>
              </label>
            </div>
          )}

          {/* STEP 2: SIGN */}
          {step === 'sign' && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="font-bold">Desenhe sua Assinatura</h3>
                <p className="text-sm text-muted-foreground">Use o mouse ou dedo</p>
              </div>

              <div ref={canvasContainerRef} className="border-2 border-dashed rounded-lg bg-white p-0.5">
                <canvas ref={canvasRef} style={{ touchAction: 'none', display: 'block' }} />
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Válido conforme Lei 14.063/2020
              </p>
            </div>
          )}

          {/* STEP 3: CONFIRM */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="h-12 w-12 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-2">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <h3 className="font-bold">Confirme e Finalize</h3>
              </div>

              {signatureImage && (
                <div className="bg-white border rounded p-3">
                  <p className="text-xs text-center text-muted-foreground mb-1">Sua assinatura:</p>
                  <img src={signatureImage} alt="Assinatura" className="max-h-14 mx-auto" />
                </div>
              )}

              <div className="bg-muted/50 rounded p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Nome:</span> {memberName}</p>
                <p><span className="text-muted-foreground">CPF:</span> {memberCPF}</p>
                <p><span className="text-muted-foreground">Plano:</span> <Badge variant={plan}>{planData.name}</Badge></p>
                <p><span className="text-muted-foreground">Data:</span> {formatTimestamp(new Date().toISOString())}</p>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Documento válido conforme Lei 14.063/2020
              </p>

              {pdfUrl && (
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="block text-center text-primary text-sm hover:underline">
                  <Download className="inline h-4 w-4 mr-1" /> Baixar contrato
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer - actions */}
        <div className="p-4 border-t shrink-0">
          {step === 'read' && (
            <Button className="w-full" disabled={!acceptedTerms} onClick={() => setStep('sign')}>
              Continuar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step === 'sign' && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('read')}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              <Button variant="outline" onClick={clearSignature}>
                <RotateCcw className="mr-1 h-4 w-4" /> Limpar
              </Button>
              <Button className="flex-1" onClick={confirmSignature}>
                Confirmar <Check className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 'confirm' && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('sign')} disabled={loading}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              <Button variant="outline" onClick={handleDownload} disabled={loading}>
                <Download className="mr-1 h-4 w-4" /> PDF
              </Button>
              <Button className="flex-1" onClick={processContract} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                {loading ? 'Salvando...' : 'Finalizar'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
