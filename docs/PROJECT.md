# Clube Geek & Toys - Documentacao do Projeto

> **Ultima atualizacao:** 08 de Abril de 2026

## Visao Geral

Sistema de gestao de clube de assinaturas para a loja Geek & Toys. Permite gerenciar membros, planos de assinatura, pontos de fidelidade e pagamentos.

## Dados da Empresa

| Campo             | Valor                                                  |
| ----------------- | ------------------------------------------------------ |
| **Razao Social**  | N. Stanley Schlanger Comercio de Artigos em Geral Ltda |
| **Nome Fantasia** | Geek & Toys                                            |
| **CNPJ**          | 52.846.344/0001-10                                     |
| **Endereco**      | Rua Barata Ribeiro, 181, Loja J - Copacabana, RJ       |
| **CEP**           | 22.011-001                                             |
| **Situacao**      | ATIVA                                                  |

## Stack Tecnologica

### Frontend

| Tecnologia      | Uso                     |
| --------------- | ----------------------- |
| React 19        | UI Framework            |
| TypeScript      | Tipagem estatica        |
| Vite 7          | Build tool              |
| TailwindCSS 3   | Estilizacao             |
| React Router 7  | Roteamento SPA          |
| TanStack Query  | Cache e estado servidor |
| React Hook Form | Formularios             |
| Zod             | Validacao de schemas    |
| Framer Motion   | Animacoes               |
| Lucide React    | Icones                  |
| Sonner          | Notificacoes toast      |

### Backend

| Tecnologia    | Uso                       |
| ------------- | ------------------------- |
| Node.js 20    | Runtime                   |
| Express       | Framework HTTP            |
| PostgreSQL 16 | Banco de dados relacional |
| bcrypt        | Hash de senhas            |
| jsonwebtoken  | Autenticacao JWT          |
| node-cron     | Tarefas agendadas         |
| Zod           | Validacao de entrada      |
| pg            | Driver PostgreSQL         |

### Servicos Externos

| Servico | Uso                       |
| ------- | ------------------------- |
| PagBank | Pagamentos (PIX + Cartao) |
| Resend  | Emails transacionais      |

### Infraestrutura

| Servico          | Uso                       |
| ---------------- | ------------------------- |
| VPS Ubuntu 24.04 | Servidor de producao      |
| Docker           | Containerizacao           |
| Nginx            | Reverse proxy + SSL + SPA |
| Let's Encrypt    | Certificados SSL          |
| Umami            | Analytics (self-hosted)   |
| GitHub Actions   | CI/CD automatico          |

## Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                    VPS (Docker)                               │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                 Nginx (80/443)                          │  │
│  │  Reverse proxy + SSL + Security headers                │  │
│  └──────┬──────────┬──────────┬──────────────────────────┘  │
│         │          │          │                              │
│    club/admin   api.*    analytics.*                         │
│      (SPA)                                                   │
│         │          │          │                              │
│    ┌────┴───┐ ┌────┴─────┐ ┌─┴──────┐                      │
│    │ Static │ │ Express  │ │ Umami  │                      │
│    │ Files  │ │  :3001   │ │ :3000  │                      │
│    └────────┘ └────┬─────┘ └────┬───┘                      │
│                    │            │                            │
│              ┌─────┴──────┐ ┌───┴─────┐                     │
│              │ PostgreSQL │ │umami-db │                     │
│              │   :5432    │ │ :5433   │                     │
│              └────────────┘ └─────────┘                     │
│                                                              │
│  ┌──────────┐                                                │
│  │ Certbot  │ Renovacao SSL automatica                      │
│  └──────────┘                                                │
└──────────────────────────────────────────────────────────────┘
          │                    │
    ┌─────┴──────┐      ┌─────┴──────┐
    │  PagBank   │      │   Resend   │
    │ (webhooks) │      │  (emails)  │
    └────────────┘      └────────────┘
