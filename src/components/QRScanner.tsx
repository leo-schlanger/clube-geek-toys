import { useEffect, useRef, useState, useCallback } from 'react'
import jsQR from 'jsqr'
import { logger } from '../lib/logger'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Camera, CameraOff, RefreshCw, Flashlight } from 'lucide-react'

interface QRScannerProps {
  onScan: (data: string) => void
  onClose: () => void
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasCamera, setHasCamera] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const streamRef = useRef<MediaStream | null>(null)
  const animationRef = useRef<number | null>(null)
  const lastScanRef = useRef<string>('')

  /**
   * Stop camera and cleanup resources
   */
  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsScanning(false)
  }, [])

  /**
   * Start QR code scanning loop
   */
  const startScanning = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    function scan() {
      if (!video || !canvas || !ctx) return

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        })

        if (code && code.data) {
          // Avoid duplicate readings
          if (code.data !== lastScanRef.current) {
            lastScanRef.current = code.data

            // Draw green border around detected QR code
            ctx.beginPath()
            ctx.moveTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y)
            ctx.lineTo(code.location.topRightCorner.x, code.location.topRightCorner.y)
            ctx.lineTo(code.location.bottomRightCorner.x, code.location.bottomRightCorner.y)
            ctx.lineTo(code.location.bottomLeftCorner.x, code.location.bottomLeftCorner.y)
            ctx.lineTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y)
            ctx.lineWidth = 4
            ctx.strokeStyle = '#22c55e'
            ctx.stroke()

            // Vibrate if supported
            if (navigator.vibrate) {
              navigator.vibrate(200)
            }

            // Stop scanner and send result
            stopCamera()
            onScan(code.data)
            return
          }
        }
      }

      animationRef.current = requestAnimationFrame(scan)
    }

    scan()
  }, [onScan, stopCamera])

  /**
   * Initialize and start camera
   */
  const startCamera = useCallback(async () => {
    setError(null)
    setIsScanning(false)
    lastScanRef.current = ''

    try {
      // Stop previous camera if exists
      stopCamera()

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play()
          setIsScanning(true)
          startScanning()
        }
      }

      setHasCamera(true)
    } catch (err) {
      logger.error('Error accessing camera:', err)
      setHasCamera(false)

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Permissão da câmera negada. Verifique as configurações do navegador.')
        } else if (err.name === 'NotFoundError') {
          setError('Nenhuma câmera encontrada no dispositivo.')
        } else if (err.name === 'NotReadableError') {
          setError('Câmera está sendo usada por outro aplicativo.')
        } else {
          setError('Não foi possível acessar a câmera.')
        }
      }
    }
  }, [facingMode, startScanning, stopCamera])

  // Start camera on mount (using queueMicrotask to avoid synchronous setState)
  useEffect(() => {
    queueMicrotask(() => startCamera())

    return () => {
      stopCamera()
    }
  }, [startCamera, stopCamera])

  /**
   * Toggle between front and back camera
   */
  function toggleCamera() {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }

  // Restart camera when facingMode changes (using queueMicrotask to avoid synchronous setState)
  useEffect(() => {
    if (hasCamera) {
      queueMicrotask(() => startCamera())
    }
  }, [facingMode, hasCamera, startCamera])

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Scanner de QR Code
        </CardTitle>
        <CardDescription>
          Aponte a câmera para o QR Code da carteirinha do cliente
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Video area */}
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
          {hasCamera ? (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              <canvas
                ref={canvasRef}
                className="hidden"
              />

              {/* Scanner overlay */}
              {isScanning && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-56 h-56 relative">
                    {/* Scanner corners */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />

                    {/* Animated scan line */}
                    <div
                      className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan"
                    />
                  </div>
                </div>
              )}

              {/* Toggle camera button */}
              <button
                onClick={toggleCamera}
                className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
              >
                <Flashlight className="h-5 w-5" />
              </button>

              {/* Status */}
              {isScanning && (
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <span className="px-4 py-2 bg-black/60 backdrop-blur-sm rounded-full text-white text-sm">
                    Procurando QR Code...
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4">
              <CameraOff className="h-16 w-16 opacity-50" />
              <p className="text-center px-4 text-sm">{error || 'Câmera não disponível'}</p>
              <Button variant="secondary" onClick={startCamera}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar Novamente
              </Button>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="text-sm text-muted-foreground text-center space-y-1">
          <p>Posicione o QR Code dentro da área de leitura</p>
          <p>A leitura é automática</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
