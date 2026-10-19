import { describe, it, expect, vi, beforeEach } from 'vitest';

const { claimMock, releaseMock } = vi.hoisted(() => ({
  claimMock: vi.fn(async (..._args: unknown[]) => true),
  releaseMock: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('./cooldown.js', () => ({ claimCooldown: claimMock, releaseCooldown: releaseMock }));
vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);

import { claimClubCardAttempt } from './club-card-lock.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('claimClubCardAttempt', () => {
  it('claims per member for two minutes and hands back the release', async () => {
    const release = await claimClubCardAttempt('m1');

    expect(claimMock).toHaveBeenCalledWith('club_card_m1', 2);
    await release();
    expect(releaseMock).toHaveBeenCalledWith('club_card_m1');
  });

  it('refuses a second attempt while the first holds the claim', async () => {
    claimMock.mockResolvedValueOnce(false);

    await expect(claimClubCardAttempt('m1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'PAYMENT_IN_FLIGHT',
    });
  });

  it('a release that fails does not throw into the payment path', async () => {
    releaseMock.mockRejectedValueOnce(new Error('db down'));
    const release = await claimClubCardAttempt('m1');

    await expect(release()).resolves.toBeUndefined();
  });
});
