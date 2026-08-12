import { describe, it, expect } from 'vitest'
import {
  prepareProductImage,
  prepareProductImages,
  PRODUCT_IMAGE_MAX_BYTES,
} from './product-image'

describe('product-image helpers', () => {
  it('rejects HEIC with clear message', async () => {
    const file = new File([new Uint8Array([0, 0, 0, 0])], 'foto.heic', { type: 'image/heic' })
    const res = await prepareProductImage(file)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/HEIC/i)
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
    if (!res.ok) expect(res.error).toMatch(/12 MB|compactar|ler a imagem/i)
  }, 15_000)

  it('prepareProductImages aggregates errors and files', async () => {
    const ok = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'ok.jpg', {
      type: 'image/jpeg',
    })
    const bad = new File([new Uint8Array([1])], 'x.heic', { type: 'image/heic' })
    const batch = await prepareProductImages([ok, bad])
    expect(batch.errors.length).toBe(1)
    expect(batch.files.length).toBe(1)
  })
})
