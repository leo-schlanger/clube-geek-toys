import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Runs the real node-cron on a fake clock: the schedule strings and the library
 * are what matter here, and a mocked `cron.schedule` would prove neither. The
 * payment reconciliation is the job a silent break would cost the most — a paid
 * order would sit `pending` with nobody told.
 */

const { query, reconcile, syncShipments, alertOpsAsync, logWarn } = vi.hoisted(() => ({
  query: vi.fn(async (..._args: unknown[]) => ({ rows: [] as unknown[], rowCount: 0 })),
  reconcile: vi.fn(async () => undefined),
  syncShipments: vi.fn(async () => 0),
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
vi.mock('./label.service.js', () => ({ syncShipments }))
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

  it('registers the three schedules', () => {
    const patterns = [...cron.getTasks().values()].map((t) => t.getPattern()).sort()
    expect(patterns).toEqual(['*/10 * * * *', '*/15 * * * *', '0 6 * * *'])
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