```

## Estrutura de Diretorios

```
clube-geek-toys/
├── server/                      # Backend (roda na VPS)
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts         # Entrypoint Express + cron
│   │   │   ├── config/          # Configuracoes (DB, constantes)
│   │   │   ├── db/
│   │   │   │   ├── schema.sql   # Schema PostgreSQL completo
│   │   │   │   ├── migrations/  # Migrations incrementais
│   │   │   │   └── seed-admin.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts      # JWT + RBAC
│   │   │   │   ├── cors.ts      # CORS whitelist
│   │   │   │   ├── rate-limit.ts
│   │   │   │   ├── validate.ts  # Zod validation
│   │   │   │   └── error-handler.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── member.routes.ts
│   │   │   │   ├── payment.routes.ts
│   │   │   │   ├── subscription.routes.ts
│   │   │   │   ├── points.routes.ts
│   │   │   │   ├── webhook.routes.ts
│   │   │   │   ├── email.routes.ts
│   │   │   │   ├── contract.routes.ts
│   │   │   │   ├── report.routes.ts
│   │   │   │   ├── log.routes.ts
│   │   │   │   ├── user.routes.ts
│   │   │   │   └── health.routes.ts
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── member.service.ts
│   │   │   │   ├── payment.service.ts
│   │   │   │   ├── subscription.service.ts
│   │   │   │   ├── points.service.ts
│   │   │   │   ├── webhook.service.ts
│   │   │   │   ├── email.service.ts
│   │   │   │   ├── contract.service.ts
│   │   │   │   ├── report.service.ts
│   │   │   │   ├── log.service.ts
│   │   │   │   └── cron.service.ts
│   │   │   ├── types/
│   │   │   └── utils/
│   │   └── Dockerfile
│   ├── nginx/
│   │   ├── nginx.conf
│   │   ├── conf.d/              # Server blocks por dominio
│   │   └── shared-headers.conf  # Security headers
│   ├── scripts/
│   ├── docker-compose.yml       # Producao
│   ├── docker-compose.dev.yml   # Desenvolvimento
│   └── .env.example
│
├── src/                         # Frontend React
│   ├── App.tsx                  # Router + providers
│   ├── contexts/
│   │   └── AuthContext.tsx      # JWT auth context
│   ├── pages/
│   │   ├── Subscribe.tsx        # Landing page
│   │   ├── Register.tsx         # Cadastro
│   │   ├── Login.tsx            # Login
│   │   ├── ForgotPassword.tsx   # Recuperar senha
│   │   ├── MemberDashboard.tsx  # Area do membro
│   │   ├── AdminDashboard.tsx   # Painel admin
│   │   ├── PDV.tsx              # Ponto de venda
│   │   ├── PaymentResult.tsx    # Resultado pagamento
│   │   ├── TermsOfUse.tsx       # Termos de uso
│   │   └── PrivacyPolicy.tsx    # Politica de privacidade
│   ├── components/
│   │   ├── ui/                  # Componentes base (shadcn)
│   │   ├── admin/               # Tabs admin (lazy loaded)
│   │   │   ├── MembersTab.tsx
│   │   │   ├── PointsTab.tsx
│   │   │   ├── UsersTab.tsx
│   │   │   ├── LogsTab.tsx
│   │   │   ├── ReportsTab.tsx
│   │   │   └── SettingsTab.tsx
│   │   ├── reports/             # Graficos (lazy loaded)
│   │   ├── PaymentModal.tsx
│   │   ├── ContractModal.tsx
│   │   ├── MemberModal.tsx
│   │   ├── QRScanner.tsx
│   │   └── SubscriptionManagement.tsx
│   ├── lib/
│   │   ├── api-client.ts        # Cliente HTTP (fetch + JWT)
│   │   ├── members.ts           # CRUD membros
│   │   ├── payments.ts          # Integracao pagamentos
│   │   ├── points.ts            # Sistema de pontos
│   │   ├── subscriptions.ts     # Assinaturas
│   │   ├── reports.ts           # Relatorios
│   │   ├── email.ts             # Envio de emails
│   │   ├── logs.ts              # Audit logs
│   │   └── utils.ts             # Utilitarios
│   ├── hooks/                   # Custom hooks
│   └── types/                   # Tipos TypeScript
│
├── .github/workflows/
│   └── deploy.yml               # CI/CD GitHub Actions
│
├── docs/
│   ├── PROJECT.md               # Este arquivo
│   ├── ARCHITECTURE.md          # Arquitetura tecnica
│   ├── SECURITY.md              # Seguranca e LGPD
│   └── TODO.md                  # Roadmap
│
├── DEPLOY.md                    # Guia de deploy
└── .env.example                 # Variaveis frontend
```

## Sistema de Roles

### Tipos de Usuario

| Role     | Acesso         | Descricao                           |
| -------- | -------------- | ----------------------------------- |
| `admin`  | Total          | Administrador do sistema            |
| `seller` | PDV            | Vendedor - acesso ao ponto de venda |
| `member` | Area do membro | Assinante do clube                  |

### Fluxo de Autenticacao

```
┌─────────────────┐
│   Login Page    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  POST /auth/    │
│     login       │
│  (bcrypt check) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Gera JWT:      │
│  - access (15m) │
│  - refresh (7d) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Frontend salva │
│  tokens         │
│  AuthContext     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Redirect:      │
│  admin  → /admin│
│  seller → /pdv  │
│  member → /membro│
└─────────────────┘
```

## Modelo de Dados (PostgreSQL)

### Tabela: `users`

| Coluna             | Tipo         | Descricao             |
| ------------------ | ------------ | --------------------- |
| id                 | UUID (PK)    | ID unico              |
| email              | VARCHAR(254) | Email unico           |
| password_hash      | VARCHAR(255) | Hash bcrypt           |
| role               | VARCHAR(20)  | member, seller, admin |
| email_verified     | BOOLEAN      | Email verificado?     |
| email_verified_at  | TIMESTAMPTZ  | Data de verificacao   |
| refresh_token_hash | VARCHAR(255) | Hash do refresh token |
| created_at         | TIMESTAMPTZ  | Data de criacao       |
| updated_at         | TIMESTAMPTZ  | Ultima atualizacao    |

### Tabela: `members`

| Coluna              | Tipo         | Descricao                          |
| ------------------- | ------------ | ---------------------------------- |
| id                  | UUID (PK)    | ID unico                           |
| user_id             | UUID (FK)    | Referencia users                   |
| cpf                 | VARCHAR(11)  | CPF (unico)                        |
| full_name           | VARCHAR(200) | Nome completo                      |
| email               | VARCHAR(254) | Email                              |
| phone               | VARCHAR(20)  | Telefone                           |
| plan                | VARCHAR(10)  | silver, gold, black                |
| status              | VARCHAR(20)  | active, pending, inactive, expired |
| payment_type        | VARCHAR(10)  | monthly, annual                    |
| start_date          | DATE         | Data de inicio                     |
| expiry_date         | DATE         | Data de vencimento                 |
| points              | INTEGER      | Saldo de pontos                    |
| pending_payment     | JSONB        | Pagamento pendente                 |
| subscription_id     | TEXT         | ID da assinatura PagBank           |
| subscription_status | VARCHAR(20)  | Status da assinatura               |
| auto_renewal        | BOOLEAN      | Renovacao automatica               |
| created_at          | TIMESTAMPTZ  | Data de criacao                    |

### Tabela: `payments`

| Coluna               | Tipo          | Descricao                       |
| -------------------- | ------------- | ------------------------------- |
| id                   | UUID (PK)     | ID unico                        |
| member_id            | UUID (FK)     | Referencia members              |
| amount               | DECIMAL(10,2) | Valor                           |
| method               | VARCHAR(20)   | pix, credit_card, boleto, cash  |
| status               | VARCHAR(20)   | pending, paid, failed, refunded |
| provider_id          | TEXT          | ID no PagBank                   |
| provider_status      | TEXT          | Status no PagBank               |
| reference            | TEXT          | Referencia interna              |
| paid_at              | TIMESTAMPTZ   | Data do pagamento               |
| webhook_processed_at | TIMESTAMPTZ   | Quando webhook processou        |
| created_at           | TIMESTAMPTZ   | Data de criacao                 |

### Tabela: `point_transactions`

| Coluna         | Tipo          | Descricao                   |
| -------------- | ------------- | --------------------------- |
| id             | UUID (PK)     | ID unico                    |
| member_id      | UUID (FK)     | Referencia members          |
| type           | VARCHAR(10)   | earn, redeem, expire, bonus |
| points         | INTEGER       | Quantidade de pontos        |
| balance        | INTEGER       | Saldo apos transacao        |
| description    | TEXT          | Descricao                   |
| purchase_value | DECIMAL(10,2) | Valor da compra (se earn)   |
| expires_at     | DATE          | Data de expiracao           |
| expired        | BOOLEAN       | Ja expirou?                 |
| created_by     | UUID (FK)     | Quem adicionou              |
| created_at     | TIMESTAMPTZ   | Data da transacao           |

### Tabela: `subscriptions`

| Coluna             | Tipo          | Descricao                              |
| ------------------ | ------------- | -------------------------------------- |
| id                 | TEXT (PK)     | ID do PagBank (preapproval)            |
| member_id          | UUID (FK)     | Referencia members                     |
| provider_id        | TEXT          | ID no PagBank                          |
| status             | VARCHAR(20)   | pending, authorized, paused, cancelled |
| plan               | VARCHAR(10)   | silver, gold, black                    |
| frequency_type     | VARCHAR(10)   | months, years                          |
| transaction_amount | DECIMAL(10,2) | Valor da cobranca                      |
| next_payment_date  | TIMESTAMPTZ   | Proxima cobranca                       |
| last_payment_date  | TIMESTAMPTZ   | Ultima cobranca                        |
| failed_payments    | INTEGER       | Falhas consecutivas (max 3)            |
| card_last_four     | VARCHAR(4)    | Ultimos 4 digitos                      |
| card_brand         | VARCHAR(50)   | Bandeira do cartao                     |
| payer_email        | VARCHAR(254)  | Email do pagador                       |
| created_at         | TIMESTAMPTZ   | Data de criacao                        |

### Tabela: `contracts`

| Coluna            | Tipo         | Descricao                     |
| ----------------- | ------------ | ----------------------------- |
| id                | TEXT (PK)    | ID do contrato                |
| member_id         | UUID (FK)    | Referencia members            |
| member_name       | VARCHAR(200) | Nome no momento da assinatura |
| member_cpf        | VARCHAR(11)  | CPF                           |
| member_email      | VARCHAR(254) | Email                         |
| plan              | VARCHAR(10)  | Plano                         |
| signature_preview | TEXT         | Preview da assinatura         |
| signed_at         | TIMESTAMPTZ  | Data da assinatura            |
| ip_address        | VARCHAR(45)  | IP do signatario              |
| user_agent        | TEXT         | User agent do navegador       |
| document_hash     | VARCHAR(64)  | Hash SHA-256 do documento     |
| pdf_url           | TEXT         | URL do PDF                    |
| status            | VARCHAR(20)  | active, superseded            |

### Tabela: `audit_logs`

| Coluna    | Tipo         | Descricao            |
| --------- | ------------ | -------------------- |
| id        | UUID (PK)    | ID unico             |
| action    | VARCHAR(100) | Acao realizada       |
| member_id | UUID (FK)    | Membro afetado       |
| user_id   | UUID (FK)    | Usuario que realizou |
| details   | JSONB        | Detalhes adicionais  |
| timestamp | TIMESTAMPTZ  | Data/hora            |

### Tabela: `email_logs`

| Coluna        | Tipo         | Descricao                    |
| ------------- | ------------ | ---------------------------- |
| id            | UUID (PK)    | ID unico                     |
| member_id     | UUID (FK)    | Membro destinatario          |
| template      | VARCHAR(50)  | Nome do template             |
| recipient     | VARCHAR(254) | Email destinatario           |
| status        | VARCHAR(20)  | sent, failed                 |
| resend_id     | TEXT         | ID no Resend                 |
| error_message | TEXT         | Mensagem de erro (se falhou) |
| sent_at       | TIMESTAMPTZ  | Data de envio                |

### Tabela: `processed_webhooks`

| Coluna       | Tipo        | Descricao                   |
| ------------ | ----------- | --------------------------- |
| webhook_key  | TEXT (PK)   | Chave unica de idempotencia |
| type         | TEXT        | Tipo do webhook             |
| action       | TEXT        | Acao do webhook             |
| data_id      | TEXT        | ID do recurso               |
| processed_at | TIMESTAMPTZ | Data de processamento       |

## Planos de Assinatura

| Plano  | Mensal   | Anual     | Desc. Produtos | Desc. Servicos | Multiplicador Pontos |
| ------ | -------- | --------- | -------------- | -------------- | -------------------- |
| Silver | R$ 19,90 | R$ 199,90 | 10%            | 20%            | 1x                   |
| Gold   | R$ 39,90 | R$ 399,90 | 15%            | 35%            | 2x                   |
| Black  | R$ 49,90 | R$ 499,90 | 20%            | 50%            | 3x                   |

### Calculo de Pontos

```
pontos = valor_compra * multiplicador_plano
```

Exemplo: Compra de R$ 100,00 no plano Gold = 200 pontos

## Endpoints da API

**Base URL:** `https://api.geeketoys.com.br`

