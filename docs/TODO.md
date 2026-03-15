# TODO - Plano de Melhorias do Projeto

> **Última atualização:** Março 2026
> **Política de custos:** Apenas recursos gratuitos. Itens pagos estão separados para implementação futura.

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

### Code Quality (Concluído)

- [x] 🆓 **Logger centralizado** ✅ - `src/lib/logger.ts` (só loga em dev)
- [x] 🆓 **Sanitização de inputs** ✅ - `src/lib/sanitize.ts` (email, nome, telefone, CPF)
- [x] 🆓 **Debounce em validações** ✅ - `src/hooks/useDebounce.ts` (evita chamadas excessivas)
- [x] 🆓 **Constantes centralizadas** ✅ - `src/lib/constants.ts` (collections, timeouts, limites)

### Funcionalidades Pendentes

- [ ] 🆓 **Dashboard de métricas em tempo real**
  - Usar `onSnapshot` do Firestore (gratuito)
  - Gráficos com atualização automática
  - Indicadores de tendência
  - **Complexidade:** Média

- [ ] 🆓 **Histórico de ações do membro**
  - Timeline de atividades no dashboard
  - Já temos audit_logs, só exibir no frontend
  - **Complexidade:** Baixa

### Testes

- [ ] 🆓 **Testes unitários**
  - Vitest (gratuito, já no ecossistema Vite)
  - React Testing Library
  - Meta: 70% cobertura
  - **Complexidade:** Alta (muito código)

- [ ] 🆓 **Testes E2E**
  - Playwright (gratuito)
  - Fluxos críticos: cadastro, login, pagamento
  - **Complexidade:** Média

---

## 🟢 BAIXO - Pendente

### Code Quality

- [x] 🆓 **Husky + lint-staged** ✅
- [ ] 🆓 **Commitlint** - Conventional commits
- [ ] 🆓 **Storybook** - Documentar componentes (gratuito)

### Documentação

- [x] 🆓 **README atualizado** ✅
- [ ] 🆓 **JSDoc em funções críticas**

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

- [ ] 💰 **Webhooks de pagamento**
  - Processamento automático do Mercado Pago
  - Atualmente manual

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

| Serviço          | Plano | Limite Gratuito                    |
| ---------------- | ----- | ---------------------------------- |
| Firebase Auth    | Spark | Ilimitado                          |
| Firestore        | Spark | 50k leituras/dia, 20k escritas/dia |
| Vercel Hosting   | Hobby | 100GB bandwidth/mês                |
| Vercel Analytics | Hobby | 2.5k eventos/mês                   |
| GitHub           | Free  | Repos privados ilimitados          |

## Débitos Técnicos

1. MapperUtils usa `any` (necessário para flexibilidade)
2. ~~AdminDashboard muito grande~~ ✅ Resolvido
3. ~~Console.error ainda em produção~~ ✅ Resolvido - Logger centralizado só loga em dev
4. Soft-delete de usuários (não remove do Auth)
5. **Rate-limit é client-side** - Implementado em `src/lib/rate-limit.ts`, usa localStorage. Pode ser bypassado limpando o navegador. Firebase Auth já tem proteção própria (`auth/too-many-requests`). Rate-limit server-side requer Cloud Functions (pago)

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

_Documento atualizado em Março 2026_
