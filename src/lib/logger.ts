/**
 * Logger utilitário - só exibe logs em desenvolvimento
 *
 * Em produção, os logs são silenciados para:
 * - Não expor informações sensíveis no console
 * - Reduzir ruído no navegador do usuário
 * - Melhorar performance (marginalmente)
 *
 * Uso:
 *   import { logger } from '@/lib/logger'
 *   logger.info('Mensagem normal')
 *   logger.warn('Aviso')
 *   logger.error('Erro', error)
 *   logger.debug('Debug detalhado')
 */

const isDev = import.meta.env.DEV

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LoggerOptions {
  prefix?: string
  forceLog?: boolean // Para casos críticos que precisam logar mesmo em prod
}

function formatMessage(level: LogLevel, prefix: string, message: string): string {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8)
  return `[${timestamp}] [${level.toUpperCase()}] ${prefix ? `[${prefix}] ` : ''}${message}`
}

function createLogger(options: LoggerOptions = {}) {
  const { prefix = '', forceLog = false } = options
  const shouldLog = isDev || forceLog

  return {
    debug: (message: string, ...args: unknown[]) => {
      if (shouldLog) {
        console.debug(formatMessage('debug', prefix, message), ...args)
      }
    },

    info: (message: string, ...args: unknown[]) => {
      if (shouldLog) {
        console.info(formatMessage('info', prefix, message), ...args)
      }
    },

    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog) {
        console.warn(formatMessage('warn', prefix, message), ...args)
      }
    },

    error: (message: string, ...args: unknown[]) => {
      if (shouldLog) {
        console.error(formatMessage('error', prefix, message), ...args)
      }
    },

    // Para criar um logger com prefixo específico
    withPrefix: (newPrefix: string) => createLogger({ ...options, prefix: newPrefix }),

    // Para forçar log mesmo em produção (usar com moderação)
    force: {
      error: (message: string, ...args: unknown[]) => {
        console.error(formatMessage('error', prefix, message), ...args)
      },
    },
  }
}

// Logger padrão
export const logger = createLogger()

// Loggers pré-configurados para módulos específicos
export const authLogger = createLogger({ prefix: 'Auth' })
export const paymentLogger = createLogger({ prefix: 'Payment' })
export const firestoreLogger = createLogger({ prefix: 'Firestore' })
export const membersLogger = createLogger({ prefix: 'Members' })
