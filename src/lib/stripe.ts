/**
 * Stripe.js client-side initialization.
 *
 * Uses @stripe/stripe-js loadStripe() — idempotent, only injects the script once.
 * The publishable key is loaded from VITE_STRIPE_PUBLISHABLE_KEY (build-time env).
 */

import { loadStripe, type Stripe } from '@stripe/stripe-js'

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''

let stripePromise: Promise<Stripe | null> | null = null

export function getStripePromise(): Promise<Stripe | null> {
  if (!stripePromise) {
    if (!STRIPE_PUBLISHABLE_KEY) {
      console.error('[Stripe] VITE_STRIPE_PUBLISHABLE_KEY not configured')
      return Promise.resolve(null)
    }
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY, {
      locale: 'pt-BR',
    })
  }
  return stripePromise
}

export function isStripeConfigured(): boolean {
  return Boolean(STRIPE_PUBLISHABLE_KEY)
}
