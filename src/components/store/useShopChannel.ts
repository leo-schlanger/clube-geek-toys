import { useLocation } from 'react-router-dom'
import type { ShopChannel } from '../../types'

/** Detects retail vs wholesale from the current shop path. */
export function useShopChannel(): ShopChannel {
  const { pathname } = useLocation()
  return pathname.startsWith('/atacado') ? 'wholesale' : 'retail'
}

export function isWholesalePath(pathname: string): boolean {
  return pathname.startsWith('/atacado')
}
