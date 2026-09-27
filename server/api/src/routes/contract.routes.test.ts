import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Membership contract routes over real HTTP, with the real ownership check.
 *
 * What these pin:
 *  1. A member uploads, reads, verifies and revokes only their own contract.
 *  2. The upload lands only under a real member UUID — a `memberId` of
 *     `../../x` in the multipart body used to write anywhere.
 *  3. The file must *be* a PDF (magic bytes), not just claim to be one; a fake
 *     is deleted.
 *  4. Verification recomputes the hash from the stored fields, so a tampered
 *     row reads as invalid.
 */

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-routes-'));

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));
vi.mock('../utils/upload-path.js', () => ({
  uploadDir: (_base: string, id: unknown) => (typeof id === 'string' ? path.join(tmpRoot, id) : null),
}));

const { contracts, queryMock } = vi.hoisted(() => ({
  contracts: { saveContract: vi.fn(), getActiveContract: vi.fn(), getContractHistory: vi.fn(), revokeContract: vi.fn() },
  queryMock: vi.fn(),
}));
vi.mock('../services/contract.service.js', () => contracts);
vi.mock('../config/database.js', () => ({ query: queryMock }));

import { contractRouter } from './contract.routes.js';
import { routerClient } from '../test-support/http.js';

const api = routerClient('/contracts', contractRouter);
const MEMBER = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const PDF = Buffer.from('%PDF-1.4\n%fake but with the right header');

/** Ownership answers from `members`, contract rows from `contracts`. */
function db({ owner = 'user-member', contract }: { owner?: string | null; contract?: Record<string, unknown> | null } = {}) {
  queryMock.mockImplementation(async (text: string) => {
    if (text.includes('SELECT user_id FROM members')) return { rows: owner ? [{ user_id: owner }] : [] };
    if (text.includes('FROM contracts WHERE id')) return { rows: contract ? [contract] : [] };
    return { rows: [] };
  });
}

function contractForm(memberId: string, file?: [Buffer, string, string]) {
  const f = new FormData();
  f.append('memberId', memberId);
  f.append('memberName', 'Laura Silva');
  f.append('memberCpf', '52998224725');
  f.append('memberEmail', 'laura@example.com');
  f.append('signedAt', '2026-09-27T12:00:00.000Z');
  if (file) f.append('pdf', new Blob([file[0]], { type: file[2] }), file[1]);
  return f;
}
const onDisk = () => (fs.existsSync(path.join(tmpRoot, MEMBER)) ? fs.readdirSync(path.join(tmpRoot, MEMBER)) : []);

beforeEach(() => {
  vi.clearAllMocks();
  fs.rmSync(path.join(tmpRoot, MEMBER), { recursive: true, force: true });
});
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe('upload', () => {
  it('needs a login', async () => {
    expect((await api.post('/', { form: contractForm(MEMBER) })).status).toBe(401);
  });

  it("saves the member's own contract with the caller's IP", async () => {
    db();
    contracts.saveContract.mockResolvedValue({ id: 'c1' });
    const res = await api.post('/', {
      as: 'member',
      form: contractForm(MEMBER, [PDF, 'contrato.pdf', 'application/pdf']),
      headers: { 'X-Forwarded-For': '177.10.20.30, 10.0.0.1' },
    });
    expect(res.status).toBe(201);
    expect(contracts.saveContract).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: MEMBER, ipAddress: '177.10.20.30' }),
      expect.objectContaining({ mimetype: 'application/pdf' })
    );
    expect(onDisk()).toHaveLength(1);
  });

  it('refuses a file that only claims to be a PDF, and deletes it', async () => {
    db();
    const res = await api.post('/', { as: 'member', form: contractForm(MEMBER, [Buffer.from('MZ not a pdf'), 'x.pdf', 'application/pdf']) });
    expect(res.body.code).toBe('INVALID_PDF');
    expect(onDisk()).toHaveLength(0);
    expect(contracts.saveContract).not.toHaveBeenCalled();
  });

  it('refuses a path-like memberId before anything is written', async () => {
    db();
    const res = await api.post('/', { as: 'member', form: contractForm('../../etc', [PDF, 'c.pdf', 'application/pdf']) });
    expect(res.status).toBe(400);
    expect(fs.readdirSync(tmpRoot)).toHaveLength(0);
  });

  it("refuses another member's contract, bad fields and a non-PDF type", async () => {
    db({ owner: 'user-other' });
    expect((await api.post('/', { as: 'member', form: contractForm(MEMBER, [PDF, 'c.pdf', 'application/pdf']) })).status).toBe(403);

    db();
    const bad = contractForm(MEMBER);
    bad.set('memberEmail', 'nope');
    expect((await api.post('/', { as: 'member', form: bad })).status).toBe(400);

    const png = await api.post('/', { as: 'member', form: contractForm(MEMBER, [PDF, 'c.png', 'image/png']) });
    expect(png.status).toBe(400);
    expect(png.body.code).toBe('INVALID_FILE_TYPE');
  });
});

