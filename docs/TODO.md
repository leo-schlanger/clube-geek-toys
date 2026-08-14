# TODO - Plano de Melhorias do Projeto

> **Ultima atualizacao:** 4 de Agosto de 2026

## Legenda

- **CRITICO** - Deve ser feito imediatamente
- **ALTO** - Proximo sprint
- **MEDIO** - Planejado
- **BAIXO** - Nice to have
- **FUTURO** - Backlog

---

## Concluido

### Plano Unico + Loja E-commerce (branch `feat/single-plan-and-store`)

- [x] **Plano unico anual** - Descontinuados os tiers Silver/Gold/Black e a opcao mensal; agora um unico plano "Clube GeekPop & Toys" (R$ 149,99/ano)
- [x] **Beneficio simplificado** - 15% de desconto em qualquer produto + brinde especial + entrada gratuita em eventos participantes
- [x] **Remocao do sistema de pontos** - Removidos `point_transactions`, `members.points`, `points.service`/`points.routes`, PointsTab/PointsSection/PointsChart, resgate, expiracao e multiplicadores
- [x] **PDV simplificado** - Agora e apenas verificacao de membro (CPF/QR) exibindo status + 15%; nao registra mais compras nem pontos
- [x] **Migration 008** - Colapsa `plan` para `'club'`, forca `payment_type = 'annual'` e dropa a estrutura de pontos
- [x] **Loja e-commerce propria** - `shop.geeketoys.com.br` no mesmo bundle Vite (subdominio detectado por `getAppMode()`)
- [x] **Migration 009** - Tabelas `categories`, `products`, `orders`, `order_items`
- [x] **Checkout da loja** - Catalogo publico -> carrinho (`CartContext`, localStorage) -> Stripe/PIX -> webhook confirma e baixa estoque
- [x] **Desconto server-side** - 15% aplicado no backend no checkout (`discount_reason = 'member_15'`), nunca confiando no cliente
- [x] **Backend da loja** - `product.service`/`order.service`, `product.routes`/`order.routes`, `webhook.service` estendido para `metadata.kind = 'shop_order'`
- [x] **Admin da loja** - Novas abas Produtos e Pedidos; imagens de produto no volume `/uploads`
- [x] **Email `order-confirmed`** - Confirmacao de pedido de loja (substitui `points-expiring` na lista de templates)

### Auditoria de Cadastro (Abril 2026)

- [x] **Fix PIX polling** - Corrigido polling que chamava Stripe API com UUID local, nunca detectava confirmacao de pagamento
- [x] **Email de boas-vindas na ativacao** - Template existia mas nunca era disparado; agora envia na primeira ativacao do membro
- [x] **Fix URLs nos emails** - CTA corrigido de /minha-conta para /membro
- [x] **Fix label PIX enganoso** - Removido "aprovacao instantanea" (PIX requer confirmacao manual admin)
- [x] **Notificacao admin novo membro** - Template admin-new-member enviado automaticamente no cadastro
- [x] **Copia do contrato para admin** - Email de contrato enviado automaticamente para admin (fallback env.ADMIN_EMAIL)
- [x] **Mascara de CPF no contrato** - CPF formatado com mascara (XXX.XXX.XXX-XX) na revisao do contrato
- [x] **Nome real no Stripe** - Pagamentos agora enviam nome real do membro (antes era hardcoded 'Membro')

### Auditoria de Pontos (Abril 2026) — superseded

> O sistema de pontos foi removido na reforma de plano unico (migration 008). Os itens abaixo ficam apenas como registro historico.

- [x] **Fix redeemPoints com pontos expirados** - Corrigido resgate permitindo pontos expirados mas nao processados pelo cron
- [x] **Fix newBalance com drift** - Corrigido calculo usando members.points (drifted) em vez do saldo real calculado
- [x] **Fix getBalance retornando valor stale** - Agora calcula a partir das transacoes excluindo expiradas
- [x] **Fix getExpiringPoints** - Corrigido retorno de TODAS as transacoes earn; agora filtra pela janela de 30 dias
- [x] **Reconciliacao diaria no cron** - Adicionado reconcilePointsBalances ao cron diario
- [x] **Estilo bonus no historico** - Icone amarelo para transacoes do tipo bonus no historico de pontos
- [x] **Fix export CSV** - Corrigido escaping para nomes com virgulas

### Auditoria de Planos (Abril 2026) — superseded

> Os multiplos planos e o upgrade de tier foram descontinuados na reforma de plano unico. Itens abaixo como registro historico.

