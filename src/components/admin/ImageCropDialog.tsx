import { useEffect, useMemo, useRef, useState } from 'react'
import { Crop, Check, RotateCcw, RotateCw } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Loading } from '../ui/loading'
import { cn } from '../../lib/utils'
import {
  clampCoverPan,
  computeCoverCrop,
  cropProductImage,
  normalizeRotation,
  rotateProductImage,
  rotatedImageSize,
  sizeFromLongestSide,
  type ImageCropRect,
  type ImageRotation,
} from '../../lib/product-image'

const ASPECT_PRESETS = [
  { id: '1:1', label: 'Quadrado', ratio: 1 },
  { id: '2:3', label: 'Photocard', ratio: 2 / 3 },
  { id: '3:4', label: 'Retrato', ratio: 3 / 4 },
  { id: '4:3', label: 'Paisagem', ratio: 4 / 3 },
  { id: 'livre', label: 'Livre', ratio: null },
] as const

type AspectId = (typeof ASPECT_PRESETS)[number]['id']

const SIZE_PRESETS = [800, 1200, 1600] as const
const FRAME_MAX = 320
const MIN_OUTPUT = 200
const MAX_OUTPUT = 2560

interface ImageCropDialogProps {
  files: File[]
  onComplete: (files: File[]) => void
  onCancel: () => void
}

function frameBox(ratio: number): { width: number; height: number } {
  if (ratio >= 1) {
    return { width: FRAME_MAX, height: Math.max(140, Math.round(FRAME_MAX / ratio)) }
  }
  return { width: Math.max(140, Math.round(FRAME_MAX * ratio)), height: FRAME_MAX }
}

/**
 * Interactive crop (zoom and drag) with a fixed ratio and pixel output size.
 * Works through a queue when several photos are selected.
 */
