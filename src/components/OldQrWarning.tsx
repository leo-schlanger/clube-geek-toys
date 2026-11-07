import { Smartphone } from 'lucide-react'
import type { CardTokenCheck } from '../lib/members'

/**
 * Warns that a membership QR was not opened on the member's phone just now
 * (old, printed or forged). A warning only: the status still comes from the
 * database. Renders nothing for a fresh QR or an API without the check.
 */
export function OldQrWarning({ token, className = '' }: { token?: CardTokenCheck | null; className?: string }) {
  if (token == null || token === 'valid') return null
  return (
    <div role="alert" className={`rounded-2xl border-2 border-warning bg-warning/15 p-4 text-left ${className}`}>
      <p className="flex items-center gap-2 font-heading text-lg font-extrabold">
        <Smartphone className="h-6 w-6 shrink-0" aria-hidden />
        QR antigo (possível print)
      </p>
      <p className="mt-1 text-sm">Peça para abrir a carteirinha no celular e mostrar o QR de novo.</p>
    </div>
  )
}

export default OldQrWarning
