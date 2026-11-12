import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { backfillProductThumbnails } from './backfill-product-thumbnails.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-backfill-'));
const products = path.join(root, 'products');
const originals = path.join(root, '.originals', 'products');
const PID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

/** Noise does not compress: a 2000 px noisy JPEG at q100 is well over 1 MB. */
async function heavyJpeg(): Promise<Buffer> {
  const w = 2000;
  const h = 1500;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
}

async function lightPng(): Promise<Buffer> {
  return sharp({ create: { width: 900, height: 900, channels: 3, background: '#FCBE04' } }).png().toBuffer();
}

const opts = () => ({ productsDir: products, originalsDir: originals, recompressOverBytes: 1024 * 1024 });

beforeEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(products, PID), { recursive: true });
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('backfillProductThumbnails', () => {
  it('writes the missing thumbnails, recompresses the heavy JPEG keeping its original, and is idempotent', async () => {
    const heavy = await heavyJpeg();
    expect(heavy.length).toBeGreaterThan(1024 * 1024);
    fs.writeFileSync(path.join(products, PID, 'big.jpg'), heavy);
    fs.writeFileSync(path.join(products, PID, 'small.png'), await lightPng());
    fs.writeFileSync(path.join(products, PID, 'clip.mp4'), Buffer.from('not a photo'));

    const first = await backfillProductThumbnails(opts());
    expect(first).toMatchObject({ photos: 2, thumbnailsWritten: 2, thumbnailsFailed: 0, recompressed: 1 });
    expect(first.bytesSaved).toBeGreaterThan(0);

    const files = fs.readdirSync(path.join(products, PID)).sort();
    expect(files).toEqual(['big.jpg', 'big.thumb.webp', 'clip.mp4', 'small.png', 'small.thumb.webp']);
    // Original kept byte for byte; the served file is lighter, same name.
    expect(fs.readFileSync(path.join(originals, PID, 'big.jpg')).equals(heavy)).toBe(true);
    expect(fs.statSync(path.join(products, PID, 'big.jpg')).size).toBeLessThan(heavy.length);

    const second = await backfillProductThumbnails(opts());
    expect(second).toMatchObject({ photos: 2, thumbnailsWritten: 0, thumbnailsPresent: 2, recompressed: 0 });
  });

  it('changes nothing on a dry run', async () => {
    const heavy = await heavyJpeg();
    fs.writeFileSync(path.join(products, PID, 'big.jpg'), heavy);

    const report = await backfillProductThumbnails({ ...opts(), dryRun: true });
    expect(report).toMatchObject({ photos: 1, thumbnailsWritten: 1, recompressed: 1 });
    expect(fs.readdirSync(path.join(products, PID))).toEqual(['big.jpg']);
    expect(fs.readFileSync(path.join(products, PID, 'big.jpg')).equals(heavy)).toBe(true);
    expect(fs.existsSync(originals)).toBe(false);
  });

  it('counts a photo it cannot read as failed and goes on', async () => {
    fs.writeFileSync(path.join(products, PID, 'broken.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    fs.writeFileSync(path.join(products, PID, 'ok.png'), await lightPng());

    const report = await backfillProductThumbnails(opts());
    expect(report).toMatchObject({ photos: 2, thumbnailsWritten: 1, thumbnailsFailed: 1 });
    expect(fs.readdirSync(path.join(products, PID)).sort()).toEqual(['broken.jpg', 'ok.png', 'ok.thumb.webp']);
  });
});
