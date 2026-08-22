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
  // Anti-FOUC: light is default; dark only if the user chose it.
  try {
    var k = 'geekpop-theme';
    var t = localStorage.getItem(k) || 'light';
    var dark =
      t === 'dark' ||
      (t === 'system' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {
    /* localStorage blocked — stay on the light theme */
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
