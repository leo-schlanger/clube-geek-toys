# Clube GeekPop & Toys

Plataforma completa de clube de vantagens para a loja **GeekPop & Toys** -- cadastro, assinatura digital, pagamentos recorrentes, carteirinha digital, PDV, loja e-commerce própria e painel administrativo.

> **Stack**: React 19 + Vite | Node.js + Express | PostgreSQL | Stripe | Docker | Nginx | AzuraCast

---

## Sobre o Projeto

A **GeekPop & Toys** é uma loja de K-pop e cultura pop em Copacabana, Rio de Janeiro, com mais de 15 anos no mercado geek. Nasceu como referência em colecionáveis e hoje tem foco em photocards, merch e a cena K-pop, com envio pelos Correios para todo o Brasil. O **Clube GeekPop & Toys** é o programa de fidelidade digital da loja, com 10% de desconto em qualquer produto, 50% de desconto nos ingressos dos eventos e brinde na primeira compra da loja.

A plataforma inclui:

- **Plano único anual** com desconto exclusivo e benefícios para membros
- **Contrato digital** com validade jurídica (Lei 14.063/2020)
- **Carteirinha digital premium** com QR Code e design metálico
- **Loja e-commerce própria** em `shop.geeketoys.com.br` com desconto de membro aplicado no checkout
- **Canal Atacado B2B** em `shop.geeketoys.com.br/atacado` (CNPJ + 25% após aprovação)
- **PDV integrado** para verificação de membro e aplicação de desconto na loja física
- **Rádio online** via AzuraCast em `rádio.geeketoys.com.br`

---

## Plano e Preço

Um único plano anual, sem opção mensal e sem tiers.

| Plano                    | Anual     | Benefícios                                                                                                                     |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Clube GeekPop & Toys** | R$ 149,99 | 10% de desconto em qualquer produto (loja física e online) + 50% nos ingressos dos eventos + brinde na primeira compra da loja |

---

## Funcionalidades

### Cadastro e Assinatura

Wizard de 3 etapas: criação de conta, assinatura de contrato digital e pagamento. Como há um único plano anual, não há seleção de tier nem de frequência — o membro assina eletronicamente e paga na mesma sessão.

### Contrato Digital

Assinatura eletronica com validade jurídica conforme a Lei 14.063/2020. Cada contrato recebe um hash SHA-256 único. O PDF é gerado automaticamente e enviado por email ao membro.

### Pagamentos

- **Cartão de Crédito**: processado via Stripe com suporte a 3D Secure
- **PIX**: QR Code gerado localmente com confirmação manual pelo admin

### Assinatura Recorrente

Gerenciada pelo Stripe Subscriptions. Suporte a pausa, retomada e cancelamento da assinatura anual. Webhooks processam eventos de cobranca automaticamente.

### Carteirinha Digital

Cartão premium com visual metálico, chip decorativo, shimmer holográfico animado e QR Code de verificação.

### Loja E-commerce Própria

Loja online em `shop.geeketoys.com.br`, servida pelo mesmo bundle Vite (o subdomínio e detectado por `getAppMode()`):

- Catálogo público com categorias, busca estilo Shopee (header) e páginas de produto
- Variações de produto (cor/tamanho etc.) com preco/estoque e **foto por SKU** (admin + PDP)
- Carrinho persistido em `localStorage` (`CartContext`)
- Checkout com cartão (Stripe) ou PIX local
- **Desconto de 10% do membro aplicado server-side no checkout** (`discount_reason = 'member_10'`) — nunca confiando no valor enviado pelo cliente
- Webhook confirma o pagamento e baixa o estoque automaticamente; PIX de loja é confirmado manualmente pelo admin
- O estoque fica **reservado** desde o checkout até o pagamento (ou até o TTL de 24h), então a mesma última unidade não é vendida duas vezes enquanto um PIX espera confirmação
- Custo por produto alimenta lucro bruto, margem, CMV e valor imobilizado no relatório de fechamento

### Canal Atacado (B2B)

Aba dedicada em `/atacado` (mesmo host da loja):

- Cadastro e login com **CNPJ** (checksum brasileiro + confere com o cadastro)
- Aprovação manual no admin (atividade / objeto social alinhado a compra)
- **25% de desconto** server-side (`discount_reason = 'wholesale_25'`) só com conta aprovada
- Produtos só entram no catálogo atacado com flag `wholesale_enabled` (pronto antes da importação)
- Documentação: [`docs/WHOLESALE.md`](docs/WHOLESALE.md)

### Conta e Perfil de Cliente

Comprar não exige assinar o clube. Em `/cadastro` qualquer pessoa cria conta com e-mail e senha; o restante do perfil é opcional:

- Telefone, data de nascimento, gênero (com "prefiro não dizer") e endereco
- Foto de perfil opcional
- **Produtos salvos** ("compras salvas") pelo coração no catálogo e na página do produto
- Histórico de pedidos com rastreio
- Consentimento de marketing guardado separado do cadastro

Perfil e produtos salvos entram no export e na exclusao LGPD.

### Frete e Entrega

