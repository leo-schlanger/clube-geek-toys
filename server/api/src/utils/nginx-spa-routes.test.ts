import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
  return [...body.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => p !== '*');
}

const sample = (path: string) => path.replace(/:[a-zA-Z]+/g, 'x-1');
const withSlash = (p: string) => (p === '/' ? [p] : [p, `${p}/`]);

const club = mapMatcher('club_spa_route');
const shopMap = mapMatcher('shop_spa_route');
// shop.* locations of their own in default.conf: = /, ^/categoria/, ^/produto/, = /evento.
const shop = (u: string) =>
  shopMap(u) || u === '/' || /^\/(categoria|produto)\//.test(u) || u === '/evento';

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
    for (const u of ['/nao-existe', '/carrinho/x', '/a/b', '/membro/x', '/verificar', '/pagamento/outro', '/wp-login.php']) {
      expect(club(u), `club ${u}`).toBe(false);
      expect(shop(u), `shop ${u}`).toBe(false);
    }
  });

  it('both server blocks answer 404 with their shell and fall to the map', () => {
    const conf = read('server/nginx/conf.d/default.conf');
    expect(conf).toMatch(/error_page 404 \/index\.html;[\s\S]*?location @club_spa \{\s*if \(\$club_spa_route = 0\)/);
    expect(conf).toMatch(/error_page 404 \/shop\.html;[\s\S]*?location @shop_spa \{\s*if \(\$shop_spa_route = 0\)/);
  });
});
