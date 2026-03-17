import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to mock import.meta.env before importing logger
const mockEnv = { DEV: true }

vi.mock('import.meta', () => ({
  env: mockEnv,
}))

describe('logger', () => {
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>
    info: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
    error: ReturnType<typeof vi.spyOn>
  }

  beforeEach(async () => {
    vi.resetModules()
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should format messages with timestamp and level', async () => {
    const { logger } = await import('./logger')

    logger.info('Test message')

    expect(consoleSpy.info).toHaveBeenCalled()
    const call = consoleSpy.info.mock.calls[0][0]
    expect(call).toMatch(/\[\d{2}:\d{2}:\d{2}\]/)
    expect(call).toContain('[INFO]')
    expect(call).toContain('Test message')
  })

  it('should log debug messages', async () => {
    const { logger } = await import('./logger')

    logger.debug('Debug message')

    expect(consoleSpy.debug).toHaveBeenCalled()
  })

  it('should log info messages', async () => {
    const { logger } = await import('./logger')

    logger.info('Info message')

    expect(consoleSpy.info).toHaveBeenCalled()
  })

  it('should log warn messages', async () => {
    const { logger } = await import('./logger')

    logger.warn('Warn message')

    expect(consoleSpy.warn).toHaveBeenCalled()
  })

  it('should log error messages', async () => {
    const { logger } = await import('./logger')

    logger.error('Error message')

    expect(consoleSpy.error).toHaveBeenCalled()
  })

  it('should pass additional arguments', async () => {
    const { logger } = await import('./logger')
    const extraData = { key: 'value' }

    logger.info('Message', extraData)

    expect(consoleSpy.info).toHaveBeenCalledWith(expect.any(String), extraData)
  })

  it('should create logger with prefix', async () => {
    const { authLogger } = await import('./logger')

    authLogger.info('Auth message')

    const call = consoleSpy.info.mock.calls[0][0]
    expect(call).toContain('[Auth]')
  })

  it('should force log errors in production', async () => {
    const { logger } = await import('./logger')

    logger.force.error('Forced error')

    expect(consoleSpy.error).toHaveBeenCalled()
  })

  it('should allow creating logger with custom prefix', async () => {
    const { logger } = await import('./logger')

    const customLogger = logger.withPrefix('Custom')
    customLogger.info('Custom message')

    const call = consoleSpy.info.mock.calls[0][0]
    expect(call).toContain('[Custom]')
  })
})
