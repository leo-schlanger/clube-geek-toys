/**
 * Client-side helpers for product image uploads.
 * Validates MIME/size and compresses large phone photos so they fit the API limit.
 */

export const PRODUCT_IMAGE_MAX_BYTES = 12 * 1024 * 1024 // 12 MB (matches API)
/** Target after client compression — keeps uploads fast on mobile networks. */
export const PRODUCT_IMAGE_TARGET_BYTES = 2.5 * 1024 * 1024
/** Broad accept so iPhone Camera Roll (HEIC) and Android gallery actually appear. */
export const PRODUCT_IMAGE_ACCEPT = 'image/*'
export const PRODUCT_IMAGE_ACCEPT_LABEL = 'Foto da galeria ou arquivo · até 12 MB'

const JPEG_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg'])
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp'])

export type PrepareImageResult =
  | { ok: true; file: File; compressed: boolean }
  | { ok: false; error: string }

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  return '.jpg'
}

function renameWithExt(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'image'
  return `${base}${ext}`
}

function isHeicFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase()
  const name = file.name || ''
  return mime === 'image/heic' || mime === 'image/heif' || /\.hei[cf]$/i.test(name)
}

/**
 * Load a File into an HTMLImageElement (JPEG/PNG/WEBP; HEIC on iOS Safari).
 * Timeout avoids hanging when the environment never fires load/error (e.g. invalid bytes).
 */
function loadImageFromFile(file: File, timeoutMs = 8_000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(url)
      reject(new Error('decode-timeout'))
    }, timeoutMs)
    const done = (fn: () => void) => {
      window.clearTimeout(timer)
      fn()
    }
    img.onload = () => {
      done(() => {
        URL.revokeObjectURL(url)
        resolve(img)
      })
    }
    img.onerror = () => {
      done(() => {
        URL.revokeObjectURL(url)
        reject(new Error('decode'))
      })
    }
    img.src = url
  })
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

/**
 * Downscale + re-encode as JPEG until under `targetBytes` (or quality floor).
 */
async function compressImageFile(file: File, targetBytes: number): Promise<File | null> {
  let img: HTMLImageElement
  try {
    img = await loadImageFromFile(file)
  } catch {
    return null
  }

  const maxSide = 2000
  let { width, height } = img
  if (width < 1 || height < 1) return null

  if (width > maxSide || height > maxSide) {
    const scale = maxSide / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, width, height)

  let quality = 0.85
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  while (blob && blob.size > targetBytes && quality > 0.45) {
    quality -= 0.1
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  }

  // Still too big: shrink dimensions once more
  if (blob && blob.size > targetBytes) {
    const scale = Math.sqrt(targetBytes / blob.size) * 0.95
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.8)
  }

  if (!blob) return null
  return new File([blob], renameWithExt(file.name, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

/**
 * Validate and optionally compress a single product image file.
 */
export async function prepareProductImage(file: File): Promise<PrepareImageResult> {
  const mime = (file.type || '').toLowerCase()
  const name = file.name || 'imagem'
  const heic = isHeicFile(file)

  if (mime === 'image/gif' || /\.gif$/i.test(name)) {
    return {
      ok: false,
      error: `"${name}": GIF não é aceito. Use JPEG, PNG ou WEBP.`,
    }
  }

  if (mime && !ALLOWED_MIME.has(mime) && !heic && !mime.startsWith('image/')) {
    return {
      ok: false,
      error: `"${name}": tipo inválido. Use uma foto JPEG, PNG, WEBP ou a galeria do celular.`,
    }
  }

  const needsConvert =
    heic || !ALLOWED_MIME.has(mime) || file.size > PRODUCT_IMAGE_TARGET_BYTES

  if (needsConvert) {
    // iOS Safari can decode HEIC into a canvas and re-encode as JPEG.
    const compressed = await compressImageFile(file, PRODUCT_IMAGE_TARGET_BYTES)
    if (compressed && compressed.size <= PRODUCT_IMAGE_MAX_BYTES) {
      return { ok: true, file: compressed, compressed: true }
    }
    if (heic) {
      return {
        ok: false,
        error: `"${name}": foto HEIC do iPhone. Abra o painel no Safari (converte sozinho) ou exporte como JPEG.`,
      }
    }
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      return {
        ok: false,
        error: `"${name}": maior que 12 MB mesmo após compactar. Escolha outra foto.`,
      }
    }
    if (!ALLOWED_MIME.has(mime)) {
      return {
        ok: false,
        error: `"${name}": não foi possível ler a imagem. Use JPEG, PNG ou WEBP.`,
      }
    }
    // Allowed MIME, compress failed, still under hard cap — send original.
  }

  const outMime = JPEG_MIMES.has(mime) ? 'image/jpeg' : mime || 'image/jpeg'
  const ext = extensionForMime(outMime)
  if (outMime !== mime || !name.toLowerCase().endsWith(ext)) {
    return {
      ok: true,
      file: new File([file], renameWithExt(name, ext), {
        type: outMime,
        lastModified: file.lastModified,
      }),
      compressed: false,
    }
  }

  return { ok: true, file, compressed: false }
}

/**
 * Prepare a batch of files. Invalid ones are reported via `errors`; valid ones returned in `files`.
 */
export async function prepareProductImages(files: File[]): Promise<{
  files: File[]
  errors: string[]
  compressedCount: number
}> {
  const out: File[] = []
  const errors: string[] = []
  let compressedCount = 0

  for (const f of files) {
    const result = await prepareProductImage(f)
    if (result.ok) {
      out.push(result.file)
      if (result.compressed) compressedCount += 1
    } else {
      errors.push(result.error)
    }
  }

  return { files: out, errors, compressedCount }
}
