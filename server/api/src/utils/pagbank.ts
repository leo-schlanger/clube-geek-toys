import crypto from 'crypto';
import { env } from '../config/env.js';

const PAGBANK_BASE_URL = env.NODE_ENV === 'production'
  ? 'https://api.pagseguro.com'
  : 'https://sandbox.api.pagseguro.com';

// =====================================================================
// PagBank webhook signature verification
// =====================================================================
//
// PagBank uses ASYMMETRIC RSA-SHA256 signing — NOT HMAC.
// Reference: https://developer.pagbank.com.br/reference/webhooks
//
// Mechanism:
//  1. PagBank signs the raw body with its private RSA key.
//  2. The base64-encoded signature is sent in the `x-payload-signature` header.
//  3. We fetch PagBank's public key from `/public-keys` (cached locally) and verify.
//
// Sandbox does NOT send the signature header, so verification is skipped in non-production.

interface CachedKey {
  publicKey: string;
  fetchedAt: number;
}

const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
let cachedKey: CachedKey | null = null;
let inflightFetch: Promise<string | null> | null = null;

interface PublicKeyResponse {
  public_key?: string;
  publicKey?: string;
  data?: { public_key?: string };
}

/**
 * Fetch PagBank's public key for webhook signature verification.
 * Cached for 24h. Returns null on failure (caller should fail-open with a loud warning).
 * Concurrent calls are coalesced into a single fetch.
 */
export async function getPagBankPublicKey(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedKey && Date.now() - cachedKey.fetchedAt < KEY_CACHE_TTL_MS) {
    return cachedKey.publicKey;
  }
  if (inflightFetch) return inflightFetch;

  inflightFetch = (async () => {
    try {
      const response = await fetch(`${PAGBANK_BASE_URL}/public-keys`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PAGBANK_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ type: 'card' }),
      });

      if (!response.ok) {
        console.error(`[PagBank] Failed to fetch public key: HTTP ${response.status}`);
        return null;
      }

      const data = (await response.json()) as PublicKeyResponse;
      const key = data.public_key || data.publicKey || data.data?.public_key || null;
      if (!key) {
        console.error('[PagBank] Public key response missing expected field');
        return null;
      }
      cachedKey = { publicKey: key, fetchedAt: Date.now() };
      return key;
    } catch (err) {
      console.error('[PagBank] Error fetching public key:', err);
      return null;
    } finally {
      inflightFetch = null;
    }
  })();

  return inflightFetch;
}

/**
 * Verify a PagBank webhook signature using their public RSA key.
 *
 * @param rawBody The raw request body buffer (Express must use express.raw on /webhook)
 * @param signatureHeader The base64-encoded signature from `x-payload-signature` header
 * @param publicKey PagBank's public key in PEM format (from getPagBankPublicKey)
 * @returns true if the signature is valid
 */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined, publicKey: string | null | undefined): boolean {
  if (!signatureHeader || !publicKey) return false;
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKey, signatureHeader, 'base64');
  } catch (err) {
    console.error('[PagBank] verifyWebhookSignature error:', err);
    return false;
  }
}

export interface PagBankLink {
  media: string;
  href: string;
}

export interface PagBankCharge {
  id?: string;
  status: string;
  amount?: { value: number };
  paid_at?: string | null;
  payment_method?: { type: string; card?: { last_digits?: string; brand?: string } };
}

export interface PagBankOrder {
  id: string;
  reference_id?: string;
  charges?: PagBankCharge[];
  qr_codes?: { id?: string; status?: string; amount?: { value: number }; links?: PagBankLink[] }[];
}

interface PagBankRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}

export async function pagbankRequest<T = Record<string, unknown>>(options: PagBankRequestOptions): Promise<T> {
  const { method, path, body, idempotencyKey } = options;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.PAGBANK_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (idempotencyKey) {
    headers['x-idempotency-key'] = idempotencyKey;
  }

  const response = await fetch(`${PAGBANK_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await response.json()) as T & { error_messages?: { code?: string; description?: string; parameter_name?: string }[] };

  if (!response.ok) {
    console.error(`[PagBank] ${method} ${path} failed:`, JSON.stringify(data).substring(0, 500));
    const errMsg = data?.error_messages?.[0];
    const mapped = errMsg ? mapPagBankError(errMsg.code, errMsg.description) : null;
    throw new PagBankError(
      mapped?.message || errMsg?.description || `Erro de comunicação com a operadora (${response.status}).`,
      mapped?.code || 'PAGBANK_ERROR',
      response.status,
    );
  }

  return data as T;
}

/**
 * Wraps a PagBank API failure with an internal error code that the frontend can branch on.
 */
export class PagBankError extends Error {
  constructor(message: string, public code: string, public httpStatus: number) {
    super(message);
    this.name = 'PagBankError';
  }
}

/**
 * Maps PagBank error codes/messages to a user-friendly PT-BR message + internal code.
 * Codes catalogued from PagBank PagSeguro Pagamentos API documentation.
 */
const PAGBANK_ERROR_MAP: Record<string, { code: string; message: string }> = {
  INSUFFICIENT_FUNDS: { code: 'CARD_INSUFFICIENT', message: 'Cartão recusado: saldo insuficiente.' },
  INVALID_SECURITY_CODE: { code: 'CARD_CVV', message: 'Código de segurança (CVV) inválido.' },
  INVALID_CARD_NUMBER: { code: 'CARD_NUMBER', message: 'Número do cartão inválido.' },
  EXPIRED_CARD: { code: 'CARD_EXPIRED', message: 'Cartão expirado.' },
  INVALID_EXPIRATION_DATE: { code: 'CARD_EXPIRY', message: 'Data de validade do cartão inválida.' },
  GENERIC_DECLINED: { code: 'CARD_DECLINED', message: 'Cartão recusado pelo banco. Tente outro cartão.' },
  RISK_DENIED: { code: 'RISK_DENIED', message: 'Pagamento bloqueado por análise de risco. Use outro cartão ou método.' },
  CARD_NOT_AUTHORIZED: { code: 'CARD_DECLINED', message: 'Cartão não autorizado pelo banco. Entre em contato com seu banco.' },
  ISSUER_DECLINED: { code: 'CARD_DECLINED', message: 'Cartão recusado pelo emissor. Tente outro cartão.' },
  STOLEN_CARD: { code: 'CARD_DECLINED', message: 'Cartão recusado pelo banco. Verifique seus dados ou use outro cartão.' },
  LOST_CARD: { code: 'CARD_DECLINED', message: 'Cartão recusado pelo banco. Verifique seus dados ou use outro cartão.' },
  RESTRICTED_CARD: { code: 'CARD_DECLINED', message: 'Cartão restrito. Entre em contato com seu banco.' },
};

export function mapPagBankError(code: string | undefined, _description: string | undefined): { code: string; message: string } | null {
  if (!code) return null;
  return PAGBANK_ERROR_MAP[code] || null;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Map PagBank charge status to our PaymentStatus */
export function mapPagBankStatus(status: string): 'pending' | 'paid' | 'failed' | 'refunded' {
  switch (status) {
    case 'PAID':
      return 'paid';
    case 'DECLINED':
    case 'CANCELED':
      return 'failed';
    case 'REFUNDED':
      return 'refunded';
    default:
      return 'pending';
  }
}
