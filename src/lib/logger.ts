/**
 * Development-only logging. Silenced in production so nothing sensitive
 * reaches the console and the user's browser stays quiet.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info('...')
 *   logger.warn('...')
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

    // Creates a logger with its own prefix
    withPrefix: (newPrefix: string) => createLogger({ ...options, prefix: newPrefix }),

    // Forces output even in production; use sparingly
    force: {
      error: (message: string, ...args: unknown[]) => {
        console.error(formatMessage('error', prefix, message), ...args)
      },
    },
  }
}

// Default logger
export const logger = createLogger()

// Preconfigured per-module loggers
export const authLogger = createLogger({ prefix: 'Auth' })
export const paymentLogger = createLogger({ prefix: 'Payment' })
export const dbLogger = createLogger({ prefix: 'Database' })
export const membersLogger = createLogger({ prefix: 'Members' })
