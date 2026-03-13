# Arquitetura Técnica - Clube Geek & Toys

## Padrões de Projeto Utilizados

### 1. Context API com External Store (React 19)

O AuthContext utiliza `useSyncExternalStore` para sincronização com Firebase Auth:

```typescript
// Padrão: External Store
function createAuthStore(firebaseAuth: Auth) {
  let currentUser: User | null = null
  const listeners = new Set<() => void>()

  // Subscribe ao Firebase
  onAuthStateChanged(firebaseAuth, (user) => {
    currentUser = user
    listeners.forEach((listener) => listener())
  })

  return {
    subscribe: (listener) => { /* ... */ },
    getSnapshot: () => ({ user: currentUser, isInitialized }),
    getServerSnapshot: () => ({ user: null, isInitialized: false }),
  }
}

// Uso no componente
function useFirebaseAuth() {
  return useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot
  )
}
```

**Por que este padrão?**
- React 19 concurrent mode compatibility
- Evita tearing (inconsistência de estado)
- Performance otimizada para re-renders

### 2. Repository Pattern (Firestore)

Abstração de acesso a dados via `FirestoreManager`:

```typescript
// src/lib/db-utils.ts
class FirestoreManager {
  static async getById<T>(collection, id, mapper): Promise<T | null>
  static async findMany<T>(collection, constraints, mapper): Promise<T[]>
  static async save<T>(collection, id, data): Promise<string | null>
  static async update<T>(collection, id, data): Promise<boolean>
}

// Uso específico
// src/lib/members.ts
export async function getMemberById(id: string): Promise<Member | null> {
  return FirestoreManager.getById(COLLECTION, id, memberMapper)
}
```

**Benefícios:**
- Centraliza lógica de acesso a dados
- Facilita testes com mocks
- Padroniza tratamento de erros

### 3. Mapper Pattern (DTO Transformation)

Conversão entre formatos de dados:

```typescript
// snake_case (Firestore) <-> camelCase (TypeScript)
const memberMapper = (id: string, data: DocumentData): Member => ({
  id,
  ...MapperUtils.toCamel(data)
})

// Inverso para escrita
const firestoreData = MapperUtils.toSnake(memberData)
```

### 4. Protected Route Pattern

Componentes HOC para controle de acesso:

```typescript
function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth()

  if (loading) return <LoadingPage />
  if (!user) return <Navigate to="/login" />
  if (role === null) return <RoleError />
  if (!allowedRoles.includes(role)) return <Navigate to="/acesso-negado" />

  return <>{children}</>
}

// Uso
<Route path="/admin" element={
  <ProtectedRoute allowedRoles={['admin']}>
    <AdminDashboard />
  </ProtectedRoute>
} />
```

### 5. Lazy Loading com Suspense

Code splitting por rota:

```typescript
// Lazy load de páginas
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

// Provider com Suspense
<Suspense fallback={<LoadingPage />}>
  <AppRoutes />
</Suspense>
```

### 6. Custom Hooks Pattern

Hooks encapsulam lógica de negócio:

```typescript
// src/hooks/useMembers.ts
export function useMembers(options = {}) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    const data = await getAllMembers()
    setMembers(data)
    setLoading(false)
  }, [])

  return { members, loading, refetch: fetchMembers }
}

// src/hooks/usePoints.ts
export function usePoints() {
  const addPoints = useCallback(async (memberId, value) => {
    return withRetry(() => addPointsApi(memberId, value))
  }, [])

  return { addPoints, redeemPoints, getBalance }
}
```

**Benefícios:**
- Separa lógica de estado dos componentes
- Reutilizável entre diferentes views
- Facilita testes unitários

### 7. Retry Pattern com Exponential Backoff

```typescript
// src/lib/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number, initialDelay?: number } = {}
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (!shouldRetry(error) || attempt === maxRetries - 1) throw error
      await sleep(initialDelay * Math.pow(2, attempt))
    }
  }
}

// Uso
const id = await withRetry(
  () => FirestoreManager.save(COLLECTION, null, data),
  { maxRetries: 3 }
)
```

