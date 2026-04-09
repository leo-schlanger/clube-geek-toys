# TODO - Plano de Melhorias do Projeto

> **Ultima atualizacao:** 09 de Abril de 2026

## Legenda

- **CRITICO** - Deve ser feito imediatamente
- **ALTO** - Proximo sprint
- **MEDIO** - Planejado
- **BAIXO** - Nice to have
- **FUTURO** - Backlog

---

## Concluido

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
- [x] **PagBank** - PIX + Cartao + Assinaturas recorrentes
- [x] **Audit logging** - Registro de acoes criticas (auth, pontos, contratos, email)
- [x] **Cron jobs** - Expiracao de pontos/membros, lembretes, notificacao de pontos
- [x] **Rate limiting** - Em todos endpoints criticos incluindo refresh e webhooks
- [x] **RBAC + Ownership** - Middleware centralizado de verificacao de propriedade
- [x] **Error tracking local** - error_logs no PostgreSQL + captura global frontend
- [x] **13 email templates** - Todos conectados (webhook, cron, frontend, backend auto)
- [x] **LGPD endpoints** - Export dados + delete account + revogacao de contrato
- [x] **Points reconciliation** - Funcao para recalcular e corrigir saldo de pontos

### Seguranca (Marco-Abril 2026)

- [x] **Validacao Zod** - Schemas rigorosos em todos endpoints
- [x] **Sanitizacao HTML** - Prevencao XSS em emails
- [x] **Webhook verification** - Server-to-server via API PagBank + rate limit
- [x] **Idempotencia** - Key baseada em chargeId (nao status)
- [x] **IDOR protection** - Middleware ownership em pontos, pagamentos, contratos
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

- [x] **Assinaturas recorrentes** - PagBank com transacoes atomicas
- [x] **Webhooks verificados** - Server-to-server + idempotencia
- [x] **Cancelamento automatico** - Apos 3 falhas consecutivas com email
- [x] **Expiracao automatica** - Cron marca membros expirados diariamente
- [x] **Calculo correto de expiry** - Mensal +1 mes, anual +1 ano

### Pontuacao (Abril 2026)

- [x] **Promocao corrigida** - Backend da 0 pontos (nao 2x)
- [x] **Resgate validado** - Server-side contra REDEMPTION_RULES
- [x] **Status check** - Apenas membros ativos podem ganhar/resgatar
- [x] **CHECK constraint** - points >= 0 no banco
- [x] **Audit completo** - Expiracao logada no audit_logs
- [x] **Reconciliacao** - Funcao para recalcular saldo

---

## Pendente

### ALTO - Proximo Sprint

- [ ] **Whitelist PagBank** - Configurar IP da VPS no painel PagBank para webhooks em producao

### MEDIO - Planejado

- [ ] **Aumentar cobertura de testes** - Meta: 70%
- [ ] **Testes E2E** - Playwright (cadastro, login, pagamento)
- [ ] **Settings dinamico** - Permitir editar precos/planos via admin (hoje e code-only)

### BAIXO - Nice to Have

- [ ] **Storybook** - Documentar componentes UI
- [ ] **Otimizar bundle** - Tree-shaking mais agressivo
- [ ] **Image optimization** - Lazy load e compressao
- [ ] **Notificacoes push** - Lembretes de vencimento e pontos

---

## FUTURO v2.0+

### Novos Produtos

- [ ] **App Mobile (React Native)** - App nativo para iOS/Android
- [ ] **Multi-tenancy** - Suportar multiplas lojas
- [ ] **Integracao e-commerce** - APIs de terceiros
- [ ] **Sistema de indicacao** - Tracking + rewards

### Infraestrutura

- [ ] **Redis** - Cache para consultas frequentes
- [ ] **Replica PostgreSQL** - Read replica para relatorios
- [ ] **Monitoring stack** - Prometheus + Grafana

---

## Debitos Tecnicos

1. MapperUtils usa `any` (necessario para flexibilidade)
2. Soft-delete de usuarios (role → `disabled`, nao deleta)
3. vendor-charts bundle (435KB) - Lazy loaded via ReportsTab
4. Erros TypeScript pre-existentes em payments.ts, points.ts, reports.ts (tipos `unknown`)
5. Logo VIP (2.3MB PNG) - Servida como esta, sem WebP (falta sharp em prod)

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
| PagBank        | SaaS         | Taxa por transacao |
| GitHub Actions | SaaS         | Free tier          |

---

_Documento atualizado em 09 de Abril de 2026_
