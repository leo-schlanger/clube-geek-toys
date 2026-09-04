import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Reconciliation — the safety net under the webhook.
 *
 * What these protect, ordered by what a regression costs:
 *
 *  1. **Only the provider decides.** Nothing settles from local state; every
 *     charge is re-read, and one that is still pending is left alone.
 *  2. **Settling goes through the webhook processor**, so the idempotency claim
 *     is what stops a charge being applied twice — by this sweep and a real
 *     delivery, or by two overlapping sweeps.
 *  3. **One bad charge does not stop the sweep.** It runs unattended; a
 *     provider hiccup on the first row must not hide the paid one behind it.
 */

const { queryMock, getChargeMock, processEventMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  getChargeMock: vi.fn(),
  processEventMock: vi.fn(async () => {}),
}));

vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('./pagarme-webhook.service.js', () => ({ processPagarmeEvent: processEventMock }));
vi.mock('../utils/pagarme.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/pagarme.js')>('../utils/pagarme.js');
  return { ...actual, getCharge: getChargeMock, isPagarmeConfigured: () => true };
});
vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PAGARME_SECRET_KEY: 'sk_test',
    PAGARME_API_URL: 'https://api.pagar.me/core/v5',
    PAGARME_MAX_INSTALLMENTS: 6,
    PAGARME_MIN_INSTALLMENT_AMOUNT: 20,
  },
}));

import { reconcilePendingCharges } from './reconcile.service.js';

function pending(...rows: { charge_id: string; ref: string }[]) {
  queryMock.mockResolvedValue({ rows, rowCount: rows.length });
}

function charge(id: string, status: string) {
  return { id, status, amount: 12400, payment_method: 'pix', metadata: {} };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reconcilePendingCharges', () => {
  it('liquida a cobrança que a operadora diz estar paga', async () => {
    pending({ charge_id: 'ch_1', ref: 'pedido #8' });
    getChargeMock.mockResolvedValue(charge('ch_1', 'paid'));

    const out = await reconcilePendingCharges();

    expect(out).toEqual({ checked: 1, settled: 1, failed: 0 });
    expect(processEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'charge.paid', id: 'reconcile_ch_1' })
    );
  });

  /** The whole point: local state never decides, the provider does. */
  it('não toca numa cobrança que ainda está pendente', async () => {
    pending({ charge_id: 'ch_1', ref: 'pedido #8' });
    getChargeMock.mockResolvedValue(charge('ch_1', 'pending'));

    const out = await reconcilePendingCharges();

    expect(out).toEqual({ checked: 1, settled: 0, failed: 0 });
    expect(processEventMock).not.toHaveBeenCalled();
  });

  it.each([['failed'], ['canceled'], ['not_authorized']])(
    'não liquida uma cobrança %s',
    async (status) => {
      pending({ charge_id: 'ch_1', ref: 'pedido #8' });
      getChargeMock.mockResolvedValue(charge('ch_1', status as string));

      await reconcilePendingCharges();

      expect(processEventMock).not.toHaveBeenCalled();
    }
  );

  /**
   * The event id is derived from the charge, not from the clock — so the claim
   * in `processed_webhooks` matches across runs and a second sweep settles
   * nothing again.
   */
  it('usa uma chave de evento estável entre execuções', async () => {
    pending({ charge_id: 'ch_1', ref: 'pedido #8' });
    getChargeMock.mockResolvedValue(charge('ch_1', 'paid'));

    await reconcilePendingCharges();
    await reconcilePendingCharges();

    const ids = processEventMock.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(ids).toEqual(['reconcile_ch_1', 'reconcile_ch_1']);
  });

  /** It runs unattended: one bad row must not hide the paid one behind it. */
  it('segue em frente quando uma cobrança falha', async () => {
    pending(
      { charge_id: 'ch_ruim', ref: 'pedido #8' },
      { charge_id: 'ch_bom', ref: 'pedido #9' }
    );
    getChargeMock
      .mockRejectedValueOnce(new Error('502 bad gateway'))
      .mockResolvedValueOnce(charge('ch_bom', 'paid'));

    const out = await reconcilePendingCharges();

    expect(out).toEqual({ checked: 2, settled: 1, failed: 1 });
    expect(processEventMock).toHaveBeenCalledTimes(1);
  });

  it('conta como falha quando a liquidação estoura', async () => {
    pending({ charge_id: 'ch_1', ref: 'pedido #8' });
    getChargeMock.mockResolvedValue(charge('ch_1', 'paid'));
    processEventMock.mockRejectedValueOnce(new Error('deadlock'));

    const out = await reconcilePendingCharges();

    expect(out).toEqual({ checked: 1, settled: 0, failed: 1 });
  });

  it('não faz nada quando não há cobrança aberta', async () => {
    pending();

    const out = await reconcilePendingCharges();

    expect(out).toEqual({ checked: 0, settled: 0, failed: 0 });
    expect(getChargeMock).not.toHaveBeenCalled();
  });

  /** Pedidos da loja e pagamentos do clube são varridos juntos. */
  it('varre pedidos e pagamentos do clube na mesma consulta', async () => {
    pending({ charge_id: 'ch_1', ref: 'pedido #8' });
    getChargeMock.mockResolvedValue(charge('ch_1', 'pending'));

    await reconcilePendingCharges();

    const sql = String(queryMock.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('FROM orders');
    expect(sql).toContain('FROM payments');
    expect(sql).toContain('UNION ALL');
  });
});

describe('heartbeat', () => {
  /**
   * A sweep with nothing to settle logs nothing, which makes a working cron
   * indistinguishable from a stopped one. While the webhook is unregistered
   * this sweep is the *only* thing confirming payments, so "silent" must not
   * be able to mean "dead".
   */
  it('registra que rodou mesmo sem nada para liquidar', async () => {
    pending();

    await reconcilePendingCharges();

    const wrote = queryMock.mock.calls.some((c) =>
      String(c[0]).includes('last_reconcile_run')
    );
    expect(wrote, 'a varredura tem de deixar rastro').toBe(true);
  });

  it('registra também quando liquidou', async () => {
    pending({ charge_id: 'ch_1', ref: 'pedido #8' });
    getChargeMock.mockResolvedValue(charge('ch_1', 'paid'));

    await reconcilePendingCharges();

    expect(
      queryMock.mock.calls.some((c) => String(c[0]).includes('last_reconcile_run'))
    ).toBe(true);
  });

  /** Bookkeeping must never take the sweep down with it. */
  it('uma falha ao gravar o rastro não derruba a varredura', async () => {
    pending({ charge_id: 'ch_1', ref: 'pedido #8' });
    getChargeMock.mockResolvedValue(charge('ch_1', 'paid'));
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('last_reconcile_run')) throw new Error('disco cheio');
      return { rows: [{ charge_id: 'ch_1', ref: 'pedido #8' }], rowCount: 1 };
    });

    await expect(reconcilePendingCharges()).resolves.toMatchObject({ settled: 1 });
  });
});
