import { env } from '../config/env.js';

const PAGBANK_BASE_URL = env.NODE_ENV === 'production'
  ? 'https://api.pagseguro.com'
  : 'https://sandbox.api.pagseguro.com';

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

  const data = (await response.json()) as T & { error_messages?: { description: string }[] };

  if (!response.ok) {
    console.error(`[PagBank] ${method} ${path} failed:`, JSON.stringify(data).substring(0, 500));
    throw new Error(data?.error_messages?.[0]?.description || `PagBank error: ${response.status}`);
  }

  return data as T;
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
