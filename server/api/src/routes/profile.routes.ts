import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { env } from '../config/env.js';
import { sniffImageKind, extensionFor, IMAGE_PROBE_BYTES } from '../utils/image.js';
import * as profileService from '../services/profile.service.js';
import { GENDERS } from '../services/profile.service.js';

export const profileRouter = Router();

/**
 * Every route requires `authenticate` and acts on the caller's own account via
 * `req.user.userId`. There is no id parameter, so no way to read someone
 * else's profile.
 */

const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

const addressSchema = z.object({
  cep: z.string().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
  street: z.string().min(1).max(200),
  number: z.string().min(1).max(20),
  complement: z.string().max(100).optional(),
  neighborhood: z.string().min(1).max(120),
  city: z.string().min(1).max(120),
  state: z.string().length(2),
});

const updateSchema = z.object({
  fullName: z.string().min(1).max(200).nullable().optional(),
  phone: z
    .string()
    .regex(/^\+?[\d\s()-]{10,20}$/, 'Telefone inválido')
    .nullable()
    .optional(),
  // Date only, no time: a timezone must not shift someone's birthday.
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return false;
      const age = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
      return age >= 0 && age < 120;
    }, 'Data de nascimento fora do intervalo aceito')
    .nullable()
    .optional(),
  gender: z.enum(GENDERS).nullable().optional(),
  address: addressSchema.nullable().optional(),
  marketingConsent: z.boolean().optional(),
});

profileRouter.get('/', authenticate, async (req, res, next) => {
  try {
    res.json(await profileService.getProfile(req.user!.userId));
  } catch (err) {
    next(err);
  }
});

// PATCH /profile — writes only the fields present in the body
profileRouter.patch('/', authenticate, validate(updateSchema), async (req, res, next) => {
  try {
    res.json(await profileService.upsertProfile(req.user!.userId, req.body));
  } catch (err) {
    next(err);
  }
});

// ─── Profile photo (optional) ────────────────────────────────────────────────

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = '/app/uploads/profiles';
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err as Error, dir);
    }
  },
  // Random name: putting the user id in the path would leak the photo's owner
  // to anyone who saw the URL.
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.bin`),
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: PHOTO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    // Phone MIME types lie; the bytes are checked after the upload.
    if (!mime || mime === 'application/octet-stream' || mime.startsWith('image/')) {
      cb(null, true);
    } else if (/\.(jpe?g|png|webp|hei[cf])$/.test(name)) {
      cb(null, true);
    } else {
      cb(new Error('Envie uma foto (JPEG, PNG ou WEBP).'));
    }
  },
});

function discard(filePath: string): void {
  fs.promises.unlink(filePath).catch(() => {});
}

// POST /profile/photo
profileRouter.post(
  '/photo',
  authenticate,
  (req, res, next) => {
    photoUpload.single('photo')(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: `Foto muito grande (máximo ${PHOTO_MAX_BYTES / 1024 / 1024} MB).`,
          code: 'IMAGE_TOO_LARGE',
        });
        return;
      }
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Arquivo inválido.',
        code: 'INVALID_IMAGE',
      });
    });
  },
  async (req, res, next) => {
    const file = req.file;
    try {
      if (!file) {
        res.status(400).json({ error: 'Nenhuma foto enviada.', code: 'NO_IMAGE' });
        return;
      }

      const handle = await fs.promises.open(file.path, 'r');
      let kind: ReturnType<typeof sniffImageKind>;
      try {
        const buf = Buffer.alloc(IMAGE_PROBE_BYTES);
        await handle.read(buf, 0, IMAGE_PROBE_BYTES, 0);
        kind = sniffImageKind(buf);
      } finally {
        await handle.close();
      }

      if (!kind) {
        discard(file.path);
        res.status(400).json({
          error: 'Arquivo não é uma imagem válida. Envie JPEG, PNG ou WEBP.',
          code: 'INVALID_IMAGE',
        });
        return;
      }
      if (kind === 'heic') {
        discard(file.path);
        res.status(400).json({
          error:
            'Foto em HEIC não é exibida pelos navegadores. No iPhone, use Ajustes › Câmera › Formatos › "Mais compatível", ou envie como JPEG.',
          code: 'HEIC_NOT_SUPPORTED',
        });
        return;
      }

      // Rename with the real extension only after the bytes confirm it.
      const finalPath = file.path.replace(/\.bin$/, extensionFor(kind));
      await fs.promises.rename(file.path, finalPath);

      const url = `${env.API_URL}/uploads/profiles/${path.basename(finalPath)}`;
      const profile = await profileService.setProfilePhoto(req.user!.userId, url);
      res.status(201).json(profile);
    } catch (err) {
      if (file) discard(file.path);
      next(err);
    }
  }
);

// DELETE /profile/photo
profileRouter.delete('/photo', authenticate, async (req, res, next) => {
  try {
    res.json(await profileService.setProfilePhoto(req.user!.userId, null));
  } catch (err) {
    next(err);
  }
});

// ─── Saved products ──────────────────────────────────────────────────────────

// GET /profile/saved
profileRouter.get('/saved', authenticate, async (req, res, next) => {
  try {
    res.json(await profileService.listSavedProducts(req.user!.userId));
  } catch (err) {
    next(err);
  }
});

// GET /profile/saved/ids — ids only, so the catalogue can fill in hearts
profileRouter.get('/saved/ids', authenticate, async (req, res, next) => {
  try {
    res.json(await profileService.listSavedProductIds(req.user!.userId));
  } catch (err) {
    next(err);
  }
});

// PUT /profile/saved/:productId — idempotent
profileRouter.put('/saved/:productId', authenticate, async (req, res, next) => {
  try {
    await profileService.saveProduct(req.user!.userId, req.params.productId as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// DELETE /profile/saved/:productId — idempotent
profileRouter.delete('/saved/:productId', authenticate, async (req, res, next) => {
  try {
    await profileService.unsaveProduct(req.user!.userId, req.params.productId as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
