import pg from 'pg';
import { query } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import type { Product, Category } from '../types/index.js';

// ─── Row mappers ─────────────────────────────────────────────────────────────

function mapProduct(row: pg.QueryResultRow): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: parseFloat(row.price),
    compareAtPrice: row.compare_at_price != null ? parseFloat(row.compare_at_price) : null,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
    images: Array.isArray(row.images) ? row.images : [],
    stock: row.stock,
    sku: row.sku,
    active: row.active,
    featured: row.featured,
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

export async function listProducts(opts: {
  category?: string;   // category slug
  search?: string;
  featured?: boolean;
  page?: number;
  limit?: number;
  includeInactive?: boolean; // admin only
}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (!opts.includeInactive) {
    conditions.push(`p.active = TRUE`);
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
      `SELECT p.*, c.name as category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
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

export async function getProductBySlug(slug: string, includeInactive = false): Promise<Product | null> {
  const result = await query(
    `SELECT p.*, c.name as category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.slug = $1 ${includeInactive ? '' : 'AND p.active = TRUE'}`,
    [slug]
  );
  return result.rows[0] ? mapProduct(result.rows[0]) : null;
}

export async function getProductById(id: string): Promise<Product | null> {
  const result = await query(
    `SELECT p.*, c.name as category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = $1`,
    [id]
  );
  return result.rows[0] ? mapProduct(result.rows[0]) : null;
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
}): Promise<Product> {
  const slug = await uniqueSlug('products', data.name);
  const result = await query(
    `INSERT INTO products (name, slug, description, price, compare_at_price, category_id, images, stock, sku, active, featured)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
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
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data && data[key] !== undefined) {
      if (col === 'images') {
        sets.push(`images = $${i++}::jsonb`);
        values.push(JSON.stringify(data[key] ?? []));
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
  return mapProduct(result.rows[0]);
}

/** Soft-delete: deactivate so historical order_items snapshots stay intact. */
export async function deactivateProduct(id: string): Promise<void> {
  const result = await query(`UPDATE products SET active = FALSE WHERE id = $1 RETURNING id`, [id]);
  if (result.rows.length === 0) throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function listCategories(includeInactive = false): Promise<Category[]> {
  const result = await query(
    `SELECT * FROM categories ${includeInactive ? '' : 'WHERE active = TRUE'} ORDER BY sort_order ASC, name ASC`
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
