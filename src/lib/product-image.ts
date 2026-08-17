/**
 * Client-side helpers for product image uploads.
 * Accepts large/4K phone photos and resizes them — we don't ask the staff to edit files.
 */

export const PRODUCT_IMAGE_MAX_BYTES = 40 * 1024 * 1024 // incoming cap (matches API + nginx)
/** After resize: sharp enough for the shop, small enough for mobile upload. */
export const PRODUCT_IMAGE_TARGET_BYTES = 3.5 * 1024 * 1024
/** Longest side after resize. 2560 keeps 4K shots looking crisp on retina. */
export const PRODUCT_IMAGE_MAX_SIDE = 2560
/** Broad accept so iPhone Camera Roll (HEIC) and Android gallery actually appear. */
export const PRODUCT_IMAGE_ACCEPT = 'image/*'
export const PRODUCT_IMAGE_ACCEPT_LABEL =
  'Foto da galeria · recorte e tamanho na hora · 4K é redimensionada · até 40 MB'

/** Recorte em pixels da imagem original. */
export interface ImageCropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CoverCropInput {
  imageWidth: number
  imageHeight: number
  frameWidth: number
  frameHeight: number
  zoom: number
  panX: number
  panY: number
}

export function clampCoverPan(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  zoom: number,
  panX: number,
  panY: number
): { panX: number; panY: number } {
  const z = Math.max(1, zoom)
  const cover = Math.max(frameWidth / Math.max(1, imageWidth), frameHeight / Math.max(1, imageHeight))
  const displayedW = imageWidth * cover * z
  const displayedH = imageHeight * cover * z
  const maxX = Math.max(0, (displayedW - frameWidth) / 2)
  const maxY = Math.max(0, (displayedH - frameHeight) / 2)
  return {
    panX: Math.min(maxX, Math.max(-maxX, panX)),
    panY: Math.min(maxY, Math.max(-maxY, panY)),
  }
}

/** Turns the preview's zoom and pan into a rectangle on the source image. */
export function computeCoverCrop(input: CoverCropInput): ImageCropRect {
  const imageWidth = Math.max(1, input.imageWidth)
  const imageHeight = Math.max(1, input.imageHeight)
  const frameWidth = Math.max(1, input.frameWidth)
  const frameHeight = Math.max(1, input.frameHeight)
  const zoom = Math.max(1, input.zoom)
  const cover = Math.max(frameWidth / imageWidth, frameHeight / imageHeight)
  const scale = cover * zoom
  const { panX, panY } = clampCoverPan(
    imageWidth,
    imageHeight,
    frameWidth,
    frameHeight,
    zoom,
    input.panX,
    input.panY
  )
  const displayedW = imageWidth * scale
  const displayedH = imageHeight * scale
  const imageLeft = (frameWidth - displayedW) / 2 + panX
  const imageTop = (frameHeight - displayedH) / 2 + panY
  const x = Math.min(imageWidth - 1, Math.max(0, -imageLeft / scale))
  const y = Math.min(imageHeight - 1, Math.max(0, -imageTop / scale))
  const width = Math.min(imageWidth - x, frameWidth / scale)
  const height = Math.min(imageHeight - y, frameHeight / scale)
  return { x, y, width: Math.max(1, width), height: Math.max(1, height) }
}

/** Longest side to width/height, keeping the crop's aspect ratio. */
export function sizeFromLongestSide(
  cropWidth: number,
  cropHeight: number,
  longest: number
): { width: number; height: number } {
  const w = Math.max(1, cropWidth)
  const h = Math.max(1, cropHeight)
  const cap = Math.max(1, Math.round(longest))
  if (w >= h) {
    return { width: cap, height: Math.max(1, Math.round((cap * h) / w)) }
  }
  return { width: Math.max(1, Math.round((cap * w) / h)), height: cap }
}

