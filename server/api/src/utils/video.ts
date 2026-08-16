/**
 * Detecção de vídeo ISO-BMFF (MP4/MOV) pela caixa `ftyp`.
 *
 * O navegador toca o arquivo direto em <video>, sem transcodificação — então o
 * que interessa é o container, não o codec. A caixa `ftyp` traz um `major_brand`
 * mais uma lista de `compatible_brands`; ferramentas diferentes escolhem majors
 * diferentes pro mesmo MP4 tocável (HandBrake grava `iso5`, CapCut grava `dash`,
 * celular grava `mp42`), e por isso olhar só o major rejeita arquivo bom.
 *
 * HEIC/AVIF também são ISO-BMFF e também têm `ftyp` — daí a checagem ser uma
 * allowlist de marcas de vídeo, e não só "tem ftyp".
 */

/** Marcas ISO-BMFF que o navegador toca em <video>. Exclui HEIF/AVIF (imagem). */
const VIDEO_BRANDS =
  /^(isom|iso[2-9]|mp4[0-9v]|mmp4|avc1|av01|hvc1|hev1|m4v|m4a|qt|dash|cmfc|msdh|msix|3gp[4-9])/i;

/** Bytes suficientes pro header do ftyp + ~12 compatible_brands. */
export const FTYP_PROBE_BYTES = 64;

/**
 * Decide se o buffer (início do arquivo) é um vídeo MP4/MOV tocável.
 *
 * Aceita quando o `major_brand` **ou** qualquer `compatible_brand` é de vídeo:
 * um arquivo `dash` costuma listar `iso6`/`mp41` como compatível, e é tocável.
 */
export function isPlayableVideoHeader(buf: Buffer): boolean {
  // Precisa ao menos de size(4) + 'ftyp'(4) + major(4) + minor(4)
  if (buf.length < 16) return false;
  if (buf.toString('ascii', 4, 8) !== 'ftyp') return false;

  const brands = [buf.toString('ascii', 8, 12)];

  // compatible_brands ocupam de 16 até o fim da caixa, 4 bytes cada.
  const boxSize = buf.readUInt32BE(0);
  const end = Math.min(boxSize > 0 ? boxSize : buf.length, buf.length);
  for (let i = 16; i + 4 <= end; i += 4) {
    brands.push(buf.toString('ascii', i, i + 4));
  }

  return brands.some((brand) => VIDEO_BRANDS.test(brand.trim()));
}
