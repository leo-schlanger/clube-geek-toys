# Clube Geek & Toys

Sistema completo de gerenciamento de clube de assinaturas para a loja Geek & Toys.

> **Ultima atualizacao:** 07 de Abril de 2026
> **Status:** Producao (VPS self-hosted)

## Dados da Empresa

| Campo             | Valor                                                            |
| ----------------- | ---------------------------------------------------------------- |
| **Razao Social**  | N. Stanley Schlanger Comercio de Artigos em Geral Ltda           |
| **Nome Fantasia** | Geek & Toys                                                      |
| **CNPJ**          | 52.846.344/0001-10                                               |
| **Endereco**      | Rua Barata Ribeiro, 181, Loja J - Copacabana, RJ, CEP 22.011-001 |

## Funcionalidades

### Planos Disponiveis

| Plano  | Mensal   | Anual     | Desc. Produtos | Desc. Servicos | Pontos |
| ------ | -------- | --------- | -------------- | -------------- | ------ |
| Silver | R$ 19,90 | R$ 199,90 | 10%            | 20%            | 1x     |
| Gold   | R$ 39,90 | R$ 399,90 | 15%            | 35%            | 2x     |
| Black  | R$ 49,90 | R$ 499,90 | 20%            | 50%            | 3x     |

### Modulos

- **Landing Page**: Apresentacao dos planos e beneficios
- **Cadastro**: Registro com validacao de CPF e integracao com pagamento
- **Area do Membro**: Carteirinha digital com QR Code, renovacao, upgrade, historico de atividades
- **PDV (Vendedor)**: Verificacao por QR Code ou CPF, validacao de descontos
- **Admin Dashboard**: Estatisticas, gerenciamento de membros, sistema de pontos, logs de acoes, exportacao CSV

### Recursos Avancados

- **Sistema de Pontos**: Acumulo e resgate de pontos com historico completo
- **Contrato Digital**: Assinatura eletronica com validade juridica (Lei 14.063/2020)
- **PWA (Progressive Web App)**: Instalavel como app no celular
- **Virtual Scrolling**: Performance otimizada para listas grandes
- **Skeleton Loading**: Carregamento visual com placeholders animados
- **Rate Limiting**: Protecao contra brute force (server-side)
- **Email Verification**: Verificacao de email obrigatoria para membros
- **Retry com Backoff**: Operacoes resilientes com retry automatico
- **Export CSV**: Exportacao de membros e relatorios
- **Cron Jobs**: Expiracao de pontos e lembretes de renovacao automaticos

## Tecnologias

### Frontend

- **Framework**: React 19, TypeScript, Vite 7
- **Estilizacao**: Tailwind CSS 3, shadcn/ui components
- **State**: React Query (TanStack Query)
- **Forms**: React Hook Form + Zod validation
- **PDF**: pdf-lib (contratos digitais)
- **Assinatura**: signature_pad (assinatura digital)
- **Virtualizacao**: @tanstack/react-virtual
- **PWA**: vite-plugin-pwa

### Backend

- **Runtime**: Node.js 20 + Express
- **Banco de Dados**: PostgreSQL 16
- **Autenticacao**: JWT customizado (bcrypt + refresh tokens)
- **Validacao**: Zod (schemas com limites rigorosos)
- **Cron**: node-cron (tarefas diarias 6AM UTC)

### Infraestrutura

