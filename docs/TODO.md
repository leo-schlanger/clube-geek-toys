# TODO - Plano de Melhorias do Projeto

> **Última atualização:** 26 de Março de 2026
> **Política de custos:** Apenas recursos gratuitos. Itens pagos estão separados para implementação futura.
> **Checkup de Segurança:** Realizado em 26/03/2026 - 0 vulnerabilidades críticas

## Legenda de Prioridade

- 🔴 **CRÍTICO** - Deve ser feito imediatamente
- 🟠 **ALTO** - Deve ser feito antes do próximo deploy
- 🟡 **MÉDIO** - Deve ser planejado para o próximo sprint
- 🟢 **BAIXO** - Nice to have, quando houver tempo
- 🔵 **FUTURO** - Backlog para versões futuras

## Legenda de Custo

- 🆓 **GRATUITO** - Sem custo adicional
- 💰 **PAGO** - Requer serviço pago (separado para o futuro)

---

# SEÇÃO 1: TAREFAS GRATUITAS (Implementar Agora)

## 🔴 CRÍTICO - Concluído ✅

### Segurança

- [x] 🆓 **Rotacionar credenciais se expostas** ✅
- [x] 🆓 **Implementar rate limiting** ✅
- [x] 🆓 **Adicionar verificação de email** ✅
- [x] 🆓 **Email de verificação customizado via Resend** ✅ (Março 2026)
  - Template de email personalizado com branding
  - Sistema de token customizado (24h expiry)
  - Armazenamento de verificação em Firestore
  - Verificação dupla: Firebase Auth + Firestore

### Pagamentos

- [x] 🆓 **Assinaturas recorrentes Mercado Pago** ✅ (Março 2026)
  - Tokenização de cartão via MercadoPago.js SDK
  - API de Preapproval para cobranças automáticas
  - Webhook handlers para confirmação de pagamentos
  - Gestão completa: pausar, reativar, cancelar, trocar cartão
  - 10 templates de email para ciclo de vida da assinatura
  - Cancelamento automático após 3 falhas consecutivas

### Jurídico

- [x] 🆓 **Sistema de Contrato Digital com Assinatura Eletrônica** ✅ (Março 2026)
  - ContractModal com 3 steps: leitura obrigatória, assinatura, confirmação
  - Geração de PDF A4 profissional com pdf-lib
  - Captura de assinatura digital via canvas (signature_pad)
  - Hash SHA-256 para integridade do documento
  - Registro de auditoria: IP, User-Agent, timestamp
  - Upload automático para Firebase Storage
  - Envio de cópia por email (membro + admin)
  - Conformidade com Lei 14.063/2020 (assinatura eletrônica simples)
  - Integrado ao fluxo de cadastro (antes do pagamento)

---

## 🟠 ALTO - Concluído ✅

### Performance

- [x] 🆓 **Code-split AdminDashboard** ✅
- [x] 🆓 **Implementar paginação no Firestore** ✅
- [x] 🆓 **Virtual scrolling para tabelas grandes** ✅

### Infraestrutura

- [x] 🆓 **Configurar Vercel Analytics** ✅ (plano gratuito)
- [x] 🆓 **Criar custom hooks** ✅
- [x] 🆓 **Adicionar retry com exponential backoff** ✅
- [x] 🆓 **Sistema de Email com Resend** ✅ (Março 2026)
  - Domínio verificado: `geeketoys.com.br`
  - 10 templates de email (welcome, payment, subscription, etc.)
  - Integrado ao Cloudflare Worker
- [x] 🆓 **Webhooks Mercado Pago** ✅ (Março 2026)
  - Configurados no painel do MP
  - Eventos: payment, subscription_preapproval, subscription_authorized_payment
  - Verificação HMAC-SHA256

---

## 🟡 MÉDIO - Pendente

### UX/UI (Concluído)

- [x] 🆓 **Skeleton loading** ✅
- [x] 🆓 **Dark mode** ✅
- [x] 🆓 **PWA** ✅
- [x] 🆓 **Feedback de formulários** ✅
- [x] 🆓 **Exportação CSV** ✅
- [x] 🆓 **Detecção offline** ✅ - Banner de reconexão automático
- [x] 🆓 **Acessibilidade (A11y)** ✅ - Skip link, ARIA attributes
- [x] 🆓 **SEO Completo** ✅ (Março 2026)
  - Open Graph (Facebook/WhatsApp)
  - Twitter Cards
  - Schema.org JSON-LD
  - Meta tags otimizadas
  - Canonical URL

