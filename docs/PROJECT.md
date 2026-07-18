# Clube GeekPop & Toys — Documentacao do Projeto

> **Ultima atualizacao:** 19 de Abril de 2026

## 1. Dados da Empresa

| Campo             | Valor                                                            |
| ----------------- | ---------------------------------------------------------------- |
| **Razao Social**  | N. Stanley Schlanger Comercio de Artigos em Geral Ltda           |
| **Nome Fantasia** | GeekPop & Toys                                                   |
| **CNPJ**          | 52.846.344/0001-10                                               |
| **Endereco**      | R. Barata Ribeiro, 181 - loja J, Copacabana, Rio de Janeiro - RJ |
| **CEP**           | 22011-001                                                        |
| **Telefone**      | (21) 98546-4666                                                  |
| **Email**         | geeketoys@gmail.com                                              |
| **Site**          | geeketoys.com.br                                                 |

## 2. Visao do Produto

Clube de vantagens digital para loja fisica e online de produtos geek, colecionaveis e brinquedos. Os membros assinam o plano anual e recebem desconto exclusivo em qualquer produto, brinde especial, entrada gratuita em eventos participantes e uma carteirinha digital com QR Code. A plataforma opera tambem uma loja e-commerce propria em `shop.geeketoys.com.br`.

### Plano de Assinatura

Um unico plano anual, sem opcao mensal e sem tiers (Silver/Gold/Black foram descontinuados).

| Plano                | Anual     | Beneficios                                                                                                               |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Clube GeekPop & Toys | R$ 149,99 | 15% de desconto em qualquer produto (loja fisica e online) + brinde especial + entrada gratuita em eventos participantes |

O desconto de 15% do membro na loja online e aplicado **server-side** no checkout (nunca confiando no cliente), registrado em `orders.discount_reason = 'member_15'`.

## 3. Modulos do Sistema

### 3.1 Modulo Membro

Cadastro em etapas (stepper), dashboard com carteirinha digital, gestao e renovacao da assinatura anual. Fluxo completo: criacao de conta, verificacao de email, dados pessoais, assinatura de contrato digital e pagamento. Como ha um unico plano, nao ha selecao de tier nem de frequencia.

### 3.2 Modulo Admin

Painel administrativo com gestao de membros (filtros, busca, paginacao server-side), gerenciamento de pagamentos (confirmacao manual de PIX, estornos), gestao da loja (aba **Produtos** — catalogo, estoque, imagens; aba **Pedidos** — listagem, status, confirmacao de PIX de loja), logs de auditoria, logs de email, logs de erro, relatorios com graficos (receita, churn), gestao de usuarios e roles, e configuracoes do sistema.

### 3.3 Modulo PDV (Ponto de Venda)

Verificacao de membros por CPF ou QR Code e visualizacao do status do membro e do desconto de 15% aplicavel. E apenas verificacao — o PDV nao registra compras nem pontos.

### 3.4 Modulo Loja (E-commerce)

Loja online em `shop.geeketoys.com.br`, servida pelo mesmo bundle Vite (o subdominio e detectado por `getAppMode()`). Catalogo publico (categorias, busca, paginas de produto), carrinho em `localStorage` (`CartContext`), checkout com cartao (Stripe) ou PIX local e confirmacao de pagamento via webhook com baixa automatica de estoque. O desconto de 15% do membro e aplicado server-side no checkout (`discount_reason = 'member_15'`). PIX de loja e confirmado manualmente pelo admin. Imagens de produto ficam no volume `/uploads`, servido pelo nginx via `api.geeketoys.com.br`.

### 3.5 Modulo Pagamento

Pagamento avulso via cartao de credito (Stripe PaymentIntent) e PIX local (QR Code gerado no servidor). Assinaturas recorrentes via Stripe Subscription. Pedidos de loja usam o mesmo motor de pagamento (metadata `kind = 'shop_order'`). Confirmacao manual de PIX pelo admin. Protecao contra pagamentos duplicados.

### 3.6 Modulo Contrato

Assinatura digital de contrato conforme Lei 14.063/2020. Geracao de PDF no frontend, upload via multipart/form-data com validacao de magic bytes, hash SHA-256 do documento, armazenamento no servidor e envio por email com PDF anexo.

### 3.7 Modulo Email

Envio de emails transacionais via Resend API com templates HTML responsivos, branding da empresa, preheader text, CTAs e footer padronizado. Todos os envios sao registrados na tabela `email_logs`.

### 3.8 Modulo Radio

Radio online via AzuraCast (stack independente). Player integrado no site institucional (`geeketoys.com.br`). Scripts de automacao para download, upload e gestao de playlists.

### 3.9 Modulo Analytics

Umami self-hosted para rastreamento de uso sem cookies de terceiros.

## 4. Modelos de Dados (PostgreSQL)

### 4.1 Tabela `users`

| Coluna             | Tipo         | Restricoes / Notas                                                          |
| ------------------ | ------------ | --------------------------------------------------------------------------- |
| id                 | UUID         | PK, DEFAULT uuid_generate_v4()                                              |
| email              | VARCHAR(254) | NOT NULL, UNIQUE                                                            |
| password_hash      | VARCHAR(255) | NOT NULL (bcrypt)                                                           |
| role               | VARCHAR(20)  | NOT NULL, DEFAULT 'member', CHECK IN ('member','seller','admin','disabled') |
| email_verified     | BOOLEAN      | NOT NULL, DEFAULT FALSE                                                     |
| email_verified_at  | TIMESTAMPTZ  | Nullable                                                                    |
| refresh_token_hash | VARCHAR(255) | Nullable                                                                    |
| created_at         | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                                                     |
| updated_at         | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW(), auto-update via trigger                            |

### 4.2 Tabela `members`