describe('reading and revoking', () => {
  it('shows the active contract and the history to the owner only', async () => {
    db();
    contracts.getActiveContract.mockResolvedValueOnce({ id: 'c1' }).mockResolvedValueOnce(null);
    expect((await api.get(`/${MEMBER}`, { as: 'member' })).body).toEqual({ id: 'c1' });
    expect((await api.get(`/${MEMBER}`, { as: 'member' })).status).toBe(404);
    contracts.getContractHistory.mockResolvedValue([{ id: 'c1' }]);
    expect((await api.get(`/${MEMBER}/history`, { as: 'member' })).body).toEqual([{ id: 'c1' }]);

    db({ owner: 'user-other' });
    expect((await api.get(`/${MEMBER}`, { as: 'member' })).status).toBe(403);
    expect((await api.get(`/${MEMBER}/history`, { as: 'member' })).status).toBe(403);
  });

  it('revokes only with the owner and a memberId', async () => {
    db();
    contracts.revokeContract.mockResolvedValue({ revoked: true });
    await api.post('/c1/revoke', { as: 'member', body: { memberId: MEMBER, reason: 'erro no nome' } });
    expect(contracts.revokeContract).toHaveBeenCalledWith('c1', MEMBER, 'erro no nome');
    expect((await api.post('/c1/revoke', { as: 'member', body: {} })).status).toBe(400);
    db({ owner: 'user-other' });
    expect((await api.post('/c1/revoke', { as: 'member', body: { memberId: MEMBER } })).status).toBe(403);
  });
});

describe('verify', () => {
  const fields = {
    member_id: MEMBER,
    member_name: 'Laura Silva',
    member_cpf: '52998224725',
    member_email: 'laura@example.com',
    plan: 'club',
    signed_at: new Date('2026-09-27T12:00:00.000Z'),
    ip_address: '177.10.20.30',
  };
  const hash = crypto
    .createHash('sha256')
    .update([MEMBER, 'Laura Silva', '52998224725', 'laura@example.com', 'club', '2026-09-27T12:00:00.000Z', '177.10.20.30'].join('|'))
    .digest('hex');

  it('confirms an untouched contract whose PDF exists', async () => {
    const pdfPath = path.join(tmpRoot, 'kept.pdf');
    fs.writeFileSync(pdfPath, PDF);
    db({ contract: { ...fields, document_hash: hash, pdf_path: pdfPath } });
    const res = await api.get('/c1/verify', { as: 'member' });
    expect(res.body).toMatchObject({ valid: true, pdfExists: true, dataHash: { matches: true } });
  });

  it('flags a tampered row and a missing PDF', async () => {
    db({ contract: { ...fields, member_cpf: '11144477735', document_hash: hash, pdf_path: null } });
    expect((await api.get('/c1/verify', { as: 'admin' })).body).toMatchObject({ valid: false, dataHash: { matches: false } });

    db({ contract: { ...fields, document_hash: hash, pdf_path: path.join(tmpRoot, 'gone.pdf') } });
    expect((await api.get('/c1/verify', { as: 'admin' })).body).toMatchObject({ valid: false, pdfExists: false });
  });

  it("404s an unknown contract and 403s someone else's", async () => {
    db({ contract: null });
    expect((await api.get('/nope/verify', { as: 'admin' })).body.code).toBe('CONTRACT_NOT_FOUND');
    db({ owner: 'user-other', contract: { ...fields, document_hash: hash } });
    expect((await api.get('/c1/verify', { as: 'member' })).status).toBe(403);
  });
});
