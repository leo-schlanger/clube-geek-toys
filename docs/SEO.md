# SEO e preview de link — loja (`shop.*`) e clube (`club.*`)

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

## Revisão de 21/11/2026: robots por host, clube em geekpoptoys, Search Console

Feita quando o Leo criou as propriedades no Google Search Console.

- **`robots.txt` era o mesmo em todos os hosts** (shop, club, adm, nos dois
  domínios) e anunciava o sitemap do clube em `club.geeketoys.com.br`. Agora
  cada host tem o seu, como o `sitemap.xml`: `location = /robots.txt` no bloco
  `shop` (`public/robots-shop.txt`, só o índice
  `https://shop.geekpoptoys.com.br/sitemap.xml`) e no bloco `adm`
  (`public/robots-adm.txt`, sem sitemap e **sem Disallow**: o Google precisa
  buscar a página para ver o `X-Robots-Tag: noindex` que o bloco já manda). O
  `club.*` segue no `public/robots.txt`, agora com
  `https://club.geekpoptoys.com.br/sitemap.xml` e `Disallow: /verificar/`
  (a página da carteirinha mostra o nome do membro). Os `location` não têm
  `add_header`, que substituiria os cabeçalhos herdados (HSTS, CSP, o
  `X-Robots-Tag` do painel).
- **Canonical do clube passou para `club.geekpoptoys.com.br`**
  (`CANONICAL_ORIGINS.club`), em linha com a loja. Só SEO: o QR da carteirinha
  continua em `club.geeketoys.com.br` (`MEMBER_VERIFY_ORIGIN`, há carteirinhas e
  prints na rua), e links, API, cookies e e-mail não mudaram.
- **As páginas do clube não tinham `SeoHead`**: toda URL do clube levava o
  canonical do shell (`club.geeketoys.com.br`, sem caminho), ou seja, `/termos`
  e `/privacidade` diziam ao Google que eram cópia da raiz. Agora `/assinar`
  (título e descrição a partir de `CLUB_PLAN` e `club-value`), `/termos` e
  `/privacidade` têm head próprio; login, cadastro, recuperar senha, confirmar
  e-mail, `/pagamento/*`, `/verificar/:id` e `/acesso-negado` são `noindex`
  (`<NoIndex>` em `App.tsx`). Na loja, `/carrinho`, `/entrar` e os formulários
  do atacado também (antes herdavam o canonical da página anterior).
- **Canonical da página de venda é `/assinar`**: `/` só redireciona para lá. O
  `SeoHead`, o sitemap e o JSON-LD dizem o mesmo (o shell não tem canonical:
  ver a rodada 2 abaixo).
- **Sitemap do clube**: só `/assinar`, `/termos` e `/privacidade`, em
  `club.geekpoptoys.com.br`. Saíram `/` (redireciona), `/login` e `/cadastro`
  (formulários, `noindex`).
- **Sitemap da loja**: `sitemap-shop.xml` ficou só com `/atacado`; `/entrar` e
  `/cadastro` saíram. Home, categorias e produtos já vinham do
  `sitemap-products.xml`. Nele, `/evento` só entra com evento no ar (mesma regra
  do `isEventVisible`: publicado e sem ter acabado; sem fim, 1 dia depois do
  início). Com o Halloween de 01/11 já passado, `/evento` redirecionava para a
  home e estava no sitemap. A home ganhou `lastmod` (o produto ou a categoria
  mais recente). Não existe rota `/categorias` nem páginas legais na loja (o `*`
  manda para `/`): as legais vivem no clube.
- **Desempenho**: o `logo-vip.png` (417 KB, 1080 px) era pré-carregado em todo
  shell e mostrado a 32–80 px. Agora shells, cabeçalho da loja e topo do
  `/assinar` usam `logo-vip-160.webp` (4 KB) e as telas de login/cadastro
  `logo-vip-640.webp` (20 KB). O hero do `/assinar` tem `srcset` +
  `fetchpriority="high"`, e a foto principal do produto também tem
  `fetchpriority="high"`. Medido em produção a 390 px (DPR 3, 21/11): LCP do
  `/assinar` = `logo-vip-640.webp` (1,3 s), do produto = a foto principal
  (2,7 s), da home da loja = o `<h1>` (2,2 s); CLS 0 nos três. O PNG original fica para JSON-LD e telas que ninguém
  mexeu (contrato, carteirinha, tela de pagamento pendente).