- **Servidor**: VPS Ubuntu 24.04, Docker + Docker Compose
- **Proxy Reverso**: Nginx + SSL (Let's Encrypt / Certbot)
- **Pagamentos**: PagBank (PIX + Cartao)
- **Email**: Resend API (templates customizados)
- **Analytics**: Umami (self-hosted)
- **CI/CD**: GitHub Actions (deploy automatico no push)
- **Code Quality**: ESLint, Prettier, Husky, lint-staged

## Arquitetura

```
                       Internet
                          |
                    ┌─────┴─────┐
                    │   Nginx   │  SSL + Reverse Proxy
                    └─────┬─────┘
           ┌──────┬───────┼───────┬──────────┐
           |      |       |       |          |
       club.*  adm.*   api.*  admin.*  analytics.*
       (SPA)   (SPA)  (Express) (SPA)   (Umami)
                          |
                    ┌─────┴─────┐
                    │ Express   │  Port 3001
                    │ API       │  JWT Auth, RBAC
                    └─────┬─────┘
              ┌───────────┼───────────┐
              |           |           |
        ┌─────┴─────┐ ┌──┴──┐ ┌─────┴─────┐
        │PostgreSQL │ │Resend│ │  PagBank  │
        │  (Docker) │ │(API) │ │(Webhooks) │
        └───────────┘ └─────┘ └───────────┘
```

### Dominios

| Dominio                      | Servico              |
| ---------------------------- | -------------------- |
| `club.geeketoys.com.br`      | SPA do membro        |
| `admin.geeketoys.com.br`     | SPA do admin         |
| `adm.geeketoys.com.br`       | SPA do admin (alias) |
| `api.geeketoys.com.br`       | API Express          |
| `analytics.geeketoys.com.br` | Umami Analytics      |

---

## Instalacao Rapida (Desenvolvimento Local)

```bash
# 1. Clonar repositorio
git clone <url-do-repositorio>
cd clube-geek-toys

# 2. Instalar dependencias do frontend
npm install

# 3. Configurar variaveis do frontend
cp .env.example .env
# Editar .env com suas credenciais

# 4. Rodar frontend em desenvolvimento
npm run dev

# 5. (Opcional) Rodar backend local com Docker
cd server
cp .env.example .env
# Editar server/.env com credenciais locais
docker compose -f docker-compose.dev.yml up -d
```

---

## Variaveis de Ambiente

### Frontend (.env)

```env
VITE_API_URL=https://api.geeketoys.com.br
VITE_PAGBANK_PUBLIC_KEY=<chave_publica_PagBank>
VITE_PIX_KEY=<chave_PIX_da_empresa>
VITE_ENVIRONMENT=development
```

### Backend (server/.env)

```env
# PostgreSQL
POSTGRES_USER=clube_geek
POSTGRES_PASSWORD=<senha_forte>
POSTGRES_DB=clube_geek_toys

# JWT
JWT_SECRET=<string_aleatoria_64_chars>
JWT_REFRESH_SECRET=<string_diferente_64_chars>
HMAC_SECRET=<outra_string_64_chars>

# PagBank
PAGBANK_TOKEN=<token_PagBank>
PAGBANK_PUBLIC_KEY=<chave_publica_PagBank>

# Resend
RESEND_API_KEY=<api_key_Resend>
FROM_EMAIL=Clube Geek & Toys <contato@geeketoys.com.br>
ADMIN_EMAIL=admin@geeketoys.com.br

# URLs
FRONTEND_URL=https://club.geeketoys.com.br
API_URL=https://api.geeketoys.com.br
```

---

## Estrutura de Pastas

```
clube-geek-toys/
├── server/                      # Backend (VPS)
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/          # Rotas Express
│   │   │   ├── services/        # Logica de negocio
│   │   │   ├── middleware/      # Auth, CORS, rate-limit, validacao
│   │   │   ├── db/              # Schema SQL e migrations
│   │   │   ├── config/          # Configuracoes
│   │   │   ├── types/           # Tipos TypeScript
│   │   │   ├── utils/           # Utilitarios
│   │   │   └── index.ts         # Entrypoint Express
│   │   └── Dockerfile
│   ├── nginx/                   # Configs Nginx
│   │   ├── nginx.conf
│   │   ├── conf.d/              # Server blocks por dominio
│   │   └── shared-headers.conf  # Headers de seguranca
│   ├── scripts/                 # Scripts de setup/manutencao
│   ├── docker-compose.yml       # Infraestrutura producao
│   ├── docker-compose.dev.yml   # Infraestrutura desenvolvimento
│   └── .env.example             # Exemplo de variaveis
│
├── src/                         # Frontend React
│   ├── components/
│   │   ├── ui/                  # Componentes base (shadcn)
│   │   ├── admin/               # Componentes do Admin (lazy loaded)
│   │   └── reports/             # Graficos e relatorios (lazy loaded)
│   ├── pages/                   # Paginas da aplicacao
│   ├── contexts/                # Contextos React (AuthContext)
│   ├── hooks/                   # Custom React Hooks
│   ├── lib/                     # Servicos e utilitarios
│   │   ├── api-client.ts        # Cliente HTTP para API
│   │   ├── members.ts           # CRUD membros
│   │   ├── payments.ts          # Integracao pagamentos
│   │   ├── points.ts            # Sistema de pontos
│   │   ├── subscriptions.ts     # Assinaturas recorrentes
│   │   └── ...
│   ├── types/                   # Tipos TypeScript
│   └── data/                    # Dados estaticos
│
├── .github/
│   └── workflows/
│       └── deploy.yml           # CI/CD GitHub Actions
│
├── docs/                        # Documentacao
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── PROJECT.md
│   └── TODO.md
│
├── DEPLOY.md                    # Guia de deploy
└── .env.example                 # Exemplo variaveis frontend
```

---

## Rotas da Aplicacao (Frontend)

| Rota                   | Descricao                | Acesso                     |
| ---------------------- | ------------------------ | -------------------------- |
| `/assinar`             | Landing page com planos  | Publico                    |
| `/cadastro`            | Formulario de cadastro   | Publico                    |
| `/login`               | Tela de login            | Publico                    |
| `/recuperar-senha`     | Recuperacao de senha     | Publico                    |
| `/verificar-email`     | Verificacao de email     | Publico                    |
| `/membro`              | Dashboard do membro      | Membros (email verificado) |
| `/pdv`                 | Verificacao de membros   | Vendedores                 |
| `/admin`               | Painel administrativo    | Admins                     |
| `/admin/membros`       | Gestao de membros        | Admins                     |
| `/admin/pontos`        | Sistema de pontos        | Admins                     |
| `/admin/usuarios`      | Gestao de usuarios       | Admins                     |
| `/admin/logs`          | Logs de acoes            | Admins                     |
| `/admin/relatorios`    | Relatorios e graficos    | Admins                     |
| `/admin/configuracoes` | Configuracoes do sistema | Admins                     |
| `/pagamento/sucesso`   | Confirmacao pagamento    | Publico                    |
| `/pagamento/erro`      | Erro no pagamento        | Publico                    |
| `/pagamento/pendente`  | Pagamento pendente       | Publico                    |

---

## Criar Primeiro Admin

```bash
# Na VPS, execute o seed de admin:
docker exec -it clube-geek-api npx ts-node src/db/seed-admin.ts

# Ou insira manualmente no PostgreSQL:
docker exec -it clube-geek-postgres psql -U clube_geek -d clube_geek_toys

INSERT INTO users (email, password_hash, role, email_verified)
VALUES ('admin@geeketoys.com.br', '<bcrypt_hash>', 'admin', true);
```

---

## Scripts Disponiveis

```bash
# Frontend (desenvolvimento)
npm run dev              # Servidor de desenvolvimento
npm run build            # Build para producao
npm run preview          # Preview do build
npm run lint             # Verificar codigo com ESLint
npm run test             # Rodar testes
npm run test:coverage    # Cobertura de testes

# Docker (producao - na VPS)
cd server
docker compose up -d             # Subir todos os servicos
docker compose down              # Parar todos os servicos
docker compose logs -f api       # Logs da API
docker compose build --no-cache api  # Rebuild da API
docker compose ps                # Status dos containers
```

---

## Troubleshooting

### Erro de conexao com a API

1. Verifique se `VITE_API_URL` esta correto no `.env`
2. Verifique se a API esta rodando: `curl https://api.geeketoys.com.br/health`
3. Verifique CORS no middleware

### Erro de autenticacao (401/403)

1. O token JWT pode ter expirado (15min de vida)
2. Verifique se o refresh token esta valido (7 dias)
3. Verifique o `role` do usuario no banco

### Build falha com erro de memoria

```bash
NODE_OPTIONS=--max_old_space_size=4096 npm run build
```

---

## Documentacao Adicional

- [Arquitetura do Projeto](docs/ARCHITECTURE.md) - Detalhes tecnicos
- [Documentacao do Projeto](docs/PROJECT.md) - Modelo de negocio e dados
- [Seguranca e Compliance](docs/SECURITY.md) - Guia de seguranca e LGPD
- [Guia de Deploy](DEPLOY.md) - Instrucoes de deploy na VPS
- [Roadmap](docs/TODO.md) - Plano de melhorias

---

## Licenca

Privado - Geek & Toys Collection
