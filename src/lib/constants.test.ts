import { describe, it, expect } from 'vitest'
import {
  COLLECTIONS,
  STORAGE_KEYS,
  TIMEOUTS,
  LIMITS,
  URLS,
  VALIDATION,
  CAMERA,
  UI,
  MESSAGES,
} from './constants'

describe('COLLECTIONS', () => {
  it('should have correct collection names', () => {
    expect(COLLECTIONS.MEMBERS).toBe('members')
    expect(COLLECTIONS.USERS).toBe('users')
    expect(COLLECTIONS.PAYMENTS).toBe('payments')
    expect(COLLECTIONS.POINTS).toBe('point_transactions')
    expect(COLLECTIONS.AUDIT_LOGS).toBe('audit_logs')
  })
})

describe('STORAGE_KEYS', () => {
  it('should have correct storage keys', () => {
    expect(STORAGE_KEYS.LOGIN_ATTEMPTS).toBe('login_attempts')
    expect(STORAGE_KEYS.THEME).toBe('theme')
    expect(STORAGE_KEYS.SIDEBAR_COLLAPSED).toBe('sidebar_collapsed')
  })
})

describe('TIMEOUTS', () => {
  it('should have correct timeout values', () => {
    expect(TIMEOUTS.DEFAULT_REQUEST).toBe(15000)
    expect(TIMEOUTS.CPF_VALIDATION).toBe(5000)
    expect(TIMEOUTS.INPUT_DEBOUNCE).toBe(500)
    expect(TIMEOUTS.LOCKOUT_DURATION).toBe(5 * 60 * 1000)
    expect(TIMEOUTS.ATTEMPT_WINDOW).toBe(15 * 60 * 1000)
    expect(TIMEOUTS.PIX_POLL_INTERVAL).toBe(5000)
    expect(TIMEOUTS.PIX_EXPIRATION).toBe(30 * 60 * 1000)
  })
})

describe('LIMITS', () => {
  it('should have correct limit values', () => {
    expect(LIMITS.MAX_LOGIN_ATTEMPTS).toBe(5)
    expect(LIMITS.MAX_RETRIES).toBe(3)
    expect(LIMITS.INITIAL_RETRY_DELAY).toBe(1000)
    expect(LIMITS.MAX_LOGS_DISPLAY).toBe(50)
    expect(LIMITS.MAX_POINTS_PER_TRANSACTION).toBe(10000)
    expect(LIMITS.POINTS_EXPIRATION_DAYS).toBe(365)
  })
})

describe('URLS', () => {
  it('should have correct URLs', () => {
    expect(URLS.BRASIL_API_CPF).toBe('https://brasilapi.com.br/api/cpf/v1')
  })
})

describe('VALIDATION', () => {
  it('should have correct validation values', () => {
    expect(VALIDATION.MIN_PASSWORD_LENGTH).toBe(6)
    expect(VALIDATION.CPF_LENGTH).toBe(11)
    expect(VALIDATION.PHONE_LENGTH).toBe(11)
  })
})

describe('CAMERA', () => {
  it('should have correct camera values', () => {
    expect(CAMERA.IDEAL_WIDTH).toBe(1280)
    expect(CAMERA.IDEAL_HEIGHT).toBe(720)
  })
})

describe('UI', () => {
  it('should have correct UI values', () => {
    expect(UI.COPY_FEEDBACK_DURATION).toBe(2000)
    expect(UI.RECONNECT_BANNER_DURATION).toBe(3000)
    expect(UI.COUNTDOWN_INTERVAL).toBe(1000)
  })
})

describe('MESSAGES', () => {
  it('should have correct error messages', () => {
    expect(MESSAGES.ERROR.GENERIC).toBe('Ocorreu um erro. Tente novamente.')
    expect(MESSAGES.ERROR.NETWORK).toBe('Erro de conexão. Verifique sua internet.')
    expect(MESSAGES.ERROR.UNAUTHORIZED).toBe('Sessão expirada. Faça login novamente.')
    expect(MESSAGES.ERROR.NOT_FOUND).toBe('Registro não encontrado.')
  })

  it('should have correct success messages', () => {
    expect(MESSAGES.SUCCESS.SAVED).toBe('Salvo com sucesso!')
    expect(MESSAGES.SUCCESS.DELETED).toBe('Removido com sucesso!')
    expect(MESSAGES.SUCCESS.COPIED).toBe('Copiado!')
  })
})