### Code Quality (Concluído)

- [x] 🆓 **Logger centralizado** ✅ - `src/lib/logger.ts` (só loga em dev)
- [x] 🆓 **Sanitização de inputs** ✅ - `src/lib/sanitize.ts` (email, nome, telefone, CPF)
- [x] 🆓 **Debounce em validações** ✅ - `src/hooks/useDebounce.ts` (evita chamadas excessivas)
- [x] 🆓 **Constantes centralizadas** ✅ - `src/lib/constants.ts` (collections, timeouts, limites)

### Funcionalidades Pendentes

- [x] 🆓 **Dashboard de métricas em tempo real** ✅
  - Hook `useRealtimeStats` com `onSnapshot` do Firestore
  - Componente `RealtimeMetrics` com cards animados
  - Indicadores de tendência (up/down/stable)
  - Estatísticas: membros, receita, pontos, planos

- [x] 🆓 **Histórico de ações do membro** ✅
  - Timeline de atividades no MemberDashboard
  - Componente `MemberActivityHistory` usando `getMemberLogs`

### Testes

- [x] 🆓 **Infraestrutura de testes** ✅
  - Vitest + React Testing Library configurados
  - 237 testes unitários passando
  - Cobertura: ~11% (utilitários e hooks com ~100%)
  - `npm run test` / `npm run test:coverage`

- [ ] 🆓 **Aumentar cobertura de testes**
  - Meta: 70% cobertura
  - Requer mocking extensivo de Firebase
  - **Complexidade:** Alta (muito código)

- [ ] 🆓 **Testes E2E**
  - Playwright (gratuito)
  - Fluxos críticos: cadastro, login, pagamento
  - **Complexidade:** Média

---

## 🟢 BAIXO - Pendente

### Code Quality

- [x] 🆓 **Husky + lint-staged** ✅
- [x] 🆓 **Commitlint** ✅ - Conventional commits configurado
- [ ] 🆓 **Storybook** - Documentar componentes (gratuito)

### Documentação

- [x] 🆓 **README atualizado** ✅
- [x] 🆓 **JSDoc em funções críticas** ✅ - members.ts, payments.ts, points.ts, sanitize.ts

### UX/Navegação (Concluído)

- [x] 🆓 **Filtros persistentes na URL** ✅ - `src/hooks/useUrlFilters.ts`
- [x] 🆓 **Atalhos de teclado** ✅ - `src/hooks/useKeyboardShortcuts.ts` (Ctrl+S, Esc)
- [x] 🆓 **Lazy load de imagens** ✅ - `src/components/ui/lazy-image.tsx`

### Performance

- [ ] 🆓 **Otimizar bundle Firebase**
  - Tree-shaking mais agressivo
  - Lazy load Firestore em rotas que não usam

---

# SEÇÃO 2: TAREFAS PAGAS (Futuro - Quando Houver Orçamento)

> ⚠️ **ATENÇÃO:** As tarefas abaixo requerem serviços pagos.
> Manter aqui para referência futura quando houver budget disponível.

---

## 💰 Error Tracking - Sentry

**Custo estimado:** ~$26/mês (plano Team) ou gratuito com limites

- [ ] 💰 **Integração completa com Sentry**
  - Base já criada em `src/lib/error-tracking.ts`
  - Precisa: instalar @sentry/react e configurar DSN
  - **Alternativa gratuita:** Console logs + Vercel logs (já temos)

---

## 💰 Notificações Push - Firebase Cloud Messaging

**Custo:** Gratuito até 10k mensagens/mês, depois pago

- [ ] 💰 **Sistema de notificações push**
  - Lembretes de vencimento de assinatura
  - Alertas de pontos expirando
  - **Alternativa gratuita:** Email via Firebase Auth (limitado)

---

## 💰 Backend Completo - Cloud Functions

**Custo:** Gratuito até 2M invocações/mês, depois pago

- [ ] 💰 **Deletar usuário do Firebase Auth**
  - Requer Admin SDK em Cloud Function
  - Atualmente usando soft-delete (gratuito)
  - **Alternativa atual:** Cloudflare Workers para webhooks (gratuito) ✅

---

## 💰 Infraestrutura Avançada

### Redis/Cache

**Custo:** ~$5-15/mês (Upstash, Redis Cloud)

- [ ] 💰 **Cache de segundo nível**
  - Reduzir leituras no Firestore

### CI/CD

**Custo:** GitHub Actions gratuito para repos públicos, limitado para privados

