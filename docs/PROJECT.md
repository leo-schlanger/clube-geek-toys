# Clube Geek & Toys — Documentacao do Projeto

> **Ultima atualizacao:** 19 de Abril de 2026

## 1. Dados da Empresa

| Campo             | Valor                                                            |
| ----------------- | ---------------------------------------------------------------- |
| **Razao Social**  | N. Stanley Schlanger Comercio de Artigos em Geral Ltda           |
| **Nome Fantasia** | Geek & Toys                                                      |
| **CNPJ**          | 52.846.344/0001-10                                               |
| **Endereco**      | R. Barata Ribeiro, 181 - loja J, Copacabana, Rio de Janeiro - RJ |
| **CEP**           | 22011-001                                                        |
| **Telefone**      | (21) 98546-4666                                                  |
| **Email**         | geeketoys@gmail.com                                              |
| **Site**          | geeketoys.com.br                                                 |

## 2. Visao do Produto

Clube de vantagens digital para loja fisica e online de produtos geek, colecionaveis e brinquedos. Os membros assinam um plano e recebem descontos exclusivos, acumulam pontos de fidelidade em cada compra e possuem uma carteirinha digital com QR Code.

### Planos de Assinatura

| Plano  | Mensal   | Anual     | Desc. Produtos | Desc. Servicos | Multiplicador de Pontos |
| ------ | -------- | --------- | -------------- | -------------- | ----------------------- |
| Silver | R$ 19,90 | R$ 199,90 | 10%            | 20%            | 1x                      |
| Gold   | R$ 39,90 | R$ 399,90 | 15%            | 35%            | 2x                      |
| Black  | R$ 49,90 | R$ 499,90 | 20%            | 50%            | 3x                      |

**Calculo de pontos:** `pontos = valor_compra * multiplicador_plano`. Exemplo: compra de R$ 100,00 no plano Gold = 200 pontos.

## 3. Modulos do Sistema

### 3.1 Modulo Membro

Cadastro em etapas (stepper), dashboard com carteirinha digital, historico de pontos, gestao de assinatura e renovacao/upgrade de plano. Fluxo completo: criacao de conta, verificacao de email, dados pessoais, assinatura de contrato digital e pagamento.

### 3.2 Modulo Admin

Painel administrativo com gestao de membros (filtros, busca, paginacao server-side), gerenciamento de pagamentos (confirmacao manual de PIX, estornos), sistema de pontos (bonus, historico), logs de auditoria, logs de email, logs de erro, relatorios com graficos (receita, churn, pontos), gestao de usuarios e roles, e configuracoes do sistema.

### 3.3 Modulo PDV (Ponto de Venda)

Verificacao de membros por CPF ou QR Code, visualizacao de desconto aplicavel, registro de compra com acumulo automatico de pontos, e resgate de pontos.

### 3.4 Modulo Pagamento

Pagamento avulso via cartao de credito (Stripe PaymentIntent) e PIX local (QR Code gerado no servidor). Assinaturas recorrentes via Stripe Subscription. Confirmacao manual de PIX pelo admin. Protecao contra pagamentos duplicados.

### 3.5 Modulo Contrato

Assinatura digital de contrato conforme Lei 14.063/2020. Geracao de PDF no frontend, upload via multipart/form-data com validacao de magic bytes, hash SHA-256 do documento, armazenamento no servidor e envio por email com PDF anexo.

### 3.6 Modulo Email (17 templates)

Envio de emails transacionais via Resend API com templates HTML responsivos, branding da empresa, preheader text, CTAs e footer padronizado. Todos os envios sao registrados na tabela `email_logs`.

### 3.7 Modulo Radio

Radio online via AzuraCast (stack independente). Player integrado no site institucional (`geeketoys.com.br`). Scripts de automacao para download, upload e gestao de playlists.

