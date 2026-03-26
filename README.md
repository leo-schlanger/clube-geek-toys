# Clube Geek & Toys

Sistema completo de gerenciamento de clube de assinaturas para a loja Geek & Toys.

> **Última atualização:** 26 de Março de 2026
> **Status:** Produção
> **Segurança:** 0 vulnerabilidades críticas

## Dados da Empresa

| Campo             | Valor                                                            |
| ----------------- | ---------------------------------------------------------------- |
| **Razão Social**  | N. Stanley Schlanger Comercio de Artigos em Geral Ltda           |
| **Nome Fantasia** | Geek & Toys                                                      |
| **CNPJ**          | 52.846.344/0001-10                                               |
| **Endereço**      | Rua Barata Ribeiro, 181, Loja J - Copacabana, RJ, CEP 22.011-001 |

## Funcionalidades

### Planos Disponíveis

| Plano  | Mensal   | Anual     | Desc. Produtos | Desc. Serviços | Pontos |
| ------ | -------- | --------- | -------------- | -------------- | ------ |
| Silver | R$ 19,90 | R$ 199,90 | 10%            | 20%            | 1x     |
| Gold   | R$ 39,90 | R$ 399,90 | 15%            | 35%            | 2x     |
| Black  | R$ 49,90 | R$ 499,90 | 20%            | 50%            | 3x     |

### Módulos

- **Landing Page**: Apresentação dos planos e benefícios
- **Cadastro**: Registro com validação de CPF e integração com pagamento
- **Área do Membro**: Carteirinha digital com QR Code, renovação, upgrade, histórico de atividades
- **PDV (Vendedor)**: Verificação por QR Code ou CPF, validação de descontos
- **Admin Dashboard**: Estatísticas, gerenciamento de membros, sistema de pontos, logs de ações, exportação CSV

### Recursos Avançados

- **Sistema de Pontos**: Acúmulo e resgate de pontos com histórico completo
- **Contrato Digital**: Assinatura eletrônica com validade jurídica (Lei 14.063/2020)
- **PWA (Progressive Web App)**: Instalável como app no celular
- **Virtual Scrolling**: Performance otimizada para listas grandes
- **Skeleton Loading**: Carregamento visual com placeholders animados
- **Rate Limiting**: Proteção contra brute force no login
- **Email Verification**: Verificação de email obrigatória para membros
- **Retry com Backoff**: Operações resilientes com retry automático
- **Export CSV**: Exportação de membros e relatórios

### Segurança

- **Validação Zod**: Todos os endpoints validados com schemas rigorosos
- **HMAC-SHA256**: Verificação de assinatura em webhooks
- **Sanitização HTML**: Prevenção de XSS em templates de email
- **Idempotência**: Webhooks processados apenas uma vez
- **Path Sanitization**: Prevenção de path traversal no Storage
- **Audit Logging**: Registro completo de ações críticas

## Tecnologias

- **Frontend**: React 19, TypeScript, Vite 7
- **Estilização**: Tailwind CSS 3, shadcn/ui components
- **Backend**: Firebase (Auth, Firestore, Storage), Cloudflare Workers
- **Pagamentos**: Mercado Pago (PIX e Cartão)
- **State Management**: React Query (TanStack Query)
- **Forms**: React Hook Form + Zod validation
- **API Validation**: Zod 4 (schemas com limites rigorosos)
- **PDF Generation**: pdf-lib (contratos digitais)
- **Signature**: signature_pad (assinatura digital)
- **Virtualização**: @tanstack/react-virtual
- **PWA**: vite-plugin-pwa
- **Email**: Resend API (templates customizados)
- **Analytics**: Vercel Analytics + Speed Insights
- **Code Quality**: ESLint, Prettier, Husky, lint-staged

---

## Instalação Rápida

```bash
# 1. Clonar repositório
git clone <seu-repositorio>
cd clube-geek-toys

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# 4. Rodar em desenvolvimento
npm run dev
```

---

## Configuração Completa

### 1. Firebase

#### 1.1 Criar Projeto

