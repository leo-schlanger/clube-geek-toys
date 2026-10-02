import { suggestEmail } from '../lib/email-typo'

/**
 * "Você quis dizer …@gmail.com?" under an e-mail field. Renders nothing when
 * the domain looks right; never blocks the form.
 */
export function EmailSuggestion({
  email,
  onAccept,
}: {
  email: string
  onAccept: (fixed: string) => void
}) {
  const suggestion = suggestEmail(email)
  if (!suggestion) return null
  return (
    <p className="text-xs text-yellow-600 dark:text-yellow-400">
      Você quis dizer{' '}
      <button type="button" className="font-semibold underline" onClick={() => onAccept(suggestion)}>
        {suggestion}
      </button>
      ? A confirmação e os avisos vão para esse e-mail.
    </p>
  )
}
