import crypto from 'crypto';
import { env } from '../config/env.js';

export function createHmacToken(payload: Record<string, unknown>, expiresInMs: number): string {
  const data = {
    ...payload,
    exp: Date.now() + expiresInMs,
  };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.HMAC_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyHmacToken(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', env.HMAC_SECRET)
    .update(encoded)
    .digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashSha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
