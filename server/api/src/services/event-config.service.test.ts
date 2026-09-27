import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Event flyers and link buttons. What these tests pin:
 *
 *  1. A stored link that is not http(s) never reaches the storefront — it is
 *     rendered as `href`, and `javascript:` would run on click.
 *  2. The flyer cap is enforced in the UPDATE itself, and a refusal says why
 *     (limit vs. missing event).
 *  3. PATCH writes `flyers`/`links` as JSONB, not as a Postgres text array.
 *  4. Duplicating keeps the links but not the art.
 */

const { queryMock, auditMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(async () => {}),
}));

vi.mock('../config/database.js', () => ({ query: queryMock }));
// The Zod schema runs on import and exits the process without real env vars.
vi.mock('../config/env.js', () => ({ env: {} }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));

import {
  addEventFlyer,
  buildEventShareHtml,
  duplicateEvent,
  getEventById,
  isWebUrl,
  updateEvent,
  MAX_EVENT_FLYERS,
} from './event-config.service.js';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evento-geekpop',
    slug: 'evento-geekpop',
    status: 'published',
    title: 'Evento GeekPop',
    short_title: '',
    banner_text: '',
    banner_image_url: 'https://api.geeketoys.com.br/uploads/events/evento-geekpop/banner-1.jpg',
    flyers: [],
    links: [],
    starts_at: new Date('2026-10-11T17:00:00Z'),
    ends_at: new Date('2026-10-11T21:00:00Z'),
    location_name: 'Mar Palace',
    location_address: 'Copacabana',
    location_maps_url: null,
    description: [],
    highlights: [],
    member_perk: null,
    reservations_open: true,
    price_cents: 2200,
    currency_label: 'R$',
    max_per_reservation: null,
    whatsapp_number: '',
    reservation_notes: null,
    created_at: '2026-09-26T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
    ...overrides,
  };
}

/** Answers by SQL fragment, so each test states which query it expects. */
function routeSql(routes: Array<[string, (params: unknown[]) => { rows: unknown[] }]>) {
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    for (const [fragment, reply] of routes) {
      if (sql.includes(fragment)) return reply(params);
    }
    throw new Error(`unexpected SQL: ${sql}`);
  });
}

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockClear();
});

describe('isWebUrl', () => {
  it('accepts http and https only', () => {
    expect(isWebUrl('https://forms.gle/abc')).toBe(true);
    expect(isWebUrl('http://example.com')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('data:text/html,<script>')).toBe(false);
    expect(isWebUrl('forms.gle/abc')).toBe(false);
    expect(isWebUrl(42)).toBe(false);
  });
});

describe('mapping flyers and links', () => {
  it('drops entries that are malformed or not http(s)', async () => {
    routeSql([
      [
        'SELECT * FROM events WHERE id',
        () => ({
          rows: [
            row({
              flyers: [
                { url: 'https://api.geeketoys.com.br/uploads/events/x/flyer-1.jpg' },
                { url: 'javascript:alert(1)' },
                'https://loose-string.example',
                null,
              ],
              links: [
                { label: 'Inscrição da competição', url: 'https://forms.gle/abc' },
                { label: 'Mal', url: 'javascript:alert(1)' },
                { label: '   ', url: 'https://empty-label.example' },
                { url: 'https://no-label.example' },
              ],
            }),
          ],
        }),
      ],
    ]);

    const event = await getEventById('evento-geekpop');

    expect(event?.flyers).toEqual([
      { url: 'https://api.geeketoys.com.br/uploads/events/x/flyer-1.jpg' },
    ]);
    expect(event?.links).toEqual([{ label: 'Inscrição da competição', url: 'https://forms.gle/abc' }]);
  });

  it('treats a missing column as empty lists', async () => {
    routeSql([
      ['SELECT * FROM events WHERE id', () => ({ rows: [row({ flyers: undefined, links: null })] })],
    ]);
    const event = await getEventById('evento-geekpop');
    expect(event?.flyers).toEqual([]);
    expect(event?.links).toEqual([]);
  });
});

