import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { pagbankRequest, mapPagBankStatus } from '../utils/pagbank.js';
import type { PagBankOrder } from '../utils/pagbank.js';
import { AppError } from '../middleware/error-handler.js';
import { PLAN_PRICES } from '../types/index.js';
import crypto from 'crypto';

const MIN_AMOUNT = 1.00;
const MAX_AMOUNT = 999.90;

function validateAmount(amount: number) {
  if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    throw new AppError(400, `Valor deve estar entre R$${MIN_AMOUNT.toFixed(2)} e R$${MAX_AMOUNT.toFixed(2)}`);
  }
  // Cross-check: amount should match one of the plan prices
  const validPrices: number[] = Object.values(PLAN_PRICES).flatMap((p) => [p.monthly, p.annual]);
  const matchesPrice = validPrices.some((p) => Math.abs(p - amount) < 0.01);
  if (!matchesPrice) {
    throw new AppError(400, `Valor R$${amount.toFixed(2)} não corresponde a nenhum plano válido`);
  }
}

export async function getPayments(filters: { memberId?: string; status?: string; limit?: number }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.memberId) {
    conditions.push(`p.member_id = $${paramIndex++}`);
    params.push(filters.memberId);
  }
  if (filters.status) {
    conditions.push(`p.status = $${paramIndex++}`);
    params.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(filters.limit || 20, 100);

  const result = await query(
    `SELECT p.*, m.full_name as member_name
     FROM payments p
     LEFT JOIN members m ON m.id = p.member_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${paramIndex}`,
    [...params, limit]
  );

  return result.rows.map(mapPaymentRow);
}

function mapPaymentRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name || null,
    amount: parseFloat(row.amount as string),
    method: row.method,
    status: row.status,
    providerId: row.provider_id,
    providerStatus: row.provider_status,
    reference: row.reference,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

export async function createPixPayment(data: {
  amount: number;
  description: string;
  payer_email: string;
  external_reference: string;
}) {
  validateAmount(data.amount);
  const referenceId = crypto.randomUUID();

  const order = await pagbankRequest<PagBankOrder>({
    method: 'POST',
    path: '/orders',
    body: {
      reference_id: data.external_reference,
      customer: {
        name: 'Cliente',
        email: data.payer_email,
      },
      items: [
        {
          reference_id: referenceId,
          name: data.description,
          quantity: 1,
          unit_amount: Math.round(data.amount * 100), // PagBank uses cents
        },
      ],
      qr_codes: [
        {
          amount: {
            value: Math.round(data.amount * 100),
          },
          expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
        },
      ],
      notification_urls: [`${env.API_URL}/webhook/pagbank`],
    },
  });

  const qrCode = order.qr_codes?.[0];
  const qrCodeText = qrCode?.links?.find((l) => l.media === 'text/plain')?.href || '';
  const qrCodeImage = qrCode?.links?.find((l) => l.media === 'image/png')?.href || '';

  // Save payment to database
  await query(
    `INSERT INTO payments (member_id, amount, method, status, provider_id, provider_status, reference)
     VALUES ((SELECT id FROM members WHERE id = $1 LIMIT 1), $2, 'pix', 'pending', $3, $4, $5)`,
    [
      data.external_reference,
      data.amount,
      order.id,
      order.charges?.[0]?.status || 'WAITING',
      data.external_reference,
    ]
  );

  return {
    id: order.id,
    status: 'pending',
    qr_code: qrCodeText,
    qr_code_base64: '', // PagBank provides image URL instead
    qr_code_image_url: qrCodeImage,
    ticket_url: qrCodeImage,
  };
}

export async function createCardPayment(data: {
  amount: number;
  description: string;
  payer_email: string;
  payer_name: string;
  encrypted_card: string;
  external_reference: string;
  installments?: number;
}) {
  validateAmount(data.amount);
  const order = await pagbankRequest<PagBankOrder>({
    method: 'POST',
    path: '/orders',
    body: {
      reference_id: data.external_reference,
      customer: {
        name: data.payer_name,
        email: data.payer_email,
      },
      items: [
        {
          reference_id: crypto.randomUUID(),
          name: data.description,
          quantity: 1,
          unit_amount: Math.round(data.amount * 100),
        },
      ],
      charges: [
        {
          reference_id: crypto.randomUUID(),
          description: data.description,
          amount: {
            value: Math.round(data.amount * 100),
            currency: 'BRL',
          },
          payment_method: {
            type: 'CREDIT_CARD',
            installments: data.installments || 1,
            capture: true,
            card: {
              encrypted: data.encrypted_card,
            },
          },
        },
      ],
      notification_urls: [`${env.API_URL}/webhook/pagbank`],
    },
  });

  const charge = order.charges?.[0];
  const status = mapPagBankStatus(charge?.status || '');

  // Save payment to database
  await query(
    `INSERT INTO payments (member_id, amount, method, status, provider_id, provider_status, reference)
     VALUES ((SELECT id FROM members WHERE id = $1 LIMIT 1), $2, 'credit_card', $3, $4, $5, $6)`,
    [
      data.external_reference,
      data.amount,
      status,
      order.id,
      charge?.status || 'WAITING',
      data.external_reference,
    ]
  );

  return {
    id: order.id,
    status,
    charge_id: charge?.id,
    provider_status: charge?.status,
  };
}

export async function getPaymentStatus(orderId: string) {
  const order = await pagbankRequest<PagBankOrder>({
    method: 'GET',
    path: `/orders/${orderId}`,
  });

  const charge = order.charges?.[0];
  const qrCode = order.qr_codes?.[0];
  const status = charge
    ? mapPagBankStatus(charge.status)
    : (qrCode?.status === 'PAID' ? 'paid' : 'pending');

  return {
    id: order.id,
    status: charge?.status || qrCode?.status || 'WAITING',
    mapped_status: status,
    external_reference: order.reference_id,
    transaction_amount: (charge?.amount?.value || qrCode?.amount?.value || 0) / 100,
    date_approved: charge?.paid_at || null,
    payment_method_id: charge?.payment_method?.type || 'pix',
  };
}
