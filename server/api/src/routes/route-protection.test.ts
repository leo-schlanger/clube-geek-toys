import { describe, it, expect, vi } from 'vitest';
import type { Router } from 'express';

/**
 * Contrato de proteção das rotas.
 *
 * Todos os furos de autorização do checkup de 23/08 eram do mesmo tipo: a
 * **cadeia de middleware** da rota, não a lógica dentro dela. `POST /email/send`
 * pedia só `authenticate` e disparava qualquer template para qualquer endereço
 * a partir de um domínio verificado; `GET /payments/status/:id` respondia sobre
 * o pagamento de qualquer pessoa.
 *
 * Em vez de subir um servidor, este teste **lê os routers**: para cada endpoint,
 * quais guardas foram declaradas e com quais papéis. É a pergunta que importa —
 * "esta rota está protegida?" — respondida sem rede e sem banco.
 *
 * Uma rota nova sem guarda nenhuma reprova aqui. Se ela for pública de verdade,
 * declare-a em PUBLIC — a lista é a decisão registrada, não um esquecimento.
 */

vi.mock('../middleware/auth.js', () => ({
  authenticate: Object.assign((_q: unknown, _s: unknown, n: () => void) => n(), {
    guard: 'authenticate',
  }),
  optionalAuth: Object.assign((_q: unknown, _s: unknown, n: () => void) => n(), {
    guard: 'optionalAuth',
  }),
  requireRole: (...roles: string[]) =>
    Object.assign((_q: unknown, _s: unknown, n: () => void) => n(), {
      guard: 'requireRole',
      roles,
    }),
}));
// Tagged the same way as the guards, so the contract can also ask "esta porta
// pública está estrangulada?".
vi.mock('../middleware/rate-limit.js', () => {
  const limiter = (name: string) =>
    Object.assign((_q: unknown, _s: unknown, n: () => void) => n(), { limiter: name });
  return {
    defaultLimiter: limiter('default'),
    authLimiter: limiter('auth'),
    publicLookupLimiter: limiter('publicLookup'),
    paymentLimiter: limiter('payment'),
    emailLimiter: limiter('email'),
  };
});

// Binding nativo, e este teste só lê a forma dos routers — nada aqui hasheia.
vi.mock('bcrypt', () => ({
  default: { compare: vi.fn(async () => true), hash: vi.fn(async () => 'x') },
  compare: vi.fn(async () => true),
  hash: vi.fn(async () => 'x'),
}));
vi.mock('../config/database.js', () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  getClient: vi.fn(),
  pool: {},
}));
vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    ADMIN_EMAIL: 'geeketoys@gmail.com',
    FRONTEND_URL: 'https://club.geeketoys.com.br',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
  },
  SHOP_CANONICAL_URL: 'https://shop.geekpoptoys.com.br',
}));

import { paymentRouter } from './payment.routes.js';
import { emailRouter } from './email.routes.js';
import { orderRouter } from './order.routes.js';
import { memberRouter } from './member.routes.js';
import { subscriptionRouter } from './subscription.routes.js';
import { lgpdRouter } from './lgpd.routes.js';
import { userRouter } from './user.routes.js';
import { stockRouter } from './stock.routes.js';
import { settingsRouter } from './settings.routes.js';
import { auditRouter } from './audit.routes.js';
import { logRouter } from './log.routes.js';
import { reportRouter } from './report.routes.js';
import { wholesaleRouter } from './wholesale.routes.js';
import { contractRouter } from './contract.routes.js';
import { authRouter } from './auth.routes.js';
import { productRouter } from './product.routes.js';
import { eventRouter } from './event.routes.js';
import { galleryRouter } from './gallery.routes.js';
import { reviewRouter } from './review.routes.js';
import { questionRouter } from './question.routes.js';
import { profileRouter } from './profile.routes.js';
import { shippingRouter } from './shipping.routes.js';
import { notificationRouter } from './notification.routes.js';
import { webhookRouter } from './webhook.routes.js';
import { healthRouter } from './health.routes.js';

interface Guard {
  guard?: string;
  roles?: string[];
  limiter?: string;
}
interface Endpoint {
  method: string;
  path: string;
  guards: Guard[];
}