- **Testes**: `server/api/src/utils/seo-files.test.ts` lê o `default.conf` e os
  arquivos de `public/`: cada host com o seu robots, sem `add_header` no
  `location`, todo `Sitemap:` e todo `<loc>` em `*.geekpoptoys.com.br` do host
  certo, e nenhuma URL de sitemap bloqueada no robots ou `noindex` no código
  (lê os `<NoIndex>` e `<SeoHead … noIndex>` de `src/`).

### Rodada 2 (qa, 21/11/2026)

- **O service worker servia o shell do clube na loja.** O `generateSW` tinha
  `navigateFallback: 'index.html'`: depois de algumas visitas, toda navegação em
  `shop.*` saía do SW com o `<head>` do clube (Product do plano, FAQPage, sem
  Store). O mesmo `sw.js` serve os três hosts, então nenhum shell fixo serve.
  Agora não há fallback fixo e o HTML saiu do precache (o `directoryIndex` do
  precache respondia `/` com `index.html`); navegação é `NetworkFirst` (nginx
  escolhe o shell por host), com a última cópia de cada URL no cache `pages`
  para uso offline (`src/lib/pwa-navigation.ts`, testado em
  `pwa-navigation.test.ts`). `isSafeToReload` e o deploy em duas etapas não
  mudaram.
- **Canonical antes do JS**: o shell tinha um canonical fixo (`/assinar` no
  clube, `/` na loja) e o curl de `/termos`, categoria e produto via esse sinal
  errado até o JS trocar. A opção escolhida foi **tirar o canonical dos dois
  shells**: o `SeoHead` cria a tag em toda rota (o teste por família exige head
  em toda rota) e o Google lê o canonical renderizado. A alternativa, injetar o
  caminho no nginx com `sub_filter` e `$uri`, põe texto do pedido (decodificado)
  dentro do HTML (risco de injeção) e tira o ETag. `og:url` ficou no shell: é
  preview, não ranking.
- **Limites de snippet** (`club-structured-data.test.ts`): títulos ≤ 60 e
  descrições ≤ 155 nos dois shells, na home da loja (`SHOP_DEFAULT_SEO`) e no
  `/assinar` (`clubSeoDescription()` em `club-value.ts`, 153 caracteres com a
  oferta inteira).
- **adm.\***: sem canonical (vinha do shell) e `404` em qualquer
  `/sitemap*.xml` no bloco do painel.
- **JSON-LD do clube** (`Organization`, `Product` do plano, `FAQPage`) saiu do
  `index.html` para o `SeoHead` do `/assinar` (`src/lib/club-structured-data.ts`):
  não aparece mais em `/termos`, `/login` nem no painel. O FAQPage agora é
  gerado das perguntas que a página mostra (o do shell tinha outras).

### Pendências (não feitas, por risco ou por medir antes)

- **Fontes do Google** (`fonts.googleapis.com`) bloqueiam a renderização nos
  dois shells. O truque `media="print" onload` não passa no CSP (sem
  `unsafe-inline`); o caminho é hospedar Outfit/Inter no próprio domínio
  (`@fontsource`) com `preload` do woff2 e fallback métrico.
- **Turnstile** (`challenges.cloudflare.com/turnstile/v0/api.js`) carrega em
  toda página dos dois shells e só serve ao cadastro. Carregar sob demanda no
  `Turnstile.tsx` corta um script de terceiro da home, mas mexe no cadastro do
  clube: fazer com um cadastro real em produção pelo celular.
- **`preconnect` para `api.geeketoys.com.br`** fixo nos shells: em
  `*.geekpoptoys` a SPA fala com `api.geekpoptoys`, então a conexão aberta é
  desperdiçada. Melhor criar o `preconnect` no `boot.js`, que já escolhe a API
  pelo host.
- **CLS do `/atacado` a 390 px**: 0,024 a 0,151 em duas cargas (21/11). A
  etiqueta troca de texto quando `salesOpen` chega e a linha quebra diferente;
  reservar a altura ou pintar o estado certo de primeira.
- **Violação de CSP vinda do chunk do `zod`** (achado do qa em 21/11, não
  investigado aqui).
- **Foto principal do produto** sai no original (até 2560 px); um `srcset` com a
  miniatura de 600 px só ajuda em tela de densidade 1, e o zoom precisa do
  original.