| Coluna               | Tipo         | Restricoes / Notas                                                              |
| -------------------- | ------------ | ------------------------------------------------------------------------------- |
| id                   | UUID         | PK, DEFAULT uuid_generate_v4()                                                  |
| user_id              | UUID         | FK → users(id) ON DELETE CASCADE, NOT NULL, UNIQUE                              |
| cpf                  | VARCHAR(11)  | NOT NULL, UNIQUE                                                                |
| full_name            | VARCHAR(200) | NOT NULL                                                                        |
| email                | VARCHAR(254) | NOT NULL                                                                        |
| phone                | VARCHAR(20)  | Nullable                                                                        |
| photo_url            | TEXT         | Nullable                                                                        |
| plan                 | VARCHAR(10)  | NOT NULL, DEFAULT 'club', CHECK IN ('club')                                     |
| status               | VARCHAR(20)  | NOT NULL, DEFAULT 'pending', CHECK IN ('active','pending','inactive','expired') |
| payment_type         | VARCHAR(10)  | NOT NULL, DEFAULT 'annual', CHECK IN ('annual')                                 |
| start_date           | DATE         | Nullable                                                                        |
| expiry_date          | DATE         | Nullable                                                                        |
| pending_payment      | JSONB        | Nullable, dados do pagamento pendente                                           |
| subscription_id      | TEXT         | Nullable, ID da assinatura Stripe                                               |
| subscription_status  | VARCHAR(20)  | Nullable                                                                        |
| auto_renewal         | BOOLEAN      | DEFAULT FALSE                                                                   |
| activated_at         | TIMESTAMPTZ  | Nullable                                                                        |
| activated_by_payment | TEXT         | Nullable, ID do pagamento que ativou                                            |
| stripe_customer_id   | TEXT         | Nullable                                                                        |
| payment_count        | INTEGER      | NOT NULL, DEFAULT 0. Contagem de pagamentos confirmados                         |
| created_at           | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                                                         |
| updated_at           | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW(), auto-update via trigger                                |

### 4.3 Tabela `payments`

| Coluna               | Tipo          | Restricoes / Notas                                                           |
| -------------------- | ------------- | ---------------------------------------------------------------------------- |
| id                   | UUID          | PK, DEFAULT uuid_generate_v4()                                               |
| member_id            | UUID          | FK → members(id) ON DELETE SET NULL, Nullable                                |
| amount               | DECIMAL(10,2) | NOT NULL                                                                     |
| method               | VARCHAR(20)   | NOT NULL, CHECK IN ('pix','credit_card','boleto','cash')                     |
| status               | VARCHAR(20)   | NOT NULL, DEFAULT 'pending', CHECK IN ('pending','paid','failed','refunded') |
| provider_id          | TEXT          | Nullable, ID no Stripe                                                       |
| provider_status      | TEXT          | Nullable, status no Stripe                                                   |
| reference            | TEXT          | Nullable, referencia interna                                                 |
| paid_at              | TIMESTAMPTZ   | Nullable                                                                     |
| webhook_processed_at | TIMESTAMPTZ   | Nullable                                                                     |
| refund_reason        | TEXT          | Nullable (adicionado via ensure-schema)                                      |
| created_at           | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW()                                                      |
| updated_at           | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW(), auto-update via trigger                             |

### 4.4 Tabela `subscriptions`

| Coluna             | Tipo          | Restricoes / Notas                                                                  |
| ------------------ | ------------- | ----------------------------------------------------------------------------------- |
| id                 | TEXT          | PK                                                                                  |
| member_id          | UUID          | FK → members(id) ON DELETE CASCADE, NOT NULL                                        |
| provider_id        | TEXT          | NOT NULL, ID no Stripe                                                              |
| status             | VARCHAR(20)   | NOT NULL, DEFAULT 'pending', CHECK IN ('pending','authorized','paused','cancelled') |
| plan               | VARCHAR(10)   | NOT NULL                                                                            |
| frequency_type     | VARCHAR(10)   | NOT NULL, CHECK IN ('months','years')                                               |
| transaction_amount | DECIMAL(10,2) | NOT NULL                                                                            |
| next_payment_date  | TIMESTAMPTZ   | Nullable                                                                            |
| last_payment_date  | TIMESTAMPTZ   | Nullable                                                                            |
| failed_payments    | INTEGER       | NOT NULL, DEFAULT 0                                                                 |
| card_last_four     | VARCHAR(4)    | Nullable                                                                            |
| card_brand         | VARCHAR(50)   | Nullable                                                                            |
| payer_email        | VARCHAR(254)  | Nullable                                                                            |
| created_at         | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW()                                                             |
| cancelled_at       | TIMESTAMPTZ   | Nullable                                                                            |
| paused_at          | TIMESTAMPTZ   | Nullable                                                                            |

### 4.5 Tabela `subscription_payments`

| Coluna              | Tipo          | Restricoes / Notas                                 |
| ------------------- | ------------- | -------------------------------------------------- |
| id                  | TEXT          | PK                                                 |
| subscription_id     | TEXT          | FK → subscriptions(id) ON DELETE CASCADE, NOT NULL |
| member_id           | UUID          | FK → members(id) ON DELETE CASCADE, NOT NULL       |
| amount              | DECIMAL(10,2) | NOT NULL                                           |
| status              | VARCHAR(20)   | NOT NULL                                           |
| payment_date        | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW()                            |
| provider_payment_id | TEXT          | Nullable                                           |
| failure_reason      | TEXT          | Nullable                                           |

> **Nota:** o sistema de pontos foi removido (migration 008). Nao existe mais a tabela `point_transactions` nem a coluna `members.points`.

### 4.6 Tabelas da Loja (migration 009)

As tabelas abaixo suportam a loja e-commerce em `shop.geeketoys.com.br`.

#### `categories`

| Coluna      | Tipo         | Restricoes / Notas                               |
| ----------- | ------------ | ------------------------------------------------ |
| id          | UUID         | PK, DEFAULT uuid_generate_v4()                   |
| name        | VARCHAR(120) | NOT NULL                                         |
| slug        | VARCHAR(140) | NOT NULL, UNIQUE                                 |
| description | TEXT         | Nullable                                         |
| active      | BOOLEAN      | NOT NULL, DEFAULT TRUE                           |
| sort_order  | INTEGER      | NOT NULL, DEFAULT 0                              |
| created_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                          |
| updated_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW(), auto-update via trigger |

#### `products`