- [x] **Fix RenewModal/UpgradeModal** - Corrigido memberId nao passado ao PaymentModal (era 'temp_member', resultava em 403)
- [x] **Remover override de expiry no frontend** - Renovacao agora deixa webhook calcular corretamente, preservando dias restantes
- [x] **Fix assinaturas pausadas nao expirando** - Cron agora inclui subscription_status='paused'
- [x] **Fix mensagem de pausa** - Corrigido de "beneficios suspensos" para "validos ate vencimento"

### Auditoria de Emails (Abril 2026)

- [x] **Redesign de 17 templates** - Todos os templates com logo, CNPJ real, links sociais e branding
- [x] **Template member-expired** - Email enviado quando cron expira um membro
- [x] **Template subscription-resumed** - Email enviado ao retomar assinatura
- [x] **Welcome email com nome do plano** - Email de boas-vindas agora inclui o nome do plano
- [x] **Fix admin-pix-pending** - Corrigido member_id ausente para rastreamento de log de email

### Carteirinha Digital (Abril 2026)

- [x] **Redesign carteirinha digital** - Estetica de cartao fisico com visual premium
- [x] **Gradiente metalico da carteirinha** - Visual metalico premium do Clube GeekPop & Toys
- [x] **Smart chip e icone contactless** - Elementos visuais de cartao moderno
- [x] **Shimmer holografico** - Efeito de brilho holografico animado
- [x] **Numero do membro formato cartao** - Formatado no padrao de cartao de credito
- [x] **Textura circuit board** - Textura geek no fundo do cartao
- [x] **Flip 3D com animacao** - Animacao cubic-bezier para virar o cartao
- [x] **Verso com tarja magnetica e QR code** - QR code com glow do tier correspondente

### Documentacao (Abril 2026)

- [x] **Reescrita completa da documentacao** - README.md, ARCHITECTURE.md, PROJECT.md, SECURITY.md, DEPLOY.md
- [x] **Remocao de referencias PagBank** - Todas as referencias substituidas por Stripe
- [x] **Fluxos documentados end-to-end** - Todos os fluxos do sistema documentados

### Infraestrutura (Abril 2026)

- [x] **Migracao para VPS self-hosted** - Docker + PostgreSQL + Express + Nginx
- [x] **CI/CD com GitHub Actions** - Deploy automatico no push para master
- [x] **SSL com Let's Encrypt** - Certbot com renovacao automatica
- [x] **Analytics com Umami** - Self-hosted em analytics.geeketoys.com.br
- [x] **Docker Compose** - Todos os servicos containerizados com resource limits
- [x] **Nginx reverse proxy** - SSL termination + security headers + SPA serving
- [x] **Backup automatico PostgreSQL** - Script pg_dump + cron diario + retencao 7 dias
- [x] **Log rotation** - Docker json-file driver com max-size 10m em todos os servicos
- [x] **Health check + alertas** - Script cron 5min + alerta via Resend
- [x] **Cron health monitoring** - Timestamp last_cron_run salvo em config table

### Backend (Abril 2026)

- [x] **API Express** - Migrado de Cloudflare Workers para Node.js + Express
- [x] **PostgreSQL** - Migrado de Firestore para PostgreSQL 16
- [x] **Autenticacao JWT** - JWT customizado (bcrypt 12 rounds + refresh tokens)
- [x] **Stripe** - Cartao de credito via Stripe Elements + PIX local com QR code
- [x] **Audit logging** - Registro de acoes criticas (auth, pagamentos, contratos, email)
- [x] **Cron jobs** - Expiracao de membros e lembretes de renovacao
- [x] **Rate limiting** - Em todos endpoints criticos incluindo refresh, webhooks e LGPD delete
- [x] **RBAC + Ownership** - Middleware centralizado de verificacao de propriedade
- [x] **Error tracking local** - error_logs no PostgreSQL + captura global frontend
- [x] **13 email templates** - Todos conectados (webhook, cron, frontend, backend auto)
- [x] **LGPD endpoints** - Export dados + delete account + revogacao de contrato

### Seguranca (Marco-Abril 2026)

