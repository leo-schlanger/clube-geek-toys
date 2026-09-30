/**
 * The HTML that link-preview crawlers (WhatsApp, Facebook, Telegram…) get
 * instead of the SPA shell. nginx routes them here by user-agent; search
 * engines are NOT routed here — they render the SPA, which carries the same
 * tags plus the structured data.
 *
 * Layout rules, all of them load-bearing for WhatsApp:
 *  - the tags come first, right after the charset, with no script before them;
 *  - every URL is absolute https;
 *  - no meta refresh — only crawlers see this page, and a refresh pointing at
 *    its own canonical URL is a redirect loop for anyone who does.
 */

export interface ShareMeta {
  /** Canonical URL of the page being previewed. */
  url: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  /** Only when known: WhatsApp renders the large card sooner with them. */
  imageWidth?: number;
  imageHeight?: number;
  type?: 'website' | 'product';
  /** Extra `<meta property>` pairs, e.g. product price. */
  extra?: Array<[property: string, content: string]>;
  jsonLd?: Record<string, unknown>;
  /** Visible body: a heading and a paragraph for whoever opens it by hand. */
  heading?: string;
  linkLabel?: string;
}

export const SITE_NAME = 'Loja GeekPop & Toys';

/** Escapes for use inside an HTML attribute or text node. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Plain text for a description: collapses the line breaks and markdown-ish
 * bullets admins type in the product form, then cuts at a word boundary.
 */
export function toDescription(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

export function renderShareHtml(meta: ShareMeta): string {
  const e = escapeHtml;
  const tags: string[] = [
    `<title>${e(meta.title)}</title>`,
    `<meta name="description" content="${e(meta.description)}" />`,
    `<meta property="og:title" content="${e(meta.title)}" />`,
    `<meta property="og:description" content="${e(meta.description)}" />`,
    `<meta property="og:image" content="${e(meta.image)}" />`,
    `<meta property="og:image:secure_url" content="${e(meta.image)}" />`,
  ];
  if (meta.imageWidth && meta.imageHeight) {
    tags.push(
      `<meta property="og:image:width" content="${meta.imageWidth}" />`,
      `<meta property="og:image:height" content="${meta.imageHeight}" />`
    );
  }
  tags.push(
    `<meta property="og:image:alt" content="${e(meta.imageAlt)}" />`,
    `<meta property="og:url" content="${e(meta.url)}" />`,
    `<meta property="og:type" content="${meta.type ?? 'website'}" />`,
    `<meta property="og:site_name" content="${e(SITE_NAME)}" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    ...(meta.extra ?? []).map(([p, c]) => `<meta property="${e(p)}" content="${e(c)}" />`),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e(meta.title)}" />`,
    `<meta name="twitter:description" content="${e(meta.description)}" />`,
    `<meta name="twitter:image" content="${e(meta.image)}" />`,
    `<link rel="canonical" href="${e(meta.url)}" />`
  );
  if (meta.jsonLd) {
    // `</` inside JSON would close the script tag early.
    const json = JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c');
    tags.push(`<script type="application/ld+json">${json}</script>`);
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
${tags.join('\n')}
</head>
<body>
<h1>${e(meta.heading ?? meta.title)}</h1>
<p>${e(meta.description)}</p>
<img src="${e(meta.image)}" alt="${e(meta.imageAlt)}" />
<p><a href="${e(meta.url)}">${e(meta.linkLabel ?? 'Abrir na loja')}</a></p>
</body>
</html>
`;
}
