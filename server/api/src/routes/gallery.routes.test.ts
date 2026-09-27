import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Gallery routes over real HTTP.
 *
 * The public albums feed the institutional site; everything else is admin.
 * Uploads judge the bytes (a phone's MIME type lies), and a batch the service
 * cannot take leaves nothing behind on disk.
 */

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-routes-'));

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../middleware/rate-limit.js', async () => (await import('../test-support/env.js')).rateLimitModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));
vi.mock('../utils/upload-path.js', () => ({
  uploadDir: (_base: string, id: unknown) =>
    typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? path.join(tmpRoot, id) : null,
}));

const svc = vi.hoisted(() => ({
  listAlbums: vi.fn(),
  getAlbum: vi.fn(),
  createAlbum: vi.fn(),
  updateAlbum: vi.fn(),
  deleteAlbum: vi.fn(),
  addPhotos: vi.fn(),
  deletePhoto: vi.fn(),
  updatePhoto: vi.fn(),
  reorderPhotos: vi.fn(),
}));
vi.mock('../services/gallery.service.js', () => ({ ...svc, MAX_PHOTO_UPLOAD_BATCH: 3 }));

import { galleryRouter } from './gallery.routes.js';
import { routerClient } from '../test-support/http.js';

const api = routerClient('/gallery', galleryRouter);
const ALBUM = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const PHOTO = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);

function photos(files: Array<[Buffer, string, string]>) {
  const f = new FormData();
  for (const [bytes, name, type] of files) f.append('photos', new Blob([bytes], { type }), name);
  return f;
}
const onDisk = () => (fs.existsSync(path.join(tmpRoot, ALBUM)) ? fs.readdirSync(path.join(tmpRoot, ALBUM)) : []);

beforeEach(() => {
  vi.clearAllMocks();
  fs.rmSync(path.join(tmpRoot, ALBUM), { recursive: true, force: true });
});
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe('public', () => {
  it('lists active albums and opens one by slug', async () => {
    svc.listAlbums.mockResolvedValue([{ id: ALBUM }]);
    expect((await api.get('/')).body).toEqual({ albums: [{ id: ALBUM }] });
    expect(svc.listAlbums).toHaveBeenCalledWith(false);

    svc.getAlbum.mockResolvedValueOnce({ slug: 'evento' }).mockResolvedValueOnce(null);
    expect((await api.get('/evento')).body).toEqual({ slug: 'evento' });
    expect((await api.get('/nope')).status).toBe(404);
  });
});

describe('admin', () => {
  it('is admin-only', async () => {
    expect((await api.get('/admin/albums')).status).toBe(401);
    expect((await api.post('/albums', { as: 'member', body: { name: 'X' } })).status).toBe(403);
  });

  it('lists including inactive, creates, updates and deletes albums', async () => {
    svc.listAlbums.mockResolvedValue([]);
    await api.get('/admin/albums', { as: 'admin' });
    expect(svc.listAlbums).toHaveBeenCalledWith(true);

    svc.createAlbum.mockResolvedValue({ id: ALBUM });
    expect((await api.post('/albums', { as: 'admin', body: { name: 'Evento 20/09', eventDate: '2026-09-20' } })).status).toBe(201);
    expect((await api.post('/albums', { as: 'admin', body: { name: 'X', eventDate: '20/09/2026' } })).status).toBe(400);

    svc.updateAlbum.mockResolvedValue({ id: ALBUM, active: false });
    expect((await api.patch(`/albums/${ALBUM}`, { as: 'admin', body: { active: false } })).body.active).toBe(false);

    svc.deleteAlbum.mockResolvedValue([
      'https://api.geeketoys.com.br/uploads/gallery/x/a.jpg',
      'https://api.geeketoys.com.br/uploads/../../etc/passwd',
      'https://elsewhere.example/photo.jpg',
    ]);
    expect((await api.delete(`/albums/${ALBUM}`, { as: 'admin' })).status).toBe(204);
  });

  it('uploads real images and drops the rest', async () => {
    svc.addPhotos.mockImplementation(async (_id: string, urls: string[]) => ({ photos: urls.map((url) => ({ url })), rejected: [] }));
    const res = await api.post(`/albums/${ALBUM}/photos`, {
      as: 'admin',
      form: photos([
        [JPEG, 'a.jpeg', 'image/jpeg'],
        [WEBP, 'b.webp', 'image/webp'],
        [Buffer.from('nope'), 'c.jpg', 'image/jpeg'],
      ]),
    });
    expect(res.status).toBe(201);
    expect(res.body.photos).toHaveLength(2);
    expect(onDisk()).toHaveLength(2);
  });

  it('cleans up what the album cannot take and what the service refuses', async () => {
    svc.addPhotos.mockImplementationOnce(async (_id: string, urls: string[]) => ({ photos: [{ url: urls[0] }], rejected: urls.slice(1) }));
    const partial = await api.post(`/albums/${ALBUM}/photos`, {
      as: 'admin',
      form: photos([
        [JPEG, 'a.jpg', 'image/jpeg'],
        [JPEG, 'b.jpg', 'image/jpeg'],
      ]),
    });
    expect(partial.body.skippedOverLimit).toBe(1);
    expect(onDisk()).toHaveLength(1);

    fs.rmSync(path.join(tmpRoot, ALBUM), { recursive: true, force: true });
    svc.addPhotos.mockRejectedValueOnce(new Error('db down'));
    expect((await api.post(`/albums/${ALBUM}/photos`, { as: 'admin', form: photos([[JPEG, 'a.jpg', 'image/jpeg']]) })).status).toBe(500);
    expect(onDisk()).toHaveLength(0);
  });

  it('refuses no photos, only junk, a document and a bad album id', async () => {
    expect((await api.post(`/albums/${ALBUM}/photos`, { as: 'admin', form: new FormData() })).body.code).toBe('NO_PHOTOS');
    expect((await api.post(`/albums/${ALBUM}/photos`, { as: 'admin', form: photos([[Buffer.from('x'), 'x.jpg', 'image/jpeg']]) })).body.code).toBe('INVALID_IMAGE');
    expect((await api.post(`/albums/${ALBUM}/photos`, { as: 'admin', form: photos([[JPEG, 'x.pdf', 'application/pdf']]) })).body.code).toBe('INVALID_IMAGE');
    expect((await api.post('/albums/..%2Fetc/photos', { as: 'admin', form: photos([[JPEG, 'a.jpg', 'image/jpeg']]) })).status).toBe(400);
  });

  it('deletes, captions and reorders photos', async () => {
    svc.deletePhoto.mockResolvedValue('https://api.geeketoys.com.br/uploads/gallery/x/a.jpg');
    expect((await api.delete(`/albums/${ALBUM}/photos/${PHOTO}`, { as: 'admin' })).status).toBe(204);
    expect(svc.deletePhoto).toHaveBeenCalledWith(ALBUM, PHOTO, 'user-admin');

    svc.updatePhoto.mockResolvedValue({ id: PHOTO, caption: null });
    await api.patch(`/albums/${ALBUM}/photos/${PHOTO}`, { as: 'admin', body: {} });
    expect(svc.updatePhoto).toHaveBeenCalledWith(ALBUM, PHOTO, null);

    svc.reorderPhotos.mockResolvedValue([{ id: PHOTO }]);
    expect((await api.put(`/albums/${ALBUM}/photos/order`, { as: 'admin', body: { photoIds: [PHOTO] } })).body).toEqual({ photos: [{ id: PHOTO }] });
    expect((await api.put(`/albums/${ALBUM}/photos/order`, { as: 'admin', body: { photoIds: ['x'] } })).status).toBe(400);
  });
});
