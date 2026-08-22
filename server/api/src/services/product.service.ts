import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import type {
  Product,
  Category,
  ProductVariant,
  VariantAxis,
  ProductVideo,
} from '../types/index.js';

// ─── Image caps ──────────────────────────────────────────────────────────────

/**
 * Listing gallery cap. Has to be generous because the product PATCH resends the
 * whole array: a low cap blocks saving products that already exceed it, which
 * was the "can't save after uploading photos" bug. Uploads honour the same cap
 * (see addProductImages) so a product can never reach a state it cannot save.
 */
export const MAX_PRODUCT_IMAGES = 30;
/** Photos per variant; each SKU has its own gallery. */
export const MAX_VARIANT_IMAGES = 10;
/** Images per upload request (multer). */
export const MAX_IMAGE_UPLOAD_BATCH = 20;
/** The first is primary and is mirrored into products.category_id. */
export const MAX_PRODUCT_CATEGORIES = 5;
/** Videos per product (external link or hosted MP4). */
export const MAX_PRODUCT_VIDEOS = 5;
/** Hosted MP4 ceiling; above this, a YouTube link is the right answer. */
export const PRODUCT_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

// ─── Row mappers ─────────────────────────────────────────────────────────────

function mapVariant(row: pg.QueryResultRow): ProductVariant {
  const opts =
    row.options && typeof row.options === 'object' && !Array.isArray(row.options)
      ? (row.options as Record<string, string>)
      : {};
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    options: opts,
    sku: row.sku ?? null,
    price: parseFloat(row.price),
    compareAtPrice: row.compare_at_price != null ? parseFloat(row.compare_at_price) : null,
    costPrice: row.cost_price != null ? parseFloat(row.cost_price) : null,
    stock: Number(row.stock) || 0,
    reserved: Number(row.reserved) || 0,
    available: Math.max(0, (Number(row.stock) || 0) - (Number(row.reserved) || 0)),
    images: Array.isArray(row.images) ? row.images : [],
    active: row.active !== false,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Legacy JSONB or garbage degrades to an empty list. */
function parseVideos(raw: unknown): ProductVideo[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => {
      const item = v as { kind?: string; url?: string; title?: string };
      const url = String(item?.url || '').trim();
      const kind = item?.kind === 'youtube' || item?.kind === 'instagram' ? item.kind : 'file';
      const title = item?.title ? String(item.title).slice(0, 200) : undefined;
      return url ? ({ kind, url, ...(title ? { title } : {}) } as ProductVideo) : null;
    })
    .filter((v): v is ProductVideo => v !== null)
    .slice(0, MAX_PRODUCT_VIDEOS);
}

function parseAxes(raw: unknown): VariantAxis[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      const name = String((a as { name?: string })?.name || '').trim();
      const options = Array.isArray((a as { options?: unknown })?.options)
        ? ((a as { options: unknown[] }).options as unknown[])
            .map((o) => String(o).trim())
            .filter(Boolean)
        : [];
      return { name, options };
    })
    .filter((a) => a.name && a.options.length > 0);
}

function mapProduct(row: pg.QueryResultRow): Product {
  const hasVariants = row.has_variants === true;
  const price = parseFloat(row.price);
  const stock = Number(row.stock) || 0;
  // Aggregates from LEFT JOIN subquery (list) or filled later
  const priceFrom =
    row.price_from != null ? parseFloat(row.price_from) : hasVariants ? price : null;
  const stockTotal =
    row.stock_total != null ? Number(row.stock_total) : hasVariants ? stock : null;
  const reserved = Number(row.reserved) || 0;
  const reservedTotal =
    row.reserved_total != null ? Number(row.reserved_total) : hasVariants ? reserved : null;
  const effectiveStock = hasVariants && stockTotal != null ? stockTotal : stock;
  const effectiveReserved = hasVariants && reservedTotal != null ? reservedTotal : reserved;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: hasVariants && priceFrom != null ? priceFrom : price,
    compareAtPrice: row.compare_at_price != null ? parseFloat(row.compare_at_price) : null,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
    // From the product_categories LATERAL; falls back to the primary when the
    // query does not join it.
    categoryIds: Array.isArray(row.category_ids)
      ? (row.category_ids as string[])
      : row.category_id
        ? [row.category_id]
        : [],
    categoryNames: Array.isArray(row.category_names)
      ? (row.category_names as string[])
      : row.category_name
        ? [row.category_name]
        : [],
    images: Array.isArray(row.images) ? row.images : [],
    videos: parseVideos(row.videos),
    stock: effectiveStock,
    reserved: effectiveReserved,
    // What the storefront can sell today. `stock` stays the physical count,
    // which is the inventory figure — the two diverge while an order is pending.
    available: Math.max(0, effectiveStock - effectiveReserved),
    costPrice: row.cost_price != null ? parseFloat(row.cost_price) : null,
    sku: row.sku,
    active: row.active,
    featured: row.featured,
    weightG: row.weight_g != null ? Number(row.weight_g) : null,
    heightCm: row.height_cm != null ? Number(row.height_cm) : null,
    widthCm: row.width_cm != null ? Number(row.width_cm) : null,
    lengthCm: row.length_cm != null ? Number(row.length_cm) : null,
    ratingAvg: row.rating_avg != null ? parseFloat(row.rating_avg) : 0,
    ratingCount: row.rating_count != null ? Number(row.rating_count) : 0,
    wholesaleEnabled: row.wholesale_enabled === true,
    wholesaleMinQty: row.wholesale_min_qty != null ? Number(row.wholesale_min_qty) : 1,
    hasVariants,
    variantAxes: parseAxes(row.variant_axes),
    priceFrom: hasVariants ? priceFrom : null,
    stockTotal: hasVariants ? stockTotal : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCategory(row: pg.QueryResultRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon ?? null,
    active: row.active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Slug helper ─────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining marks left by NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200);
}