### 3.8 Modulo Analytics

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
| plan                 | VARCHAR(10)  | NOT NULL, CHECK IN ('silver','gold','black')                                    |
| status               | VARCHAR(20)  | NOT NULL, DEFAULT 'pending', CHECK IN ('active','pending','inactive','expired') |
| payment_type         | VARCHAR(10)  | NOT NULL, CHECK IN ('monthly','annual')                                         |
| start_date           | DATE         | Nullable                                                                        |
| expiry_date          | DATE         | Nullable                                                                        |
| points               | INTEGER      | NOT NULL, DEFAULT 0, CHECK >= 0                                                 |
| pending_payment      | JSONB        | Nullable, dados do pagamento pendente                                           |
| subscription_id      | TEXT         | Nullable, ID da assinatura Stripe                                               |
| subscription_status  | VARCHAR(20)  | Nullable                                                                        |
| auto_renewal         | BOOLEAN      | DEFAULT FALSE                                                                   |
| activated_at         | TIMESTAMPTZ  | Nullable                                                                        |
| activated_by_payment | TEXT         | Nullable, ID do pagamento que ativou                                            |
| stripe_customer_id   | TEXT         | Nullable                                                                        |
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

### 4.6 Tabela `point_transactions`

| Coluna         | Tipo          | Restricoes / Notas                                    |
| -------------- | ------------- | ----------------------------------------------------- |
| id             | UUID          | PK, DEFAULT uuid_generate_v4()                        |
| member_id      | UUID          | FK → members(id) ON DELETE CASCADE, NOT NULL          |
| type           | VARCHAR(10)   | NOT NULL, CHECK IN ('earn','redeem','expire','bonus') |
| points         | INTEGER       | NOT NULL                                              |
| balance        | INTEGER       | NOT NULL, saldo apos a transacao                      |
| description    | TEXT          | Nullable                                              |
| purchase_value | DECIMAL(10,2) | Nullable, valor da compra (quando type = 'earn')      |
| expires_at     | DATE          | Nullable                                              |
| expired        | BOOLEAN       | DEFAULT FALSE                                         |
| is_promotion   | BOOLEAN       | DEFAULT FALSE                                         |
| created_by     | UUID          | FK → users(id), Nullable                              |
| created_at     | TIMESTAMPTZ   | NOT NULL, DEFAULT NOW()                               |

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

### Points (`/points`)

| Metodo | Endpoint                     | Descricao                          | Auth         |
| ------ | ---------------------------- | ---------------------------------- | ------------ |
| GET    | `/points/:memberId/balance`  | Saldo de pontos                    | JWT/owner    |
| GET    | `/points/:memberId/history`  | Historico de transacoes            | JWT/owner    |
| GET    | `/points/:memberId/expiring` | Pontos proximos de expirar         | JWT/owner    |
| POST   | `/points/:memberId/earn`     | Registrar compra (acumular pontos) | seller/admin |
| POST   | `/points/:memberId/bonus`    | Adicionar pontos bonus             | admin        |
| POST   | `/points/:memberId/redeem`   | Resgatar pontos                    | seller/admin |

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

| Metodo | Endpoint           | Descricao                    | Auth             |
| ------ | ------------------ | ---------------------------- | ---------------- |
| POST   | `/webhook/stripe`  | Processa eventos do Stripe   | Signature Stripe |
| POST   | `/webhook/pagbank` | Retorna 410 Gone (deprecado) | -                |

### Reports (`/reports`)

| Metodo | Endpoint                   | Descricao                             | Auth  |
| ------ | -------------------------- | ------------------------------------- | ----- |
| GET    | `/reports/daily`           | Relatorio diario                      | admin |
| GET    | `/reports/monthly`         | Relatorio mensal (parametro `months`) | admin |
| GET    | `/reports/churn`           | Churn por mes (expired + cancelled)   | admin |
| GET    | `/reports/points-overview` | Pontos ganhos vs resgatados por mes   | admin |
| GET    | `/reports/today-revenue`   | Receita do dia                        | admin |
| GET    | `/reports/realtime-stats`  | Metricas em tempo real                | admin |

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

