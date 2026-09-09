# Loja — Pedidos, frete e pós-compra

Documentação operacional da evolução da loja (`shop.geeketoys.com.br`) após o pedido da Laura (ago/2026).

## O que foi entregue

| Feature              | Como funciona                                                                       |
| -------------------- | ----------------------------------------------------------------------------------- |
| **Frete por CEP**    | Checkout: ViaCEP preenche endereço; `POST /shipping/quote` cota frete               |
| **Retirada na loja** | Checkout: escolher "Retirar na loja" — sem endereço, sem cotação, frete R$ 0        |
| **Provedor**         | Melhor Envio se `MELHOR_ENVIO_TOKEN` setado; senão **tabela fallback** PAC/SEDEX    |
| **Total**            | `subtotal − desconto + shipping` (server-side; frete sem desconto)                  |
| **Atacado B2B**      | Aba `/atacado`, CNPJ, 25% (`wholesale_25`) — ver [`WHOLESALE.md`](WHOLESALE.md)     |
| **Promoção do site** | Desconto do canal online, configurável em Configurações — ver _Descontos_ abaixo    |
| **Cupons**           | Códigos com validade, limite de usos e mínimo — aba **Cupons** no admin             |
| **Cotação segura**   | `quoteToken` HMAC (TTL ~25 min); revalidado no create order                         |
| **Minhas compras**   | `/minhas-compras` com abas marketplace (requer login + `member_id`)                 |
| **Rastreio**         | Admin cola código → `PATCH /orders/:id/tracking` → status `shipped` + link Correios |
| **Related**          | `GET /products/:slug/related` — mesma categoria, depois featured                    |
| **Trust**            | Badges PIX / Visa / Master / Elo + “Envio Correios”                                 |

## Env (API)

```bash
# Opcional — sem token a loja usa frete estimado por tabela
MELHOR_ENVIO_TOKEN=
MELHOR_ENVIO_SANDBOX=true   # true = sandbox.melhorenvio.com.br
SHIPPING_ORIGIN_CEP=22011001  # Copacabana (default)
```

Origem de frete: loja física CEP **22011-001**.

## Fluxo admin (enviar pedido)

1. Cliente paga → status `paid` (webhook da Pagar.me; PIX e cartão confirmam sozinhos)
2. Separar → `processing`
3. Postar nos Correios → colar código de rastreio no modal do pedido → salva e marca `shipped`
4. Cliente vê em **Minhas compras → A caminho** com link dos Correios
5. Marcar `delivered` quando confirmar entrega (manual)

## Retirada na loja (`delivery_method = 'pickup'`)

O cliente escolhe **Retirar na loja** no checkout: o endereço de entrega e o
bloco de frete somem da tela e o pedido sai com `shipping_cost = 0`. O preço da
retirada é decidido **no servidor**, nunca a partir do `quoteToken` — um token
que o cliente pudesse trocar não pode ser o que zera um frete real.

O endereço do balcão (`STORE_PICKUP_LOCATION` em `shipping.service.ts`) é
gravado em `shipping_address` no momento do pedido, então um pedido antigo
continua mostrando o balcão para o qual foi feito.

**Fluxo admin:** os status do banco são os mesmos do envio, com outra leitura:

| Status       | Envio      | Retirada                 |
| ------------ | ---------- | ------------------------ |
| `processing` | Preparando | Separando                |
| `shipped`    | A caminho  | **Pronto para retirada** |
| `delivered`  | Entregue   | Retirado                 |

1. Separar o pedido e guardar no balcão
2. Mudar o status para **Enviado** → dispara o e-mail `order-ready-for-pickup`
3. Cliente retira apresentando documento → marcar `delivered`

O campo de rastreio não aparece em pedido de retirada, e a API recusa o código
(`PICKUP_HAS_NO_TRACKING`): um link dos Correios para uma encomenda que está no
balcão só confunde quem comprou.

No painel, a lista de pedidos marca a retirada com um selo **Retirada** sob o
número — retirada e postagem são filas diferentes na prática.

## Schema (migrations 009–012)