/** Every endpoint a router declares, with the guards attached to it. */
function endpointsOf(router: Router, mountedAt: string): Endpoint[] {
  const out: Endpoint[] = [];
  // `router.use(authenticate)` applies to the whole router: it is a stack layer
  // with no `route`, covering everything declared after it.
  const routerWide: Guard[] = [];

  for (const layer of (router as unknown as { stack: Record<string, unknown>[] }).stack) {
    const route = layer.route as
      | { path: string; methods: Record<string, boolean>; stack: { handle?: Guard }[] }
      | undefined;

    if (!route) {
      const handle = layer.handle as Guard | undefined;
      if (handle?.guard || handle?.limiter) routerWide.push(handle);
      continue;
    }

    // `route.stack` holds Express Layers; the tagged function is `layer.handle`.
    const routeGuards = route.stack
      .map((l) => l.handle)
      .filter((h): h is Guard => Boolean(h?.guard || h?.limiter));

    for (const method of Object.keys(route.methods)) {
      out.push({
        method: method.toUpperCase(),
        // `router.get('/')` mounted at `/users` is `/users`, not `/users/`.
        path: `${mountedAt}${route.path}`.replace(/\/$/, '') || mountedAt,
        guards: [...routerWide, ...routeGuards],
      });
    }
  }
  return out;
}

const ROUTERS: [string, Router][] = [
  ['/payments', paymentRouter],
  ['/email', emailRouter],
  ['/orders', orderRouter],
  ['/members', memberRouter],
  ['/subscription', subscriptionRouter],
  ['/lgpd', lgpdRouter],
  ['/users', userRouter],
  ['/stock', stockRouter],
  ['/settings', settingsRouter],
  ['/audit', auditRouter],
  ['/logs', logRouter],
  ['/reports', reportRouter],
  ['/wholesale', wholesaleRouter],
  ['/contracts', contractRouter],
  ['/auth', authRouter],
  ['/products', productRouter],
  ['/events', eventRouter],
  ['/gallery', galleryRouter],
  ['/reviews', reviewRouter],
  ['/questions', questionRouter],
  ['/profile', profileRouter],
  ['/shipping', shippingRouter],
  ['/notifications', notificationRouter],
  ['/webhook', webhookRouter],
  ['/health', healthRouter],
];

const ALL: Endpoint[] = ROUTERS.flatMap(([mount, r]) => endpointsOf(r, mount));

const find = (method: string, path: string) =>
  ALL.find((e) => e.method === method && e.path === path);
const hasAuth = (e: Endpoint) => e.guards.some((g) => g.guard === 'authenticate');
const rolesOf = (e: Endpoint) =>
  e.guards.filter((g) => g.guard === 'requireRole').flatMap((g) => g.roles ?? []);
const throttled = (e: Endpoint) => e.guards.some((g) => g.limiter);

/**
 * Endpoints públicos **de propósito**. Cada um é chaveado por algo inadivinhável
 * ou é a própria porta de entrada.
 */
const PUBLIC = new Set([
  // ── A porta: sem estas, ninguém entra ──
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/google',
  'POST /auth/send-verification-email',
  'POST /auth/verify-email',
  'POST /auth/send-password-reset',
  'POST /auth/reset-password',

  // ── A vitrine: é uma loja, o catálogo é para ser lido ──
  'GET /products',
  'GET /products/:slug',
  'GET /products/:id/variants',
  'GET /products/:slug/related',
  'GET /products/:slug/also-bought',
  'GET /products/:slug/share',
  'GET /products/categories',
  'GET /products/sitemap.xml',
  'GET /reviews/product/:slugOrId',
  'GET /questions/product/:slugOrId',
  'GET /gallery',
  'GET /gallery/:slug',

  // ── Checkout de convidado ──
  'POST /orders',
  'GET /orders/:id/status', // UUID do pedido
  'GET /orders/:id/pix', // UUID do pedido — a recuperação do PIX
  'GET /shipping/cep/:cep',
  'POST /shipping/quote',

  // ── Evento e ingresso: reservar não exige conta, e o QR circula ──
  'GET /events/active',
  'POST /events/:eventId/reservations',
  'GET /events/reservations/:code',
  'GET /events/tickets/:code',
  'POST /events/reservations/:code/payment-link', // reenvia para o e-mail GRAVADO

  // ── Integrações: quem chama não tem como carregar nosso JWT ──
  // Stripe assina o corpo (`constructEvent`); sem `STRIPE_WEBHOOK_SECRET` em
  // produção a rota recusa tudo. A verificação é dentro do handler e este
  // contrato não a enxerga — ver `webhook.service.test.ts`.
  'POST /webhook/stripe',
  'POST /webhook/pagbank', // 410 Gone, transicional
  // O navegador de quem autoriza, sem nossa sessão. Quem autentica é o `state`
  // assinado (`oauth.isValidState`).
  'GET /shipping/melhor-envio/callback',

  // ── Operacional ──
  'GET /health',
  'POST /logs/errors', // erro de front, antes de qualquer login

  // ── Atacado ──
  'GET /wholesale/status',
  'POST /wholesale/register',
  'POST /wholesale/login',

  // ── Clube ──
  'GET /members/verify/:id', // QR da carteirinha, lido pela câmera na porta
  // Devolve só `{exists: boolean}` e passa pelo publicLookupLimiter. É o que
  // permite avisar "CPF já cadastrado" antes de criar a conta; em troca, aceita
  // que dá para sondar se um CPF é membro. Trade-off registrado, não descuido.
  'GET /members/cpf-exists/:cpf',
]);

