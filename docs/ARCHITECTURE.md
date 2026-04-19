# Arquitetura Tecnica - Clube Geek & Toys

> **Ultima atualizacao:** 19 de Abril de 2026

## 1. Visao Geral do Sistema

O Clube Geek & Toys opera duas stacks independentes compartilhando a mesma VPS:

| Stack               | Diretorio na VPS        | Proposito                                                 |
| ------------------- | ----------------------- | --------------------------------------------------------- |
| **Clube SaaS**      | `/opt/clube-geek-toys/` | Plataforma de assinatura, PDV, admin, carteirinha digital |
| **Radio AzuraCast** | `/opt/azuracast/`       | Radio online com painel de gestao e streaming             |

Ambas sao orquestradas via Docker Compose. Um unico Nginx atua como reverse proxy e faz terminacao SSL (Let's Encrypt) para todos os dominios. O certificado unico cobre todos os subdominios via SAN.

```
 Navegador                       VPS (Ubuntu 24.04 + Docker)
 ─────────                 ┌──────────────────────────────────────────────┐
                           │                                              │
  club.*  ─────────┐       │  ┌──────────────────────────────────────┐    │
  admin.* ─────────┤       │  │         Nginx (80/443)               │    │
  adm.*   ─────────┤──────►│  │  SSL termination + Reverse Proxy     │    │
  api.*   ─────────┤       │  │  Security headers (HSTS, nosniff)    │    │
  analytics.* ─────┤       │  └──┬──────┬──────┬──────┬──────────────┘    │
  radio.* ─────────┘       │     │      │      │      │                   │
                           │     ▼      ▼      ▼      ▼                   │
                           │  ┌─────┐┌─────┐┌─────┐┌──────────┐          │
                           │  │ SPA ││ API ││Umami││AzuraCast │          │
                           │  │dist/││:3001││:3000││  :80     │          │
                           │  └─────┘└──┬──┘└──┬──┘└──────────┘          │
                           │            │      │                          │
                           │      ┌─────┴──┐┌──┴───┐                     │
                           │      │Postgres││umami-│                     │
                           │      │ :5432  ││ db   │                     │
                           │      └────────┘└──────┘                     │
                           │                                              │
                           │  ┌──────────┐                                │
                           │  │ Certbot  │  Auto-renovacao SSL            │
                           │  └──────────┘                                │
                           └──────────────────────────────────────────────┘
                                      │                │
                                ┌─────┴──────┐  ┌──────┴──────┐
                                │   Stripe   │  │   Resend    │
                                │ (payments) │  │  (emails)   │
                                └────────────┘  └─────────────┘
```

---

## 2. Stack Tecnologico

### Frontend

| Tecnologia            | Versao | Uso                                         |
| --------------------- | ------ | ------------------------------------------- |
| React                 | 19     | SPA com subdomain routing                   |
| Vite                  | 7      | Build tooling, code splitting, HMR          |
| Tailwind CSS          | 3      | Estilizacao utility-first                   |
| TanStack Query        | 5      | Cache de estado do servidor                 |
| Framer Motion         | 12     | Animacoes (flip da carteirinha, transicoes) |
| React Hook Form + Zod | 7 / 4  | Formularios com validacao tipada            |
| qrcode.react          | 4      | QR Code da carteirinha digital              |
| signature_pad         | 5      | Captura de assinatura digital no canvas     |
| pdf-lib               | 1.17   | Geracao de PDF do contrato no client-side   |
| Stripe Elements       | 6 / 9  | Tokenizacao segura de cartao                |
| React Router          | 7      | Roteamento SPA                              |
| Recharts              | 2      | Graficos no painel admin                    |
| Lucide React          | -      | Icones                                      |

### Backend

| Tecnologia         | Versao              | Uso                                        |
| ------------------ | ------------------- | ------------------------------------------ |
| Node.js            | 22 (runtime Docker) | Runtime do servidor                        |
| Express            | 4                   | Framework HTTP                             |
| PostgreSQL         | 16 (Alpine)         | Banco principal (pg driver)                |
| JWT (jsonwebtoken) | 9                   | Autenticacao stateless                     |
| bcrypt             | 5                   | Hash de senhas (12 rounds)                 |
| node-cron          | 3                   | Tarefas agendadas                          |
| Zod                | 3                   | Validacao de entrada em todos os endpoints |
| Stripe SDK         | 22                  | Pagamentos com cartao e assinaturas        |
| Helmet             | 8                   | Security headers                           |
| multer             | 1.4                 | Upload de arquivos (contratos)             |

### Infraestrutura

| Tecnologia     | Uso                                                          |
| -------------- | ------------------------------------------------------------ |
| Docker Compose | Orquestracao de containers                                   |
| Nginx Alpine   | Reverse proxy, SSL, SPA serving                              |
| Certbot        | Emissao e renovacao automatica de certificados Let's Encrypt |
| GitHub Actions | CI/CD — build + deploy automatico no push pra `master`       |

### Servicos Externos

| Servico                 | Uso                                                        |
| ----------------------- | ---------------------------------------------------------- |
| Stripe                  | Pagamentos com cartao de credito e assinaturas recorrentes |
| Resend API              | Envio transacional de emails (17 templates)                |
| Umami (self-hosted)     | Analytics de navegacao e eventos                           |
| AzuraCast (self-hosted) | Radio online (Liquidsoap + Icecast)                        |

---

## 3. Diagrama de Rede Docker

O Nginx do clube participa de **duas redes Docker** simultaneamente:

```
┌──────────────────────────────────────────────────────────────┐
│                    server_default (rede interna)              │
│                                                              │
│  ┌───────┐  ┌──────┐  ┌──────────┐  ┌───────┐  ┌────────┐  │
│  │ nginx │  │ api  │  │ postgres │  │ umami │  │umami-db│  │
│  │ 80/443│  │ 3001 │  │  5432    │  │ 3000  │  │  5432  │  │
│  └───┬───┘  └──────┘  └──────────┘  └───────┘  └────────┘  │
│      │                                                       │
└──────┼───────────────────────────────────────────────────────┘
       │
       │  (nginx tambem conecta na rede externa)
       │
┌──────┼───────────────────────┐
│      ▼    azuracast_network  │
│  ┌──────────┐    (external)  │
│  │azuracast │                │
│  │   :80    │                │
│  └──────────┘                │
└──────────────────────────────┘
```

**Ordem de inicializacao importa:** a rede `azuracast_network` e criada pelo compose do AzuraCast. Se o AzuraCast nao estiver rodando quando o nginx do clube subir, a rede externa nao existe e o nginx falha ao iniciar.

O Nginx resolve `http://azuracast:80` pelo DNS interno do Docker para fazer proxy do painel da radio.

Streams Icecast nas portas `8000-8046` sao expostas diretamente no host (bypass do nginx), porque Icecast nao suporta HTTP upgrade necessario para proxy.

---

## 4. Fluxo de Autenticacao (JWT)

```
  ┌──────────┐     POST /auth/login      ┌─────────────┐
  │  Login   │ ─────────────────────────► │   bcrypt    │
  │  Form    │                            │   verify    │
  └──────────┘                            └──────┬──────┘
                                                  │
                                           ┌──────┴──────┐
                                           │ Gera tokens: │
                                           │ • access     │
                                           │ • refresh    │
                                           └──────┬──────┘
                                                  │
                               ┌──────────────────┴──────────────────┐
                               ▼                                     ▼
                       ┌──────────────┐                    ┌──────────────┐
                       │   Response:  │    (15min expira)  │ POST /auth   │
                       │   tokens +   │ ──────────────────►│  /refresh    │
                       │   user data  │                    └──────┬───────┘
                       └──────────────┘                           │
                                                           ┌──────┴──────┐
                                                           │ Novo access │
                                                           │ + refresh   │
                                                           │ (rotacao)   │
                                                           └─────────────┘
```

### Detalhes

| Aspecto                  | Implementacao                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Access token**         | JWT assinado com HS256, payload `{ userId, email, role }`, expira em **15 minutos**                                                     |
| **Refresh token**        | 64 bytes aleatorios (crypto.randomBytes), hash SHA-256 armazenado na coluna `users.refresh_token_hash`, validade efetiva de **30 dias** |
| **Rotacao**              | A cada refresh, o token antigo e invalidado e um novo par e emitido                                                                     |
| **Cookie**               | Refresh token enviado como httpOnly cookie (sameSite: lax)                                                                              |
| **Hash de senha**        | bcrypt com 12 rounds                                                                                                                    |
| **RBAC**                 | Middleware `requireRole()` verifica `role` do JWT antes de permitir acesso                                                              |
| **Roles**                | `member`, `seller`, `admin`, `disabled`                                                                                                 |
| **Google OAuth**         | Verificacao de ID token via endpoint `oauth2.googleapis.com/tokeninfo`, com validacao de `audience`                                     |
| **Verificacao de email** | Token HMAC com TTL de 24h, uso unico via tabela `consumed_verification_tokens`                                                          |

---

## 5. Fluxo de Cadastro (3 etapas)

O cadastro e dividido em 3 etapas sequenciais. O usuario pode interromper e retomar de onde parou (deteccao de etapa ja concluida). Dados parciais sao salvos em `localStorage` como rascunho.

### Etapa 1: Conta + Dados Pessoais

1. Criar conta com email + senha **ou** Google OAuth
2. Verificar email (link HMAC com validade de 24h)
3. Preencher dados pessoais: nome completo, CPF (validado), telefone
4. Selecionar plano (Silver / Gold / Black) e frequencia (mensal / anual)

### Etapa 2: Contrato Digital

1. Exibir termos do contrato para leitura
2. Coletar assinatura manuscrita via canvas HTML5 (`signature_pad`)
3. Gerar PDF no client-side com `pdf-lib`, incluindo:
   - Texto do contrato
   - Imagem da assinatura
   - Metadados: IP, user-agent, timestamp, hash SHA-256
4. Upload do PDF para o servidor (`/app/uploads/contracts/`)
5. Email com PDF anexado para o membro + copia para o admin

### Etapa 3: Pagamento

1. Escolher metodo: PIX (QR Code) ou Cartao (Stripe Elements)
2. Processar pagamento (ver secao 6)
3. Membro ativado apos confirmacao

### Protecoes

- **Deteccao de usuario retornando:** ao fazer login, o frontend verifica quais etapas ja foram concluidas e pula automaticamente
- **Rascunho auto-save:** `localStorage` persiste dados parciais do formulario
- **Protecao contra envio duplo:** `findRecentPayment()` verifica se existe pagamento pago nos ultimos 7 dias antes de criar outro

---

## 6. Fluxo de Pagamento

### 6.1 Cartao de Credito (Stripe)

```
  Frontend                         API                          Stripe
  ────────                     ────────                       ────────
     │                            │                              │
     │  POST /checkout/card/create│                              │
     │───────────────────────────►│                              │
     │                            │  stripe.paymentIntents.create│
     │                            │─────────────────────────────►│
     │                            │◄─────────────────────────────│
     │    { clientSecret }        │                              │
     │◄───────────────────────────│                              │
     │                            │                              │
     │  confirmCardPayment()      │                              │
     │  (Stripe Elements)         │                              │
     │───────────────────────────────────────────────────────────►│
     │                            │                              │
     │                            │  webhook: payment_intent.    │
     │                            │           succeeded          │
     │                            │◄─────────────────────────────│
     │                            │  activateMember()            │
     │                            │  email: payment-confirmed    │
     │                            │  email: welcome              │
```

**Fluxo detalhado:**

1. Frontend chama `POST /checkout/card/create` com valor, email e memberId
2. API cria um `PaymentIntent` no Stripe (valor em centavos, moeda BRL, metadata com memberId)
3. API persiste pagamento `pending` no banco e retorna `clientSecret`
4. Frontend confirma via `Stripe.confirmCardPayment()` — dados do cartao nunca tocam o servidor
5. Stripe envia webhook `payment_intent.succeeded` para `POST /webhook/stripe`
6. Webhook `activateMember()`: atualiza status do membro para `active`, calcula `expiry_date`, envia emails

### 6.2 PIX (Geracao Local)

PIX nao usa Stripe (indisponivel no Brasil para PIX via Stripe). O QR Code e gerado localmente no padrao EMV.

```
  Frontend                        API                         Admin
  ────────                    ────────                      ──────
     │                           │                             │
     │  POST /pix/create         │                             │
     │──────────────────────────►│                             │
     │                           │  generatePixEMV()           │
     │   { pixData, paymentId }  │                             │
     │◄──────────────────────────│                             │
     │                           │  email: admin-pix-pending ─►│
     │  Exibe QR Code            │                             │
     │                           │                             │
     │  GET /payment/status/:id  │                             │
     │──────────────────────────►│  (poll DB-based)            │
     │   { status: 'pending' }   │                             │
     │◄──────────────────────────│                             │
     │                           │                             │
     │                           │  POST /payments/:id/confirm │
     │                           │◄────────────────────────────│
     │                           │  activateMember()           │
     │                           │  email: payment-confirmed   │
     │                           │  email: welcome             │
```

**Fluxo detalhado:**

1. Frontend chama `POST /pix/create` com valor e memberId
2. API gera codigo EMV com chave PIX da loja, valor, txId unico, nome e cidade do merchant
3. API salva pagamento `pending` no banco e envia email `admin-pix-pending` para o admin
4. Frontend exibe QR Code e faz polling em `GET /payment/status/:id` (consulta o banco, nao o Stripe)
5. Admin recebe notificacao por email, verifica extrato bancario e confirma via `POST /payments/:id/confirm`
6. Membro ativado + emails de confirmacao e boas-vindas

### 6.3 Assinatura Recorrente (Stripe Subscription)

```
  Frontend                        API                          Stripe
  ────────                    ────────                       ────────
     │                           │                              │
     │ POST /subscription/create │                              │
     │──────────────────────────►│ stripe.subscriptions.create  │
     │                           │  (default_incomplete)        │
     │                           │─────────────────────────────►│
     │   { clientSecret }        │◄─────────────────────────────│
     │◄──────────────────────────│                              │
     │                           │                              │
     │  PaymentElement confirm   │                              │
     │──────────────────────────────────────────────────────────►│
     │                           │                              │
     │                           │  webhook: invoice.paid       │
     │                           │◄─────────────────────────────│
     │                           │  extend expiry_date          │
     │                           │  email: subscription-payment │
     │                           │                              │
     │                           │  (recorrencia mensal/anual)  │
     │                           │  webhook: invoice.paid       │
     │                           │◄─────────────────────────────│
     │                           │  extend expiry_date          │
```

**Ciclo de vida da assinatura:**

| Evento                              | Acao                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /subscription/create`         | Cria Stripe Subscription com `payment_behavior: default_incomplete`, retorna `clientSecret`                 |
| Cliente confirma primeiro pagamento | Via `PaymentElement` no frontend                                                                            |
| `invoice.paid` (webhook)            | Estende `expiry_date` do membro, reseta `failed_payments`, email `subscription-payment`                     |
| `invoice.payment_failed`            | Incrementa `failed_payments`, email `subscription-payment-failed`                                           |
| 3 falhas consecutivas               | Cancela assinatura automaticamente no Stripe e no banco, email `subscription-cancelled`                     |
| `POST /subscription/:id/pause`      | `pause_collection: void` no Stripe, status `paused`, email `subscription-paused`                            |
| `POST /subscription/:id/resume`     | Remove `pause_collection`, status `authorized`, email `subscription-resumed`                                |
| `POST /subscription/:id/cancel`     | `stripe.subscriptions.cancel()`, status `cancelled`, `auto_renewal = FALSE`, email `subscription-cancelled` |
| `customer.subscription.deleted`     | Cancelamento externo (via dashboard Stripe), mesma logica de cancelamento                                   |

---

## 7. Sistema de Pontos

### Acumulo

```
pontos = floor(valorCompra * multiplicador)

Multiplicadores por plano:
  Silver: 1x  |  Gold: 2x  |  Black: 3x
```

- Apenas membros com status `active` podem acumular pontos
- Compras promocionais: `isPromotion = true` gera transacao de **0 pontos** (registrada para auditoria)
- Transacao de tipo `earn` com campo `purchase_value` para rastreio do valor original

### Expiracao

- **Validade:** 6 meses a partir da data de acumulo (`expires_at`)
- **Cron diario:** marca transacoes `earn` expiradas como `expired = TRUE`, cria transacao `expire` com pontos negativos, recalcula saldo
- **Notificacao:** email `points-expiring` enviado 5-8 dias antes da expiracao

### Resgate

Faixas fixas validadas server-side (tabela `REDEMPTION_RULES`):

| Pontos | Desconto  |
| ------ | --------- |
| 500    | R$ 25,00  |
| 800    | R$ 50,00  |
| 1.500  | R$ 100,00 |

### Calculo de Saldo Real

O saldo real e sempre calculado a partir das transacoes, excluindo pontos `earn` com `expires_at < hoje` mesmo que o cron ainda nao tenha processado:

```sql
SUM(CASE
  WHEN type = 'earn' AND expired = false AND (expires_at IS NULL OR expires_at >= CURRENT_DATE) THEN points
  WHEN type = 'bonus' THEN points
  WHEN type = 'redeem' THEN points   -- valores negativos
  WHEN type = 'expire' THEN points   -- valores negativos
  ELSE 0
END)
```

### Reconciliacao

O cron `reconcilePointsBalances` corrige drift entre `members.points` (cache desnormalizado) e a soma real das transacoes. Registra divergencias no `audit_logs`.

---

## 8. Ciclo de Vida do Membro

```
                    ┌───────────────────────────────────────┐
                    │                                       │
                    ▼                                       │
  ┌─────────┐   pagamento   ┌────────┐   expiry_date   ┌────────┐
  │ pending │──────────────►│ active │──────────────►│expired │
  └─────────┘   confirmado  └────┬───┘   (cron)       └────┬───┘
                                 │                          │
                                 │ renovacao                │ novo
                                 │ (preserva dias)          │ pagamento
                                 │                          │
                                 ▼                          ▼
                            ┌────────┐              ┌────────┐
                            │ active │              │ active │
                            │(expiry │              │(fresh  │
                            │extended)│              │start)  │
                            └────────┘              └────────┘
```

| Transicao                        | Condicao                                | Comportamento                                                                            |
| -------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pending` -> `active`            | Pagamento confirmado (webhook ou admin) | Define `start_date`, calcula `expiry_date` (30d ou 365d)                                 |
| `active` -> `active` (renovacao) | Pagamento enquanto ainda ativo          | Estende `expiry_date` a partir da data de expiracao atual (nao perde dias restantes)     |
| `active` -> `expired`            | `expiry_date < hoje` + cron diario      | Marca `status = 'expired'`, envia email `member-expired`                                 |
| `expired` -> `active`            | Novo pagamento                          | Fresh start: `expiry_date` calculado a partir de hoje                                    |
| Assinatura ativa                 | `auto_renewal = TRUE`                   | Nao expira pelo cron (Stripe cobra automaticamente e estende via webhook `invoice.paid`) |
| Assinatura pausada               | `subscription_status = 'paused'`        | Cron pode expirar normalmente (nao ha cobranca enquanto pausada)                         |

---

## 9. Contrato Digital

O contrato digital segue conformidade com a **Lei 14.063/2020** (assinaturas eletronicas).

### Fluxo

1. Frontend exibe termos do contrato para leitura obrigatoria
2. Membro desenha assinatura em canvas HTML5 (`signature_pad`)
3. Frontend gera PDF com `pdf-lib`, embutindo:
   - Texto integral do contrato
   - Imagem da assinatura
   - Metadados de evidencia
4. PDF enviado para o servidor via upload (`multer`)
5. Servidor armazena em `/app/uploads/contracts/` (volume Docker `uploads`)
6. Email com PDF anexado enviado para o membro
7. Copia do email enviada para o admin

### Metadados de Evidencia

| Campo           | Descricao                            |
| --------------- | ------------------------------------ |
| `ip_address`    | IP do signatario (via `trust proxy`) |
| `user_agent`    | Navegador e sistema operacional      |
| `signed_at`     | Timestamp com timezone (TIMESTAMPTZ) |
| `document_hash` | SHA-256 do conteudo do PDF           |
| `pdf_hash`      | SHA-256 do arquivo PDF armazenado    |

### Status do Contrato

- `active` — contrato vigente
- `superseded` — substituido por versao mais recente (upgrade de plano)
- `revoked` — revogado administrativamente

---

## 10. Carteirinha Digital

A carteirinha digital e renderizada inteiramente no frontend com proporcoes de cartao de credito (1.586:1).

### Frente

- Gradiente metalico por tier (Silver, Gold, Black)
- Icone de chip inteligente (smart chip)
- Icone de pagamento contactless (NFC)
- Efeito holografico com shimmer animado (CSS)
- Nome do membro, plano, data de validade

### Verso

- QR Code gerado com `qrcode.react` contendo dados do membro em formato JSON v1:
  ```json
  {
    "v": 1,
    "id": "uuid",
    "name": "Nome Completo",
    "plan": "gold",
    "status": "active",
    "expiry": "2027-04-19"
  }
  ```
- Informacoes do clube

### Interacao

- Animacao de flip 3D (Framer Motion) ao clicar — rotacao de 180 graus com perspectiva

---

## 11. Emails (17 templates)

Todos os emails usam a API do **Resend** com templates HTML inline renderizados server-side. Design dark-theme com cores da marca (dourado `#d4a520`, fundo `#0a0a1a`).

| #   | Template                      | Gatilho                                                           |
| --- | ----------------------------- | ----------------------------------------------------------------- |
| 1   | `verify-email`                | Apos registro de conta — link HMAC valido por 24h                 |
| 2   | `password-reset`              | Solicitacao de redefinicao de senha — link valido por 1h          |
| 3   | `welcome`                     | Primeira ativacao do membro (pagamento confirmado)                |
| 4   | `payment-confirmed`           | Qualquer pagamento confirmado (cartao ou PIX)                     |
| 5   | `payment-failed`              | Falha em `payment_intent` do Stripe                               |
| 6   | `subscription-created`        | Assinatura recorrente criada                                      |
| 7   | `subscription-payment`        | Cobranca recorrente processada (`invoice.paid`)                   |
| 8   | `subscription-paused`         | Membro pausou assinatura                                          |
| 9   | `subscription-resumed`        | Membro reativou assinatura                                        |
| 10  | `subscription-cancelled`      | Cancelamento (manual ou apos 3 falhas)                            |
| 11  | `subscription-payment-failed` | Falha na cobranca recorrente (`invoice.payment_failed`)           |
| 12  | `renewal-reminder`            | Cron: 5-8 dias antes da expiracao (apenas `auto_renewal = FALSE`) |
| 13  | `member-expired`              | Cron: membro marcado como expirado                                |
| 14  | `points-expiring`             | Cron: pontos que expiram em 5-8 dias                              |
| 15  | `contract-signed`             | Apos assinatura do contrato digital — PDF anexado                 |
| 16  | `admin-pix-pending`           | Pagamento PIX gerado — notifica admin para confirmacao manual     |
| 17  | `admin-new-member`            | Novo membro completou cadastro                                    |

### Deduplicacao

Emails de cron (templates 12-14) usam query `NOT EXISTS` contra `email_logs` para evitar envio duplicado dentro de uma janela de 5-7 dias.

---

## 12. Cron Jobs (diario, 6:00 AM UTC)

Todos executados sequencialmente pelo `node-cron` dentro do container da API. Cada job e independente — falha em um nao impede execucao dos demais.

| #   | Job                               | Descricao                                                                                                                                                                                        |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `expirePoints`                    | Marca transacoes `earn` vencidas como `expired = TRUE`, cria transacao `expire` com pontos negativos, atualiza `members.points`. Usa `FOR UPDATE SKIP LOCKED` para evitar double-processing.     |
| 2   | `sendRenewalReminders`            | Envia `renewal-reminder` para membros ativos com `expiry_date` entre 5-8 dias no futuro e `auto_renewal = FALSE`. Deduplicado via `email_logs`.                                                  |
| 3   | `sendPointsExpiringNotifications` | Envia `points-expiring` para membros com pontos `earn` nao expirados vencendo em 5-8 dias. Agrupado por membro (`SUM`). Deduplicado via `email_logs`.                                            |
| 4   | `expireMembers`                   | Marca `active` -> `expired` para membros com `expiry_date < hoje` **e** (`auto_renewal = FALSE` **ou** `subscription_status = 'paused'`). Nao expira assinaturas ativas. Envia `member-expired`. |
| 5   | `reconcilePointsBalances`         | Compara `members.points` com `SUM(point_transactions.points)`. Corrige divergencias e registra em `audit_logs`.                                                                                  |

Apos todos os jobs, registra `last_cron_run` na tabela `config` para monitoramento de saude.

---

## 13. Banco de Dados (PostgreSQL 16)

### Tabelas

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│    users     │     │   members    │     │    payments      │
├──────────────┤     ├──────────────┤     ├──────────────────┤
│ id (UUID PK) │◄────│ user_id (FK) │     │ id (UUID PK)     │
│ email (UQ)   │     │ cpf (UQ)     │     │ member_id (FK)   │
│ password_hash│     │ full_name    │     │ amount           │
│ role (enum)  │     │ email        │     │ method (enum)    │
│ email_verified│    │ phone        │     │ status (enum)    │
│ refresh_token│     │ plan (enum)  │     │ provider_id      │
│  _hash       │     │ status (enum)│     │ provider_status  │
│ created_at   │     │ payment_type │     │ reference        │
│ updated_at   │     │ start_date   │     │ paid_at          │
└──────────────┘     │ expiry_date  │     │ webhook_processed│
                     │ points       │     │  _at             │
                     │ pending_     │     │ created_at       │
                     │  payment     │     │ updated_at       │
                     │  (JSONB)     │     └──────────────────┘
                     │ subscription_│
                     │  id          │
                     │ auto_renewal │
                     │ stripe_      │
                     │  customer_id │
                     │ activated_at │
                     │ created_at   │
                     │ updated_at   │
                     └──────┬──────┘
                            │
             ┌──────────────┼──────────────┐
             │              │              │
  ┌──────────┴───┐ ┌───────┴──────┐ ┌─────┴─────────┐
  │ point_       │ │subscriptions │ │  contracts    │
  │ transactions │ ├──────────────┤ ├───────────────┤
  ├──────────────┤ │ id (TEXT PK) │ │ id (TEXT PK)  │
  │ id (UUID PK) │ │ member_id FK │ │ member_id FK  │
  │ member_id FK │ │ provider_id  │ │ member_name   │
  │ type (enum)  │ │ status (enum)│ │ member_cpf    │
  │ points       │ │ plan         │ │ member_email  │
  │ balance      │ │ frequency_   │ │ plan          │
  │ description  │ │  type (enum) │ │ signature_    │
  │ purchase_    │ │ transaction_ │ │  preview      │
  │  value       │ │  amount      │ │ signed_at     │
  │ expires_at   │ │ failed_      │ │ ip_address    │
  │ expired      │ │  payments    │ │ user_agent    │
  │ is_promotion │ │ card_last_   │ │ document_hash │
  │ created_by FK│ │  four        │ │ pdf_url       │
  │ created_at   │ │ card_brand   │ │ pdf_path      │
  └──────────────┘ │ payer_email  │ │ pdf_hash      │
                   │ created_at   │ │ status (enum) │
                   │ cancelled_at │ │ created_at    │
                   │ paused_at    │ └───────────────┘
                   └──────┬──────┘
                          │
                ┌─────────┴──────────┐
                │subscription_       │
                │ payments           │
                ├────────────────────┤
                │ id (TEXT PK)       │
                │ subscription_id FK │
                │ member_id FK       │
                │ amount             │
                │ status             │
                │ payment_date       │
                │ provider_payment_id│
                │ failure_reason     │
                └────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌───────────────────┐
│  audit_logs  │  │  email_logs  │  │processed_webhooks │
├──────────────┤  ├──────────────┤  ├───────────────────┤
│ id (UUID PK) │  │ id (UUID PK) │  │ webhook_key (PK)  │
│ action       │  │ member_id FK │  │ type              │
│ member_id FK │  │ template     │  │ action            │
│ user_id FK   │  │ recipient    │  │ data_id           │
│ details JSONB│  │ status       │  │ request_id        │
│ timestamp    │  │ resend_id    │  │ processed_at      │
└──────────────┘  │ error_message│  └───────────────────┘
                  │ sent_at      │
                  └──────────────┘

┌──────────────────────────┐  ┌──────────────┐  ┌──────────────────┐
│consumed_verification_    │  │  error_logs  │  │     config       │
│ tokens                   │  ├──────────────┤  ├──────────────────┤
├──────────────────────────┤  │ id (UUID PK) │  │ key (VARCHAR PK) │
│ token_hash (PK)          │  │ severity     │  │ value (JSONB)    │
│ user_id FK               │  │ message      │  │ updated_at       │
│ consumed_at              │  │ stack        │  └──────────────────┘
└──────────────────────────┘  │ source (enum)│
                              │ context JSONB│
                              │ user_id FK   │
                              │ url          │
                              │ user_agent   │
                              │ ip_address   │
                              │ created_at   │
                              └──────────────┘
```

**Total: 14 tabelas**

### Recursos do PostgreSQL

- **UUID** como primary keys (extensao `uuid-ossp` + `pgcrypto`)
- **CHECK constraints** em campos enum (`role`, `status`, `plan`, `method`, `type`, etc.)
- **Foreign keys** com `ON DELETE CASCADE` ou `ON DELETE SET NULL`
- **Indices otimizados** para queries frequentes (compostos, parciais, DESC para paginacao)
- **Triggers** `update_updated_at()` para auto-update de `updated_at` em `users`, `members`, `payments`
- **JSONB** para dados flexiveis (`details`, `pending_payment`, `context`, `value`)
- **Queries parametrizadas** em todos os acessos ($1, $2...) — prevencao de SQL injection

---

## 14. Middleware Pipeline

```
Request
  → Request ID (x-request-id ou UUID gerado)
  → Helmet (security headers, CSP)
  → Compression (gzip)
  → Morgan (access logs)
  → CORS whitelist
  → Body parser (JSON 15mb / raw para webhook)
  → Rate limiting (por endpoint)
  → JWT authentication (rotas protegidas)
  → Role check — requireRole() (RBAC)
  → Ownership check — requireOwnership() (membro so acessa seus proprios dados)
  → Zod validation (body / params / query)
  → Route handler
  → Error handler global (AppError com status code, mensagem e codigo)
Response
```

### Rate Limits

Os limites sao definidos por endpoint no middleware `rate-limit.ts`, com janelas e thresholds diferentes para rotas publicas (auth, registro) e protegidas (API geral).

---

## 15. CI/CD Pipeline

Acionado automaticamente no push para `master` via GitHub Actions (`.github/workflows/deploy.yml`).

```
  ┌────────────────────────────────────────────────────────────┐
  │                  GitHub Actions Runner                      │
  │                                                            │
  │  1. Checkout                                               │
  │  2. Setup Node.js 20 (com cache npm)                       │
  │  3. npm ci                                                 │
  │  4. npx vite build --mode production                       │
  │     (injeta VITE_API_URL, VITE_STRIPE_PUBLISHABLE_KEY,     │
  │      VITE_PIX_KEY, VITE_ENVIRONMENT via env vars)          │
  │  5. Setup SSH (deploy key)                                 │
  │                                                            │
  │  6. rsync server/ → VPS:/opt/clube-geek-toys/server/       │
  │     (exclui node_modules, .env, scripts/)                  │
  │                                                            │
  │  7. rsync dist/ → VPS:/opt/clube-geek-toys/dist/           │
  │                                                            │
  │  8. SSH:                                                   │
  │     docker compose build --no-cache api                    │
  │     docker compose up -d --force-recreate api nginx        │
  │                                                            │
  │  9. Health check:                                          │
  │     curl https://api.geeketoys.com.br/health               │
  │     (usa dominio, nao IP — IP nao tem cert SAN)            │
  └────────────────────────────────────────────────────────────┘
```

### Pontos de atencao

- **`--no-cache` no build da API:** qualquer mudanca em validacao de env (Zod) precisa ser testada localmente antes, senao a API entra em restart loop em producao
- **rsync de `server/` inclui `server/azuracast/`**, mas isso nao afeta o container do AzuraCast (que roda de `/opt/azuracast/`). A pasta no repo serve como fonte-verdade versionada
- **`--force-recreate`:** necessario porque `docker compose restart` nao re-le o `.env`
- **Timeout:** job limitado a 15 minutos

---

## 16. Containers Docker

| Container             | Imagem                   | Porta          | Funcao                          |
| --------------------- | ------------------------ | -------------- | ------------------------------- |
| `clube-geek-nginx`    | nginx:alpine             | 80/443 (host)  | Reverse proxy, SSL, SPA serving |
| `clube-geek-api`      | Build local (Dockerfile) | 3001 (interno) | API Express                     |
| `clube-geek-postgres` | postgres:16-alpine       | 127.0.0.1:5432 | Banco principal                 |
| `clube-geek-umami`    | umami:postgresql-latest  | 3000 (interno) | Analytics                       |
| `clube-geek-umami-db` | postgres:16-alpine       | 5432 (interno) | Banco do Umami                  |
| `clube-geek-certbot`  | certbot/certbot          | -              | Renovacao SSL a cada 12h        |

### Volumes

| Volume         | Conteudo                              |
| -------------- | ------------------------------------- |
| `pgdata`       | Dados do PostgreSQL                   |
| `uploads`      | Contratos PDF e uploads               |
| `umami-pgdata` | Dados do Umami                        |
| `certbot-etc`  | Certificados SSL (`/etc/letsencrypt`) |
| `certbot-www`  | Challenge ACME                        |

### Limites de Recursos

| Container | CPU     | Memoria |
| --------- | ------- | ------- |
| postgres  | 2 cores | 2 GB    |
| api       | 2 cores | 1 GB    |

---

## 17. Webhooks Stripe

### Eventos processados

| Evento Stripe                   | Handler                        | Acao                                                                              |
| ------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `payment_intent.succeeded`      | `handlePaymentIntentSucceeded` | Marca pagamento como `paid`, ativa membro, emails                                 |
| `payment_intent.payment_failed` | `handlePaymentIntentFailed`    | Marca pagamento como `failed`, email `payment-failed`                             |
| `invoice.paid`                  | `handleInvoicePaid`            | Registra pagamento da assinatura, estende `expiry_date`, reseta `failed_payments` |
| `invoice.payment_failed`        | `handleInvoicePaymentFailed`   | Incrementa `failed_payments`, cancela apos 3 falhas                               |
| `customer.subscription.deleted` | `handleSubscriptionDeleted`    | Marca assinatura como cancelada                                                   |

### Idempotencia

Webhooks Stripe podem ser entregues multiplas vezes. A idempotencia e garantida por:

1. **Claim atomico:** `INSERT INTO processed_webhooks ... ON CONFLICT DO NOTHING` dentro da mesma transacao
2. **Rollback completo:** se o processamento falha, o `ROLLBACK` desfaz tanto o claim quanto os side effects
3. **Emails apos COMMIT:** emails sao enfileirados durante a transacao mas enviados somente apos `COMMIT` bem-sucedido

### Verificacao de assinatura

O webhook recebe o body como `express.raw()` para verificar a assinatura HMAC do Stripe via `stripe.webhooks.constructEvent()`.
