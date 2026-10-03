import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Settings editable in the admin (Configurações). What these pin:
 *
 *  1. A key missing from the table reads as its catalogue default.
 *  2. Reads are cached for a minute, and a write drops that key's cache — an
 *     admin who switches off the promotion sees it off on the next read.
 *  3. A batch is validated in full before anything is written: one bad value
 *     (wrong type, unknown key) leaves every setting untouched.
 */

const { queryMock, auditMock } = vi.hoisted(() => ({ queryMock: vi.fn(), auditMock: vi.fn(async () => {}) }));
vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('../config/env.js', () => ({ env: {} }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));

import {
  SETTINGS_CATALOGUE,
  clearSettingsCache,
  getAllSettings,
  getSetting,
  getSettingsCatalogue,
  updateSettings,
} from './settings.service.js';

let stored: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  clearSettingsCache();
  stored = {};
  queryMock.mockImplementation(async (text: string, params: unknown[] = []) => {
    if (text.startsWith('SELECT value FROM config')) {
      const key = params[0] as string;
      return { rows: key in stored ? [{ value: stored[key] }] : [] };
    }
    if (text.startsWith('SELECT key, value FROM config')) {
      return { rows: Object.entries(stored).map(([key, value]) => ({ key, value })) };
    }
    if (text.includes('INSERT INTO config')) {
      stored[params[0] as string] = JSON.parse(params[1] as string);
      return { rows: [] };
    }
    return { rows: [] };
  });
});

describe('reading', () => {
  it('falls back to the catalogue default and caches the read', async () => {
    expect(await getSetting('shop.online_discount_percent')).toBe(5);
    stored['shop.online_discount_percent'] = 8;
    // Still cached for a minute.
    expect(await getSetting('shop.online_discount_percent')).toBe(5);
    expect(queryMock).toHaveBeenCalledTimes(1);
    clearSettingsCache();
    expect(await getSetting('shop.online_discount_percent')).toBe(8);
  });

  it('refuses a key that is not in the catalogue', async () => {
    await expect(getSetting('plan.club.discount_products')).rejects.toThrow('Unknown setting key');
  });

  it('returns every catalogue key, stored or default', async () => {
    stored['wholesale.sales_open'] = true;
    const all = await getAllSettings();
    expect(Object.keys(all).sort()).toEqual(SETTINGS_CATALOGUE.map((d) => d.key).sort());
    expect(all['wholesale.sales_open']).toBe(true);
    expect(all['review_reward_amount']).toBe(1);
    expect(getSettingsCatalogue()).toBe(SETTINGS_CATALOGUE);
  });
});

describe('writing', () => {
  it('upserts, drops the cache and audits the before and after', async () => {
    expect(await getSetting('shop.online_discount_enabled')).toBe(true); // cached
    const after = await updateSettings({ 'shop.online_discount_enabled': false }, 'admin-1');
    expect(after['shop.online_discount_enabled']).toBe(false);
    expect(await getSetting('shop.online_discount_enabled')).toBe(false);
    expect(auditMock).toHaveBeenCalledWith('settings.updated', 'admin-1', {
      before: { 'shop.online_discount_enabled': true },
      after: { 'shop.online_discount_enabled': false },
    });
  });

  it('writes nothing when any value in the batch is wrong', async () => {
    await expect(
      updateSettings({ 'shop.online_discount_percent': 10, 'wholesale.sales_open': 'yes' }, 'admin-1')
    ).rejects.toThrow('expected boolean');
    await expect(updateSettings({ 'no.such.key': 1 }, 'admin-1')).rejects.toThrow('Unknown setting key');
    await expect(updateSettings({ 'notifications.admin_payment_min_amount': Number.NaN }, 'admin-1')).rejects.toThrow('expected number');
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO config'), expect.anything());
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('accepts each declared type', async () => {
    await updateSettings(
      { 'shop.online_discount_banner_text': 'Oi', 'notifications.admin_payment_min_amount': 50 },
      'admin-1'
    );
    expect(stored).toMatchObject({ 'shop.online_discount_banner_text': 'Oi', 'notifications.admin_payment_min_amount': 50 });
  });
});
