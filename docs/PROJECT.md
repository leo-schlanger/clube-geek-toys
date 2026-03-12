# Clube Geek & Toys - Documentação do Projeto

## Visão Geral

Sistema de gestão de clube de assinaturas para a loja Geek & Toys. Permite gerenciar membros, planos de assinatura, pontos de fidelidade e pagamentos.

## Stack Tecnológica

### Frontend
| Tecnologia | Versão | Uso |
|------------|--------|-----|
| React | 19.2.0 | UI Framework |
| TypeScript | 5.8.3 | Tipagem estática |
| Vite | 7.3.1 | Build tool |
| TailwindCSS | 4.1.3 | Estilização |
| React Router | 7.13.1 | Roteamento SPA |
| TanStack Query | 5.90.21 | Cache e estado servidor |
| React Hook Form | 7.71.2 | Formulários |
| Zod | 3.25.2 | Validação de schemas |
| Framer Motion | 12.11.4 | Animações |
| Lucide React | 0.575.0 | Ícones |
| Sonner | 2.0.5 | Notificações toast |

### Backend/Serviços
| Serviço | Uso |
|---------|-----|
| Firebase Auth | Autenticação de usuários |
| Firebase Firestore | Banco de dados NoSQL |
| Vercel | Hosting do frontend |
| Cloudflare Workers | API para emails e webhooks |
| Mercado Pago | Processamento de pagamentos |
| Brasil API | Validação de CPF |

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                        VERCEL                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              React SPA (Vite Build)                  │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │    │
│  │  │  Admin   │  │  Member  │  │      PDV         │   │    │
│  │  │  Routes  │  │  Routes  │  │  (Point of Sale) │   │    │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      FIREBASE                                │
│  ┌─────────────────┐    ┌─────────────────────────────┐     │
│  │  Authentication │    │         Firestore           │     │
│  │  - Email/Pass   │    │  - users (roles)            │     │
│  │  - Sessions     │    │  - members (assinantes)     │     │
│  └─────────────────┘    │  - payments                 │     │
│                         │  - point_transactions       │     │
│                         │  - audit_logs               │     │
│                         │  - config                   │     │
│                         └─────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                          │
│  ┌─────────────────┐    ┌─────────────────────────────┐     │
│  │  Mercado Pago   │    │   Cloudflare Workers        │     │
│  │  - PIX          │    │   - Email API               │     │
│  │  - Credit Card  │    │   - Payment Webhooks        │     │
│  └─────────────────┘    └─────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Estrutura de Diretórios

```
clube-geek-toys/
├── docs/                    # Documentação
│   ├── PROJECT.md          # Este arquivo
│   ├── ARCHITECTURE.md     # Detalhes de arquitetura
│   └── TODO.md             # Plano de melhorias
│
├── src/
│   ├── App.tsx             # Router principal e providers
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx # Contexto de autenticação (React 19)
│   │
│   ├── pages/              # Páginas da aplicação
│   │   ├── AdminLogin.tsx      # Login administrativo
│   │   ├── AdminDashboard.tsx  # Painel admin (494kb - precisa split)
│   │   ├── PDV.tsx             # Ponto de venda
│   │   ├── Login.tsx           # Login de membros
│   │   ├── Register.tsx        # Cadastro de membros
│   │   ├── Subscribe.tsx       # Página de assinatura
│   │   ├── MemberDashboard.tsx # Área do membro
│   │   ├── PaymentResult.tsx   # Resultado de pagamento
│   │   ├── ForgotPassword.tsx  # Recuperação de senha
│   │   ├── TermsOfUse.tsx      # Termos de uso
│   │   └── PrivacyPolicy.tsx   # Política de privacidade
│   │
│   ├── components/
│   │   ├── ui/                 # Componentes base (shadcn-style)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── label.tsx
│   │   │   ├── loading.tsx
│   │   │   └── pagination.tsx
│   │   │
│   │   ├── admin/              # Componentes do AdminDashboard (lazy loaded)
│   │   │   ├── index.ts        # Barrel exports
│   │   │   ├── MembersTab.tsx  # Aba de membros
│   │   │   ├── UsersTab.tsx    # Aba de usuários do sistema
│   │   │   ├── LogsTab.tsx     # Aba de logs de atividade
│   │   │   ├── ReportsTab.tsx  # Aba de relatórios e gráficos
│   │   │   └── PointsTab.tsx   # Aba de ranking de pontos
│   │   │
│   │   ├── reports/            # Componentes de gráficos (lazy loaded)
│   │   │   ├── index.ts
│   │   │   ├── MembersChart.tsx
│   │   │   ├── RevenueChart.tsx
│   │   │   ├── PointsChart.tsx
│   │   │   ├── ChurnMetrics.tsx
│   │   │   └── ReportFilters.tsx
│   │   │
│   │   ├── ErrorBoundary.tsx   # Tratamento de erros
│   │   ├── MemberModal.tsx     # Modal de membro
│   │   ├── UserModal.tsx       # Modal de usuário do sistema
│   │   ├── PaymentModal.tsx    # Modal de pagamento
│   │   ├── PointsModal.tsx     # Modal de pontos
│   │   ├── MembersTable.tsx    # Tabela de membros
│   │   └── QRScanner.tsx       # Scanner QR para PDV
│   │
│   ├── lib/                    # Utilitários e serviços
│   │   ├── firebase.ts         # Configuração Firebase
│   │   ├── db-utils.ts         # CRUD genérico Firestore
│   │   ├── members.ts          # Operações de membros
│   │   ├── points.ts           # Sistema de pontos
│   │   ├── payments.ts         # Processamento de pagamentos
│   │   ├── reports.ts          # Relatórios e analytics
│   │   ├── email.ts            # Envio de emails
│   │   ├── logs.ts             # Audit logs
│   │   ├── cpf-validation.ts   # Validação de CPF
│   │   ├── subdomain.ts        # Roteamento por subdomínio
│   │   └── utils.ts            # Utilitários gerais
│   │
│   ├── types/
│   │   └── index.ts            # Definições de tipos TypeScript
│   │
│   └── hooks/                  # Custom hooks (vazio atualmente)
│
├── public/
│   └── logo.jpg                # Logo da empresa
│
├── Configuration Files
│   ├── package.json            # Dependências
│   ├── tsconfig.json           # TypeScript config
│   ├── tsconfig.app.json       # TypeScript app config
│   ├── vite.config.ts          # Vite build config
│   ├── tailwind.config.js      # Tailwind CSS config
│   ├── eslint.config.js        # ESLint config
│   ├── firebase.json           # Firebase hosting/rules
│   ├── firestore.rules         # Regras de segurança Firestore
│   ├── firestore.indexes.json  # Índices Firestore
│   └── .env.example            # Exemplo de variáveis de ambiente
│
└── vercel.json                 # Configuração Vercel (se existir)
```

