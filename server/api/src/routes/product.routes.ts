import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { env, SHOP_CANONICAL_URL } from '../config/env.js';
import { isPlayableVideoHeader, FTYP_PROBE_BYTES } from '../utils/video.js';
import * as productService from '../services/product.service.js';

export const productRouter = Router();

// ─── Public: categories ──────────────────────────────────────────────────────
// NOTE: defined before '/:slug' so "categories" is not captured as a product slug.

productRouter.get('/categories', async (_req, res, next) => {
  try {
    res.json(await productService.listCategories(false));
  } catch (err) {
    next(err);
  }
});

// GET /products/categories/all — admin: includes inactive ones and how many
// products each category has (that is what says whether a delete would empty
// the storefront). Before '/:slug' for the same reason as the route above.
productRouter.get('/categories/all', authenticate, requireRole('admin'), async (_req, res, next) => {
  try {
    res.json({ categories: await productService.listCategoriesForAdmin() });
  } catch (err) {
    next(err);
  }
});

// GET /products/admin/catalog — the catalogue as the panel must see it.
//
// The panel used to read the public list, which forces `active = TRUE`: a
// product saved with "Ativo" unticked vanished from the panel that had just
// created it, and a duplicate (which is born inactive by design) was lost the
// moment its modal closed. There was no way back to either without SQL.
//
// Inactive, but still not the `checkup%` seed rows: those are excluded from the
// reports, the stock screen and the sitemap too, and the panel is a catalogue,
// not a QA log.
//
// Declared before '/:slug' so "admin" is not captured as a product slug.
productRouter.get('/admin/catalog', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await productService.listProducts({
      category: req.query.category as string | undefined,
      search: req.query.search as string | undefined,
      featured: req.query.featured === 'true',
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      includeInactive: true,
      wholesaleOnly: req.query.wholesale === 'true',
      sort: productService.parseProductSort(req.query.sort),
      includeStats: req.query.stats === 'true',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Public: dynamic product sitemap (XML for shop SEO) ──────────────────────
// Must be before /:slug so "sitemap.xml" is not treated as a slug.

productRouter.get('/sitemap.xml', async (_req, res, next) => {
  try {
    const xml = await productService.buildProductSitemapXml(SHOP_CANONICAL_URL);
    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
});

// ─── Public: products ────────────────────────────────────────────────────────

productRouter.get('/', async (req, res, next) => {
  try {
    const result = await productService.listProducts({
      category: req.query.category as string | undefined,
      search: req.query.search as string | undefined,
      featured: req.query.featured === 'true',
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      includeInactive: false,
      wholesaleOnly: req.query.wholesale === 'true' || req.query.channel === 'wholesale',
      sort: productService.parseProductSort(req.query.sort),
      includeStats: req.query.stats === 'true',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /products/:slug/share — product meta as HTML, for link previews.
// Declared before '/:slug' so it is not swallowed as a slug.
productRouter.get('/:slug/share', async (req, res, next) => {
  try {
    const html = await productService.buildProductShareHtml(
      req.params.slug as string,
      SHOP_CANONICAL_URL
    );
    if (!html) {
      res.status(404).type('html').send('<!DOCTYPE html><title>Produto não encontrado</title>');
      return;
    }
    // Short cache: photo and price track the catalogue, but the WhatsApp
    // crawler refetches the same link several times in a row.
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(html);
  } catch (err) {
    next(err);
  }
});

productRouter.get('/:slug/related', async (req, res, next) => {
  try {
    const products = await productService.listRelatedProducts(req.params.slug as string, 8);
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

// Co-purchase, not similarity — see listAlsoBoughtProducts. Returns an empty
// list when the sales data says nothing, and the page hides the block.
productRouter.get('/:slug/also-bought', async (req, res, next) => {
  try {
    const products = await productService.listAlsoBoughtProducts(req.params.slug as string, 8);
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

productRouter.get('/:slug', async (req, res, next) => {
  try {
    const product = await productService.getProductBySlug(req.params.slug as string, false);
    if (!product) {
      res.status(404).json({ error: 'Produto não encontrado.' });
      return;
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// ─── Admin: category CRUD ────────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  icon: z.string().max(40).optional().nullable(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  /** Null makes it top-level. Depth is validated in the service. */
  parentId: z.string().uuid().nullable().optional(),
});

productRouter.post('/categories', authenticate, requireRole('admin'), validate(categorySchema), async (req, res, next) => {
  try {
    res.status(201).json(await productService.createCategory(req.body));
  } catch (err) {
    next(err);
  }
});

productRouter.patch('/categories/:id', authenticate, requireRole('admin'), validate(categorySchema.partial()), async (req, res, next) => {
  try {
    res.json(await productService.updateCategory(req.params.id as string, req.body));
  } catch (err) {
    next(err);
  }
});

productRouter.delete('/categories/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    await productService.deactivateCategory(req.params.id as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─── Admin: product CRUD ─────────────────────────────────────────────────────

const MAX_PRODUCT_PRICE = 999_999.99;
const moneySchema = z.number().nonnegative().max(MAX_PRODUCT_PRICE);

const {
  MAX_PRODUCT_IMAGES,
  MAX_VARIANT_IMAGES,
  MAX_IMAGE_UPLOAD_BATCH,
  MAX_PRODUCT_CATEGORIES,
  MAX_PRODUCT_VIDEOS,
  PRODUCT_VIDEO_MAX_BYTES,
} = productService;

const productSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  price: moneySchema,
  compareAtPrice: moneySchema.optional().nullable(),
  /** Acquisition cost. Null means "not filled in" and stays out of the margin. */
  costPrice: moneySchema.optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  /** First entry becomes primary. Takes precedence over categoryId. */
  categoryIds: z.array(z.string().uuid()).max(MAX_PRODUCT_CATEGORIES).optional(),
  images: z.array(z.string().url()).max(MAX_PRODUCT_IMAGES).optional(),
  videos: z
    .array(
      z.object({
        kind: z.enum(['youtube', 'instagram', 'file']),
        url: z.string().url(),
        title: z.string().max(200).optional(),
      })
    )
    .max(MAX_PRODUCT_VIDEOS)
    .optional(),
  stock: z.number().int().nonnegative().optional(),
  sku: z.string().max(60).optional().nullable(),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
  weightG: z.number().int().positive().optional().nullable(),
  heightCm: z.number().positive().optional().nullable(),
  widthCm: z.number().positive().optional().nullable(),
  lengthCm: z.number().positive().optional().nullable(),
  wholesaleEnabled: z.boolean().optional(),
  wholesaleMinQty: z.number().int().positive().max(9999).optional(),
  hasVariants: z.boolean().optional(),
  variantAxes: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        options: z.array(z.string().min(1).max(60)).min(1).max(50),
      })
    )
    .optional(),
});

const variantsReplaceSchema = z.object({
  axes: z.array(
    z.object({
      name: z.string().min(1).max(40),
      options: z.array(z.string().min(1).max(60)).min(1).max(50),
    })
  ),
  variants: z.array(
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(200),
      options: z.record(z.string()),
      sku: z.string().max(60).optional().nullable(),
      price: moneySchema,
      compareAtPrice: moneySchema.optional().nullable(),
      costPrice: moneySchema.optional().nullable(),
      stock: z.number().int().nonnegative().optional(),
      images: z.array(z.string()).max(MAX_VARIANT_IMAGES).optional(),
      active: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    })
  ),
});

productRouter.post('/', authenticate, requireRole('admin'), validate(productSchema), async (req, res, next) => {
  try {
    res.status(201).json(await productService.createProduct(req.body));
  } catch (err) {
    next(err);
  }
});

const bulkCategoriesSchema = z.object({
  // 200 is the admin page size ceiling — a request that batches more than one
  // full screen of products is a script, not the panel.
  productIds: z.array(z.string().uuid()).min(1).max(200),
  categoryIds: z.array(z.string().uuid()).min(1).max(5),
  mode: z.enum(['replace', 'add', 'remove']).default('replace'),
});

// PATCH /products/bulk/categories — re-files a selection in one shot.
// Declared before '/:id' so "bulk" is never read as a product id.
productRouter.patch(
  '/bulk/categories',
  authenticate,
  requireRole('admin'),
  validate(bulkCategoriesSchema),
  async (req, res, next) => {
    try {
      const { productIds, categoryIds, mode } = req.body;
      res.json(await productService.bulkSetProductCategories(productIds, categoryIds, mode));
    } catch (err) {
      next(err);
    }
  }
);

productRouter.patch('/:id', authenticate, requireRole('admin'), validate(productSchema.partial()), async (req, res, next) => {
  try {
    res.json(await productService.updateProduct(req.params.id as string, req.body));
  } catch (err) {
    next(err);
  }
});

// GET /products/:id/edit — full product for the admin panel.
// The public detail route hides inactive products and variants; the admin needs
// both, otherwise the modal opens without variants and the next save wipes what
// was never loaded.
productRouter.get('/:id/edit', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id as string);
    if (!product) {
      res.status(404).json({ error: 'Produto não encontrado.' });
      return;
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// POST /products/:id/duplicate — inactive clone for bulk entry
productRouter.post('/:id/duplicate', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    res.status(201).json(await productService.duplicateProduct(req.params.id as string));
  } catch (err) {
    next(err);
  }
});

// PUT /products/:id/variants — persist axes + SKU matrix (Shopee-style)
productRouter.put(
  '/:id/variants',
  authenticate,
  requireRole('admin'),
  validate(variantsReplaceSchema),
  async (req, res, next) => {
    try {
      res.json(
        await productService.replaceVariants(req.params.id as string, req.body.axes, req.body.variants)
      );
    } catch (err) {
      next(err);
    }
  }
);

productRouter.get('/:id/variants', async (req, res, next) => {
  try {
    // Public list of active variants by product id (or by parent slug via product fetch)
    const variants = await productService.listVariants(req.params.id as string, false);
    res.json({ variants });
  } catch (err) {
    next(err);
  }
});

productRouter.delete('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    await productService.deactivateProduct(req.params.id as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─── Admin: product image upload ─────────────────────────────────────────────

const PRODUCT_IMAGE_MAX_BYTES = 40 * 1024 * 1024; // 40 MB — 4K phone photos; client resizes before send

/** iPhone often sends image/heic (sometimes with JPEG bytes). Android may send image/jpg. */
function isLikelyImageUpload(file: Express.Multer.File): boolean {
  const mime = (file.mimetype || '').toLowerCase();
  const name = (file.originalname || '').toLowerCase();
  if (!mime || mime === 'application/octet-stream') return true;
  if (mime.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|hei[cf])$/.test(name);
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const productId = String(req.params.id || 'temp');
    const dir = path.join('/app/uploads/products', productId);
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err as Error, dir);
    }
  },
  filename: (_req, file, cb) => {
    const rawExt = (path.extname(file.originalname) || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    const byMime =
      mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
    const ext = ['.jpg', '.jpeg', '.png', '.webp'].includes(rawExt)
      ? rawExt === '.jpeg'
        ? '.jpg'
        : rawExt
      : byMime;
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES, files: MAX_IMAGE_UPLOAD_BATCH },
  fileFilter: (_req, file, cb) => {
    if (isLikelyImageUpload(file)) {
      cb(null, true);
    } else {
      cb(new Error('Envie uma foto (JPEG, PNG, WEBP ou da galeria do celular).'));
    }
  },
});

/** Map multer / file-filter failures to clear 4xx responses (not generic 500). */
function handleProductImageUpload(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
): void {
  upload.array('images', MAX_IMAGE_UPLOAD_BATCH)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: 'Imagem muito grande. Máximo 40 MB por arquivo — fotos 4K são reduzidas automaticamente no painel.',
          code: 'IMAGE_TOO_LARGE',
        });
        return;
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({
          error: `Envie no máximo ${MAX_IMAGE_UPLOAD_BATCH} imagens por vez.`,
          code: 'TOO_MANY_IMAGES',
        });
        return;
      }
      res.status(400).json({ error: `Falha no upload: ${err.message}`, code: err.code });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({
        error: err.message || 'Arquivo de imagem inválido.',
        code: 'INVALID_IMAGE_TYPE',
      });
      return;
    }
    next(err);
  });
}

/** Sniff real image bytes (MIME from phones is often wrong). */
function sniffImageKind(filePath: string): 'jpeg' | 'png' | 'webp' | 'heic' | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    const brand = buf.toString('ascii', 4, 8);
    const ftyp = buf.toString('ascii', 8, 12);
    if (brand === 'ftyp' && /^(heic|heif|mif1|msf1)/i.test(ftyp)) return 'heic';
    return null;
  } catch {
    return null;
  }
}