- `products`: weight_g, height/width/length_cm, rating_avg/count, **wholesale_enabled**, **wholesale_min_qty**
- `orders`: user*id (ownership), shipping*\_, tracking\_\_, store_credit_applied, **channel**, **customer_cnpj**, **wholesale_account_id**
- `orders` (028): **delivery_method** `shipping|pickup` (default `shipping`), com CHECK que proíbe frete > 0 em retirada
- `product_reviews`, `store_credits`, `store_credit_ledger`
- **`wholesale_accounts`** (012): CNPJ, empresa, status pending/approved/rejected/disabled
- Unique ledger: 1× `review_reward` e 1× `order_refund_credit` por pedido

Default embalagem se produto sem peso: **300 g · 16×11×6 cm**.

### Integridade de dados (resumo)

| Tema                           | Comportamento                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| Preços                         | Sempre do DB sob `FOR UPDATE`                                                      |
| Qty duplicada no carrinho      | Agregada antes do check de estoque                                                 |
| Desconto retail                | `member_10` se membro ativo                                                        |
| Desconto atacado               | `wholesale_25` se conta approved + CNPJ; **não empilha** com member_10             |
| Crédito no pending             | Debitado no create; **devolvido** em cancel/fail/refund                            |
| Falha na operadora após create | Pedido cancelado + crédito restaurado (cartão recusado NÃO cancela: é retentativa) |
| Review reward                  | Na mesma TX das reviews + unique index                                             |
| LGPD                           | Export/delete cobrem pedidos, reviews, crédito e atacado                           |

### Canais de pedido

| `orders.channel`   | Quem compra                      | Desconto                                 |
| ------------------ | -------------------------------- | ---------------------------------------- |
| `retail` (default) | Convidado ou membro logado       | 0, `member_10`, `online` ou `coupon_XXX` |
| `wholesale`        | JWT + conta atacado **approved** | `wholesale_25`                           |

## Descontos — só um vale por pedido

`orders` tem **uma** coluna `discount` e **um** `discount_reason`, e o atacado já
funcionava como "25% no lugar de, nunca em cima de, o `member_10`". A promoção do
site e os cupons entram nessa mesma disputa em vez de abrirem uma segunda vaga de
desconto: **o maior vence**.

| Candidato        | `discount_reason` | De onde vem                                |
| ---------------- | ----------------- | ------------------------------------------ |
| Atacado          | `wholesale_25`    | Canal `wholesale` — substitui todo o resto |
| Membro do clube  | `member_10`       | `MEMBER_SHOP_DISCOUNT`                     |
| Promoção do site | `online`          | `shop.online_discount_*` (Configurações)   |
| Cupom            | `coupon_<CÓDIGO>` | Tabela `coupons` (aba Cupons)              |

Empate mantém o primeiro da lista acima do cupom: com 10% de cada lado o pedido
diz `member_10`, porque é o desconto que a pessoa perderia ao cancelar o plano.

**Crédito de loja não é candidato** — é dinheiro que a pessoa já tem, e entra em
cima de quem venceu (`member_10+store_credit`).

O servidor é a autoridade: `order.service` reprecifica tudo a partir do banco.
`src/lib/shop-discount.ts` espelha a regra só para a tela mostrar o mesmo número
antes do pedido existir; se os dois divergirem, o servidor está certo.

### Promoção do site (configurável, sem migration)

Quatro chaves no `SETTINGS_CATALOGUE`, editáveis na aba **Configurações**:

| Chave                                 | Padrão | O que faz                      |
| ------------------------------------- | ------ | ------------------------------ |
| `shop.online_discount_enabled`        | `true` | Liga/desliga o desconto        |
| `shop.online_discount_percent`        | `5`    | Percentual (teto 90)           |
| `shop.online_discount_banner_enabled` | `true` | Mostra o aviso no topo da loja |
| `shop.online_discount_banner_text`    | —      | Texto do aviso                 |

`GET /promo` é público (Cache-Control 60s) porque o aviso pinta antes de
qualquer login. O aviso é dispensável e a dispensa é **por percentual**: quem
fechou "5% mais barato" ainda vê "20% mais barato" na campanha seguinte.

**O preço da vitrine já sai com o desconto.** O card (`ProductCard`) e a página
do produto (`ProductDetail`) passam o preço de tabela por `applyShopPromo` e
riscam o valor cheio. Na primeira versão a promoção só aparecia no carrinho —
estava certa e cobrava certo, mas a loja inteira continuava anunciando o preço
de balcão, e o pedido era justamente que o site _fosse_ mais barato. O desconto
de membro **não** entra nessa conta: ele sai do preço de tabela, em linha
própria, porque os dois não somam (10% no lugar de 5%, nunca 14,5%). O canal
atacado nunca vê a promoção.

