import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// robots.txt and the static sitemaps live in the shared public/ root; nginx
// picks the file per host. These tests read the repo files nginx serves.
const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const conf = read('server/nginx/conf.d/default.conf');
const servers = conf.split(/\nserver \{/);
const block = (serverName: RegExp) => {
  const found = servers.filter((s) => serverName.test(s));
  expect(found, String(serverName)).toHaveLength(1);
  return found[0];
};
const shopBlock = () => block(/server_name shop\.geeketoys\.com\.br shop\.geekpoptoys\.com\.br;/);
const clubBlock = () => block(/server_name club\.geeketoys\.com\.br club\.geekpoptoys\.com\.br;/);
const admBlock = () => block(/server_name adm\.geeketoys\.com\.br adm\.geekpoptoys\.com\.br;/);

/** What each host answers on /robots.txt and /sitemap.xml. */
const HOSTS = {
  club: { robots: 'public/robots.txt', sitemaps: ['public/sitemap.xml'] },
  shop: {
    robots: 'public/robots-shop.txt',
    sitemaps: ['public/sitemap-index-shop.xml', 'public/sitemap-shop.xml'],
  },
  adm: { robots: 'public/robots-adm.txt', sitemaps: [] as string[] },
} as const;

const sitemapLines = (robots: string) =>
  robots.split('\n').filter((l) => /^sitemap:/i.test(l)).map((l) => l.replace(/^sitemap:\s*/i, '').trim());
const disallowed = (robots: string) =>
  robots.split('\n').filter((l) => /^disallow:/i.test(l)).map((l) => l.replace(/^disallow:\s*/i, '').trim()).filter(Boolean);
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe('robots.txt per host (nginx)', () => {
  it('serves the shop and adm files with a location of their own, without add_header', () => {
    for (const [b, file] of [
      [shopBlock(), 'robots-shop.txt'],
      [admBlock(), 'robots-adm.txt'],
    ] as const) {
      const loc = b.match(/location = \/robots\.txt \{([^}]*)\}/);
      expect(loc, file).not.toBeNull();
      expect(loc![1]).toContain(`try_files /${file} =404;`);
      // add_header in a location replaces the inherited set (X-Robots-Tag, HSTS, CSP).
      expect(loc![1]).not.toContain('add_header');
    }
  });

  it('leaves the club on the shared public/robots.txt', () => {
    expect(clubBlock()).not.toContain('/robots.txt');
    expect(servers.filter((s) => s.includes('location = /robots.txt'))).toHaveLength(2);
  });

  it('answers 404 for any sitemap on the admin panel', () => {
    expect(admBlock()).toMatch(/location ~ \^\/sitemap\[\^\/\]\*\\\.xml\$ \{\s*return 404;/);
  });

  it('keeps the admin panel out of the index by header, not by Disallow', () => {
    expect(admBlock()).toMatch(/add_header X-Robots-Tag "noindex, nofollow, noarchive" always;/);
    const robots = read(HOSTS.adm.robots);
    expect(disallowed(robots)).toEqual([]);
    expect(sitemapLines(robots)).toEqual([]);
  });

  it('points each host at its own sitemap on the canonical geekpoptoys origin', () => {
    expect(sitemapLines(read(HOSTS.club.robots))).toEqual(['https://club.geekpoptoys.com.br/sitemap.xml']);
    expect(sitemapLines(read(HOSTS.shop.robots))).toEqual(['https://shop.geekpoptoys.com.br/sitemap.xml']);
  });

  it('blocks the pages that carry a person’s name', () => {
    expect(disallowed(read(HOSTS.club.robots))).toContain('/verificar/');
    expect(disallowed(read(HOSTS.shop.robots))).toEqual(expect.arrayContaining(['/ingresso/', '/ingressos/', '/pedido/']));
  });
});

// Every route whose head says noindex, read from the source (static paths only).
function noIndexPaths(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) files.push(p);
    }
  };
  walk(resolve(root, 'src'));
  const out: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf-8');
    for (const m of src.matchAll(/<NoIndex\b[^>]*?path="([^"]+)"/g)) out.push(m[1]);
    for (const m of src.matchAll(/<SeoHead\b([^>]|=>)*?\/>/g)) {
      const tag = m[0];
      const path = tag.match(/path="([^"]+)"/);
      if (path && /\bnoIndex\b(?!=)/.test(tag)) out.push(path[1]);
    }
  }
  return out;
}

