# TODO - Plano de Melhorias do Projeto

> **Ultima atualizacao:** 08 de Abril de 2026

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
- [x] **Docker Compose** - Todos os servicos containerizados
- [x] **Nginx reverse proxy** - SSL termination + security headers + SPA serving
- [x] **Backup automatico PostgreSQL** - Script pg_dump + cron diario + retencao 7 dias
- [x] **Log rotation** - Docker json-file driver com max-size 10m em todos os servicos
- [x] **Health check + alertas** - Script de monitoramento com alerta via Resend

### Backend (Abril 2026)

- [x] **API Express** - Migrado de Cloudflare Workers para Node.js + Express
- [x] **PostgreSQL** - Migrado de Firestore para PostgreSQL 16
- [x] **Autenticacao JWT** - Migrado de Firebase Auth para JWT customizado (bcrypt + refresh tokens)
- [x] **PagBank** - Migrado de Mercado Pago para PagBank (PIX + Cartao)
- [x] **Audit logging** - Registro de acoes criticas no banco
- [x] **Cron jobs** - node-cron para expiracao de pontos e lembretes
- [x] **Rate limiting server-side** - Middleware Express (antes era client-side)
- [x] **RBAC middleware** - Verificacao de roles no servidor
- [x] **Error tracking local** - Tabela error_logs no PostgreSQL + captura global de erros do frontend
- [x] **Update profile endpoint** - PATCH /auth/update-profile para troca de email/senha
- [x] **HTML email templates** - 13 templates HTML responsivos com branding e CTAs

### Seguranca (Marco-Abril 2026)

- [x] **Validacao Zod em todos endpoints** - Schemas com limites rigorosos
- [x] **Sanitizacao HTML em emails** - Prevencao XSS
- [x] **Idempotencia em webhooks** - Tabela processed_webhooks
- [x] **Rate limiting server-side** - Por IP e por endpoint
- [x] **Firewall UFW** - Apenas portas 22, 80, 443
- [x] **SSH key-only** - Senha desabilitada
- [x] **Security headers** - HSTS, X-Frame DENY, nosniff via Nginx
- [x] **LGPD compliance** - Politica de privacidade e termos atualizados

### Pagamentos (Marco 2026)

- [x] **Assinaturas recorrentes** - PagBank (antes Mercado Pago)
- [x] **Webhooks de pagamento** - Processamento automatico
- [x] **Cancelamento automatico** - Apos 3 falhas consecutivas

### Juridico (Marco 2026)

- [x] **Contrato digital** - Assinatura eletronica (Lei 14.063/2020)
- [x] **Termos de Uso CDC** - Referencia Lei 8.078/90
- [x] **Politica de Privacidade LGPD** - Base legal documentada

### Frontend (Marco-Abril 2026)

- [x] **Code-split AdminDashboard** - Tabs lazy loaded
- [x] **Virtual scrolling** - Tabelas grandes
- [x] **PWA** - Instalavel como app
- [x] **Skeleton loading** - Carregamento visual
- [x] **SEO completo** - Open Graph, Twitter Cards, Schema.org
- [x] **Exportacao CSV** - Membros e relatorios
- [x] **Email templates customizados** - 13 templates HTML via Resend
- [x] **Error tracking no admin** - Tela de erros com filtros, stats e stack traces

### Testes

- [x] **Infraestrutura de testes** - Vitest + React Testing Library
- [x] **Testes unitarios** - 237 testes passando

---

## Pendente

### ALTO - Proximo Sprint

- [ ] **Whitelist PagBank** - Configurar IP da VPS no painel PagBank para webhooks em producao
- [ ] **Configurar cron na VPS** - Executar scripts de backup e health check (instrucos em DEPLOY.md)

### MEDIO - Planejado

- [ ] **Aumentar cobertura de testes** - Meta: 70%
  - Requer mocking de API e PostgreSQL
  - Priorizar services e middleware do backend

- [ ] **Testes E2E** - Playwright
  - Fluxos criticos: cadastro, login, pagamento
  - Integrar ao CI/CD

### BAIXO - Nice to Have

- [ ] **Storybook** - Documentar componentes UI
- [ ] **Otimizar bundle** - Tree-shaking mais agressivo
- [ ] **Image optimization** - Lazy load e compressao de imagens
- [ ] **Notificacoes push** - Lembretes de vencimento e pontos expirando

---

## FUTURO v2.0+

### Novos Produtos

- [ ] **App Mobile (React Native)** - App nativo para iOS/Android
- [ ] **Multi-tenancy** - Suportar multiplas lojas
- [ ] **Integracao e-commerce** - APIs de terceiros
- [ ] **Sistema de indicacao** - Tracking + rewards

### Infraestrutura

- [ ] **Redis** - Cache de segundo nivel para consultas frequentes
- [ ] **Replica PostgreSQL** - Read replica para relatorios
- [ ] **Monitoring stack** - Prometheus + Grafana

---

## Debitos Tecnicos

1. MapperUtils usa `any` (necessario para flexibilidade)
2. Soft-delete de usuarios (nao remove do banco, apenas muda role para `disabled`)
3. **vendor-charts bundle (435KB)** - Ja lazy loaded via ReportsTab
4. Migracao de dados Firestore -> PostgreSQL (feita manualmente, sem script reverso)
5. Erros TypeScript pre-existentes em payments.ts, points.ts, reports.ts (tipos `unknown` nao tipados)

---

## Metricas

### Performance (Lighthouse)

| Metrica          | Meta    |
| ---------------- | ------- |
| LCP              | < 2.5s  |
| FID              | < 100ms |
| CLS              | < 0.1   |
| Lighthouse Score | > 90    |

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

_Documento atualizado em 08 de Abril de 2026_
