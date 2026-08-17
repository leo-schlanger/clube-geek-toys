import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { auditLog } from '../utils/audit.js';

/**
 * Institutional-site gallery, organised into albums.
 *
 * Photos share the /uploads volume with product photos, under
 * uploads/gallery/:albumId. Deleting an album cascades the rows; the files are
 * removed by the route caller, which knows the disk.
 */

export const MAX_PHOTOS_PER_ALBUM = 300;
export const MAX_PHOTO_UPLOAD_BATCH = 20;

export interface GalleryPhoto {
  id: string;
  albumId: string;
  url: string;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface GalleryAlbum {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  eventDate: string | null;
  active: boolean;
  sortOrder: number;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
  photos?: GalleryPhoto[];
}

function mapPhoto(row: pg.QueryResultRow): GalleryPhoto {
  return {
    id: row.id,
    albumId: row.album_id,
    url: row.url,
    caption: row.caption ?? null,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
  };
}

function mapAlbum(row: pg.QueryResultRow): GalleryAlbum {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    coverUrl: row.cover_url ?? null,
    eventDate: row.event_date ? String(row.event_date).slice(0, 10) : null,
    active: row.active !== false,
    sortOrder: Number(row.sort_order) || 0,
    photoCount: row.photo_count != null ? Number(row.photo_count) : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 160);
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || 'album';
  let candidate = root;
  let n = 1;
  for (;;) {
    const result = await query(
      `SELECT 1 FROM gallery_albums WHERE slug = $1 ${excludeId ? 'AND id <> $2' : ''} LIMIT 1`,
      excludeId ? [candidate, excludeId] : [candidate]
    );
    if (result.rows.length === 0) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

/** Cover comes from the column, falling back to the album's first photo. */
const ALBUM_SELECT = `
  SELECT a.*,
         (SELECT COUNT(*) FROM gallery_photos p WHERE p.album_id = a.id) AS photo_count,
         COALESCE(a.cover_url, (
           SELECT p.url FROM gallery_photos p
           WHERE p.album_id = a.id
           ORDER BY p.sort_order, p.created_at
           LIMIT 1
         )) AS cover_url
  FROM gallery_albums a`;

export async function listAlbums(includeInactive = false): Promise<GalleryAlbum[]> {
  const result = await query(
    `${ALBUM_SELECT}
     ${includeInactive ? '' : 'WHERE a.active = TRUE'}
     ORDER BY a.sort_order ASC, a.event_date DESC NULLS LAST, a.created_at DESC`
  );
  return result.rows.map(mapAlbum);
}

export async function getAlbum(
  slugOrId: string,
  includeInactive = false
): Promise<GalleryAlbum | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId);
  const result = await query(
    `${ALBUM_SELECT}
     WHERE ${isUuid ? 'a.id' : 'a.slug'} = $1 ${includeInactive ? '' : 'AND a.active = TRUE'}`,
    [slugOrId]
  );
  if (result.rows.length === 0) return null;

  const album = mapAlbum(result.rows[0]);
  const photos = await query(
    `SELECT * FROM gallery_photos WHERE album_id = $1 ORDER BY sort_order, created_at`,
    [album.id]
  );
  return { ...album, photos: photos.rows.map(mapPhoto) };
}

