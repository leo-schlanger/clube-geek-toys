import path from 'path';

/**
 * Where an upload is allowed to land.
 *
 * Multer's `destination` runs **before** the route's own validation and before
 * any content check, on a value taken straight from the request. A folder name
 * of `..%2F..%2F` therefore reached `path.join` and wrote files outside the
 * uploads volume, and the rejection path only unlinks the final path — the file
 * was already on disk. The contract upload learned this first; every other
 * upload was building its folder the unguarded way.
 *
 * So the folder may only be named by the row it belongs to: a UUID, or the
 * `temp` sentinel used before the row exists.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TEMP_UPLOAD_SEGMENT = 'temp';

/** Null when the id could name anything other than its own folder. */
export function uploadDir(base: string, id: unknown): string | null {
  const segment = typeof id === 'string' && id.length > 0 ? id : TEMP_UPLOAD_SEGMENT;
  if (segment !== TEMP_UPLOAD_SEGMENT && !UUID_RE.test(segment)) return null;
  return path.join(base, segment);
}