describe('static sitemaps (family: every file, every URL)', () => {
  const all = Object.entries(HOSTS).flatMap(([site, h]) => h.sitemaps.map((file) => ({ site, file })));

  it('finds the noindex routes it guards against', () => {
    // A parser that finds nothing would make the next test pass vacuously.
    expect(noIndexPaths()).toEqual(expect.arrayContaining(['/login', '/cadastro', '/entrar', '/carrinho', '/checkout']));
  });

  it.each(all)('$file lists only $site.geekpoptoys.com.br, nothing disallowed or noindex', ({ site, file }) => {
    const urls = locs(read(file));
    expect(urls.length).toBeGreaterThan(0);
    const robots = read(HOSTS[site as keyof typeof HOSTS].robots);
    const blocked = disallowed(robots);
    const noindex = noIndexPaths();
    for (const url of urls) {
      const u = new URL(url);
      expect(u.origin, url).toBe(`https://${site}.geekpoptoys.com.br`);
      if (u.pathname.endsWith('.xml')) continue;
      expect(blocked.filter((d) => u.pathname.startsWith(d)), url).toEqual([]);
      expect(noindex, url).not.toContain(u.pathname);
    }
  });

  it('keeps login and signup forms out of every sitemap', () => {
    const paths = all.flatMap(({ file }) => locs(read(file)).map((u) => new URL(u).pathname));
    for (const p of ['/login', '/cadastro', '/entrar', '/', '/atacado/cadastro']) expect(paths).not.toContain(p);
  });
});

// The 417 KB logo-vip.png was shown at 32–80 px on every page. Screens left on
// it on purpose: the contract (a legal document) and the pending-payment screen.
describe('logo weight', () => {
  const KEEP_PNG = ['ContractModal.tsx', 'StepContract.tsx', 'PendingPaymentScreen.tsx'];

  it('uses the webp variants everywhere else', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) && !KEEP_PNG.includes(e.name)) {
          if (/src="\/logo-vip\.png"/.test(readFileSync(p, 'utf-8'))) offenders.push(p);
        }
      }
    };
    walk(resolve(root, 'src'));
    expect(offenders).toEqual([]);
    for (const shell of ['index.html', 'shop.html']) {
      expect(read(shell), shell).not.toMatch(/href="\/logo-vip\.png"|src="\/logo-vip\.png"/);
    }
  });
});

// SeoHead never restores the head on unmount, so a route without a head of its
// own shows the previous page's title, canonical and robots. Family: every
// <Route path> of the club and the shop.
describe('every club and shop route sets its head', () => {
  const app = read('src/App.tsx');
  const pageFile = (name: string) => {
    const m = app.match(new RegExp(`const ${name} = (?:lazy|shopPage)\\(\\(\\) => import\\('\\./([^']+)'\\)\\)`))
      ?? app.match(new RegExp(`import ${name} from '\\./([^']+)'`));
    if (m) return read(`src/${m[1]}.tsx`);
    // Route element defined in App.tsx itself (LegalTerms, LegalPrivacy).
    const at = app.indexOf(`function ${name}()`);
    return at === -1 ? '' : app.slice(at, app.indexOf('\n}\n', at));
  };
  const routesOf = (fn: string) => {
    const start = app.indexOf(`function ${fn}()`);
    const body = app.slice(start, app.indexOf('\nfunction ', start + 1));
    // Each <Route ... path="x" ... /> or <Route ...>...</Route>, comments stripped.
    const clean = body.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    return [...clean.matchAll(/<Route\b[^>]*?path="([^"]+)"([\s\S]*?)(?=<Route\b|<\/Routes>)/g)].map((m) => ({
      path: m[1],
      chunk: m[2],
    }));
  };

  it.each(['MemberRoutes', 'ShopRoutes'])('%s', (fn) => {
    const routes = routesOf(fn);
    expect(routes.length).toBeGreaterThan(8);
    const missing = routes
      .filter(({ chunk }) => !/<NoIndex\b|<SeoHead\b|<Navigate\b|<MemberEntry\b/.test(chunk))
      .filter(({ chunk }) => {
        const page = chunk.match(/<([A-Z]\w+)\b(?![^>]*\bNoIndex)/g)?.map((t) => t.slice(1)).filter((n) => n !== 'ProtectedRoute') ?? [];
        return !page.some((n) => /<SeoHead\b/.test(pageFile(n)));
      })
      .map(({ path }) => path);
    expect(missing).toEqual([]);
  });
});
