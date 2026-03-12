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
Total Build Size: ~1.2MB (uncompressed)
Gzipped: ~450KB

Breakdown:
├── vendor-firebase-firestore: 260KB (76KB gzip)
├── vendor-react-core: 190KB (60KB gzip)
├── vendor-qr: 146KB (51KB gzip)
├── vendor-framer: 122KB (39KB gzip)
├── vendor-forms: 83KB (24KB gzip)
├── vendor-firebase-core: 82KB (28KB gzip)
├── vendor-firebase-auth: 77KB (22KB gzip)
├── AdminDashboard: 494KB (125KB gzip) ⚠️ PRECISA SPLIT
└── outros: ~200KB
```

### Otimizações Implementadas

1. **Code Splitting** - Lazy load por rota
2. **Vendor Chunks** - Separação de bibliotecas
3. **Tree Shaking** - Vite + ESM modules
4. **Minification** - Terser com drop_console
5. **Cache Headers** - 1 ano para assets imutáveis
6. **Firestore Long Polling** - Evita WebSocket issues

### Otimizações Pendentes

1. **Paginação** - Queries sem limit()
2. **Virtual Scrolling** - Tabelas grandes
3. **Image Optimization** - Sem next/image
4. **Service Worker** - PWA não implementado

## Monitoramento

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