| Coluna           | Tipo          | Restricoes / Notas                               |
| ---------------- | ------------- | ------------------------------------------------ |
| id               | UUID          | PK, DEFAULT uuid_generate_v4()                   |
| name             | VARCHAR(200)  | NOT NULL                                         |
| slug             | VARCHAR(220)  | NOT NULL, UNIQUE                                 |
| description      | TEXT          | Nullable                                         |
| price            | DECIMAL(10,2) | NOT NULL, CHECK >= 0                             |
| compare_at_price | DECIMAL(10,2) | Nullable, CHECK >= 0 (preco "de/por")            |
| category_id      | UUID          | FK → categories(id) ON DELETE SET NULL, Nullable |
| images           | JSONB         | NOT NULL, DEFAULT '[]' (URLs em `/uploads`)      |
| stock            | INTEGER       | NOT NULL, DEFAULT 0, CHECK >= 0                  |
| sku              | VARCHAR(60)   | Nullable                                         |
| active           | BOOLEAN       | NOT NULL, DEFAULT TRUE                           |
| featured         | BOOLEAN       | NOT NULL, DEFAULT FALSE                          |
| created_at       | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW()                          |
| updated_at       | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW(), auto-update via trigger |

#### `orders`

| Coluna                   | Tipo          | Restricoes / Notas                                                                                                 |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| id                       | UUID          | PK, DEFAULT uuid_generate_v4()                                                                                     |
| order_number             | SERIAL        | Numero sequencial legivel do pedido                                                                                |
| member_id                | UUID          | FK → members(id) ON DELETE SET NULL, Nullable (pedido pode ser de nao-membro)                                      |
| customer_name            | VARCHAR(200)  | NOT NULL                                                                                                           |
| customer_email           | VARCHAR(254)  | NOT NULL                                                                                                           |
| customer_phone           | VARCHAR(20)   | Nullable                                                                                                           |
| shipping_address         | JSONB         | Nullable                                                                                                           |
| subtotal                 | DECIMAL(10,2) | NOT NULL, CHECK >= 0                                                                                               |
| discount                 | DECIMAL(10,2) | NOT NULL, DEFAULT 0, CHECK >= 0                                                                                    |
| discount_reason          | VARCHAR(40)   | Nullable, `'member_15'` quando o desconto de membro foi aplicado                                                   |
| shipping_cost            | DECIMAL(10,2) | NOT NULL, DEFAULT 0, CHECK >= 0                                                                                    |
| total                    | DECIMAL(10,2) | NOT NULL, CHECK >= 0                                                                                               |
| status                   | VARCHAR(20)   | NOT NULL, DEFAULT 'pending', CHECK IN ('pending','paid','processing','shipped','delivered','cancelled','refunded') |
| payment_method           | VARCHAR(20)   | Nullable, CHECK IN ('pix','credit_card')                                                                           |
| stripe_payment_intent_id | TEXT          | Nullable                                                                                                           |
| pix_txid                 | TEXT          | Nullable                                                                                                           |
| paid_at                  | TIMESTAMPTZ   | Nullable                                                                                                           |
| created_at               | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW()                                                                                            |
| updated_at               | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW(), auto-update via trigger                                                                   |

#### `order_items`

| Coluna       | Tipo          | Restricoes / Notas                             |
| ------------ | ------------- | ---------------------------------------------- |
| id           | UUID          | PK, DEFAULT uuid_generate_v4()                 |
| order_id     | UUID          | FK → orders(id) ON DELETE CASCADE, NOT NULL    |
| product_id   | UUID          | FK → products(id) ON DELETE SET NULL, Nullable |
| product_name | VARCHAR(200)  | NOT NULL (snapshot no momento da compra)       |
| product_slug | VARCHAR(220)  | Nullable                                       |
| unit_price   | DECIMAL(10,2) | NOT NULL, CHECK >= 0                           |
| quantity     | INTEGER       | NOT NULL, CHECK > 0                            |
| line_total   | DECIMAL(10,2) | NOT NULL, CHECK >= 0                           |
| image_url    | TEXT          | Nullable                                       |

### 4.7 Tabela `contracts`

| Coluna            | Tipo         | Restricoes / Notas                                                     |
| ----------------- | ------------ | ---------------------------------------------------------------------- |
| id                | TEXT         | PK                                                                     |
| member_id         | UUID         | FK → members(id) ON DELETE CASCADE, NOT NULL                           |
| member_name       | VARCHAR(200) | NOT NULL                                                               |
| member_cpf        | VARCHAR(11)  | NOT NULL                                                               |
| member_email      | VARCHAR(254) | NOT NULL                                                               |
| plan              | VARCHAR(10)  | NOT NULL                                                               |
| signature_preview | TEXT         | Nullable                                                               |
| signed_at         | TIMESTAMPTZ  | NOT NULL                                                               |
| ip_address        | VARCHAR(45)  | Nullable                                                               |
| user_agent        | TEXT         | Nullable                                                               |
| document_hash     | VARCHAR(64)  | Nullable, SHA-256 do conteudo                                          |
| pdf_url           | TEXT         | Nullable                                                               |
| pdf_path          | TEXT         | Nullable, caminho no filesystem do servidor                            |
| pdf_hash          | VARCHAR(64)  | Nullable, SHA-256 do arquivo PDF                                       |
| status            | VARCHAR(20)  | NOT NULL, DEFAULT 'active', CHECK IN ('active','superseded','revoked') |
| created_at        | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                                                |

### 4.8 Tabela `audit_logs`

| Coluna    | Tipo         | Restricoes / Notas                            |
| --------- | ------------ | --------------------------------------------- |
| id        | UUID         | PK, DEFAULT uuid_generate_v4()                |
| action    | VARCHAR(100) | NOT NULL                                      |
| member_id | UUID         | FK → members(id) ON DELETE SET NULL, Nullable |
| user_id   | UUID         | FK → users(id) ON DELETE SET NULL, Nullable   |
| details   | JSONB        | Nullable                                      |
| timestamp | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                       |

### 4.9 Tabela `email_logs`

| Coluna        | Tipo         | Restricoes / Notas                            |
| ------------- | ------------ | --------------------------------------------- |
| id            | UUID         | PK, DEFAULT uuid_generate_v4()                |
| member_id     | UUID         | FK → members(id) ON DELETE SET NULL, Nullable |
| template      | VARCHAR(50)  | NOT NULL                                      |
| recipient     | VARCHAR(254) | NOT NULL                                      |
| status        | VARCHAR(20)  | NOT NULL (sent, failed)                       |
| resend_id     | TEXT         | Nullable, ID no Resend                        |
| error_message | TEXT         | Nullable                                      |
| sent_at       | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()                       |

