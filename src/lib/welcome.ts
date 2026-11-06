/**
 * The member's welcome on /membro: shown once per member and browser, and only
 * while the membership is new, so an old member on a new phone is not greeted
 * as if they had just joined.
 */
export const WELCOME_SEEN_KEY = 'clube_geek_welcome_seen'
export const WELCOME_WINDOW_DAYS = 7

export function welcomeStorageKey(memberId: string): string {
  return `${WELCOME_SEEN_KEY}_${memberId}`
}

export function isWelcomePending(
  member: { id: string; activatedAt?: string | null; startDate?: string | null },
  now: Date = new Date()
): boolean {
  try {
    if (localStorage.getItem(welcomeStorageKey(member.id))) return false
  } catch {
    // Storage blocked (private mode): fall through to the date check.
  }
  const since = member.activatedAt || member.startDate
  if (!since) return false
  const at = new Date(since).getTime()
  if (Number.isNaN(at)) return false
  return now.getTime() - at < WELCOME_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

export function markWelcomeSeen(memberId: string): void {
  try {
    localStorage.setItem(welcomeStorageKey(memberId), '1')
  } catch {
    // Nothing to do: the date window still ends the welcome.
  }
}
