import { describe, it, expect } from 'vitest'
import {
  fittedSize,
  prepareProductImage,
  prepareProductImages,
  computeCoverCrop,
  clampCoverPan,
  sizeFromLongestSide,
  resolveCropOutputSize,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_SIDE,
} from './product-image'

describe('product-image helpers', () => {
  it('fits 4K into the max side without cropping', () => {
    expect(fittedSize(3840, 2160, PRODUCT_IMAGE_MAX_SIDE)).toEqual({ width: 2560, height: 1440 })
    expect(fittedSize(2160, 3840, PRODUCT_IMAGE_MAX_SIDE)).toEqual({ width: 1440, height: 2560 })
    expect(fittedSize(1200, 800, PRODUCT_IMAGE_MAX_SIDE)).toEqual({ width: 1200, height: 800 })
  })

  it('rejects HEIC when the environment cannot decode it', async () => {
    const file = new File([new Uint8Array([0, 0, 0, 0])], 'foto.heic', { type: 'image/heic' })
    const res = await prepareProductImage(file)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/HEIC/i)
  }, 20_000)

  it('normalizes Android image/jpg MIME to image/jpeg', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(100).fill(0), 0xff, 0xd9])
    const file = new File([bytes], 'foto.jpg', { type: 'image/jpg' })
    const res = await prepareProductImage(file)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.file.type).toBe('image/jpeg')
      expect(res.file.name).toMatch(/\.jpg$/i)
    }
  })

  it('rejects GIF', async () => {
    const file = new File([new Uint8Array([0x47, 0x49, 0x46])], 'a.gif', { type: 'image/gif' })
    const res = await prepareProductImage(file)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/GIF/i)
  })

  it('accepts small JPEG without compression', async () => {
    // Minimal valid-looking jpeg bytes (decode may fail in jsdom — then we still
    // accept under size with correct MIME without needing canvas).
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(100).fill(0), 0xff, 0xd9])
    const file = new File([bytes], 'a.jpg', { type: 'image/jpeg' })
    const res = await prepareProductImage(file)
    // In jsdom Image may fail to decode; if so compress path returns null → error.
    // For tiny files with correct MIME under target, we return ok without canvas.
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.file.type).toBe('image/jpeg')
      expect(res.compressed).toBe(false)
    }
  })

  it('rejects oversized file that cannot be compressed in test env', async () => {
    // Over max with correct MIME → tries compress; invalid bytes → timeout/fail → error
    const huge = new Uint8Array(64) // keep small for speed; mock size via property
    huge[0] = 0xff
    huge[1] = 0xd8
    huge[2] = 0xff
    const file = new File([huge], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(file, 'size', { value: PRODUCT_IMAGE_MAX_BYTES + 100 })
    const res = await prepareProductImage(file)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/40 MB|redimensionar|compactar|ler a imagem|enorme/i)
  }, 20_000)

  it('computes a centered cover crop at zoom 1', () => {
    const crop = computeCoverCrop({
      imageWidth: 2000,
      imageHeight: 1000,
      frameWidth: 400,
      frameHeight: 400,
      zoom: 1,
      panX: 0,
      panY: 0,
    })
    expect(crop.height).toBeCloseTo(1000, 0)
    expect(crop.width).toBeCloseTo(1000, 0)
    expect(crop.x).toBeCloseTo(500, 0)
    expect(crop.y).toBeCloseTo(0, 0)
  })

  it('clamps pan so the frame stays inside the image', () => {
    const pan = clampCoverPan(1000, 1000, 400, 400, 1, 9999, -9999)
    expect(Math.abs(pan.panX)).toBe(0)
    expect(Math.abs(pan.panY)).toBe(0)
  })

  it('resolves output size from longest side and custom pixels', () => {
    expect(sizeFromLongestSide(2, 3, 1200)).toEqual({ width: 800, height: 1200 })
    expect(sizeFromLongestSide(1, 1, 800)).toEqual({ width: 800, height: 800 })
    const custom = resolveCropOutputSize(
      { x: 0, y: 0, width: 2000, height: 2000 },
      { width: 800, height: 800 }
    )
    expect(custom).toEqual({ width: 800, height: 800 })
    const auto = resolveCropOutputSize({ x: 0, y: 0, width: 4000, height: 4000 })
    expect(auto.width).toBe(PRODUCT_IMAGE_MAX_SIDE)
    expect(auto.height).toBe(PRODUCT_IMAGE_MAX_SIDE)
  })

  it('prepareProductImages aggregates errors and files', async () => {
    const ok = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'ok.jpg', {
      type: 'image/jpeg',
    })
    const bad = new File([new Uint8Array([1])], 'x.heic', { type: 'image/heic' })
    const batch = await prepareProductImages([ok, bad])
    expect(batch.errors.length).toBe(1)
    expect(batch.files.length).toBe(1)
  }, 20_000)
})
