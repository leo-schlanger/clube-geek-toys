import { describe, it, expect } from 'vitest';
import { isPlayableVideoHeader, FTYP_PROBE_BYTES } from './video.js';

/**
 * Monta um header ISO-BMFF real: size(4) + 'ftyp' + major(4) + minor(4) +
 * compatible_brands (4 each). `boxSize` overrides the declared size.
 */
function ftyp(major: string, compatible: string[] = [], boxSize?: number): Buffer {
  const pad = (s: string) => Buffer.from(s.padEnd(4, ' ').slice(0, 4), 'ascii');
  const body = Buffer.concat([
    Buffer.from('ftyp', 'ascii'),
    pad(major),
    Buffer.from([0, 0, 0, 0]), // minor_version
    ...compatible.map(pad),
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(boxSize ?? body.length + 4, 0);
  return Buffer.concat([size, body]);
}

describe('isPlayableVideoHeader', () => {
  // The reported bug: a legitimate MP4 rejected because its major_brand was
  // missing from the short list (isom|iso2|mp4|avc1|m4v|qt).
  it.each(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'mp4v', 'avc1', 'av01'])(
    'aceita MP4 com major_brand %s',
    (brand) => {
      expect(isPlayableVideoHeader(ftyp(brand))).toBe(true);
    }
  );

  it('aceita MOV do iPhone (major qt)', () => {
    expect(isPlayableVideoHeader(ftyp('qt  ', ['qt  ']))).toBe(true);
  });

  it('aceita export do CapCut/YouTube (major dash)', () => {
    expect(isPlayableVideoHeader(ftyp('dash'))).toBe(true);
  });

  it('aceita quando só um compatible_brand é de vídeo', () => {
    // Unknown major, but the file declares iso6/mp41 compatibility
    expect(isPlayableVideoHeader(ftyp('xxxx', ['zzzz', 'iso6', 'mp41']))).toBe(true);
  });

  it('rejeita arquivo sem caixa ftyp (AVI/MKV renomeado pra .mp4)', () => {
    const avi = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.alloc(4),
      Buffer.from('AVI LIST', 'ascii'),
    ]);
    expect(isPlayableVideoHeader(avi)).toBe(false);
  });

  // HEIC/AVIF are ISO-BMFF with a ftyp box too, so the allowlist must reject them,
  // otherwise an iPhone photo would pass as "video" and render black.
  it.each(['heic', 'heix', 'mif1', 'avif'])('rejeita imagem ISO-BMFF %s', (brand) => {
    expect(isPlayableVideoHeader(ftyp(brand, [brand]))).toBe(false);
  });

  it('rejeita buffer curto demais pro header', () => {
    expect(isPlayableVideoHeader(Buffer.from('000ftyp', 'ascii'))).toBe(false);
  });

  it('não lê compatible_brands além do fim da caixa ftyp', () => {
    // boxSize cuts at 16 bytes: the 'mp41' right after belongs to the next box
    // (moov/mdat) and must not be read as a compatible_brand.
    const buf = Buffer.concat([ftyp('heic', ['mp41'], 16)]);
    expect(isPlayableVideoHeader(buf)).toBe(false);
  });

  it('tolera boxSize maior que o buffer lido', () => {
    // The probe reads only FTYP_PROBE_BYTES; boxSize spans the whole file.
    const buf = ftyp('isom', ['iso2'], 10_000_000).subarray(0, FTYP_PROBE_BYTES);
    expect(isPlayableVideoHeader(buf)).toBe(true);
  });
});