## Fluxo de Dados

### Autenticação

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐
│  Login   │───▶│ Firebase Auth │───▶│ AuthContext │
│  Form    │    │ signInWithEmail│   │ (setState)  │
└──────────┘    └──────────────┘    └──────┬──────┘
                                           │
                      ┌────────────────────┘
                      ▼
              ┌──────────────┐    ┌─────────────┐
              │  Firestore   │───▶│ Role State  │
              │ users/{uid}  │    │ (onSnapshot)│
              └──────────────┘    └──────┬──────┘
                                         │
                    ┌────────────────────┘
                    ▼
            ┌──────────────┐
            │   Redirect   │
            │  based on    │
            │    role      │
            └──────────────┘
```

### Pagamento PIX

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐
│ Checkout │───▶│ createPixPayment│─▶│ Firestore  │
│  Modal   │    │ (payments.ts)│   │ payments/  │
└──────────┘    └──────────────┘    └──────┬──────┘
                                           │
                      ┌────────────────────┘
                      ▼
              ┌──────────────┐    ┌─────────────┐
              │  Display QR  │───▶│ Poll Status │
              │   Code       │    │ (interval)  │
              └──────────────┘    └──────┬──────┘
                                         │
                    ┌────────────────────┘
                    ▼
            ┌──────────────┐    ┌─────────────┐
            │   Webhook    │───▶│ Update      │
            │ (CF Worker)  │    │ Payment     │
            └──────────────┘    └──────┬──────┘
                                       │
                  ┌────────────────────┘
                  ▼
          ┌──────────────┐
          │  Activate    │
          │   Member     │
          └──────────────┘
```

### Sistema de Pontos

```
┌──────────┐    ┌──────────────┐    ┌─────────────────┐
│   PDV    │───▶│  addPoints() │───▶│ Transaction     │
│  (scan)  │    │  (points.ts) │    │ point_transactions │
└──────────┘    └──────────────┘    └────────┬────────┘
                                             │
                        ┌────────────────────┘
                        ▼
                ┌──────────────┐    ┌─────────────┐
                │ Update Member│───▶│ Audit Log   │
                │    points    │    │ audit_logs/ │
                └──────────────┘    └─────────────┘
```

## Decisões de Arquitetura

### Por que Firebase + Vercel?

| Aspecto | Firebase | Vercel |
|---------|----------|--------|
| Auth | ✅ Suporte nativo | ❌ Precisa integrar |
| Database | ✅ Firestore (real-time) | ❌ Não tem |
| Hosting | ✅ Funciona mas limitado | ✅ Melhor para SPA |
| Functions | ✅ Cloud Functions | ✅ Edge Functions |
| Deploy | 😐 Manual | ✅ Auto via Git |
| CDN | ✅ Global | ✅ Global (melhor) |
| SSL | ✅ Automático | ✅ Automático |

**Conclusão:** Firebase para backend (auth + db), Vercel para frontend (melhor DX e CDN).

### Por que não usar Firebase Hosting?

1. Vercel tem deploy automático via GitHub
2. Edge functions mais flexíveis
3. Analytics integrado
4. Preview deployments por PR
5. Melhor integração com React/Vite

### Por que Firestore ao invés de Realtime Database?

1. Queries mais poderosas (where, orderBy, limit)
2. Estrutura de dados mais flexível
3. Melhor escalabilidade
4. Offline persistence nativo
5. Security rules mais granulares

### Por que Mercado Pago?

1. Gateway brasileiro (BRL nativo)
2. PIX integrado
3. SDK React oficial
4. Taxas competitivas
5. Checkout transparente

## Considerações de Segurança

### Defense in Depth