### 4.10 Tabela `processed_webhooks`

| Coluna       | Tipo        | Restricoes / Notas        |
| ------------ | ----------- | ------------------------- |
| webhook_key  | TEXT        | PK, chave de idempotencia |
| type         | TEXT        | Nullable                  |
| action       | TEXT        | Nullable                  |
| data_id      | TEXT        | Nullable                  |
| request_id   | TEXT        | Nullable                  |
| processed_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()   |

### 4.11 Tabela `consumed_verification_tokens`

| Coluna      | Tipo        | Restricoes / Notas                         |
| ----------- | ----------- | ------------------------------------------ |
| token_hash  | TEXT        | PK, SHA-256 do token                       |
| user_id     | UUID        | FK → users(id) ON DELETE CASCADE, NOT NULL |
| consumed_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                    |

### 4.12 Tabela `error_logs`

| Coluna     | Tipo        | Restricoes / Notas                                                             |
| ---------- | ----------- | ------------------------------------------------------------------------------ |
| id         | UUID        | PK, DEFAULT uuid_generate_v4()                                                 |
| severity   | VARCHAR(10) | NOT NULL, DEFAULT 'error', CHECK IN ('debug','info','warning','error','fatal') |
| message    | TEXT        | NOT NULL                                                                       |
| stack      | TEXT        | Nullable                                                                       |
| source     | VARCHAR(10) | NOT NULL, DEFAULT 'frontend', CHECK IN ('frontend','backend')                  |
| context    | JSONB       | DEFAULT '{}'                                                                   |
| user_id    | UUID        | FK → users(id) ON DELETE SET NULL, Nullable                                    |
| url        | TEXT        | Nullable                                                                       |
| user_agent | TEXT        | Nullable                                                                       |
| ip_address | VARCHAR(45) | Nullable                                                                       |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                                                        |

### 4.13 Tabela `config`

| Coluna     | Tipo         | Restricoes / Notas      |
| ---------- | ------------ | ----------------------- |
| key        | VARCHAR(100) | PK                      |
| value      | JSONB        | NOT NULL                |
| updated_at | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW() |

### Triggers

- `tr_users_updated_at` — atualiza `updated_at` automaticamente em UPDATE na tabela `users`.
- `tr_members_updated_at` — atualiza `updated_at` automaticamente em UPDATE na tabela `members`.
- `tr_payments_updated_at` — atualiza `updated_at` automaticamente em UPDATE na tabela `payments`.
- `tr_categories_updated_at`, `tr_products_updated_at`, `tr_orders_updated_at` — auto-update de `updated_at` nas tabelas da loja.

## 5. Endpoints da API

**Base URL:** `https://api.geeketoys.com.br`

### Auth (`/auth`)

| Metodo | Endpoint                        | Descricao                            | Auth    |
| ------ | ------------------------------- | ------------------------------------ | ------- |
| POST   | `/auth/register`                | Cadastro de novo usuario             | Publico |
| POST   | `/auth/login`                   | Login (retorna access + refresh)     | Publico |
| POST   | `/auth/refresh`                 | Renovar access token via cookie/body | Refresh |
| POST   | `/auth/logout`                  | Logout (invalida refresh token)      | JWT     |
| POST   | `/auth/send-verification-email` | Envia email de verificacao           | Publico |
| POST   | `/auth/verify-email`            | Valida token de verificacao de email | Publico |
| POST   | `/auth/send-password-reset`     | Envia email de reset de senha        | Publico |
| POST   | `/auth/reset-password`          | Redefine senha com token             | Publico |
| POST   | `/auth/google`                  | Login/registro via Google OAuth      | Publico |
| GET    | `/auth/me`                      | Dados do usuario autenticado         | JWT     |
| PATCH  | `/auth/update-profile`          | Atualiza email/senha do usuario      | JWT     |

### Members (`/members`)

| Metodo | Endpoint                    | Descricao                                 | Auth                   |
| ------ | --------------------------- | ----------------------------------------- | ---------------------- |
| GET    | `/members/cpf-exists/:cpf`  | Verifica se CPF ja esta cadastrado        | Publico (rate-limited) |
| GET    | `/members`                  | Lista membros (paginacao, filtros, busca) | admin/seller           |
| GET    | `/members/me`               | Perfil do membro autenticado              | JWT                    |
| GET    | `/members/count`            | Total de membros                          | admin/seller           |
| GET    | `/members/by-cpf/:cpf`      | Busca membro por CPF                      | admin/seller           |
| GET    | `/members/:id`              | Detalhes do membro                        | admin/seller/owner     |
| GET    | `/members/:id/payments`     | Pagamentos do membro                      | admin/seller           |
| GET    | `/members/:id/subscription` | Assinatura do membro                      | admin/seller           |
| POST   | `/members`                  | Criar perfil de membro                    | JWT                    |
| PATCH  | `/members/:id`              | Atualizar dados do membro                 | admin/seller/owner     |

### Payments (`/pix`, `/checkout`, `/payment`, `/payments`)

O mesmo router e montado em quatro prefixos para compatibilidade.

| Metodo | Endpoint                     | Descricao                            | Auth  |
| ------ | ---------------------------- | ------------------------------------ | ----- |
| POST   | `/pix/create`                | Gera QR Code PIX local               | JWT   |
| POST   | `/checkout/card/create`      | Cria PaymentIntent Stripe (cartao)   | JWT   |
| POST   | `/payments/:id/confirm`      | Admin confirma pagamento PIX manual  | admin |
| POST   | `/payments/:id/refund`       | Admin realiza estorno                | admin |
| GET    | `/payments`                  | Lista pagamentos (filtra por membro) | JWT   |
| GET    | `/payment/status/:paymentId` | Consulta status no Stripe            | JWT   |

### Subscriptions (`/subscription`)