- [x] **Validacao Zod** - Schemas rigorosos em todos endpoints (incluindo contratos e email templates)
- [x] **Sanitizacao HTML** - Prevencao XSS em emails
- [x] **Webhook verification** - Assinatura criptografica Stripe (STRIPE_WEBHOOK_SECRET obrigatorio em prod)
- [x] **Idempotencia** - Key baseada em eventId Stripe
- [x] **IDOR protection** - Middleware ownership em pagamentos, contratos, pedidos
- [x] **Amount validation** - Rejeicao estrita de valores invalidos
- [x] **CSP habilitado** - Content Security Policy via Helmet
- [x] **CPF checksum** - Validacao Modulo 11 server-side
- [x] **Senha forte** - Min 8 chars + 1 maiuscula + 1 numero
- [x] **Transacoes atomicas** - BEGIN/COMMIT em subscriptions e email change
- [x] **Contrato IP server-side** - IP capturado no backend (nao client)
- [x] **Contrato timestamp server** - Gerado no server (nao client)
- [x] **Contract hash verify** - Endpoint GET /contracts/:id/verify
- [x] **PDF hash** - SHA-256 do PDF armazenado para verificacao de integridade
- [x] **Cookie consent** - Banner com opcoes essencial/analytics
- [x] **LGPD block active sub** - Impede exclusao com assinatura ativa
- [x] **PIX key via env** - Removido fallback hardcoded, PIX_KEY obrigatorio via env schema
- [x] **CORS configuravel** - Dominios de producao via env var ALLOWED_ORIGINS
- [x] **Dockerfile non-root** - Container API roda como user `node`, nao root
- [x] **Umami secrets obrigatorios** - Removidos defaults inseguros do docker-compose
- [x] **Indices otimizados** - subscriptions(status,created_at), audit_logs(user_id)
- [x] **Health check HTTPS** - CI/CD health check migrado de HTTP para HTTPS
- [x] **.env.production limpo** - Secrets via GitHub Secrets, nao commitados

### Assinatura Digital (Abril 2026)

- [x] **Lei 14.063/2020** - Assinatura eletronica simples com validade juridica
- [x] **SHA-256 hash** - memberId|nome|cpf|email|plano|timestamp|IP
- [x] **PDF gerado** - pdf-lib com logo, clausulas, dados, assinatura, hash de validacao
- [x] **IP server-side** - Capturado via req.ip (nao client-side)
- [x] **Timestamp server** - Gerado no backend
- [x] **PDF hash armazenado** - SHA-256 do binario do PDF para integridade
- [x] **Endpoint de verificacao** - Recalcula hash e compara com armazenado
- [x] **Contratos versionados** - Status active/superseded/revoked
- [x] **Audit trail** - Assinatura e revogacao logadas

### Frontend (Marco-Abril 2026)

- [x] **Landing page redesign** - Logo VIP, animacoes CSS, shimmer text, glow
- [x] **SEO completo** - OG image 1200x630, Schema.org Product + FAQ, meta tags VIP
- [x] **PWA** - Manifest com logo VIP, categories, icons
- [x] **Email verification auto-polling** - Detecta verificacao a cada 5s
- [x] **Registration flow recovery** - Detecta user existente e resume do passo correto
- [x] **Contract scroll UX** - Indicador "role ate o final", scroll-to-checkbox
- [x] **Privacy checkbox** - Checkbox separado para Politica de Privacidade
- [x] **Admin member detail** - Pagamentos, assinatura e contrato no modal
- [x] **Font Outfit** - Tipografia moderna para headings

### Pagamentos (Marco-Abril 2026)

- [x] **Stripe Elements** - Pagamento com cartao via Stripe
- [x] **PIX local** - QR code gerado localmente com confirmacao manual admin
- [x] **Webhooks Stripe** - Assinatura verificada + idempotencia
- [x] **Cancelamento automatico** - Apos 3 falhas consecutivas com email
- [x] **Expiracao automatica** - Cron marca membros expirados diariamente
- [x] **Calculo correto de expiry** - Plano anual: +1 ano a partir da data de expiracao vigente

### Pontuacao (Abril 2026) — superseded

> Sistema de pontos removido na migration 008. Itens abaixo como registro historico.

- [x] **Promocao corrigida** - Backend da 0 pontos (nao 2x)
- [x] **Resgate validado** - Server-side contra REDEMPTION_RULES
- [x] **Status check** - Apenas membros ativos podem ganhar/resgatar
- [x] **CHECK constraint** - points >= 0 no banco
- [x] **Audit completo** - Expiracao logada no audit_logs
- [x] **Reconciliacao** - Funcao para recalcular saldo

---

## Pendente

### Eventos — loja + site institucional (pedido Laura — Ago/2026)