- **Descrição das categorias** no painel continua vazia (ver 06/11): preencher
  melhora título/descrição sem deploy.
- **Search Console**: enviar `https://shop.geekpoptoys.com.br/sitemap.xml` e
  `https://club.geekpoptoys.com.br/sitemap.xml` nas propriedades de cada host
  (ou na de domínio `geekpoptoys.com.br`).

## 404 real em club.* e shop.* (24/11/2026)

Até aqui toda URL desconhecida respondia 200 com o shell da SPA (soft 404). Agora o
nginx tem a lista das rotas da SPA por host (`map $club_spa_route` e
`map $shop_spa_route` em `server/nginx/nginx.conf`): o que não é ficheiro nem rota
responde **404**, com o shell como corpo (`error_page 404 /index.html` ou
`/shop.html`). Na loja a SPA mostra «Página não encontrada» (`src/pages/NotFound.tsx`,
noindex); no clube o `*` continua a levar o membro à área dele e o visitante ao
`/assinar` (só o status mudou). `adm.*` ficou como estava (robots já bloqueia).

- Rota nova no `App.tsx` (clube ou loja) → entra no map. `nginx-spa-routes.test.ts`
  lê os `<Route path>` de `MemberRoutes`/`ShopRoutes` (com e sem barra final) e os
  links que a API manda por e-mail, e reprova se faltar (mutação provada).
- `/produto/<slug>` e `/categoria/<slug>` inexistentes continuam 200 (a existência
  vem da API); o fail2ban não conta 404 (filtra por caminho).

## Regras

- **Rota pública nova da loja**: decida o preview dela no nginx (bloco `shop`) e
  o `SeoHead` dela na SPA. Sem o primeiro, o link sai com o cartão genérico.
- **Nome de robô, não de app**, no `map`: `Telegram` e `Pinterest` sozinhos
  pegavam o navegador embutido dos apps. Use `TelegramBot`, `Pinterestbot`.
- **Busca** (`/?search=`) é `noindex`; página 2+ do catálogo tem canonical
  próprio (`?page=N`); atacado aponta o canonical para o produto de varejo.
- **Canonical do clube é `club.geekpoptoys.com.br`** (21/11/2026) e toda rota
  do clube decide o seu head: `SeoHead` próprio ou `<NoIndex>` em `App.tsx`.
  Arquivo novo de SEO em `public/` (robots, sitemap) precisa de `location =` no
  bloco do host e entra no `seo-files.test.ts`.
- **Canonical é sempre `shop.geekpoptoys.com.br`**, com barra no `/` — igual no
  `SeoHead`, na API e no sitemap (o shell não tem canonical desde 21/11).
- Dado estruturado só com o que a página mostra. Preço ou estoque que discorda
  da tela é risco de ação manual, não ganho.

## Conferir

```bash
# O que o WhatsApp recebe (tags no topo, charset, foto)
curl -s -A 'WhatsApp/2.23.20.0' https://shop.geeketoys.com.br/ | head -20
curl -s -A 'WhatsApp/2.23.20.0' https://shop.geeketoys.com.br/categoria/photocards | head -20

# Sitemaps: índice só no shop.*, clube intacto
curl -s https://shop.geekpoptoys.com.br/sitemap.xml   # <sitemapindex>
curl -s https://club.geekpoptoys.com.br/sitemap.xml   # urlset do clube (3 URLs)

# robots por host: shop → índice da loja; club → sitemap do clube; adm → sem sitemap + X-Robots-Tag
curl -s https://shop.geekpoptoys.com.br/robots.txt | grep Sitemap
curl -s https://club.geekpoptoys.com.br/robots.txt | grep Sitemap
curl -sI https://adm.geekpoptoys.com.br/robots.txt | grep -i x-robots
curl -s https://shop.geekpoptoys.com.br/sitemap-products.xml | grep -c '<image:loc>'

# O que o Google recebe (tem de ser a SPA, não o stub)
curl -s -A 'Googlebot/2.1' https://shop.geeketoys.com.br/produto/<slug> | grep -c 'id="root"'
```

O WhatsApp guarda o preview por dias. Para ver o novo, compartilhe com um
parâmetro qualquer (`/?v=2`). Dados estruturados: [Rich Results Test](https://search.google.com/test/rich-results)
com a URL de um produto.