| Metodo | Endpoint                                  | Descricao                    | Auth |
| ------ | ----------------------------------------- | ---------------------------- | ---- |
| POST   | `/subscription/create`                    | Cria assinatura Stripe       | JWT  |
| GET    | `/subscription/:id`                       | Detalhes da assinatura       | JWT  |
| PUT    | `/subscription/:id/pause`                 | Pausa assinatura             | JWT  |
| PUT    | `/subscription/:id/resume`                | Reativa assinatura           | JWT  |
| PUT    | `/subscription/:id/cancel`                | Cancela assinatura           | JWT  |
| GET    | `/subscription/:id/payments`              | Pagamentos da assinatura     | JWT  |
| PUT    | `/subscription/:id/update-payment-method` | Atualiza metodo de pagamento | JWT  |

### Products (`/products`)

| Metodo | Endpoint                   | Descricao                                    | Auth    |
| ------ | -------------------------- | -------------------------------------------- | ------- |
| GET    | `/products/categories`     | Lista categorias ativas                      | Publico |
| GET    | `/products`                | Catalogo publico (filtros, busca, paginacao) | Publico |
| GET    | `/products/:slug`          | Detalhe de um produto                        | Publico |
| POST   | `/products/categories`     | Cria categoria                               | admin   |
| PATCH  | `/products/categories/:id` | Atualiza categoria                           | admin   |
| DELETE | `/products/categories/:id` | Remove categoria                             | admin   |
| POST   | `/products`                | Cria produto                                 | admin   |
| PATCH  | `/products/:id`            | Atualiza produto                             | admin   |
| DELETE | `/products/:id`            | Remove produto                               | admin   |
| POST   | `/products/:id/images`     | Upload de imagens do produto (multipart)     | admin   |

### Orders (`/orders`)

| Metodo | Endpoint                  | Descricao                                                     | Auth                 |
| ------ | ------------------------- | ------------------------------------------------------------- | -------------------- |
| POST   | `/orders`                 | Cria pedido (checkout; desconto de 15% resolvido server-side) | Publico/JWT opcional |
| GET    | `/orders/:id/status`      | Consulta status do pedido (polling)                           | Publico              |
| GET    | `/orders`                 | Lista pedidos (filtros, paginacao)                            | admin                |
| GET    | `/orders/:id`             | Detalhe de um pedido                                          | admin                |
| PATCH  | `/orders/:id/status`      | Atualiza status (processing/shipped/...)                      | admin                |
| POST   | `/orders/:id/confirm-pix` | Confirma manualmente um PIX de loja                           | admin                |
| POST   | `/orders/:id/refund`      | Estorna pedido pago                                           | admin                |

### Contracts (`/contracts`)

| Metodo | Endpoint                        | Descricao                                        | Auth      |
| ------ | ------------------------------- | ------------------------------------------------ | --------- |
| POST   | `/contracts`                    | Upload de contrato (multipart/form-data com PDF) | JWT/owner |
| GET    | `/contracts/:memberId`          | Contrato ativo do membro                         | JWT/owner |
| GET    | `/contracts/:memberId/history`  | Historico de contratos                           | JWT/owner |
| GET    | `/contracts/:contractId/verify` | Verificar integridade (hash SHA-256)             | JWT/owner |
| POST   | `/contracts/:contractId/revoke` | Revogar contrato                                 | JWT/owner |

### Email (`/email`)

| Metodo | Endpoint               | Descricao                             | Auth |
| ------ | ---------------------- | ------------------------------------- | ---- |
| POST   | `/email/send`          | Envia email por template              | JWT  |
| POST   | `/email/send-contract` | Envia contrato assinado com PDF anexo | JWT  |
| GET    | `/email/templates`     | Lista templates disponiveis           | JWT  |

### Webhook (`/webhook`)

| Metodo | Endpoint           | Descricao                                                                                                                           | Auth             |
| ------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| POST   | `/webhook/stripe`  | Processa eventos do Stripe (assinatura e pedidos de loja via `metadata.kind = 'shop_order'`, que confirma o pedido e baixa estoque) | Signature Stripe |
| POST   | `/webhook/pagbank` | Retorna 410 Gone (deprecado)                                                                                                        | -                |

### Reports (`/reports`)

| Metodo | Endpoint                  | Descricao                             | Auth  |
| ------ | ------------------------- | ------------------------------------- | ----- |
| GET    | `/reports/daily`          | Relatorio diario                      | admin |
| GET    | `/reports/monthly`        | Relatorio mensal (parametro `months`) | admin |
| GET    | `/reports/churn`          | Churn por mes (expired + cancelled)   | admin |
| GET    | `/reports/today-revenue`  | Receita do dia                        | admin |
| GET    | `/reports/realtime-stats` | Metricas em tempo real                | admin |

### Logs (`/logs`)

| Metodo | Endpoint             | Descricao                 | Auth                   |
| ------ | -------------------- | ------------------------- | ---------------------- |
| POST   | `/logs/errors`       | Registra erro do frontend | Publico (rate-limited) |
| GET    | `/logs/audit`        | Lista audit logs          | admin                  |
| GET    | `/logs/email`        | Lista email logs          | admin                  |
| GET    | `/logs/errors`       | Lista error logs          | admin                  |
| GET    | `/logs/errors/stats` | Estatisticas de erros     | admin                  |

### Users (`/users`)

| Metodo | Endpoint          | Descricao               | Auth  |
| ------ | ----------------- | ----------------------- | ----- |
| GET    | `/users`          | Lista todos os usuarios | admin |
| PATCH  | `/users/:id/role` | Altera role do usuario  | admin |

### Audit (`/audit`)

| Metodo | Endpoint        | Descricao                            | Auth  |
| ------ | --------------- | ------------------------------------ | ----- |
| POST   | `/audit/export` | Registra auditoria de exportacao CSV | admin |

### Settings (`/settings`)

| Metodo | Endpoint    | Descricao                      | Auth  |
| ------ | ----------- | ------------------------------ | ----- |
| GET    | `/settings` | Lista configuracoes + catalogo | admin |
| PATCH  | `/settings` | Atualiza configuracoes em lote | admin |

### LGPD (`/lgpd`)

| Metodo | Endpoint               | Descricao                                | Auth |
| ------ | ---------------------- | ---------------------------------------- | ---- |
| GET    | `/lgpd/export`         | Exporta todos os dados do usuario (LGPD) | JWT  |
| POST   | `/lgpd/delete-account` | Anonimiza e exclui conta (requer senha)  | JWT  |

### Health