### Autenticacao

| Metodo | Endpoint                        | Descricao                   | Auth    |
| ------ | ------------------------------- | --------------------------- | ------- |
| POST   | `/auth/register`                | Cadastro de novo usuario    | Publico |
| POST   | `/auth/login`                   | Login                       | Publico |
| POST   | `/auth/refresh`                 | Renovar access token        | Refresh |
| POST   | `/auth/logout`                  | Logout (invalida refresh)   | JWT     |
| POST   | `/auth/send-verification-email` | Envia email de verificacao  | JWT     |
| POST   | `/auth/verify-email`            | Valida token de verificacao | Publico |
| POST   | `/auth/send-password-reset`     | Envia email reset de senha  | Publico |

### Membros

| Metodo | Endpoint       | Descricao        | Auth               |
| ------ | -------------- | ---------------- | ------------------ |
| GET    | `/members`     | Listar membros   | admin              |
| GET    | `/members/:id` | Buscar membro    | admin/seller/owner |
| POST   | `/members`     | Criar membro     | JWT                |
| PUT    | `/members/:id` | Atualizar membro | admin/owner        |
| DELETE | `/members/:id` | Remover membro   | admin              |

### Pagamentos

| Metodo | Endpoint                   | Descricao                    | Auth |
| ------ | -------------------------- | ---------------------------- | ---- |
| POST   | `/payment/pix/create`      | Gera QR Code PIX             | JWT  |
| POST   | `/payment/checkout/create` | Cria pagamento cartao        | JWT  |
| GET    | `/payment/status/:id`      | Verifica status de pagamento | JWT  |

