import { describe, it, expect, afterEach } from 'vitest';
import {
  isStaffNoticeAboutTestAccount,
  isTestAccountEmail,
  testAccountLikePatterns,
} from './test-accounts.js';

const saved = process.env.TEST_ACCOUNT_EMAILS;
afterEach(() => {
  if (saved === undefined) delete process.env.TEST_ACCOUNT_EMAILS;
  else process.env.TEST_ACCOUNT_EMAILS = saved;
});

describe('test accounts', () => {
  it('knows the qa accounts by default, case-insensitively', () => {
    delete process.env.TEST_ACCOUNT_EMAILS;
    expect(isTestAccountEmail('E2E-Member@geeketoys.com.br')).toBe(true);
    expect(isTestAccountEmail('e2e-admin@geeketoys.com.br')).toBe(true);
    expect(isTestAccountEmail('e2e-buyer@example.com')).toBe(true);
    expect(isTestAccountEmail('cliente@gmail.com')).toBe(false);
    expect(isTestAccountEmail(null)).toBe(false);
  });

  it('treats an empty variable as the default, and accepts @domain entries', () => {
    process.env.TEST_ACCOUNT_EMAILS = '';
    expect(isTestAccountEmail('e2e-member@geeketoys.com.br')).toBe(true);

    process.env.TEST_ACCOUNT_EMAILS = 'qa@loja.com, @teste.dev';
    expect(isTestAccountEmail('qa@loja.com')).toBe(true);
    expect(isTestAccountEmail('quem@teste.dev')).toBe(true);
    expect(isTestAccountEmail('e2e-member@geeketoys.com.br')).toBe(false);
    expect(isTestAccountEmail('x@naoteste.dev.br')).toBe(false);
  });

  it('builds escaped LIKE patterns for SQL', () => {
    process.env.TEST_ACCOUNT_EMAILS = 'a_b@x.com,@teste.dev';
    expect(testAccountLikePatterns()).toEqual(['a\\_b@x.com', '%@teste.dev']);
  });

  it('flags only staff templates about a test account', () => {
    delete process.env.TEST_ACCOUNT_EMAILS;
    const qa = { customer_email: 'e2e-member@geeketoys.com.br' };
    expect(isStaffNoticeAboutTestAccount('admin-order-cancelled', qa)).toBe(true);
    expect(isStaffNoticeAboutTestAccount('admin-new-member', { member_email: 'e2e-member@geeketoys.com.br' })).toBe(true);
    expect(isStaffNoticeAboutTestAccount('admin-event-reservation', { buyer_email: 'e2e-buyer@example.com' })).toBe(true);
    // The qa still gets its own copy.
    expect(isStaffNoticeAboutTestAccount('order-pending-pix', qa)).toBe(false);
    expect(isStaffNoticeAboutTestAccount('admin-order-cancelled', { customer_email: 'cliente@gmail.com' })).toBe(false);
    expect(isStaffNoticeAboutTestAccount('admin-daily-digest', {})).toBe(false);
  });
});
