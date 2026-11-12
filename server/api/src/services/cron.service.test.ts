import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Runs the real node-cron on a fake clock: the schedule strings and the library
 * are what matter here, and a mocked `cron.schedule` would prove neither. The
 * payment reconciliation is the job a silent break would cost the most — a paid
 * order would sit `pending` with nobody told.
 */

const { query, reconcile, syncShipments, sendClubSignupReminders, alertOpsAsync, logWarn } = vi.hoisted(() => ({
  query: vi.fn(async (..._args: unknown[]) => ({ rows: [] as unknown[], rowCount: 0 })),
  reconcile: vi.fn(async () => undefined),
  syncShipments: vi.fn(async () => 0),
  sendClubSignupReminders: vi.fn(async () => 0),
  alertOpsAsync: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule)
vi.mock('../config/database.js', () => ({ query }))
vi.mock('./email.service.js', () => ({ sendTemplateEmail: vi.fn(async () => undefined) }))
vi.mock('./report.service.js', () => ({
  getActionItems: vi.fn(async () => ({ totalPending: 0, items: [] })),
}))
vi.mock('./order.service.js', () => ({ releaseReservationById: vi.fn(async () => true) }))
vi.mock('./auth.service.js', () => ({ purgeExpiredRefreshSessions: vi.fn(async () => 0) }))
vi.mock('./reconcile.service.js', () => ({ reconcilePendingCharges: reconcile }))
vi.mock('./label.service.js', () => ({
  syncShipments,
  isTransientMelhorEnvioError: (err: { code?: string }) => err?.code === 'MELHOR_ENVIO_UNREACHABLE',
}))
vi.mock('./recovery.service.js', () => ({ sendClubSignupReminders }))
vi.mock('./ops-alert.service.js', () => ({ alertOpsAsync }))
vi.mock('../config/logger.js', () => {
  const log = { info: vi.fn(), warn: logWarn, error: vi.fn(), debug: vi.fn() }
  return { moduleLogger: () => log }
})

import cron from 'node-cron'
import { initCronJobs } from './cron.service.js'

/** Lets the async job bodies settle after the timer fired. */
async function tick(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('initCronJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Local time: node-cron reads the process clock, and production runs in UTC.
    vi.setSystemTime(new Date(2026, 9, 6, 5, 59, 50))
    initCronJobs()
  })

  afterEach(async () => {
    for (const task of cron.getTasks().values()) await task.destroy()
    vi.useRealTimers()
  })

  it('registers the four schedules', () => {
    const patterns = [...cron.getTasks().values()].map((t) => t.getPattern()).sort()
    expect(patterns).toEqual(['*/10 * * * *', '*/15 * * * *', '0 13 * * *', '0 6 * * *'])
  })

  it('sends the club sign-up reminders at 13:00 UTC (10:00 in Rio), not with the 03:00 jobs', async () => {
    await tick(15_000) // 06:00:05
    expect(sendClubSignupReminders).not.toHaveBeenCalled()
    await tick(7 * 60 * 60_000 - 60_000) // 12:59:05
    expect(sendClubSignupReminders).not.toHaveBeenCalled()
    await tick(60_000) // 13:00:05
    expect(sendClubSignupReminders).toHaveBeenCalledTimes(1)
  })

  it('runs the payment reconciliation every ten minutes', async () => {
    await tick(15_000) // 06:00:05
    expect(reconcile).toHaveBeenCalledTimes(1)
    await tick(10 * 60_000) // 06:10:05
    expect(reconcile).toHaveBeenCalledTimes(2)
  })

  it('runs the shipment sync every fifteen minutes', async () => {
    await tick(15_000)
    expect(syncShipments).toHaveBeenCalledTimes(1)
    await tick(10 * 60_000)
    expect(syncShipments).toHaveBeenCalledTimes(1)
    await tick(5 * 60_000)
    expect(syncShipments).toHaveBeenCalledTimes(2)
  })

  it('runs the daily jobs at 06:00 and records the run', async () => {
    await tick(5_000) // 05:59:55 — not yet
    expect(query.mock.calls.some(([sql]) => String(sql).includes('last_cron_run'))).toBe(false)
    await tick(10_000)
    expect(query.mock.calls.some(([sql]) => String(sql).includes('last_cron_run'))).toBe(true)
  })

  it('a failing job alerts ops and does not stop the next run', async () => {
    reconcile.mockRejectedValueOnce(new Error('pagar.me down'))
    await tick(15_000)
    expect(alertOpsAsync).toHaveBeenCalledWith(expect.objectContaining({ kind: 'cron_failed' }))
    await tick(10 * 60_000)
    expect(reconcile).toHaveBeenCalledTimes(2)
  })

  describe('shipment sync alerts', () => {
    /** What `meRequest` throws when Melhor Envio does not answer. */
    const unreachable = () =>
      Object.assign(new Error('Não conseguimos falar com o Melhor Envio. Tente novamente em instantes.'), {
        code: 'MELHOR_ENVIO_UNREACHABLE',
        details: { cause: 'sem resposta em 20 s', request: 'POST /me/shipment/tracking' },
      })
    const syncAlerts = () =>
      alertOpsAsync.mock.calls.filter(([a]) => String((a as { subject: string }).subject).includes('envios'))

    // 11/11/2026: one 20 s timeout between healthy runs woke the team up.
    it('one or two missed runs do not alert', async () => {
      syncShipments.mockRejectedValueOnce(unreachable()).mockRejectedValueOnce(unreachable())
      await tick(15_000) // 06:00
      await tick(15 * 60_000) // 06:15
      expect(syncShipments).toHaveBeenCalledTimes(2)
      expect(syncAlerts()).toHaveLength(0)
      expect(logWarn).toHaveBeenCalledWith(expect.objectContaining({ streak: 2 }), expect.any(String))
    })

    it('three runs in a row alert, with the real cause', async () => {
      syncShipments.mockRejectedValue(unreachable())
      await tick(15_000)
      await tick(15 * 60_000)
      expect(syncAlerts()).toHaveLength(0)
      await tick(15 * 60_000) // 06:30
      expect(syncAlerts()).toHaveLength(1)
      const body = (syncAlerts()[0]![0] as { body: string }).body
      expect(body).toContain('3 execuções seguidas, uma a cada 15 min')
      expect(body).toContain('MELHOR_ENVIO_UNREACHABLE, sem resposta em 20 s, POST /me/shipment/tracking')
      syncShipments.mockReset()
      syncShipments.mockResolvedValue(0)
    })

    it('a good run in between starts the count over', async () => {
      syncShipments
        .mockRejectedValueOnce(unreachable())
        .mockRejectedValueOnce(unreachable())
        .mockResolvedValueOnce(0)
        .mockRejectedValueOnce(unreachable())
        .mockRejectedValueOnce(unreachable())
      await tick(15_000)
      for (let i = 0; i < 4; i++) await tick(15 * 60_000)
      expect(syncShipments).toHaveBeenCalledTimes(5)
      expect(syncAlerts()).toHaveLength(0)
    })

    it('a token problem alerts at once: it will not fix itself', async () => {
      syncShipments.mockRejectedValueOnce(
        Object.assign(new Error('O token do Melhor Envio não tem permissão'), { code: 'MELHOR_ENVIO_SCOPE_MISSING' }),
      )
      await tick(15_000)
      expect(syncAlerts()).toHaveLength(1)
      expect((syncAlerts()[0]![0] as { body: string }).body).toContain('(MELHOR_ENVIO_SCOPE_MISSING)')
    })
  })

  // A failing shipment sync used to mute the reconciliation alert for 6 h.
  it('each job waits on its own alert cooldown', async () => {
    reconcile.mockRejectedValueOnce(new Error('pagar.me down'))
    syncShipments.mockRejectedValueOnce(Object.assign(new Error('sem permissão'), { code: 'MELHOR_ENVIO_SCOPE_MISSING' }))
    await tick(15_000)
    const keys = alertOpsAsync.mock.calls.map(([a]) => (a as { cooldownKey?: string }).cooldownKey)
    expect(keys).toEqual(
      expect.arrayContaining(['cron_failed_conciliacao_de_pagamentos', 'cron_failed_sincronizacao_de_envios']),
    )
  })

  it("sends node-cron's own warnings to the module logger, not the console", async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Jumping the clock past a slot without the timer firing is how a blocked
    // event loop looks to node-cron: it reports the missed execution.
    vi.setSystemTime(new Date(2026, 9, 6, 6, 30, 0))
    await tick(60_000)
    expect(consoleWarn).not.toHaveBeenCalled()
    expect(logWarn).toHaveBeenCalledWith(expect.stringMatching(/missed execution/))
    consoleWarn.mockRestore()
  })
})
