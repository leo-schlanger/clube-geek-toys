import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import type { Product, Category, ProductVariant, VariantAxis } from '../types/index.js';

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
    stock: Number(row.stock) || 0,
    images: Array.isArray(row.images) ? row.images : [],
    active: row.active !== false,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: hasVariants && priceFrom != null ? priceFrom : price,
    compareAtPrice: row.compare_at_price != null ? parseFloat(row.compare_at_price) : null,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
    images: Array.isArray(row.images) ? row.images : [],
    stock: hasVariants && stockTotal != null ? stockTotal : stock,
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
    .replace(/[̀-ͯ]/g, '') // remove acentos (marcas diacríticas combinantes)
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

// ─── Products ────────────────────────────────────────────────────────────────

/** Seed/QA products must not appear on the public storefront. */
function isSeedProductName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase();
  return n.startsWith('checkup') || n.includes('checkup api');
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
    conditions.push(`c.slug = $${i++}`);
    params.push(opts.category);
  }
  if (opts.featured) {
    conditions.push(`p.featured = TRUE`);
  }
  if (opts.search && opts.search.trim()) {
    conditions.push(`(p.name ILIKE $${i} OR p.description ILIKE $${i})`);
    params.push(`%${opts.search.trim()}%`);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(opts.limit || 24, 100));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;

  const [data, count] = await Promise.all([
    query(
      `SELECT p.*, c.name as category_name,
              vs.price_from, vs.stock_total
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN LATERAL (
         SELECT MIN(v.price)::float AS price_from,
                COALESCE(SUM(v.stock), 0)::int AS stock_total
         FROM product_variants v
         WHERE v.product_id = p.id AND v.active = TRUE
       ) vs ON p.has_variants = TRUE
       ${where}
       ORDER BY p.featured DESC, p.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(*)::int as total
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${where}`,
      params
    ),
  ]);

  return {
    products: data.rows.map(mapProduct),
    total: count.rows[0].total as number,
    page,
    limit,
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
  return {
    ...product,
    variants,
    priceFrom,
    stockTotal,
    price: priceFrom,
    stock: stockTotal,
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
    `SELECT p.*, c.name as category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
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
    `SELECT p.*, c.name as category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
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
  categoryId?: string | null;
  images?: string[];
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
  const result = await query(
    `INSERT INTO products (name, slug, description, price, compare_at_price, category_id, images, stock, sku, active, featured,
                           weight_g, height_cm, width_cm, length_cm, wholesale_enabled, wholesale_min_qty)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      data.name,
      slug,
      data.description ?? null,
      data.price,
      data.compareAtPrice ?? null,
      data.categoryId ?? null,
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
    ]
  );
  return mapProduct(result.rows[0]);
}

export async function updateProduct(id: string, data: Record<string, unknown>): Promise<Product> {
  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    price: 'price',
    compareAtPrice: 'compare_at_price',
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
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data && data[key] !== undefined) {
      if (col === 'images' || col === 'variant_axes') {
        sets.push(`${col} = $${i++}::jsonb`);
        const payload =
          col === 'variant_axes' ? parseAxes(data[key]) : (data[key] ?? []);
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

  if (sets.length === 0) {
    const existing = await getProductById(id);
    if (!existing) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
    return existing;
  }

  values.push(id);
  const result = await query(
    `UPDATE products SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  if (result.rows.length === 0) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  return attachVariants(mapProduct(result.rows[0]), true);
}

export type VariantInput = {
  id?: string;
  name: string;
  options: Record<string, string>;
  sku?: string | null;
  price: number;
  compareAtPrice?: number | null;
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

      if (v.id) {
        const upd = await client.query(
          `UPDATE product_variants SET
             name = $1, options = $2::jsonb, sku = $3, price = $4, compare_at_price = $5,
             stock = $6, images = $7::jsonb, active = $8, sort_order = $9
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
          ]
        );
        if (upd.rows[0]) {
          keepIds.push(upd.rows[0].id);
        } else {
          // id not found — insert
          const ins = await client.query(
            `INSERT INTO product_variants
               (product_id, name, options, sku, price, compare_at_price, stock, images, active, sort_order)
             VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8::jsonb,$9,$10)
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
            ]
          );
          keepIds.push(ins.rows[0].id);
        }
      } else {
        const ins = await client.query(
          `INSERT INTO product_variants
             (product_id, name, options, sku, price, compare_at_price, stock, images, active, sort_order)
           VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8::jsonb,$9,$10)
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

/** "Você também pode gostar" — same category first, then featured. */
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

export async function createCategory(data: {
  name: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
}): Promise<Category> {
  const slug = await uniqueSlug('categories', data.name);
  const result = await query(
    `INSERT INTO categories (name, slug, description, active, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.name, slug, data.description ?? null, data.active ?? true, data.sortOrder ?? 0]
  );
  return mapCategory(result.rows[0]);
}

export async function updateCategory(id: string, data: Record<string, unknown>): Promise<Category> {
  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
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

/** Attach uploaded image URLs to a product (appends to the existing images array). */
export async function addProductImages(id: string, urls: string[]): Promise<Product> {
  const result = await query(
    `UPDATE products SET images = images || $2::jsonb WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(urls)]
  );
  if (result.rows.length === 0) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  return mapProduct(result.rows[0]);
}
