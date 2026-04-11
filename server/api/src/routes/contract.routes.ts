import { Router } from 'express';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';
import { verifyMemberOwnership } from '../middleware/ownership.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as contractService from '../services/contract.service.js';
import { query } from '../config/database.js';

export const contractRouter = Router();
contractRouter.use(authenticate);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const memberId = req.body.memberId || req.params.memberId || 'unknown';
    const dir = path.join('/app/uploads/contracts', memberId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => {
    const timestamp = Date.now();
    cb(null, `contract_${timestamp}.pdf`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos'));
    }
  },
});

// POST /contracts — upload contract PDF
contractRouter.post('/', upload.single('pdf'), async (req, res, next) => {
  try {
    const memberId = req.body.memberId;
    if (memberId && !await verifyMemberOwnership(req, res, memberId)) return;

    // Magic-bytes validation: a real PDF starts with "%PDF" (0x25 0x50 0x44 0x46).
    // multer's MIME-type filter can be spoofed by the client; this is the actual content check.
    if (req.file?.path) {
      try {
        const fd = fs.openSync(req.file.path, 'r');
        const header = Buffer.alloc(4);
        fs.readSync(fd, header, 0, 4, 0);
        fs.closeSync(fd);
        const isPdf = header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;
        if (!isPdf) {
          // Cleanup the bogus file before rejecting.
          try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
          res.status(400).json({ error: 'Arquivo enviado não é um PDF válido.', code: 'INVALID_PDF' });
          return;
        }
      } catch (err) {
        console.error('[CONTRACT] Failed to validate PDF magic bytes:', err);
        res.status(400).json({ error: 'Não foi possível validar o arquivo enviado.', code: 'PDF_VALIDATION_FAILED' });
        return;
      }
    }

    const serverIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    req.body.ipAddress = serverIp;
    const result = await contractService.saveContract(req.body, req.file);
    res.status(201).json(result);
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
