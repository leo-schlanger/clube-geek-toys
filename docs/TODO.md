# TODO - Plano de Melhorias do Projeto

> **Ultima atualizacao:** 19 de Abril de 2026

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

### MEDIO - Planejado

- [ ] **Aumentar cobertura de testes** - Meta: 70% (atual ~11%)
- [ ] **Testes E2E** - Playwright (cadastro, login, pagamento)
- [ ] **Settings/preferencias do membro** - Permitir editar preferencias pessoais e notificacoes
- [ ] **Structured logging** - Substituir console.log por logger com niveis (Pino/Winston)
- [ ] **Backup off-site** - Upload automatico de backups para S3/GCS/Backblaze
- [ ] **Fluxo de atualizar metodo de pagamento** - Atualmente requer cancelar e re-assinar
- [ ] **Calculo de frete na loja** - Integrar frete real no checkout (hoje `shipping_cost = 0`)
- [ ] **Gateway PIX automatico na loja** - Confirmacao de PIX de pedido ainda e manual pelo admin

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
- [ ] **Integracao com marketplaces** - Sincronizar catalogo da loja com Shopee/Mercado Livre
- [ ] **Sistema de indicacao** - Tracking + rewards

### Infraestrutura

- [ ] **Redis** - Cache para consultas frequentes + rate limiting cross-instance
- [ ] **Replica PostgreSQL** - Read replica para relatorios
- [ ] **Monitoring stack** - Prometheus + Grafana

---

## Debitos Tecnicos

1. MapperUtils usa `any` (necessario para flexibilidade)
2. Soft-delete de usuarios (role → `disabled`, nao deleta)
3. vendor-charts bundle (435KB) - Lazy loaded via ReportsTab
4. Erros TypeScript pre-existentes em payments.ts, reports.ts (tipos `unknown`)

---

## Metricas

### Qualidade

| Metrica           | Atual | Meta |
| ----------------- | ----- | ---- |
| Test coverage     | ~11%  | 70%  |
| TypeScript strict | Sim   | Sim  |
| ESLint errors     | 0     | 0    |

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

_Documento atualizado em 19 de Abril de 2026_
