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
 * Perfil da conta — disponível para qualquer usuário logado, assine o clube ou
 * não. Todas as rotas exigem `authenticate` e agem sobre o **próprio** usuário
 * (`req.user.userId`); não há parâmetro de id, então não há como ler o perfil
 * de outra pessoa.
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
  // Nascimento é só data, sem hora: evita fuso mudar o dia de aniversário.
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

// GET /profile — perfil da própria conta
profileRouter.get('/', authenticate, async (req, res, next) => {
  try {
    res.json(await profileService.getProfile(req.user!.userId));
  } catch (err) {
    next(err);
  }
});

// PATCH /profile — grava só os campos enviados
profileRouter.patch('/', authenticate, validate(updateSchema), async (req, res, next) => {
  try {
    res.json(await profileService.upsertProfile(req.user!.userId, req.body));
  } catch (err) {
    next(err);
  }
});

// ─── Foto de perfil (opcional) ───────────────────────────────────────────────

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
  // Nome aleatório: o id do usuário no caminho vazaria quem é o dono da foto
  // para qualquer um que visse a URL.
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.bin`),
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: PHOTO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    // MIME de celular mente; os bytes são conferidos depois do upload.
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

// POST /profile/photo — sobe a foto de perfil
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

      // Renomeia com a extensão real só depois de confirmar os bytes.
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

// DELETE /profile/photo — remove a foto (o campo é opcional)
profileRouter.delete('/photo', authenticate, async (req, res, next) => {
  try {
    res.json(await profileService.setProfilePhoto(req.user!.userId, null));
  } catch (err) {
    next(err);
  }
});

// ─── Produtos salvos ─────────────────────────────────────────────────────────

// GET /profile/saved — lista completa, com preço e estoque atuais
profileRouter.get('/saved', authenticate, async (req, res, next) => {
  try {
    res.json(await profileService.listSavedProducts(req.user!.userId));
  } catch (err) {
    next(err);
  }
});

// GET /profile/saved/ids — só os ids, para o catálogo pintar o coração
profileRouter.get('/saved/ids', authenticate, async (req, res, next) => {
  try {
    res.json(await profileService.listSavedProductIds(req.user!.userId));
  } catch (err) {
    next(err);
  }
});

// PUT /profile/saved/:productId — salvar (idempotente)
profileRouter.put('/saved/:productId', authenticate, async (req, res, next) => {
  try {
    await profileService.saveProduct(req.user!.userId, req.params.productId as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// DELETE /profile/saved/:productId — remover (idempotente)
profileRouter.delete('/saved/:productId', authenticate, async (req, res, next) => {
  try {
    await profileService.unsaveProduct(req.user!.userId, req.params.productId as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
