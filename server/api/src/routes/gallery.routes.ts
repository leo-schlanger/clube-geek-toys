import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publicLookupLimiter } from '../middleware/rate-limit.js';
import { env } from '../config/env.js';
import * as galleryService from '../services/gallery.service.js';

export const galleryRouter = Router();

const { MAX_PHOTO_UPLOAD_BATCH } = galleryService;
const PHOTO_MAX_BYTES = 40 * 1024 * 1024;

// ─── Público ─────────────────────────────────────────────────────────────────

// GET /gallery — álbuns ativos com capa e contagem
galleryRouter.get('/', publicLookupLimiter, async (_req, res, next) => {
  try {
    res.json({ albums: await galleryService.listAlbums(false) });
  } catch (err) {
    next(err);
  }
});

// GET /gallery/:slug — álbum com as fotos
galleryRouter.get('/:slug', publicLookupLimiter, async (req, res, next) => {
  try {
    const album = await galleryService.getAlbum(req.params.slug as string, false);
    if (!album) {
      res.status(404).json({ error: 'Álbum não encontrado.' });
      return;
    }
    res.json(album);
  } catch (err) {
    next(err);
  }
});

// ─── Admin ───────────────────────────────────────────────────────────────────

const adminOnly = [authenticate, requireRole('admin')] as const;

// GET /gallery/admin/albums — inclui inativos
galleryRouter.get('/admin/albums', ...adminOnly, async (_req, res, next) => {
  try {
    res.json({ albums: await galleryService.listAlbums(true) });
  } catch (err) {
    next(err);
  }
});

const albumSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  /** ISO date (YYYY-MM-DD) ou vazio para "sem data". */
  eventDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional().nullable(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

galleryRouter.post('/albums', ...adminOnly, validate(albumSchema), async (req, res, next) => {
  try {
    res.status(201).json(await galleryService.createAlbum(req.body, req.user!.userId));
  } catch (err) {
    next(err);
  }
});

galleryRouter.patch(
  '/albums/:id',
  ...adminOnly,
  validate(albumSchema.partial()),
  async (req, res, next) => {
    try {
      res.json(
        await galleryService.updateAlbum(req.params.id as string, req.body, req.user!.userId)
      );
    } catch (err) {
      next(err);
    }
  }
);

function discardFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* já removido */
  }
}

/** Apaga do disco o arquivo servido por uma URL de /uploads. */
function discardUploadedUrl(url: string): void {
  try {
    const marker = '/uploads/';
    const index = url.indexOf(marker);
    if (index === -1) return;
    const relative = url.slice(index + marker.length);
    // Nunca deixa o caminho escapar do volume.
    if (relative.includes('..')) return;
    fs.unlinkSync(path.join('/app/uploads', relative));
  } catch {
    /* arquivo já removido ou externo */
  }
}

galleryRouter.delete('/albums/:id', ...adminOnly, async (req, res, next) => {
  try {
    const urls = await galleryService.deleteAlbum(req.params.id as string, req.user!.userId);
    for (const url of urls) discardUploadedUrl(url);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─── Upload de fotos ─────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join('/app/uploads/gallery', String(req.params.id || 'temp'));
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err as Error, dir);
    }
  },
  filename: (_req, file, cb) => {
    const raw = (path.extname(file.originalname) || '').toLowerCase();
    const ext = ['.jpg', '.jpeg', '.png', '.webp'].includes(raw)
      ? raw === '.jpeg'
        ? '.jpg'
        : raw
      : '.jpg';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: PHOTO_MAX_BYTES, files: MAX_PHOTO_UPLOAD_BATCH },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    if (!mime || mime === 'application/octet-stream' || mime.startsWith('image/')) {
      cb(null, true);
    } else if (/\.(jpe?g|png|webp|hei[cf])$/.test(name)) {
      cb(null, true);
    } else {
      cb(new Error('Envie uma foto (JPEG, PNG ou WEBP).'));
    }
  },
});

/** Confere os bytes: MIME de celular mente com frequência. */
function isRealImage(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
    return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  } catch {
    return false;
  }
}

// POST /gallery/albums/:id/photos
galleryRouter.post(
  '/albums/:id/photos',
  ...adminOnly,
  (req, res, next) => {
    upload.array('photos', MAX_PHOTO_UPLOAD_BATCH)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Foto muito grande (máximo 40 MB).', code: 'IMAGE_TOO_LARGE' });
        return;
      }
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Arquivo inválido.',
        code: 'INVALID_IMAGE',
      });
    });
  },
  async (req, res, next) => {
    try {
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ error: 'Nenhuma foto enviada.', code: 'NO_PHOTOS' });
        return;
      }

      const albumId = req.params.id as string;
      const urls: string[] = [];
      const pathByUrl = new Map<string, string>();
      for (const f of files) {
        if (!isRealImage(f.path)) {
          discardFile(f.path);
          continue;
        }
        const url = `${env.API_URL}/uploads/gallery/${albumId}/${path.basename(f.path)}`;
        urls.push(url);
        pathByUrl.set(url, f.path);
      }
      if (urls.length === 0) {
        res.status(400).json({ error: 'Arquivos não são imagens válidas.', code: 'INVALID_IMAGE' });
        return;
      }

      let result;
      try {
        result = await galleryService.addPhotos(albumId, urls);
      } catch (err) {
        for (const url of urls) discardFile(pathByUrl.get(url) as string);
        throw err;
      }
      for (const url of result.rejected) discardFile(pathByUrl.get(url) as string);

      res.status(201).json({ photos: result.photos, skippedOverLimit: result.rejected.length });
    } catch (err) {
      next(err);
    }
  }
);

galleryRouter.delete('/albums/:id/photos/:photoId', ...adminOnly, async (req, res, next) => {
  try {
    const url = await galleryService.deletePhoto(
      req.params.id as string,
      req.params.photoId as string,
      req.user!.userId
    );
    discardUploadedUrl(url);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const captionSchema = z.object({ caption: z.string().max(300).optional().nullable() });

galleryRouter.patch(
  '/albums/:id/photos/:photoId',
  ...adminOnly,
  validate(captionSchema),
  async (req, res, next) => {
    try {
      res.json(
        await galleryService.updatePhoto(
          req.params.id as string,
          req.params.photoId as string,
          req.body.caption ?? null
        )
      );
    } catch (err) {
      next(err);
    }
  }
);

const reorderSchema = z.object({ photoIds: z.array(z.string().uuid()).max(300) });

galleryRouter.put(
  '/albums/:id/photos/order',
  ...adminOnly,
  validate(reorderSchema),
  async (req, res, next) => {
    try {
      const photos = await galleryService.reorderPhotos(req.params.id as string, req.body.photoIds);
      res.json({ photos });
    } catch (err) {
      next(err);
    }
  }
);