function discardUpload(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* already removed, or never written */
  }
}

/**
 * Validates the received bytes and returns public URLs, keeping each URL's disk
 * path so the caller can delete whatever does not get persisted.
 */
function collectUploadedImages(
  files: Express.Multer.File[],
  productId: string
): { urls: string[]; pathByUrl: Map<string, string>; sawHeic: boolean } {
  const urls: string[] = [];
  const pathByUrl = new Map<string, string>();
  let sawHeic = false;

  for (const f of files) {
    const kind = sniffImageKind(f.path);
    if (kind === 'heic') sawHeic = true;
    if (kind !== 'jpeg' && kind !== 'png' && kind !== 'webp') {
      discardUpload(f.path);
      continue;
    }
    const url = `${env.API_URL}/uploads/products/${productId}/${path.basename(f.path)}`;
    urls.push(url);
    pathByUrl.set(url, f.path);
  }

  return { urls, pathByUrl, sawHeic };
}

function rejectInvalidUpload(res: import('express').Response, sawHeic: boolean): void {
  res.status(400).json(
    sawHeic
      ? {
          error:
            'Foto HEIC do iPhone. Atualize a página e envie de novo (o painel converte no Safari) ou exporte como JPEG.',
          code: 'HEIC_NOT_SUPPORTED',
        }
      : {
          error: 'Arquivos enviados não são imagens válidas (JPEG, PNG ou WEBP).',
          code: 'INVALID_IMAGE',
        }
  );
}

