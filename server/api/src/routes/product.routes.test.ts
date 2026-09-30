import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Product routes over real HTTP (see `test-support/http.ts`).
 *
 * What these pin, in cost order:
 *  1. Writing the catalogue is admin-only — a member token gets 403, no token 401.
 *  2. The validation in front of the service: price bounds, UUIDs, bulk limits.
 *  3. Uploads judge the bytes, not the MIME the phone claims: a HEIC dressed as
 *     JPEG is refused with its own message, garbage is refused and deleted.
 *  4. Route order: `categories`, `sitemap.xml`, `admin/catalog` and `bulk` are
 *     never read as a product slug or id.
 */

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-routes-'));

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../middleware/rate-limit.js', async () => (await import('../test-support/env.js')).rateLimitModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));
vi.mock('../utils/upload-path.js', () => ({
  uploadDir: (_base: string, id: unknown) =>
    typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? path.join(tmpRoot, id) : null,
}));

const svc = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listCategoriesForAdmin: vi.fn(),
  listProducts: vi.fn(),
  parseProductSort: vi.fn((s: unknown) => s ?? 'recent'),
  buildProductSitemapXml: vi.fn(),
  buildProductShareHtml: vi.fn(),
  buildStoreShareHtml: vi.fn(() => '<html>store</html>'),
  buildCategoryShareHtml: vi.fn(),
  listRelatedProducts: vi.fn(),
  listAlsoBoughtProducts: vi.fn(),
  getProductBySlug: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deactivateCategory: vi.fn(),
  createProduct: vi.fn(),
  bulkSetProductCategories: vi.fn(),
  updateProduct: vi.fn(),
  getProductById: vi.fn(),
  duplicateProduct: vi.fn(),
  replaceVariants: vi.fn(),
  listVariants: vi.fn(),
  deactivateProduct: vi.fn(),
  replaceProductImage: vi.fn(),
  addProductImages: vi.fn(),
  addProductVideo: vi.fn(),
}));

vi.mock('../services/product.service.js', () => ({
  ...svc,
  MAX_PRODUCT_IMAGES: 12,
  MAX_VARIANT_IMAGES: 6,
  MAX_IMAGE_UPLOAD_BATCH: 3,
  MAX_PRODUCT_CATEGORIES: 5,
  MAX_PRODUCT_VIDEOS: 3,
  PRODUCT_VIDEO_MAX_BYTES: 50 * 1024 * 1024,
}));

import { productRouter } from './product.routes.js';
import { routerClient } from '../test-support/http.js';

const api = routerClient('/products', productRouter);
const PID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const CAT = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(16)]);

function form(field: string, files: Array<[Buffer, string, string]>, extra: Record<string, string> = {}) {
  const f = new FormData();
  for (const [bytes, name, type] of files) f.append(field, new Blob([bytes], { type }), name);
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return f;
}

