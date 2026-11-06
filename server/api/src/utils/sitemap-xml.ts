/**
 * The shop's dynamic sitemap (`/sitemap-products.xml`): home, event, the
 * category pages that list something, and every active product with its
 * photos (Google image sitemap extension).
 */

export interface SitemapProduct {
  slug: string;
  updatedAt: Date | string | null;
  /** Product photos first, then the active variants' own photos. */
  images: string[];
}

export interface SitemapCategory {
  slug: string;
  /** Newest of the category row and the products it lists. */
  updatedAt: Date | string | null;
}

/** Google reads at most 1,000 images per URL. */
const MAX_IMAGES_PER_URL = 1000;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function day(value: Date | string | null): string {
  const date = value ? new Date(value) : new Date();
  return (Number.isNaN(date.getTime()) ? new Date() : date).toISOString().slice(0, 10);
}

function absolute(src: string, base: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return `${base}${src.startsWith('/') ? '' : '/'}${src}`;
}

/** Flattens and dedupes photo lists; drops anything that is not a string. */
export function collectImages(...lists: unknown[]): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === 'string' && value.trim() && !out.includes(value.trim())) {
      out.push(value.trim());
    }
  };
  lists.forEach(walk);
  return out;
}

export function renderProductSitemapXml(
  shopBaseUrl: string,
  products: SitemapProduct[],
  categories: SitemapCategory[]
): string {
  const base = shopBaseUrl.replace(/\/$/, '');

  const categoryUrls = categories.map(
    (c) => `  <url>
    <loc>${escapeXml(`${base}/categoria/${c.slug}`)}</loc>
    <lastmod>${day(c.updatedAt)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`
  );

  const productUrls = products.map((p) => {
    const images = p.images
      .slice(0, MAX_IMAGES_PER_URL)
      .map(
        (src) => `
    <image:image>
      <image:loc>${escapeXml(absolute(src, base))}</image:loc>
    </image:image>`
      )
      .join('');
    return `  <url>
    <loc>${escapeXml(`${base}/produto/${p.slug}`)}</loc>
    <lastmod>${day(p.updatedAt)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${images}
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${escapeXml(`${base}/`)}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${escapeXml(`${base}/evento`)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
${[...categoryUrls, ...productUrls].join('\n')}
</urlset>
`;
}