| Metodo | Endpoint  | Descricao             | Auth    |
| ------ | --------- | --------------------- | ------- |
| GET    | `/health` | Status da API + banco | Publico |

## 6. Templates de Email (17)

| Template                      | Assunto                            | Trigger                                     | Variaveis principais                                                    | Destinatario |
| ----------------------------- | ---------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- | ------------ |
| `verify-email`                | Verifique seu e-mail               | Backend (auto, apos registro)               | name, verify_url                                                        | Membro       |
| `password-reset`              | Redefinicao de senha               | Backend (auto, solicitacao do membro)       | name, reset_url                                                         | Membro       |
| `welcome`                     | Bem-vindo ao Clube GeekPop & Toys! | Frontend (apos ativacao)                    | name, plan                                                              | Membro       |
| `payment-confirmed`           | Pagamento confirmado               | Webhook Stripe / Admin confirma PIX         | name, amount, plan, expiry_date                                         | Membro       |
| `payment-failed`              | Pagamento nao aprovado             | Webhook Stripe                              | name                                                                    | Membro       |
| `subscription-created`        | Assinatura ativada                 | Backend (auto)                              | name, plan, amount, card_last_four                                      | Membro       |
| `subscription-payment`        | Cobranca recorrente processada     | Webhook Stripe                              | name, amount, plan, next_payment                                        | Membro       |
| `subscription-paused`         | Assinatura pausada                 | Backend (auto)                              | name                                                                    | Membro       |
| `subscription-resumed`        | Assinatura reativada               | Backend (auto)                              | name                                                                    | Membro       |
| `subscription-cancelled`      | Assinatura cancelada               | Backend / Webhook (3 falhas)                | name                                                                    | Membro       |
| `subscription-payment-failed` | Falha na cobranca recorrente       | Webhook Stripe                              | name, amount, failed_count                                              | Membro       |
| `renewal-reminder`            | Sua assinatura expira em breve     | Cron diario (6h UTC, dedup via email_logs)  | name, plan, expiry_date                                                 | Membro       |
| `member-expired`              | Sua assinatura expirou             | Cron diario                                 | name, plan                                                              | Membro       |
| `order-confirmed`             | Pedido confirmado                  | Webhook Stripe / Admin confirma PIX de loja | name, order_number, total                                               | Cliente      |
| `contract-signed`             | Contrato assinado                  | Frontend (apos assinatura digital)          | name, plan, signed_at, hash                                             | Membro       |
| `admin-pix-pending`           | PIX pendente de confirmacao        | Backend (auto, apos criacao de PIX)         | member_name, member_email, plan, amount, tx_id, payment_id              | Admin        |
| `admin-new-member`            | Novo membro cadastrado             | Backend (auto, apos cadastro)               | member_name, member_email, member_cpf, member_phone, plan, payment_type | Admin        |

## 7. Roles e Permissoes

| Role       | Acesso                                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `member`   | Proprio perfil, proprios pagamentos, propria assinatura, proprio contrato, exportar dados (LGPD), excluir conta                                                                                                 |
| `seller`   | Verificar membros (CPF/QR) no PDV, listar membros, ver detalhes de membro                                                                                                                                       |
| `admin`    | Tudo de seller + confirmar PIX (assinatura e loja), estornar pagamento, gerenciar produtos/categorias e pedidos, gerenciar roles, relatorios, logs (audit/email/erro), configuracoes do sistema, exportar dados |
| `disabled` | Bloqueado — nao pode fazer login                                                                                                                                                                                |

### Fluxo de Autenticacao

- **Access token:** JWT com expiracao de 15 minutos.
- **Refresh token:** JWT com expiracao de 30 dias, armazenado como cookie httpOnly (`cgt_refresh`, path `/auth`, sameSite `lax`). Fallback para body (legado).
- **Senha:** bcrypt, minimo 8 caracteres, 1 maiuscula, 1 numero.
- **Redirect apos login:** `admin` → `/admin`, `seller` → `/pdv`, `member` → `/membro`.

## 8. Variaveis de Ambiente

### Backend — Obrigatorias

| Variavel             | Tipo   | Descricao                                 |
| -------------------- | ------ | ----------------------------------------- |
| `DATABASE_URL`       | string | URL de conexao PostgreSQL                 |
| `JWT_SECRET`         | string | Secret para access tokens (min 32 chars)  |
| `JWT_REFRESH_SECRET` | string | Secret para refresh tokens (min 32 chars) |
| `HMAC_SECRET`        | string | Secret para tokens HMAC (min 32 chars)    |
| `STRIPE_SECRET_KEY`  | string | Chave secreta do Stripe                   |
| `RESEND_API_KEY`     | string | Chave da API Resend                       |
| `FRONTEND_URL`       | string | URL do SPA de membros (com https)         |
| `API_URL`            | string | URL publica da API (com https)            |

### Backend — Opcionais

| Variavel                | Tipo   | Default                                           | Descricao                                       |
| ----------------------- | ------ | ------------------------------------------------- | ----------------------------------------------- |
| `NODE_ENV`              | string | `development`                                     | Ambiente (development, production, test)        |
| `PORT`                  | number | `3001`                                            | Porta do servidor Express                       |
| `STRIPE_WEBHOOK_SECRET` | string | -                                                 | Secret do webhook Stripe (obrigatorio em prod)  |
| `PIX_KEY`               | string | -                                                 | Chave PIX para geracao de QR Code               |
| `PIX_MERCHANT_NAME`     | string | -                                                 | Nome do comerciante no PIX                      |
| `PIX_MERCHANT_CITY`     | string | -                                                 | Cidade do comerciante no PIX                    |
| `GOOGLE_CLIENT_ID`      | string | -                                                 | Client ID do Google OAuth                       |
| `FROM_EMAIL`            | string | `Clube GeekPop & Toys <contato@geeketoys.com.br>` | Remetente dos emails                            |
| `ADMIN_EMAIL`           | string | `admin@geeketoys.com.br`                          | Email que recebe notificacoes admin             |
| `ALLOWED_ORIGINS`       | string | -                                                 | Origens CORS adicionais (separadas por virgula) |

### Frontend (`.env`)