### Assinaturas

| Metodo | Endpoint                        | Descricao              | Auth |
| ------ | ------------------------------- | ---------------------- | ---- |
| POST   | `/subscription/create`          | Cria assinatura        | JWT  |
| GET    | `/subscription/:id`             | Detalhes da assinatura | JWT  |
| PUT    | `/subscription/:id/pause`       | Pausa assinatura       | JWT  |
| PUT    | `/subscription/:id/resume`      | Reativa assinatura     | JWT  |
| PUT    | `/subscription/:id/cancel`      | Cancela assinatura     | JWT  |
| PUT    | `/subscription/:id/update-card` | Atualiza cartao        | JWT  |

### Pontos

| Metodo | Endpoint            | Descricao           | Auth               |
| ------ | ------------------- | ------------------- | ------------------ |
| POST   | `/points/add`       | Adicionar pontos    | admin/seller       |
| POST   | `/points/redeem`    | Resgatar pontos     | admin/seller       |
| GET    | `/points/:memberId` | Historico de pontos | admin/seller/owner |

### Webhooks

| Metodo | Endpoint           | Descricao                 | Auth |
| ------ | ------------------ | ------------------------- | ---- |
| POST   | `/webhook/pagbank` | Processa webhooks PagBank | HMAC |

### Email

