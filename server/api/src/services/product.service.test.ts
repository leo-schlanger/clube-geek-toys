import { describe, it, expect, vi, beforeEach } from 'vitest';

// env.ts calls process.exit(1) outside a configured container, and database.ts
// opens a pool at import time; both must be replaced before the service loads.
vi.mock('../config/env.js', () => ({
  env: { API_URL: 'https://api.test', NODE_ENV: 'test' },
}));

const query = vi.fn();
const clientQuery = vi.fn();
const release = vi.fn();
vi.mock('../config/database.js', () => ({
  query: (...args: unknown[]) => query(...args),
  getClient: async () => ({ query: clientQuery, release }),
}));

const {
  addProductImages,
  addProductVideo,
  bulkSetProductCategories,
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

/**
 * Moving a shelf of products between categories used to be one product at a
 * time. What these tests hold: the batch is all-or-nothing, `add`/`remove`
 * respect the categories a product already had, and an id nobody recognises
 * fails loudly instead of reporting a move that did not happen.
 */
describe('bulkSetProductCategories', () => {
  beforeEach(() => {
    query.mockReset();
    clientQuery.mockReset();
    release.mockReset();
  });

  it('replaces the categories of every product in one transaction', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'c-kpop' }] }); // known categories
    clientQuery
      .mockResolvedValueOnce({ rows: [] })                                  // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }, { id: 'p2' }] })        // products
      .mockResolvedValue({ rows: [] });

    const result = await bulkSetProductCategories(['p1', 'p2'], ['c-kpop'], 'replace');

    expect(result).toEqual({ updated: 2 });
    const statements = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(statements[0]).toBe('BEGIN');
    expect(statements).toContain('COMMIT');
    // One DELETE + one INSERT per product: old categories actually leave.
    expect(statements.filter((sql) => sql.includes('DELETE FROM product_categories'))).toHaveLength(2);
  });

  it('keeps the categories a product already had when adding one', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'c-kpop' }] });
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }] })
      .mockResolvedValueOnce({ rows: [{ category_id: 'c-musica' }] }) // atuais
      .mockResolvedValue({ rows: [] });

    await bulkSetProductCategories(['p1'], ['c-kpop'], 'add');

    const insert = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO product_categories')
    );
    expect(insert?.[1]).toEqual(['p1', 'c-musica', 0]);
    const second = clientQuery.mock.calls.filter((c) =>
      String(c[0]).includes('INSERT INTO product_categories')
    )[1];
    expect(second?.[1]).toEqual(['p1', 'c-kpop', 1]);
  });

  it('rolls the whole batch back when one product fails', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'c-kpop' }] });
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }, { id: 'p2' }] })
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockResolvedValue({ rows: [] });

    await expect(bulkSetProductCategories(['p1', 'p2'], ['c-kpop'], 'replace')).rejects.toThrow(
      'deadlock'
    );
    expect(clientQuery.mock.calls.map((c) => String(c[0]))).toContain('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('refuses a category that does not exist instead of silently skipping it', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(bulkSetProductCategories(['p1'], ['c-fantasma'], 'replace')).rejects.toThrow(
      /não encontrada/i
    );
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('does nothing when the selection is empty', async () => {
    await expect(bulkSetProductCategories([], ['c-kpop'], 'replace')).resolves.toEqual({
      updated: 0,
    });
    expect(query).not.toHaveBeenCalled();
  });
});