> **Loja (`shop.*`):** este repo — `docs/EVENTS.md`, `src/data/event.ts`, rota `/evento`  
> **Home (`geeketoys.com.br`):** repo `geek-toys-home` — `docs/EVENTS.md`

- [x] **Planejamento** - Banner + infos + reserva de ingresso + galeria geral
- [x] **Site institucional** - Banner, seções, reserva, fotos (geek-toys-home)
- [x] **Loja (shop)** - Banner em todas as páginas, card na home, `/evento`, reserva, fotos
- [x] **Galeria geral** - fotos no home `#galeria` (sem download)
- [x] **Reserva online de ingresso** - Formulário → WhatsApp da loja
- [x] **Conteúdo real GeekPop Night** - 6/set/2026 14h–18h, R$ 20, colo/PCD isentos (07/08/2026)
- [x] **35 fotos do evento** - `public/eventos/kpop-night/` nos dois repos (sem duplicatas)
- [x] **WhatsApp loja principal** - (11) 91466-2881 + secundário (21) 98546-4666
- [x] **E2E users** - e2e-admin@ / e2e-member@ (CLAUDE.local.md)
- [ ] **ALTO** Laura: enviar fotos reais dos 14 produtos ativos (vitrine mostra "Sem foto")
- [x] **Filtro seed Checkup** - não listar na API pública / categorias
- [x] **Admin highlight** - badge "Sem foto" + contagem no catálogo
- [ ] **FUTURO** Validar membro do Clube na reserva / pagamento Stripe de ingresso

### Loja / pedidos (pedido Laura — Ago/2026)

- [x] **Estudo + plano** - frete Correios, minhas compras, reviews, SEO K-pop
- [x] **SEO/bio K-pop** - geek-toys-home title/OG/Hero/About; e-mail footer; shop hero/sitemap
- [x] **Deploy home em produção** - `www.geeketoys.com.br` já serve título/copy "Loja de K-pop" (Vercel auto a partir de `main`)
- [x] **Frete no checkout** - CEP ViaCEP + cotação Melhor Envio (fallback tabela) + frete no total
- [x] **Endereço de entrega** - formulário checkout + `shipping_address` tipado
- [x] **Minhas compras** - abas Tudo / A pagar / Preparando / A caminho / Finalizado / Cancelado
- [x] **Rastreio** - admin salva código Correios; cliente vê link em Minhas compras
- [x] **Você também pode gostar** - related por categoria no PDP
- [x] **Formas de pagamento (trust)** - badges PIX/cartão no checkout, PDP e footer
- [ ] **ALTO** Conta Melhor Envio + `MELHOR_ENVIO_TOKEN` em produção — **token ainda vazio** na VPS (cotação = fallback PAC/SEDEX). Código OK; falta o Bearer da conta ME (ver SHOP-ORDERS.md)
- [x] **Avaliações + crédito fixo** - review pós-entrega, R$1 default, checkout com crédito, admin moderação
- [ ] **MEDIO** Etiqueta automática Melhor Envio
- [x] **Sitemap dinâmico de produtos** + OG title shop via nginx sub_filter
- [x] **E-mails** order-shipped + order-confirmed no PIX confirm
- [ ] **BAIXO** Google Meu Negócio / Instagram bio (manual Laura)

### MEDIO - Planejado

- [x] **Aumentar cobertura de testes** - Meta 70% atingida (10/08 noite): **stmts 74.0%** · **lines 76.2%** · **funcs 70.1%** · **branches 68.0%** (2192 testes ✓). Shop pages cobertas (`src/pages/shop` ~74% stmts).
- [ ] **Testes E2E** - Playwright (cadastro, login, pagamento)
- [ ] **Settings/preferencias do membro** - Permitir editar preferencias pessoais e notificacoes
- [ ] **Structured logging** - Substituir console.log por logger com niveis (Pino/Winston)
- [ ] **Backup off-site** - Upload automatico de backups para S3/GCS/Backblaze
- [ ] **Fluxo de atualizar metodo de pagamento** - Atualmente requer cancelar e re-assinar
- [x] **Calculo de frete na loja** - ViaCEP + Melhor Envio / fallback (migration 010)
- [ ] **Gateway PIX automatico na loja** - Confirmacao de PIX de pedido ainda e manual pelo admin

### Dados / LGPD / integridade loja (Ago/2026)

