import { useCallback, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, QrCode, ScanLine, XCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { QRScanner } from './QRScanner'
import { logger } from '../lib/logger'
import { TICKET_KIND_LABEL } from '../data/event'
import { checkInTicket, extractTicketCode, type CheckInResponse } from '../lib/event-tickets'

interface TicketCheckInProps {
  /** Called after every answered scan, so the caller can refresh its counters. */
  onChecked?: (result: CheckInResponse) => void
  /** Extra content under the description (event name, counters). */
  children?: ReactNode
}

/** Door check-in: shared by the admin Ingressos tab and the PDV. */
export function TicketCheckIn({ onChecked, children }: TicketCheckInProps) {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [lastCheckIn, setLastCheckIn] = useState<CheckInResponse | null>(null)

  const runCheckIn = useCallback(
    async (rawCode: string) => {
      const code = extractTicketCode(rawCode)
      if (!code) return
      setChecking(true)
      try {
        const result = await checkInTicket(code)
        setLastCheckIn(result)
        if (result.ok) toast.success(`Entrada liberada — ${result.ticket.attendeeName}`)
        else toast.error(result.message)
        onChecked?.(result)
      } catch (error) {
        logger.error('Error checking in ticket:', error)
        toast.error('Erro ao validar o ingresso')
      } finally {
        setChecking(false)
      }
    },
    [onChecked]
  )

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          Portaria — check-in
        </CardTitle>
        <CardDescription>
          Leia o QR do ingresso ou digite o código. Cada código vale{' '}
          <strong>uma única entrada</strong>: na segunda leitura ele aparece como já utilizado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}

        {scannerOpen ? (
          <QRScanner
            onScan={(data) => {
              setScannerOpen(false)
              void runCheckIn(data)
            }}
            onClose={() => setScannerOpen(false)}
          />
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="gap-2" onClick={() => setScannerOpen(true)}>
              <QrCode className="h-4 w-4" />
              Abrir leitor de QR
            </Button>
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void runCheckIn(manualCode)
                setManualCode('')
              }}
            >
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="T-XXXX-XXXX-XXXX"
                aria-label="Código do ingresso"
                className="font-mono uppercase"
              />
              <Button type="submit" variant="outline" disabled={checking || !manualCode.trim()}>
                Validar
              </Button>
            </form>
          </div>
        )}

        {lastCheckIn && (
          <div
            role="status"
            className={`rounded-xl border-2 p-4 ${
              lastCheckIn.ok
                ? 'border-green-500 bg-green-500/10'
                : 'border-destructive bg-destructive/10'
            }`}
          >
            <div className="flex items-start gap-3">
              {lastCheckIn.ok ? (
                <CheckCircle2 className="h-8 w-8 shrink-0 text-green-500" />
              ) : (
                <XCircle className="h-8 w-8 shrink-0 text-destructive" />
              )}
              <div>
                <p
                  className={`font-heading text-lg font-bold ${
                    lastCheckIn.ok ? 'text-green-500' : 'text-destructive'
                  }`}
                >
                  {lastCheckIn.ok ? 'ENTRADA LIBERADA' : 'ENTRADA NEGADA'}
                </p>
                <p className="text-sm font-semibold">
                  {lastCheckIn.ok
                    ? lastCheckIn.ticket.attendeeName
                    : (lastCheckIn.ticket?.attendeeName ?? '—')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {lastCheckIn.ok
                    ? [
                        lastCheckIn.eventTitle,
                        TICKET_KIND_LABEL[lastCheckIn.ticket.kind],
                        `reserva de ${lastCheckIn.buyerName}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : lastCheckIn.message}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default TicketCheckIn