1. Acesse [Firebase Console](https://console.firebase.google.com)
2. Clique em "Adicionar projeto"
3. Nome: `clube-geek-toys`
4. Desative Google Analytics (opcional)
5. Clique em "Criar projeto"

#### 1.2 Habilitar Billing

1. Acesse [Google Cloud Console](https://console.cloud.google.com/billing)
2. Vincule uma conta de faturamento ao projeto
3. O plano Spark (gratuito) é suficiente para começar

#### 1.3 Configurar Authentication

1. No Firebase Console, vá em **Authentication**
2. Clique em "Começar"
3. Ative o provedor **Email/Senha**
4. (Opcional) Configure templates de email em português

#### 1.4 Criar Firestore

1. Vá em **Firestore Database**
2. Clique em "Criar banco de dados"
3. Selecione **Iniciar no modo de produção**
4. Escolha a localização `southamerica-east1` (São Paulo)

#### 1.5 Aplicar Regras de Segurança

1. No Firestore, vá na aba **Regras**
2. Cole o conteúdo do arquivo `firestore.rules`
3. Clique em "Publicar"

#### 1.6 Criar Índices

1. No Firestore, vá na aba **Índices**
2. Importe o arquivo `firestore.indexes.json` via Firebase CLI:

```bash
firebase deploy --only firestore:indexes
```

#### 1.7 Obter Credenciais

1. Vá em **Configurações do projeto** (engrenagem)
2. Em **Geral**, role até "Seus apps"
3. Clique em **Web** (ícone `</>`)
4. Registre o app com nome "web"
5. Copie as credenciais para o arquivo `.env`

### 2. Mercado Pago

#### 2.1 Criar Aplicação

1. Acesse [Mercado Pago Developers](https://www.mercadopago.com.br/developers/panel)
2. Clique em "Criar aplicação"
3. Nome: `Clube Geek & Toys`
4. Selecione: "Pagamentos online" > "CheckoutPro"

#### 2.2 Obter Credenciais

1. Na aplicação criada, vá em **Credenciais de teste**
2. Copie:
   - **Public Key**: Para o frontend (`.env`)
   - **Access Token**: Para o backend (`functions/.env`)

#### 2.3 Configurar Webhooks

1. Na aplicação, vá em **Webhooks**
2. Configure a URL:
   ```
   https://api-worker.leoschlanger.workers.dev/webhook/mercadopago
   ```
3. Selecione os eventos: `payment`, `subscription_preapproval`, `subscription_authorized_payment`
4. Copie o **Webhook Secret** gerado

### 3. Cloudflare Workers (API)

O backend da aplicação roda em Cloudflare Workers. Veja [DEPLOY.md](DEPLOY.md) para instruções detalhadas.

```bash
# Instalar Wrangler CLI
npm install -g wrangler

# Login no Cloudflare
wrangler login

# Configurar secrets (no diretório api-worker/)
cd api-worker
wrangler secret put MERCADOPAGO_ACCESS_TOKEN
wrangler secret put MERCADOPAGO_WEBHOOK_SECRET  # OBRIGATÓRIO
wrangler secret put RESEND_API_KEY
wrangler secret put FIREBASE_API_KEY

# Deploy
npm run deploy
```

### 4. Deploy do Frontend

```bash
# Build
npm run build

# Deploy no Firebase Hosting
firebase deploy --only hosting
```

---

## Variáveis de Ambiente

### Frontend (.env)

```env
# Firebase
VITE_FIREBASE_API_KEY=sua-api-key
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto-id
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu-sender-id
VITE_FIREBASE_APP_ID=seu-app-id

# Mercado Pago
VITE_MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxxx
VITE_PAYMENT_API_URL=https://api-worker.leoschlanger.workers.dev

# PIX (chave da loja)
VITE_PIX_KEY=sua-chave-pix@email.com

# Ambiente
VITE_ENVIRONMENT=production
```

### API Worker (via wrangler secret put)

```bash
# Secrets obrigatórios (configurar no Cloudflare)
MERCADOPAGO_ACCESS_TOKEN    # Token de acesso Mercado Pago
MERCADOPAGO_WEBHOOK_SECRET  # Secret do webhook (OBRIGATÓRIO para cron jobs)
RESEND_API_KEY              # API key do Resend para emails
FIREBASE_API_KEY            # API key do Firebase
```

---

## Estrutura de Pastas

```
clube-geek-toys/
├── src/
│   ├── components/          # Componentes React
│   │   ├── ui/              # Componentes UI base (shadcn)
│   │   │   ├── skeleton.tsx     # Loading placeholders
│   │   │   ├── progress.tsx     # Progress bars
│   │   │   ├── success-animation.tsx # Feedback animations
│   │   │   └── form-feedback.tsx    # Form feedback components
│   │   ├── admin/           # Componentes do Admin Dashboard
│   │   │   ├── AdminSidebar.tsx  # Sidebar com navegação
│   │   │   ├── MembersTab.tsx    # Gestão de membros
│   │   │   ├── PointsTab.tsx     # Sistema de pontos
│   │   │   ├── UsersTab.tsx      # Gestão de usuários
│   │   │   ├── LogsTab.tsx       # Logs de ações
│   │   │   ├── ReportsTab.tsx    # Relatórios e gráficos
│   │   │   └── SettingsTab.tsx   # Configurações
│   │   ├── VirtualTable.tsx # Tabela com virtual scrolling
│   │   ├── PaymentModal.tsx # Modal de pagamento PIX/Cartão
│   │   ├── ContractModal.tsx # Modal de contrato com assinatura digital
│   │   ├── QRScanner.tsx    # Scanner de QR Code
│   │   └── ...              # Outros componentes
│   ├── data/                # Dados estáticos
│   │   └── contract-content.ts # Conteúdo do regulamento
│   ├── contexts/            # Contextos React
│   │   └── AuthContext.tsx  # Autenticação Firebase
│   ├── hooks/               # Custom React Hooks
│   │   ├── useMembers.ts    # Operações de membros
│   │   └── usePoints.ts     # Operações de pontos
│   ├── lib/                 # Serviços e utilitários
│   │   ├── firebase.ts      # Configuração Firebase
│   │   ├── members.ts       # CRUD membros
│   │   ├── payments.ts      # Integração pagamentos
│   │   ├── points.ts        # Sistema de pontos
│   │   ├── contract-generator.ts # Geração de PDF de contrato
│   │   ├── contract-storage.ts   # Upload de contratos
│   │   ├── signature-utils.ts    # Hash SHA-256 e validação
│   │   ├── email.ts         # Envio de emails
│   │   ├── retry.ts         # Retry com exponential backoff
│   │   ├── rate-limit.ts    # Rate limiting para login
│   │   ├── error-tracking.ts # Error tracking (Sentry ready)
│   │   └── utils.ts         # Funções utilitárias
│   ├── pages/               # Páginas da aplicação
│   │   ├── Subscribe.tsx    # Landing page
│   │   ├── Register.tsx     # Cadastro
│   │   ├── Login.tsx        # Login
│   │   ├── ForgotPassword.tsx # Recuperar senha
│   │   ├── VerifyEmail.tsx  # Verificação de email
│   │   ├── MemberDashboard.tsx # Área do membro
│   │   ├── PDV.tsx          # Verificação vendedor
│   │   ├── AdminDashboard.tsx # Painel admin
│   │   └── PaymentResult.tsx # Resultado pagamento
│   └── types/               # Tipos TypeScript
├── scripts/                 # Scripts de setup
│   ├── setup-firestore.ts   # Configuração inicial Firestore
│   ├── setup-admin.ts       # Criar usuário admin
│   └── setup-seller.ts      # Criar usuário vendedor
├── docs/                    # Documentação
│   ├── ARCHITECTURE.md      # Arquitetura do projeto
│   └── TODO.md              # Lista de melhorias
├── .husky/                  # Git hooks
│   └── pre-commit           # Lint antes do commit
├── firestore.rules          # Regras de segurança Firestore
├── storage.rules            # Regras de segurança Storage
├── firestore.indexes.json   # Índices do Firestore
├── firebase.json            # Configuração Firebase
└── .env.example             # Exemplo de variáveis
```

---

## Rotas da Aplicação

| Rota                   | Descrição                | Acesso                     |
| ---------------------- | ------------------------ | -------------------------- |
| `/assinar`             | Landing page com planos  | Público                    |
| `/cadastro`            | Formulário de cadastro   | Público                    |
| `/login`               | Tela de login            | Público                    |
| `/recuperar-senha`     | Recuperação de senha     | Público                    |
| `/verificar-email`     | Verificação de email     | Público                    |
| `/membro`              | Dashboard do membro      | Membros (email verificado) |
| `/pdv`                 | Verificação de membros   | Vendedores                 |
| `/admin`               | Painel administrativo    | Admins                     |
| `/admin/membros`       | Gestão de membros        | Admins                     |
| `/admin/pontos`        | Sistema de pontos        | Admins                     |
| `/admin/usuarios`      | Gestão de usuários       | Admins                     |
| `/admin/logs`          | Logs de ações            | Admins                     |
| `/admin/relatorios`    | Relatórios e gráficos    | Admins                     |
| `/admin/configuracoes` | Configurações do sistema | Admins                     |
| `/pagamento/sucesso`   | Confirmação pagamento    | Público                    |
| `/pagamento/erro`      | Erro no pagamento        | Público                    |
| `/pagamento/pendente`  | Pagamento pendente       | Público                    |

---

## Criar Primeiro Admin

### Opção 1: Via Script (Recomendado)

```bash
# Configure as credenciais do firebase-admin primeiro
# Depois execute:
npm run setup:admin -- --email=admin@exemplo.com
```

### Opção 2: Manualmente no Firestore

1. Registre uma conta normalmente pelo app
2. No Firebase Console > Firestore
3. Na coleção `users`, encontre o documento do usuário
4. Mude o campo `role` de `"member"` para `"admin"`

### Criar Vendedor

```bash
npm run setup:seller -- --email=vendedor@exemplo.com
```

---

## Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev              # Servidor de desenvolvimento
npm run build            # Build para produção
npm run preview          # Preview do build
npm run lint             # Verificar código com ESLint

# Firebase
npm run emulators        # Iniciar emuladores Firebase
npm run deploy:firestore # Deploy regras do Firestore

# Setup (requer firebase-admin configurado)
npm run setup:firestore  # Configuração inicial do Firestore
npm run setup:admin      # Criar usuário admin
npm run setup:seller     # Criar usuário vendedor
npm run get:uid          # Buscar UID por email
```

---

## Troubleshooting

### Erro "Firebase: Error (auth/network-request-failed)"

Problema de conectividade com o Firebase. Verifique:

1. Conexão com a internet
2. Se o projeto Firebase está ativo
3. Se as credenciais estão corretas no `.env`

### Erro "Missing or insufficient permissions"

O usuário não tem permissão para a operação:

1. Verifique se o usuário está logado
2. Verifique se o `role` do usuário está correto no Firestore
3. Revise as regras em `firestore.rules`

### Erro de rate limiting no login

Muitas tentativas de login foram feitas:

1. Aguarde 5 minutos para desbloquear
2. O limite é de 5 tentativas por email
3. Dados são armazenados no localStorage

### PWA não atualiza

O service worker pode estar em cache:

1. Abra DevTools > Application > Service Workers
2. Clique em "Update" ou "Unregister"
3. Limpe o cache e recarregue

### Build falha com erro de memória

O Node pode precisar de mais memória:

```bash
NODE_OPTIONS=--max_old_space_size=4096 npm run build
```

### Emuladores Firebase não iniciam

Verifique se as portas não estão em uso:

- Auth: 9099
- Firestore: 8080
- UI: 4000

---

## Documentação Adicional

- [Arquitetura do Projeto](docs/ARCHITECTURE.md) - Detalhes técnicos
- [Lista de Melhorias](docs/TODO.md) - Roadmap e backlog
- [Segurança e Compliance](docs/SECURITY.md) - Guia de segurança e LGPD
- [Guia de Deploy](DEPLOY.md) - Instruções de deploy

---

## Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev              # Servidor de desenvolvimento
npm run build            # Build para produção
npm run preview          # Preview do build
npm run lint             # Verificar código com ESLint
npm run test             # Rodar testes
npm run test:coverage    # Cobertura de testes

# Firebase
npm run emulators        # Iniciar emuladores Firebase
npm run deploy:firestore # Deploy regras do Firestore
npm run deploy:storage   # Deploy regras do Storage
npm run deploy:rules     # Deploy todas as regras
npm run backup:firestore # Backup do Firestore (requer gcloud)

# Setup (requer firebase-admin configurado)
npm run setup:firestore  # Configuração inicial do Firestore
npm run setup:admin      # Criar usuário admin
npm run setup:seller     # Criar usuário vendedor
npm run get:uid          # Buscar UID por email
```

---

## Licença

Privado - Geek & Toys Collection