## Sistema de Roles

### Tipos de Usuário

| Role | Acesso | Descrição |
|------|--------|-----------|
| `admin` | Total | Administrador do sistema |
| `seller` | PDV | Vendedor - acesso ao ponto de venda |
| `member` | Área do membro | Assinante do clube |

### Fluxo de Autenticação

```
┌─────────────────┐
│   Login Page    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Firebase Auth  │
│  signInWithEmail│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ onAuthStateChanged │
│  (useSyncExternalStore) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Fetch Role     │
│  (onSnapshot)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Redirect based │
│  on role        │
│  - admin → /admin │
│  - seller → /pdv  │
│  - member → /membro │
└─────────────────┘
```

## Modelos de Dados (Firestore)

### Collection: `users`
```typescript
{
  email: string
  role: 'admin' | 'seller' | 'member'
  createdAt: string (ISO)
  createdBy?: 'admin' | 'self'
}
```

### Collection: `members`
```typescript
{
  user_id: string          // Firebase Auth UID
  full_name: string
  email: string
  cpf: string
  phone?: string
  plan: 'silver' | 'gold' | 'black'
  status: 'pending' | 'active' | 'expired' | 'cancelled'
  payment_type: 'monthly' | 'annual'
  expiry_date: string      // ISO date
  points: number
  created_at: string
  updated_at: string
}
```

### Collection: `payments`
```typescript
{
  member_id: string
  amount: number
  method: 'pix' | 'credit_card' | 'boleto'
  status: 'pending' | 'approved' | 'rejected' | 'refunded'
  external_id?: string     // Mercado Pago ID
  pix_qr_code?: string
  created_at: string
}
```

### Collection: `point_transactions`
```typescript
{
  member_id: string
  type: 'earn' | 'redeem' | 'expire'
  points: number
  balance_after: number
  description: string
  purchase_amount?: number
  created_by?: string
  is_manual?: boolean
  created_at: string
}
```

### Collection: `audit_logs`
```typescript
{
  action: string
  entity_type: string
  entity_id: string
  user_id: string
  details?: object
  created_at: string
}
```

## Planos de Assinatura

| Plano | Mensal | Anual | Multiplicador de Pontos |
|-------|--------|-------|------------------------|
| Silver | R$ 29,90 | R$ 299,00 | 1x |
| Gold | R$ 49,90 | R$ 499,00 | 1.5x |
| Black | R$ 79,90 | R$ 799,00 | 2x |

### Cálculo de Pontos
```
pontos = (valor_compra / 10) * multiplicador_plano
```

Exemplo: Compra de R$ 100,00 no plano Gold = 15 pontos

## Segurança

### Firestore Rules
- Default deny para todas as collections
- Leitura de `users`: próprio usuário ou admin
- Criação de `users`: self-registration (role=member) ou admin
- Membros não podem alterar: cpf, plan, status, points
- Sellers só podem alterar: points (via PDV)
- Transactions e logs são imutáveis

### Headers de Segurança (firebase.json)
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security: max-age=31536000
- Content-Security-Policy: (configurado para Firebase/MercadoPago)

## Variáveis de Ambiente

```env
# Firebase
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Mercado Pago
VITE_MERCADOPAGO_PUBLIC_KEY=
VITE_PAYMENT_API_URL=

# PIX
VITE_PIX_KEY=

# API
VITE_API_URL=

# Environment
VITE_ENVIRONMENT=development|production
```

## Scripts Disponíveis

```bash
npm run dev          # Desenvolvimento local
npm run build        # Build de produção
npm run preview      # Preview do build
npm run lint         # Verificar código
npm run setup        # Configurar projeto
npm run deploy:firebase  # Deploy regras Firebase
```

## Subdomínios

O sistema detecta automaticamente o subdomínio para mostrar interfaces diferentes:

| Subdomínio | Interface | Roles Permitidos |
|------------|-----------|------------------|
| `admin.*` ou `adm.*` | Painel Admin | admin, seller |
| `club.*` ou outros | Área do Membro | member |

Em desenvolvimento, use `?subdomain=adm` para simular.

## Integrações Externas

### Mercado Pago
- SDK: `@mercadopago/sdk-react`
- Métodos: PIX, Cartão de Crédito
- Webhooks processados via Cloudflare Workers

### Brasil API
- Validação de CPF
- Endpoint: `https://brasilapi.com.br/api/cpf/v1/{cpf}`

### Cloudflare Workers
- API para envio de emails
- Processamento de webhooks de pagamento
- Endpoint configurável via `VITE_API_URL`
