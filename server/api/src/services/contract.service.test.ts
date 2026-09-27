import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Membership contracts. What these pin:
 *
 *  1. Signing supersedes the member's previous active contract in the same
 *     transaction — there is never more than one active.
 *  2. The signing time is the server's, never the client's.
 *  3. The PDF's SHA-256 is stored, so a swapped file can be told apart later.
 *  4. Revoking touches only the member's own active contract, and leaves an
 *     audit row.
 */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-svc-'));
const { clientQuery, release, queryMock } = vi.hoisted(() => ({ clientQuery: vi.fn(), release: vi.fn(), queryMock: vi.fn() }));
vi.mock('../config/database.js', () => ({ query: queryMock, getClient: async () => ({ query: clientQuery, release }) }));
vi.mock('../config/env.js', () => ({ env: { API_URL: 'https://api.geeketoys.com.br' } }));

import { getActiveContract, getContractHistory, revokeContract, saveContract } from './contract.service.js';

const MEMBER = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const data = {
  memberId: MEMBER, memberName: 'Laura', memberCpf: '52998224725', memberEmail: 'l@example.com', plan: 'club',
  signedAt: '2000-01-01T00:00:00.000Z', ipAddress: '177.1.2.3',
};

beforeEach(() => {
  vi.clearAllMocks();
  clientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('saveContract', () => {
  it('supersedes the old contract, stamps server time and hashes the PDF', async () => {
    const pdf = Buffer.from('%PDF-1.4 contrato');
    const filePath = path.join(tmp, 'contract_1.pdf');
    fs.writeFileSync(filePath, pdf);

    const res = await saveContract(data, { path: filePath, filename: 'contract_1.pdf' } as Express.Multer.File);

    const sql = clientQuery.mock.calls.map(([s]) => String(s).replace(/\s+/g, ' ').trim());
    expect(sql[0]).toBe('BEGIN');
    expect(sql[1]).toContain("SET status = 'superseded'");
    expect(sql.at(-1)).toBe('COMMIT');

    const insert = clientQuery.mock.calls.find(([s]) => String(s).includes('INSERT INTO contracts'))!;
    const params = insert[1] as unknown[];
    expect(params[7]).not.toBe('2000-01-01T00:00:00.000Z'); // server time, not the client's
    expect(params[11]).toBe(`https://api.geeketoys.com.br/uploads/contracts/${MEMBER}/contract_1.pdf`);
    expect(params[13]).toBe(crypto.createHash('sha256').update(pdf).digest('hex'));
    expect(res).toMatchObject({ status: 'active', pdfUrl: params[11] });
    expect(release).toHaveBeenCalled();
  });

  it('saves without a PDF, and rolls back on failure', async () => {
    await saveContract(data);
    const insert = clientQuery.mock.calls.find(([s]) => String(s).includes('INSERT INTO contracts'))!;
    expect((insert[1] as unknown[]).slice(11, 14)).toEqual([null, null, null]);

    clientQuery.mockImplementation(async (s: string) => {
      if (s.includes('INSERT INTO contracts')) throw new Error('db');
      return { rows: [] };
    });
    await expect(saveContract(data)).rejects.toThrow('db');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });
});

describe('reading and revoking', () => {
  it('maps the active contract and the history', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'c1', member_id: MEMBER, status: 'active', pdf_hash: 'h' }] }).mockResolvedValueOnce({ rows: [] });
    expect(await getActiveContract(MEMBER)).toMatchObject({ id: 'c1', memberId: MEMBER, pdfHash: 'h' });
    expect(await getActiveContract(MEMBER)).toBeNull();
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'c1' }, { id: 'c0' }] });
    expect((await getContractHistory(MEMBER)).map((c) => c.id)).toEqual(['c1', 'c0']);
  });

  it("revokes only the member's own active contract, with an audit row", async () => {
    const res = await revokeContract('c1', MEMBER, 'nome errado');
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'revoked'"), ['c1', MEMBER]);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('contract_revoked'), [MEMBER, expect.stringContaining('nome errado')]);
    expect(res.contractId).toBe('c1');

    clientQuery.mockImplementation(async (s: string) => (s.includes('UPDATE contracts') ? { rows: [], rowCount: 0 } : { rows: [] }));
    await expect(revokeContract('c9', MEMBER)).rejects.toMatchObject({ statusCode: 404 });
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });
});