function filesOnDisk(): string[] {
  const dir = path.join(tmpRoot, PID);
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

beforeEach(() => {
  vi.clearAllMocks();
  fs.rmSync(path.join(tmpRoot, PID), { recursive: true, force: true });
});

afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe('public reads', () => {
  it('serves categories, the catalogue and a product by slug', async () => {
    svc.listCategories.mockResolvedValue([{ id: CAT }]);
    expect((await api.get('/categories')).body).toEqual([{ id: CAT }]);
    expect(svc.listCategories).toHaveBeenCalledWith(false);

    svc.listProducts.mockResolvedValue({ products: [], total: 0 });
    await api.get('/?category=kpop&search=bts&featured=true&page=2&limit=12&channel=wholesale&stats=true&sort=price_asc');
    expect(svc.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'kpop',
        search: 'bts',
        featured: true,
        page: 2,
        limit: 12,
        includeInactive: false,
        wholesaleOnly: true,
        includeStats: true,
        sort: 'price_asc',
      })
    );

    svc.getProductBySlug.mockResolvedValue({ id: PID, slug: 'holder' });
    expect((await api.get('/holder')).body).toEqual({ id: PID, slug: 'holder' });
    svc.getProductBySlug.mockResolvedValue(null);
    expect((await api.get('/nope')).status).toBe(404);
  });

  it('never reads the named routes as a slug', async () => {
    svc.buildProductSitemapXml.mockResolvedValue('<urlset/>');
    const sitemap = await api.get('/sitemap.xml');
    expect(sitemap.headers.get('content-type')).toContain('application/xml');
    expect(sitemap.text).toBe('<urlset/>');
    expect(svc.buildProductSitemapXml).toHaveBeenCalledWith('https://shop.geekpoptoys.com.br');
    expect(svc.getProductBySlug).not.toHaveBeenCalled();
  });

  it('serves the link preview, and the store card when the product is gone', async () => {
    svc.buildProductShareHtml.mockResolvedValue('<html>preview</html>');
    const ok = await api.get('/holder/share');
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('<html>preview</html>');
    expect(ok.headers.get('cache-control')).toBe('public, max-age=300');
    svc.buildProductShareHtml.mockResolvedValue(null);
    const gone = await api.get('/gone/share');
    expect(gone.status).toBe(200);
    expect(gone.text).toBe('<html>store</html>');
  });

  it('previews the store and its categories, never as a product slug', async () => {
    const store = await api.get('/share');
    expect(store.status).toBe(200);
    expect(store.headers.get('content-type')).toContain('text/html');
    expect(store.text).toBe('<html>store</html>');

    svc.buildCategoryShareHtml.mockResolvedValue('<html>kpop</html>');
    expect((await api.get('/categories/kpop/share')).text).toBe('<html>kpop</html>');
    expect(svc.buildCategoryShareHtml).toHaveBeenCalledWith('kpop', 'https://shop.geekpoptoys.com.br');

    svc.buildCategoryShareHtml.mockResolvedValue(null);
    expect((await api.get('/categories/nope/share')).text).toBe('<html>store</html>');
    expect(svc.getProductBySlug).not.toHaveBeenCalled();
    expect(svc.buildProductShareHtml).not.toHaveBeenCalled();
  });

  it('lists related, also-bought and variants', async () => {
    svc.listRelatedProducts.mockResolvedValue([{ id: 'r' }]);
    svc.listAlsoBoughtProducts.mockResolvedValue([]);
    svc.listVariants.mockResolvedValue([{ id: 'v' }]);
    expect((await api.get('/holder/related')).body).toEqual({ products: [{ id: 'r' }] });
    expect((await api.get('/holder/also-bought')).body).toEqual({ products: [] });
    expect((await api.get(`/${PID}/variants`)).body).toEqual({ variants: [{ id: 'v' }] });
    expect(svc.listVariants).toHaveBeenCalledWith(PID, false);
  });

  it('turns a service failure into the error handler response', async () => {
    svc.listCategories.mockRejectedValue(new Error('db down'));
    expect((await api.get('/categories')).status).toBe(500);
  });
});

describe('admin guard', () => {
  it.each([
    ['get', '/categories/all'],
    ['get', '/admin/catalog'],
    ['post', '/'],
    ['patch', `/${PID}`],
    ['delete', `/${PID}`],
    ['get', `/${PID}/edit`],
    ['post', `/${PID}/duplicate`],
    ['patch', '/bulk/categories'],
  ] as const)('%s %s needs an admin', async (method, route) => {
    expect((await api[method](route)).status).toBe(401);
    expect((await api[method](route, { as: 'member', body: {} })).status).toBe(403);
    expect((await api[method](route, { as: 'seller', body: {} })).status).toBe(403);
  });
});

describe('admin catalogue and categories', () => {
  it('shows inactive products in the panel list', async () => {
    svc.listProducts.mockResolvedValue({ products: [], total: 0 });
    await api.get('/admin/catalog?wholesale=true', { as: 'admin' });
    expect(svc.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ includeInactive: true, wholesaleOnly: true })
    );
    svc.listCategoriesForAdmin.mockResolvedValue([{ id: CAT }]);
    expect((await api.get('/categories/all', { as: 'admin' })).body).toEqual({ categories: [{ id: CAT }] });
  });

  it('creates, edits and deactivates a category', async () => {
    svc.createCategory.mockResolvedValue({ id: CAT });
    expect((await api.post('/categories', { as: 'admin', body: { name: 'K-pop', parentId: null } })).status).toBe(201);
    expect((await api.post('/categories', { as: 'admin', body: { name: '' } })).status).toBe(400);
    expect((await api.post('/categories', { as: 'admin', body: { name: 'X', parentId: 'not-a-uuid' } })).status).toBe(400);

    svc.updateCategory.mockResolvedValue({ id: CAT, name: 'Música' });
    expect((await api.patch(`/categories/${CAT}`, { as: 'admin', body: { name: 'Música' } })).body.name).toBe('Música');

    expect((await api.delete(`/categories/${CAT}`, { as: 'admin' })).status).toBe(204);
    expect(svc.deactivateCategory).toHaveBeenCalledWith(CAT);
  });
});

