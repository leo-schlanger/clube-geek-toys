import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
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
    const result = await contractService.saveContract(req.body, req.file);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Helper: verify the authenticated user owns the member or is admin/seller
async function verifyMemberOwnership(req: import('express').Request, res: import('express').Response, memberId: string) {
  if (req.user!.role !== 'admin' && req.user!.role !== 'seller') {
    const memberCheck = await query('SELECT user_id FROM members WHERE id = $1', [memberId]);
    if (memberCheck.rows.length === 0 || memberCheck.rows[0].user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Acesso negado' });
      return false;
    }
  }
  return true;
}

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