/**
 * Portas públicas que **não** precisam de throttle, e por quê. Tudo o mais que
 * é público tem de estar estrangulado.
 */
const PUBLIC_WITHOUT_THROTTLE = new Set([
  'GET /health', // é o que o deploy consulta em laço
  'POST /webhook/stripe', // o Stripe reentrega; limitar aqui perde pagamento
  'POST /webhook/pagbank', // 410 fixo
  'GET /shipping/melhor-envio/callback', // protegido pelo state assinado

  // Leitura de catálogo. Uma única página da loja dispara produto + categorias
  // + relacionados + também-compraram; o `publicLookupLimiter` é 15/min e
  // quebraria a navegação normal antes de incomodar um scraper. São dados
  // públicos por definição, e o nginx os serve com cache.
  'GET /products',
  'GET /products/:slug',
  'GET /products/:id/variants',
  'GET /products/:slug/related',
  'GET /products/:slug/also-bought',
  'GET /products/:slug/share',
  'GET /products/categories',
  'GET /products/sitemap.xml',
  'GET /events/active', // Cache-Control de 60s
  'GET /wholesale/status', // devolve um booleano
]);

describe('contrato de proteção das rotas', () => {

  it('encontrou os routers (o teste não passa por estar vazio)', () => {
    expect(ALL.length).toBeGreaterThan(40);
  });

  it('toda rota ou tem guarda, ou está declarada como pública', () => {
    const naked = ALL.filter((e) => !hasAuth(e) && !PUBLIC.has(`${e.method} ${e.path}`)).map(
      (e) => `${e.method} ${e.path}`
    );
    expect(naked).toEqual([]);
  });

  /**
   * A regressão: pedia login e nada mais, aceitando qualquer template e
   * qualquer destinatário a partir de `contato@geeketoys.com.br`.
   */
  it('as rotas de e-mail exigem staff, não apenas login', () => {
    const send = find('POST', '/email/send');
    expect(send).toBeDefined();
    expect(hasAuth(send!)).toBe(true);
    expect(rolesOf(send!)).toContain('admin');

    const templates = find('GET', '/email/templates');
    expect(rolesOf(templates!)).toContain('admin');
  });

  it('`/email/send-contract` segue aberta ao membro (o destinatário é travado no service)', () => {
    const e = find('POST', '/email/send-contract');
    expect(hasAuth(e!)).toBe(true);
    expect(rolesOf(e!)).toEqual([]);
  });

  /**
   * Por prefixo, não por lista fixa: uma rota nova dentro de um painel de admin
   * entra na verificação sozinha, em vez de nascer fora dela.
   */
  it.each(['/users', '/audit', '/settings', '/stock', '/reports'])(
    'tudo sob %s é só para admin',
    (prefix) => {
      const found = ALL.filter((e) => e.path.startsWith(prefix));
      expect(found.length, `nenhuma rota sob ${prefix}`).toBeGreaterThan(0);
      for (const e of found) {
        expect(hasAuth(e), `${e.method} ${e.path}`).toBe(true);
        expect(rolesOf(e), `${e.method} ${e.path}`).toContain('admin');
      }
    }
  );

  /**
   * O catálogo do painel devolve produtos **inativos** — é para isso que ele
   * existe, já que a lista pública é fixada em `active = TRUE` e sumia com o
   * produto salvo desmarcado. Justamente por isso não pode escorregar para
   * público: seria o rascunho da loja aberto na rua.
   */
  it('o catálogo do painel, que mostra inativos, é só de admin', () => {
    const e = find('GET', '/products/admin/catalog');
    expect(e, 'rota do catálogo do painel não encontrada').toBeDefined();
    expect(hasAuth(e!)).toBe(true);
    expect(rolesOf(e!)).toContain('admin');
  });

  it('a listagem de pedidos do admin não é a mesma coisa que a do cliente', () => {
    expect(rolesOf(find('GET', '/orders')!)).toContain('admin');
    // A lista do cliente deriva o id do JWT, nunca da URL.
    const mine = find('GET', '/orders/me');
    expect(hasAuth(mine!)).toBe(true);
    expect(rolesOf(mine!)).toEqual([]);
  });

  it('exportar e apagar dados pessoais exige login', () => {
    const lgpd = ALL.filter((x) => x.path.startsWith('/lgpd'));
    expect(lgpd.length).toBeGreaterThan(0);
    for (const e of lgpd) expect(hasAuth(e), e.path).toBe(true);
  });

  it('as rotas sem guarda são exatamente as declaradas', () => {
    const actualPublic = ALL.filter((e) => !hasAuth(e)).map((e) => `${e.method} ${e.path}`);
    for (const p of actualPublic) {
      expect(PUBLIC.has(p), `rota pública não declarada: ${p}`).toBe(true);
    }
  });

  /**
   * Routers que misturam vitrine pública e gestão de conteúdo. A varredura por
   * prefixo acima não os alcança (a leitura é pública de propósito), então a
   * regra aqui é outra: **escrever é de admin**. Sem isto, tirar o
   * `requireRole` de um endpoint de produto passava sem ninguém notar.
   */
  it.each([
    ['/products', new Set<string>()],
    ['/gallery', new Set<string>()],
    ['/reviews', new Set(['POST /reviews/me/order/:orderId'])],
    [
      '/events',
      new Set(['POST /events/:eventId/reservations', 'POST /events/reservations/:code/payment-link']),
    ],
  ])('escrever sob %s é de admin', (prefix, exceptions) => {
    const writes = ALL.filter(
      (e) =>
        e.path.startsWith(prefix as string) &&
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(e.method) &&
        !(exceptions as Set<string>).has(`${e.method} ${e.path}`)
    );
    expect(writes.length, `nenhuma escrita sob ${prefix}`).toBeGreaterThan(0);
    for (const e of writes) {
      expect(rolesOf(e), `${e.method} ${e.path}`).toContain('admin');
    }
  });

  /**
   * Uma porta aberta sem limitador é força bruta de graça: senha, enumeração de
   * e-mail, bomba de e-mail de verificação.
   */
  it('toda rota pública está estrangulada, salvo as declaradas', () => {
    const open = ALL.filter(
      (e) =>
        !hasAuth(e) &&
        !throttled(e) &&
        !PUBLIC_WITHOUT_THROTTLE.has(`${e.method} ${e.path}`)
    ).map((e) => `${e.method} ${e.path}`);
    expect(open).toEqual([]);
  });

  it('login e recuperação de senha têm limitador', () => {
    for (const path of ['/auth/login', '/auth/send-password-reset', '/auth/reset-password']) {
      const e = find('POST', path);
      expect(e, path).toBeDefined();
      expect(throttled(e!), path).toBe(true);
    }
  });

  it('nenhuma entrada da lista de públicas ficou obsoleta', () => {
    // Mantém a allowlist honesta: rota que ganhou guarda, ou que sumiu, tem de
    // sair da lista em vez de alargá-la em silêncio.
    for (const entry of PUBLIC) {
      const [method, path] = entry.split(' ');
      const e = find(method as string, path as string);
      expect(e, `entrada obsoleta em PUBLIC: ${entry}`).toBeDefined();
      expect(hasAuth(e!), `${entry} ganhou guarda; tire de PUBLIC`).toBe(false);
    }
  });
});
