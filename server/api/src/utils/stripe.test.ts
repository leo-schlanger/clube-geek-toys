import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env.js', async () => {
  const { envModule } = await import('../test-support/env.js');
  return { ...envModule, env: { ...envModule.env, STRIPE_SECRET_KEY: 'sk_test_pinned' } };
});

import { getStripe, STRIPE_API_VERSION } from './stripe.js';

// The SDK sends the API version it was built for unless told otherwise, and
// every minor release moves it; the legacy refunds must not move with it.
describe('getStripe', () => {
  it('sends the pinned API version, not the one the SDK ships with', () => {
    expect(STRIPE_API_VERSION).toBe('2026-03-25.dahlia');
    expect(getStripe().getApiField('version')).toBe(STRIPE_API_VERSION);
  });
});
