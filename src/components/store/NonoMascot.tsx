import { cn } from '../../lib/utils'

/**
 * Nono, the GeekPop tiger. Decorative, one per screen. Shop: empty states,
 * the post-purchase page and the club call in the home hero. Club: /assinar, welcome, the card and the empty
 * member state. Never in sign-up, card or PIX forms, login, admin or PDV.
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
  standing: {
    src: '/mascot/nono-standing.webp',
    small: '/mascot/nono-standing-160.webp',
    smallWidth: 160,
    width: 320,
    height: 394,
    alt: 'Nono, o tigre da GeekPop, de pé',
  },
  glasses: {
    src: '/mascot/nono-glasses.webp',
    small: '/mascot/nono-glasses-160.webp',
    smallWidth: 160,
    width: 320,
    height: 281,
    alt: 'Nono, o tigre da GeekPop, de óculos',
  },
} as const

export type NonoPose = keyof typeof POSES

interface NonoMascotProps {
  pose?: NonoPose
  /** Rendered width in CSS px; height follows the aspect ratio. */
  size?: number
  className?: string
  /** Empty alt when the text beside it already says everything. */
  decorative?: boolean
  /** Above the fold: skip lazy loading. */
  eager?: boolean
}

export function NonoMascot({
  pose = 'wave',
  size = 112,
  className,
  decorative = false,
  eager = false,
}: NonoMascotProps) {
  const p = POSES[pose]
  return (
    <img
      src={p.src}
      srcSet={`${p.small} ${p.smallWidth}w, ${p.src} ${p.width}w`}
      sizes={`${size}px`}
      width={size}
      height={Math.round((p.height * size) / p.width)}
      alt={decorative ? '' : p.alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('h-auto select-none', className)}
      style={{ width: size }}
      draggable={false}
    />
  )
}

export default NonoMascot
