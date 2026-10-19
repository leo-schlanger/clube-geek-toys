import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { verifyMemberOwnership } from '../middleware/ownership.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import * as contractService from '../services/contract.service.js';
import { query } from '../config/database.js';
import { uploadDir } from '../utils/upload-path.js';
import { AppError } from '../middleware/error-handler.js';
import { moduleLogger } from '../config/logger.js';
import { contractUploadLimiter } from '../middleware/rate-limit.js';

const log = moduleLogger('contract-routes');

const contractBodySchema = z.object({
  memberId: z.string().uuid(),
  memberName: z.string().min(1).max(200),
  memberCpf: z.string().length(11),
  memberEmail: z.string().email(),
  plan: z.enum(['club']).default('club'),
  signedAt: z.string().min(1),
  signaturePreview: z.string().optional(),
});

export const contractRouter = Router();
contractRouter.use(authenticate);

/** The directory name is a member UUID and nothing else. */
const MEMBER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where signed contracts live. nginx refuses this folder; see GET /:contractId/pdf. */
export const CONTRACTS_ROOT = '/app/uploads/contracts';

// Memory, not disk: nothing touches the volume until the caller is known to own
// the member and the bytes are known to be a PDF. With disk storage the file was
// written before both checks, and a 400 or 403 left it behind.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      // AppError, not Error: a wrong file type is the client's mistake (400),
      // and a plain Error reached the handler as a 500.
      cb(new AppError(400, 'Apenas arquivos PDF são permitidos', 'INVALID_FILE_TYPE'));
    }
  },
});

const isPdf = (buf: Buffer) =>
  buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;

// POST /contracts — upload contract PDF
contractRouter.post('/', contractUploadLimiter, upload.single('pdf'), async (req, res, next) => {
  let written: string | null = null;
  let saved = false;
  try {
    const parsed = contractBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const memberId = parsed.data.memberId;
    const dir = MEMBER_ID_RE.test(memberId) ? uploadDir(CONTRACTS_ROOT, memberId) : null;
    if (!dir) {
      res.status(400).json({ error: 'memberId inválido.', code: 'INVALID_MEMBER_ID' });
      return;
    }
    if (!await verifyMemberOwnership(req, res, memberId)) return;

    // Magic bytes: multer's MIME filter trusts what the client says.
    if (req.file && !isPdf(req.file.buffer)) {
      res.status(400).json({ error: 'Arquivo enviado não é um PDF válido.', code: 'INVALID_PDF' });
      return;
    }

    let file: Express.Multer.File | undefined;
    if (req.file) {
      const filename = `contract_${Date.now()}.pdf`;
      await fs.promises.mkdir(dir, { recursive: true });
      written = path.join(dir, filename);
      await fs.promises.writeFile(written, req.file.buffer, { flag: 'wx' });
      file = { ...req.file, destination: dir, filename, path: written };
    }

    req.body.ipAddress = req.ip || 'unknown';
    const result = await contractService.saveContract(req.body, file);
    saved = true;
    res.status(201).json(result);
  } catch (err) {
    next(err);
  } finally {
    if (written && !saved) {
      await fs.promises.unlink(written).catch((err) => log.warn({ err }, 'orphan contract not removed'));
    }
  }
});

/**
 * The stored file of a contract, only if it sits in that member's own folder.
 * Rows from before 2026-10-19 may carry only the public `pdf_url`.
 */
function contractFilePath(row: { member_id: string; pdf_path?: string | null; pdf_url?: string | null }): string | null {
  const dir = uploadDir(CONTRACTS_ROOT, row.member_id);
  if (!dir) return null;
  let candidate = row.pdf_path || null;
  if (!candidate && row.pdf_url) {
    const m = /\/uploads\/contracts\/[^/]+\/(contract_[\w.-]+\.pdf)$/.exec(row.pdf_url);
    if (m) candidate = path.join(dir, m[1]);
  }
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  return resolved.startsWith(path.resolve(dir) + path.sep) ? resolved : null;
}

// GET /contracts/:contractId/pdf — the signed PDF, to its member or staff
contractRouter.get('/:contractId/pdf', async (req, res, next) => {
  try {
    const result = await query<{ id: string; member_id: string; pdf_path: string | null; pdf_url: string | null }>(
      'SELECT id, member_id, pdf_path, pdf_url FROM contracts WHERE id = $1',
      [req.params.contractId]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Contrato não encontrado', code: 'CONTRACT_NOT_FOUND' });
      return;
    }
    if (!await verifyMemberOwnership(req, res, row.member_id)) return;

    const filePath = contractFilePath(row);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'PDF do contrato não encontrado', code: 'CONTRACT_PDF_NOT_FOUND' });
      return;
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="contrato.pdf"');
    fs.createReadStream(filePath).on('error', next).pipe(res);
  } catch (err) {
    next(err);
  }
});

// GET /contracts/:memberId — active contract
contractRouter.get('/:memberId', async (req, res, next) => {
  try {
    if (!await verifyMemberOwnership(req, res, req.params.memberId)) return;
    const contract = await contractService.getActiveContract(req.params.memberId);
    if (!contract) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    res.json(contract);
  } catch (err) {
    next(err);
  }
});

// GET /contracts/:memberId/history — all contracts
contractRouter.get('/:memberId/history', async (req, res, next) => {
  try {
    if (!await verifyMemberOwnership(req, res, req.params.memberId)) return;
    const contracts = await contractService.getContractHistory(req.params.memberId);
    res.json(contracts);
  } catch (err) {
    next(err);
  }
});

// GET /contracts/:contractId/verify — verify contract integrity (member must own, or admin)
contractRouter.get('/:contractId/verify', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM contracts WHERE id = $1',
      [req.params.contractId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contrato não encontrado', code: 'CONTRACT_NOT_FOUND' });
      return;
    }
    const contract = result.rows[0];

    // Ownership check — member can only verify their own contract; admin/seller pass-through
    if (!await verifyMemberOwnership(req, res, contract.member_id)) return;


    // Recalculate SHA-256 hash from stored fields
    const dataString = [
      contract.member_id,
      contract.member_name,
      contract.member_cpf,
      contract.member_email,
      contract.plan,
      contract.signed_at instanceof Date ? contract.signed_at.toISOString() : contract.signed_at,
      contract.ip_address,
    ].join('|');
    const calculatedHash = crypto.createHash('sha256').update(dataString).digest('hex');
    const storedHash = contract.document_hash || '';

    // Check if PDF file exists
    let pdfExists = false;
    if (contract.pdf_path) {
      try {
        fs.accessSync(contract.pdf_path, fs.constants.F_OK);
        pdfExists = true;
      } catch {
        pdfExists = false;
      }
    }

    res.json({
      valid: calculatedHash === storedHash && (!contract.pdf_path || pdfExists),
      dataHash: {
        matches: calculatedHash === storedHash,
        calculated: calculatedHash,
        stored: storedHash,
      },
      pdfExists,
    });
  } catch (err) {
    next(err);
  }
});

// POST /contracts/:contractId/revoke — revoke active contract
contractRouter.post('/:contractId/revoke', async (req, res, next) => {
  try {
    const { memberId, reason } = req.body;
    if (!memberId) {
      res.status(400).json({ error: 'memberId é obrigatório' });
      return;
    }
    if (!await verifyMemberOwnership(req, res, memberId)) return;
    const result = await contractService.revokeContract(req.params.contractId, memberId, reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
