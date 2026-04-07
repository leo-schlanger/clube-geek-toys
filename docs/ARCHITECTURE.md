# Arquitetura Tecnica - Clube Geek & Toys

> **Ultima atualizacao:** 07 de Abril de 2026

## Visao Geral do Sistema

```
┌──────────────────────────────────────────────────────────────────────┐
│                         VPS (76.13.114.173)                          │
│                         Ubuntu 24.04 + Docker                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     Nginx (porta 80/443)                       │  │
│  │  SSL termination (Let's Encrypt) + Reverse Proxy               │  │
│  │  Security headers (HSTS, X-Frame DENY, nosniff, etc.)         │  │
│  └──────┬──────────┬──────────┬──────────┬───────────────────────┘  │
│         │          │          │          │                            │
│    club.*     api.*     adm.*     analytics.*                        │
│    admin.*                                                           │
│         │          │                    │                            │
│    ┌────┴───┐ ┌────┴─────┐        ┌────┴────┐                      │
│    │  SPA   │ │ Express  │        │  Umami  │                      │
│    │ (dist/)│ │  :3001   │        │ :3000   │                      │
│    └────────┘ └────┬─────┘        └────┬────┘                      │
│                    │                   │                            │
│              ┌─────┴──────┐     ┌──────┴────┐                      │
│              │ PostgreSQL │     │ umami-db  │                      │
│              │   :5432    │     │  :5433    │                      │
│              └────────────┘     └───────────┘                      │
│                                                                      │
│  ┌──────────┐                                                        │
│  │ Certbot  │  Auto-renovacao SSL                                   │
│  └──────────┘                                                        │
└──────────────────────────────────────────────────────────────────────┘
                    │                    │
              ┌─────┴──────┐      ┌─────┴──────┐
              │  PagBank   │      │   Resend   │
              │ (webhooks) │      │  (emails)  │
              └────────────┘      └────────────┘
```

## Frontend (React SPA)

### Stack

- **React 19** + TypeScript + Vite 7
- **Tailwind CSS 3** + shadcn/ui
- **React Router 7** (SPA com subdomain routing)
- **TanStack Query** (cache e estado servidor)
- **React Hook Form** + Zod (formularios e validacao)

### Roteamento por Subdominio

O frontend detecta o subdominio para exibir interfaces diferentes:

| Subdominio           | Interface      | Roles Permitidos |
| -------------------- | -------------- | ---------------- |
| `admin.*` ou `adm.*` | Painel Admin   | admin, seller    |
| `club.*` ou outros   | Area do Membro | member           |

### Padroes Utilizados

**Protected Route Pattern:**

```typescript
function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth()
  if (loading) return <LoadingPage />
  if (!user) return <Navigate to="/login" />
  if (!allowedRoles.includes(role)) return <Navigate to="/acesso-negado" />
  return <>{children}</>
}
```

**Lazy Loading com Suspense:**

```typescript
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

<Suspense fallback={<LoadingPage />}>
  <AppRoutes />
</Suspense>
```

**Custom Hooks Pattern:**

- `useMembers()` - operacoes de membros via API
- `usePoints()` - sistema de pontos
- `useRealtimeStats()` - metricas em tempo real

### Code Splitting

- Lazy load por rota e por componente
- Admin tabs carregadas sob demanda (MembersTab, PointsTab, ReportsTab, etc.)
- Vendor chunks separados (charts, forms, qr, etc.)
- PWA com service worker (workbox)

## Backend (Express API)

### Stack

- **Node.js 20** + Express + TypeScript
- **PostgreSQL 16** (via pg/node-postgres)
- **Zod** (validacao de entrada em todos os endpoints)
- **bcrypt** (hash de senhas, 12 rounds)
- **jsonwebtoken** (JWT access + refresh tokens)
- **node-cron** (tarefas agendadas)

### Estrutura de Diretorio

