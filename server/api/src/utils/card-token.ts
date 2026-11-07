import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * Short-lived proof that a membership QR was just opened on the member's own
 * phone. The QR encodes `/verificar/:id?t=<token>`; a screenshot keeps working
 * as a link, but its token expires and the door sees "QR antigo".
 *
 * Token: `<issued-at, base36 seconds>.<HMAC-SHA256 truncated to 128 bits>`,
 * signed over the member id and the issue time. Short on purpose: it lives in
 * a QR code.
 */

export const CARD_TOKEN_TTL_SECONDS = 5 * 60;
// Phone clocks drift; a token "from the future" within this window is fine.
const CLOCK_SKEW_SECONDS = 60;
const SIG_BYTES = 16;

export type CardTokenCheck = 'valid' | 'expired' | 'invalid' | 'missing';

// Own key, derived from the existing secret with a label, so a token for one
// purpose can never be replayed as another.
let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) {
    cachedKey = crypto.createHmac('sha256', env.HMAC_SECRET).update('member-card-qr-v1').digest();
  }
  return cachedKey;
}

function sign(memberId: string, issuedAt: number): string {
  return crypto
    .createHmac('sha256', key())
    .update(`card:${memberId.toLowerCase()}:${issuedAt}`)
    .digest()
    .subarray(0, SIG_BYTES)
    .toString('base64url');
}

export function issueCardToken(memberId: string, nowMs = Date.now()) {
  const issuedAt = Math.floor(nowMs / 1000);
  return {
    token: `${issuedAt.toString(36)}.${sign(memberId, issuedAt)}`,
    expiresAt: new Date((issuedAt + CARD_TOKEN_TTL_SECONDS) * 1000).toISOString(),
  };
}

export function checkCardToken(memberId: string, token: unknown, nowMs = Date.now()): CardTokenCheck {
  if (token === undefined || token === null || token === '') return 'missing';
  if (typeof token !== 'string' || token.length > 64) return 'invalid';
  const match = /^([0-9a-z]{1,10})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!match) return 'invalid';

  const issuedAt = parseInt(match[1], 36);
  // Compare the text, not decoded bytes: the last base64url character carries
  // unused bits, so two spellings would decode to the same signature.
  const given = Buffer.from(match[2]);
  const expected = Buffer.from(sign(memberId, issuedAt));
  // Fixed length by the regex above; timingSafeEqual would throw otherwise.
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return 'invalid';

  const now = Math.floor(nowMs / 1000);
  if (issuedAt > now + CLOCK_SKEW_SECONDS) return 'invalid';
  if (now - issuedAt > CARD_TOKEN_TTL_SECONDS) return 'expired';
  return 'valid';
}
