import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `ensureSchema()` used to be a single `try` around ~460 lines of DDL: one
 * failing step aborted every later one, silently, while the API served traffic
 * and `/health` answered `ok`. A half-applied schema only surfaced when a
 * screen broke.
 *
 * The guarantee pinned here: failures stay isolated per step, and the state is
 * visible from outside.
 */

const queryMock = vi.hoisted(() => vi.fn());

vi.mock('../config/database.js', () => ({
  query: queryMock,
}));

async function loadFresh() {
  vi.resetModules();
  return import('./ensure-schema.js');
}

describe('ensureSchema — isolamento de falha por etapa', () => {
  beforeEach(() => {
    queryMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('roda todas as etapas e reporta ok quando nada falha', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const { ensureSchema } = await loadFresh();

    const state = await ensureSchema();

    expect(state.status).toBe('ok');
    expect(state.failed).toEqual([]);
    expect(state.total).toBeGreaterThan(10);
    expect(state.ranAt).not.toBeNull();
  });

  it('a broken step does NOT cancel the others, which was the silent regression', async () => {
    // Worst realistic case: an early `ALTER TABLE` dies (permissions, lock,
    // incompatible type) with migrations 013-019 queued behind it.
    let calls = 0;
    queryMock.mockImplementation(async () => {
      calls += 1;
      if (calls === 3) throw new Error('permission denied for table members');
      return { rows: [] };
    });
    const { ensureSchema } = await loadFresh();

    const state = await ensureSchema();

    expect(state.status).toBe('degraded');
    expect(state.failed).toHaveLength(1);
    expect(state.failed[0].error).toMatch(/permission denied/);

    // The proof: the executed statement count stays high. Under the single
    // `try` it stopped at 3.
    expect(calls).toBeGreaterThan(50);
  });

  it('counts every failing step, not just the first', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/CREATE TABLE IF NOT EXISTS/.test(sql)) {
        throw new Error('disk full');
      }
      return { rows: [] };
    });
    const { ensureSchema } = await loadFresh();

    const state = await ensureSchema();

    expect(state.status).toBe('degraded');
    expect(state.failed.length).toBeGreaterThan(1);
    // Each failure names its step so an operator knows where to look.
    for (const f of state.failed) {
      expect(f.step).toBeTruthy();
    }
  });

  it('getSchemaState starts pending and then reflects the last run', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const { ensureSchema, getSchemaState } = await loadFresh();

    // Before boot finishes, /health must not claim to be ok.
    expect(getSchemaState().status).toBe('pending');
    expect(getSchemaState().ranAt).toBeNull();

    await ensureSchema();

    expect(getSchemaState().status).toBe('ok');
    expect(getSchemaState().ranAt).not.toBeNull();
  });

  it('never throws: the API must boot even when the database refuses DDL', async () => {
    queryMock.mockRejectedValue(new Error('connection terminated'));
    const { ensureSchema } = await loadFresh();

    await expect(ensureSchema()).resolves.toMatchObject({ status: 'degraded' });
  });
});
