import { describe, it, expect } from 'vitest';
import { isPlayableVideoHeader, FTYP_PROBE_BYTES } from './video.js';

/**
 * Monta um header ISO-BMFF real: size(4) + 'ftyp' + major(4) + minor(4) +
 * compatible_brands(4 cada). `boxSize` sobrescreve o tamanho declarado.
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
  // O bug que a Laura pegou: MP4 legítimo rejeitado porque o major_brand não
  // estava na lista curta (isom|iso2|mp4|avc1|m4v|qt).
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
    // major desconhecido, mas o arquivo se declara compatível com iso6/mp41
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

  // HEIC/AVIF também são ISO-BMFF e também têm ftyp — a allowlist tem que barrar,
  // senão foto de iPhone entraria como "vídeo" e o <video> ficaria preto.
  it.each(['heic', 'heix', 'mif1', 'avif'])('rejeita imagem ISO-BMFF %s', (brand) => {
    expect(isPlayableVideoHeader(ftyp(brand, [brand]))).toBe(false);
  });

  it('rejeita buffer curto demais pro header', () => {
    expect(isPlayableVideoHeader(Buffer.from('000ftyp', 'ascii'))).toBe(false);
  });

  it('não lê compatible_brands além do fim da caixa ftyp', () => {
    // boxSize corta em 16 bytes: o 'mp41' logo depois pertence à caixa seguinte
    // (moov/mdat) e não pode ser confundido com um compatible_brand.
    const buf = Buffer.concat([ftyp('heic', ['mp41'], 16)]);
    expect(isPlayableVideoHeader(buf)).toBe(false);
  });

  it('tolera boxSize maior que o buffer lido', () => {
    // A sonda lê só os primeiros FTYP_PROBE_BYTES; boxSize aponta pro arquivo todo.
    const buf = ftyp('isom', ['iso2'], 10_000_000).subarray(0, FTYP_PROBE_BYTES);
    expect(isPlayableVideoHeader(buf)).toBe(true);
  });
});