| Metodo | Endpoint      | Descricao              | Auth |
| ------ | ------------- | ---------------------- | ---- |
| POST   | `/email/send` | Envia email (template) | JWT  |

### Contratos

| Metodo | Endpoint              | Descricao                 | Auth |
| ------ | --------------------- | ------------------------- | ---- |
| POST   | `/contract/create`    | Criar contrato digital    | JWT  |
| GET    | `/contract/:memberId` | Buscar contrato do membro | JWT  |

### Relatorios

| Metodo | Endpoint           | Descricao        | Auth  |
| ------ | ------------------ | ---------------- | ----- |
| GET    | `/reports/daily`   | Relatorio diario | admin |
| GET    | `/reports/monthly` | Relatorio mensal | admin |

### Usuarios (Admin)

| Metodo | Endpoint          | Descricao       | Auth  |
| ------ | ----------------- | --------------- | ----- |
| GET    | `/users`          | Listar usuarios | admin |
| PUT    | `/users/:id/role` | Alterar role    | admin |

### Logs

| Metodo | Endpoint | Descricao         | Auth  |
| ------ | -------- | ----------------- | ----- |
| GET    | `/logs`  | Listar audit logs | admin |

### Health

| Metodo | Endpoint  | Descricao             | Auth    |
| ------ | --------- | --------------------- | ------- |
| GET    | `/health` | Status da API + banco | Publico |

