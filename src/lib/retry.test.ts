import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry, withRetryWrapper } from './retry'

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success')

    const result = await withRetry(fn)

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on network error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('success')

    const promise = withRetry(fn, { initialDelay: 10 })

    // Advance past first delay
    await vi.advanceTimersByTimeAsync(100)

    const result = await promise
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should retry on timeout error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Request timeout'))
      .mockResolvedValue('success')

    const promise = withRetry(fn, { initialDelay: 10 })
    await vi.advanceTimersByTimeAsync(100)

    const result = await promise
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should retry on unavailable error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Service unavailable'))
      .mockResolvedValue('success')

    const promise = withRetry(fn, { initialDelay: 10 })
    await vi.advanceTimersByTimeAsync(100)

    const result = await promise
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should throw after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network error'))

    const promise = withRetry(fn, { maxRetries: 3, initialDelay: 10 })

    // Catch to prevent unhandled rejection
    const catchPromise = promise.catch(() => {})

    // Let all retries happen
    await vi.advanceTimersByTimeAsync(1000)
    await catchPromise

    await expect(promise).rejects.toThrow('network error')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should not retry on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Authentication failed'))

    await expect(withRetry(fn)).rejects.toThrow('Authentication failed')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should use custom shouldRetry function', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('custom error'))
      .mockResolvedValue('success')

    const promise = withRetry(fn, {
      initialDelay: 10,
      shouldRetry: (error) => error instanceof Error && error.message.includes('custom'),
    })
    await vi.advanceTimersByTimeAsync(100)

    const result = await promise
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should handle server unavailable code', async () => {
    const error = new Error('Server error')
    ;(error as Error & { code: string }).code = 'unavailable'
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success')

    const promise = withRetry(fn, { initialDelay: 10 })
    await vi.advanceTimersByTimeAsync(100)

    const result = await promise
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should handle server deadline-exceeded code', async () => {
    const error = new Error('Server error')
    ;(error as Error & { code: string }).code = 'deadline-exceeded'
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success')

    const promise = withRetry(fn, { initialDelay: 10 })
    await vi.advanceTimersByTimeAsync(100)

    const result = await promise
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should handle deadline error message', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('deadline exceeded'))
      .mockResolvedValue('success')

    const promise = withRetry(fn, { initialDelay: 10 })
    await vi.advanceTimersByTimeAsync(100)

    const result = await promise
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should handle aborted error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Request aborted'))
      .mockResolvedValue('success')

    const promise = withRetry(fn, { initialDelay: 10 })
    await vi.advanceTimersByTimeAsync(100)

    const result = await promise
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('withRetryWrapper', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should wrap a function with retry capability', async () => {
    const originalFn = vi.fn().mockResolvedValue('result')
    const wrappedFn = withRetryWrapper(originalFn)

    const result = await wrappedFn('arg1', 'arg2')

    expect(result).toBe('result')
    expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2')
  })

  it('should retry wrapped function on failure', async () => {
    const originalFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('success')

    const wrappedFn = withRetryWrapper(originalFn, { initialDelay: 10 })

    const promise = wrappedFn()
    await vi.advanceTimersByTimeAsync(100)

    const result = await promise
    expect(result).toBe('success')
    expect(originalFn).toHaveBeenCalledTimes(2)
  })
})