- [ ] 💰 **CI/CD completo**
  - Testes automáticos em PR
  - Deploy preview
  - Rollback automático

---

## 🔵 FUTURO v2.0+ (Requer Investimento)

### Novos Produtos

- [ ] 💰 **App Mobile (React Native)** - Custo de desenvolvimento + stores
- [ ] 💰 **Multi-tenancy** - Infraestrutura escalável
- [ ] 💰 **Integração e-commerce** - APIs de terceiros
- [ ] 💰 **Sistema de indicação** - Tracking + rewards

### Arquitetura

- [ ] 💰 **Monorepo (Turborepo)** - Complexidade de infra
- [ ] 💰 **BFF com Cloudflare Workers** - Custo por requests

---

# SEÇÃO 3: DECISÕES TÉCNICAS

## Stack Atual (Gratuita)

| Serviço            | Plano | Limite Gratuito                    |
| ------------------ | ----- | ---------------------------------- |
| Firebase Auth      | Spark | Ilimitado                          |
| Firestore          | Spark | 50k leituras/dia, 20k escritas/dia |
| Firebase Storage   | Spark | 5GB storage, 1GB/dia download      |
| Vercel Hosting     | Hobby | 100GB bandwidth/mês                |
| Vercel Analytics   | Hobby | 2.5k eventos/mês                   |
| GitHub             | Free  | Repos privados ilimitados          |
| Cloudflare Workers | Free  | 100k requests/dia                  |
| Resend (Email)     | Free  | 3k emails/mês                      |
| Mercado Pago       | Free  | Taxa por transação apenas          |

## Débitos Técnicos

1. MapperUtils usa `any` (necessário para flexibilidade)
2. ~~AdminDashboard muito grande~~ ✅ Resolvido
3. ~~Console.error ainda em produção~~ ✅ Resolvido - Logger centralizado só loga em dev
4. Soft-delete de usuários (não remove do Auth)
5. **Rate-limit é client-side** - Implementado em `src/lib/rate-limit.ts`, usa localStorage. Pode ser bypassado limpando o navegador. Firebase Auth já tem proteção própria (`auth/too-many-requests`). Rate-limit server-side requer Cloud Functions (pago)
6. ~~exhaustive-deps warnings~~ ✅ Resolvido - AdminDashboard e MemberDashboard
7. **vendor-charts bundle (421KB)** - Já está lazy loaded via ReportsTab, carrega apenas ao acessar relatórios
8. ~~api-worker tem erros de lint~~ ✅ Resolvido - Adicionadas interfaces TypeScript, removido uso de `any`
9. ~~Assinaturas recorrentes~~ ✅ Resolvido - Implementado com Mercado Pago Preapproval API
10. ~~Email verificação customizado~~ ✅ Resolvido - Sistema de token próprio via Cloudflare Worker

## Melhorias de Segurança (Março 2026) ✅

### Fase 1: Validação de Entrada (Crítico) ✅

- [x] 🆓 **Webhook secret obrigatório** ✅
  - Rejeita webhooks se secret não configurado
  - HMAC-SHA256 verificação

- [x] 🆓 **Validação Zod em todos endpoints** ✅
  - `PixCreateSchema`, `EmailSendSchema`, `ContractEmailSchema`
  - `CheckoutCreateSchema`, `SubscriptionCreateSchema`
  - `VerificationEmailSchema`, `PasswordResetSchema`
  - `UpdateCardSchema`, `VerifyEmailTokenSchema`
  - Limites de tamanho em todos os campos

- [x] 🆓 **Sanitização HTML em emails** ✅
  - Função `escapeHtml()` previne XSS
  - `sanitizeEmailVariables()` aplicado em templates
  - Dados de contrato e admin sanitizados

### Fase 2: Infraestrutura (Alto) ✅

- [x] 🆓 **Idempotência em webhooks** ✅
  - Coleção `processed_webhooks` previne duplicatas
  - Regras Firestore adicionadas

- [x] 🆓 **Remoção de config no /health** ✅
  - Endpoint retorna apenas status e timestamp
  - Nenhuma informação de configuração exposta

