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
  ChevronDown,
  Shield,
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
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [signatureImage, setSignatureImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [canvasReady, setCanvasReady] = useState(false)
  const [canvasError, setCanvasError] = useState(false)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const checkboxRef = useRef<HTMLLabelElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)

  const planData = PLANS[plan]
  const price = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual
  const canProceed = acceptedTerms && acceptedPrivacy

  // Track scroll position in read step
  useEffect(() => {
    if (step !== 'read') return
    const el = contentRef.current
    if (!el) return

    const handleScroll = () => {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (isNearBottom) setScrolledToBottom(true)
    }

    el.addEventListener('scroll', handleScroll)
    // Check initial state (short content)
    handleScroll()
    return () => el.removeEventListener('scroll', handleScroll)
  }, [step])

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
    const height = 170

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
    }

    if (signaturePadRef.current) {
      signaturePadRef.current.off()
    }

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
      setCanvasError(false)
      return
    }

    const attempts = [50, 150, 300, 500, 800]
    let attemptIndex = 0
    let timeoutId: ReturnType<typeof setTimeout>

    const trySetup = () => {
      if (setupCanvas()) {
        setCanvasError(false)
        return
      }
      attemptIndex++
      if (attemptIndex < attempts.length) {
        timeoutId = setTimeout(trySetup, attempts[attemptIndex])
      } else {
        setCanvasError(true)
        toast.error('Erro ao carregar área de assinatura. Tente recarregar a página.')
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

  // When user clicks disabled button, scroll to checkboxes
  function handleDisabledContinueClick() {
    if (canProceed) return
    checkboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    toast.error('Aceite os termos e a política de privacidade para continuar', { id: 'accept-terms' })
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
      let pdfBytes: Uint8Array
      try {
        pdfBytes = await generateContractPDF({ ...contractData, signedAt })
      } catch (pdfError) {
        logger.error('PDF generation failed:', pdfError)
        toast.error('Erro ao gerar PDF do contrato.', { id: 'contract' })
        setLoading(false)
        return
      }

      toast.loading('Enviando contrato...', { id: 'contract' })
      let url: string
      try {
        const result = await storeContract(contractData, pdfBytes)
        url = result.pdfUrl
      } catch (storeError) {
        logger.error('Contract storage failed:', storeError)
        toast.error('Erro ao salvar contrato. Verifique sua conexão.', { id: 'contract' })
        setLoading(false)
        return
      }

      setPdfUrl(url)
      contractData.pdfUrl = url

      // Send email (non-blocking)
      sendContractEmail(
        memberEmail, memberName, planData.name, signedAt, documentHash, pdfToBase64(pdfBytes)
      ).catch((emailError) => {
        logger.warn('Contract email failed (non-critical):', emailError)
      })

      toast.success('Contrato assinado com sucesso!', { id: 'contract' })
      onSigned(contractData)
    } catch (e) {
      logger.error('Contract error (unexpected):', e)
      const errorMessage = e instanceof Error ? e.message : 'Erro desconhecido'
      toast.error(`Erro: ${errorMessage}`, { id: 'contract' })
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

  const handleOverlayClick = () => {
    toast.error('Você precisa assinar o contrato para continuar', { id: 'contract-required' })
  }

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden">
      <div className="fixed inset-0 bg-black/70" onClick={handleOverlayClick} />

      <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
        <div className="relative bg-background rounded-lg shadow-2xl w-full max-w-2xl h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div>
              <h2 className="font-bold text-lg">
                {step === 'read' ? 'Contrato de Adesão' : step === 'sign' ? 'Assinatura Digital' : 'Confirmação'}
              </h2>
              <p className="text-sm text-muted-foreground">Passo {step === 'read' ? 1 : step === 'sign' ? 2 : 3} de 3</p>
            </div>
            {loading ? (
              <div className="p-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : step === 'confirm' && pdfUrl ? (
              <button onClick={onClose} className="p-2 hover:bg-muted rounded-full" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            ) : (
              <div className="p-2 text-muted-foreground" title="Contrato obrigatório">
                <Badge variant="outline" className="text-xs">Obrigatório</Badge>
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="flex gap-1 px-4 py-2 shrink-0 bg-muted/30">
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${step !== undefined ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${step === 'sign' || step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${step === 'confirm' ? 'bg-primary' : 'bg-muted'}`} />
          </div>

          {/* Content - scrollable area */}
          <div ref={contentRef} className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 min-h-0">
            {/* STEP 1: READ */}
            {step === 'read' && (
              <div className="space-y-4">
                <div className="text-center">
                  <img src="/logo-vip.png" alt="Clube Geek & Toys VIP" className="w-36 mx-auto mb-2" />
                  <h3 className="font-bold text-primary">{CONTRACT_TITLE}</h3>
                  <p className="text-xs text-muted-foreground">{CONTRACT_SUBTITLE}</p>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-semibold mb-1">Seus Dados:</p>
                  <p>{memberName} &bull; CPF: {memberCPF}</p>
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

                {/* Checkboxes */}
                <div className="space-y-3">
                  <label ref={checkboxRef} className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    acceptedTerms
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                  }`}>
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={e => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 h-5 w-5 accent-primary cursor-pointer shrink-0"
                    />
                    <span className="text-sm font-medium">
                      Li e concordo com todos os termos do regulamento acima
                    </span>
                  </label>

                  <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    acceptedPrivacy
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                  }`}>
                    <input
                      type="checkbox"
                      checked={acceptedPrivacy}
                      onChange={e => setAcceptedPrivacy(e.target.checked)}
                      className="mt-0.5 h-5 w-5 accent-primary cursor-pointer shrink-0"
                    />
                    <span className="text-sm font-medium">
                      Aceito a{' '}
                      <a href="/privacidade" target="_blank" className="text-primary underline">
                        Política de Privacidade
                      </a>{' '}
                      e autorizo o tratamento dos meus dados conforme a LGPD
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* STEP 2: SIGN */}
            {step === 'sign' && (
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="font-bold text-lg">Desenhe sua Assinatura</h3>
                  <p className="text-sm text-muted-foreground">Use o mouse ou toque na tela</p>
                </div>

                {/* Data collection notice */}
                <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-200">
                  <Shield className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />
                  <p>
                    Para validade jurídica (Lei 14.063/2020), serão registrados: seu endereço IP,
                    informações do dispositivo, data/hora e um hash SHA-256 do documento.
                  </p>
                </div>

                <div
                  ref={canvasContainerRef}
                  className="border-2 border-dashed border-primary/50 rounded-lg bg-white overflow-hidden cursor-crosshair"
                  style={{ minHeight: '180px' }}
                >
                  <canvas
                    ref={canvasRef}
                    className="block w-full cursor-crosshair"
                    style={{ touchAction: 'none', minHeight: '170px' }}
                  />
                </div>

                {!canvasReady && !canvasError && (
                  <div className="text-center text-sm text-muted-foreground">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    Carregando área de assinatura...
                  </div>
                )}

                {canvasError && (
                  <div className="text-center p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-2">
                      Erro ao carregar área de assinatura
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCanvasError(false)
                        setCanvasReady(false)
                        setTimeout(() => setupCanvas(), 100)
                      }}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Tentar novamente
                    </Button>
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

          {/* Footer - always visible */}
          <div className="p-4 sm:p-6 border-t shrink-0 bg-background shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            {step === 'read' && (
              <div className="space-y-2">
                {/* Scroll hint when checkboxes not yet visible */}
                {!scrolledToBottom && !canProceed && (
                  <button
                    onClick={() => checkboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <ChevronDown className="h-4 w-4 animate-bounce" />
                    Role até o final para aceitar os termos
                  </button>
                )}
                <div onClick={!canProceed ? handleDisabledContinueClick : undefined}>
                  <Button
                    className="w-full h-12 text-base font-semibold"
                    disabled={!canProceed}
                    onClick={() => setStep('sign')}
                  >
                    Continuar para Assinatura
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}

            {step === 'sign' && (
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 sm:flex-none h-11" onClick={() => setStep('read')}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Voltar
                  </Button>
                  <Button variant="outline" className="flex-1 sm:flex-none h-11" onClick={clearSignature} disabled={!canvasReady}>
                    <RotateCcw className="mr-1 h-4 w-4" />
                    Limpar
                  </Button>
                </div>
                <Button className="flex-1 h-12 text-base font-semibold" onClick={confirmSignature} disabled={!canvasReady}>
                  Confirmar Assinatura
                  <Check className="ml-2 h-5 w-5" />
                </Button>
              </div>
            )}

            {step === 'confirm' && (
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 sm:flex-none h-11" onClick={() => setStep('sign')} disabled={loading}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Voltar
                  </Button>
                  <Button variant="outline" className="flex-1 sm:flex-none h-11" onClick={handleDownload} disabled={loading}>
                    <Download className="mr-1 h-4 w-4" />
                    PDF
                  </Button>
                </div>
                <Button className="flex-1 h-12 text-base font-semibold" onClick={processContract} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-5 w-5" />
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
