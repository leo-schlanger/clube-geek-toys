import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Gallery albums for the institutional site. What these pin:
 *
 *  1. An album never holds more than MAX_PHOTOS_PER_ALBUM: the overflow is
 *     returned as `rejected` (the route deletes those files).
 *  2. Slugs stay unique — a second "Evento K-pop" becomes `evento-k-pop-2`.
 *  3. Removing the photo that was the pinned cover falls back to the automatic
 *     cover instead of pointing at a deleted file.
 *  4. Deleting an album hands back every photo URL, so no file is orphaned.
 */

const { queryMock, clientQuery, release, auditMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  auditMock: vi.fn(async () => {}),
}));
vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQuery, release }),
}));
vi.mock('../config/env.js', () => ({ env: {} }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));

import {
  MAX_PHOTOS_PER_ALBUM,
  addPhotos,
  createAlbum,
  deleteAlbum,
  deletePhoto,
  getAlbum,
  listAlbums,
  reorderPhotos,
  updateAlbum,
  updatePhoto,
} from './gallery.service.js';

const ALBUM = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const albumRow = (over: Record<string, unknown> = {}) => ({
  id: ALBUM, name: 'Evento K-pop', slug: 'evento-k-pop', event_date: '2026-09-20T00:00:00.000Z', active: true, sort_order: 0, photo_count: '2', created_at: 'x', updated_at: 'x', ...over,
});

beforeEach(() => {
  queryMock.mockReset();
  clientQuery.mockReset();
  release.mockReset();
  auditMock.mockClear();
});

describe('albums', () => {
  it('lists active albums unless asked for all', async () => {
    queryMock.mockResolvedValue({ rows: [albumRow()] });
    const [a] = await listAlbums();
    expect(queryMock.mock.calls[0][0]).toContain('WHERE a.active = TRUE');
    expect(a).toMatchObject({ eventDate: '2026-09-20', photoCount: 2 });
    await listAlbums(true);
    expect(queryMock.mock.calls[1][0]).not.toContain('WHERE a.active = TRUE');
  });

  it('opens an album by slug or id with its photos', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [albumRow()] })
      .mockResolvedValueOnce({ rows: [{ id: 'ph1', album_id: ALBUM, url: 'u', sort_order: '1', created_at: 'x' }] });
    const album = await getAlbum('evento-k-pop');
    expect(queryMock.mock.calls[0][0]).toContain('a.slug = $1');
    expect(album?.photos).toEqual([{ id: 'ph1', albumId: ALBUM, url: 'u', caption: null, sortOrder: 1, createdAt: 'x' }]);

    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getAlbum(ALBUM, true)).toBeNull();
    expect(queryMock.mock.calls.at(-1)![0]).toContain('a.id = $1');
  });

  it('creates with a unique slug', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{}] }) // "evento-k-pop" taken
      .mockResolvedValueOnce({ rows: [] }) // "evento-k-pop-2" free
      .mockResolvedValueOnce({ rows: [albumRow({ slug: 'evento-k-pop-2' })] });
    const album = await createAlbum({ name: 'Evento K-pop!', eventDate: '' }, 'admin-1');
    const insert = queryMock.mock.calls[2];
    expect(insert[1]).toEqual(['Evento K-pop!', 'evento-k-pop-2', null, null, true, 0]);
    expect(album.photoCount).toBe(0);
    expect(auditMock).toHaveBeenCalledWith('gallery.album_created', 'admin-1', { albumId: ALBUM, slug: 'evento-k-pop-2' });
  });

  it('updates only the fields sent, re-slugging on a new name', async () => {
    queryMock.mockImplementation(async (text: string) => {
      if (text.startsWith('SELECT 1 FROM gallery_albums')) return { rows: [] };
      if (text.includes('UPDATE gallery_albums')) return { rows: [{ id: ALBUM }] };
      if (text.includes('FROM gallery_albums a')) return { rows: [albumRow({ name: 'Novo' })] };
      return { rows: [] };
    });
    const album = await updateAlbum(ALBUM, { name: 'Novo', eventDate: '', active: false, ignored: 1 }, 'admin-1');
    const update = queryMock.mock.calls.find(([sql]) => String(sql).includes('UPDATE gallery_albums'))!;
    expect(update[0]).toContain('name = $1, event_date = $2, active = $3, slug = $4');
    expect(update[1]).toEqual(['Novo', null, false, 'novo', ALBUM]);
    expect(album.name).toBe('Novo');
  });

  it('404s when the album is gone', async () => {
    queryMock.mockImplementation(async (text: string) => (text.includes('UPDATE') ? { rows: [] } : { rows: [] }));
    await expect(updateAlbum(ALBUM, { active: true }, 'a')).rejects.toMatchObject({ code: 'ALBUM_NOT_FOUND' });
    await expect(updateAlbum(ALBUM, {}, 'a')).rejects.toMatchObject({ code: 'ALBUM_NOT_FOUND' });
  });

  it('deletes an album and returns its photo URLs', async () => {
    clientQuery.mockImplementation(async (text: string) => {
      if (text.includes('SELECT url')) return { rows: [{ url: 'a.jpg' }, { url: 'b.jpg' }] };
      if (text.includes('DELETE FROM gallery_albums')) return { rows: [{ id: ALBUM }] };
      return { rows: [] };
    });
    expect(await deleteAlbum(ALBUM, 'admin-1')).toEqual(['a.jpg', 'b.jpg']);
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');

    clientQuery.mockImplementation(async () => ({ rows: [] }));
    await expect(deleteAlbum(ALBUM, 'admin-1')).rejects.toMatchObject({ code: 'ALBUM_NOT_FOUND' });
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(2);
  });
});