### Cupons

Tabelas `coupons` e `coupon_redemptions` (criadas no `ensure-schema`).

- **Código até 20 caracteres.** `discount_reason` é `VARCHAR(40)` e a string mais
  longa que este fluxo escreve é `coupon_<CÓDIGO>+store_credit`. Um código maior
  seria truncado pelo Postgres e o pedido deixaria de dizer qual cupom o pagou.
- **`POST /promo/coupon-check`** (público, rate-limited) é só um palpite para o
  checkout mostrar o valor. Quem manda é `claimCoupon`, dentro da transação do
  pedido: o `UPDATE ... WHERE used_count < max_uses` é o que impede duas pessoas
  de gastarem o último uso ao mesmo tempo.
- **O uso só é gasto se o cupom venceu a disputa.** Um código de uso único que
  perdeu para o `member_10` não é queimado à toa.
- **Limite por pessoa** conta usuário logado _ou_ e-mail — a loja aceita pedido
  de convidado, e contar só quem loga tornaria o limite contornável.
- Cobrança que falha devolve o uso (`releaseCoupon`).
- Remover um cupom **desativa**, nunca apaga: os pedidos que ele pagou precisam
  continuar apontando para ele.

## SEO / marca

- Site institucional (`geek-toys-home`): headline **Loja de K-pop no Rio de Janeiro**; biografia mantém origem 15 anos + foco atual K-pop
- E-mails: footer alinhado
- Shop: `SeoHead` client-side, `sitemap-shop.xml`, hero K-pop

## Avaliações + crédito

| Item              | Detalhe                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| Quando            | Pedido `delivered` + dono da conta                                                   |
| Recompensa        | `config.review_reward_amount` (default **R$ 1,00**), **1× por pedido**               |
| Onde avaliar      | `/minhas-compras/:id`                                                                |
| Onde usar crédito | Checkout (checkbox “Usar crédito”) — só em produtos, **não no frete**                |
| Moderação         | Admin → aba Avaliações (publicar/ocultar)                                            |
| API               | `POST /reviews/me/order/:id`, `GET /reviews/product/:slug`, `GET /reviews/me/credit` |

## E-mails de pedido

| Evento                              | Template                                      |
| ----------------------------------- | --------------------------------------------- |
| **Pedido PIX criado (cliente)**     | **`order-pending-pix`** (copia-e-cola do EMV) |
| Pedido PIX criado (admin)           | `admin-pix-order-pending`                     |
| Cartão pago (webhook)               | `order-confirmed`                             |
| PIX confirmado (admin)              | `order-confirmed`                             |
| Rastreio salvo (admin)              | `order-shipped` (código + link Correios)      |
| Retirada pronta (admin → `shipped`) | `order-ready-for-pickup` (endereço + horário) |

### Recuperar o PIX de um pedido (23/08/2026)

O EMV do checkout vivia **só no estado do componente React**. Fechar a aba —
ou apenas tocar em "Acompanhar pedido", que desmonta a tela — apagava o código,
e não havia rota pública que o devolvesse. Convidada não tinha caminho de volta
nenhum: só criando conta com o mesmo e-mail e verificando-o, para o
`claimGuestOrders` adotar o pedido. Nada na tela dizia isso. Os quatro
primeiros pedidos da loja foram todos cancelados sem pagamento.

Agora há dois caminhos, e nenhum depende da aba continuar aberta:

| Caminho                         | Onde                                         |
| ------------------------------- | -------------------------------------------- |
| E-mail `order-pending-pix`      | Sai junto com o pedido, com o copia-e-cola   |
| `GET /orders/:id/pix` (público) | Chaveado pelo UUID do pedido, como `/status` |

A página `/pedido/:id` consome a rota e renderiza o `PixPaymentPanel`. A rota
devolve `null` (404) quando não há PIX pendente — pedido pago, cancelado ou de
cartão.

> **A confirmação do PIX é manual.** A página dizia "será confirmado
> automaticamente" e "enviaremos um email" — não havia webhook nem e-mail de
> pedido pendente. O texto agora diz o que o sistema faz de verdade.

## SEO shop