- [x] **LGPD export** inclui pedidos, itens, reviews e crédito de loja
- [x] **LGPD delete** anonimiza pedidos/endereço, oculta reviews, zera crédito
- [x] **Fix email_logs** no export (member_id / recipient, não user_id inexistente)
- [x] **Restaurar store credit** em cancel, payment_failed e refund
- [x] **Race review_reward** — unique index + crédito na mesma TX
- [x] **orders.user_id** para ownership de Minhas compras
- [x] **Agregar qty** no checkout (anti oversell por linhas duplicadas)
- [x] **Docs** PROJECT / DOC-STATUS / SHOP-ORDERS / SECURITY alinhados ao schema 010–011
- [ ] **FUTURO** Reserva de estoque (hold) entre create e paid

### Atacado B2B (pedido Norberto 10/08/2026)

- [x] **Schema 012** - `wholesale_accounts`, flags de produto, `orders.channel` / CNPJ
- [x] **API** - register/login CNPJ, admin approve, checkout `wholesale_25`
- [x] **Shop** - aba `/atacado`, cadastro, login, carrinho separado, checkout
- [x] **Admin** - aba Atacadistas + flag "Disponível no atacado" no produto
- [x] **LGPD** - export/delete cobrem conta atacado e `customer_cnpj`
- [x] **Docs** - WHOLESALE, PROJECT, ARCH, SHOP-ORDERS, SECURITY, DOC-STATUS, README
- [x] **Testes unitários Atacado** - cnpj, wholesale API client, pages, store components
- [ ] **Cobertura global 70%** - meta de projeto (baseline ~11%); expandir gradualmente
- [x] **Deploy** - Atacado + variações em prod (master CI)
- [x] **Operação** - 55 SKUs com `wholesale_enabled` em prod (10/08; min 2/3/6 por faixa de preço; exclui Checkup)
- [ ] **Operação** - Laura/Norberto: aprovar CNPJs de clientes B2B quando se cadastrarem

### Variações de produto estilo Shopee (pedido Laura 10/08/2026)

- [x] **Schema 013** - `has_variants`, `variant_axes`, `product_variants`, snapshot no pedido
- [x] **API** - PUT `/products/:id/variants`, checkout com `variantId`
- [x] **Admin** - eixos + gerar combinações + preço/estoque por SKU
- [x] **PDP** - seletor de variações abaixo do produto (como Shopee)
- [x] **Docs** - `PRODUCT-VARIANTS.md`
- [x] **Ilimitado** - removido max 2 eixos; UI com chips de opção + textos claros (10/08)
- [x] **Dados prod** - eixos da Bolsa/BT21 normalizados (Cor / Personagem)
- [x] **Foto por variação** - admin: upload/URL/galeria por SKU; PDP: galeria + swatches (12/08)
- [x] **Busca loja estilo Shopee** - barra sempre visível + borda brand + botão Buscar (12/08)
- [x] **Testes** - VariantPicker (swatches/`resolveVariantImages`), ShopHeader busca, PDP troca de foto

### Filtros do catálogo + recorte de foto (pedido Laura 13/08/2026)

- [x] **Ordenação na loja/atacado** - A–Z, Z–A, postagem (mais recentes/antigos), menor/maior preço (`?sort=`, `ORDER BY` no Postgres + `LIMIT/OFFSET`)
- [x] **Paginação** - loja/atacado `?page=` (24/página); admin 10/25/50/100; troca de sort/busca volta à página 1
- [x] **Ordenação no admin** - mesma grade na aba Produtos via API (padrão A–Z para agrupar photocards)
- [x] **Recorte no post** - diálogo ao enviar imagem (proporção Quadrado/Photocard/Retrato/Paisagem/Livre + tamanho 800/1200/1600/personalizado)
- [x] **Testes** - product-sort, ProductSortSelect, ImageCropDialog, crop math, ShopHome/Wholesale/CategoryNav/ShopHeader

### Hardening (10/08/2026 — validação de fluxos)

- [x] **Admin criar membro** - cria user do e-mail (não amarra no JWT do admin)
- [x] **Assinatura Stripe** - valor sempre `CLUB_PLAN_PRICE` no server
- [x] **Restock** - cancel/refund após pago devolve estoque
- [x] **Ativar membro manual** - preenche start/expiry +1 ano se faltar
- [x] **Categorias** - "Assessório"→"Acessório", "Vestuario"→"Vestuário"

### BAIXO - Nice to Have

- [ ] **Storybook** - Documentar componentes UI
- [ ] **Otimizar bundle** - Tree-shaking mais agressivo
- [ ] **Image optimization** - Logo VIP 2.3MB PNG → WebP, lazy load
- [ ] **Notificacoes push** - Lembretes de vencimento da assinatura
- [ ] **ARIA labels** - Melhorar acessibilidade em botoes com apenas icone
- [ ] **httpOnly cookies** - Migrar JWT tokens de localStorage para cookies seguros