export function ImageCropDialog({ files, onComplete, onCancel }: ImageCropDialogProps) {
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState<File[]>([])
  const [applying, setApplying] = useState(false)

  const file = files[index]
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])

  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [aspectId, setAspectId] = useState<AspectId>('1:1')
  const [rotation, setRotation] = useState<ImageRotation>(0)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  // A number, not a string: the UI compares `sizeMode` against the numeric
  // SIZE_PRESETS and `outputSpec()` forwards it as `longestSide`. As a string
  // the default chip opened unselected and the
  // resize maths received text. It only surfaced once `tsc -b` ran again.
  const [sizeMode, setSizeMode] = useState<'auto' | 800 | 1200 | 1600 | 'custom'>(1200)
  const [customW, setCustomW] = useState('1200')
  const [customH, setCustomH] = useState('1200')

  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    setNatural({ width: 0, height: 0 })
    setRotation(0)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setAspectId('1:1')
    setSizeMode(1200)
    setCustomW('1200')
    setCustomH('1200')
  }, [file])

  // Everything downstream measures the *rotated* image: a quarter turn swaps
  // width and height, so the frame, the pan clamp and the crop rect all follow.
  const naturalRot = useMemo(
    () => rotatedImageSize(natural.width, natural.height, rotation),
    [natural, rotation]
  )

  const preset = ASPECT_PRESETS.find((p) => p.id === aspectId) ?? ASPECT_PRESETS[0]
  const ratio =
    preset.ratio ??
    (naturalRot.width > 0 && naturalRot.height > 0 ? naturalRot.width / naturalRot.height : 1)
  const frame = frameBox(ratio)

  const clampedPan = useMemo(() => {
    // Same shape on both paths: consumers read `panX`/`panY`. Returning a raw
    // `pan` ({x,y}) left `left`/`top` as NaN while the image had no
    // carregado.
    if (!naturalRot.width) return { panX: pan.x, panY: pan.y }
    return clampCoverPan(
      naturalRot.width,
      naturalRot.height,
      frame.width,
      frame.height,
      zoom,
      pan.x,
      pan.y
    )
  }, [naturalRot, frame.width, frame.height, zoom, pan])

  const display = useMemo(() => {
    if (!naturalRot.width) {
      return {
        width: frame.width,
        height: frame.height,
        left: 0,
        top: 0,
        imgWidth: frame.width,
        imgHeight: frame.height,
      }
    }
    const cover = Math.max(frame.width / naturalRot.width, frame.height / naturalRot.height)
    const scale = cover * zoom
    const width = naturalRot.width * scale
    const height = naturalRot.height * scale
    return {
      width,
      height,
      left: (frame.width - width) / 2 + clampedPan.panX,
      top: (frame.height - height) / 2 + clampedPan.panY,
      // The <img> keeps its own orientation and is rotated by CSS inside a box
      // that already has the rotated size, so the two always line up.
      imgWidth: natural.width * scale,
      imgHeight: natural.height * scale,
    }
  }, [natural, naturalRot, frame, zoom, clampedPan])

  function cropRect(): ImageCropRect | null {
    if (!naturalRot.width) return null
    return computeCoverCrop({
      imageWidth: naturalRot.width,
      imageHeight: naturalRot.height,
      frameWidth: frame.width,
      frameHeight: frame.height,
      zoom,
      panX: clampedPan.panX,
      panY: clampedPan.panY,
    })
  }

  function outputSpec(): { width?: number; height?: number; longestSide?: number } | undefined {
    if (sizeMode === 'auto') return undefined
    if (sizeMode !== 'custom') return { longestSide: sizeMode }
    const w = Number(customW)
    const h = Number(customH)
    if (!Number.isFinite(w) || !Number.isFinite(h)) return { longestSide: 1200 }
    return {
      width: Math.min(MAX_OUTPUT, Math.max(MIN_OUTPUT, Math.round(w))),
      height: Math.min(MAX_OUTPUT, Math.max(MIN_OUTPUT, Math.round(h))),
    }
  }

  const cropPreview = cropRect()
  const outputPreview = outputSpec()
  const previewSize = !cropPreview
    ? { width: 0, height: 0 }
    : outputPreview?.longestSide
      ? sizeFromLongestSide(cropPreview.width, cropPreview.height, outputPreview.longestSide)
      : outputPreview?.width && outputPreview.height
        ? { width: outputPreview.width, height: outputPreview.height }
        : { width: Math.round(cropPreview.width), height: Math.round(cropPreview.height) }

  function pushNext(nextFile: File) {
    const nextDone = [...done, nextFile]
    if (index + 1 >= files.length) {
      onComplete(nextDone)
      return
    }
    setDone(nextDone)
    setIndex((i) => i + 1)
  }

  async function applyCrop() {
    if (!file) return
    const crop = cropRect()
    if (!crop) {
      pushNext(file)
      return
    }
    setApplying(true)
    try {
      const cropped = await cropProductImage(file, crop, outputSpec(), rotation)
      pushNext(cropped ?? file)
    } finally {
      setApplying(false)
    }
  }

  /** Skips the crop but still bakes in the rotation the staff just picked. */
  async function skipCrop() {
    if (!file) return
    if (rotation === 0) {
      pushNext(file)
      return
    }
    setApplying(true)
    try {
      const rotated = await rotateProductImage(file, rotation)
      pushNext(rotated ?? file)
    } finally {
      setApplying(false)
    }
  }

  function rotateBy(delta: number) {
    setRotation((r) => normalizeRotation(r + delta))
    setPan({ x: 0, y: 0 })
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, panX: clampedPan.panX, panY: clampedPan.panY }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    setPan({
      x: drag.panX + (e.clientX - drag.x),
      y: drag.panY + (e.clientY - drag.y),
    })
  }

  function onPointerUp() {
    dragRef.current = null
    setPan({ x: clampedPan.panX, y: clampedPan.panY })
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setZoom((z) => Math.min(4, Math.max(1, Math.round((z + delta) * 10) / 10)))
  }

  function setAspect(id: AspectId) {
    setAspectId(id)
    setPan({ x: 0, y: 0 })
    const next = ASPECT_PRESETS.find((p) => p.id === id)
    if (next?.ratio && sizeMode === 'custom') {
      const w = Number(customW) || 1200
      setCustomH(String(Math.round(w / next.ratio)))
    }
  }

  if (!file) return null

  return (
    <div
      className="modal-overlay z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-crop-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card p-4 shadow-lg sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="image-crop-title" className="flex items-center gap-2 font-heading text-lg font-semibold">
              <Crop className="h-5 w-5 text-primary" />
              Cortar imagem
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {files.length > 1 ? `Foto ${index + 1} de ${files.length} · ` : ''}
              arraste para enquadrar · gire, escolha a proporção e o tamanho em pixels
            </p>
          </div>
        </div>

        <div className="flex justify-center rounded-lg bg-black/80 p-3">
          <div
            className="relative overflow-hidden rounded-md border border-white/20 bg-black touch-none"
            style={{ width: frame.width, height: frame.height, cursor: 'grab' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {previewUrl ? (
              <div
                className="absolute"
                style={{
                  width: display.width,
                  height: display.height,
                  left: display.left,
                  top: display.top,
                }}
              >
                <img
                  src={previewUrl}
                  alt=""
                  draggable={false}
                  className="absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: display.imgWidth,
                    height: display.imgHeight,
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                  }}
                  onLoad={(e) => {
                    const img = e.currentTarget
                    setNatural({
                      width: img.naturalWidth || img.width,
                      height: img.naturalHeight || img.height,
                    })
                  }}
                />
              </div>
            ) : (
              <Loading />
            )}
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Rotação</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => rotateBy(-90)}
                disabled={applying}
              >
                <RotateCcw className="h-4 w-4" />
                Girar à esquerda
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => rotateBy(90)}
                disabled={applying}
              >
                <RotateCw className="h-4 w-4" />
                Girar à direita
              </Button>
              <span className="text-xs text-muted-foreground">{rotation}°</span>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Proporção</p>
            <div className="flex flex-wrap gap-1.5">
              {ASPECT_PRESETS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAspect(opt.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    aspectId === opt.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background hover:bg-accent'
                  )}
                >
                  {opt.label} {opt.id !== 'livre' ? opt.id : ''}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="crop-zoom" className="text-xs text-muted-foreground">
              Zoom {zoom.toFixed(1)}×
            </Label>
            <input
              id="crop-zoom"
              type="range"
              min={1}
              max={4}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1 w-full accent-primary"
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tamanho de saída</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSizeMode('auto')}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium',
                  sizeMode === 'auto'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-accent'
                )}
              >
                Recorte original
              </button>
              {SIZE_PRESETS.map((px) => (
                <button
                  key={px}
                  type="button"
                  onClick={() => setSizeMode(px)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium',
                    sizeMode === px
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background hover:bg-accent'
                  )}
                >
                  {px} px
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSizeMode('custom')}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium',
                  sizeMode === 'custom'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-accent'
                )}
              >
                Personalizado
              </button>
            </div>
            {sizeMode === 'custom' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="crop-w" className="text-xs">
                    Largura (px)
                  </Label>
                  <Input
                    id="crop-w"
                    type="number"
                    min={MIN_OUTPUT}
                    max={MAX_OUTPUT}
                    value={customW}
                    onChange={(e) => {
                      const w = e.target.value
                      setCustomW(w)
                      const n = Number(w)
                      if (Number.isFinite(n) && n > 0) {
                        setCustomH(String(Math.round(n / ratio)))
                      }
                    }}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="crop-h" className="text-xs">
                    Altura (px)
                  </Label>
                  <Input
                    id="crop-h"
                    type="number"
                    min={MIN_OUTPUT}
                    max={MAX_OUTPUT}
                    value={customH}
                    onChange={(e) => {
                      const h = e.target.value
                      setCustomH(h)
                      const n = Number(h)
                      if (Number.isFinite(n) && n > 0) {
                        setCustomW(String(Math.round(n * ratio)))
                      }
                    }}
                    className="h-9"
                  />
                </div>
              </div>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              Vai salvar em {previewSize.width} × {previewSize.height} px
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={applying}>
            Cancelar
          </Button>
          <Button type="button" variant="outline" onClick={() => void skipCrop()} disabled={applying}>
            {rotation === 0 ? 'Usar sem cortar' : 'Girar sem cortar'}
          </Button>
          <Button type="button" onClick={() => void applyCrop()} disabled={applying || !naturalRot.width}>
            {applying ? <Loading size="sm" /> : <Check className="h-4 w-4" />}
            Aplicar recorte
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ImageCropDialog
