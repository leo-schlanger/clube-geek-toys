import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * O que estes testes travam:
 *
 * Até 15/08/2026 o `ensureSchema()` era um `try` único em volta de ~460 linhas
 * de DDL. Uma etapa que falhasse abortava todas as seguintes — em silêncio, com
 * a API servindo tráfego e o `/health` respondendo `ok`. Um schema pela metade
 * em produção só apareceria quando uma tela quebrasse.
 *
 * A garantia agora é: falha isolada por etapa, e o estado visível de fora.
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

  it('uma etapa quebrada NÃO cancela as demais — era a regressão silenciosa', async () => {
    // Simula o pior caso real: um `ALTER TABLE` cedo na lista morre (permissão,
    // lock, tipo incompatível). As migrations 013–019 vinham depois dele.
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

    // A prova: o total de statements executados tem que continuar alto. Com o
    // `try` único isto pararia em 3.
    expect(calls).toBeGreaterThan(50);
  });

  it('conta cada etapa que falha, não só a primeira', async () => {
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
    // Cada falha nomeia a etapa, para o operador saber onde olhar.
    for (const f of state.failed) {
      expect(f.step).toBeTruthy();
    }
  });

  it('getSchemaState começa em pending e passa a refletir a última execução', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const { ensureSchema, getSchemaState } = await loadFresh();

    // Antes do boot terminar, o /health não pode afirmar que está ok.
    expect(getSchemaState().status).toBe('pending');
    expect(getSchemaState().ranAt).toBeNull();

    await ensureSchema();

    expect(getSchemaState().status).toBe('ok');
    expect(getSchemaState().ranAt).not.toBeNull();
  });

  it('nunca lança — a API tem que subir mesmo com o banco recusando DDL', async () => {
    queryMock.mockRejectedValue(new Error('connection terminated'));
    const { ensureSchema } = await loadFresh();

    await expect(ensureSchema()).resolves.toMatchObject({ status: 'degraded' });
  });
});
