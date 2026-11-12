/**
 * Shop card thumbnails.
 *
 * The API writes `<photo>.thumb.webp` (shortest side 600 px) next to every
 * listing photo it receives — `server/api/src/utils/product-thumbnail.ts`. The
 * card asks for it through `srcset`; a photo without one (pasted URL, upload
 * older than the thumbnails) falls back to the original in `onError`.
 */

const UPLOADED_PHOTO_RE = /\/uploads\/products\/[^?#]+\.(jpe?g|png|webp)$/i
const THUMB_RE = /\.thumb\.webp$/i

/** Width the thumbnail is declared at in `srcset` (its shortest side). */
export const PRODUCT_THUMB_WIDTH = 600
/** Nominal width of the original: the panel resizes uploads to at most 2560 px. */
const ORIGINAL_NOMINAL_WIDTH = 1600

/** Card width per breakpoint — mirrors the grid in ProductGrid (2 / 3 / 4 columns). */
export const PRODUCT_CARD_SIZES = '(min-width: 1024px) 300px, (min-width: 640px) 33vw, 50vw'

export function productThumbUrl(url: string | null | undefined): string | null {
  if (!url || THUMB_RE.test(url) || !UPLOADED_PHOTO_RE.test(url)) return null
  return url.replace(/\.(jpe?g|png|webp)$/i, '.thumb.webp')
}

/** `srcset` for a card photo, or undefined when the photo has no thumbnail. */
export function productCardSrcSet(url: string | null | undefined): string | undefined {
  const thumb = productThumbUrl(url)
  if (!thumb || !url) return undefined
  return `${thumb} ${PRODUCT_THUMB_WIDTH}w, ${url} ${ORIGINAL_NOMINAL_WIDTH}w`
}