| Template                      | Assunto                         | Trigger                                    | Variaveis principais                                                    | Destinatario |
| ----------------------------- | ------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- | ------------ |
| `verify-email`                | Verifique seu e-mail            | Backend (auto, apos registro)              | name, verify_url                                                        | Membro       |
| `password-reset`              | Redefinicao de senha            | Backend (auto, solicitacao do membro)      | name, reset_url                                                         | Membro       |
| `welcome`                     | Bem-vindo ao Clube Geek & Toys! | Frontend (apos ativacao)                   | name, plan                                                              | Membro       |
| `payment-confirmed`           | Pagamento confirmado            | Webhook Stripe / Admin confirma PIX        | name, amount, plan, expiry_date                                         | Membro       |
| `payment-failed`              | Pagamento nao aprovado          | Webhook Stripe                             | name                                                                    | Membro       |
| `subscription-created`        | Assinatura ativada              | Backend (auto)                             | name, plan, amount, card_last_four                                      | Membro       |
| `subscription-payment`        | Cobranca recorrente processada  | Webhook Stripe                             | name, amount, plan, next_payment                                        | Membro       |
| `subscription-paused`         | Assinatura pausada              | Backend (auto)                             | name                                                                    | Membro       |
| `subscription-resumed`        | Assinatura reativada            | Backend (auto)                             | name                                                                    | Membro       |
| `subscription-cancelled`      | Assinatura cancelada            | Backend / Webhook (3 falhas)               | name                                                                    | Membro       |
| `subscription-payment-failed` | Falha na cobranca recorrente    | Webhook Stripe                             | name, amount, failed_count                                              | Membro       |
| `renewal-reminder`            | Sua assinatura expira em breve  | Cron diario (6h UTC, dedup via email_logs) | name, plan, expiry_date                                                 | Membro       |
| `member-expired`              | Sua assinatura expirou          | Cron diario                                | name, plan                                                              | Membro       |
| `points-expiring`             | Seus pontos expiram em breve    | Cron diario (6h UTC, dedup via email_logs) | name, points, expiry_date                                               | Membro       |
| `contract-signed`             | Contrato assinado               | Frontend (apos assinatura digital)         | name, plan, signed_at, hash                                             | Membro       |
| `admin-pix-pending`           | PIX pendente de confirmacao     | Backend (auto, apos criacao de PIX)        | member_name, member_email, plan, amount, tx_id, payment_id              | Admin        |
| `admin-new-member`            | Novo membro cadastrado          | Backend (auto, apos cadastro)              | member_name, member_email, member_cpf, member_phone, plan, payment_type | Admin        |

## 7. Roles e Permissoes

| Role       | Acesso                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `member`   | Proprio perfil, proprios pagamentos, proprios pontos (saldo/historico/expirando), propria assinatura, proprio contrato, exportar dados (LGPD), excluir conta        |
| `seller`   | Verificar membros (CPF/QR), listar membros, ver detalhes de membro, registrar compra (acumular pontos), resgatar pontos                                             |
| `admin`    | Tudo de seller + bonus de pontos, confirmar PIX, estornar pagamento, gerenciar roles, relatorios, logs (audit/email/erro), configuracoes do sistema, exportar dados |
| `disabled` | Bloqueado — nao pode fazer login                                                                                                                                    |

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

