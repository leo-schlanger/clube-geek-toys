/*
 * SPA boot — must run before first paint.
 *
 * Lives here, not inline in index.html: SPA CSP has no 'unsafe-inline' in
 * script-src. An inline hash was dropped — index.html changes often (16
 * commits by 15/08/2026) and a stale hash would blank the page. As its own
 * file it matches 'self'.
 *
 * Cache: nginx `location = /boot.js` uses a short revalidation; otherwise
 * the 1-year immutable .js rule would freeze this file (it is not hashed
 * like Vite bundles).
 */
(function () {
  // Anti-FOUC: default is 'system' (follows the OS), same as the home site.
  try {
    var k = 'geekpop-theme';
    var t = localStorage.getItem(k) || 'system';
    var dark =
      t === 'dark' ||
      (t === 'system' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      // read by the inline #initial-loader, which paints before any CSS loads
      root.style.setProperty('--boot-bg', '#111118');
      root.style.setProperty('--boot-pink', '#F25A8C');
    }
    root.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {
    /* localStorage blocked: fall back to the OS preference */
    try {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        var r = document.documentElement;
        r.classList.add('dark');
        r.style.setProperty('--boot-bg', '#111118');
        r.style.setProperty('--boot-pink', '#F25A8C');
        r.style.colorScheme = 'dark';
      }
    } catch (e2) {
      /* ignore */
    }
  }

  // Shop: ask the API for what the first screen depends on (promo strip,
  // event strip, home highlights) while the bundle downloads. Answers that
  // arrive after first paint used to push the page down (CLS ~0.2-0.7 at
  // 390 px). Read by src/lib/boot-data.ts; the app falls back to its own call.
  try {
    var host = location.hostname;
    var api = /geekpoptoys\.com\.br$/.test(host)
      ? 'https://api.geekpoptoys.com.br'
      : /geeketoys\.com\.br$/.test(host)
        ? 'https://api.geeketoys.com.br'
        : '';
    if (api && /^shop\./.test(host) && window.fetch) {
      var paths = ['/promo', '/events/active'];
      if (location.pathname === '/' || /^\/categoria\//.test(location.pathname)) {
        paths.push('/products/categories');
      }
      if (location.pathname === '/') paths.push('/products?featured=true&limit=8');
      var boot = {};
      for (var i = 0; i < paths.length; i++) {
        boot[paths[i]] = fetch(api + paths[i], { credentials: 'omit' })
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          ['catch'](function () {
            return null;
          });
      }
      window.__geekpopBoot = boot;
    }
  } catch (e3) {
    /* the app fetches on its own */
  }

  window.addEventListener('DOMContentLoaded', function () {
    var loader = document.getElementById('initial-loader');
    if (loader) {
      setTimeout(function () {
        loader.style.display = 'none';
      }, 100);
    }
  });
})();