describe('admin product CRUD', () => {
  it('creates a product within the price bounds', async () => {
    svc.createProduct.mockResolvedValue({ id: PID });
    const ok = await api.post('/', { as: 'admin', body: { name: 'Holder', price: 45, categoryIds: [CAT] } });
    expect(ok.status).toBe(201);
    expect(svc.createProduct).toHaveBeenCalledWith(expect.objectContaining({ name: 'Holder', price: 45 }));

    for (const body of [
      { name: 'X', price: -1 },
      { name: 'X', price: 1_000_000 },
      { name: '', price: 10 },
      { name: 'X', price: 10, categoryIds: ['nope'] },
      { name: 'X', price: 10, videos: [{ kind: 'vimeo', url: 'https://x.example' }] },
    ]) {
      expect((await api.post('/', { as: 'admin', body })).status, JSON.stringify(body)).toBe(400);
    }
    expect(svc.createProduct).toHaveBeenCalledTimes(1);
  });

  it('updates, opens for edit, duplicates and deactivates', async () => {
    svc.updateProduct.mockResolvedValue({ id: PID, price: 50 });
    expect((await api.patch(`/${PID}`, { as: 'admin', body: { price: 50 } })).body.price).toBe(50);

    svc.getProductById.mockResolvedValue({ id: PID, variants: [] });
    expect((await api.get(`/${PID}/edit`, { as: 'admin' })).status).toBe(200);
    svc.getProductById.mockResolvedValue(null);
    expect((await api.get(`/${PID}/edit`, { as: 'admin' })).status).toBe(404);

    svc.duplicateProduct.mockResolvedValue({ id: 'copy' });
    expect((await api.post(`/${PID}/duplicate`, { as: 'admin' })).status).toBe(201);

    expect((await api.delete(`/${PID}`, { as: 'admin' })).status).toBe(204);
    expect(svc.deactivateProduct).toHaveBeenCalledWith(PID);
  });

  it('re-files a selection in bulk, and caps it', async () => {
    svc.bulkSetProductCategories.mockResolvedValue({ updated: 1 });
    const ok = await api.patch('/bulk/categories', { as: 'admin', body: { productIds: [PID], categoryIds: [CAT] } });
    expect(ok.status).toBe(200);
    expect(svc.bulkSetProductCategories).toHaveBeenCalledWith([PID], [CAT], 'replace');
    // "bulk" must not be read as a product id.
    expect(svc.updateProduct).not.toHaveBeenCalled();

    const tooMany = Array.from({ length: 201 }, () => PID);
    expect((await api.patch('/bulk/categories', { as: 'admin', body: { productIds: tooMany, categoryIds: [CAT] } })).status).toBe(400);
    expect((await api.patch('/bulk/categories', { as: 'admin', body: { productIds: [], categoryIds: [CAT] } })).status).toBe(400);
  });

  it('replaces the variant matrix', async () => {
    svc.replaceVariants.mockResolvedValue({ id: PID });
    const body = {
      axes: [{ name: 'Membro', options: ['Jimin'] }],
      variants: [{ name: 'Jimin', options: { Membro: 'Jimin' }, price: 20, stock: 3 }],
    };
    expect((await api.put(`/${PID}/variants`, { as: 'admin', body })).status).toBe(200);
    expect(svc.replaceVariants).toHaveBeenCalledWith(PID, body.axes, [expect.objectContaining({ name: 'Jimin' })]);
    expect((await api.put(`/${PID}/variants`, { as: 'admin', body: { axes: [], variants: [{ name: 'x', options: {}, price: -5 }] } })).status).toBe(400);
  });

  it('swaps one photo by URL', async () => {
    svc.replaceProductImage.mockResolvedValue({ id: PID });
    const from = 'https://api.geeketoys.com.br/uploads/products/a.jpg';
    const to = 'https://api.geeketoys.com.br/uploads/products/b.jpg';
    expect((await api.patch(`/${PID}/images`, { as: 'admin', body: { from, to } })).status).toBe(200);
    expect(svc.replaceProductImage).toHaveBeenCalledWith(PID, from, to);
    expect((await api.patch(`/${PID}/images`, { as: 'admin', body: { from: 'x', to } })).status).toBe(400);
  });
});