```
server/api/src/
├── index.ts              # Entrypoint, Express app + cron setup
├── config/               # Configuracoes (DB pool, constantes)
├── db/
│   ├── schema.sql        # Schema completo PostgreSQL
│   ├── migrations/       # Migrations incrementais
│   └── seed-admin.ts     # Seed do primeiro admin
├── middleware/
│   ├── auth.ts           # JWT verification + RBAC
│   ├── cors.ts           # CORS whitelist
│   ├── rate-limit.ts     # Rate limiting por endpoint
│   ├── validate.ts       # Validacao Zod
│   └── error-handler.ts  # Error handler global
├── routes/
│   ├── auth.routes.ts        # Login, registro, refresh, verify-email
│   ├── member.routes.ts      # CRUD membros
│   ├── payment.routes.ts     # PIX, checkout, status
│   ├── subscription.routes.ts # Assinaturas recorrentes
│   ├── points.routes.ts      # Pontos (add, redeem, expire)
│   ├── webhook.routes.ts     # Webhooks PagBank
│   ├── email.routes.ts       # Envio de emails
│   ├── contract.routes.ts    # Contratos digitais
│   ├── report.routes.ts      # Relatorios e metricas
│   ├── log.routes.ts         # Audit logs
│   ├── user.routes.ts        # Gestao de usuarios (admin)
│   └── health.routes.ts      # Health check
├── services/
│   ├── auth.service.ts       # Login, hash, JWT, refresh
│   ├── member.service.ts     # Logica de membros
│   ├── payment.service.ts    # Integracao PagBank
│   ├── subscription.service.ts
│   ├── points.service.ts     # Calculo e expiracao de pontos
│   ├── webhook.service.ts    # Processamento de webhooks
│   ├── email.service.ts      # Templates + Resend API
│   ├── contract.service.ts
│   ├── report.service.ts     # Queries de relatorios
│   ├── log.service.ts        # Audit logging
│   └── cron.service.ts       # Tarefas agendadas
├── types/                # Tipos TypeScript
└── utils/                # Utilitarios
```

### Middleware Pipeline

```
Request
  → CORS check
  → Rate limiting
  → JWT verification (rotas protegidas)
  → Role check (RBAC)
  → Zod validation (body/params/query)
  → Route handler
  → Error handler (global)
Response
```

## Banco de Dados (PostgreSQL 16)

### Tabelas

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│    users     │     │   members    │     │    payments      │
├──────────────┤     ├──────────────┤     ├──────────────────┤
│ id (UUID PK) │◄────│ user_id (FK) │     │ member_id (FK)   │
│ email        │     │ cpf          │     │ amount           │
│ password_hash│     │ full_name    │     │ method           │
│ role         │     │ plan         │     │ status           │
│ email_verified│    │ status       │     │ provider_id      │
│ refresh_token│     │ payment_type │     │ paid_at          │
│ created_at   │     │ expiry_date  │     │ created_at       │
└──────────────┘     │ points       │     └──────────────────┘
                     │ subscription_id│
                     └───────┬──────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
   ┌──────────┴───┐ ┌───────┴──────┐ ┌────┴──────────┐
   │point_transact│ │ subscriptions│ │   contracts   │
   ├──────────────┤ ├──────────────┤ ├───────────────┤
   │ member_id FK │ │ member_id FK │ │ member_id FK  │
   │ type         │ │ provider_id  │ │ member_name   │
   │ points       │ │ status       │ │ signature     │
   │ balance      │ │ plan         │ │ document_hash │
   │ expires_at   │ │ frequency    │ │ pdf_url       │
   │ created_at   │ │ amount       │ │ signed_at     │
   └──────────────┘ │ failed_pays  │ └───────────────┘
                     └──────┬──────┘
                            │
                  ┌─────────┴──────────┐
                  │subscription_payments│
                  ├────────────────────┤
                  │ subscription_id FK │
                  │ member_id FK       │
                  │ amount             │
                  │ status             │
                  │ payment_date       │
                  └────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌───────────────────┐
