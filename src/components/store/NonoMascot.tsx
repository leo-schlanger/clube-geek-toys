import { cn } from '../../lib/utils'

/**
 * Nono, the GeekPop tiger. Shop-only and decorative: empty states and the
 * post-purchase page, never inside the payment form.
 */
const POSES = {
  wave: {
    src: '/mascot/nono-wave.webp',
    small: '/mascot/nono-wave-160.webp',
    smallWidth: 160,
    width: 320,
    height: 332,
    alt: 'Nono, o tigre da GeekPop, acenando',
  },
  heart: {
    src: '/mascot/nono-heart.webp',
    small: '/mascot/nono-heart-144.webp',
    smallWidth: 144,
    width: 288,
    height: 290,
    alt: 'Nono, o tigre da GeekPop, abraçando um coração',
  },
} as const

export type NonoPose = keyof typeof POSES

interface NonoMascotProps {
  pose?: NonoPose
  /** Rendered width in CSS px; height follows the aspect ratio. */
  size?: number
  className?: string
}

export function NonoMascot({ pose = 'wave', size = 112, className }: NonoMascotProps) {
  const p = POSES[pose]
  return (
    <img
      src={p.src}
      srcSet={`${p.small} ${p.smallWidth}w, ${p.src} ${p.width}w`}
      sizes={`${size}px`}
      width={size}
      height={Math.round((p.height * size) / p.width)}
      alt={p.alt}
      loading="lazy"
      decoding="async"
      className={cn('h-auto select-none', className)}
      style={{ width: size }}
      draggable={false}
    />
  )
}

export default NonoMascot
