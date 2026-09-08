import { describe, it, expect } from 'vitest';
import { uploadDir } from './upload-path.js';

/**
 * The guard that keeps an upload inside its volume.
 *
 * Multer's `destination` runs before the route's own validation, so this is the
 * only thing standing between a crafted id and a file written anywhere the
 * container can reach.
 */
describe('uploadDir', () => {
  const BASE = '/app/uploads/products';
  const ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

  it('accepts the row it belongs to', () => {
    expect(uploadDir(BASE, ID)).toBe(`${BASE}/${ID}`);
  });

  it('falls back to temp before the row exists', () => {
    expect(uploadDir(BASE, undefined)).toBe(`${BASE}/temp`);
    expect(uploadDir(BASE, '')).toBe(`${BASE}/temp`);
  });

  /** Express decodes `%2e%2e%2f` into `../` before the param is read. */
  it.each([
    ['../../etc'],
    ['..'],
    ['../'],
    ['a/../../b'],
    ['/etc/cron.d'],
    ['.'],
    ['temp/../..'],
  ])('refuses %s', (id) => {
    expect(uploadDir(BASE, id)).toBeNull();
  });

  it('refuses an id that is not a string', () => {
    expect(uploadDir(BASE, { toString: () => '../etc' })).toBe(`${BASE}/temp`);
    expect(uploadDir(BASE, ['../etc'])).toBe(`${BASE}/temp`);
  });

  /** Whatever it returns must stay under the base, always. */
  it('never escapes the base', () => {
    for (const id of [ID, undefined, '../../etc', 'x']) {
      const dir = uploadDir(BASE, id);
      if (dir !== null) expect(dir.startsWith(`${BASE}/`)).toBe(true);
    }
  });
});