describe('photos', () => {
  it('appends after the last one and returns the overflow', async () => {
    queryMock.mockImplementation(async (text: string, params: unknown[]) => {
      if (text.includes('COUNT(*)::int AS total')) return { rows: [{ total: MAX_PHOTOS_PER_ALBUM - 1, max_sort: 7 }] };
      if (text.startsWith('SELECT 1 FROM gallery_albums')) return { rows: [{}] };
      if (text.includes('INSERT INTO gallery_photos')) return { rows: [{ id: 'n', album_id: ALBUM, url: params[1], sort_order: params[2] }] };
      return { rows: [] };
    });
    const res = await addPhotos(ALBUM, ['a.jpg', 'b.jpg', 'c.jpg']);
    expect(res.accepted).toEqual(['a.jpg']);
    expect(res.rejected).toEqual(['b.jpg', 'c.jpg']);
    expect(res.photos[0].sortOrder).toBe(8);
  });

  it('refuses a full album and a missing one', async () => {
    queryMock.mockImplementation(async (text: string) => {
      if (text.includes('COUNT(*)::int AS total')) return { rows: [{ total: MAX_PHOTOS_PER_ALBUM, max_sort: 0 }] };
      if (text.startsWith('SELECT 1 FROM gallery_albums')) return { rows: [{}] };
      return { rows: [] };
    });
    await expect(addPhotos(ALBUM, ['a.jpg'])).rejects.toMatchObject({ code: 'PHOTO_LIMIT_REACHED' });

    queryMock.mockImplementation(async (text: string) =>
      text.includes('COUNT(*)') ? { rows: [{ total: 0, max_sort: -1 }] } : { rows: [] }
    );
    await expect(addPhotos(ALBUM, ['a.jpg'])).rejects.toMatchObject({ code: 'ALBUM_NOT_FOUND' });
  });

  it('removing the pinned cover falls back to the automatic one', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ url: 'cover.jpg' }] }).mockResolvedValueOnce({ rows: [] });
    expect(await deletePhoto(ALBUM, 'ph1', 'admin-1')).toBe('cover.jpg');
    expect(queryMock).toHaveBeenLastCalledWith(expect.stringContaining('SET cover_url = NULL'), [ALBUM, 'cover.jpg']);

    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(deletePhoto(ALBUM, 'nope', 'admin-1')).rejects.toMatchObject({ code: 'PHOTO_NOT_FOUND' });
  });

  it('reorders inside a transaction, and rolls back on failure', async () => {
    clientQuery.mockResolvedValue({ rows: [] });
    queryMock.mockResolvedValue({ rows: [] });
    await reorderPhotos(ALBUM, ['p2', 'p1']);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('SET sort_order = $1'), [0, 'p2', ALBUM]);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('SET sort_order = $1'), [1, 'p1', ALBUM]);

    clientQuery.mockImplementation(async (text: string) => {
      if (text.includes('UPDATE')) throw new Error('db');
      return { rows: [] };
    });
    await expect(reorderPhotos(ALBUM, ['p1'])).rejects.toThrow('db');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('trims a caption, blank meaning none', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'ph1', album_id: ALBUM, url: 'u', caption: null }] });
    await updatePhoto(ALBUM, 'ph1', '   ');
    expect(queryMock.mock.calls[0][1]).toEqual([null, 'ph1', ALBUM]);
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(updatePhoto(ALBUM, 'x', 'oi')).rejects.toMatchObject({ code: 'PHOTO_NOT_FOUND' });
  });
});
