/**
 * useKeyboardShortcuts - Hook para gerenciar atalhos de teclado
 *
 * @example
 * useKeyboardShortcuts({
 *   'ctrl+s': () => handleSave(),
 *   'escape': () => closeModal(),
 *   'ctrl+n': () => createNew(),
 * })
 */

import { useEffect, useCallback } from 'react'

type KeyHandler = (e: KeyboardEvent) => void

interface ShortcutMap {
  [key: string]: KeyHandler
}

/**
 * Normaliza a combinação de teclas para comparação
 * @param e - Evento de teclado
 * @returns String normalizada (ex: 'ctrl+shift+s')
 */
function getKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = []

  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')

  // Normaliza a tecla
  let key = e.key.toLowerCase()
  if (key === ' ') key = 'space'
  if (key === 'escape') key = 'esc'

  // Evita duplicar modificadores
  if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
    parts.push(key)
  }

  return parts.join('+')
}

/**
 * Hook para registrar atalhos de teclado
 * @param shortcuts - Mapa de atalhos para handlers
 * @param enabled - Se os atalhos estão habilitados (default: true)
 *
 * @example
 * useKeyboardShortcuts({
 *   'ctrl+s': (e) => {
 *     e.preventDefault()
 *     saveDocument()
 *   },
 *   'esc': () => closeModal(),
 * })
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutMap,
  enabled: boolean = true
): void {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignorar se estiver digitando em input/textarea
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Permitir apenas Escape em inputs
        if (e.key !== 'Escape') return
      }

      const combo = getKeyCombo(e)
      const handler = shortcuts[combo]

      if (handler) {
        handler(e)
      }
    },
    [shortcuts]
  )

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, enabled])
}

/**
 * Atalhos padrão do admin
 */
export const ADMIN_SHORTCUTS = {
  SAVE: 'ctrl+s',
  NEW: 'ctrl+n',
  SEARCH: 'ctrl+k',
  CLOSE: 'esc',
  REFRESH: 'ctrl+r',
} as const

/**
 * Formata atalho para exibição
 * @param shortcut - Atalho (ex: 'ctrl+s')
 * @returns String formatada para UI (ex: 'Ctrl+S')
 */
export function formatShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => {
      if (part === 'ctrl') return '⌘/Ctrl'
      if (part === 'alt') return 'Alt'
      if (part === 'shift') return 'Shift'
      if (part === 'esc') return 'Esc'
      return part.toUpperCase()
    })
    .join('+')
}
