import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Contrato dos e-mails: cada template tem de levar ao painel de **quem o
 * recebe**.
 *
 * A diretoria recebeu o aviso de uma reserva de ingresso, clicou no botão e
 * caiu em `club.geeketoys.com.br/admin` — rota que não existe na SPA de membro,
 * cujo catch-all a jogou em `/assinar`, a página de assinatura. Ela relatou que
 * "não estava encontrando o cliente". O link era montado inline em cada service
 * como `FRONTEND_URL.replace('club.', 'admin.')`, e aquele ponto simplesmente
 * não tinha o replace.
 *
 * Três SPAs saem do mesmo bundle e são separadas por subdomínio, então um link
 * no host errado não dá 404: devolve 200 e redireciona para o lugar errado.
 * Nada quebra visivelmente — só o destinatário não acha o que veio ver.
 */

const { queryMock, fetchMock } = vi.hoisted(() => ({
  queryMock: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  // `sendTemplateEmail` checa `response.ok` e lança se for falso.
  fetchMock: vi.fn(async () => ({ ok: true, json: async () => ({ id: 'resend_1' }) })),
}));

vi.mock('../config/database.js', () => ({ query: queryMock }));

// O `env` NÃO é mockado de propósito: assim o teste exercita o `adminUrl` real,
// que é justamente a peça que estava errada. `vi.hoisted` roda antes dos
// imports, então o schema Zod encontra tudo o que exige.
vi.hoisted(() => {
  const secret = 'x'.repeat(40);
  Object.assign(process.env, {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
    JWT_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    HMAC_SECRET: secret,
    STRIPE_SECRET_KEY: 'sk_test_x',
    RESEND_API_KEY: 're_test',
    FROM_EMAIL: 'contato@geeketoys.com.br',
    FRONTEND_URL: 'https://club.geeketoys.com.br',
    API_URL: 'https://api.geeketoys.com.br',
    ADMIN_EMAIL: 'geeketoys@gmail.com',
    NODE_ENV: 'test',
  });
});

import { sendTemplateEmail, getAvailableTemplates } from './email.service.js';

/** The HTML Resend was handed for the last send. */
async function render(template: string, variables: Record<string, string> = {}) {
  fetchMock.mockClear();
  await sendTemplateEmail({ template, to: 'destino@example.com', variables });
  const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
  return body as { subject: string; html: string };
}

/** Hosts the CTA button points at. */
function ctaHosts(html: string): string[] {
  // The CTA is the only anchor with the gradient background; the footer links
  // are matched separately where they matter.
  return [...html.matchAll(/<a href="([^"]+)"[^>]*background:linear-gradient/g)].map((m) =>
    new URL(m[1] as string).host
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

// ─── Audiences ───────────────────────────────────────────────────────────────

/** Templates addressed to `env.ADMIN_EMAIL`, from the call sites in services. */
const ADMIN_TEMPLATES = [
  'admin-new-member',
  'admin-pix-order-pending',
  'admin-order-cancelled',
  'admin-daily-digest',
  'admin-event-reservation',
  // Um template para todo evento de pagamento (recebido, recusado, estornado,
  // chargeback). O CTA é sempre o painel — mesma regra dos outros.
  'admin-payment-event',
];

/** Templates addressed to a shop customer. */
const SHOP_TEMPLATES = [
  'order-confirmed',
  'order-pending-pix',
  'order-ready-for-pickup',
  'question-answered',
];

/** Templates addressed to a club member. */
const MEMBER_TEMPLATES = [
  'welcome',
  'payment-confirmed',
  'payment-failed',
  'renewal-reminder',
  'subscription-created',
  'subscription-payment',
  'subscription-paused',
  'subscription-resumed',
  'subscription-cancelled',
  'subscription-payment-failed',
  'member-expired',
];

/**
 * `admin-order-disputed` sai desta lista de propósito: contestação se responde
 * no painel da operadora, com prazo, não no nosso. O botão leva para lá — e
 * mudou de host junto com a migração para a Pagar.me.
 */
const ADMIN_TEMPLATE_TO_PROVIDER = 'admin-order-disputed';

describe('para onde cada e-mail leva', () => {
  it('o aviso de chargeback leva ao painel da Pagar.me, onde se contesta', async () => {
    const { html } = await render(ADMIN_TEMPLATE_TO_PROVIDER);
    expect(ctaHosts(html)).toEqual(['dash.pagar.me']);
  });

  it.each(ADMIN_TEMPLATES)('%s leva ao painel admin', async (template) => {
    const { html } = await render(template);
    const hosts = ctaHosts(html);
    expect(hosts.length, 'sem botão de ação').toBeGreaterThan(0);
    for (const host of hosts) {
      // `adm` é o canônico; `admin.*` responde, mas só via 301.
      expect(host, `${template} → ${host}`).toBe('adm.geeketoys.com.br');
    }
  });

  it.each(ADMIN_TEMPLATES)('%s nunca aponta para a SPA de membro', async (template) => {
    const { html } = await render(template);
    for (const host of ctaHosts(html)) {
      expect(host, template).not.toContain('club.');
    }
  });

  it.each(SHOP_TEMPLATES)('%s leva à loja', async (template) => {
    const { html } = await render(template, { order_id: 'order-1', product_url: 'https://shop.geeketoys.com.br/produto/x' });
    for (const host of ctaHosts(html)) {
      expect(host, `${template} → ${host}`).toContain('shop.');
    }
  });

  it.each(MEMBER_TEMPLATES)('%s leva à área do membro', async (template) => {
    const { html } = await render(template);
    const hosts = ctaHosts(html);
    if (hosts.length === 0) return; // nem todo aviso ao membro tem botão
    for (const host of hosts) {
      expect(host, `${template} → ${host}`).toBe('club.geeketoys.com.br');
    }
  });

  /**
   * O aviso da reserva de ingresso: o caso concreto que motivou este arquivo.
   */
  it('o template respeita o admin_url que o service manda', async () => {
    const { html } = await render('admin-event-reservation', {
      buyer_name: 'Janaina',
      admin_url: 'https://adm.geeketoys.com.br/admin?tab=events',
    });
    const cta = [...html.matchAll(/<a href="([^"]+)"[^>]*background:linear-gradient/g)][0]![1] as string;
    expect(cta).toBe('https://adm.geeketoys.com.br/admin?tab=events');
  });
});

describe('integridade dos templates', () => {
  /** Nome inexistente renderiza "Template: xyz" e isso sairia para o cliente. */
  it('todo template anunciado por getAvailableTemplates existe de verdade', async () => {
    for (const template of getAvailableTemplates()) {
      const { html } = await render(template);
      expect(html, template).not.toContain(`<p>Template: ${template}</p>`);
    }
  });

  it('nenhum template deixa uma variável não preenchida escapar como `undefined`', async () => {
    for (const template of getAvailableTemplates()) {
      const { subject, html } = await render(template);
      expect(subject, template).not.toContain('undefined');
      expect(html, template).not.toContain('undefined');
    }
  });

  it('todo e-mail sai do remetente verificado', async () => {
    await render('welcome');
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(body.from).toBe('contato@geeketoys.com.br');
  });

  it('as variáveis são escapadas: nada de HTML vindo do cadastro', async () => {
    const { html } = await render('welcome', { name: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});