Cotação real dos Correios via **Melhor Envio** (OAuth2 com refresh automático do token). Sem credencial válida, a cotação cai numa tabela interna de fallback — e esse estado é visível em `GET /health` (`shipping.quotes`), porque a falha é silenciosa por natureza.

Rastreio: o admin lança o código, o pedido vai para "enviado", sai e-mail para o cliente e o código aparece em "Minhas compras" com link para os Correios.

### Cancelamento de Pedido

O cliente cancela sozinho um pedido **ainda não pago**, em "Minhas compras". Pedido já pago exige estorno, que continua sendo ação de admin.

### Avaliações e Crédito de Loja

Cliente avalia produto de pedido entregue e ganha crédito de loja, aplicável no próximo checkout.

### Perguntas nos Produtos

Pergunta pública na página do produto, identificada pelo primeiro nome. A resposta do admin gera notificação no perfil e e-mail. Moderação é a posteriori.

### PDV (Ponto de Venda)

Interface para vendedores na loja física:

- Verificação de membro por CPF ou QR Code da carteirinha
- Visualização do status do membro (EM DIA) e do desconto de 10% aplicável
- Apenas verificação — o PDV não registra pontos nem compras

### Admin Dashboard

Painel completo de gestão:

- Visão geral com métricas (membros ativos, receita, churn)
- Gestão de membros (busca, filtros, edição, ativação/desativação)
- Aba **Atacado** (aprovação de CNPJ B2B) e flag de produto para o canal
- Confirmação de pagamentos PIX pendentes (assinatura e loja)
- Gestão da loja: aba **Produtos** (catálogo, fotos, videos, variações, até 5 categorias, duplicar), aba **Estoque** (ajuste por SKU + histórico de movimentação), aba **Pedidos** e aba **Perguntas** (responder cliente)
- Logs de ações do sistema
- Exportação CSV

### Rádio Online

Rádio da loja via AzuraCast, acessível em `rádio.geeketoys.com.br`. Stack isolada com playlists gerenciadas por scripts automatizados.

### Analytics

Umami self-hosted em `analytics.geeketoys.com.br` para métricas de uso sem rastreamento invasivo (compliance LGPD).

### Design e Marca

Identidade **GeekPop & Toys** (pop / K-culture): **Hot Pink** `#F04080` + **Pop Yellow** `#FCBE04`, UI dark-first, tipografia Outfit + Inter.  
Documentação completa e inventário de componentes: [`docs/DESIGN.md`](docs/DESIGN.md).

### Eventos (loja)

Na loja (`shop.geeketoys.com.br`): banner de anúncio, página `/evento` com infos, reserva de ingresso (WhatsApp). As fotos ficam na galeria do site institucional, sem download. Config em `src/data/event.ts` — ver [`docs/EVENTS.md`](docs/EVENTS.md).

### E-mails Transacionais

Templates via Resend API cobrindo todo o ciclo de vida:

- Verificação de email e recuperação de senha
- Confirmação de pagamento (cartão e PIX)
- Contrato digital assinado (PDF anexo)
- Eventos de assinatura (ativação, renovação, cancelamento, pausa)
- Notificações administrativas (PIX pendente da assinatura e da loja, pedido cancelado pelo cliente, novos membros)

### Cron Jobs

Tarefas automáticas diárias (6h UTC):

- Expiração de membros com assinatura vencida
- Lembretes de renovação próxima do vencimento

---

## Arquitetura

### Stack Tecnológica

| Camada         | Tecnologias                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **Frontend**   | React 19, TypeScript, Vite 7, Tailwind CSS, shadcn/ui, TanStack Query, Framer Motion, Stripe Elements |
| **Backend**    | Node.js 20, Express, PostgreSQL 16, JWT + bcrypt, Zod                                                 |
| **Infra**      | Docker Compose, Nginx, Let's Encrypt (Certbot), GitHub Actions                                        |
| **Email**      | Resend API (21 templates)                                                                             |
| **Pagamentos** | Stripe (cartão + subscriptions) + PIX local                                                           |
| **Rádio**      | AzuraCast (stack Docker isolada)                                                                      |
| **Analytics**  | Umami (self-hosted)                                                                                   |

### Domínios

| Domínio                      | Serviço                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `club.geeketoys.com.br`      | SPA membros                                                           |
| `adm.geeketoys.com.br`       | SPA admin (canônico; `admin.*` redireciona 301)                       |
| `shop.geeketoys.com.br`      | SPA loja (mesmo bundle Vite; subdomínio detectado por `getAppMode()`) |
| `api.geeketoys.com.br`       | API Express (serve também `/uploads` de imagens de produto)           |
| `analytics.geeketoys.com.br` | Umami Analytics                                                       |
| `rádio.geeketoys.com.br`     | AzuraCast (rádio)                                                     |

`geekpoptoys.com.br` é um espelho completo: os mesmos subdomínios respondem nos dois dominios, com o mesmo certificado SAN. A loja e **canônica em `shop.geekpoptoys.com.br`** e o clube em `club.geeketoys.com.br` — ver `CANONICAL_ORIGINS` em `src/lib/subdomain.ts`.

---

## Estrutura de Pastas

