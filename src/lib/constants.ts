/**
 * Constantes centralizadas do projeto
 *
 * Mantém todos os valores "mágicos" em um único lugar para:
 * - Facilitar manutenção
 * - Evitar typos
 * - Documentar valores importantes
 */

// =============================================================================
// Firestore Collections
// =============================================================================

export const COLLECTIONS = {
  MEMBERS: 'members',
  USERS: 'users',
  PAYMENTS: 'payments',
  POINTS: 'point_transactions',
  AUDIT_LOGS: 'audit_logs',
} as const

// =============================================================================
// LocalStorage Keys
// =============================================================================

export const STORAGE_KEYS = {
  LOGIN_ATTEMPTS: 'login_attempts',
  THEME: 'theme',
  SIDEBAR_COLLAPSED: 'sidebar_collapsed',
} as const

// =============================================================================
// Timeouts (em milissegundos)
// =============================================================================

export const TIMEOUTS = {
  /** Timeout padrão para requisições */
  DEFAULT_REQUEST: 15000,
  /** Timeout para validação de CPF */
  CPF_VALIDATION: 5000,
  /** Debounce para inputs */
  INPUT_DEBOUNCE: 500,
  /** Tempo de lockout após muitas tentativas de login */
  LOCKOUT_DURATION: 5 * 60 * 1000, // 5 minutos
  /** Janela de tempo para contar tentativas de login */
  ATTEMPT_WINDOW: 15 * 60 * 1000, // 15 minutos
  /** Intervalo para verificar status de pagamento PIX */
  PIX_POLL_INTERVAL: 5000,
  /** Expiração do QR Code PIX */
  PIX_EXPIRATION: 30 * 60 * 1000, // 30 minutos
} as const

// =============================================================================
// Limites e configurações
// =============================================================================

export const LIMITS = {
  /** Máximo de tentativas de login antes de bloquear */
  MAX_LOGIN_ATTEMPTS: 5,
  /** Máximo de retries para requisições */
  MAX_RETRIES: 3,
  /** Delay inicial para retry (exponential backoff) */
  INITIAL_RETRY_DELAY: 1000,
  /** Máximo de logs para exibir */
  MAX_LOGS_DISPLAY: 50,
  /** Máximo de pontos por transação */
  MAX_POINTS_PER_TRANSACTION: 10000,
  /** Dias para expiração de pontos */
  POINTS_EXPIRATION_DAYS: 365,
} as const

// =============================================================================
// URLs e endpoints
// =============================================================================

export const URLS = {
  /** API do Brasil para validação de CPF */
  BRASIL_API_CPF: 'https://brasilapi.com.br/api/cpf/v1',
} as const

// =============================================================================
// Validação
// =============================================================================

export const VALIDATION = {
  /** Tamanho mínimo da senha */
  MIN_PASSWORD_LENGTH: 6,
  /** Tamanho do CPF (apenas dígitos) */
  CPF_LENGTH: 11,
  /** Tamanho do telefone com DDD (apenas dígitos) */
  PHONE_LENGTH: 11,
} as const
