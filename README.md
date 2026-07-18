# Clube Geek & Toys

Plataforma completa de clube de vantagens para a loja **Geek & Toys** -- cadastro, assinatura digital, pagamentos recorrentes, carteirinha digital, PDV, loja e-commerce propria e painel administrativo.

> **Stack**: React 19 + Vite | Node.js + Express | PostgreSQL | Stripe | Docker | Nginx | AzuraCast

---

## Sobre o Projeto

A **Geek & Toys** e uma loja em Copacabana, Rio de Janeiro, pioneira do Funko Pop no Brasil, com mais de 15 anos de atuacao no mercado geek. O **Clube Geek & Toys** e o programa de fidelidade digital da loja, oferecendo desconto exclusivo em qualquer produto, brinde especial e entrada gratuita em eventos participantes.

A plataforma inclui:

- **Plano unico anual** com desconto exclusivo e beneficios para membros
- **Contrato digital** com validade juridica (Lei 14.063/2020)
- **Carteirinha digital premium** com QR Code e design metalico
- **Loja e-commerce propria** em `shop.geeketoys.com.br` com desconto de membro aplicado no checkout
- **PDV integrado** para verificacao de membro e aplicacao de desconto na loja fisica
- **Radio online** via AzuraCast em `radio.geeketoys.com.br`

---

## Plano e Preco

Um unico plano anual, sem opcao mensal e sem tiers.

| Plano                 | Anual     | Beneficios                                                                                                               |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Clube Geek & Toys** | R$ 149,99 | 15% de desconto em qualquer produto (loja fisica e online) + brinde especial + entrada gratuita em eventos participantes |

---

## Funcionalidades

### Cadastro e Assinatura

Wizard de 3 etapas: criacao de conta, assinatura de contrato digital e pagamento. Como ha um unico plano anual, nao ha selecao de tier nem de frequencia — o membro assina eletronicamente e paga na mesma sessao.

### Contrato Digital

Assinatura eletronica com validade juridica conforme a Lei 14.063/2020. Cada contrato recebe um hash SHA-256 unico. O PDF e gerado automaticamente e enviado por email ao membro.

### Pagamentos

- **Cartao de Credito**: processado via Stripe com suporte a 3D Secure
- **PIX**: QR Code gerado localmente com confirmacao manual pelo admin

### Assinatura Recorrente

Gerenciada pelo Stripe Subscriptions. Suporte a pausa, retomada e cancelamento da assinatura anual. Webhooks processam eventos de cobranca automaticamente.

### Carteirinha Digital

Cartao premium com visual metalico, chip decorativo, shimmer holografico animado e QR Code de verificacao.

### Loja E-commerce Propria

Loja online em `shop.geeketoys.com.br`, servida pelo mesmo bundle Vite (o subdominio e detectado por `getAppMode()`):

- Catalogo publico com categorias, busca e paginas de produto
- Carrinho persistido em `localStorage` (`CartContext`)
- Checkout com cartao (Stripe) ou PIX local
- **Desconto de 15% do membro aplicado server-side no checkout** (`discount_reason = 'member_15'`) — nunca confiando no valor enviado pelo cliente
- Webhook confirma o pagamento e baixa o estoque automaticamente; PIX de loja e confirmado manualmente pelo admin

### PDV (Ponto de Venda)

Interface para vendedores na loja fisica:

- Verificacao de membro por CPF ou QR Code da carteirinha
- Visualizacao do status do membro e do desconto de 15% aplicavel
- Apenas verificacao — o PDV nao registra pontos nem compras

### Admin Dashboard

Painel completo de gestao:

- Visao geral com metricas (membros ativos, receita, churn)
- Gestao de membros (busca, filtros, edicao, ativacao/desativacao)
- Confirmacao de pagamentos PIX pendentes (assinatura e loja)
- Gestao da loja: aba **Produtos** (catalogo, estoque, imagens) e aba **Pedidos**
- Logs de acoes do sistema
- Exportacao CSV

### Radio Online

Radio da loja via AzuraCast, acessivel em `radio.geeketoys.com.br`. Stack isolada com playlists gerenciadas por scripts automatizados.

### Analytics

Umami self-hosted em `analytics.geeketoys.com.br` para metricas de uso sem rastreamento invasivo (compliance LGPD).

### Emails Transacionais

Templates via Resend API cobrindo todo o ciclo de vida:

- Verificacao de email e recuperacao de senha
- Confirmacao de pagamento (cartao e PIX)
- Contrato digital assinado (PDF anexo)
- Eventos de assinatura (ativacao, renovacao, cancelamento, pausa)
- Notificacoes administrativas (PIX pendente, novos membros)

### Cron Jobs

Tarefas automaticas diarias (6h UTC):

- Expiracao de membros com assinatura vencida
- Lembretes de renovacao proxima do vencimento

---

## Arquitetura

### Stack Tecnologica

| Camada         | Tecnologias                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **Frontend**   | React 19, TypeScript, Vite 7, Tailwind CSS, shadcn/ui, TanStack Query, Framer Motion, Stripe Elements |
| **Backend**    | Node.js 20, Express, PostgreSQL 16, JWT + bcrypt, Zod                                                 |
| **Infra**      | Docker Compose, Nginx, Let's Encrypt (Certbot), GitHub Actions                                        |
| **Email**      | Resend API (17 templates)                                                                             |
| **Pagamentos** | Stripe (cartao + subscriptions) + PIX local                                                           |
| **Radio**      | AzuraCast (stack Docker isolada)                                                                      |
| **Analytics**  | Umami (self-hosted)                                                                                   |

