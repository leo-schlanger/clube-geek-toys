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

## Revisão de 06/11/2026: sitemap, categorias, fotos e loja física

- **`/sitemap.xml` no `shop.*` devolvia o sitemap do clube** (6 URLs `club.*`):
  o arquivo `public/sitemap.xml` é do clube, e a raiz é a mesma nos dois hosts.
  Agora o bloco `shop` do nginx tem `location = /sitemap.xml`, que serve
  `public/sitemap-index-shop.xml` — um índice com `sitemap-shop.xml` (estáticas)
  e `sitemap-products.xml` (API). No `club.*` nada mudou.
- **`sitemap-products.xml`** (`utils/sitemap-xml.ts`): cada produto leva as suas
  fotos em `<image:image>` (as do produto e as das variações ativas, sem repetir),
  e o `lastmod` acompanha a variação mais recente. Categoria só entra se lista
  algum produto ativo (inclui as subcategorias, como a listagem), com `lastmod`
  do produto mais novo dela.
- **Página de categoria** (`/categoria/:slug`): título próprio (página 2+ diz
  "— página N"), `H1`, parágrafo de introdução visível e description a partir
  dele (`lib/shop-seo-text.ts`: a descrição do painel quando existe; senão uma
  frase com o nome da categoria e os fatos da loja), `BreadcrumbList` +
  `CollectionPage` com o `ItemList` dos produtos da página. Categoria vazia ou
  inexistente é `noindex`. Em 06/11/2026 nenhuma categoria tinha descrição no
  painel: preencher melhora a página na hora, sem deploy.
- **Preço do `Offer` = preço da tela**: a loja mostra a promoção online
  ("−5% no site") e o checkout cobra esse valor, mas o `Product` declarava o
  preço de tabela (R$ 7.500 no JSON-LD, R$ 7.125 na página). Agora
  `productJsonLd` recebe a promoção e aplica `applyShopPromo`, o mesmo cálculo
  do cartão; enquanto a promoção carrega, o bloco não é emitido.
- **Preço de 1 unidade = conta do checkout** (qa, 06/11/2026): `applyShopPromo`
  arredondava o preço unitário (199,90 × 0,95 = 189,91) e o checkout cobra
  subtotal − desconto arredondado (189,90). Agora `applyShopPromo` usa
  `resolveShopDiscount` com qty 1, e card, página e `Offer` saem dele. O teste
  cobre os preços ,90 da loja.
- **Produto inexistente é `noindex`**: a SPA responde 200 com "Produto não
  encontrado", que o Google trata como soft 404.
- **Site institucional no `sameAs`**: `https://geekpoptoys.com.br` (Leo,
  06/11/2026). Os hosts `geeketoys` (API, club, adm, e-mail) seguem em uso.
- **Alt das fotos de produto**: nome + variação escolhida + posição na galeria
  ("Moletom BTS — Rosa / M — foto 2 de 5"), também nas miniaturas de variação.
- **`Store` do `shop.html`**: telefone, horário, `geo`, mapa e `sameAs`
  (Instagram, Facebook `geeketoyscolection`, TikTok, site). O Facebook
  `/geeketoys` que estava lá não é a página da loja. Os fatos vivem em
  `STORE_LOCATION` (`src/lib/company.ts`) e um teste confere o bloco estático
  contra eles. **Fonte da verdade: o Perfil da Empresa no Google** (Leo,
  06/11/2026): telefone +55 21 98546-4666, geo -22.9652592, -43.1800191,
  seg–sex 09h–19h e sáb 09h–16h (horário do Rio). O texto da retirada
  (`STORE_PICKUP.hours` no front e `STORE_PICKUP_LOCATION.hours` na API, que
  vai no e-mail de retirada) diz o mesmo, e o teste trava os três juntos. O
  WhatsApp (11) do rodapé é o atendimento online, não o telefone da loja.
- **Páginas por grupo/artista** (BTS, Stray Kids…): não há campo de artista no
  produto, só o nome ("Black Pink" e "Blackpink" convivem). Página por artista
  só com dado limpo: subcategoria por grupo no painel (a listagem já junta a
  subcategoria na categoria-mãe) — aí cada grupo ganha URL, sitemap e
  `CollectionPage` sem código novo.

## CLS da home da loja (13/11/2026)

O qa mediu CLS mediano de 0,70 a 390 px (16 cargas, sem tema sazonal) e 0,155 a
1280 px. O `PerformanceObserver` (fontes de `layout-shift`) apontou duas causas,
ambas por dados que chegavam depois da primeira pintura:

1. A faixa de promoção (`/promo`) entrava acima do header e empurrava a página
   inteira 56 px (36 px no desktop). A de evento (`/events/active`) faz o mesmo
   quando há evento.
2. Os **Destaques** (`/products?featured=true`) e as categorias apareciam acima
   do "Vale a pena ser membro?" e o empurravam para fora da tela. O esqueleto
   das categorias também tinha 2 px a mais que a linha carregada.

Correção: o `public/boot.js` (já síncrono no `<head>`) pede `/promo`,
`/events/active`, as categorias e os destaques enquanto o bundle baixa, só no
host `shop.*`. As páginas da loja (`shopPage()` em `App.tsx`) esperam essas
respostas **no máximo 400 ms** depois do pedido do chunk, e
`seedQueriesFromBoot()` põe promo e evento no cache do react-query, então as
faixas e os destaques já entram na primeira pintura. A espera só custa algo
quando a API demora mais do que o chunk. A resposta do boot vale 60 s e falha
cai no fluxo normal (`src/lib/boot-data.ts`). O clube não tem essas faixas (CLS
0 no /assinar).

Regra: conteúdo que entra **acima** de algo já pintado precisa estar na primeira
pintura (boot, cache) ou ter a altura reservada. Esqueleto tem a altura exata do
conteúdo carregado.

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

# Sitemaps: índice só no shop.*, clube intacto
curl -s https://shop.geekpoptoys.com.br/sitemap.xml   # <sitemapindex>
curl -s https://club.geeketoys.com.br/sitemap.xml     # urlset do clube
curl -s https://shop.geekpoptoys.com.br/sitemap-products.xml | grep -c '<image:loc>'

# O que o Google recebe (tem de ser a SPA, não o stub)
curl -s -A 'Googlebot/2.1' https://shop.geeketoys.com.br/produto/<slug> | grep -c 'id="root"'
```

O WhatsApp guarda o preview por dias. Para ver o novo, compartilhe com um
parâmetro qualquer (`/?v=2`). Dados estruturados: [Rich Results Test](https://search.google.com/test/rich-results)
com a URL de um produto.
