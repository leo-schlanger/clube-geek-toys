import { AppError } from '../middleware/error-handler.js';
import { moduleLogger } from '../config/logger.js';
import { claimCooldown, releaseCooldown } from './cooldown.js';

const log = moduleLogger('club-card-lock');

/** Covers the slowest card round-trip, and expires on its own if a process dies. */
const CLUB_CARD_LOCK_MINUTES = 2;

/**
 * One club card attempt per member at a time.
 *
 * Every club card request mints its own payment id, so the idempotency key
 * never matches a second click: two tabs, or "voltar" and submit again, were
 * two charges of the plan — and two years, since each paid charge extends the
 * expiry. The shop has the same guard on the order
 * (`orders.card_payment_started_at`); the club has no order row, so the claim
 * lives in `config`, keyed by member.
 *
 * Returns the release, for the paths where nothing was charged (a refused card
 * must be retryable at once). An authorised charge keeps the claim until it
 * expires.
 */
export async function claimClubCardAttempt(memberId: string): Promise<() => Promise<void>> {
  const key = `club_card_${memberId}`;
  if (!(await claimCooldown(key, CLUB_CARD_LOCK_MINUTES))) {
    throw new AppError(
      409,
      'Já existe um pagamento com cartão em andamento para este cadastro. Aguarde alguns segundos.',
      'PAYMENT_IN_FLIGHT',
    );
  }
  return () =>
    releaseCooldown(key).catch((err: unknown) => log.error({ err }, 'club card lock release failed'));
}
