# Loja — Pedidos, frete e pós-compra

Documentação operacional da evolução da loja (`shop.geeketoys.com.br`) após o pedido da Laura (ago/2026).

## O que foi entregue

| Feature            | Como funciona                                                                       |
| ------------------ | ----------------------------------------------------------------------------------- |
| **Frete por CEP**  | Checkout: ViaCEP preenche endereço; `POST /shipping/quote` cota frete               |
| **Provedor**       | Melhor Envio se `MELHOR_ENVIO_TOKEN` setado; senão **tabela fallback** PAC/SEDEX    |
| **Total**          | `subtotal − member_15 + shipping` (server-side; frete sem 15%)                      |
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

## Schema (migration 010)

- `products`: weight*g, height/width/length_cm, rating*\*
- `orders`: shipping*service\*, tracking*\*, store_credit_applied
- `product_reviews`, `store_credits`, `store_credit_ledger` (prontos para Fase avaliações)

Default embalagem se produto sem peso: **300 g · 16×11×6 cm**.

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

- Token Melhor Envio em produção (`MELHOR_ENVIO_TOKEN` no `.env` da VPS + recreate api)
- Etiqueta ME automática
- Google Meu Negócio / Instagram (manual)

### Como obter token Melhor Envio

1. Criar conta em https://melhorenvio.com.br (ou sandbox)
2. Criar aplicativo OAuth → gerar token de acesso à API
3. Na VPS, em `/opt/clube-geek-toys/server/.env` (ou secrets do compose):
   ```
   MELHOR_ENVIO_TOKEN=seu_token
   MELHOR_ENVIO_SANDBOX=false
   SHIPPING_ORIGIN_CEP=22011001
   ```
4. `docker compose up -d --force-recreate api`
