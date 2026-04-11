import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as settingsService from '../services/settings.service.js';

export const settingsRouter = Router();

// All settings endpoints require admin
settingsRouter.use(authenticate, requireRole('admin'));

// GET /settings — list all settings (defaults + overrides) and the catalogue metadata
settingsRouter.get('/', async (_req, res, next) => {
  try {
    const [values, catalogue] = await Promise.all([
      settingsService.getAllSettings(),
      Promise.resolve(settingsService.getSettingsCatalogue()),
    ]);
    res.json({ values, catalogue });
  } catch (err) {
    next(err);
  }
});

// PATCH /settings — bulk update
const updateSchema = z.object({
  updates: z.record(z.string(), z.unknown()),
});

settingsRouter.patch('/', validate(updateSchema), async (req, res, next) => {
  try {
    const updates = (req.body as { updates: Record<string, unknown> }).updates;
    const result = await settingsService.updateSettings(updates, req.user!.userId);
    res.json({ values: result });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unknown setting key')) {
      res.status(400).json({ error: err.message, code: 'UNKNOWN_SETTING_KEY' });
      return;
    }
    if (err instanceof Error && err.message.startsWith('Invalid value type')) {
      res.status(400).json({ error: err.message, code: 'INVALID_SETTING_VALUE' });
      return;
    }
    next(err);
  }
});
