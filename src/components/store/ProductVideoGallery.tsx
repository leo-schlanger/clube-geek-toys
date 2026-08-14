import { useState } from 'react'
import { cn } from '../../lib/utils'
import { embedUrl, videoThumbnail, videoKindLabel } from '../../lib/product-video'
import type { ProductVideo } from '../../types'
import { Play } from 'lucide-react'

interface ProductVideoGalleryProps {
  videos: ProductVideo[]
  productName: string
}

/**
 * Vídeos do produto abaixo da galeria de fotos. Fica separado das imagens de
 * propósito: o índice da galeria já governa a troca de foto por variação, e
 * misturar vídeo ali quebraria essa correspondência.
 */
export function ProductVideoGallery({ videos, productName }: ProductVideoGalleryProps) {
  const [active, setActive] = useState(0)
  if (videos.length === 0) return null

  const current = videos[Math.min(active, videos.length - 1)]
  const embed = embedUrl(current)

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {videos.length === 1 ? 'Vídeo do produto' : `Vídeos (${videos.length})`}
      </p>

      <div className="aspect-video overflow-hidden rounded-xl border bg-black">
        {embed ? (
          <iframe
            key={current.url}
            src={embed}
            title={current.title || `Vídeo de ${productName}`}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <video
            key={current.url}
            src={current.url}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full"
            aria-label={current.title || `Vídeo de ${productName}`}
          />
        )}
      </div>

      {videos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {videos.map((video, i) => {
            const thumb = videoThumbnail(video)
            return (
              <button
                key={video.url}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Vídeo ${i + 1} — ${videoKindLabel(video.kind)}`}
                className={cn(
                  'relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 bg-muted transition-colors',
                  active === i ? 'border-primary' : 'border-transparent'
                )}
              >
                {thumb ? (
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {videoKindLabel(video.kind)}
                  </span>
                )}
                <Play className="absolute h-5 w-5 text-white drop-shadow" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