```
clube-geek-toys/
├── src/                    # Frontend React (SPA membros + admin + loja)
│   ├── components/         # Componentes (ui/, admin/, reports/, store/)
│   ├── pages/              # Páginas da aplicação (inclui pages/shop/)
│   ├── contexts/           # React Contexts (Auth, Cart)
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Serviços, API client, utilitários (products, orders)
│   └── types/              # Tipos TypeScript
├── server/                 # Backend + infra
│   ├── api/                # Express API (routes, services, middleware, db)
│   ├── nginx/              # Configurações Nginx (server blocks, headers)
│   ├── azuracast/          # Stack da rádio (fonte versionada)
│   ├── scripts/            # Scripts de setup/manutenção
│   └── docker-compose.yml  # Orquestração de produção
├── scripts/rádio/          # Scripts de gestão da biblioteca musical
├── docs/                   # Documentação técnica
│   ├── DESIGN.md           # Design system e marca (paleta, componentes)
│   └── assets/             # Referências visuais de marca
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

### Instalação

```bash
# Clonar o repositório
git clone https://github.com/leo-schlanger/clube-geek-toys.git
cd clube-geek-toys

# Instalar dependencias do frontend
npm install

# Configurar variáveis de ambiente do frontend
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

> As variáveis de ambiente necessárias estão documentadas nos arquivos `.env.example` (raiz e `server/`). Consulte `CLAUDE.md` para detalhes sobre a validação Zod das env vars.

---

## Scripts Disponíveis

### Frontend

```bash
npm run dev           # Servidor de desenvolvimento (Vite)
npm run build         # Build de produção (tsc -b + vite build) — é o que o CI roda
npm run typecheck     # Tipos dos testes e do E2E (ficam fora do build)
npm run preview       # Preview local do build
npm run lint          # Verificar código (ESLint) — 0 erros esperado
npm run test          # Rodar testes (watch)
npm run test:changed  # Só o que o diff afeta (~3 min) — use antes do commit
npm run test:api      # Backend (projeto node)
npm run test:web      # Front (projeto jsdom)
npm run test:coverage # Cobertura de testes (front + backend)
```

### Backend (Docker)

```bash
cd server
docker compose up -d                     # Subir serviços
docker compose down                      # Parar serviços
docker compose logs -f api               # Logs da API
docker compose build --no-cache api      # Rebuild da API
docker compose ps                        # Status dos containers
```

### Rádio

Scripts em `scripts/rádio/` para gestão da biblioteca musical:

```bash
cd scripts/rádio
python download-batch.py lista.txt gênero   # Download de músicas
./upload-to-vps.sh downloads/gênero gênero  # Upload para o servidor
./playlist-attach.sh gênero <PLAYLIST_ID>   # Associar a playlist
```

Detalhes completos em `scripts/rádio/README.md`.

---

## Documentação

| Documento                                              | Conteudo                                |
| ------------------------------------------------------ | --------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)         | Arquitetura técnica detalhada           |
| [`docs/PROJECT.md`](docs/PROJECT.md)                   | Escopo, modelos de dados, endpoints API |
| [`docs/SECURITY.md`](docs/SECURITY.md)                 | Segurança, LGPD, autenticação           |
| [`docs/RADIO.md`](docs/RADIO.md)                       | Operação da rádio AzuraCast             |
| [`docs/TODO.md`](docs/TODO.md)                         | Roadmap e progresso                     |
| [`docs/DESIGN.md`](docs/DESIGN.md)                     | Design system e marca                   |
| [`docs/WHOLESALE.md`](docs/WHOLESALE.md)               | Canal atacado B2B                       |
| [`docs/EVENTS.md`](docs/EVENTS.md)                     | Eventos na loja                         |
| [`docs/SHOP-ORDERS.md`](docs/SHOP-ORDERS.md)           | Pedidos da loja                         |
| [`docs/PRODUCT-VARIANTS.md`](docs/PRODUCT-VARIANTS.md) | Variações de produto                    |
| [`docs/DOC-STATUS.md`](docs/DOC-STATUS.md)             | Auditoria docs vs código                |
| [`DEPLOY.md`](DEPLOY.md)                               | Deploy e infraestrutura na VPS          |
| [`CLAUDE.md`](CLAUDE.md)                               | Guia operacional para sessoes do Claude |

---

## Contato

**GeekPop & Toys** -- Copacabana, Rio de Janeiro, RJ

- Site: [geeketoys.com.br](https://geeketoys.com.br) · [links](https://geeketoys.com.br/links)
- Loja: [shop.geekpoptoys.com.br](https://shop.geekpoptoys.com.br)
- Instagram: [@geeketoys](https://instagram.com/geeketoys)
- Facebook: [GeekPop & Toys Collection](https://facebook.com/geeketoyscolection)
- TikTok: [@geeketoys](https://tiktok.com/@geeketoys)
- WhatsApp: [(11) 91466-2881](https://wa.me/5511914662881)

---

## Licença

Este repositório é **proprietário**. O código é publicado para fins de portfolio e referência técnica. Todos os direitos reservados a GeekPop & Toys.
