/**
 * Image identification by magic numbers.
 *
 * Browser MIME types lie often: phones upload HEIC labelled `image/jpeg`, and
 * `application/octet-stream` shows up regularly. Only the leading bytes tell
 * the truth about the format.
 *
 * NOTE: `product.routes.ts` and `gallery.routes.ts` predate this file and keep
 * their own copies. Unifying them deserves a separate pass with the upload
 * tests running alongside.
 */

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'heic';

/** Enough bytes for every magic number recognised here. */
export const IMAGE_PROBE_BYTES = 12;

/** Returns the buffer's real format, or null if it is not a known image. */
export function sniffImageKind(buf: Buffer): ImageKind | null {
  if (buf.length < IMAGE_PROBE_BYTES) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  // HEIC/HEIF are ISO-BMFF like MP4: a `ftyp` box carrying an image brand.
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (/^(heic|heix|heim|heis|heif|mif1|msf1|avif)/i.test(brand)) return 'heic';
  }
  return null;
}

/** Canonical extension for the format. */
export function extensionFor(kind: ImageKind): string {
  return kind === 'jpeg' ? '.jpg' : `.${kind}`;
}
