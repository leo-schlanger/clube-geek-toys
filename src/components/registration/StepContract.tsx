/**
 * StepContract — Step 4: Contract signing (inline, not modal)
 *
 * Refactored from ContractModal.tsx to render inline within the
 * registration stepper instead of as a fixed overlay.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import SignaturePad from 'signature_pad'
import {
  Check,
  RotateCcw,
  Download,
  Loader2,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Shield,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'
import { PLANS, type PlanType, type PaymentType, type ContractData } from '../../types'
import { formatCurrency } from '../../lib/utils'
import { generateContractPDF, pdfToBase64, downloadPDF } from '../../lib/contract-generator'
import { storeContract } from '../../lib/contract-storage'
import { generateContractHash, getClientIP, getUserAgent, formatTimestamp } from '../../lib/signature-utils'
import { sendContractEmail } from '../../lib/email'
import { CONTRACT_SECTIONS, CONTRACT_TITLE, CONTRACT_SUBTITLE } from '../../data/contract-content'
import { logger } from '../../lib/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContractSubStep = 'read' | 'sign' | 'confirm'

interface StepContractProps {
  memberId: string
  memberName: string
  memberCPF: string
  memberEmail: string
  memberPhone: string
  plan: PlanType
  paymentType: PaymentType
  onSigned: (contractData: ContractData) => void
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepContract({
  memberId,
  memberName,
  memberCPF,
  memberEmail,
  memberPhone,
  plan,
  paymentType,
  onSigned,
  onBack,
}: StepContractProps) {
  const [subStep, setSubStep] = useState<ContractSubStep>('read')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [signatureImage, setSignatureImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [canvasReady, setCanvasReady] = useState(false)
  const [canvasError, setCanvasError] = useState(false)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const checkboxRef = useRef<HTMLLabelElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)

  const planData = PLANS[plan]
  const price = paymentType === 'monthly' ? planData.priceMonthly : planData.priceAnnual
  const canProceed = acceptedTerms && acceptedPrivacy && scrolledToBottom

  // -----------------------------------------------------------------------
  // Scroll tracking (read sub-step)
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (subStep !== 'read') return
    const el = scrollRef.current
    if (!el) return

    const handleScroll = () => {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (isNearBottom) setScrolledToBottom(true)
    }

    el.addEventListener('scroll', handleScroll)
    handleScroll() // check initial (short content)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [subStep])

  // -----------------------------------------------------------------------
  // Signature pad setup
  // -----------------------------------------------------------------------

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

  // Retry setup with delays
  useEffect(() => {
    if (subStep !== 'sign') {
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
        toast.error('Erro ao carregar area de assinatura. Tente recarregar a pagina.')
      }
    }

    timeoutId = setTimeout(trySetup, attempts[0])
    return () => clearTimeout(timeoutId)
  }, [subStep, setupCanvas])

  // Handle resize
  useEffect(() => {
    if (subStep !== 'sign') return

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
  }, [subStep, setupCanvas])

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const clearSignature = useCallback(() => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear()
    }
    setupCanvas()
  }, [setupCanvas])

  function confirmSignature() {
    if (!signaturePadRef.current) {
      toast.error('Area de assinatura nao carregada')
      return
    }
    if (signaturePadRef.current.isEmpty()) {
      toast.error('Desenhe sua assinatura')
      return
    }
    setSignatureImage(signaturePadRef.current.toDataURL('image/png'))
    setSubStep('confirm')
  }

  function handleDisabledContinueClick() {
    if (canProceed) return
    if (!scrolledToBottom) {
      const el = scrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      toast.error('Role ate o final do contrato', { id: 'scroll-hint' })
      return
    }
    checkboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    toast.error('Aceite os termos e a politica de privacidade para continuar', { id: 'accept-terms' })
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
          new Promise<string>((_, reject) => setTimeout(() => reject('timeout'), 3000)),
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
        pdfBytes = await Promise.race([
          generateContractPDF({ ...contractData, signedAt }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Tempo esgotado')), 15000)),
        ])
      } catch (pdfError) {
        logger.error('PDF generation failed:', pdfError)
        toast.error('Erro ao gerar PDF do contrato. Tente novamente.', {
          id: 'contract',
          duration: 8000,
        })
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
        toast.error('Erro ao salvar contrato. Verifique sua conexao e tente novamente.', {
          id: 'contract',
          duration: 8000,
        })
        setLoading(false)
        return
      }

      setPdfUrl(url)
      contractData.pdfUrl = url

      // Send email (non-blocking)
      sendContractEmail(
        memberEmail, memberName, planData.name, signedAt, documentHash, pdfToBase64(pdfBytes),
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
    if (!signatureImage) {
      toast.error('Assine o contrato antes de baixar o PDF.')
      return
    }
    try {
      toast.loading('Gerando PDF...', { id: 'pdf' })
      const ipAddress = await getClientIP().catch(() => 'N/A')
      const signedAt = new Date().toISOString()
      const documentHash = await generateContractHash({
        memberId, memberName, memberCPF, memberEmail, plan, signedAt, ipAddress,
      }).catch(() => `${Date.now()}`)

      let pdfBytes: Uint8Array
      try {
        pdfBytes = await generateContractPDF({
          memberId, memberName, memberCPF, memberEmail, memberPhone,
          plan, paymentType, signatureImage, signedAt, ipAddress,
          userAgent: getUserAgent(), documentHash,
        })
      } catch (pdfError) {
        logger.error('PDF generation failed in download:', pdfError)
        toast.error('Nao foi possivel gerar o PDF. Tente novamente.', { id: 'pdf', duration: 5000 })
        return
      }

      try {
        downloadPDF(pdfBytes, `contrato_${memberName.replace(/\s+/g, '_')}.pdf`)
        toast.success('PDF baixado!', { id: 'pdf' })
      } catch (dlError) {
        logger.error('PDF download failed:', dlError)
        toast.error('Erro ao baixar o arquivo. Tente usar outro navegador.', {
          id: 'pdf',
          duration: 8000,
        })
      }
    } catch (error) {
      logger.error('Unexpected error in handleDownload:', error)
      toast.error('Erro inesperado ao gerar PDF. Tente novamente.', { id: 'pdf', duration: 5000 })
    }
  }

  // -----------------------------------------------------------------------
  // Sub-step progress index (0-based for the bar segments)
  // -----------------------------------------------------------------------

  const subStepIndex = subStep === 'read' ? 0 : subStep === 'sign' ? 1 : 2

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full max-w-2xl mx-auto space-y-6"
    >
      {/* Sub-step progress bar */}
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i <= subStepIndex ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* SUB-STEP: READ                                                     */}
      {/* ----------------------------------------------------------------- */}
      {subStep === 'read' && (
        <Card className="border-border/60">
          <CardContent className="p-0">
            {/* Header */}
            <div className="p-4 sm:p-6 pb-0 text-center space-y-2">
              <img src="/logo-vip.png" alt="Clube Geek & Toys VIP" className="w-36 mx-auto mb-2" />
              <h3 className="font-bold text-primary text-lg">{CONTRACT_TITLE}</h3>
              <p className="text-xs text-muted-foreground">{CONTRACT_SUBTITLE}</p>
            </div>

            {/* Member data summary */}
            <div className="mx-4 sm:mx-6 mt-4 bg-muted/50 rounded-lg p-3 text-sm">
              <p className="font-semibold mb-1">Seus Dados:</p>
              <p>{memberName} &bull; CPF: {memberCPF}</p>
              <p className="break-all">{memberEmail}</p>
              <p>{memberPhone}</p>
              <p className="mt-2 pt-2 border-t">
                <span className="text-muted-foreground">Plano:</span>{' '}
                <Badge variant={plan}>{planData.name}</Badge>{' '}
                ({paymentType === 'monthly' ? 'Mensal' : 'Anual'}) -{' '}
                <strong>{formatCurrency(price)}</strong>
              </p>
            </div>

            {/* Scrollable contract text */}
            <div
              ref={scrollRef}
              className="max-h-[50vh] overflow-y-auto overscroll-contain mx-4 sm:mx-6 mt-4 pr-2"
            >
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
              <div className="space-y-3 pb-4">
                <label
                  ref={checkboxRef}
                  className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    acceptedTerms
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-5 w-5 accent-primary cursor-pointer shrink-0"
                  />
                  <span className="text-sm font-medium">
                    Li e concordo com todos os termos do regulamento acima
                  </span>
                </label>

                <label
                  className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    acceptedPrivacy
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={acceptedPrivacy}
                    onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                    className="mt-0.5 h-5 w-5 accent-primary cursor-pointer shrink-0"
                  />
                  <span className="text-sm font-medium">
                    Aceito a{' '}
                    <a href="/privacidade" target="_blank" className="text-primary underline">
                      Politica de Privacidade
                    </a>{' '}
                    e autorizo o tratamento dos meus dados conforme a LGPD
                  </span>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-6 pt-4 border-t space-y-2">
              {!scrolledToBottom && !canProceed && (
                <button
                  onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
                  className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  <ChevronDown className="h-4 w-4 animate-bounce" />
                  Role ate o final para aceitar os termos
                </button>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="h-12" onClick={onBack}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Voltar
                </Button>
                <div className="flex-1" onClick={!canProceed ? handleDisabledContinueClick : undefined}>
                  <Button
                    className="w-full h-12 text-base font-semibold"
                    disabled={!canProceed}
                    onClick={() => setSubStep('sign')}
                  >
                    Continuar para Assinatura
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* SUB-STEP: SIGN                                                     */}
      {/* ----------------------------------------------------------------- */}
      {subStep === 'sign' && (
        <Card className="border-border/60">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="text-center">
              <h3 className="font-bold text-lg">Desenhe sua Assinatura</h3>
              <p className="text-sm text-muted-foreground">Use o mouse ou toque na tela</p>
            </div>

            {/* Legal notice */}
            <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-200">
              <Shield className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />
              <p>
                Para validade juridica (Lei 14.063/2020), serao registrados: seu endereco IP,
                informacoes do dispositivo, data/hora e um hash SHA-256 do documento.
              </p>
            </div>

            {/* Canvas container */}
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
                Carregando area de assinatura...
              </div>
            )}

            {canvasError && (
              <div className="text-center p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-2">
                  Erro ao carregar area de assinatura
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
              Assinatura com validade juridica conforme Lei 14.063/2020
            </p>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 sm:flex-none h-11" onClick={() => setSubStep('read')}>
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
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* SUB-STEP: CONFIRM                                                  */}
      {/* ----------------------------------------------------------------- */}
      {subStep === 'confirm' && (
        <Card className="border-border/60">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="text-center">
              <div className="h-14 w-14 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                <Check className="h-7 w-7 text-green-500" />
              </div>
              <h3 className="font-bold text-lg">Revise e Finalize</h3>
              <p className="text-sm text-muted-foreground">Confirme os dados abaixo</p>
            </div>

            {/* Signature preview */}
            {signatureImage && (
              <div className="bg-white border-2 border-border rounded-lg p-4">
                <p className="text-xs text-center text-muted-foreground mb-2">Sua assinatura:</p>
                <img src={signatureImage} alt="Assinatura" className="max-h-16 mx-auto" />
              </div>
            )}

            {/* Summary */}
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
              Documento com validade juridica conforme Lei 14.063/2020
            </p>

            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-primary text-sm hover:underline"
              >
                <Download className="h-4 w-4" /> Baixar contrato assinado
              </a>
            )}

            {/* Footer */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 sm:flex-none h-11" onClick={() => setSubStep('sign')} disabled={loading}>
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
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
