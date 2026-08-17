/** Shared constants. Values used in more than one place live here. */

// =============================================================================
// Database Tables (for reference — queries go through the API)
// =============================================================================

export const TABLES = {
  MEMBERS: 'members',
  USERS: 'users',
  PAYMENTS: 'payments',
  AUDIT_LOGS: 'audit_logs',
  SUBSCRIPTIONS: 'subscriptions',
  SUBSCRIPTION_PAYMENTS: 'subscription_payments',
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
// Timeouts (milliseconds)
// =============================================================================

export const TIMEOUTS = {
  DEFAULT_REQUEST: 15000,
  CPF_VALIDATION: 5000,
  INPUT_DEBOUNCE: 500,
  LOCKOUT_DURATION: 5 * 60 * 1000, // 5 min
  ATTEMPT_WINDOW: 15 * 60 * 1000, // 15 min
  PIX_POLL_INTERVAL: 5000,
  PIX_EXPIRATION: 30 * 60 * 1000, // 30 min
} as const

// =============================================================================
// Limits
// =============================================================================

export const LIMITS = {
  MAX_LOGIN_ATTEMPTS: 5,
  MAX_RETRIES: 3,
  /** Base for exponential backoff. */
  INITIAL_RETRY_DELAY: 1000,
  MAX_LOGS_DISPLAY: 50,
} as const

// =============================================================================
// URLs e endpoints
// =============================================================================

export const URLS = {
  /** BrasilAPI, used for CPF lookup. */
  BRASIL_API_CPF: 'https://brasilapi.com.br/api/cpf/v1',
} as const

// =============================================================================
// Validation
// =============================================================================

export const VALIDATION = {
  MIN_PASSWORD_LENGTH: 6,
  CPF_LENGTH: 11,
  PHONE_LENGTH: 11,
} as const

// =============================================================================
// UI e Media
// =============================================================================

export const CAMERA = {
  IDEAL_WIDTH: 1280,
  IDEAL_HEIGHT: 720,
} as const

export const UI = {
  COPY_FEEDBACK_DURATION: 2000,
  RECONNECT_BANNER_DURATION: 3000,
  COUNTDOWN_INTERVAL: 1000,
} as const

// =============================================================================
// Default messages
// =============================================================================

export const MESSAGES = {
  ERROR: {
    GENERIC: 'Ocorreu um erro. Tente novamente.',
    NETWORK: 'Erro de conexão. Verifique sua internet.',
    UNAUTHORIZED: 'Sessão expirada. Faça login novamente.',
    NOT_FOUND: 'Registro não encontrado.',
  },
  SUCCESS: {
    SAVED: 'Salvo com sucesso!',
    DELETED: 'Removido com sucesso!',
    COPIED: 'Copiado!',
  },
} as const
