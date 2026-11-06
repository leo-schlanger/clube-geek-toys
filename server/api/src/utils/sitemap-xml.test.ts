import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectImages, escapeXml, renderProductSitemapXml } from './sitemap-xml.js';

const BASE = 'https://shop.geekpoptoys.com.br';

describe('renderProductSitemapXml', () => {
  const xml = renderProductSitemapXml(
    `${BASE}/`,
    [
      {
        slug: 'album-bts',
        updatedAt: new Date('2026-10-30T13:29:10Z'),
        images: ['https://api.geeketoys.com.br/uploads/products/a/1.jpg', '/uploads/products/a/2.jpg?w=1&h=2'],
      },
      { slug: 'sem-foto', updatedAt: '2026-09-01T00:00:00Z', images: [] },
    ],
    [{ slug: 'k-pop', updatedAt: '2026-11-01T02:00:00Z' }]
  );

  it('declares the image namespace and lists home, event, categories and products', () => {
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      `${BASE}/`,
      `${BASE}/evento`,
      `${BASE}/categoria/k-pop`,
      `${BASE}/produto/album-bts`,
      `${BASE}/produto/sem-foto`,
    ]);
  });

  it('dates categories and products by their lastmod', () => {
    expect(xml).toMatch(/categoria\/k-pop<\/loc>\s*<lastmod>2026-11-01<\/lastmod>/);
    expect(xml).toMatch(/produto\/album-bts<\/loc>\s*<lastmod>2026-10-30<\/lastmod>/);
  });

  it('attaches each photo as an absolute, escaped image:loc', () => {
    const product = xml.slice(xml.indexOf('produto/album-bts'), xml.indexOf('produto/sem-foto'));
    const images = [...product.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((m) => m[1]);
    expect(images).toEqual([
      'https://api.geeketoys.com.br/uploads/products/a/1.jpg',
      `${BASE}/uploads/products/a/2.jpg?w=1&amp;h=2`,
    ]);
    expect(xml.slice(xml.indexOf('produto/sem-foto'))).not.toContain('image:image');
  });

  it('is well-formed: every opened tag closes', () => {
    for (const tag of ['url', 'image:image', 'loc', 'image:loc', 'lastmod']) {
      const open = xml.split(`<${tag}>`).length - 1;
      const close = xml.split(`</${tag}>`).length - 1;
      expect(open, tag).toBe(close);
    }
  });
});

describe('collectImages', () => {
  it('flattens product and variant photo lists and drops repeats and junk', () => {
    expect(collectImages(['a.jpg', 'b.jpg'], [['b.jpg', 'c.jpg'], [], [null, ' d.jpg ']])).toEqual([
      'a.jpg',
      'b.jpg',
      'c.jpg',
      'd.jpg',
    ]);
    expect(collectImages(null, undefined)).toEqual([]);
  });
});

describe('escapeXml', () => {
  it('escapes the five XML entities', () => {
    expect(escapeXml(`a&b<c>"d'`)).toBe('a&amp;b&lt;c&gt;&quot;d&apos;');
  });
});

// The repo files nginx serves for the shop's /sitemap.xml.
describe('shop sitemap index', () => {
  // vitest runs both projects from the repo root.
  const root = process.cwd();
  const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

  it('points at the two shop sitemaps on the canonical host', () => {
    const index = read('public/sitemap-index-shop.xml');
    expect(index).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${BASE}/sitemap-shop.xml`, `${BASE}/sitemap-products.xml`]);
  });

  it('is served as /sitemap.xml only inside the shop server block', () => {
    const conf = read('server/nginx/conf.d/default.conf');
    const servers = conf.split(/\nserver \{/);
    const withIndex = servers.filter((s) => s.includes('sitemap-index-shop.xml'));
    expect(withIndex).toHaveLength(1);
    expect(withIndex[0]).toMatch(/server_name shop\.geeketoys\.com\.br shop\.geekpoptoys\.com\.br;/);
    expect(withIndex[0]).toMatch(/location = \/sitemap\.xml \{\s*try_files \/sitemap-index-shop\.xml =404;/);
  });
});
