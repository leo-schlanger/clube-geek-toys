/**
 * "Did you mean @gmail.com?"
 *
 * On 01/10/2026 a buyer checked out eight times as `…@gamil.com`. Nothing he
 * was sent could arrive — confirmation, tracking, the cancellation notice —
 * and a mistyped e-mail also counts against the card in the provider's
 * antifraud. A format check cannot see it, so the common providers are matched
 * by edit distance and the checkout offers the fix. It never blocks: a domain
 * we do not know is somebody's real company address.
 */

const KNOWN_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'yahoo.com',
  'yahoo.com.br',
  'bol.com.br',
  'uol.com.br',
  'terra.com.br',
  'msn.com',
]

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
      // Adjacent swap ("gamil" for "gmail") is one slip, not two.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1)
      }
    }
  }
  return dp[a.length][b.length]
}

/** The corrected address, or null when the domain looks right (or unknown). */
export function suggestEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at < 1 || at === trimmed.length - 1) return null
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (KNOWN_DOMAINS.includes(domain)) return null

  let best: string | null = null
  let bestDistance = Infinity
  for (const known of KNOWN_DOMAINS) {
    const d = distance(domain, known)
    if (d < bestDistance) {
      best = known
      bestDistance = d
    }
  }
  // Two edits covers "gamil.com", "gmail.con", "hotmial.com"; more than that
  // starts matching real domains that merely look alike.
  return best && bestDistance > 0 && bestDistance <= 2 ? `${local}@${best}` : null
}
