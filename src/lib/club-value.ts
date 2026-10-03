import { CLUB_PLAN, MEMBER_DISCOUNT_PERCENT } from '../types'
import { getSubdomainUrl } from './subdomain'

/**
 * The numbers the sales copy quotes, derived from the plan constants so a
 * price or discount change cannot leave a screen promising the old figure.
 */

/** Members pay half on event tickets. */
export const MEMBER_TICKET_DISCOUNT_PERCENT = 50

/** Ticket price assumed when no event is on sale (the last event's entry). */
export const DEFAULT_TICKET_PRICE = 20

const round2 = (n: number) => Math.round(n * 100) / 100

/** The annual price spread over twelve months. Paid in full, quoted per month. */
export const CLUB_MONTHLY_EQUIVALENT = round2(CLUB_PLAN.price / 12)

/** Yearly shop spend at which the product discount alone covers the plan. */
export const CLUB_BREAK_EVEN_SPEND = Math.ceil(CLUB_PLAN.price / (MEMBER_DISCOUNT_PERCENT / 100))

/** What a member would save on `amount` in products. */
export function memberSavingsOn(amount: number): number {
  return round2(Math.max(0, amount) * (MEMBER_DISCOUNT_PERCENT / 100))
}

export interface ClubYearEstimate {
  shopSavings: number
  ticketSavings: number
  totalSavings: number
  /** Savings minus the plan price; negative means the plan has not paid off. */
  net: number
}

/** A year of membership for someone spending `monthlySpend` and going to `tickets` events. */
export function estimateClubYear(opts: {
  monthlySpend: number
  tickets: number
  ticketPrice: number
}): ClubYearEstimate {
  const shopSavings = memberSavingsOn(opts.monthlySpend * 12)
  const ticketSavings = round2(
    Math.max(0, opts.tickets) * Math.max(0, opts.ticketPrice) * (MEMBER_TICKET_DISCOUNT_PERCENT / 100),
  )
  const totalSavings = round2(shopSavings + ticketSavings)
  return { shopSavings, ticketSavings, totalSavings, net: round2(totalSavings - CLUB_PLAN.price) }
}

/** The club's sales page, on the same domain the visitor is browsing. */
export function clubSignupUrl(): string {
  return `${getSubdomainUrl('member')}/assinar`
}
