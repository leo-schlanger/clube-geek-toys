import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);

import { CARD_TOKEN_TTL_SECONDS, checkCardToken, issueCardToken } from './card-token.js';

const ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const OTHER = '9b2c1a10-0000-4000-8000-000000000abc';
const NOW = Date.UTC(2026, 10, 7, 15, 0, 0);

describe('card token', () => {
  it('is short and valid right after it is issued', () => {
    const { token, expiresAt } = issueCardToken(ID, NOW);
    expect(token.length).toBeLessThanOrEqual(32);
    expect(checkCardToken(ID, token, NOW)).toBe('valid');
    expect(new Date(expiresAt).getTime()).toBe(NOW + CARD_TOKEN_TTL_SECONDS * 1000);
  });

  it('expires after five minutes (a screenshot stops passing)', () => {
    const { token } = issueCardToken(ID, NOW);
    expect(checkCardToken(ID, token, NOW + CARD_TOKEN_TTL_SECONDS * 1000)).toBe('valid');
    expect(checkCardToken(ID, token, NOW + (CARD_TOKEN_TTL_SECONDS + 1) * 1000)).toBe('expired');
    expect(checkCardToken(ID, token, NOW + 86_400_000)).toBe('expired');
  });

  it('is bound to the member: another card id rejects it', () => {
    const { token } = issueCardToken(ID, NOW);
    expect(checkCardToken(OTHER, token, NOW)).toBe('invalid');
  });

  it('rejects a tampered signature or issue time', () => {
    const { token } = issueCardToken(ID, NOW);
    const [iat, sig] = token.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    expect(checkCardToken(ID, `${iat}.${flipped}`, NOW)).toBe('invalid');
    // Moving the issue time forward to stretch the validity breaks the signature
    const later = (parseInt(iat, 36) + 600).toString(36);
    expect(checkCardToken(ID, `${later}.${sig}`, NOW + 700_000)).toBe('invalid');
  });

  it('rejects a token issued in the future beyond clock skew', () => {
    const { token } = issueCardToken(ID, NOW + 10 * 60_000);
    expect(checkCardToken(ID, token, NOW)).toBe('invalid');
    const { token: skewed } = issueCardToken(ID, NOW + 30_000);
    expect(checkCardToken(ID, skewed, NOW)).toBe('valid');
  });

  it('tells a missing token from a malformed one, without throwing', () => {
    expect(checkCardToken(ID, undefined, NOW)).toBe('missing');
    expect(checkCardToken(ID, '', NOW)).toBe('missing');
    for (const bad of ['x', 'abc.def', `${'z'.repeat(80)}`, ['a', 'b'], 42, 'mgz.!!!!!!!!!!!!!!!!!!!!!!']) {
      expect(checkCardToken(ID, bad, NOW)).toBe('invalid');
    }
  });

  it('compares signatures in constant time', async () => {
    const crypto = await import('crypto');
    const spy = vi.spyOn(crypto.default, 'timingSafeEqual');
    const { token } = issueCardToken(ID, NOW);
    checkCardToken(ID, token, NOW);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
