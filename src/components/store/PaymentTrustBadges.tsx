import { cn } from '../../lib/utils'

interface PaymentTrustBadgesProps {
  className?: string
  compact?: boolean
  /** Centraliza o bloco — usado no rodapé, onde o texto ao redor é centralizado. */
  center?: boolean
}

/**
 * Selos de pagamento + envio. As bandeiras são SVG inline: nada de arquivo
 * externo para carregar, e a marca fica nítida em qualquer densidade de tela.
 *
 * O fundo do cartão é sempre claro porque é assim que essas marcas foram feitas
 * para aparecer — num tema escuro elas sumiriam.
 */
export function PaymentTrustBadges({
  className,
  compact = false,
  center = false,
}: PaymentTrustBadgesProps) {
  return (
    <div className={cn('space-y-2', center && 'text-center', className)}>
      {!compact && (
        <p className="text-xs font-medium text-muted-foreground">Formas de pagamento</p>
      )}

      <div className={cn('flex flex-wrap items-center gap-2', center && 'justify-center')}>
        <Card label="PIX">
          <PixMark />
        </Card>
        <Card label="Visa">
          <VisaMark />
        </Card>
        <Card label="Mastercard">
          <MastercardMark />
        </Card>
        <Card label="Elo">
          <EloMark />
        </Card>
        <Card label="Stripe">
          <StripeMark />
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Pagamento seguro · Envio pelos Correios para todo o Brasil
      </p>
    </div>
  )
}

/** Moldura branca de tamanho fixo — é o que mantém a fileira alinhada. */
function Card({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <span
      className="inline-flex h-8 w-[52px] items-center justify-center rounded-md border border-black/10 bg-white shadow-sm"
      title={label}
      aria-label={label}
      role="img"
    >
      {children}
    </span>
  )
}

function PixMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden focusable="false">
      <g fill="#32BCAD">
        <path d="M16 3.6 22.6 10.2h-2.9a3.6 3.6 0 0 0-2.5 1L16 12.4l-1.2-1.2a3.6 3.6 0 0 0-2.5-1H9.4Z" />
        <path d="M16 28.4 9.4 21.8h2.9a3.6 3.6 0 0 0 2.5-1L16 19.6l1.2 1.2a3.6 3.6 0 0 0 2.5 1h2.9Z" />
        <path d="M3.6 16l6.6-6.6v2.9a3.6 3.6 0 0 0 1 2.5l1.2 1.2-1.2 1.2a3.6 3.6 0 0 0-1 2.5v2.9Z" />
        <path d="M28.4 16l-6.6 6.6v-2.9a3.6 3.6 0 0 0-1-2.5L19.6 16l1.2-1.2a3.6 3.6 0 0 0 1-2.5V9.4Z" />
      </g>
    </svg>
  )
}

function VisaMark() {
  return (
    <svg viewBox="0 0 48 16" className="h-3.5 w-11" aria-hidden focusable="false">
      <text
        x="24"
        y="13"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="15"
        fontWeight="700"
        fontStyle="italic"
        fill="#1A1F71"
        letterSpacing="0.5"
      >
        VISA
      </text>
    </svg>
  )
}

function MastercardMark() {
  return (
    <svg viewBox="0 0 40 24" className="h-5 w-8" aria-hidden focusable="false">
      <circle cx="15" cy="12" r="9" fill="#EB001B" />
      <circle cx="25" cy="12" r="9" fill="#F79E1B" />
      {/* Interseção das duas marcas — o laranja translúcido cria o tom da marca. */}
      <path
        d="M20 5.1a9 9 0 0 0 0 13.8 9 9 0 0 0 0-13.8Z"
        fill="#FF5F00"
      />
    </svg>
  )
}

function EloMark() {
  return (
    <svg viewBox="0 0 48 20" className="h-4 w-11" aria-hidden focusable="false">
      <circle cx="7" cy="6" r="3" fill="#FFCB05" />
      <circle cx="7" cy="14" r="3" fill="#EF4123" />
      <circle cx="13" cy="10" r="3" fill="#00A4E0" />
      <text
        x="32"
        y="15"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="13"
        fontWeight="700"
        fill="#231F20"
      >
        elo
      </text>
    </svg>
  )
}

function StripeMark() {
  return (
    <svg viewBox="0 0 48 16" className="h-3.5 w-11" aria-hidden focusable="false">
      <text
        x="24"
        y="12"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="12"
        fontWeight="700"
        fill="#635BFF"
      >
        stripe
      </text>
    </svg>
  )
}
