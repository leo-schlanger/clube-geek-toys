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
    });
    res.json(result);
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

const productSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  price: z.number().nonnegative(),
  compareAtPrice: z.number().nonnegative().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  images: z.array(z.string().url()).max(8).optional(),
  stock: z.number().int().nonnegative().optional(),
  sku: z.string().max(60).optional().nullable(),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
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

productRouter.delete('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    await productService.deactivateProduct(req.params.id as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─── Admin: product image upload ─────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const productId = String(req.params.id || 'temp');
    const dir = path.join('/app/uploads/products', productId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens JPEG, PNG ou WEBP são permitidas'));
    }
  },
});

/** Validate real image content by magic bytes (MIME can be spoofed). */
function isValidImage(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const webp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
    return jpeg || png || webp;
  } catch {
    return false;
  }
}

// POST /products/:id/images — upload up to 6 product images
productRouter.post('/:id/images', authenticate, requireRole('admin'), upload.array('images', 6), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      res.status(400).json({ error: 'Nenhuma imagem enviada.' });
      return;
    }
    const urls: string[] = [];
    for (const f of files) {
      if (!isValidImage(f.path)) {
        try { fs.unlinkSync(f.path); } catch { /* ignore */ }
        continue;
      }
      urls.push(`${env.API_URL}/uploads/products/${req.params.id}/${path.basename(f.path)}`);
    }
    if (urls.length === 0) {
      res.status(400).json({ error: 'Arquivos enviados não são imagens válidas.', code: 'INVALID_IMAGE' });
      return;
    }
    const product = await productService.addProductImages(req.params.id as string, urls);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});
