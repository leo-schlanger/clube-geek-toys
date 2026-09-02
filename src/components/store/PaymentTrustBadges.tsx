import { cn } from '../../lib/utils'

interface PaymentTrustBadgesProps {
  className?: string
  compact?: boolean
  /** Centres the block, for the footer where surrounding text is centred. */
  center?: boolean
}

/**
 * Payment and shipping badges.
 *
 * Logos are inline SVG with each brand's real path (simple-icons, MIT; the
 * marks remain their owners'). Inline avoids an extra request and stays sharp
 * at any pixel density.
 *
 * The card is deliberately always light: these marks were drawn for light
 * backgrounds and would disappear in the dark theme.
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
        <Card label="Pagar.me">
          <PagarmeMark />
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Pagamento seguro · Envio pelos Correios para todo o Brasil
      </p>
    </div>
  )
}

/** Fixed-size white frame; this is what keeps the row aligned. */
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
 * Mastercard is two-tone: the official monochrome path would lose the identity,
 * so both discs and their intersection are drawn in their own colours.
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
 * Pagar.me publishes no vector in an open set either, so this is the wordmark
 * set in their green — enough for a badge row, and honest about who processes
 * the payment now that it is no longer Stripe.
 */
function PagarmeMark() {
  return (
    <svg viewBox="0 0 64 20" className="h-4 w-12" aria-hidden focusable="false">
      <text
        x="32"
        y="15"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="13"
        fontWeight="700"
        fill="#65A300"
      >
        pagar.me
      </text>
    </svg>
  )
}

/**
 * Elo publishes no vector in an open set, so the mark is reconstructed: the
 * three coloured discs plus the wordmark.
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

