/*
 * Boot da SPA — precisa rodar antes da primeira pintura.
 *
 * Vive aqui, e não inline no index.html, porque o CSP das SPAs não tem
 * 'unsafe-inline' em script-src. Hash inline foi descartado: o index.html muda
 * com frequência (16 commits até 15/08/2026) e um hash desatualizado quebraria a
 * página em silêncio. Sendo um arquivo próprio, ele cai no 'self' e ponto.
 *
 * Cache: o nginx tem um `location = /boot.js` com validação curta, senão a regra
 * immutable de 1 ano dos .js congelaria este arquivo (ele não é versionado por
 * hash no nome como os bundles do Vite).
 */
(function () {
  // Anti-FOUC: light é o padrão; dark só se o usuário escolheu.
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
    /* localStorage bloqueado — segue no tema claro */
  }

  // Esconde o loader inicial assim que o DOM está pronto.
  window.addEventListener('DOMContentLoaded', function () {
    var loader = document.getElementById('initial-loader');
    if (loader) {
      setTimeout(function () {
        loader.style.display = 'none';
      }, 100);
    }
  });
})();
