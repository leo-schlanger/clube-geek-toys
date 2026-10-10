import { describe, it, expect, vi } from 'vitest';
import { clubPeriodForAmount, revokeRefundedPeriod } from './club-access.service.js';

describe('clubPeriodForAmount', () => {
  it('plano anual devolve um ano; mensalidade antiga, um mês', () => {
    expect(clubPeriodForAmount(159.9)).toBe('1 year');
    expect(clubPeriodForAmount(12.5)).toBe('1 month');
    expect(clubPeriodForAmount(19.9)).toBe('1 month');
  });
});

describe('revokeRefundedPeriod', () => {
  const db = (rows: Record<string, unknown>[]) => ({ query: vi.fn(async () => ({ rows })) });

  it('acesso encerrado com recorrência viva: devolve a assinatura para cancelar', async () => {
    const out = await revokeRefundedPeriod(
      db([{ status: 'inactive', subscription_id: 'sub_1', subscription_status: 'authorized' }]),
      'm1',
      159.9,
    );
    expect(out).toEqual({ ended: true, subscriptionId: 'sub_1' });
  });

  it('recorrência já cancelada não é cancelada de novo', async () => {
    const out = await revokeRefundedPeriod(
      db([{ status: 'inactive', subscription_id: 'sub_1', subscription_status: 'cancelled' }]),
      'm1',
      159.9,
    );
    expect(out).toEqual({ ended: true, subscriptionId: null });
  });

  it('ainda sobra período pago: segue ativo e a recorrência fica', async () => {
    const out = await revokeRefundedPeriod(
      db([{ status: 'active', subscription_id: 'sub_1', subscription_status: 'authorized' }]),
      'm1',
      159.9,
    );
    expect(out).toEqual({ ended: false, subscriptionId: null });
  });

  it('membro que não está ativo não é tocado', async () => {
    const q = db([]);
    expect(await revokeRefundedPeriod(q, 'm1', 159.9)).toBeNull();
    const [sql, params] = q.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/status = 'active'/);
    expect(params).toEqual(['m1', '1 year']);
  });
});
