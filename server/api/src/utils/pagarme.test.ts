import { describe, it, expect, vi } from 'vitest';

/**
 * Pagar.me client — the pure parts.
 *
 * Everything here was checked against the live API on 02/09/2026, and two of
 * these encode failures that only showed up there:
 *
 *  - a customer without `type` is a 422 ("The type field is required"), which
 *    is why every customer object is normalised in one place;
 *  - `POST /customers/{id}/cards` verifies the card with the issuer and answers
 *    412, one step *before* any charge — so the message must talk about the
 *    card, not about a charge that was never attempted.
 */

vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PAGARME_SECRET_KEY: 'sk_test',
    PAGARME_API_URL: 'https://api.pagar.me/core/v5',
    PAGARME_MAX_INSTALLMENTS: 6,
    PAGARME_MIN_INSTALLMENT_AMOUNT: 20,
  },
}));
vi.mock('../config/database.js', () => ({ query: vi.fn(async () => ({ rows: [] })) }));

import {
  normalizeCustomer,
  documentType,
  normalizeDocument,
  parseBrazilianPhone,
  maxInstallmentsFor,
  mapChargeStatus,
  describeChargeFailure,
  toCents,
  fromCents,
  idempotencyKeyFor,
} from './pagarme.js';

describe('normalizeCustomer', () => {
  /** The exact shape that 422'd on the first real order. */
  it('preenche `type`, que a API exige e o objeto inline não tinha', () => {
    const out = normalizeCustomer({
      name: 'Ana',
      email: 'a@b.c',
      document: '529.982.247-25',
    });

    expect(out.type).toBe('individual');
    expect(out.document_type).toBe('CPF');
    expect(out.document).toBe('52998224725');
  });

  it('trata CNPJ como empresa', () => {
    const out = normalizeCustomer({ name: 'Loja', email: 'a@b.c', document: '11222333000181' });

    expect(out.type).toBe('company');
    expect(out.document_type).toBe('CNPJ');
  });

  it('respeita o que já veio preenchido', () => {
    const out = normalizeCustomer({
      name: 'Ana',
      email: 'a@b.c',
      document: '52998224725',
      type: 'company',
    });

    expect(out.type).toBe('company');
  });
});

describe('dinheiro', () => {
  /** Off by 100 here is a charge 100x too big. */
  it('converte reais para centavos arredondando', () => {
    expect(toCents(12.5)).toBe(1250);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(4.75)).toBe(475);
  });

  it('volta de centavos para reais', () => {
    expect(fromCents(12400)).toBe(124);
  });
});

describe('parcelas', () => {
  it('não oferece parcela abaixo do piso', () => {
    expect(maxInstallmentsFor(50)).toBe(2);
  });

  it('respeita o teto configurado', () => {
    expect(maxInstallmentsFor(1000)).toBe(6);
  });

  it('sempre oferece ao menos uma', () => {
    expect(maxInstallmentsFor(5)).toBe(1);
  });
});

describe('mapChargeStatus', () => {
  it.each([
    ['paid', 'paid'],
    ['overpaid', 'paid'],
    ['underpaid', 'paid'],
    ['canceled', 'refunded'],
    ['partial_canceled', 'refunded'],
    ['chargedback', 'refunded'],
    ['failed', 'failed'],
    ['not_authorized', 'failed'],
    ['with_error', 'failed'],
    ['pending', 'pending'],
    ['processing', 'pending'],
  ])('%s vira %s', (from, to) => {
    expect(mapChargeStatus(from)).toBe(to);
  });

  /** An unknown status must never read as paid. */
  it('um status desconhecido fica pendente, nunca pago', () => {
    expect(mapChargeStatus('algo_novo')).toBe('pending');
  });
});

describe('describeChargeFailure', () => {
  it('traduz o código do adquirente', () => {
    expect(
      describeChargeFailure({
        id: 'ch_1',
        status: 'not_authorized',
        amount: 100,
        last_transaction: { acquirer_return_code: '51' },
      } as never)
    ).toMatch(/saldo ou limite insuficiente/);
  });

  it('cai no status quando não há código', () => {
    expect(
      describeChargeFailure({ id: 'ch_1', status: 'not_authorized', amount: 100 } as never)
    ).toMatch(/não autorizado/i);
  });

  /** Never leave the customer without an instruction. */
  it('sempre devolve uma frase acionável', () => {
    expect(describeChargeFailure(undefined)).toMatch(/tente outro cartão|use PIX/i);
  });
});

describe('parseBrazilianPhone', () => {
  it.each([
    ['21999998888', { country_code: '55', area_code: '21', number: '999998888' }],
    ['(21) 99999-8888', { country_code: '55', area_code: '21', number: '999998888' }],
    ['5521999998888', { country_code: '55', area_code: '21', number: '999998888' }],
    ['2133334444', { country_code: '55', area_code: '21', number: '33334444' }],
  ])('entende %s', (input, expected) => {
    expect(parseBrazilianPhone(input as string)).toEqual(expected);
  });

  /**
   * A malformed phone fails the whole order with a 422; a missing one only
   * fails if the account demands it. Null is the safer answer.
   */
  it.each([['', null], ['123', null], [null, null], ['abc', null]])(
    'devolve null para %s em vez de mandar lixo',
    (input, expected) => {
      expect(parseBrazilianPhone(input as string | null)).toBe(expected);
    }
  );
});

describe('normalizeDocument / documentType', () => {
  it('tira máscara', () => {
    expect(normalizeDocument('529.982.247-25')).toBe('52998224725');
    expect(normalizeDocument('11.222.333/0001-81')).toBe('11222333000181');
  });

  it('distingue CPF de CNPJ pelo tamanho', () => {
    expect(documentType('52998224725')).toBe('CPF');
    expect(documentType('11222333000181')).toBe('CNPJ');
  });
});

describe('idempotencyKeyFor', () => {
  /** Same attempt, same key: a retry must reuse the stored response. */
  it('é estável para o mesmo escopo, id e valor', () => {
    expect(idempotencyKeyFor('shop_pix', 'o1', 12400)).toBe(
      idempotencyKeyFor('shop_pix', 'o1', 12400)
    );
  });

  /** A different amount is a different charge, and must not be deduplicated. */
  it('muda quando o valor muda', () => {
    expect(idempotencyKeyFor('shop_pix', 'o1', 12400)).not.toBe(
      idempotencyKeyFor('shop_pix', 'o1', 12500)
    );
  });

  it('muda entre escopos', () => {
    expect(idempotencyKeyFor('shop_pix', 'o1', 100)).not.toBe(
      idempotencyKeyFor('club_pix', 'o1', 100)
    );
  });
});