│  audit_logs  │  │  email_logs  │  │processed_webhooks │
├──────────────┤  ├──────────────┤  ├───────────────────┤
│ action       │  │ template     │  │ webhook_key (PK)  │
│ member_id FK │  │ recipient    │  │ type              │
│ user_id FK   │  │ status       │  │ action            │
│ details JSONB│  │ resend_id    │  │ processed_at      │
│ timestamp    │  │ sent_at      │  └───────────────────┘
└──────────────┘  └──────────────┘
```

### Recursos do PostgreSQL

- **UUID** como primary keys (uuid-ossp extension)
- **CHECK constraints** em campos enum (role, status, plan, method)
- **Foreign keys** com ON DELETE CASCADE/SET NULL
- **Indexes** otimizados para queries frequentes
- **Triggers** para auto-update de `updated_at`
- **JSONB** para dados flexiveis (details, pending_payment)
- **Parametrized queries** em todos os acessos (prevencao de SQL injection)

## Fluxo de Autenticacao (JWT)

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐
│  Login   │───▶│  POST /auth  │───▶│   Valida    │
│  Form    │    │  /login      │    │  bcrypt     │
└──────────┘    └──────────────┘    └──────┬──────┘
                                           │
                      ┌────────────────────┘
                      ▼
              ┌──────────────┐
              │ Gera tokens: │
              │ - access (15min) │
              │ - refresh (7d)   │
              └──────┬──────┘
                     │
              ┌──────┴──────┐
              │  Response:  │
              │  tokens +   │
              │  user data  │
              └──────┬──────┘
                     │
    ┌────────────────┴────────────────┐
    │                                 │
    ▼                                 ▼
┌──────────┐                  ┌──────────────┐
│ Frontend │  (token expirou) │ POST /auth   │
│ guarda   │─────────────────▶│ /refresh     │
│ tokens   │                  │ (refresh tok)│
└──────────┘                  └──────┬───────┘
                                     │
                              ┌──────┴──────┐
                              │ Novo access │
                              │ token (15m) │
                              └─────────────┘
```

### Detalhes

- **Access token**: JWT com payload `{ userId, email, role }`, expira em 15 minutos
- **Refresh token**: JWT separado, expira em 7 dias, hash armazenado no banco
- **bcrypt**: 12 rounds para hash de senhas
- **RBAC**: Middleware verifica `role` do token antes de permitir acesso

## Fluxo de Pagamento (PagBank)

### PIX

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐
│ Checkout │───▶│  POST /payment│──▶│  PagBank    │
│  Modal   │    │  /pix/create │    │  API        │
└──────────┘    └──────────────┘    └──────┬──────┘
                                           │
                      ┌────────────────────┘
                      ▼
              ┌──────────────┐    ┌─────────────┐
              │  QR Code +   │───▶│ Poll status │
              │  Copia/Cola  │    │ (interval)  │
              └──────────────┘    └──────┬──────┘
                                         │
                    ┌────────────────────┘
                    ▼
            ┌──────────────┐    ┌─────────────┐
            │   Webhook    │───▶│  Ativa      │
            │ POST /webhook│    │  membro     │
            │  /pagbank    │    │  + email    │
            └──────────────┘    └─────────────┘
```

### Cartao de Credito

```
Frontend (PagBank.js SDK)
  → Tokeniza cartao (client-side)
  → POST /payment/checkout/create (token + dados)
  → API cria cobranca no PagBank
  → Webhook confirma pagamento
  → Membro ativado
```

## Sistema de Pontos

```
┌──────────┐    ┌──────────────┐    ┌─────────────────┐
│   PDV    │───▶│ POST /points │───▶│ point_transactions│
│  (scan)  │    │  /add        │    │ (type: earn)     │
└──────────┘    └──────────────┘    └────────┬────────┘
                                             │
                        ┌────────────────────┘
                        ▼
                ┌──────────────┐    ┌─────────────┐
                │ UPDATE member│───▶│ Audit Log   │
                │    points    │    │ audit_logs  │
                └──────────────┘    └─────────────┘