export function resolveCropOutputSize(
  crop: ImageCropRect,
  requested?: { width?: number; height?: number; longestSide?: number },
  maxSide = PRODUCT_IMAGE_MAX_SIDE
): { width: number; height: number } {
  if (requested?.longestSide) {
    const sized = sizeFromLongestSide(crop.width, crop.height, requested.longestSide)
    return fittedSize(sized.width, sized.height, maxSide)
  }
  const aspect = crop.width / Math.max(1, crop.height)
  let w = requested?.width
  let h = requested?.height
  if (w && h) {
    /* keep both */
  } else if (w) {
    h = Math.round(w / aspect)
  } else if (h) {
    w = Math.round(h * aspect)
  } else {
    w = Math.round(crop.width)
    h = Math.round(crop.height)
  }
  return fittedSize(Math.max(1, w), Math.max(1, h), maxSide)
}

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
function loadImageFromFile(file: File, timeoutMs = 12_000): Promise<HTMLImageElement> {
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

type Drawable = CanvasImageSource & { width: number; height: number }

function closeDrawable(src: Drawable): void {
  if ('close' in src && typeof (src as ImageBitmap).close === 'function') {
    try {
      ;(src as ImageBitmap).close()
    } catch {
      /* already closed */
    }
  }
}

export function fittedSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (width < 1 || height < 1) return { width: 1, height: 1 }
  if (width <= maxSide && height <= maxSide) return { width, height }
  const scale = maxSide / Math.max(width, height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Decode (createImageBitmap downscales 4K/48MP with less memory; Image() is the fallback). */
async function decodeDrawable(file: File): Promise<Drawable | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      /* HEIC on desktop Chrome, or jsdom — fall through */
    }
  }
  try {
    return await loadImageFromFile(file)
  } catch {
    return null
  }
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
 * Downscale (4K → 2560) + re-encode as JPEG until under `targetBytes`.
 * Keeps shrinking instead of giving up — staff should never have to edit the file.
 */
async function compressImageFile(file: File, targetBytes: number): Promise<File | null> {
  const src = await decodeDrawable(file)
  if (!src) return null

  const srcW = src.width
  const srcH = src.height
  if (srcW < 1 || srcH < 1) {
    closeDrawable(src)
    return null
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    closeDrawable(src)
    return null
  }

  let maxSide = PRODUCT_IMAGE_MAX_SIDE
  let blob: Blob | null = null

  for (let attempt = 0; attempt < 6; attempt++) {
    const { width, height } = fittedSize(srcW, srcH, maxSide)
    canvas.width = width
    canvas.height = height
    ctx.drawImage(src, 0, 0, width, height)

    let quality = 0.88
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    while (blob && blob.size > targetBytes && quality > 0.55) {
      quality -= 0.08
      blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    }

    if (blob && blob.size <= targetBytes) break
    maxSide = Math.max(640, Math.round(maxSide * 0.72))
  }

  closeDrawable(src)
  if (!blob) return null
  return new File([blob], renameWithExt(file.name, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

/**
 * Crops and resizes to the output size, as JPEG.
 */
export async function cropProductImage(
  file: File,
  crop: ImageCropRect,
  output?: { width?: number; height?: number; longestSide?: number }
): Promise<File | null> {
  const src = await decodeDrawable(file)
  if (!src) return null

  const size = resolveCropOutputSize(crop, output)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    closeDrawable(src)
    return null
  }

  canvas.width = size.width
  canvas.height = size.height
  ctx.drawImage(src, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height)
  closeDrawable(src)

  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9)
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

  // Anything over ~1 MB is treated as a phone/4K shot: decode and fit. Tiny files skip.
  const needsConvert = heic || !ALLOWED_MIME.has(mime) || file.size > 1024 * 1024

  if (needsConvert) {
    const compressed = await compressImageFile(file, PRODUCT_IMAGE_TARGET_BYTES)
    if (compressed && compressed.size <= PRODUCT_IMAGE_MAX_BYTES) {
      return { ok: true, file: compressed, compressed: true }
    }
    // Resize failed: still send the original if it fits the incoming cap.
    if (!heic && ALLOWED_MIME.has(mime) && file.size <= PRODUCT_IMAGE_MAX_BYTES) {
      // fall through to normalize + upload original
    } else if (heic) {
      return {
        ok: false,
        error: `"${name}": foto HEIC do iPhone. Abra o painel no Safari (converte sozinho) ou exporte como JPEG.`,
      }
    } else if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      return {
        ok: false,
        error: `"${name}": arquivo enorme e o celular não conseguiu redimensionar. Tente de novo no Safari ou envie uma foto por vez.`,
      }
    } else if (!ALLOWED_MIME.has(mime)) {
      return {
        ok: false,
        error: `"${name}": não foi possível ler a imagem. Use JPEG, PNG ou WEBP.`,
      }
    }
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
