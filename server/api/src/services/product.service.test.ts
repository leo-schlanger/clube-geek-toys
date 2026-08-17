import { describe, it, expect, vi, beforeEach } from 'vitest';

// env.ts chama process.exit(1) fora de um container configurado, e database.ts
// opens a pool at import time; both must be replaced before the service loads.
vi.mock('../config/env.js', () => ({
  env: { API_URL: 'https://api.test', NODE_ENV: 'test' },
}));

const query = vi.fn();
vi.mock('../config/database.js', () => ({
  query: (...args: unknown[]) => query(...args),
  getClient: vi.fn(),
}));

const {
  addProductImages,
  addProductVideo,
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_VIDEOS,
} = await import('./product.service.js');

function productRow(images: string[]) {
  return {
    id: 'p1',
    name: 'Camiseta BTS',
    slug: 'camiseta-bts',
    description: null,
    price: '79.90',
    compare_at_price: null,
    category_id: null,
    images,
    stock: 5,
    sku: null,
    active: true,
    featured: false,
    has_variants: false,
    variant_axes: [],
    videos: [],
    created_at: '2026-08-14',
    updated_at: '2026-08-14',
  };
}

function urls(n: number, prefix = 'nova'): string[] {
  return Array.from({ length: n }, (_, i) => `https://api.test/uploads/${prefix}-${i}.jpg`);
}

describe('addProductImages — teto da galeria do listing', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('appends everything when it fits under the cap', async () => {
    const novas = urls(3);
    query
      .mockResolvedValueOnce({ rows: [{ images: ['ja-existia.jpg'] }] })
      .mockResolvedValueOnce({ rows: [productRow(['ja-existia.jpg', ...novas])] });

    const result = await addProductImages('p1', novas);

    expect(result.accepted).toEqual(novas);
    expect(result.rejected).toEqual([]);
    expect(result.product.images).toHaveLength(4);
  });

  it('accepts only what fits and returns the excess for the caller to delete', async () => {
    const existentes = urls(MAX_PRODUCT_IMAGES - 2, 'velha');
    const novas = urls(5);
    query
      .mockResolvedValueOnce({ rows: [{ images: existentes }] })
      .mockResolvedValueOnce({ rows: [productRow([...existentes, ...novas.slice(0, 2)])] });

    const result = await addProductImages('p1', novas);

    expect(result.accepted).toEqual(novas.slice(0, 2));
    expect(result.rejected).toEqual(novas.slice(2));
    // The UPDATE writes only what fitted.
    const updateArgs = query.mock.calls[1];
    expect(JSON.parse(updateArgs[1][1] as string)).toEqual(novas.slice(0, 2));
  });

  it('refuses the upload when the gallery is already full, with no UPDATE', async () => {
    query.mockResolvedValueOnce({ rows: [{ images: urls(MAX_PRODUCT_IMAGES, 'velha') }] });

    await expect(addProductImages('p1', urls(1))).rejects.toMatchObject({
      statusCode: 400,
      code: 'IMAGE_LIMIT_REACHED',
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('404 when the product does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(addProductImages('sumiu', urls(1))).rejects.toMatchObject({
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  });

  it('treats null or legacy images as an empty gallery', async () => {
    const novas = urls(2);
    query
      .mockResolvedValueOnce({ rows: [{ images: null }] })
      .mockResolvedValueOnce({ rows: [productRow(novas)] });

    const result = await addProductImages('p1', novas);

    expect(result.accepted).toEqual(novas);
    expect(result.rejected).toEqual([]);
  });
});

describe('addProductVideo', () => {
  beforeEach(() => {
    query.mockReset();
  });

  const video = { kind: 'file' as const, url: 'https://api.test/uploads/demo.mp4' };

  it('appends the video when there is room', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ videos: [] }] })
      .mockResolvedValueOnce({ rows: [{ ...productRow([]), videos: [video] }] });

    const product = await addProductVideo('p1', video);

    expect(product.videos).toEqual([video]);
  });

  it('refuses above the cap, with no UPDATE', async () => {
    const cheio = Array.from({ length: MAX_PRODUCT_VIDEOS }, (_, i) => ({
      kind: 'youtube' as const,
      url: `https://youtu.be/abcdefghij${i}`,
    }));
    query.mockResolvedValueOnce({ rows: [{ videos: cheio }] });

    await expect(addProductVideo('p1', video)).rejects.toMatchObject({
      statusCode: 400,
      code: 'VIDEO_LIMIT_REACHED',
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses the same video twice', async () => {
    query.mockResolvedValueOnce({ rows: [{ videos: [video] }] });

    await expect(addProductVideo('p1', video)).rejects.toMatchObject({
      statusCode: 400,
      code: 'VIDEO_DUPLICATE',
    });
  });

  it('404 when the product does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(addProductVideo('sumiu', video)).rejects.toMatchObject({
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  });

  it('descarta entrada JSONB fora do formato conhecido', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ videos: ['lixo', { semUrl: true }, null] }] })
      .mockResolvedValueOnce({ rows: [{ ...productRow([]), videos: [video] }] });

    const product = await addProductVideo('p1', video);

    expect(product.videos).toEqual([video]);
  });
});
