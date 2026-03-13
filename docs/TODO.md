# TODO - Plano de Melhorias do Projeto

## Legenda de Prioridade
- 🔴 **CRÍTICO** - Deve ser feito imediatamente
- 🟠 **ALTO** - Deve ser feito antes do próximo deploy
- 🟡 **MÉDIO** - Deve ser planejado para o próximo sprint
- 🟢 **BAIXO** - Nice to have, quando houver tempo
- 🔵 **FUTURO** - Backlog para versões futuras

---

## 🔴 CRÍTICO

### Segurança
- [x] **Rotacionar credenciais se expostas** ✅ - Verificado histórico git, nenhuma credencial exposta
  - .gitignore configurado corretamente
  - Secrets gerenciados via Vercel/Wrangler
- [x] **Implementar rate limiting** ✅ - Proteção contra brute force no login
  - Máximo 5 tentativas por email
  - Bloqueio de 5 minutos após exceder
  - Contador visual de tentativas restantes
  - Implementado em `src/lib/rate-limit.ts`
- [x] **Adicionar verificação de email** ✅ - Firebase Auth email verification
  - Email enviado automaticamente após cadastro
  - Página `/verificar-email` para reenvio
  - Membros redirecionados até verificar email
  - Cooldown de 60s entre reenvios

---

## 🟠 ALTO

### Performance
- [x] **Code-split AdminDashboard** ~~(494kb)~~ → 37kb ✅
  - Separar abas em componentes lazy (MembersTab, UsersTab, LogsTab, ReportsTab, PointsTab)
  - Charts em vendor-charts separado (421kb, lazy loaded)
  - Redução de 92% no bundle principal

- [x] **Implementar paginação no Firestore** ✅
  - Adicionado `getMembersPaginated()` com cursor pagination
  - Adicionado `getMembersCount()` para contagem total
  - `FirestoreManager.findManyPaginated()` disponível para outras collections
  - DataTable já tem paginação client-side integrada

- [ ] **Virtual scrolling para tabelas grandes**
  - Usar `@tanstack/react-virtual` para MembersTable
  - Renderizar apenas items visíveis

### Infraestrutura
- [ ] **Configurar Vercel Analytics**
  - Monitorar Core Web Vitals
  - Tracking de erros em produção

- [x] **Implementar error tracking** ✅ (parcial)
  - Criado `ErrorTracker` service em `src/lib/error-tracking.ts`
  - Preparado para integração com Sentry
  - Helper `withErrorTracking()` para operações async
  - Pendente: instalar @sentry/react e configurar DSN

### Código
- [ ] **Criar custom hooks**
  - `useMembers()` - hook para operações de membros
  - `usePayments()` - hook para operações de pagamento
  - `usePoints()` - hook para sistema de pontos
  - Diretório `src/hooks/` está vazio

- [x] **Adicionar retry com exponential backoff** ✅ (pagamentos)
  - Implementado em `src/lib/payments.ts`
  - `fetchWithRetry()` com backoff exponencial
  - Timeout de 15s por request
  - Pendente: aplicar em `addPoints()` e `redeemPoints()`

---

## 🟡 MÉDIO

### UX/UI
- [ ] **Implementar skeleton loading**
  - Usar shadcn/ui Skeleton component
  - Aplicar em MembersTable, Dashboard cards
  - Melhorar perceived performance

- [ ] **Adicionar dark/light mode toggle**
  - TailwindCSS já suporta dark mode
  - Adicionar botão de toggle
  - Persistir preferência no localStorage

- [ ] **PWA (Progressive Web App)**
  - Adicionar manifest.json
  - Service worker para cache offline
  - Push notifications para lembretes

- [ ] **Melhorar feedback de formulários**
  - Animações de sucesso/erro
  - Confetti em cadastro concluído
  - Progress indicators em processos longos

### Funcionalidades
- [ ] **Dashboard de métricas em tempo real**
  - Usar onSnapshot para updates live
  - Gráficos com atualização automática
  - Indicadores de tendência

- [ ] **Sistema de notificações**
  - Notificações push via Firebase Cloud Messaging
  - Lembretes de vencimento de assinatura
  - Alertas de pontos expirando

- [ ] **Exportação de relatórios**
  - Exportar membros para CSV/Excel
  - Exportar transações de pontos
  - Relatório financeiro em PDF

- [ ] **Histórico de ações do usuário**
  - Timeline de atividades no dashboard do membro
  - Compras, pontos ganhos, resgates

### Testes
- [ ] **Adicionar testes unitários**
  - Vitest para unit tests
  - React Testing Library para components
  - Cobertura mínima: 70%

- [ ] **Adicionar testes E2E**
  - Playwright ou Cypress
  - Fluxo de cadastro
  - Fluxo de login
  - Fluxo de pagamento (mock)

---

## 🟢 BAIXO

