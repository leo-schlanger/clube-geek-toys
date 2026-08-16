/**
 * Identificação de imagem pelos bytes (magic numbers).
 *
 * O MIME que o navegador manda mente com frequência — celular sobe HEIC
 * rotulado como `image/jpeg`, e `application/octet-stream` aparece direto. Só
 * os primeiros bytes dizem a verdade sobre o formato.
 *
 * NOTA: `product.routes.ts` e `gallery.routes.ts` têm cópias próprias desta
 * lógica, anteriores a este arquivo. Ficaram como estão de propósito — são o
 * caminho de upload do catálogo, em uso diário; unificar merece um passo
 * separado, com os testes de upload rodando junto.
 */

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'heic';

/** Bytes suficientes para todos os magic numbers reconhecidos. */
export const IMAGE_PROBE_BYTES = 12;

/** Devolve o formato real do buffer, ou null se não for imagem conhecida. */
export function sniffImageKind(buf: Buffer): ImageKind | null {
  if (buf.length < IMAGE_PROBE_BYTES) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  // HEIC/HEIF são ISO-BMFF, igual a MP4: caixa `ftyp` com marca de imagem.
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (/^(heic|heix|heim|heis|heif|mif1|msf1|avif)/i.test(brand)) return 'heic';
  }
  return null;
}

/** Extensão canônica do formato — HEIC vira .heic e é convertido depois. */
export function extensionFor(kind: ImageKind): string {
  return kind === 'jpeg' ? '.jpg' : `.${kind}`;
}
