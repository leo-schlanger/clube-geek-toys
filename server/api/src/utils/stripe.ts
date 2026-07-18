import Stripe from 'stripe';
import { env } from '../config/env.js';
import { query } from '../config/database.js';

// ─── Stripe client singleton ──────────────────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// ─── Webhook signature verification ───────────────────────────────────────────

/**
 * Verify a Stripe webhook event. Uses Stripe's own SDK which implements HMAC-SHA256
 * over the raw body + timestamp — no guesswork needed (unlike PagBank).
 *
 * Returns the parsed event on success, throws on failure.
 */
export function verifyWebhookEvent(rawBody: Buffer, signature: string, secret: string): Stripe.Event {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// ─── Customer management ─────────────────────────────────────────────────────

/**
 * Get or create a Stripe Customer for a member.
 *
 * - If the member already has a `stripe_customer_id`, returns it.
 * - Otherwise, creates a new Customer in Stripe and stores the ID in the members table.
 *
 * Stripe requires a Customer for subscriptions and storing payment methods.
 */
export async function getOrCreateCustomer(member: {
  id: string;
  email: string;
  fullName: string;
  stripeCustomerId?: string | null;
}): Promise<string> {
  if (member.stripeCustomerId) {
    return member.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: member.email,
    name: member.fullName,
    metadata: { memberId: member.id },
  });

  // Persist the Stripe Customer ID on the member record for future lookups.
  await query(
    'UPDATE members SET stripe_customer_id = $1 WHERE id = $2',
    [customer.id, member.id]
  );

  return customer.id;
}

// ─── Price helpers ────────────────────────────────────────────────────────────

/**
 * Map our internal plan + paymentType to a human-readable Stripe price description.
 * In production, you'd create Stripe Products + Prices once and cache the IDs.
 * For now, we create ad-hoc prices inline (Stripe supports this via price_data).
 */
export function buildPriceData(plan: string, paymentType: string, amount: number) {
  return {
    currency: 'brl' as const,
    product_data: {
      name: `Clube GeekPop & Toys - Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
    },
    unit_amount: Math.round(amount * 100),
    recurring: {
      interval: (paymentType === 'annual' ? 'year' : 'month') as 'year' | 'month',
    },
  };
}

// ─── Error mapping ────────────────────────────────────────────────────────────

/**
 * Maps Stripe error decline_code / code to a user-friendly PT-BR message.
 */
const STRIPE_DECLINE_MAP: Record<string, string> = {
  insufficient_funds: 'Cartão recusado: saldo insuficiente.',
  incorrect_cvc: 'Código de segurança (CVC) incorreto.',
  expired_card: 'Cartão expirado.',
  card_declined: 'Cartão recusado pelo banco. Tente outro cartão.',
  processing_error: 'Erro de processamento do banco. Tente novamente.',
  incorrect_number: 'Número do cartão incorreto.',
  lost_card: 'Cartão recusado pelo banco. Use outro cartão.',
  stolen_card: 'Cartão recusado pelo banco. Use outro cartão.',
  do_not_honor: 'Cartão recusado pelo banco. Entre em contato com seu banco.',
  fraudulent: 'Pagamento bloqueado por análise de risco. Use outro cartão.',
};

export function mapStripeDeclineMessage(declineCode: string | undefined): string {
  if (!declineCode) return 'Cartão recusado. Tente outro cartão ou método.';
  return STRIPE_DECLINE_MAP[declineCode] || `Cartão recusado (${declineCode}). Tente outro cartão.`;
}

// ─── Status mapping ──────────────────────────────────────────────────────────

export function mapStripePaymentStatus(status: string): 'pending' | 'paid' | 'failed' | 'refunded' {
  switch (status) {
    case 'succeeded':
      return 'paid';
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'processing':
      return 'pending';
    case 'canceled':
      return 'failed';
    default:
      return 'pending';
  }
}