| Variavel                | Tipo   | Default                                        | Descricao                                       |
| ----------------------- | ------ | ---------------------------------------------- | ----------------------------------------------- |
| `NODE_ENV`              | string | `development`                                  | Ambiente (development, production, test)        |
| `PORT`                  | number | `3001`                                         | Porta do servidor Express                       |
| `STRIPE_WEBHOOK_SECRET` | string | -                                              | Secret do webhook Stripe (obrigatorio em prod)  |
| `PIX_KEY`               | string | -                                              | Chave PIX para geracao de QR Code               |
| `PIX_MERCHANT_NAME`     | string | -                                              | Nome do comerciante no PIX                      |
| `PIX_MERCHANT_CITY`     | string | -                                              | Cidade do comerciante no PIX                    |
| `GOOGLE_CLIENT_ID`      | string | -                                              | Client ID do Google OAuth                       |
| `FROM_EMAIL`            | string | `Clube Geek & Toys <contato@geeketoys.com.br>` | Remetente dos emails                            |
| `ADMIN_EMAIL`           | string | `admin@geeketoys.com.br`                       | Email que recebe notificacoes admin             |
| `ALLOWED_ORIGINS`       | string | -                                              | Origens CORS adicionais (separadas por virgula) |

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
│   │       │       └── 005-stripe-migration.sql
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
│   │       │   ├── points.routes.ts
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
│   │       │   ├── points.service.ts
│   │       │   ├── contract.service.ts
│   │       │   ├── email.service.ts     # 17 templates HTML
│   │       │   ├── webhook.service.ts
│   │       │   ├── report.service.ts
│   │       │   ├── log.service.ts
│   │       │   ├── lgpd.service.ts
│   │       │   ├── settings.service.ts
│   │       │   └── cron.service.ts      # Jobs agendados (renovacao, pontos)
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
│   │   └── AuthContext.tsx              # JWT auth context
│   ├── pages/
│   │   ├── Subscribe.tsx                # Landing page
│   │   ├── Register.tsx                 # Cadastro (stepper)
│   │   ├── Login.tsx                    # Login
│   │   ├── AdminLogin.tsx               # Login admin separado
│   │   ├── ForgotPassword.tsx           # Recuperar senha
│   │   ├── VerifyEmail.tsx              # Verificacao de email
│   │   ├── MemberDashboard.tsx          # Area do membro (carteirinha, pontos)
│   │   ├── AdminDashboard.tsx           # Painel admin (tabs lazy-loaded)
│   │   ├── PDV.tsx                      # Ponto de venda
│   │   ├── PaymentResult.tsx            # Resultado do pagamento
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
│   │   │   ├── MembersTab.tsx, PointsTab.tsx, UsersTab.tsx
│   │   │   ├── LogsTab.tsx, ReportsTab.tsx, SettingsTab.tsx
│   │   │   └── RealtimeMetrics.tsx
│   │   ├── member/                      # Componentes do dashboard membro
│   │   │   ├── MembershipCard.tsx, PointsSection.tsx
│   │   │   ├── AccountSection.tsx, BenefitsSection.tsx
│   │   │   ├── SubscriptionCard.tsx, DiscountStrip.tsx
│   │   │   ├── OnboardingGuide.tsx, PointsSummaryBar.tsx
│   │   │   └── QuickActions.tsx
│   │   ├── registration/                # Stepper de cadastro
│   │   │   ├── RegistrationStepper.tsx
│   │   │   ├── StepAccount.tsx, StepPersonalData.tsx
│   │   │   ├── StepEmailVerification.tsx
│   │   │   ├── StepContract.tsx, StepPayment.tsx
│   │   │   └── ...
│   │   ├── reports/                     # Graficos (lazy loaded)
│   │   │   ├── RevenueChart.tsx, MembersChart.tsx
│   │   │   ├── PointsChart.tsx, ChurnMetrics.tsx
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
│   │   ├── useMembers.ts, usePoints.ts
│   │   ├── useRealtimeStats.ts, useNowPlaying.ts
│   │   ├── useDebounce.ts, useIdleTimer.ts
│   │   ├── useConfirm.tsx, useUrlFilters.ts
│   │   ├── useKeyboardShortcuts.ts, useOnlineStatus.ts
│   │   └── *.test.ts
│   ├── lib/
│   │   ├── api-client.ts                # Cliente HTTP (fetch + JWT auto-refresh)
│   │   ├── members.ts, payments.ts, points.ts
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
