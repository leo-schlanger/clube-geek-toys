# SEO e preview de link — loja (`shop.*`)

Revisão de 30/09/2026. A loja é uma SPA; quem lê a página sem rodar JavaScript
não vê nada do que o React escreve. São três leitores diferentes, e cada um
tem o seu caminho:

| Quem                                                                                          | O que recebe                                     | Onde                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Preview de link** (WhatsApp, Instagram/Facebook, iMessage, Telegram, X, Discord, LinkedIn…) | HTML curto da API, com as tags da página no topo | nginx `$is_link_crawler` → `/products/share`, `/products/categories/:slug/share`, `/products/:slug/share`, `/events/active/share` |
| **Buscador** (Googlebot, bingbot, Applebot)                                                   | a SPA, que ele renderiza                         | `SeoHead` + `src/lib/structured-data.ts`                                                                                          |
| **Pessoa**                                                                                    | a SPA                                            | idem                                                                                                                              |

## O achado: link da loja sem preview no WhatsApp

`shop.geeketoys.com.br` colado no WhatsApp saía como link cru. No log, o
WhatsApp buscava `/` quatro vezes e **nunca** pedia a `og-image.png`; no link de
produto, pedia o HTML e logo depois a foto. As tags existiam nos dois — o que
mudava era o formato:

- o stub de produto (API) tinha `charset=utf-8` no cabeçalho e as tags nos
  primeiros bytes;
- o `shop.html` saía como `text/html` sem charset, com um comentário longo e um
  `<script>` antes, e a `og:image` só no byte ~3.300.

O leitor do WhatsApp lê só o começo da página e desiste cedo. A correção segue o
formato que já funcionava: **toda rota pública da loja** manda esses robôs para
um HTML da API (`server/api/src/utils/share-html.ts`), com as tags logo depois
do charset. Os shells `shop.html` e `index.html` também foram reordenados (tags
de compartilhamento primeiro, script e comentários depois) e o nginx passou a
mandar `charset utf-8`, para quem não estiver na lista de robôs.

Não mova nada para cima das tags de compartilhamento nos shells.

## O segundo achado: o Google recebia o stub

O mapa de robôs incluía **Googlebot, bingbot e Applebot**. Para produto e
evento, o Google recebia a página-stub — título, descrição e um link — com
`<meta http-equiv="refresh" content="0; url=...">` apontando para a **própria**
URL canônica. Na renderização do Google isso é um loop de recarga numa página
rasa, sem o JSON-LD de produto.

Agora buscadores ficam fora do mapa e recebem a SPA. Os dados estruturados
saíram do stub e passaram para o front:

- `Product` com `Offer` (ou `AggregateOffer` para produto com variação), estoque
  vendável, `aggregateRating` quando há avaliação e o `Store` do `shop.html`
  como vendedor (`@id` `…/#store`). Produto sem preço vendável não emite nada.
- `Event` na `/evento` (não no fallback embutido, que é sempre evento passado).
- `BreadcrumbList` em produto, categoria e evento.

O stub não tem mais meta refresh: só robô de preview chega nele, e o refresh
para a própria URL prendia quem chegasse por engano.

## Regras

- **Rota pública nova da loja**: decida o preview dela no nginx (bloco `shop`) e
  o `SeoHead` dela na SPA. Sem o primeiro, o link sai com o cartão genérico.
- **Nome de robô, não de app**, no `map`: `Telegram` e `Pinterest` sozinhos
  pegavam o navegador embutido dos apps. Use `TelegramBot`, `Pinterestbot`.
- **Busca** (`/?search=`) é `noindex`; página 2+ do catálogo tem canonical
  próprio (`?page=N`); atacado aponta o canonical para o produto de varejo.
- **Canonical é sempre `shop.geekpoptoys.com.br`**, com barra no `/` — igual no
  shell, no `SeoHead`, na API e no sitemap.
- Dado estruturado só com o que a página mostra. Preço ou estoque que discorda
  da tela é risco de ação manual, não ganho.

## Conferir

```bash
# O que o WhatsApp recebe (tags no topo, charset, foto)
curl -s -A 'WhatsApp/2.23.20.0' https://shop.geeketoys.com.br/ | head -20
curl -s -A 'WhatsApp/2.23.20.0' https://shop.geeketoys.com.br/categoria/photocards | head -20

# O que o Google recebe (tem de ser a SPA, não o stub)
curl -s -A 'Googlebot/2.1' https://shop.geeketoys.com.br/produto/<slug> | grep -c 'id="root"'
```

O WhatsApp guarda o preview por dias. Para ver o novo, compartilhe com um
parâmetro qualquer (`/?v=2`). Dados estruturados: [Rich Results Test](https://search.google.com/test/rich-results)
com a URL de um produto.
