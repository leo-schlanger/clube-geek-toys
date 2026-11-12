/**
 * Thumbnails for photos uploaded before they existed, and a lighter copy of the
 * oversized JPEGs. Idempotent: an existing thumbnail is kept, and a photo with a
 * backup in `.originals/` was already recompressed.
 *
 * In production, as the `node` user (the volume belongs to it):
 *   docker exec -u node clube-geek-api node dist/scripts/backfill-product-thumbnails.js --dry-run
 *   docker exec -u node clube-geek-api node dist/scripts/backfill-product-thumbnails.js
 *
 * The original of a recompressed photo goes to `<uploads>/.originals/products/…`,
 * never deleted. The URL does not change, so nothing in the database is touched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { isThumbnailSource, thumbnailPathFor, writeThumbnail } from '../utils/product-thumbnail.js';

export const RECOMPRESS_OVER_BYTES = 1024 * 1024;
/** Same longest side the panel resizes to before upload (src/lib/product-image.ts). */
const MAX_SIDE = 2560;

export interface BackfillOptions {
  /** `/app/uploads/products` in the container. */
  productsDir: string;
  /** Where the originals of recompressed photos go. */
  originalsDir: string;
  dryRun?: boolean;
  recompressOverBytes?: number;
}

export interface BackfillReport {
  photos: number;
  thumbnailsWritten: number;
  thumbnailsPresent: number;
  thumbnailsFailed: number;
  recompressed: number;
  recompressSkipped: number;
  bytesSaved: number;
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

async function recompress(file: string, backup: string, dryRun: boolean): Promise<number | null> {
  const before = fs.statSync(file).size;
  const out = await sharp(file, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  if (out.length >= before) return null;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(file, backup);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, out);
    fs.renameSync(tmp, file);
  }
  return before - out.length;
}

export async function backfillProductThumbnails(opts: BackfillOptions): Promise<BackfillReport> {
  const limit = opts.recompressOverBytes ?? RECOMPRESS_OVER_BYTES;
  const report: BackfillReport = {
    photos: 0,
    thumbnailsWritten: 0,
    thumbnailsPresent: 0,
    thumbnailsFailed: 0,
    recompressed: 0,
    recompressSkipped: 0,
    bytesSaved: 0,
  };

  for (const file of walk(opts.productsDir)) {
    if (!isThumbnailSource(file) || file.endsWith('.tmp')) continue;
    report.photos += 1;

    const rel = path.relative(opts.productsDir, file);
    const backup = path.join(opts.originalsDir, rel);
    if (/\.jpe?g$/i.test(file) && fs.statSync(file).size > limit && !fs.existsSync(backup)) {
      const saved = await recompress(file, backup, Boolean(opts.dryRun)).catch(() => null);
      if (saved === null) report.recompressSkipped += 1;
      else {
        report.recompressed += 1;
        report.bytesSaved += saved;
      }
    }

    if (fs.existsSync(thumbnailPathFor(file))) {
      report.thumbnailsPresent += 1;
      continue;
    }
    if (opts.dryRun) {
      report.thumbnailsWritten += 1;
      continue;
    }
    if (await writeThumbnail(file)) report.thumbnailsWritten += 1;
    else report.thumbnailsFailed += 1;
  }
  return report;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--')) ?? '/app/uploads/products';
  backfillProductThumbnails({
    productsDir: dir,
    originalsDir: path.join(path.dirname(dir), '.originals', path.basename(dir)),
    dryRun: args.includes('--dry-run'),
  })
    .then((report) => {
      process.stdout.write(`${JSON.stringify({ dryRun: args.includes('--dry-run'), ...report })}\n`);
    })
    .catch((err) => {
      process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
      process.exit(1);
    });
}
