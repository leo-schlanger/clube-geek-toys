import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { AlertTriangle } from 'lucide-react'

/**
 * useConfirm — promise-based confirmation dialog using the existing Radix Dialog.
 *
 * Replaces window.confirm() across the app:
 *   const confirm = useConfirm()
 *   const ok = await confirm({ title: '...', description: '...', variant: 'destructive' })
 *   if (!ok) return
 *
 * Features:
 *   - ESC and click-outside cancel
 *   - Focus trap (Radix)
 *   - Customizable button text and visual variant
 *   - Returns a promise that resolves to boolean
 */

export interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

interface ConfirmInternalState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmInternalState | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve })
    })
  }, [])

  const handleClose = (result: boolean) => {
    if (state) {
      state.resolve(result)
    }
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!state} onOpenChange={(open) => { if (!open) handleClose(false) }}>
        <DialogContent className="max-w-md">
          {state && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {state.variant === 'destructive' && (
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  )}
                  {state.title}
                </DialogTitle>
                {state.description && (
                  <DialogDescription className="pt-2">{state.description}</DialogDescription>
                )}
              </DialogHeader>
              <DialogFooter className="gap-2 pt-4">
                <Button variant="ghost" onClick={() => handleClose(false)}>
                  {state.cancelText ?? 'Cancelar'}
                </Button>
                <Button
                  variant={state.variant === 'destructive' ? 'destructive' : 'default'}
                  onClick={() => handleClose(true)}
                  autoFocus
                >
                  {state.confirmText ?? 'Confirmar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm deve ser usado dentro de ConfirmProvider')
  }
  return ctx
}
