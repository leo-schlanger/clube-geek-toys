/**
 * ISO-BMFF (MP4/MOV) detection via the `ftyp` box.
 *
 * Different tools pick different major brands for the same playable MP4
 * (HandBrake writes `iso5`, CapCut writes `dash`, phones write `mp42`), so
 * checking the major alone rejects perfectly good files.
 *
 * HEIC/AVIF are ISO-BMFF with a `ftyp` box too, which is why this is an
 * allowlist of video brands rather than a bare "has ftyp" test.
 */

/** ISO-BMFF brands browsers play in <video>. Excludes HEIF/AVIF stills. */
const VIDEO_BRANDS =
  /^(isom|iso[2-9]|mp4[0-9v]|mmp4|avc1|av01|hvc1|hev1|m4v|m4a|qt|dash|cmfc|msdh|msix|3gp[4-9])/i;

/** Enough for the ftyp header plus roughly 12 compatible_brands. */
export const FTYP_PROBE_BYTES = 64;

/**
 * Accepts when the `major_brand` **or** any `compatible_brand` is a video
 * brand: a `dash` file usually lists `iso6`/`mp41` as compatible and plays.
 */
export function isPlayableVideoHeader(buf: Buffer): boolean {
  // Needs at least size(4) + 'ftyp'(4) + major(4) + minor(4)
  if (buf.length < 16) return false;
  if (buf.toString('ascii', 4, 8) !== 'ftyp') return false;

  const brands = [buf.toString('ascii', 8, 12)];

  // compatible_brands run from 16 to the end of the box, 4 bytes each.
  const boxSize = buf.readUInt32BE(0);
  const end = Math.min(boxSize > 0 ? boxSize : buf.length, buf.length);
  for (let i = 16; i + 4 <= end; i += 4) {
    brands.push(buf.toString('ascii', i, i + 4));
  }

  return brands.some((brand) => VIDEO_BRANDS.test(brand.trim()));
}
