import { X } from 'lucide-react'
import { GiftShape, HollyShape, SnowflakeShape, StarShape } from './art'
import './natal.css'

export type NatalBannerVariant = 'shop' | 'club-visitor' | 'club-member'

// PT-BR, no price and no promotion: the strip greets, it does not sell.
const COPY: Record<NatalBannerVariant, { title: string; line: string }> = {
  shop: { title: 'Feliz Natal geek! 🎄', line: 'Presentes de K-pop, anime e colecionáveis' },
  'club-visitor': { title: 'Boas festas do Clube GeekPop! 🎄', line: 'Que o seu fim de ano seja bem geek' },
  'club-member': { title: 'Boas festas, membro GeekPop! 🎄', line: 'Obrigado por fazer parte do clube' },
}

export default function NatalBanner({
  variant,
  onClose,
}: {
  variant: NatalBannerVariant
  onClose: () => void
}) {
  const copy = COPY[variant]
  return (
    <div role="region" aria-label="Boas festas" className="natal-banner relative h-12 overflow-hidden sm:h-9">
      {/* Art only in the side gutters, never under the text. */}
      <svg viewBox="0 0 32 24" className="natal-banner-holly" aria-hidden="true">
        <HollyShape />
      </svg>
      <svg viewBox="0 0 24 24" className="natal-banner-flake natal-banner-flake-a" aria-hidden="true">
        <SnowflakeShape />
      </svg>
      <div className="mx-auto flex h-full max-w-6xl flex-col items-center justify-center px-11 text-center leading-tight sm:flex-row sm:gap-2 sm:px-24">
        <p className="natal-banner-title flex items-center gap-1.5 font-heading text-[13px] font-bold">
          <svg viewBox="0 0 24 24" className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden="true">
            <StarShape />
          </svg>
          {copy.title}
        </p>
        <p className="text-xs font-medium text-white sm:text-[13px]">{copy.line}</p>
      </div>
      <svg viewBox="0 0 24 24" className="natal-banner-gift" aria-hidden="true">
        <GiftShape />
      </svg>
      <svg viewBox="0 0 24 24" className="natal-banner-flake natal-banner-flake-b" aria-hidden="true">
        <SnowflakeShape />
      </svg>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar faixa de Natal"
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white sm:h-9 sm:w-9"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