Calculo: pontos = valor_compra * multiplicador_plano
  Silver: 1x  |  Gold: 2x  |  Black: 3x
```

### Expiracao de Pontos

- Cron job diario as 6AM UTC
- Expira transacoes `earn` com `expires_at < NOW()` e `expired = FALSE`
- Recalcula saldo do membro
- Envia email de aviso quando pontos estao proximos de expirar

## Cron Jobs (node-cron)

Executados diariamente as 6:00 UTC:

| Job                 | Descricao                                           |
| ------------------- | --------------------------------------------------- |
| `expire-points`     | Expira pontos vencidos e atualiza saldos            |
| `renewal-reminders` | Envia lembretes para membros proximos do vencimento |

## Infraestrutura Docker

### Containers

| Container             | Imagem                   | Porta    | Funcao                    |
| --------------------- | ------------------------ | -------- | ------------------------- |
| `clube-geek-postgres` | postgres:16-alpine       | 5432\*   | Banco principal           |
| `clube-geek-api`      | Build local (Dockerfile) | 3001\*\* | API Express               |
| `clube-geek-nginx`    | nginx:alpine             | 80/443   | Reverse proxy + SSL + SPA |
| `certbot`             | certbot                  | -        | Renovacao SSL automatica  |
| `clube-geek-umami`    | umami:postgresql-latest  | 3000\*\* | Analytics                 |
| `umami-db`            | postgres:16-alpine       | 5433\*   | Banco do Umami            |

\* Apenas acessivel em 127.0.0.1 (localhost)
\*\* Apenas acessivel internamente via rede Docker

### Volumes Docker

- `pgdata` - Dados do PostgreSQL
- `uploads` - Uploads de arquivos
- `certbot-etc` - Certificados SSL
- `certbot-www` - Challenge ACME

### Nginx Config

- Reverse proxy para API (`api.*` -> Express:3001)
- Reverse proxy para Umami (`analytics.*` -> Umami:3000)
- Serve SPA estatica (`club.*`, `admin.*`, `adm.*` -> `/usr/share/nginx/html/`)
- SPA fallback: `try_files $uri /index.html`
- Security headers compartilhados (`shared-headers.conf`)
- SSL/TLS com certificados Let's Encrypt
- Redirect HTTP -> HTTPS

## Performance

### Otimizacoes Frontend

1. **Code Splitting** - Lazy load por rota e componente
2. **Vendor Chunks** - Separacao de bibliotecas
3. **Tree Shaking** - Vite + ESM modules
4. **Minification** - Terser com drop_console
5. **Cache Headers** - 1 ano para assets imutaveis (via Nginx)
6. **Suspense Fallbacks** - Loading states durante lazy load
7. **Virtual Scrolling** - @tanstack/react-virtual para tabelas grandes
8. **PWA** - Service worker com workbox

### Otimizacoes Backend

1. **Connection pooling** - PostgreSQL pool gerenciado
2. **Indexes** - Otimizados para queries frequentes
3. **Parametrized queries** - Seguranca + performance
4. **Rate limiting** - Protecao contra abuso
5. **Gzip** - Compressao no Nginx

## Monitoramento

### Umami Analytics (Self-hosted)

- Page views e navegacao
- Eventos customizados
- Core Web Vitals
- Disponivel em `https://analytics.geeketoys.com.br`

### Logs

- **audit_logs** (PostgreSQL): Acoes criticas (admin, vendedor)
- **email_logs** (PostgreSQL): Emails enviados/falhados
- **Docker logs**: `docker compose logs -f <servico>`

### Health Check

- `GET /health` - Status da API e conexao com banco
- Verificado automaticamente pelo CI/CD apos deploy
