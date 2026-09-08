import { cn } from '../../lib/utils'
import { embedUrl, videoThumbnail, videoKindLabel } from '../../lib/product-video'
import type { ProductVideo } from '../../types'
import { Play } from 'lucide-react'

/**
 * A video filling the gallery frame.
 *
 * The frame is square and the videos are mostly vertical reels, so the player
 * is centred on black and left to letterbox rather than cropped — cutting a
 * reel would take the product out of the shot.
 */
export function ProductVideoSlide({
  video,
  productName,
}: {
  video: ProductVideo
  productName: string
}) {
  const embed = embedUrl(video)
  const label = video.title || `Vídeo de ${productName}`

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      {embed ? (
        <iframe
          key={video.url}
          src={embed}
          title={label}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <video
          key={video.url}
          src={video.url}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
          aria-label={label}
        />
      )}
    </div>
  )
}

/**
 * Thumbnail for a video in the gallery strip.
 *
 * An uploaded file has no poster, so the first frame is pulled by loading the
 * video's metadata at `#t=0.1` — otherwise every uploaded video would show the
 * same grey placeholder and Laura could not tell them apart.
 */
export function ProductVideoThumb({ video }: { video: ProductVideo }) {
  const thumb = videoThumbnail(video)

  return (
    <span className="relative flex h-full w-full items-center justify-center bg-muted">
      {thumb ? (
        <img src={thumb} alt="" className="h-full w-full object-cover" />
      ) : video.kind === 'file' ? (
        <video
          src={`${video.url}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
          tabIndex={-1}
        />
      ) : (
        <span className="text-[10px] text-muted-foreground">{videoKindLabel(video.kind)}</span>
      )}
      <Play className={cn('absolute h-5 w-5 text-white drop-shadow')} />
    </span>
  )
}