---

## FUTURO v2.0+

### Novos Produtos

- [ ] **App Mobile (React Native)** - App nativo para iOS/Android
- [ ] **Multi-tenancy** - Suportar multiplas lojas
- [ ] ~~**Integracao com marketplaces (Shopee/ML)**~~ — **cancelado** (Laura: não usam mais; loja própria)
- [ ] **Sistema de indicacao** - Tracking + rewards

### Infraestrutura

- [ ] **Redis** - Cache para consultas frequentes + rate limiting cross-instance
- [ ] **Replica PostgreSQL** - Read replica para relatorios
- [ ] **Monitoring stack** - Prometheus + Grafana

---

## Domínios / Admin (Agosto 2026)

- [x] **Diagnóstico admin.geekpoptoys.com.br** - DNS/cert/CORS/HTML OK nos quatro hosts (admin/adm × geeketoys/geekpoptoys)
- [x] **Canônico adm.\*** - nginx 301 `admin.geeketoys.com.br` e `admin.geekpoptoys.com.br` → `adm.*` correspondente
- [x] **Links internos** - `getSubdomainUrl('admin')` gera `adm.*` (não `admin.*`)
- [x] **Deploy nginx** - `admin.*` → 301 `adm.*` ok em produção

## Design System / Branding (Agosto 2026)

Fonte de verdade: [`docs/DESIGN.md`](DESIGN.md) | Referencia: [`docs/assets/brand-reference.jpg`](assets/brand-reference.jpg)

Paleta oficial: **Hot Pink** `#F04080` + **Pop Yellow** `#FCBE04` | UI dark-first | Outfit + Inter.

### Documentacao

- [x] **DESIGN.md** - Paleta, tokens, inventário de componentes, gaps e regras de uso
- [x] **Referencia visual versionada** - `docs/assets/brand-reference.jpg`
- [x] **ARCHITECTURE / PROJECT** - Carteirinha, e-mails e secao de branding atualizados

### Alinhamento de codigo

- [x] **Tokens CSS** primary/accent HSL da peça (`340 85% 59%` / `45 97% 50%`) + glows em `index.css`
- [x] **Carteirinha digital** (`MembershipCard`) — gradiente rosa/amarelo metalico (sem roxo residual no shimmer)
- [x] **`CLUB_PLAN.color`** → `#F04080`
- [x] **Badge `club`** → `bg-primary` (não violet)
- [x] **E-mails** — Hot Pink/Pop Yellow + wordmark "GeekPop & Toys" (footer loja K-pop RJ)
- [x] **Residual purple** removido em Subscribe, SubscriptionManagement, RealtimeMetrics (08/08/2026)
- [x] **`tailwind.config.js`** `fontFamily.heading` → Outfit
- [ ] **BAIXO** Revisar OG image / favicon se precisar de borda pink comic da peça

---

## Debitos Tecnicos

1. MapperUtils usa `any` (necessario para flexibilidade)
2. Soft-delete de usuarios (role → `disabled`, nao deleta)
3. vendor-charts bundle (435KB) - Lazy loaded via ReportsTab
4. Erros TypeScript pre-existentes em payments.ts, reports.ts (tipos `unknown`)
5. ~~Residuos de cor roxo/dourado fora da marca~~ — limpos 08/08/2026 (Subscribe/SubscriptionManagement/RealtimeMetrics/MembershipCard)

---

## Metricas

### Qualidade

| Metrica           | Atual                             | Meta |
| ----------------- | --------------------------------- | ---- |
| Test coverage     | **74% stmts / 76% lines** (10/08) | 70%  |
| TypeScript strict | Sim                               | Sim  |
| ESLint errors     | 0                                 | 0    |

### Infraestrutura

| Servico        | Tipo         | Custo              |
| -------------- | ------------ | ------------------ |
| VPS            | Self-hosted  | Custo fixo/mes     |
| PostgreSQL     | Docker (VPS) | Incluido           |
| Nginx          | Docker (VPS) | Incluido           |
| Umami          | Docker (VPS) | Incluido           |
| Resend (Email) | SaaS         | Free: 3k/mes       |
| Stripe         | SaaS         | Taxa por transacao |
| GitHub Actions | SaaS         | Free tier          |

---

_Documento atualizado em 7 de Agosto de 2026_
