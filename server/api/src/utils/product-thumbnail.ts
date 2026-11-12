import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { moduleLogger } from '../config/logger.js';

const log = moduleLogger('product-thumbnail');

// The API container has little memory to spare: one image at a time, no cache.
sharp.concurrency(1);
sharp.cache(false);

/** `abc.jpg` → `abc.thumb.webp`, next to the original. The shop derives the same name. */
export const THUMB_SUFFIX = '.thumb.webp';
/** Shortest side of the thumbnail: a shop card is at most ~300 CSS px, ×2 on retina. */
export const THUMB_MIN_SIDE = 600;

const SOURCE_RE = /\.(jpe?g|png|webp)$/i;

export function isThumbnailPath(filePath: string): boolean {
  return filePath.endsWith(THUMB_SUFFIX);
}

/** A listing photo a thumbnail can be made from (not a thumbnail itself). */
export function isThumbnailSource(filePath: string): boolean {
  return SOURCE_RE.test(filePath) && !isThumbnailPath(filePath);
}

export function thumbnailPathFor(filePath: string): string {
  return filePath.replace(SOURCE_RE, '') + THUMB_SUFFIX;
}

/**
 * Writes the WebP thumbnail of one photo. Never throws: a photo without a
 * thumbnail still shows (the shop falls back to the original), so a failure
 * here must not fail the upload.
 */
export async function writeThumbnail(filePath: string): Promise<boolean> {
  if (!isThumbnailSource(filePath)) return false;
  const target = thumbnailPathFor(filePath);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    await sharp(filePath, { failOn: 'none' })
      .rotate()
      .resize({ width: THUMB_MIN_SIDE, height: THUMB_MIN_SIDE, fit: 'outside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(tmp);
    fs.renameSync(tmp, target);
    return true;
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    log.warn({ err, file: path.basename(filePath) }, 'thumbnail failed');
    return false;
  }
}

export async function writeThumbnails(filePaths: string[]): Promise<number> {
  let written = 0;
  for (const filePath of filePaths) {
    if (await writeThumbnail(filePath)) written += 1;
  }
  return written;
}

/** Removes the thumbnail that belongs to a photo, if any. */
export function removeThumbnail(filePath: string): void {
  if (!isThumbnailSource(filePath)) return;
  fs.rmSync(thumbnailPathFor(filePath), { force: true });
}