## Templates de Email

13 templates HTML responsivos com branding, preheader text, CTAs e footer com dados da empresa.
Enviados via Resend API. Todos logados na tabela `email_logs`.

| Template                      | Quando enviado                                | Trigger              |
| ----------------------------- | --------------------------------------------- | -------------------- |
| `verify-email`                | Apos registro — link de confirmacao (24h)     | Backend (auto)       |
| `password-reset`              | Solicitacao de recuperacao de senha (1h)      | Backend (auto)       |
| `welcome`                     | Apos ativacao do membro                       | Frontend             |
| `payment-confirmed`           | Pagamento aprovado (PIX ou cartao)            | Webhook PagBank      |
| `payment-failed`              | Pagamento rejeitado                           | Webhook PagBank      |
| `contract-signed`             | Contrato digital assinado (com PDF anexo)     | Frontend             |
| `subscription-created`        | Assinatura recorrente criada com sucesso      | Backend (auto)       |
| `subscription-payment`        | Cobranca recorrente processada                | Webhook PagBank      |
| `subscription-paused`         | Assinatura pausada pelo membro                | Backend (auto)       |
| `subscription-cancelled`      | Assinatura cancelada (manual ou 3 falhas)     | Backend/Webhook      |
| `subscription-payment-failed` | Cobranca recorrente falhou (mostra X/3)       | Webhook PagBank      |
| `renewal-reminder`            | 5-8 dias antes do vencimento (dedup via logs) | Cron diario (6h UTC) |
| `points-expiring`             | 5-8 dias antes da expiracao de pontos         | Cron diario (6h UTC) |

## Subdominios

| Subdominio                   | Interface      | Roles Permitidos |
| ---------------------------- | -------------- | ---------------- |
| `club.geeketoys.com.br`      | Area do Membro | member           |
| `admin.geeketoys.com.br`     | Painel Admin   | admin, seller    |
| `adm.geeketoys.com.br`       | Painel Admin   | admin, seller    |
| `api.geeketoys.com.br`       | API Express    | -                |
| `analytics.geeketoys.com.br` | Umami          | -                |

Em desenvolvimento, use `?subdomain=adm` para simular o admin.

## Variaveis de Ambiente

### Frontend (.env)

```env
VITE_API_URL=https://api.geeketoys.com.br
VITE_PAGBANK_PUBLIC_KEY=<chave_publica_PagBank>
VITE_PIX_KEY=<chave_PIX>
VITE_ENVIRONMENT=production
```

### Backend (server/.env)

```env
POSTGRES_USER=clube_geek
POSTGRES_PASSWORD=<senha>
POSTGRES_DB=clube_geek_toys
JWT_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
HMAC_SECRET=<secret>
PAGBANK_TOKEN=<token>
PAGBANK_PUBLIC_KEY=<key>
RESEND_API_KEY=<key>
FROM_EMAIL=Clube Geek & Toys <contato@geeketoys.com.br>
ADMIN_EMAIL=admin@geeketoys.com.br
FRONTEND_URL=https://club.geeketoys.com.br
API_URL=https://api.geeketoys.com.br
```

## Scripts Disponiveis

```bash
# Frontend
npm run dev              # Desenvolvimento local
npm run build            # Build de producao
npm run preview          # Preview do build
npm run lint             # Verificar codigo
npm run test             # Rodar testes
npm run test:coverage    # Cobertura de testes

# Backend (Docker)
cd server
docker compose up -d             # Subir todos os servicos
docker compose down              # Parar servicos
docker compose logs -f api       # Logs da API
docker compose build --no-cache api  # Rebuild API
```