// PATCH /products/:id/images — swap one photo for its edited version.
// Named by URL rather than by index: the panel's array is the *unsaved* one, so
// an index would silently repoint at whatever the seller had just removed.
const replaceImageSchema = z.object({
  from: z.string().url(),
  to: z.string().url(),
});

productRouter.patch(
  '/:id/images',
  authenticate,
  requireRole('admin'),
  validate(replaceImageSchema),
  async (req, res, next) => {
    try {
      const { from, to } = req.body;
      res.json(await productService.replaceProductImage(req.params.id as string, from, to));
    } catch (err) {
      next(err);
    }
  }
);

// POST /products/:id/images — upload a batch of product (listing) images
productRouter.post(
  '/:id/images',
  authenticate,
  requireRole('admin'),
  handleProductImageUpload,
  async (req, res, next) => {
    try {
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ error: 'Nenhuma imagem enviada.', code: 'NO_IMAGES' });
        return;
      }
      const productId = req.params.id as string;
      const { urls, pathByUrl, sawHeic } = collectUploadedImages(files, productId);
      if (urls.length === 0) {
        rejectInvalidUpload(res, sawHeic);
        return;
      }

      let result;
      try {
        result = await productService.addProductImages(productId, urls);
      } catch (err) {
        for (const url of urls) discardUpload(pathByUrl.get(url) as string);
        throw err;
      }
      // Whatever did not fit under the cap must not linger on disk.
      for (const url of result.rejected) discardUpload(pathByUrl.get(url) as string);

      console.log(
        `[UPLOAD] product=${productId} kept=${result.accepted.length}/${files.length}` +
          `${result.rejected.length ? ` over-limit=${result.rejected.length}` : ''}` +
          `${sawHeic ? ' heic-skipped' : ''}`
      );
      res.status(201).json({ ...result.product, skippedOverLimit: result.rejected.length });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Admin: video upload (MP4) ───────────────────────────────────────────────

const videoStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join('/app/uploads/products', String(req.params.id || 'temp'));
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err as Error, dir);
    }
  },
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.mp4`),
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: PRODUCT_VIDEO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    if (mime.startsWith('video/') || /\.(mp4|mov|m4v)$/.test(name)) {
      cb(null, true);
    } else {
      cb(new Error('Envie um vídeo MP4.'));
    }
  },
});

/** MP4/MOV only: the browser must play it without transcoding. */
function isPlayableVideo(filePath: string): boolean {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(FTYP_PROBE_BYTES);
    const read = fs.readSync(fd, buf, 0, FTYP_PROBE_BYTES, 0);
    return isPlayableVideoHeader(buf.subarray(0, read));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* already closed */
      }
    }
  }
}

// POST /products/:id/video — uploads an MP4 and appends it to products.videos
productRouter.post(
  '/:id/video',
  authenticate,
  requireRole('admin'),
  (req, res, next) => {
    videoUpload.single('video')(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: `Vídeo muito grande (máximo ${Math.round(PRODUCT_VIDEO_MAX_BYTES / 1024 / 1024)} MB). Para arquivos maiores, suba no YouTube e cole o link.`,
          code: 'VIDEO_TOO_LARGE',
        });
        return;
      }
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Arquivo de vídeo inválido.',
        code: 'INVALID_VIDEO',
      });
    });
  },
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Nenhum vídeo enviado.', code: 'NO_VIDEO' });
        return;
      }
      if (!isPlayableVideo(file.path)) {
        discardUpload(file.path);
        res.status(400).json({
          error: 'Arquivo não é um MP4 válido. Exporte como MP4 (H.264) e envie de novo.',
          code: 'INVALID_VIDEO',
        });
        return;
      }

      const url = `${env.API_URL}/uploads/products/${req.params.id}/${path.basename(file.path)}`;
      try {
        const product = await productService.addProductVideo(req.params.id as string, {
          kind: 'file',
          url,
          title: req.body?.title ? String(req.body.title).slice(0, 200) : undefined,
        });
        console.log(`[UPLOAD] video product=${req.params.id} bytes=${file.size}`);
        res.status(201).json(product);
      } catch (err) {
        discardUpload(file.path);
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
);

// POST /products/:id/media — uploads files and returns only the URLs.
// Used by variant photos: those belong to the SKU (product_variants.images,
// written by PUT /variants), not to the listing gallery. The panel used to reuse
// /images for this, and every variant inflated products.images past its cap.
productRouter.post(
  '/:id/media',
  authenticate,
  requireRole('admin'),
  handleProductImageUpload,
  async (req, res, next) => {
    try {
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ error: 'Nenhuma imagem enviada.', code: 'NO_IMAGES' });
        return;
      }
      const { urls, sawHeic } = collectUploadedImages(files, req.params.id as string);
      if (urls.length === 0) {
        rejectInvalidUpload(res, sawHeic);
        return;
      }
      console.log(`[UPLOAD] media product=${req.params.id} kept=${urls.length}/${files.length}`);
      res.status(201).json({ urls });
    } catch (err) {
      next(err);
    }
  }
);
