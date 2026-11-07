import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TODAY_RIO_SQL, formatDateBR, isExpiryCurrent, rioToday, toDateOnly } from './club-date.js';
import { addClubPeriod, nextClubExpiry } from '../types/index.js';

// Rio is UTC-3: 21:00 in Rio is already the next day in UTC.
const rio = (local: string) => new Date(`${local}-03:00`);

describe('club civil dates', () => {
  it("today is Rio's, on both sides of Rio's midnight", () => {
    expect(rioToday(rio('2026-11-07T20:59:59'))).toBe('2026-11-07');
    expect(rioToday(rio('2026-11-07T21:00:00'))).toBe('2026-11-07');
    expect(rioToday(rio('2026-11-07T23:59:59'))).toBe('2026-11-07');
    expect(rioToday(rio('2026-11-08T00:00:00'))).toBe('2026-11-08');
  });

  it('the expiry day is valid until 23:59:59 in Rio, and not a second after', () => {
    for (const t of ['2026-11-07T00:00:00', '2026-11-07T21:00:00', '2026-11-07T22:30:00', '2026-11-07T23:59:59']) {
      expect(isExpiryCurrent('2026-11-07', rio(t))).toBe(true);
    }
    expect(isExpiryCurrent('2026-11-07', rio('2026-11-08T00:00:00'))).toBe(false);
    expect(isExpiryCurrent('2026-11-06', rio('2026-11-07T00:00:00'))).toBe(false);
    expect(isExpiryCurrent(null)).toBe(false);
    expect(isExpiryCurrent('nonsense')).toBe(false);
  });

  it('reads the old ISO shape and a Date at UTC midnight as the same civil date', () => {
    expect(toDateOnly('2027-11-07T00:00:00.000Z')).toBe('2027-11-07');
    expect(toDateOnly(new Date('2027-11-07T00:00:00.000Z'))).toBe('2027-11-07');
    expect(formatDateBR('2027-11-07')).toBe('07/11/2027');
    expect(formatDateBR('2027-08-16T00:00:00.000Z')).toBe('16/08/2027');
    expect(formatDateBR(null)).toBe('');
  });

  it('a payment late at night in Rio starts and ends on Rio dates', () => {
    const today = rioToday(rio('2026-11-07T22:00:00'));
    expect(nextClubExpiry({ status: 'pending', currentExpiry: null, today })).toBe('2027-11-07');
    // Renewing on the last day keeps it: the new year starts after the old one.
    expect(nextClubExpiry({ status: 'active', currentExpiry: '2026-11-07', today })).toBe('2027-11-07');
    expect(nextClubExpiry({ status: 'active', currentExpiry: '2027-03-01', today })).toBe('2028-03-01');
    // Lapsed: from today.
    expect(nextClubExpiry({ status: 'active', currentExpiry: '2026-11-06', today })).toBe('2027-11-07');
    expect(nextClubExpiry({ status: 'expired', currentExpiry: '2027-03-01', today })).toBe('2027-11-07');
    expect(addClubPeriod('2028-02-29')).toBe('2029-03-01');
  });

  // CURRENT_DATE is UTC: from 21:00 in Rio it is already tomorrow.
  it('no service compares a member date with CURRENT_DATE', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../services');
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .flatMap((f) =>
        readFileSync(join(dir, f), 'utf8')
          .split('\n')
          .filter((line) => /(expiry_date|start_date)/.test(line) && /CURRENT_DATE/.test(line) && !line.trim().startsWith('//'))
          .map((line) => `${f}: ${line.trim()}`)
      );
    expect(offenders).toEqual([]);
    expect(TODAY_RIO_SQL).toBe("(NOW() AT TIME ZONE 'America/Sao_Paulo')::date");
  });
});