| URL                     | Conteúdo                                                   |
| ----------------------- | ---------------------------------------------------------- |
| `/sitemap-shop.xml`     | Páginas estáticas                                          |
| `/sitemap-products.xml` | Proxy nginx → `GET /products/sitemap.xml` (catálogo ativo) |
| nginx sub_filter        | Title/description/OG shop (crawlers sem JS)                |

## Pendente

- [ ] **Token Melhor Envio em produção** — `MELHOR_ENVIO_TOKEN` ainda **vazio** na VPS (cotação retorna `source: fallback` PAC R$18 / SEDEX R$32). Precisa do token da conta ME da loja.
- Etiqueta ME automática
- Google Meu Negócio / Instagram (manual)
- [x] Atacado: 55 SKUs `wholesale_enabled` (10/08/2026)
- [ ] Aprovar CNPJs B2B no admin quando houver cadastros

### Como obter token Melhor Envio (bloqueio atual)

1. Conta em https://melhorenvio.com.br (produção) ou sandbox
2. Painel → **Integrações / API / Aplicativos** → criar app OAuth (ou personal token se disponível no plano)
3. Gerar **Bearer access token** com escopos de cotação (`shipping-calculate` / cart conforme o app)
4. Na VPS (`/opt/clube-geek-toys/server/.env`) — **não commitar**:
   ```bash
   MELHOR_ENVIO_TOKEN=eyJ...token_real...
   MELHOR_ENVIO_SANDBOX=false
   SHIPPING_ORIGIN_CEP=22011001
   ```
5. Recreate API:
   ```bash
   cd /opt/clube-geek-toys/server && docker compose up -d --force-recreate api
   ```
6. Validar: `POST /shipping/quote` deve retornar `"source":"melhor_envio"` (não `fallback`)

> Quem tem a conta ME (Norberto/Laura) envia o token por canal seguro; aí colamos na VPS em 1 min.

## Etiqueta de envio (Melhor Envio)

Antes disto a compra da etiqueta acontecia **fora do sistema**: a loja ia ao
site do Melhor Envio, comprava, imprimia e voltava para colar o rastreio no
painel. As colunas `melhor_envio_cart_id` / `melhor_envio_order_id` existiam
desde sempre e nunca foram preenchidas por nada.

Agora o painel faz, no detalhe do pedido, em **um botão**:

```
POST /me/cart               → item no carrinho   (grava melhor_envio_order_id)
POST /me/shipment/checkout  → COMPRA a etiqueta  ← o dinheiro sai aqui
POST /me/shipment/generate  → torna imprimível
POST /me/shipment/print     → devolve o PDF
```

**A ordem importa.** O id do envio é gravado no pedido assim que o item entra no
carrinho, _antes_ do checkout — se o processo morresse entre pagar e registrar,
a loja teria comprado uma etiqueta que nunca encontraria. Cada passo é pulado
quando o Melhor Envio diz que já foi feito, então apertar duas vezes não compra
duas etiquetas e uma compra interrompida é retomável.

Quando o rastreio aparece, ele é gravado pelo mesmo caminho de um código
digitado: o pedido vira `shipped` e o cliente recebe `order-shipped`.

| Endpoint                         | O quê                                                                  |
| -------------------------------- | ---------------------------------------------------------------------- |
| `GET /orders/:id/label`          | Estado, perguntado ao Melhor Envio. Barato, pode abrir junto do pedido |
| `POST /orders/:id/label`         | Compra + gera + imprime. **Gasta dinheiro** — a UI confirma antes      |
| `POST /orders/:id/label/reprint` | Só o PDF de uma etiqueta já paga. Não cobra                            |

Recusa antes de gastar: pedido não pago, retirada na loja, sem CEP válido, sem
serviço de frete escolhido, sem CPF do destinatário, com frete cotado pela
tabela interna, ou com item cujo produto foi apagado do catálogo (não há como
pesar o pacote — e chutar compra uma etiqueta que os Correios podem recusar no
balcão).

Produto **desativado** não recusa: a venda já aconteceu e a caixa ainda precisa
ser medida. Item de K-pop é peça única, e tirar do ar depois de vender é o fim
normal dele — se isso barrasse a etiqueta, a loja perdia justamente o pedido que
mais importa.

