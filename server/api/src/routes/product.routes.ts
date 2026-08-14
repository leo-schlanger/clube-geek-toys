import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { env } from '../config/env.js';
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

// ─── Public: dynamic product sitemap (XML for shop SEO) ──────────────────────
// Must be before /:slug so "sitemap.xml" is not treated as a slug.

productRouter.get('/sitemap.xml', async (_req, res, next) => {
  try {
    const xml = await productService.buildProductSitemapXml('https://shop.geeketoys.com.br');
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

productRouter.get('/:slug/related', async (req, res, next) => {
  try {
    const products = await productService.listRelatedProducts(req.params.slug as string, 8);
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
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
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

/** Preço em BRL: 0 … 999999.99 (XXXXXX.XX) — sem teto artificial baixo. */
const MAX_PRODUCT_PRICE = 999_999.99;
const moneySchema = z.number().nonnegative().max(MAX_PRODUCT_PRICE);

const productSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  price: moneySchema,
  compareAtPrice: moneySchema.optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  images: z.array(z.string().url()).max(8).optional(),
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
      stock: z.number().int().nonnegative().optional(),
      images: z.array(z.string()).max(8).optional(),
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

productRouter.patch('/:id', authenticate, requireRole('admin'), validate(productSchema.partial()), async (req, res, next) => {
  try {
    res.json(await productService.updateProduct(req.params.id as string, req.body));
  } catch (err) {
    next(err);
  }
});

// PUT /products/:id/variants — salva eixos + matriz de SKUs (estilo Shopee)
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
  limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES, files: 6 },
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
  upload.array('images', 6)(req, res, (err: unknown) => {
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
          error: 'Envie no máximo 6 imagens por vez.',
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

// POST /products/:id/images — upload up to 6 product images
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
      const urls: string[] = [];
      let sawHeic = false;
      for (const f of files) {
        const kind = sniffImageKind(f.path);
        if (kind === 'heic') sawHeic = true;
        if (kind !== 'jpeg' && kind !== 'png' && kind !== 'webp') {
          try {
            fs.unlinkSync(f.path);
          } catch {
            /* ignore */
          }
          continue;
        }
        urls.push(`${env.API_URL}/uploads/products/${req.params.id}/${path.basename(f.path)}`);
      }
      if (urls.length === 0) {
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
        return;
      }
      const product = await productService.addProductImages(req.params.id as string, urls);
      console.log(
        `[UPLOAD] product=${req.params.id} kept=${urls.length}/${files.length}${sawHeic ? ' heic-skipped' : ''}`
      );
      res.status(201).json(product);
    } catch (err) {
      next(err);
    }
  }
);
