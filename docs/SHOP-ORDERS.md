# Loja — Pedidos, frete e pós-compra

Documentação operacional da evolução da loja (`shop.geeketoys.com.br`) após o pedido da Laura (ago/2026).

## O que foi entregue

| Feature            | Como funciona                                                                       |
| ------------------ | ----------------------------------------------------------------------------------- |
| **Frete por CEP**  | Checkout: ViaCEP preenche endereço; `POST /shipping/quote` cota frete               |
| **Provedor**       | Melhor Envio se `MELHOR_ENVIO_TOKEN` setado; senão **tabela fallback** PAC/SEDEX    |
| **Total**          | `subtotal − desconto + shipping` (server-side; frete sem desconto)                  |
| **Atacado B2B**    | Aba `/atacado`, CNPJ, 25% (`wholesale_25`) — ver [`WHOLESALE.md`](WHOLESALE.md)     |
| **Cotação segura** | `quoteToken` HMAC (TTL ~25 min); revalidado no create order                         |
| **Minhas compras** | `/minhas-compras` com abas marketplace (requer login + `member_id`)                 |
| **Rastreio**       | Admin cola código → `PATCH /orders/:id/tracking` → status `shipped` + link Correios |
| **Related**        | `GET /products/:slug/related` — mesma categoria, depois featured                    |
| **Trust**          | Badges PIX / Visa / Master / Elo + “Envio Correios”                                 |

## Env (API)

```bash
# Opcional — sem token a loja usa frete estimado por tabela
MELHOR_ENVIO_TOKEN=
MELHOR_ENVIO_SANDBOX=true   # true = sandbox.melhorenvio.com.br
SHIPPING_ORIGIN_CEP=22011001  # Copacabana (default)
```

Origem de frete: loja física CEP **22011-001**.

## Fluxo admin (enviar pedido)

1. Cliente paga → status `paid` (Stripe webhook ou confirmar PIX)
2. Separar → `processing`
3. Postar nos Correios → colar código de rastreio no modal do pedido → salva e marca `shipped`
4. Cliente vê em **Minhas compras → A caminho** com link dos Correios
5. Marcar `delivered` quando confirmar entrega (manual)

## Schema (migrations 009–012)

- `products`: weight_g, height/width/length_cm, rating_avg/count, **wholesale_enabled**, **wholesale_min_qty**
- `orders`: user*id (ownership), shipping*\_, tracking\_\_, store_credit_applied, **channel**, **customer_cnpj**, **wholesale_account_id**
- `product_reviews`, `store_credits`, `store_credit_ledger`
- **`wholesale_accounts`** (012): CNPJ, empresa, status pending/approved/rejected/disabled
- Unique ledger: 1× `review_reward` e 1× `order_refund_credit` por pedido

Default embalagem se produto sem peso: **300 g · 16×11×6 cm**.

### Integridade de dados (resumo)

| Tema                      | Comportamento                                                          |
| ------------------------- | ---------------------------------------------------------------------- |
| Preços                    | Sempre do DB sob `FOR UPDATE`                                          |
| Qty duplicada no carrinho | Agregada antes do check de estoque                                     |
| Desconto retail           | `member_15` se membro ativo                                            |
| Desconto atacado          | `wholesale_25` se conta approved + CNPJ; **não empilha** com member_15 |
| Crédito no pending        | Debitado no create; **devolvido** em cancel/fail/refund                |
| Falha Stripe após create  | Pedido cancelado + crédito restaurado                                  |
| Review reward             | Na mesma TX das reviews + unique index                                 |
| LGPD                      | Export/delete cobrem pedidos, reviews, crédito e atacado               |

### Canais de pedido

| `orders.channel`   | Quem compra                      | Desconto         |
| ------------------ | -------------------------------- | ---------------- |
| `retail` (default) | Convidado ou membro logado       | 0 ou `member_15` |
| `wholesale`        | JWT + conta atacado **approved** | `wholesale_25`   |

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

| Evento                 | Template                                 |
| ---------------------- | ---------------------------------------- |
| Cartão pago (webhook)  | `order-confirmed`                        |
| PIX confirmado (admin) | `order-confirmed`                        |
| Rastreio salvo (admin) | `order-shipped` (código + link Correios) |

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