describe('addEventFlyer', () => {
  it('appends in a single capped UPDATE', async () => {
    const url = 'https://api.geeketoys.com.br/uploads/events/evento-geekpop/flyer-1.jpg';
    routeSql([['UPDATE events SET flyers = flyers ||', () => ({ rows: [row({ flyers: [{ url }] })] })]]);

    const event = await addEventFlyer('evento-geekpop', url, 'admin-1');

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('jsonb_array_length(flyers) < $3');
    expect(params).toEqual([JSON.stringify([{ url }]), 'evento-geekpop', MAX_EVENT_FLYERS]);
    expect(event.flyers).toEqual([{ url }]);
    expect(auditMock).toHaveBeenCalledWith('event.updated', 'admin-1', {
      eventId: 'evento-geekpop',
      fields: ['flyers'],
    });
  });

  it('refuses with 409 when the event is full', async () => {
    routeSql([
      ['UPDATE events SET flyers = flyers ||', () => ({ rows: [] })],
      ['SELECT * FROM events WHERE id', () => ({ rows: [row()] })],
    ]);
    await expect(addEventFlyer('evento-geekpop', 'https://x.example/a.jpg')).rejects.toMatchObject({
      statusCode: 409,
      code: 'EVENT_FLYER_LIMIT',
    });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('refuses with 404 when the event does not exist', async () => {
    routeSql([
      ['UPDATE events SET flyers = flyers ||', () => ({ rows: [] })],
      ['SELECT * FROM events WHERE id', () => ({ rows: [] })],
    ]);
    await expect(addEventFlyer('nope', 'https://x.example/a.jpg')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('updateEvent', () => {
  it('writes flyers and links as JSONB', async () => {
    const links = [{ label: 'Inscrição', url: 'https://forms.gle/abc' }];
    const flyers = [{ url: 'https://x.example/b.jpg' }];
    routeSql([['UPDATE events SET', () => ({ rows: [row({ links, flyers })] })]]);

    const event = await updateEvent('evento-geekpop', { links, flyers });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('links = $1::jsonb');
    expect(sql).toContain('flyers = $2::jsonb');
    expect(params).toEqual([JSON.stringify(links), JSON.stringify(flyers), 'evento-geekpop']);
    expect(event.links).toEqual(links);
  });
});

describe('duplicateEvent', () => {
  it('keeps the links and drops the art', async () => {
    const links = [{ label: 'Inscrição', url: 'https://forms.gle/abc' }];
    routeSql([
      [
        'SELECT * FROM events WHERE id =',
        () => ({ rows: [row({ links, flyers: [{ url: 'https://x.example/b.jpg' }] })] }),
      ],
      ['SELECT 1 FROM events', () => ({ rows: [] })],
      ['INSERT INTO events', (params) => ({ rows: [row({ id: params[0], flyers: JSON.parse(params[21] as string), links: JSON.parse(params[22] as string) })] })],
    ]);

    const copy = await duplicateEvent('evento-geekpop');

    const insert = queryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO events'));
    expect(insert?.[1][6]).toBeNull(); // banner_image_url
    expect(insert?.[1][21]).toBe('[]');
    expect(insert?.[1][22]).toBe(JSON.stringify(links));
    expect(copy.flyers).toEqual([]);
    expect(copy.links).toEqual(links);
  });
});

describe('buildEventShareHtml', () => {
  // `EventRecord` as the mapper produces it: reuse the row fixture.
  async function record(overrides: Record<string, unknown> = {}) {
    routeSql([['SELECT * FROM events WHERE id', () => ({ rows: [row(overrides)] })]]);
    return (await getEventById('evento-geekpop'))!;
  }

  it('previews the poster, the Rio date and time, and both prices', async () => {
    const event = await record({
      flyers: [{ url: 'https://api.geeketoys.com.br/uploads/events/evento-geekpop/flyer-1.jpg' }],
    });
    const html = buildEventShareHtml(event, 'https://shop.geekpoptoys.com.br/');

    expect(html).toContain('<link rel="canonical" href="https://shop.geekpoptoys.com.br/evento" />');
    expect(html).toContain(
      '<meta property="og:image" content="https://api.geeketoys.com.br/uploads/events/evento-geekpop/banner-1.jpg" />'
    );
    // 17:00Z is 14h in Rio.
    expect(html).toContain('Domingo, 11 de outubro, 14h às 18h');
    expect(html).toContain('Entrada R$ 22 (membros do Clube: R$ 11)');
  });

  it('carries a schema.org Event with the offer', async () => {
    const html = buildEventShareHtml(await record(), 'https://shop.geekpoptoys.com.br');
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]);
    expect(json['@type']).toBe('Event');
    expect(json.startDate).toBe('2026-10-11T17:00:00.000Z');
    expect(json.location.name).toBe('Mar Palace');
    expect(json.offers).toMatchObject({ price: '22.00', priceCurrency: 'BRL' });
    expect(json.image).toHaveLength(1);
  });

  it('escapes the admin text, in attributes and inside the JSON-LD', async () => {
    const html = buildEventShareHtml(
      await record({ title: 'K-pop "night" </script><script>alert(1)</script>' }),
      'https://shop.geekpoptoys.com.br'
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('K-pop &quot;night&quot;');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('falls back to the store image when the event has no art', async () => {
    const html = buildEventShareHtml(
      await record({ banner_image_url: null }),
      'https://shop.geekpoptoys.com.br'
    );
    expect(html).toContain('content="https://shop.geekpoptoys.com.br/og-image.png"');
  });
});
