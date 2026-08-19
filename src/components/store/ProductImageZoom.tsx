import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Minus, Plus, X, ZoomIn } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Full-screen viewer for the product photos.
 *
 * Buying a photocard or a figure is a decision made on detail — the print, the
 * seams, the state of the box — and a 500px thumbnail hides exactly that. The
 * viewer is deliberately its own layer instead of a bigger inline image: it can
 * use the whole screen, and panning a zoomed photo must not fight the page
 * scroll.
 *
 * Zoom is driven by pointer events rather than touch/mouse handlers so a
 * trackpad drag, a finger drag and a stylus all reach the same code path; pinch
 * needs two pointers, which is the one case handled separately.
 */

const MIN_SCALE = 1
const MAX_SCALE = 4
const STEP = 0.5

interface Props {
  images: string[]
  index: number
  alt: string
  onIndexChange: (index: number) => void
  onClose: () => void
}

export function ProductImageViewer({ images, index, alt, onIndexChange, onClose }: Props) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  /**
   * A gesture in progress. It is state and not a ref because the transition has
   * to be off while the finger moves — animating each pointermove turns a drag
   * into a lag — and the render needs to know.
   */
  const [gesturing, setGesturing] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null)
  const dragStart = useRef<{ x: number; y: number; offX: number; offY: number } | null>(null)

  const reset = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  // A new photo starts untouched: keeping the previous pan would open the next
  // image already scrolled to a corner of nothing. Derived from the index
  // during render instead of in an effect, so the new photo never paints once
  // with the previous zoom before snapping back.
  const [zoomedIndex, setZoomedIndex] = useState(index)
  if (zoomedIndex !== index) {
    setZoomedIndex(index)
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const step = useCallback(
    (delta: number) => {
      if (images.length < 2) return
      onIndexChange((index + delta + images.length) % images.length)
    },
    [images.length, index, onIndexChange]
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === '+' || e.key === '=') setScale((s) => Math.min(MAX_SCALE, s + STEP))
      else if (e.key === '-') setScale((s) => Math.max(MIN_SCALE, s - STEP))
    }
    window.addEventListener('keydown', onKey)
    // The page behind must not scroll while the viewer owns the screen.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, step])

  // Panning is only possible once the image is bigger than its frame; at 1x the
  // same drag is a swipe between photos.
  const zoomed = scale > 1

  function clampOffset(next: { x: number; y: number }, atScale: number) {
    // How far the scaled image may travel before its edge enters the frame.
    const limit = ((atScale - 1) / 2) * 100
    return {
      x: Math.max(-limit, Math.min(limit, next.x)),
      y: Math.max(-limit, Math.min(limit, next.y)),
    }
  }

  function applyScale(next: number) {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next))
    setScale(clamped)
    setOffset((current) => clampOffset(current, clamped))
    return clamped
  }

  function distanceBetweenPointers() {
    const [a, b] = [...pointers.current.values()]
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function handlePointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setGesturing(true)
    if (pointers.current.size === 2) {
      pinchStart.current = { distance: distanceBetweenPointers(), scale }
      dragStart.current = null
    } else if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, offX: offset.x, offY: offset.y }
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2 && pinchStart.current) {
      const distance = distanceBetweenPointers()
      if (pinchStart.current.distance > 0) {
        applyScale(pinchStart.current.scale * (distance / pinchStart.current.distance))
      }
      return
    }

    if (!zoomed || !dragStart.current) return
    // Offsets are in percent of the frame so they stay right whatever the
    // rendered size is — phone, tablet or a wide desktop window.
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dx = ((e.clientX - dragStart.current.x) / rect.width) * 100
    const dy = ((e.clientY - dragStart.current.y) / rect.height) * 100
    setOffset(clampOffset({ x: dragStart.current.offX + dx, y: dragStart.current.offY + dy }, scale))
  }

  function handlePointerUp(e: React.PointerEvent) {
    const start = dragStart.current
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
    if (pointers.current.size === 0) {
      dragStart.current = null
      setGesturing(false)
    }

    // At 1x a horizontal drag flips to the next photo, the same gesture the
    // inline gallery uses. 40px is the threshold that tells it from a tap.
    if (!zoomed && start) {
      const dx = e.clientX - start.x
      if (Math.abs(dx) >= 40) step(dx < 0 ? 1 : -1)
    }
  }

  const body = (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={`Fotos de ${alt}`}
    >
      <div className="flex items-center justify-between gap-2 p-3 text-white">
        <span className="text-sm tabular-nums text-white/70">
          {images.length > 1 ? `${index + 1} / ${images.length}` : ''}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => applyScale(scale - STEP)}
            disabled={scale <= MIN_SCALE}
            aria-label="Diminuir zoom"
            className="rounded-full p-2 transition-colors hover:bg-white/10 disabled:opacity-30"
          >
            <Minus className="h-5 w-5" />
          </button>
          <span className="w-12 text-center text-sm tabular-nums">{scale.toFixed(1)}x</span>
          <button
            type="button"
            onClick={() => applyScale(scale + STEP)}
            disabled={scale >= MAX_SCALE}
            aria-label="Aumentar zoom"
            className="rounded-full p-2 transition-colors hover:bg-white/10 disabled:opacity-30"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="ml-1 rounded-full p-2 transition-colors hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 overflow-hidden"
        // touch-none: the browser's own pan/zoom would compete with ours and
        // the image would jump between the two.
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => (zoomed ? reset() : applyScale(2))}
      >
        <img
          src={images[index]}
          alt={alt}
          draggable={false}
          className={cn(
            'h-full w-full select-none object-contain',
            zoomed ? 'cursor-grab' : 'cursor-zoom-in'
          )}
          style={{
            transform: `translate(${offset.x}%, ${offset.y}%) scale(${scale})`,
            transition: gesturing ? 'none' : 'transform 150ms ease-out',
          }}
        />

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Próxima foto"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      <p className="pb-4 text-center text-xs text-white/50">
        Toque duas vezes ou use a pinça para ampliar
      </p>
    </div>
  )

  // A portal keeps the viewer out of the gallery's stacking context, where the
  // sticky header and the cart drawer would otherwise draw on top of it.
  return typeof document === 'undefined' ? body : createPortal(body, document.body)
}

/**
 * Desktop magnifier: the pointer position becomes the zoom origin, so moving
 * across the photo reads like a lens sliding over it. Hidden on touch, where
 * hovering does not exist and the full-screen viewer does the job.
 */
export function HoverZoom({
  src,
  alt,
  className,
  scale = 2.2,
}: {
  src: string
  alt: string
  className?: string
  scale?: number
}) {
  const [origin, setOrigin] = useState<string | null>(null)

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        setOrigin(`${x}% ${y}%`)
      }}
      onMouseLeave={() => setOrigin(null)}
      className={cn('h-full w-full object-contain', className)}
      style={{
        transformOrigin: origin ?? 'center',
        transform: origin ? `scale(${scale})` : 'scale(1)',
        transition: origin ? 'transform 120ms ease-out' : 'transform 200ms ease-out',
      }}
    />
  )
}

/** The affordance itself — without it nobody discovers the zoom. */
export function ZoomHint({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-xs font-medium text-white',
        className
      )}
    >
      <ZoomIn className="h-3.5 w-3.5" />
      Ampliar
    </span>
  )
}