### Dominios

| Dominio                      | Servico                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `club.geeketoys.com.br`      | SPA membros                                                           |
| `admin.geeketoys.com.br`     | SPA admin                                                             |
| `shop.geeketoys.com.br`      | SPA loja (mesmo bundle Vite; subdominio detectado por `getAppMode()`) |
| `api.geeketoys.com.br`       | API Express (serve tambem `/uploads` de imagens de produto)           |
| `analytics.geeketoys.com.br` | Umami Analytics                                                       |
| `radio.geeketoys.com.br`     | AzuraCast (radio)                                                     |

---

## Estrutura de Pastas

```
clube-geek-toys/
├── src/                    # Frontend React (SPA membros + admin + loja)
│   ├── components/         # Componentes (ui/, admin/, reports/, store/)
│   ├── pages/              # Paginas da aplicacao (inclui pages/shop/)
│   ├── contexts/           # React Contexts (Auth, Cart)
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Servicos, API client, utilitarios (products, orders)
│   └── types/              # Tipos TypeScript
├── server/                 # Backend + infra
│   ├── api/                # Express API (routes, services, middleware, db)
│   ├── nginx/              # Configuracoes Nginx (server blocks, headers)
│   ├── azuracast/          # Stack da radio (fonte versionada)
│   ├── scripts/            # Scripts de setup/manutencao
│   └── docker-compose.yml  # Orquestracao de producao
├── scripts/radio/          # Scripts de gestao da biblioteca musical
├── docs/                   # Documentacao tecnica
├── .github/workflows/      # CI/CD (GitHub Actions)
├── DEPLOY.md               # Guia de deploy
└── CLAUDE.md               # Guia operacional para Claude Code
```

---

## Setup Local

### Pre-requisitos

- Node.js 20+
- Docker e Docker Compose
- npm

### Instalacao

```bash
# Clonar o repositorio
git clone https://github.com/leo-schlanger/clube-geek-toys.git
cd clube-geek-toys

# Instalar dependencias do frontend
npm install

# Configurar variaveis de ambiente do frontend
cp .env.example .env
# Editar .env com os valores adequados

# Rodar frontend em modo desenvolvimento
npm run dev

# (Opcional) Rodar backend local com Docker
cd server
cp .env.example .env
# Editar server/.env com credenciais locais
docker compose -f docker-compose.dev.yml up -d
```

> As variaveis de ambiente necessarias estao documentadas nos arquivos `.env.example` (raiz e `server/`). Consulte `CLAUDE.md` para detalhes sobre a validacao Zod das env vars.

---

## Scripts Disponiveis

### Frontend

```bash
npm run dev           # Servidor de desenvolvimento (Vite)
npm run build         # Build de producao
npm run preview       # Preview local do build
npm run lint          # Verificar codigo (ESLint)
npm run test          # Rodar testes
npm run test:coverage # Cobertura de testes
```

### Backend (Docker)

```bash
cd server
docker compose up -d                     # Subir servicos
docker compose down                      # Parar servicos
docker compose logs -f api               # Logs da API
docker compose build --no-cache api      # Rebuild da API
docker compose ps                        # Status dos containers
```

### Radio

Scripts em `scripts/radio/` para gestao da biblioteca musical:

```bash
cd scripts/radio
python download-batch.py lista.txt genero   # Download de musicas
./upload-to-vps.sh downloads/genero genero  # Upload para o servidor
./playlist-attach.sh genero <PLAYLIST_ID>   # Associar a playlist
```

Detalhes completos em `scripts/radio/README.md`.

---

## Documentacao

| Documento                                      | Conteudo                                |
| ---------------------------------------------- | --------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitetura tecnica detalhada           |
| [`docs/PROJECT.md`](docs/PROJECT.md)           | Escopo, modelos de dados, endpoints API |
| [`docs/SECURITY.md`](docs/SECURITY.md)         | Seguranca, LGPD, autenticacao           |
| [`docs/RADIO.md`](docs/RADIO.md)               | Operacao da radio AzuraCast             |
| [`docs/TODO.md`](docs/TODO.md)                 | Roadmap e progresso                     |
| [`DEPLOY.md`](DEPLOY.md)                       | Deploy e infraestrutura na VPS          |
| [`CLAUDE.md`](CLAUDE.md)                       | Guia operacional para sessoes do Claude |

---

## Contato

**Geek & Toys** -- Copacabana, Rio de Janeiro, RJ

- Site: [geeketoys.com.br](https://geeketoys.com.br)
- Instagram: [@gaborratoys](https://instagram.com/gaborratoys)
- Facebook: [Geek & Toys Collection](https://facebook.com/geekandtoyscollection)
- TikTok: [@gaborratoys](https://tiktok.com/@gaborratoys)
- WhatsApp: [Contato](https://wa.me/5521972524776)

---

## Licenca

Este repositorio e **proprietario**. O codigo e publicado para fins de portfolio e referencia tecnica. Todos os direitos reservados a Geek & Toys.
