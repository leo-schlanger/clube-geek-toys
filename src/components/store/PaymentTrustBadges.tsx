import { cn } from '../../lib/utils'

interface PaymentTrustBadgesProps {
  className?: string
  compact?: boolean
  /** Centraliza o bloco — usado no rodapé, onde o texto ao redor é centralizado. */
  center?: boolean
}

/**
 * Selos de pagamento + envio.
 *
 * Os logotipos são SVG inline com o traçado real de cada marca (vetores do
 * simple-icons, MIT; as marcas seguem sendo dos titulares — o uso aqui é o
 * padrão de indicar meios de pagamento aceitos). Inline evita requisição extra
 * e mantém a marca nítida em qualquer densidade de tela.
 *
 * O cartão é sempre claro de propósito: essas marcas foram desenhadas para
 * fundo claro e sumiriam no tema escuro.
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
          <BrandPath d={PIX_PATH} fill="#32BCAD" />
        </Card>
        <Card label="Visa">
          <BrandPath d={VISA_PATH} fill="#1434CB" wide />
        </Card>
        <Card label="Mastercard">
          <MastercardMark />
        </Card>
        <Card label="Elo">
          <EloMark />
        </Card>
        <Card label="Stripe">
          <BrandPath d={STRIPE_PATH} fill="#635BFF" />
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

function BrandPath({ d, fill, wide = false }: { d: string; fill: string; wide?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={wide ? 'h-4 w-9' : 'h-5 w-5'}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      focusable="false"
    >
      <path d={d} fill={fill} />
    </svg>
  )
}

/**
 * Mastercard é bicolor: o traçado oficial monocromático perderia a identidade,
 * então os dois discos e a interseção são desenhados na cor de cada um.
 */
function MastercardMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-8" aria-hidden focusable="false">
      <circle cx="9" cy="12" r="7.4" fill="#EB001B" />
      <circle cx="15" cy="12" r="7.4" fill="#F79E1B" />
      <path
        d="M12 6.174c1.564 1.359 2.551 3.36 2.551 5.826 0 2.236-.987 4.236-2.551 5.595-1.564-1.359-2.551-3.359-2.551-5.595 0-2.235.987-4.236 2.551-5.826z"
        fill="#FF5F00"
      />
    </svg>
  )
}

/**
 * A Elo não publica vetor em conjunto aberto, então a marca é reconstruída: os
 * três discos coloridos do símbolo, mais o logotipo.
 */
function EloMark() {
  return (
    <svg viewBox="0 0 48 20" className="h-4 w-11" aria-hidden focusable="false">
      <circle cx="7" cy="6.5" r="3.2" fill="#FFCB05" />
      <circle cx="7" cy="14" r="3.2" fill="#EF4123" />
      <circle cx="13.4" cy="10.2" r="3.2" fill="#00A4E0" />
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

const PIX_PATH =
  'M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156'

const VISA_PATH =
  'M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z'

const STRIPE_PATH =
  'M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z'
