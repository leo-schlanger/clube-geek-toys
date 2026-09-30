import { describe, it, expect } from 'vitest';
import { renderShareHtml, toDescription } from './share-html.js';

const base = {
  url: 'https://shop.geekpoptoys.com.br/produto/x',
  title: 'Álbum "BTS" <Proof>',
  description: 'R$ 10,00 · algo',
  image: 'https://api.geeketoys.com.br/uploads/x.jpg',
  imageAlt: 'x',
};

describe('renderShareHtml', () => {
  // WhatsApp reads only the start of the page: the card lives or dies on the
  // tags coming right after the charset, before anything else.
  it('puts the tags first, with no script or refresh before them', () => {
    const html = renderShareHtml(base);
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head.indexOf('<meta charset="UTF-8" />')).toBeLessThan(head.indexOf('og:image'));
    expect(head.indexOf('og:image')).toBeLessThan(600);
    expect(html).not.toContain('http-equiv="refresh"');
    expect(head).not.toContain('<script src');
  });

  it('escapes admin text in attributes and in the JSON-LD', () => {
    const html = renderShareHtml({ ...base, jsonLd: { name: '</script><script>alert(1)</script>' } });
    expect(html).toContain('content="Álbum &quot;BTS&quot; &lt;Proof&gt;"');
    expect(html).not.toContain('<script>alert(1)');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('declares the image size only when it is known', () => {
    expect(renderShareHtml(base)).not.toContain('og:image:width');
    expect(renderShareHtml({ ...base, imageWidth: 1200, imageHeight: 630 })).toContain(
      '<meta property="og:image:width" content="1200" />'
    );
  });
});

describe('toDescription', () => {
  it('flattens line breaks and cuts at a word', () => {
    expect(toDescription('Linha um\n\n- item')).toBe('Linha um - item');
    const long = toDescription('palavra '.repeat(40), 50);
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long.endsWith('palavra…')).toBe(true);
  });
});