describe('image uploads', () => {
  it('keeps real images and returns their public URLs', async () => {
    svc.addProductImages.mockImplementation(async (_id: string, urls: string[]) => ({
      product: { id: PID, images: urls },
      accepted: urls,
      rejected: [],
    }));
    const res = await api.post(`/${PID}/images`, {
      as: 'admin',
      form: form('images', [
        [JPEG, 'a.jpeg', 'image/jpeg'],
        [PNG, 'b.png', 'image/png'],
      ]),
    });
    expect(res.status).toBe(201);
    expect(res.body.images).toHaveLength(2);
    expect(res.body.images[0]).toMatch(new RegExp(`^https://api\\.geeketoys\\.com\\.br/uploads/products/${PID}/.+\\.jpg$`));
    expect(res.body.skippedOverLimit).toBe(0);
    expect(filesOnDisk()).toHaveLength(2);
  });

  it('deletes from disk what did not fit under the cap', async () => {
    svc.addProductImages.mockImplementation(async (_id: string, urls: string[]) => ({
      product: { id: PID },
      accepted: urls.slice(0, 1),
      rejected: urls.slice(1),
    }));
    const res = await api.post(`/${PID}/images`, {
      as: 'admin',
      form: form('images', [
        [JPEG, 'a.jpg', 'image/jpeg'],
        [JPEG, 'b.jpg', 'image/jpeg'],
      ]),
    });
    expect(res.body.skippedOverLimit).toBe(1);
    expect(filesOnDisk()).toHaveLength(1);
  });

  it('refuses an iPhone HEIC with its own message, and garbage with another', async () => {
    const heic = await api.post(`/${PID}/images`, { as: 'admin', form: form('images', [[HEIC, 'foto.jpg', 'image/jpeg']]) });
    expect(heic.status).toBe(400);
    expect(heic.body.code).toBe('HEIC_NOT_SUPPORTED');

    const junk = await api.post(`/${PID}/images`, { as: 'admin', form: form('images', [[Buffer.from('not an image'), 'x.jpg', 'image/jpeg']]) });
    expect(junk.body.code).toBe('INVALID_IMAGE');
    expect(filesOnDisk()).toHaveLength(0);
    expect(svc.addProductImages).not.toHaveBeenCalled();
  });

  it('refuses a non-image type, too many files, an empty request and a bad id', async () => {
    const pdf = await api.post(`/${PID}/images`, { as: 'admin', form: form('images', [[JPEG, 'doc.pdf', 'application/pdf']]) });
    expect(pdf.body.code).toBe('INVALID_IMAGE_TYPE');

    const four = form('images', Array.from({ length: 4 }, (_, i) => [JPEG, `${i}.jpg`, 'image/jpeg'] as [Buffer, string, string]));
    expect((await api.post(`/${PID}/images`, { as: 'admin', form: four })).body.code).toBe('TOO_MANY_IMAGES');

    expect((await api.post(`/${PID}/images`, { as: 'admin', form: new FormData() })).body.code).toBe('NO_IMAGES');

    const traversal = await api.post('/..%2F..%2Fetc/images', { as: 'admin', form: form('images', [[JPEG, 'a.jpg', 'image/jpeg']]) });
    expect(traversal.status).toBe(400);
  });

  it('cleans the disk when the service throws', async () => {
    svc.addProductImages.mockRejectedValue(new Error('db down'));
    const res = await api.post(`/${PID}/images`, { as: 'admin', form: form('images', [[JPEG, 'a.jpg', 'image/jpeg']]) });
    expect(res.status).toBe(500);
    expect(filesOnDisk()).toHaveLength(0);
  });

  it('returns only URLs for variant photos, without touching the gallery', async () => {
    const res = await api.post(`/${PID}/media`, { as: 'admin', form: form('images', [[JPEG, 'v.jpg', 'image/jpeg']]) });
    expect(res.status).toBe(201);
    expect(res.body.urls).toHaveLength(1);
    expect(svc.addProductImages).not.toHaveBeenCalled();

    expect((await api.post(`/${PID}/media`, { as: 'admin', form: new FormData() })).body.code).toBe('NO_IMAGES');
    expect((await api.post(`/${PID}/media`, { as: 'admin', form: form('images', [[HEIC, 'h.jpg', 'image/jpeg']]) })).body.code).toBe('HEIC_NOT_SUPPORTED');
  });
});

describe('video upload', () => {
  it('keeps a real MP4 with its title', async () => {
    svc.addProductVideo.mockResolvedValue({ id: PID });
    const res = await api.post(`/${PID}/video`, { as: 'admin', form: form('video', [[MP4, 'clip.mp4', 'video/mp4']], { title: 'Unboxing' }) });
    expect(res.status).toBe(201);
    expect(svc.addProductVideo).toHaveBeenCalledWith(PID, expect.objectContaining({ kind: 'file', title: 'Unboxing' }));
    expect(filesOnDisk()).toHaveLength(1);
  });

  it('refuses a file that is not a playable MP4, and removes it', async () => {
    const res = await api.post(`/${PID}/video`, { as: 'admin', form: form('video', [[Buffer.from('junk video'), 'clip.mp4', 'video/mp4']]) });
    expect(res.body.code).toBe('INVALID_VIDEO');
    expect(filesOnDisk()).toHaveLength(0);

    expect((await api.post(`/${PID}/video`, { as: 'admin', form: form('video', [[MP4, 'clip.txt', 'text/plain']]) })).body.code).toBe('INVALID_VIDEO');
    expect((await api.post(`/${PID}/video`, { as: 'admin', form: new FormData() })).body.code).toBe('NO_VIDEO');
  });

  it('removes the file when the service throws', async () => {
    svc.addProductVideo.mockRejectedValue(new Error('cap reached'));
    const res = await api.post(`/${PID}/video`, { as: 'admin', form: form('video', [[MP4, 'clip.mp4', 'video/mp4']]) });
    expect(res.status).toBe(500);
    expect(filesOnDisk()).toHaveLength(0);
  });
});