| Variavel                      | Descricao                      |
| ----------------------------- | ------------------------------ |
| `VITE_API_URL`                | URL da API                     |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Chave publica do Stripe        |
| `VITE_PIX_KEY`                | Chave PIX (exibida no QR Code) |
| `VITE_ENVIRONMENT`            | Ambiente (production, etc.)    |

## 9. Estrutura de Diretorios

```
clube-geek-toys/
├── .github/
│   └── workflows/
│       └── deploy.yml                   # CI/CD GitHub Actions
│
├── docs/
│   ├── ARCHITECTURE.md                  # Diagrama e decisoes
│   ├── PROJECT.md                       # Este arquivo
│   ├── RADIO.md                         # Operacao da radio AzuraCast
│   ├── SECURITY.md                      # Seguranca e LGPD
│   └── TODO.md                          # Roadmap e tarefas
│
├── scripts/
│   └── radio/
│       ├── download-batch.py            # Download yt-dlp em lote
│       ├── upload-to-vps.sh             # Upload de musicas para VPS
│       ├── playlist-attach.sh           # Associar musicas a playlists
│       └── kpop-top100.txt              # Lista de referencia
│
├── server/                              # Backend (roda na VPS em Docker)
│   ├── api/
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts                 # Entrypoint Express + cron
│   │       ├── config/
│   │       │   ├── database.ts          # Pool PostgreSQL (pg)
│   │       │   └── env.ts               # Validacao Zod das env vars
│   │       ├── db/
│   │       │   ├── schema.sql           # Schema PostgreSQL completo
│   │       │   ├── ensure-schema.ts     # Sync automatico de schema
│   │       │   ├── seed-admin.ts        # Seed do usuario admin
│   │       │   └── migrations/          # Migrations incrementais
│   │       │       ├── 002-pagbank-migration.sql
│   │       │       ├── 003-restructure.sql
│   │       │       ├── 004-wave1-hardening.sql
│   │       │       ├── 005-stripe-migration.sql
│   │       │       ├── 006-payment-count.sql
│   │       │       ├── 007-refresh-token-grace.sql
│   │       │       ├── 008-single-plan-drop-points.sql  # Colapsa plano p/ 'club' + dropa pontos
│   │       │       └── 009-shop.sql                      # Tabelas da loja (categories/products/orders/order_items)
│   │       ├── middleware/
│   │       │   ├── auth.ts              # JWT + RBAC (authenticate, requireRole)
│   │       │   ├── cors.ts              # CORS whitelist
│   │       │   ├── error-handler.ts     # Error handler global
│   │       │   ├── ownership.ts         # Verificacao de propriedade de recurso
│   │       │   ├── rate-limit.ts        # Rate limiters por tipo
│   │       │   └── validate.ts          # Validacao Zod de request body
│   │       ├── routes/
│   │       │   ├── auth.routes.ts
│   │       │   ├── member.routes.ts
│   │       │   ├── payment.routes.ts
│   │       │   ├── subscription.routes.ts
│   │       │   ├── product.routes.ts    # Catalogo + admin de produtos/categorias
│   │       │   ├── order.routes.ts      # Checkout + admin de pedidos
│   │       │   ├── contract.routes.ts
│   │       │   ├── email.routes.ts
│   │       │   ├── webhook.routes.ts
│   │       │   ├── report.routes.ts
│   │       │   ├── log.routes.ts
│   │       │   ├── audit.routes.ts
│   │       │   ├── user.routes.ts
│   │       │   ├── settings.routes.ts
│   │       │   ├── lgpd.routes.ts
│   │       │   └── health.routes.ts
│   │       ├── services/
│   │       │   ├── auth.service.ts
│   │       │   ├── member.service.ts
│   │       │   ├── payment.service.ts
│   │       │   ├── subscription.service.ts
│   │       │   ├── product.service.ts   # Catalogo, estoque, imagens
│   │       │   ├── order.service.ts     # Pedidos, desconto de membro, baixa de estoque
│   │       │   ├── contract.service.ts
│   │       │   ├── email.service.ts     # 17 templates HTML
│   │       │   ├── webhook.service.ts   # Assinatura + pedidos de loja (shop_order)
│   │       │   ├── report.service.ts
│   │       │   ├── log.service.ts
│   │       │   ├── lgpd.service.ts
│   │       │   ├── settings.service.ts
│   │       │   └── cron.service.ts      # Jobs agendados (renovacao/expiracao)
│   │       ├── types/
│   │       │   └── index.ts
│   │       └── utils/
│   │           ├── audit.ts             # Helper de audit log
│   │           ├── cpf.ts               # Validacao de CPF
│   │           ├── disposable-emails.ts # Lista de emails descartaveis
│   │           ├── hmac.ts              # HMAC para tokens
│   │           ├── pix.ts              # Geracao de QR Code PIX (BR Code)
│   │           └── stripe.ts            # Helpers Stripe SDK
│   │
│   ├── nginx/
│   │   ├── nginx.conf                   # Configuracao principal
│   │   ├── shared-headers.conf          # Security headers compartilhados
│   │   ├── certbot/                     # Dados Let's Encrypt
│   │   ├── ssl/                         # Certificados
│   │   └── conf.d/
│   │       ├── default.conf             # Server blocks por dominio (prod)
│   │       └── dev.conf                 # Server blocks (dev)
│   │
│   ├── azuracast/
│   │   ├── docker-compose.yml           # Stack da radio (fonte-verdade)
│   │   └── README.md
│   │
│   ├── scripts/
│   │   ├── backup-postgres.sh
│   │   ├── build-frontend.sh
│   │   ├── health-check.sh
│   │   └── restore-postgres.sh
│   │
│   ├── docker-compose.yml               # Producao
│   ├── docker-compose.dev.yml           # Desenvolvimento
│   └── .env.example
│
├── src/                                 # Frontend React SPA
│   ├── App.tsx                          # Router + providers
│   ├── contexts/
│   │   ├── AuthContext.tsx              # JWT auth context
│   │   └── CartContext.tsx             # Carrinho da loja (localStorage)
│   ├── pages/
│   │   ├── Subscribe.tsx                # Landing page
│   │   ├── Register.tsx                 # Cadastro (stepper)
│   │   ├── Login.tsx                    # Login
│   │   ├── AdminLogin.tsx               # Login admin separado
│   │   ├── ForgotPassword.tsx           # Recuperar senha
│   │   ├── VerifyEmail.tsx              # Verificacao de email
│   │   ├── MemberDashboard.tsx          # Area do membro (carteirinha)
│   │   ├── AdminDashboard.tsx           # Painel admin (tabs lazy-loaded)
│   │   ├── PDV.tsx                      # Ponto de venda (verificacao de membro)
│   │   ├── PaymentResult.tsx            # Resultado do pagamento
│   │   ├── shop/                        # Paginas da loja (shop.geeketoys.com.br)
│   │   │   ├── ShopHome.tsx, ProductDetail.tsx
│   │   │   ├── Cart.tsx, ShopCheckout.tsx
│   │   │   ├── OrderConfirmation.tsx
│   │   │   └── ShopLogin.tsx
│   │   ├── TermsOfUse.tsx              # Termos de uso
│   │   └── PrivacyPolicy.tsx            # Politica de privacidade
│   ├── components/
│   │   ├── ui/                          # Componentes base (shadcn-style)
│   │   │   ├── button.tsx, card.tsx, dialog.tsx, input.tsx, label.tsx
│   │   │   ├── tabs.tsx, sheet.tsx, skeleton.tsx, badge.tsx
│   │   │   ├── dropdown-menu.tsx, pagination.tsx, progress.tsx
│   │   │   ├── form-feedback.tsx, loading.tsx, lazy-image.tsx
│   │   │   ├── offline-banner.tsx, skip-link.tsx
│   │   │   ├── section-error-boundary.tsx, success-animation.tsx
│   │   │   └── *.test.tsx
│   │   ├── admin/                       # Tabs admin (lazy loaded)
│   │   │   ├── AdminSidebar.tsx
│   │   │   ├── MembersTab.tsx, UsersTab.tsx
│   │   │   ├── ProductsTab.tsx, ProductModal.tsx        # Gestao da loja
│   │   │   ├── OrdersTab.tsx, OrderDetailModal.tsx      # Pedidos da loja
│   │   │   ├── LogsTab.tsx, ReportsTab.tsx, SettingsTab.tsx
│   │   │   └── RealtimeMetrics.tsx
│   │   ├── store/                       # Componentes da loja
│   │   │   ├── ShopHeader.tsx, CategoryNav.tsx
│   │   │   ├── ProductCard.tsx, ProductGrid.tsx
│   │   │   ├── CartDrawer.tsx, MemberDiscountBadge.tsx
│   │   │   └── useShopMember.ts
│   │   ├── member/                      # Componentes do dashboard membro
│   │   │   ├── MembershipCard.tsx
│   │   │   ├── AccountSection.tsx, BenefitsSection.tsx
│   │   │   ├── SubscriptionCard.tsx, DiscountStrip.tsx
│   │   │   ├── OnboardingGuide.tsx
│   │   │   └── QuickActions.tsx
│   │   ├── registration/                # Stepper de cadastro
│   │   │   ├── RegistrationStepper.tsx
│   │   │   ├── StepAccount.tsx, StepPersonalData.tsx
│   │   │   ├── StepEmailVerification.tsx
│   │   │   ├── StepContract.tsx, StepPayment.tsx
│   │   │   └── ...
│   │   ├── reports/                     # Graficos (lazy loaded)
│   │   │   ├── RevenueChart.tsx, MembersChart.tsx
│   │   │   ├── ChurnMetrics.tsx
│   │   │   └── ReportFilters.tsx
│   │   ├── ContractModal.tsx, PaymentModal.tsx
│   │   ├── MemberModal.tsx, UserModal.tsx, ProfileEditModal.tsx
│   │   ├── RenewModal.tsx, UpgradeModal.tsx
│   │   ├── StripePaymentForm.tsx
│   │   ├── SubscriptionManagement.tsx
│   │   ├── QRScanner.tsx, RadioMiniPlayer.tsx
│   │   ├── MembersTable.tsx, MemberFilters.tsx
│   │   ├── MemberActivityHistory.tsx, VirtualTable.tsx
│   │   ├── DataTable.tsx, PendingPaymentScreen.tsx
│   │   ├── CookieConsent.tsx, ErrorBoundary.tsx
│   │   └── GoogleSignInButton.tsx
│   ├── hooks/
│   │   ├── useMembers.ts
│   │   ├── useRealtimeStats.ts, useNowPlaying.ts
│   │   ├── useDebounce.ts, useIdleTimer.ts
│   │   ├── useConfirm.tsx, useUrlFilters.ts
│   │   ├── useKeyboardShortcuts.ts, useOnlineStatus.ts
│   │   └── *.test.ts
│   ├── lib/
│   │   ├── api-client.ts                # Cliente HTTP (fetch + JWT auto-refresh)
│   │   ├── members.ts, payments.ts
│   │   ├── products.ts, orders.ts       # Loja (catalogo e pedidos)
│   │   ├── subscriptions.ts, email.ts, reports.ts
│   │   ├── logs.ts, settings.ts, stripe.ts
│   │   ├── contract-generator.ts        # Gera PDF do contrato
│   │   ├── contract-storage.ts
│   │   ├── analytics.ts, error-tracking.ts, logger.ts
│   │   ├── cpf-validation.ts, email-validation.ts
│   │   ├── password-validation.ts, sanitize.ts
│   │   ├── rate-limit.ts, retry.ts
│   │   ├── signature-utils.ts, subdomain.ts
│   │   ├── constants.ts, utils.ts
│   │   └── *.test.ts
│   └── types/
│       └── index.ts
│
├── CLAUDE.md                            # Guia operacional para Claude Code
├── DEPLOY.md                            # Guia de deploy na VPS
├── README.md                            # Visao geral do produto
├── index.html
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
├── commitlint.config.js
├── tsconfig.json, tsconfig.app.json, tsconfig.node.json
└── .env.example
```

## 10. Redes Sociais

| Plataforma | Link                                    |
| ---------- | --------------------------------------- |
| Instagram  | https://instagram.com/geeketoys         |
| Facebook   | https://facebook.com/geeketoyscolection |
| TikTok     | https://tiktok.com/@geeketoys           |
| WhatsApp   | https://wa.me/5521985464666             |
| Shopee     | https://shopee.com.br/geeketoys         |