```
┌────────────────────────────────────────────────────┐
│                   LAYER 1: CDN                      │
│  - Vercel Edge Network                              │
│  - DDoS Protection                                  │
│  - SSL/TLS                                          │
├────────────────────────────────────────────────────┤
│                LAYER 2: Headers                     │
│  - CSP (Content-Security-Policy)                    │
│  - HSTS (Strict-Transport-Security)                 │
│  - X-Frame-Options: DENY                            │
├────────────────────────────────────────────────────┤
│              LAYER 3: Authentication                │
│  - Firebase Auth                                    │
│  - Session tokens (httpOnly)                        │
│  - Token refresh automático                         │
├────────────────────────────────────────────────────┤
│              LAYER 4: Authorization                 │
│  - Firestore Security Rules                         │
│  - Role-based access control                        │
│  - Field-level permissions                          │
├────────────────────────────────────────────────────┤
│              LAYER 5: Data Validation               │
│  - Zod schemas (frontend)                           │
│  - Firestore rules validation (backend)             │
│  - CPF validation (Brasil API)                      │
└────────────────────────────────────────────────────┘
```

### Firestore Security Rules Summary

```
users/{userId}
├── read: owner OR admin
├── create: self (role=member) OR admin
├── update: admin OR owner (except role)
└── delete: admin only

members/{memberId}
├── read: owner OR seller OR admin
├── create: authenticated OR admin
├── update: admin (all) OR seller (points only) OR owner (profile)
└── delete: admin only

payments/{paymentId}
├── read: admin OR seller OR owner
├── create: authenticated
├── update: admin only
└── delete: NEVER

point_transactions/{txId}
├── read: owner OR seller OR admin
├── create: seller OR admin
├── update: NEVER
└── delete: NEVER

audit_logs/{logId}
├── read: admin only
├── create: seller OR admin
├── update: NEVER
└── delete: NEVER
```

## Performance

### Bundle Analysis

```
Total Build Size: ~1.3MB (uncompressed)
Gzipped: ~500KB

Breakdown (após code-splitting):
├── vendor-firebase-firestore: 261KB (76KB gzip)
├── vendor-charts: 421KB (108KB gzip) - lazy loaded
├── vendor-react-core: 190KB (60KB gzip)
├── vendor-qr: 146KB (51KB gzip)
├── vendor-framer: 122KB (39KB gzip)
├── vendor-forms: 83KB (24KB gzip)
├── vendor-firebase-core: 82KB (28KB gzip)
├── vendor-firebase-auth: 77KB (22KB gzip)
├── AdminDashboard: 37KB (10KB gzip) ✅ OTIMIZADO
├── MembersTab: 19KB (6KB gzip)
├── ReportsTab: 15KB (4KB gzip)
├── PointsTab: 2.5KB (1KB gzip)
├── UsersTab: 3.4KB (1.3KB gzip)
├── LogsTab: 4KB (1.6KB gzip)
└── outros: ~200KB
```

### Otimizações Implementadas

1. **Code Splitting** - Lazy load por rota e por componente
2. **Tab Components Splitting** - AdminDashboard dividido em 7 componentes lazy
3. **Vendor Chunks** - Separação de bibliotecas (charts, forms, firebase, etc.)
4. **Tree Shaking** - Vite + ESM modules
5. **Minification** - Terser com drop_console
6. **Cache Headers** - 1 ano para assets imutáveis
7. **Firestore Long Polling** - Evita WebSocket issues
8. **Suspense Fallbacks** - Loading states durante lazy load
9. **Skeleton Loading** - Perceived performance durante carregamento
10. **Virtual Scrolling** - `VirtualTable` com @tanstack/react-virtual
11. **PWA** - Service worker com workbox, instalável como app
12. **Vercel Analytics** - Monitoramento de Core Web Vitals

### Otimizações Pendentes

1. **Image Optimization** - Sem next/image
2. **Sentry Integration** - Error tracking em produção

## Monitoramento

### Vercel Analytics (Implementado)

```typescript
// src/main.tsx
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
```