export async function createAlbum(
  data: {
    name: string;
    description?: string | null;
    eventDate?: string | null;
    active?: boolean;
    sortOrder?: number;
  },
  actorUserId: string
): Promise<GalleryAlbum> {
  const slug = await uniqueSlug(data.name);
  const result = await query(
    `INSERT INTO gallery_albums (name, slug, description, event_date, active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      data.name,
      slug,
      data.description ?? null,
      data.eventDate || null,
      data.active ?? true,
      data.sortOrder ?? 0,
    ]
  );
  await auditLog('gallery.album_created', actorUserId, { albumId: result.rows[0].id, slug });
  return mapAlbum({ ...result.rows[0], photo_count: 0 });
}

export async function updateAlbum(
  id: string,
  data: Record<string, unknown>,
  actorUserId: string
): Promise<GalleryAlbum> {
  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    coverUrl: 'cover_url',
    eventDate: 'event_date',
    active: 'active',
    sortOrder: 'sort_order',
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data && data[key] !== undefined) {
      sets.push(`${col} = $${i++}`);
      // An empty date means "no date", not an empty string (the column is DATE).
      values.push(col === 'event_date' ? (data[key] || null) : data[key]);
    }
  }
  if (typeof data.name === 'string' && data.name.trim()) {
    sets.push(`slug = $${i++}`);
    values.push(await uniqueSlug(data.name, id));
  }

  if (sets.length > 0) {
    values.push(id);
    const updated = await query(
      `UPDATE gallery_albums SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`,
      values
    );
    if (updated.rows.length === 0) {
      throw new AppError(404, 'Álbum não encontrado.', 'ALBUM_NOT_FOUND');
    }
    await auditLog('gallery.album_updated', actorUserId, { albumId: id });
  }

  const album = await getAlbum(id, true);
  if (!album) throw new AppError(404, 'Álbum não encontrado.', 'ALBUM_NOT_FOUND');
  return album;
}

/**
 * Removes the album and returns the photo URLs so the caller can delete files.
 * As linhas de gallery_photos somem por ON DELETE CASCADE.
 */
export async function deleteAlbum(id: string, actorUserId: string): Promise<string[]> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const photos = await client.query(`SELECT url FROM gallery_photos WHERE album_id = $1`, [id]);
    const removed = await client.query(`DELETE FROM gallery_albums WHERE id = $1 RETURNING id`, [
      id,
    ]);
    if (removed.rows.length === 0) {
      throw new AppError(404, 'Álbum não encontrado.', 'ALBUM_NOT_FOUND');
    }
    await client.query('COMMIT');
    await auditLog('gallery.album_deleted', actorUserId, {
      albumId: id,
      photos: photos.rows.length,
    });
    return photos.rows.map((r) => r.url as string);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface AddPhotosResult {
  photos: GalleryPhoto[];
  accepted: string[];
  rejected: string[];
}

/** Appends photos, honouring MAX_PHOTOS_PER_ALBUM. */
export async function addPhotos(albumId: string, urls: string[]): Promise<AddPhotosResult> {
  const current = await query(
    `SELECT COUNT(*)::int AS total, COALESCE(MAX(sort_order), -1) AS max_sort
     FROM gallery_photos WHERE album_id = $1`,
    [albumId]
  );
  const exists = await query(`SELECT 1 FROM gallery_albums WHERE id = $1`, [albumId]);
  if (exists.rows.length === 0) {
    throw new AppError(404, 'Álbum não encontrado.', 'ALBUM_NOT_FOUND');
  }

  const total = Number(current.rows[0].total);
  const room = Math.max(0, MAX_PHOTOS_PER_ALBUM - total);
  const accepted = urls.slice(0, room);
  const rejected = urls.slice(room);

  if (accepted.length === 0) {
    throw new AppError(
      400,
      `Este álbum já tem ${total} fotos (máximo ${MAX_PHOTOS_PER_ALBUM}).`,
      'PHOTO_LIMIT_REACHED'
    );
  }

  let sort = Number(current.rows[0].max_sort) + 1;
  const inserted: GalleryPhoto[] = [];
  for (const url of accepted) {
    const row = await query(
      `INSERT INTO gallery_photos (album_id, url, sort_order) VALUES ($1, $2, $3) RETURNING *`,
      [albumId, url, sort++]
    );
    inserted.push(mapPhoto(row.rows[0]));
  }
  return { photos: inserted, accepted, rejected };
}

/** Removes a photo and returns its URL so the caller can delete the file. */
export async function deletePhoto(
  albumId: string,
  photoId: string,
  actorUserId: string
): Promise<string> {
  const result = await query(
    `DELETE FROM gallery_photos WHERE id = $1 AND album_id = $2 RETURNING url`,
    [photoId, albumId]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Foto não encontrada.', 'PHOTO_NOT_FOUND');
  }
  // If the removed photo was the pinned cover, fall back to the automatic one.
  await query(`UPDATE gallery_albums SET cover_url = NULL WHERE id = $1 AND cover_url = $2`, [
    albumId,
    result.rows[0].url,
  ]);
  await auditLog('gallery.photo_deleted', actorUserId, { albumId, photoId });
  return result.rows[0].url as string;
}

/** Rewrites photo ordering from a list of ids in the desired order. */
export async function reorderPhotos(albumId: string, photoIds: string[]): Promise<GalleryPhoto[]> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const [index, photoId] of photoIds.entries()) {
      await client.query(
        `UPDATE gallery_photos SET sort_order = $1 WHERE id = $2 AND album_id = $3`,
        [index, photoId, albumId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const photos = await query(
    `SELECT * FROM gallery_photos WHERE album_id = $1 ORDER BY sort_order, created_at`,
    [albumId]
  );
  return photos.rows.map(mapPhoto);
}

export async function updatePhoto(
  albumId: string,
  photoId: string,
  caption: string | null
): Promise<GalleryPhoto> {
  const result = await query(
    `UPDATE gallery_photos SET caption = $1 WHERE id = $2 AND album_id = $3 RETURNING *`,
    [caption?.trim() || null, photoId, albumId]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Foto não encontrada.', 'PHOTO_NOT_FOUND');
  }
  return mapPhoto(result.rows[0]);
}