/** Generate a unique slug for the given table, appending -2, -3, ... on collision. */
async function uniqueSlug(table: 'products' | 'categories', base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || 'item';
  let candidate = root;
  let n = 1;
   
  while (true) {
    const result = await query(
      `SELECT 1 FROM ${table} WHERE slug = $1 ${excludeId ? 'AND id <> $2' : ''} LIMIT 1`,
      excludeId ? [candidate, excludeId] : [candidate]
    );
    if (result.rows.length === 0) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

// ─── Product categories ──────────────────────────────────────────────────────

/** Aggregates categories, primary first. Requires the alias `p` in the host query. */
const CATEGORIES_LATERAL = `
       LEFT JOIN LATERAL (
         SELECT array_agg(pc.category_id ORDER BY pc.position, cc.name) AS category_ids,
                array_agg(cc.name ORDER BY pc.position, cc.name) AS category_names
         FROM product_categories pc
         JOIN categories cc ON cc.id = pc.category_id
         WHERE pc.product_id = p.id
       ) pcat ON TRUE`;

const CATEGORIES_SELECT = `pcat.category_ids, pcat.category_names`;

/**
 * The first entry becomes primary (position 0) and is mirrored into
 * products.category_id, which the sitemap, related products and reports read.
 */
async function syncProductCategories(
  client: pg.PoolClient | null,
  productId: string,
  categoryIds: string[]
): Promise<string | null> {
  const run = client
    ? (sql: string, params: unknown[]) => client.query(sql, params)
    : (sql: string, params: unknown[]) => query(sql, params);

  const unique = [...new Set(categoryIds.filter(Boolean))].slice(0, MAX_PRODUCT_CATEGORIES);

  await run(`DELETE FROM product_categories WHERE product_id = $1`, [productId]);
  for (const [position, categoryId] of unique.entries()) {
    await run(
      `INSERT INTO product_categories (product_id, category_id, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, category_id) DO UPDATE SET position = EXCLUDED.position`,
      [productId, categoryId, position]
    );
  }

  const primary = unique[0] ?? null;
  await run(`UPDATE products SET category_id = $2 WHERE id = $1`, [productId, primary]);
  return primary;
}

/**
 * Re-files many products at once.
 *
 * Recategorising a catalogue used to be one product, one modal, one save — the
 * shop moved a whole shelf from "Música" to "K-pop" by hand. Batching it is not
 * only faster: doing it product by product leaves the catalogue half-moved for
 * as long as the person is clicking, and the storefront shows that.
 *
 * The whole batch is one transaction: a partial move is the state that is
 * hardest to recover from, because there is no way to tell from the outside
 * which products were already done.
 *
 * @param mode `replace` swaps the categories, `add` files the product under one
 *   more, `remove` takes it out of the given ones. `add`/`remove` never touch
 *   the categories a product has beyond the ones named.
 */
export async function bulkSetProductCategories(
  productIds: string[],
  categoryIds: string[],
  mode: 'replace' | 'add' | 'remove'
): Promise<{ updated: number }> {
  const products = [...new Set(productIds.filter(Boolean))];
  const categories = [...new Set(categoryIds.filter(Boolean))];
  if (products.length === 0) return { updated: 0 };
  if (categories.length === 0) {
    throw new AppError(400, 'Escolha ao menos uma categoria.', 'NO_CATEGORY');
  }

  // Reject unknown ids up front: silently skipping them would report success
  // for a move that did not happen.
  const known = await query(`SELECT id FROM categories WHERE id = ANY($1::uuid[])`, [categories]);
  if (known.rows.length !== categories.length) {
    throw new AppError(400, 'Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM products WHERE id = ANY($1::uuid[])`,
      [products]
    );
    const ids = existing.rows.map((r) => r.id as string);

    for (const productId of ids) {
      let next: string[];
      if (mode === 'replace') {
        next = categories;
      } else {
        const current = await client.query(
          `SELECT category_id FROM product_categories WHERE product_id = $1 ORDER BY position`,
          [productId]
        );
        const currentIds = current.rows.map((r) => r.category_id as string);
        next =
          mode === 'add'
            ? [...currentIds, ...categories.filter((c) => !currentIds.includes(c))]
            : currentIds.filter((c) => !categories.includes(c));
      }
      await syncProductCategories(client, productId, next);
    }

    await client.query('COMMIT');
    return { updated: ids.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── Products ────────────────────────────────────────────────────────────────

/** Seed/QA products must not appear on the public storefront. */
function isSeedProductName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase();
  return n.startsWith('checkup') || n.includes('checkup api');
}

export const PRODUCT_SORTS = [
  'newest',
  'oldest',
  'name',
  'name_desc',
  'price_asc',
  'price_desc',
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

const PRODUCT_SORT_SET = new Set<string>(PRODUCT_SORTS);

export function parseProductSort(value: unknown): ProductSort {
  return typeof value === 'string' && PRODUCT_SORT_SET.has(value) ? (value as ProductSort) : 'newest';
}

/** ORDER BY whitelist — never interpolate raw query strings. `p.id` keeps pages stable. */
function orderBySql(sort: ProductSort): string {
  switch (sort) {
    case 'oldest':
      return 'p.created_at ASC, LOWER(p.name) ASC, p.id ASC';
    case 'name':
      return 'LOWER(p.name) ASC, p.created_at DESC, p.id ASC';
    case 'name_desc':
      return 'LOWER(p.name) DESC, p.created_at DESC, p.id ASC';
    case 'price_asc':
      return 'COALESCE(vs.price_from, p.price) ASC, LOWER(p.name) ASC, p.id ASC';
    case 'price_desc':
      return 'COALESCE(vs.price_from, p.price) DESC, LOWER(p.name) ASC, p.id ASC';
    case 'newest':
    default:
      return 'p.featured DESC, p.created_at DESC, p.id ASC';
  }
}

export async function listProducts(opts: {
  category?: string;   // category slug
  search?: string;
  featured?: boolean;
  page?: number;
  limit?: number;
  includeInactive?: boolean; // admin only
  /** When true, only products marked for wholesale channel. */
  wholesaleOnly?: boolean;
  /** Catalog sort. Default: featured then newest. */
  sort?: ProductSort | string;
  /** Include count of active products without images (admin banner). */
  includeStats?: boolean;
}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (!opts.includeInactive) {
    conditions.push(`p.active = TRUE`);
    // Hide QA/seed products from public catalog (still visible in admin via includeInactive)
    conditions.push(`p.name NOT ILIKE 'checkup%'`);
    conditions.push(`p.slug NOT ILIKE 'checkup%'`);
  }
  if (opts.wholesaleOnly) {
    conditions.push(`p.wholesale_enabled = TRUE`);
  }
  if (opts.category) {
    // Matches any of the product's categories, not only the primary one.
    conditions.push(
      `EXISTS (SELECT 1 FROM product_categories pcf
               JOIN categories cf ON cf.id = pcf.category_id
               WHERE pcf.product_id = p.id AND cf.slug = $${i++})`
    );
    params.push(opts.category);
  }
  if (opts.featured) {
    conditions.push(`p.featured = TRUE`);
  }
  if (opts.search && opts.search.trim()) {
    conditions.push(
      `(p.name ILIKE $${i} OR p.description ILIKE $${i} OR COALESCE(p.sku, '') ILIKE $${i}
        OR EXISTS (SELECT 1 FROM product_categories pcs
                   JOIN categories cs ON cs.id = pcs.category_id
                   WHERE pcs.product_id = p.id AND cs.name ILIKE $${i}))`
    );
    params.push(`%${opts.search.trim()}%`);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(opts.limit || 24, 100));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;
  const orderBy = orderBySql(parseProductSort(opts.sort));

  const dataSql = `SELECT p.*, c.name as category_name, ${CATEGORIES_SELECT},
              vs.price_from, vs.stock_total
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN LATERAL (
         SELECT MIN(v.price)::float AS price_from,
                COALESCE(SUM(v.stock), 0)::int AS stock_total,
                COALESCE(SUM(v.reserved), 0)::int AS reserved_total
         FROM product_variants v
         WHERE v.product_id = p.id AND v.active = TRUE
       ) vs ON p.has_variants = TRUE
${CATEGORIES_LATERAL}
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${i++} OFFSET $${i}`;

  const [data, count, stats] = await Promise.all([
    query(dataSql, [...params, limit, offset]),
    query(
      `SELECT COUNT(*)::int as total
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${where}`,
      params
    ),
    opts.includeStats
      ? query(
          `SELECT COUNT(*)::int as total
           FROM products
           WHERE active = TRUE
             AND jsonb_array_length(COALESCE(images, '[]'::jsonb)) = 0`
        )
      : Promise.resolve(null),
  ]);

  return {
    products: data.rows.map(mapProduct),
    total: count.rows[0].total as number,
    page,
    limit,
    missingPhotoCount: stats ? (stats.rows[0].total as number) : undefined,
  };
}

async function attachVariants(product: Product, includeInactiveVariants = false): Promise<Product> {
  if (!product.hasVariants) {
    return { ...product, variants: [] };
  }
  const variants = await listVariants(product.id, includeInactiveVariants);
  const active = variants.filter((v) => v.active);
  const priceFrom = active.length ? Math.min(...active.map((v) => v.price)) : product.price;
  const stockTotal = active.reduce((s, v) => s + v.stock, 0);
  const reservedTotal = active.reduce((s, v) => s + v.reserved, 0);
  return {
    ...product,
    variants,
    priceFrom,
    stockTotal,
    price: priceFrom,
    stock: stockTotal,
    reserved: reservedTotal,
    available: Math.max(0, stockTotal - reservedTotal),
  };
}

export async function listVariants(
  productId: string,
  includeInactive = false
): Promise<ProductVariant[]> {
  const result = await query(
    `SELECT * FROM product_variants
     WHERE product_id = $1 ${includeInactive ? '' : 'AND active = TRUE'}
     ORDER BY sort_order ASC, name ASC`,
    [productId]
  );
  return result.rows.map(mapVariant);
}

export async function getVariantById(id: string): Promise<ProductVariant | null> {
  const result = await query(`SELECT * FROM product_variants WHERE id = $1`, [id]);
  return result.rows[0] ? mapVariant(result.rows[0]) : null;
}

export async function getProductBySlug(slug: string, includeInactive = false): Promise<Product | null> {
  const result = await query(
    `SELECT p.*, c.name as category_name, ${CATEGORIES_SELECT}
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
${CATEGORIES_LATERAL}
     WHERE p.slug = $1 ${includeInactive ? '' : 'AND p.active = TRUE'}`,
    [slug]
  );
  if (!result.rows[0]) return null;
  const product = mapProduct(result.rows[0]);
  // Block direct public access to seed products by slug
  if (!includeInactive && isSeedProductName(product.name)) return null;
  return attachVariants(product, includeInactive);
}

export async function getProductById(id: string): Promise<Product | null> {
  const result = await query(
    `SELECT p.*, c.name as category_name, ${CATEGORIES_SELECT}
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
${CATEGORIES_LATERAL}
     WHERE p.id = $1`,
    [id]
  );
  if (!result.rows[0]) return null;
  return attachVariants(mapProduct(result.rows[0]), true);
}

export async function createProduct(data: {
  name: string;
  description?: string | null;
  price: number;
  compareAtPrice?: number | null;
  costPrice?: number | null;
  categoryId?: string | null;
  categoryIds?: string[];
  images?: string[];
  videos?: ProductVideo[];
  stock?: number;
  sku?: string | null;
  active?: boolean;
  featured?: boolean;
  weightG?: number | null;
  heightCm?: number | null;
  widthCm?: number | null;
  lengthCm?: number | null;
  wholesaleEnabled?: boolean;
  wholesaleMinQty?: number;
}): Promise<Product> {
  const slug = await uniqueSlug('products', data.name);
  const minQty = Math.max(1, data.wholesaleMinQty ?? 1);
  // categoryIds wins; categoryId alone still works (compat).
  const categoryIds = resolveCategoryIds(data.categoryIds, data.categoryId);
  const result = await query(
    `INSERT INTO products (name, slug, description, price, compare_at_price, category_id, images, stock, sku, active, featured,
                           weight_g, height_cm, width_cm, length_cm, wholesale_enabled, wholesale_min_qty, videos, cost_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19)
     RETURNING *`,
    [
      data.name,
      slug,
      data.description ?? null,
      data.price,
      data.compareAtPrice ?? null,
      categoryIds[0] ?? null,
      JSON.stringify(data.images ?? []),
      data.stock ?? 0,
      data.sku ?? null,
      data.active ?? true,
      data.featured ?? false,
      data.weightG ?? null,
      data.heightCm ?? null,
      data.widthCm ?? null,
      data.lengthCm ?? null,
      data.wholesaleEnabled ?? false,
      minQty,
      JSON.stringify(parseVideos(data.videos)),
      // No cost is a legitimate catalogue state (giveaway, consignment): NULL,
      // never 0 — zero would enter the report as a 100% margin.
      data.costPrice ?? null,
    ]
  );
  const created = mapProduct(result.rows[0]);
  if (categoryIds.length) {
    await syncProductCategories(null, created.id, categoryIds);
  }
  return { ...created, categoryIds, categoryNames: created.categoryNames };
}

/** Accepts either the new category list or the legacy single field. */
function resolveCategoryIds(
  categoryIds: string[] | undefined,
  categoryId: string | null | undefined
): string[] {
  if (Array.isArray(categoryIds)) {
    return [...new Set(categoryIds.filter(Boolean))].slice(0, MAX_PRODUCT_CATEGORIES);
  }
  return categoryId ? [categoryId] : [];
}

export async function updateProduct(id: string, data: Record<string, unknown>): Promise<Product> {
  // categoryIds lives in the join table and wins over category_id when present.
  const hasCategoryIds = Array.isArray(data.categoryIds);
  const categoryIds = hasCategoryIds
    ? resolveCategoryIds(data.categoryIds as string[], null)
    : [];

  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    price: 'price',
    compareAtPrice: 'compare_at_price',
    costPrice: 'cost_price',
    categoryId: 'category_id',
    images: 'images',
    stock: 'stock',
    sku: 'sku',
    active: 'active',
    featured: 'featured',
    weightG: 'weight_g',
    heightCm: 'height_cm',
    widthCm: 'width_cm',
    lengthCm: 'length_cm',
    wholesaleEnabled: 'wholesale_enabled',
    wholesaleMinQty: 'wholesale_min_qty',
    hasVariants: 'has_variants',
    variantAxes: 'variant_axes',
    videos: 'videos',
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, col] of Object.entries(fieldMap)) {
    // syncProductCategories writes category_id last, so the legacy field cannot overwrite it.
    if (hasCategoryIds && key === 'categoryId') continue;
    if (key in data && data[key] !== undefined) {
      if (col === 'images' || col === 'variant_axes' || col === 'videos') {
        sets.push(`${col} = $${i++}::jsonb`);
        const payload =
          col === 'variant_axes'
            ? parseAxes(data[key])
            : col === 'videos'
              ? parseVideos(data[key])
              : (data[key] ?? []);
        values.push(JSON.stringify(payload));
      } else {
        sets.push(`${col} = $${i++}`);
        values.push(data[key]);
      }
    }
  }

  // Keep slug in sync when the name changes
  if (typeof data.name === 'string' && data.name.trim()) {
    const slug = await uniqueSlug('products', data.name, id);
    sets.push(`slug = $${i++}`);
    values.push(slug);
  }

  if (sets.length === 0 && !hasCategoryIds) {
    const existing = await getProductById(id);
    if (!existing) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
    return existing;
  }

  if (sets.length > 0) {
    values.push(id);
    const result = await query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`,
      values
    );
    if (result.rows.length === 0) {
      throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
    }
  }

  if (hasCategoryIds) {
    await syncProductCategories(null, id, categoryIds);
  }

  // Re-read to pick up aggregated categories and variants.
  const updated = await getProductById(id);
  if (!updated) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  return updated;
}

/**
 * Clones a product for bulk entry. The copy starts INACTIVE so it cannot leak
 * into the catalogue before review, and reuses image URLs rather than copying
 * files on disk.
 */
export async function duplicateProduct(id: string): Promise<Product> {
  const source = await getProductById(id);
  if (!source) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');

  const name = `${source.name} (cópia)`.slice(0, 200);
  const slug = await uniqueSlug('products', name);

  const client = await getClient();
  let cloneId: string;
  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO products (name, slug, description, price, compare_at_price, category_id, images, stock, sku,
                             active, featured, weight_g, height_cm, width_cm, length_cm,
                             wholesale_enabled, wholesale_min_qty, has_variants, variant_axes, videos,
                             cost_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,FALSE,FALSE,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19)
       RETURNING id`,
      [
        name,
        slug,
        source.description ?? null,
        source.price,
        source.compareAtPrice ?? null,
        source.categoryId ?? null,
        JSON.stringify(source.images ?? []),
        // Zero stock: it is a different physical product. Copying the original
        // count would advertise items that are not on the shelf.
        0,
        // SKUs are unique by nature; whoever duplicates fills in the new code.
        null,
        source.weightG ?? null,
        source.heightCm ?? null,
        source.widthCm ?? null,
        source.lengthCm ?? null,
        source.wholesaleEnabled ?? false,
        source.wholesaleMinQty ?? 1,
        source.hasVariants ?? false,
        JSON.stringify(source.variantAxes ?? []),
        JSON.stringify(source.videos ?? []),
        // Unlike stock, cost is copied: it belongs to the product, not to what
        // happens to be on the shelf.
        source.costPrice ?? null,
      ]
    );
    cloneId = inserted.rows[0].id as string;

    for (const [position, categoryId] of (source.categoryIds ?? []).entries()) {
      await client.query(
        `INSERT INTO product_categories (product_id, category_id, position) VALUES ($1,$2,$3)
         ON CONFLICT (product_id, category_id) DO NOTHING`,
        [cloneId, categoryId, position]
      );
    }

    for (const variant of source.variants ?? []) {
      await client.query(
        `INSERT INTO product_variants
           (product_id, name, options, sku, price, compare_at_price, stock, images, active, sort_order,
            cost_price)
         VALUES ($1,$2,$3::jsonb,NULL,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
        [
          cloneId,
          variant.name,
          JSON.stringify(variant.options),
          variant.price,
          variant.compareAtPrice ?? null,
          0, // same as the parent: stock is physical, it does not clone
          JSON.stringify(variant.images ?? []),
          variant.active,
          variant.sortOrder,
          variant.costPrice ?? null,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const clone = await getProductById(cloneId);
  if (!clone) throw new AppError(500, 'Falha ao duplicar o produto.', 'DUPLICATE_FAILED');
  return clone;
}

export type VariantInput = {
  id?: string;
  name: string;
  options: Record<string, string>;
  sku?: string | null;
  price: number;
  compareAtPrice?: number | null;
  costPrice?: number | null;
  stock?: number;
  images?: string[];
  active?: boolean;
  sortOrder?: number;
};

/**
 * Replace all variants of a product (Shopee-style matrix save).
 * When variants are empty, turns has_variants off.
 */
export async function replaceVariants(
  productId: string,
  axes: VariantAxis[],
  variants: VariantInput[]
): Promise<Product> {
  const product = await getProductById(productId);
  if (!product) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');

  const cleanAxes = parseAxes(axes);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (!variants.length || cleanAxes.length === 0) {
      await client.query(
        `UPDATE products SET has_variants = FALSE, variant_axes = '[]'::jsonb WHERE id = $1`,
        [productId]
      );
      await client.query(`DELETE FROM product_variants WHERE product_id = $1`, [productId]);
      await client.query('COMMIT');
      const updated = await getProductById(productId);
      if (!updated) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
      return updated;
    }

    // Validate unique names
    const names = new Set<string>();
    for (const v of variants) {
      const name = String(v.name || '').trim();
      if (!name) throw new AppError(400, 'Cada variação precisa de um nome.', 'VARIANT_NAME_REQUIRED');
      if (names.has(name)) {
        throw new AppError(400, `Variação duplicada: ${name}`, 'VARIANT_DUPLICATE');
      }
      names.add(name);
      if (v.price == null || Number(v.price) < 0) {
        throw new AppError(400, `Preço inválido em "${name}".`, 'VARIANT_PRICE');
      }
    }

    await client.query(
      `UPDATE products SET has_variants = TRUE, variant_axes = $1::jsonb WHERE id = $2`,
      [JSON.stringify(cleanAxes), productId]
    );

    // Upsert by keeping ids when provided; delete removed
    const keepIds: string[] = [];
    let sort = 0;
    for (const v of variants) {
      const name = String(v.name).trim();
      const options = v.options && typeof v.options === 'object' ? v.options : {};
      const price = Number(v.price);
      const stock = Math.max(0, Math.floor(Number(v.stock) || 0));
      const images = Array.isArray(v.images) ? v.images : [];
      const compareAt =
        v.compareAtPrice != null && !Number.isNaN(Number(v.compareAtPrice))
          ? Number(v.compareAtPrice)
          : null;
      const active = v.active !== false;
      const sku = v.sku?.trim() || null;
      // Same rule as the parent: absent cost is NULL, not zero.
      const costPrice =
        v.costPrice != null && !Number.isNaN(Number(v.costPrice)) ? Number(v.costPrice) : null;

      if (v.id) {
        const upd = await client.query(
          `UPDATE product_variants SET
             name = $1, options = $2::jsonb, sku = $3, price = $4, compare_at_price = $5,
             stock = $6, images = $7::jsonb, active = $8, sort_order = $9, cost_price = $12
           WHERE id = $10 AND product_id = $11
           RETURNING id`,
          [
            name,
            JSON.stringify(options),
            sku,
            price,
            compareAt,
            stock,
            JSON.stringify(images),
            active,
            v.sortOrder ?? sort,
            v.id,
            productId,
            costPrice,
          ]
        );
        if (upd.rows[0]) {
          keepIds.push(upd.rows[0].id);
        } else {
          // id not found — insert
          const ins = await client.query(
            `INSERT INTO product_variants
               (product_id, name, options, sku, price, compare_at_price, stock, images, active, sort_order,
                cost_price)
             VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
             RETURNING id`,
            [
              productId,
              name,
              JSON.stringify(options),
              sku,
              price,
              compareAt,
              stock,
              JSON.stringify(images),
              active,
              v.sortOrder ?? sort,
              costPrice,
            ]
          );
          keepIds.push(ins.rows[0].id);
        }
      } else {
        const ins = await client.query(
          `INSERT INTO product_variants
             (product_id, name, options, sku, price, compare_at_price, stock, images, active, sort_order,
              cost_price)
           VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
           RETURNING id`,
          [
            productId,
            name,
            JSON.stringify(options),
            sku,
            price,
            compareAt,
            stock,
            JSON.stringify(images),
            active,
            v.sortOrder ?? sort,
            costPrice,
          ]
        );
        keepIds.push(ins.rows[0].id);
      }
      sort += 1;
    }

    if (keepIds.length) {
      await client.query(
        `DELETE FROM product_variants WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))`,
        [productId, keepIds]
      );
    }

    // Sync parent price/stock for admin list when has variants (min price / sum stock)
    const agg = await client.query(
      `SELECT MIN(price)::float AS price_from, COALESCE(SUM(stock),0)::int AS stock_total
       FROM product_variants WHERE product_id = $1 AND active = TRUE`,
      [productId]
    );
    if (agg.rows[0]?.price_from != null) {
      await client.query(`UPDATE products SET price = $1, stock = $2 WHERE id = $3`, [
        agg.rows[0].price_from,
        agg.rows[0].stock_total,
        productId,
      ]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const updated = await getProductById(productId);
  if (!updated) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  return updated;
}

/** Soft-delete: deactivate so historical order_items snapshots stay intact. */
export async function deactivateProduct(id: string): Promise<void> {
  const result = await query(`UPDATE products SET active = FALSE WHERE id = $1 RETURNING id`, [id]);
  if (result.rows.length === 0) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
}

/** Escapes for use inside an HTML attribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Minimal HTML carrying the product's meta tags, for link previews.
 *
 * WhatsApp, Facebook and Telegram do not run JavaScript: they read the static
 * shell, which describes the whole store. Without this every shared product
 * previewed with the same generic image instead of its own photo.
 *
 * Only crawlers reach this (nginx routes by user-agent); the redirect below
 * covers anyone landing here by mistake.
 */
export async function buildProductShareHtml(
  slug: string,
  shopBaseUrl: string
): Promise<string | null> {
  const product = await getProductBySlug(slug, false);
  if (!product) return null;

  const base = shopBaseUrl.replace(/\/$/, '');
  const url = `${base}/produto/${product.slug}`;
  const title = `${product.name} — GeekPop & Toys`;
  const price = product.price.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const description =
    (product.description?.trim().slice(0, 200) ||
      `${product.name} na GeekPop & Toys, loja de K-pop em Copacabana.`) + ` A partir de ${price}.`;
  // The product's first photo is the entire point of this endpoint.
  const image = product.images[0] || `${base}/og-image.png`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${escapeHtml(url)}" />
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="product" />
<meta property="og:site_name" content="Loja GeekPop & Toys" />
<meta property="og:locale" content="pt_BR" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:alt" content="${escapeHtml(product.name)}" />
<meta property="product:price:amount" content="${product.price.toFixed(2)}" />
<meta property="product:price:currency" content="BRL" />
<meta property="product:availability" content="${product.stock > 0 ? 'in stock' : 'out of stock'}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(url)}" />
</head>
<body>
<a href="${escapeHtml(url)}">${escapeHtml(product.name)}</a>
</body>
</html>
`;
}

/** Absolute product URLs for search engines (shop host). */
export async function buildProductSitemapXml(shopBaseUrl: string): Promise<string> {
  const base = shopBaseUrl.replace(/\/$/, '');
  const result = await query(
    `SELECT slug, updated_at FROM products
     WHERE active = TRUE
       AND name NOT ILIKE 'checkup%'
       AND slug NOT ILIKE 'checkup%'
     ORDER BY updated_at DESC
     LIMIT 5000`
  );
  const urls = result.rows
    .map((r) => {
      const lastmod = r.updated_at
        ? new Date(r.updated_at as string).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      return `  <url>
    <loc>${base}/produto/${r.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${base}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${base}/evento</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
${urls}
</urlset>
`;
}

/** Related products: same category first, then featured. */
export async function listRelatedProducts(slug: string, limit = 8): Promise<Product[]> {
  const base = await getProductBySlug(slug, false);
  if (!base) return [];

  const take = Math.max(1, Math.min(limit, 16));
  const params: unknown[] = [base.id];
  let i = 2;
  let categoryFilter = '';
  if (base.categoryId) {
    categoryFilter = `AND p.category_id = $${i++}`;
    params.push(base.categoryId);
  }

  const sameCat = await query(
    `SELECT p.*, c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.active = TRUE
       AND p.id <> $1
       AND p.name NOT ILIKE 'checkup%'
       AND p.stock > 0
       ${categoryFilter}
     ORDER BY p.featured DESC, p.created_at DESC
     LIMIT $${i}`,
    [...params, take]
  );

  let products = sameCat.rows.map(mapProduct);
  if (products.length < take) {
    const exclude = [base.id, ...products.map((p) => p.id)];
    const more = await query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.active = TRUE
         AND p.id <> ALL($1::uuid[])
         AND p.name NOT ILIKE 'checkup%'
         AND p.stock > 0
       ORDER BY p.featured DESC, p.created_at DESC
       LIMIT $2`,
      [exclude, take - products.length]
    );
    products = [...products, ...more.rows.map(mapProduct)];
  }
  return products;
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function listCategories(includeInactive = false): Promise<Category[]> {
  const result = await query(
    includeInactive
      ? `SELECT * FROM categories ORDER BY sort_order ASC, name ASC`
      : `SELECT * FROM categories
         WHERE active = TRUE
           AND name NOT ILIKE 'checkup%'
           AND slug NOT ILIKE 'checkup%'
         ORDER BY sort_order ASC, name ASC`
  );
  return result.rows.map(mapCategory);
}

/**
 * Admin list: includes inactive and counts products in each.
 *
 * The count comes from `product_categories` (the multi-category table), not
 * from `products.category_id`: a product filed under a secondary category
 * still counts, and that is what blocks an innocent delete.
 */
export async function listCategoriesForAdmin(): Promise<(Category & { productCount: number })[]> {
  const result = await query(
    `SELECT c.*, COUNT(pc.product_id)::int AS product_count
       FROM categories c
       LEFT JOIN product_categories pc ON pc.category_id = c.id
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC`
  );
  return result.rows.map((row) => ({
    ...mapCategory(row),
    productCount: row.product_count ?? 0,
  }));
}

export async function createCategory(data: {
  name: string;
  description?: string | null;
  icon?: string | null;
  active?: boolean;
  sortOrder?: number;
}): Promise<Category> {
  const slug = await uniqueSlug('categories', data.name);
  const result = await query(
    `INSERT INTO categories (name, slug, description, icon, active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [data.name, slug, data.description ?? null, data.icon ?? null, data.active ?? true, data.sortOrder ?? 0]
  );
  return mapCategory(result.rows[0]);
}

export async function updateCategory(id: string, data: Record<string, unknown>): Promise<Category> {
  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    icon: 'icon',
    active: 'active',
    sortOrder: 'sort_order',
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data && data[key] !== undefined) {
      sets.push(`${col} = $${i++}`);
      values.push(data[key]);
    }
  }
  if (typeof data.name === 'string' && data.name.trim()) {
    const slug = await uniqueSlug('categories', data.name, id);
    sets.push(`slug = $${i++}`);
    values.push(slug);
  }
  if (sets.length === 0) {
    const existing = await query('SELECT * FROM categories WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError(404, 'Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
    return mapCategory(existing.rows[0]);
  }
  values.push(id);
  const result = await query(`UPDATE categories SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values);
  if (result.rows.length === 0) throw new AppError(404, 'Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
  return mapCategory(result.rows[0]);
}

export async function deactivateCategory(id: string): Promise<void> {
  const result = await query(`UPDATE categories SET active = FALSE WHERE id = $1 RETURNING id`, [id]);
  if (result.rows.length === 0) throw new AppError(404, 'Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
}

export interface AddImagesResult {
  product: Product;
  /** URLs that fit under the cap and were persisted. */
  accepted: string[];
  /** URLs rejected for exceeding the cap — the caller deletes the files. */
  rejected: string[];
}

/**
 * The cap is enforced here, not only in the PATCH schema, so an upload can
 * never leave the product in a state it can no longer save.
 */
export async function addProductImages(id: string, urls: string[]): Promise<AddImagesResult> {
  const current = await query(`SELECT images FROM products WHERE id = $1`, [id]);
  if (current.rows.length === 0) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');

  const existing = Array.isArray(current.rows[0].images) ? (current.rows[0].images as string[]) : [];
  const room = Math.max(0, MAX_PRODUCT_IMAGES - existing.length);
  const accepted = urls.slice(0, room);
  const rejected = urls.slice(room);

  if (accepted.length === 0) {
    throw new AppError(
      400,
      `Este produto já tem ${existing.length} fotos (máximo ${MAX_PRODUCT_IMAGES}). Remova alguma antes de enviar outra.`,
      'IMAGE_LIMIT_REACHED'
    );
  }

  const result = await query(
    `UPDATE products SET images = images || $2::jsonb WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(accepted)]
  );
  return { product: mapProduct(result.rows[0]), accepted, rejected };
}

/** Appends a hosted MP4 or external link, honouring MAX_PRODUCT_VIDEOS. */
export async function addProductVideo(id: string, video: ProductVideo): Promise<Product> {
  const current = await query(`SELECT videos FROM products WHERE id = $1`, [id]);
  if (current.rows.length === 0) {
    throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  }

  const existing = parseVideos(current.rows[0].videos);
  if (existing.length >= MAX_PRODUCT_VIDEOS) {
    throw new AppError(
      400,
      `Este produto já tem ${MAX_PRODUCT_VIDEOS} vídeos. Remova algum antes de enviar outro.`,
      'VIDEO_LIMIT_REACHED'
    );
  }
  if (existing.some((v) => v.url === video.url)) {
    throw new AppError(400, 'Este vídeo já está no produto.', 'VIDEO_DUPLICATE');
  }

  const result = await query(
    `UPDATE products SET videos = videos || $2::jsonb WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(parseVideos([video]))]
  );
  return mapProduct(result.rows[0]);
}