**Métricas monitoradas:**
- LCP (Largest Contentful Paint)
- FID (First Input Delay)
- CLS (Cumulative Layout Shift)
- TTFB (Time to First Byte)
- Page views e navegação

### Logs Atuais

```typescript
// Erros são logados no console
console.error('[Firestore] Error:', error)
console.error('[Auth] Sign in error:', error)
```

### Recomendação: Sentry

```typescript
// Proposta de implementação
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.VITE_ENVIRONMENT,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay(),
  ],
})

// Substituir console.error por:
Sentry.captureException(error)
```

## Testes

### Estrutura Proposta

```
src/
├── __tests__/
│   ├── unit/
│   │   ├── lib/
│   │   │   ├── members.test.ts
│   │   │   ├── points.test.ts
│   │   │   └── payments.test.ts
│   │   └── components/
│   │       └── MemberModal.test.tsx
│   │
│   ├── integration/
│   │   └── auth-flow.test.tsx
│   │
│   └── e2e/
│       ├── login.spec.ts
│       ├── register.spec.ts
│       └── checkout.spec.ts
│
├── vitest.config.ts
└── playwright.config.ts
```

### Mocking Firebase

```typescript
// __mocks__/firebase.ts
export const auth = {
  currentUser: null,
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
}

export const db = {
  collection: vi.fn(),
  doc: vi.fn(),
}
```

## Componentes UI

### shadcn/ui Components

Componentes baseados em Radix UI com Tailwind CSS:

```
src/components/ui/
├── badge.tsx          # Badges de status e planos
├── button.tsx         # Botões com variantes
├── card.tsx           # Cards para conteúdo
├── dialog.tsx         # Modais acessíveis
├── input.tsx          # Inputs de formulário
├── label.tsx          # Labels de formulário
├── loading.tsx        # Spinners e loading states
├── pagination.tsx     # Paginação de tabelas
├── progress.tsx       # Barras de progresso
├── sheet.tsx          # Drawer/sidebar mobile
├── skeleton.tsx       # Skeleton loading
├── success-animation.tsx  # Animações de sucesso/erro
└── form-feedback.tsx  # Feedback de formulários
```

### Componentes de Negócio

```
src/components/
├── admin/
│   ├── AdminSidebar.tsx   # Navegação lateral admin
│   ├── MembersTab.tsx     # Gestão de membros
│   ├── PointsTab.tsx      # Ranking e dar pontos
│   ├── UsersTab.tsx       # Gestão de usuários
│   ├── LogsTab.tsx        # Logs de auditoria
│   ├── ReportsTab.tsx     # Relatórios e métricas
│   └── SettingsTab.tsx    # Configurações do sistema
├── DataTable.tsx          # Tabela genérica com filtros
├── VirtualTable.tsx       # Tabela virtualizada para grandes datasets
├── MembersTable.tsx       # Tabela de membros
├── MemberModal.tsx        # Modal de membro (CRUD)
└── PaymentModal.tsx       # Modal de pagamento
```

### Hooks Personalizados

```
src/hooks/
├── index.ts           # Exports centralizados
├── useMembers.ts      # Hook para operações de membros
│   ├── useMembers()   # Lista de membros
│   └── useMember()    # Membro individual
└── usePoints.ts       # Hook para sistema de pontos
    ├── usePoints()    # Operações de pontos
    └── useMemberPoints()  # Pontos de um membro
```

## PWA (Progressive Web App)

### Configuração

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Clube Geek & Toys',
    short_name: 'Geek Club',
    theme_color: '#7c3aed',
    background_color: '#09090b',
    display: 'standalone',
    icons: [/* ... */],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff2}'],
    runtimeCaching: [/* Google Fonts cache */],
  },
})
```

### Funcionalidades

- **Instalável** - Adicionar à tela inicial no celular
- **Offline** - Cache de assets estáticos
- **Auto-update** - Service worker atualiza automaticamente
