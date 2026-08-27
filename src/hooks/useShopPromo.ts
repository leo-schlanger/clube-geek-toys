import { useQuery } from '@tanstack/react-query'
import { getShopPromo, PROMO_OFF, type ShopPromo } from '../lib/promo'

/** Shared cache key — banner, cart, drawer and checkout all read the same answer. */
export const SHOP_PROMO_QUERY_KEY = ['shop', 'promo'] as const

/**
 * The online-channel promotion.
 *
 * `placeholderData` is "no promotion" rather than the eventual answer: showing
 * a discount that turns out not to exist would be a price the shop does not
 * honour, while showing none for a moment only understates it. The server
 * prices the order either way.
 */
export function useShopPromo(): { promo: ShopPromo; loading: boolean } {
  const { data, isLoading } = useQuery<ShopPromo>({
    queryKey: SHOP_PROMO_QUERY_KEY,
    queryFn: getShopPromo,
    placeholderData: PROMO_OFF,
    staleTime: 1000 * 60 * 5,
  })

  return { promo: data ?? PROMO_OFF, loading: isLoading }
}
