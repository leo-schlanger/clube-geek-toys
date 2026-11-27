import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// nginx answers 404 for any path that is neither a file nor a route of the
// SPA (maps $club_spa_route / $shop_spa_route in nginx.conf). Family check:
// every <Route path> of src/App.tsx, per host, must pass the map, or a new
// route would ship as a 404.
const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');
const nginxConf = read('server/nginx/nginx.conf');
const appTsx = read('src/App.tsx');

/** Entries of `map $uri $<name>` as matchers: exact strings and ~regexes. */
function mapMatcher(name: string): (uri: string) => boolean {
  const block = nginxConf.match(new RegExp(`map \\$uri \\$${name} \\{([\\s\\S]*?)\\n\\s*\\}`));
  expect(block, name).toBeTruthy();
  const entries = [...block![1].matchAll(/^\s*"([^"]+)"\s+1;/gm)].map((m) => m[1]);
  expect(entries.length, name).toBeGreaterThan(1);
  const tests = entries.map((e) =>
    e.startsWith('~') ? (u: string) => new RegExp(e.slice(1)).test(u) : (u: string) => u === e
  );
  return (uri) => tests.some((t) => t(uri));
}

/** <Route path> inside `function <fn>() { … }` of App.tsx, comments removed. */
function routesOf(fn: string): string[] {
  const start = appTsx.indexOf(`function ${fn}()`);
  expect(start, fn).toBeGreaterThan(-1);
  const body = appTsx.slice(start, appTsx.indexOf('\n}\n', start));
  return [...body.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').matchAll(/<Route\b[^>]*?\bpath="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => p !== '*');
}

const sample = (path: string) => path.replace(/:[a-zA-Z]+/g, 'x-1');
const withSlash = (p: string) => (p === '/' ? [p] : [p, `${p}/`]);

const club = mapMatcher('club_spa_route');
const shopMap = mapMatcher('shop_spa_route');
// shop.* locations of their own in default.conf: = /, /categoria/<slug>,
// /produto/<slug>, /atacado/produto/<slug>, = /evento (deeper paths: 404).
const shop = (u: string) =>
  shopMap(u) || u === '/' || /^\/(categoria|produto|atacado\/produto)\/[^/]+\/?$/.test(u) || u === '/evento';

describe('SPA routes vs nginx 404 (family: every route of App.tsx)', () => {
  const memberRoutes = routesOf('MemberRoutes');
  const shopRoutes = routesOf('ShopRoutes');

  it('reads the route lists', () => {
    expect(memberRoutes.length).toBeGreaterThanOrEqual(15);
    expect(shopRoutes.length).toBeGreaterThanOrEqual(20);
  });

  it('club.*: every member route passes $club_spa_route', () => {
    const missing = memberRoutes.flatMap((p) => withSlash(sample(p))).filter((u) => !club(u));
    expect(missing).toEqual([]);
  });

  it('shop.*: every shop route passes $shop_spa_route or its own location', () => {
    const missing = shopRoutes.flatMap((p) => withSlash(sample(p))).filter((u) => !shop(u));
    expect(missing).toEqual([]);
  });

  it('links the API sends (e-mails, returns) are routes', () => {
    for (const u of ['/membro', '/recuperar-senha', '/verificar-email', '/assinar', '/verificar/abc', '/login']) {
      expect(club(u), u).toBe(true);
    }
    for (const u of ['/pedido/1', '/minhas-compras', '/minhas-compras/1', '/ingressos/R-1', '/evento', '/produto/x']) {
      expect(shop(u), u).toBe(true);
    }
  });

  it('unknown paths are not routes (they answer 404)', () => {
    for (const u of ['/nao-existe', '/carrinho/x', '/a/b', '/membro/x', '/verificar', '/pagamento/outro', '/wp-login.php', '/produto/a/b', '/categoria/']) {
      expect(club(u), `club ${u}`).toBe(false);
      expect(shop(u), `shop ${u}`).toBe(false);
    }
  });

  // Catalogue pages exist only while the API has the slug: a gone product
  // must answer 404, not a 200 «não encontrado» (GSC, 26/11/2026).
  it('shop catalogue routes with a slug go through the existence check', () => {
    const conf = read('server/nginx/conf.d/default.conf');
    const gated: Record<string, string> = {
      '/categoria/:slug': '/products/categories/$seo_slug/exists',
      '/produto/:slug': '/products/$seo_slug/exists',
      '/atacado/produto/:slug': '/products/$seo_slug/exists?channel=wholesale',
    };
    for (const [route, check] of Object.entries(gated)) {
      expect(routesOf('ShopRoutes'), route).toContain(route);
      const prefix = route.replace('/:slug', '').replace(/\//g, '\\/');
      const block = conf.match(new RegExp(`location ~ \\^${prefix}\\/\\(\\?<seo_slug>\\[\\^/\\]\\+\\)\\/\\?\\$ \\{([\\s\\S]*?)\\n    \\}`));
      expect(block, route).toBeTruthy();
      expect(block![1]).toContain(`set $seo_exists ${check};`);
      expect(block![1]).toContain('auth_request /__seo_exists;');
      expect(block![1]).toContain('error_page 403 =404 /shop.html;');
    }
    // Only a clean 404 from the API hides the page; anything else serves it.
    const gate = conf.match(/location = \/__seo_exists \{([\s\S]*?)\n {4}\}/)![1];
    expect(gate).toContain('error_page 404 = @seo_gone;');
    expect(gate).toMatch(/error_page( \d{3})* 500 502 503 504 = @seo_unknown;/);
    expect(conf).toMatch(/location @seo_gone \{\s*return 403;/);
    expect(conf).toMatch(/location @seo_unknown \{\s*return 204;/);
  });

  it('both server blocks answer 404 with their shell and fall to the map', () => {
    const conf = read('server/nginx/conf.d/default.conf');
    expect(conf).toMatch(/error_page 404 \/index\.html;[\s\S]*?location @club_spa \{\s*if \(\$club_spa_route = 0\)/);
    expect(conf).toMatch(/error_page 404 \/shop\.html;[\s\S]*?location @shop_spa \{\s*if \(\$shop_spa_route = 0\)/);
  });
});

// Every internal link a host's pages can render (<Link to>, href, navigate())
// must hit a route of that host's router AND its nginx map, or the visitor
// gets the 404 page (the shop linked /termos before it had the route).
const listTsx = (dir: string): string[] =>
  readdirSync(resolve(root, dir), { recursive: true, encoding: 'utf-8' })
    .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
    .map((f) => `${dir}/${f}`);

const LINK_RE = /(?:\bto=\{?|\bhref=\{?|navigate\(\s*)(["'`])(\/[^"'`]*)\1/g;

/** Internal paths a file links to; `${…}` becomes a sample segment. */
function linksIn(file: string): string[] {
  return [...read(file).matchAll(LINK_RE)]
    .map((m) => m[2].replace(/\$\{[^}]*\}/g, 'x-1').split(/[?#]/)[0])
    .filter((p) => !p.startsWith('//') && !/\.[a-z0-9]+$/i.test(p));
}

/** Path matches a <Route path> (with :params) of the router. */
// Routes are caseSensitive (App.tsx): /Termos is not /termos, as in nginx.
const routerHas = (routes: string[], p: string) =>
  routes.some((r) => new RegExp(`^${r.replace(/:[a-zA-Z]+/g, '[^/]+')}/?$`).test(p));

describe('internal links resolve on their host (family: every page and component)', () => {
  const memberRoutes = routesOf('MemberRoutes');
  const shopRoutes = routesOf('ShopRoutes');
  const adminOnly = /components\/admin\/|pages\/(Admin|PDV)/;
  const shopFiles = [...listTsx('src/pages/shop'), ...listTsx('src/components/store')];
  const clubFiles = listTsx('src/pages').filter((f) => !f.startsWith('src/pages/shop/') && !adminOnly.test(f))
    .concat(listTsx('src/components/member'), listTsx('src/components/registration'));
  const shared = listTsx('src/components').filter(
    (f) => !/components\/(store|member|registration|admin)\//.test(f)
  );

  const broken = (files: string[], routes: string[], nginx: (u: string) => boolean) =>
    files.flatMap((f) => linksIn(f).filter((p) => !routerHas(routes, p) || !nginx(p)).map((p) => `${f}: ${p}`));

  it('finds the links (the scan is not empty)', () => {
    expect(shopFiles.flatMap(linksIn).length).toBeGreaterThan(30);
    expect(clubFiles.flatMap(linksIn).length).toBeGreaterThan(10);
    expect(linksIn('src/components/CookieConsent.tsx')).toContain('/privacidade');
  });

  it('shop.*: every link of the shop pages and components', () => {
    expect(broken(shopFiles, shopRoutes, shop)).toEqual([]);
  });

  it('club.*: every link of the club pages and components', () => {
    expect(broken(clubFiles, memberRoutes, club)).toEqual([]);
  });

  it('shared components resolve on both hosts', () => {
    expect([...broken(shared, shopRoutes, shop), ...broken(shared, memberRoutes, club)]).toEqual([]);
  });
});

describe('router is case-sensitive like nginx (family: every route of App.tsx)', () => {
  it('every <Route> with a path carries caseSensitive', () => {
    const routes = [...appTsx.matchAll(/<Route\b([^>]*?)\bpath="([^"]+)"/g)].filter((m) => m[2] !== '*');
    expect(routes.length).toBeGreaterThan(40);
    expect(routes.filter((m) => !/\bcaseSensitive\b/.test(m[1])).map((m) => m[2])).toEqual([]);
  });
});