**Frete cotado pela tabela interna não tem etiqueta para comprar.** Um id
`fallback-pac` é da nossa tabela, não um serviço do Melhor Envio: `Number()`
nele dava `NaN`, saía como `service: null` e voltava como um 502 sem
explicação. Agora o painel diz o que houve e mostra o campo de rastreio manual
em vez do botão.

### Remetente na etiqueta

O Melhor Envio valida o que recebe, então campo vazio é erro de validação onde
campo ausente é apenas ausente — e, no remetente, ausente faz ele usar o
cadastro da própria conta.

**CPF e CNPJ são campos diferentes, não o mesmo campo com mais dígitos**:
`document` é validado como CPF e `company_document` como CNPJ. Vale dos dois
lados — a loja despacha com CNPJ, e o canal atacado recebe CNPJ do cliente, de
modo que uma etiqueta de atacado tinha as duas pontas no campo errado. O
roteamento é por tamanho: 14 dígitos → `company_document`, 11 → `document`.

O CNPJ (`52.846.344/0001-10`) e o telefone da loja são **constantes no código**,
em `STORE_SENDER` (`shipping.service.ts`), ao lado do endereço que já morava
ali. Não são segredo — o CNPJ está no rodapé da loja por exigência do Decreto
7.962/2013 — e configuração que só existe num servidor é configuração que some
no dia em que aquele servidor for reconstruído.

As quatro variáveis abaixo continuam existindo, agora como **override** (mudança
de titularidade, endereço de outro CD):

| Variável                   | Para quê                                |
| -------------------------- | --------------------------------------- |
| `SHIPPING_ORIGIN_DOCUMENT` | CPF (11) ou CNPJ (14) do remetente      |
| `SHIPPING_ORIGIN_PHONE`    | Telefone do remetente                   |
| `SHIPPING_ORIGIN_NAME`     | Nome, quando difere de "GeekPop & Toys" |
| `SHIPPING_ORIGIN_EMAIL`    | E-mail, quando difere do `FROM_EMAIL`   |

### Escopo do token

Cotar exige `shipping-calculate`. Comprar e imprimir exige também `cart-read`,
`cart-write`, `shipping-checkout`, `shipping-generate`, `shipping-print`,
`shipping-cancel`, `shipping-tracking` e `orders-read`.

Trocar `MELHOR_ENVIO_SCOPES` **não muda um token que já existe**: é preciso
autorizar de novo, em **Configurações → Melhor Envio → Autorizar**. É um clique,
na conta da própria loja — o comprador não participa e não fica sabendo. Um
token sem os escopos novos responde 403, e a API traduz isso para "reautorize a
integração" em vez de mostrar o erro cru.

### Como autorizar (passo a passo)

1. **adm.geeketoys.com.br** → aba **Configurações**.
2. Rolar até o cartão **Melhor Envio** (ícone de caminhão), logo abaixo de
   "Canal Atacado".
3. Tocar em **Autorizar** / **Reautorizar**. A própria aba vai para o Melhor
   Envio — **não** abre aba nova, porque celular bloqueia janela que não nasce
   direto do toque, e o botão parecia não fazer nada.
4. Conferir que está logado na conta **da loja**, não numa conta pessoal: o
   token sai vinculado a quem estiver logado ali.
5. Confirmar a autorização na tela do Melhor Envio.
6. A página de retorno tem **Voltar ao painel**, que cai direto em
   Configurações. Lá, tocar em **"Já autorizei — verificar de novo"**.
7. O cartão fica **verde** ("Conectado e com permissão para comprar etiqueta")
   com a data de validade. Amarelo ainda é só cotação.

Duas armadilhas que faziam a reautorização não adiantar nada:

- **O `docker-compose.yml` fixava `MELHOR_ENVIO_SCOPES` em `shipping-calculate`**,
  então o default do código (a lista completa) nunca chegava à VPS e o clique em
  "Reautorizar" emitia outro token só de cotação. Agora o compose repassa vazio
  e o default do `env.ts` é a fonte única.
- **A renovação não pede escopo.** Um refresh não pode pedir mais do que foi
  concedido; mandar a lista larga contra um token de `shipping-calculate` faz o
  próprio refresh ser recusado, e isso só aparece um mês depois, como cotação de
  volta na tabela fallback. Alargar escopo é autorização nova, nunca renovação.

O campo manual de rastreio continua: é o caminho para etiqueta comprada em
outro lugar, e para os casos que a compra automática recusa.