- [x] 🆓 **Validação de path no Storage** ✅
  - `sanitizeForFilePath()` previne path traversal
  - Remove `..`, `/`, `\` e caracteres especiais
  - Limite de 100 caracteres

- [x] 🆓 **Rate Limiting no API Worker** ✅ (26/03/2026)
  - Implementado via Cache API (gratuito)
  - Limites por endpoint: PIX (10/min), checkout (10/min), password-reset (3/5min)
  - Headers `Retry-After` e `X-RateLimit-Remaining`

### Fase 3: Auditoria (Médio) ✅

- [x] 🆓 **Limites em todos os schemas** ✅
  - Emails: max 254 chars
  - Nomes: max 100 chars
  - Tokens: max 500 chars
  - PDFs: max 10MB base64

- [x] 🆓 **UUID completo para logs** ✅
  - Removido `.slice(0, 8)` dos UUIDs
  - Melhor unicidade e rastreabilidade

- [x] 🆓 **Audit logging em contratos** ✅
  - Registro `contract_signed` em `audit_logs`
  - Inclui: hash, IP, user_agent, timestamp

### Fase 4: Compliance (26/03/2026) ✅

- [x] 🆓 **CNPJ atualizado nos documentos** ✅
  - Termos de Uso com identificação completa
  - Política de Privacidade com controlador identificado
  - CNPJ: 52.846.344/0001-10

- [x] 🆓 **Termos de Uso CDC compliant** ✅
  - Referência à Lei 8.078/90 (CDC)
  - Direito de arrependimento detalhado (Art. 49)
  - Seções de limitação de responsabilidade e rescisão

- [x] 🆓 **Política de Privacidade LGPD completa** ✅
  - Base legal para cada tratamento (Art. 7º)
  - Tempo de retenção especificado
  - Transferência internacional documentada
  - Procedimento para exercício de direitos

- [x] 🆓 **Headers CSP aprimorados** ✅
  - `frame-ancestors 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`

- [x] 🆓 **Documentação de Segurança** ✅
  - `docs/SECURITY.md` criado
  - Checklist de deploy e manutenção
  - Procedimentos de backup

## Issues Identificados (Março 2026)

### 🟠 ALTO - Fluxo de Pagamento (Resolvidos ✅)

- [x] 🆓 **Enviar emails de confirmação após pagamento** (Register.tsx) ✅
  - Implementado: `handlePaymentSuccess()` agora envia payment-confirmed + welcome emails

- [x] 🆓 **Timeout em polling de pagamento** (PaymentModal.tsx) ✅
  - Implementado: Polling com limite de 30 minutos

- [x] 🆓 **Tratamento de falha na ativação do membro** (Register.tsx) ✅
  - Implementado: Retry automático (3x) + botão de retry manual + não navega em caso de falha

### 🟡 MÉDIO - Integrações (Resolvidos ✅)

- [ ] 🆓 **Criar registro de Subscription no Firestore** (PaymentModal.tsx)
  - Atualmente: Pagamento por cartão com assinatura não cria registro completo
  - Necessário: Sincronizar Member + Subscription records
  - **Complexidade:** Média
  - **Nota:** O webhook do Mercado Pago já cria o registro, mas pode haver delay

- [x] 🆓 **Timeout em requests de email** (src/lib/email.ts) ✅
  - Implementado: fetchWithTimeout com AbortController (10s default)

- [x] 🆓 **Reenvio de emails no Admin** (MembersTable.tsx) ✅ (Março 2026)
  - Dropdown com opções: Verificação, Boas-vindas, Renovação
  - Integrado ao AdminDashboard via `handleResendEmail`

- [x] 🆓 **Email de reset de senha customizado** (ForgotPassword.tsx) ✅ (Março 2026)
  - Template personalizado com branding via Resend
  - Endpoint Worker: `/auth/send-password-reset`
  - Usa Firebase Auth para gerar link válido

- [x] 🆓 **Retry automático em envio de emails** (email.ts) ✅ (Março 2026)
  - `fetchWithRetry` com exponential backoff (3 tentativas: 1s, 2s, 4s)
  - Aplicado em todas as funções de email

## Dependências para Monitorar

- `firebase` - Atualizações frequentes
- `@mercadopago/sdk-react` - Breaking changes
- `react` - React 19 estável

---

# SEÇÃO 4: MÉTRICAS

### Performance (Verificar com Lighthouse)

| Métrica          | Meta    |
| ---------------- | ------- |
| LCP              | < 2.5s  |
| FID              | < 100ms |
| CLS              | < 0.1   |
| Lighthouse Score | > 90    |

### Qualidade

| Métrica           | Atual | Meta |
| ----------------- | ----- | ---- |
| Test coverage     | 0%    | 70%  |
| TypeScript strict | ✅    | ✅   |
| ESLint errors     | 0     | 0    |

---

_Documento atualizado em 26 de Março de 2026 - Checkup de Segurança e Compliance_
