import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Every staff payment notice names the customer, so the qa-account filter
 * (`isTestAccountEmail` in `notifyAdminsOfPayment`) can see it. A notice
 * without `customerEmail` reaches the staff even for a test account; when that
 * is the point, the line above says so.
 */
const DIR = path.dirname(new URL(import.meta.url).pathname);
const OPENERS = /(notifyAdminsOfPayment(?:Async)?\(|adminNotices\.push\()\{/g;
const ON_PURPOSE = 'No customerEmail on purpose';

function noticesIn(source: string): Array<{ line: number; body: string; before: string }> {
  const found = [];
  for (const m of source.matchAll(OPENERS)) {
    let depth = 0;
    let i = m.index! + m[0].length - 1;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) break;
    }
    const start = m.index!;
    found.push({
      line: source.slice(0, start).split('\n').length,
      body: source.slice(start, i),
      before: source.slice(Math.max(0, start - 200), start),
    });
  }
  return found;
}

describe('staff payment notices', () => {
  it('carry the customer e-mail, or say why not', () => {
    const missing: string[] = [];
    let total = 0;
    for (const file of fs.readdirSync(DIR)) {
      if (!file.endsWith('.ts') || file.includes('.test.')) continue;
      for (const notice of noticesIn(fs.readFileSync(path.join(DIR, file), 'utf8'))) {
        total++;
        if (!notice.body.includes('customerEmail') && !notice.before.includes(ON_PURPOSE)) {
          missing.push(`${file}:${notice.line}`);
        }
      }
    }
    expect(total).toBeGreaterThan(15);
    expect(missing).toEqual([]);
  });
});