### Code Quality
- [ ] **Remover diretório hooks/ vazio**
  - Ou implementar custom hooks conforme item acima

- [ ] **Adicionar Storybook**
  - Documentar componentes UI
  - Facilitar desenvolvimento isolado

- [ ] **Configurar Husky + lint-staged**
  - Pre-commit hooks
  - Lint e format automático

- [ ] **Adicionar commitlint**
  - Conventional commits
  - Changelog automático

### Performance Avançada
- [ ] **Implementar React Server Components**
  - Avaliar migração para Next.js ou Remix
  - RSC para páginas estáticas (Terms, Privacy)

- [ ] **Otimizar bundle Firebase**
  - Tree-shaking mais agressivo
  - Lazy load Firestore em rotas que não usam

- [ ] **Implementar cache de segundo nível**
  - Redis ou similar para cache de sessão
  - Reduzir leituras no Firestore

### Documentação
- [ ] **JSDoc em funções críticas**
  - lib/payments.ts
  - lib/points.ts
  - lib/members.ts

- [ ] **README atualizado**
  - Screenshots
  - Setup passo a passo
  - Troubleshooting comum

---

## 🔵 FUTURO (v2.0+)

### Novos Recursos
- [ ] **App Mobile (React Native)**
  - Compartilhar lógica com web
  - Carteirinha digital
  - QR code do membro no celular

- [ ] **Multi-tenancy**
  - Suportar múltiplas lojas
  - Dashboard centralizado para franquias

- [ ] **Gamificação avançada**
  - Níveis de membro
  - Badges e conquistas
  - Desafios semanais

- [ ] **Integração com e-commerce**
  - Webhook para registrar compras automaticamente
  - Integração com sistemas de PDV

- [ ] **Sistema de indicação**
  - Link de referral
  - Bônus para quem indica
  - Tracking de conversões

- [ ] **Marketplace de recompensas**
  - Catálogo de produtos para resgate
  - Gestão de estoque de brindes
  - Parcerias com outras lojas

### Infraestrutura
- [ ] **Migrar para monorepo**
  - Turborepo ou Nx
  - Pacotes compartilhados
  - Deploy independente

- [ ] **Implementar BFF (Backend for Frontend)**
  - Cloudflare Workers expandido
  - GraphQL ou tRPC
  - Autenticação centralizada

- [ ] **CI/CD completo**
  - GitHub Actions
  - Testes automáticos
  - Deploy preview por PR
  - Rollback automático

---

## Cronograma Sugerido

### Sprint 1 (Semana 1-2)
- [x] Code-split AdminDashboard ✅
- [x] Paginação no Firestore ✅
- [x] Rate limiting no login ✅

### Sprint 2 (Semana 3-4)
- [ ] Custom hooks (useMembers, usePayments, usePoints)
- [ ] Error tracking (Sentry)
- [ ] Skeleton loading

### Sprint 3 (Semana 5-6)
- [ ] Testes unitários (70% coverage)
- [ ] PWA básico
- [ ] Dark mode toggle

### Sprint 4 (Semana 7-8)
- [ ] Sistema de notificações
- [ ] Exportação de relatórios
- [ ] Testes E2E

---

## Métricas de Sucesso

### Performance
| Métrica | Atual | Meta |
|---------|-------|------|
| LCP (Largest Contentful Paint) | ? | < 2.5s |
| FID (First Input Delay) | ? | < 100ms |
| CLS (Cumulative Layout Shift) | ? | < 0.1 |
| Bundle size (AdminDashboard) | 37kb ✅ | < 200kb |
| Bundle size (vendor-charts) | 421kb | lazy loaded |
| Time to Interactive | ? | < 3s |

### Qualidade
| Métrica | Atual | Meta |
|---------|-------|------|
| Test coverage | 0% | 70% |
| TypeScript strict | ✅ | ✅ |
| ESLint errors | 0 | 0 |
| Lighthouse score | ? | > 90 |

### Negócio
| Métrica | Atual | Meta |
|---------|-------|------|
| Taxa de conversão cadastro | ? | > 60% |
| Taxa de churn mensal | ? | < 5% |
| NPS | ? | > 50 |

---

## Notas

### Decisões Técnicas
1. **React 19** - Já usando useSyncExternalStore para auth
2. **Firestore** - Escolhido por real-time e offline support
3. **Vercel** - Hosting por simplicidade e performance
4. **Mercado Pago** - Payment gateway por ser brasileiro

### Débitos Técnicos Conhecidos
1. MapperUtils usa `any` (necessário para flexibilidade)
2. ~~AdminDashboard muito grande~~ ✅ Resolvido com code-splitting
3. Sem paginação (não escala para milhares de membros)
4. Console.error ainda em produção (Terser remove console.log apenas)

### Dependências para Monitorar
- `firebase` - Atualizações frequentes
- `@mercadopago/sdk-react` - Verificar breaking changes
- `react` - React 19 ainda recente, possíveis patches
