import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isTransientError,
  isRetryableStatus,
  calculateBackoffDelay,
  withRetry,
  callWithBackoff,
  sleep,
  DEFAULT_RETRY_CONFIG,
  TRANSIENT_ERROR_PATTERNS,
} from './retry'

describe('retry utility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('TRANSIENT_ERROR_PATTERNS', () => {
    it('contains expected patterns', () => {
      expect(TRANSIENT_ERROR_PATTERNS.length).toBeGreaterThan(0)
      expect(TRANSIENT_ERROR_PATTERNS.some(p => p.source.includes('5'))).toBe(true)
      expect(TRANSIENT_ERROR_PATTERNS.some(p => p.source.includes('429'))).toBe(true)
    })
  })

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3)
      expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000)
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(30000)
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2)
    })
  })

  describe('isTransientError', () => {
    it('returns true for 5xx errors', () => {
      expect(isTransientError(new Error('500 Internal Server Error'))).toBe(true)
      expect(isTransientError(new Error('502 Bad Gateway'))).toBe(true)
      expect(isTransientError(new Error('503 Service Unavailable'))).toBe(true)
      expect(isTransientError(new Error('504 Gateway Timeout'))).toBe(true)
      expect(isTransientError(new Error('520 Unknown Error'))).toBe(true)
    })

    it('returns true for rate limit errors', () => {
      expect(isTransientError(new Error('429 Too Many Requests'))).toBe(true)
      expect(isTransientError(new Error('Rate limited: 429'))).toBe(true)
    })

    it('returns true for connection errors', () => {
      expect(isTransientError(new Error('ECONNRESET'))).toBe(true)
      expect(isTransientError(new Error('ETIMEDOUT'))).toBe(true)
      expect(isTransientError(new Error('ECONNREFUSED'))).toBe(true)
      expect(isTransientError(new Error('EPIPE'))).toBe(true)
    })

    it('returns true for network errors', () => {
      expect(isTransientError(new Error('Network error'))).toBe(true)
      expect(isTransientError(new Error('socket hang up'))).toBe(true)
      expect(isTransientError(new Error('timeout'))).toBe(true)
      expect(isTransientError(new Error('Request timeout'))).toBe(true)
    })

    it('returns true for availability errors', () => {
      expect(isTransientError(new Error('temporarily unavailable'))).toBe(true)
      expect(isTransientError(new Error('service unavailable'))).toBe(true)
    })

    it('returns false for non-transient errors', () => {
      expect(isTransientError(new Error('Invalid JSON'))).toBe(false)
      expect(isTransientError(new Error('Not found'))).toBe(false)
      expect(isTransientError(new Error('400 Bad Request'))).toBe(false)
      expect(isTransientError(new Error('401 Unauthorized'))).toBe(false)
      expect(isTransientError(new Error('403 Forbidden'))).toBe(false)
      expect(isTransientError(new Error('404 Not Found'))).toBe(false)
    })

    it('handles non-Error inputs', () => {
      expect(isTransientError('timeout error')).toBe(true)
      expect(isTransientError({ message: '503' })).toBe(true)
      expect(isTransientError({ message: 'ECONNRESET' })).toBe(true)
    })

    it('handles null/undefined inputs', () => {
      expect(isTransientError(null)).toBe(false)
      expect(isTransientError(undefined)).toBe(false)
    })

    it('handles response.statusText', () => {
      expect(isTransientError({ response: { statusText: '503 Service Unavailable' } })).toBe(true)
    })
  })

  describe('isRetryableStatus', () => {
    it('returns true for 429', () => {
      expect(isRetryableStatus(429)).toBe(true)
    })

    it('returns true for 5xx status codes', () => {
      expect(isRetryableStatus(500)).toBe(true)
      expect(isRetryableStatus(502)).toBe(true)
      expect(isRetryableStatus(503)).toBe(true)
      expect(isRetryableStatus(504)).toBe(true)
      expect(isRetryableStatus(520)).toBe(true)
      expect(isRetryableStatus(599)).toBe(true)
    })

    it('returns false for success codes', () => {
      expect(isRetryableStatus(200)).toBe(false)
      expect(isRetryableStatus(201)).toBe(false)
      expect(isRetryableStatus(204)).toBe(false)
    })

    it('returns false for 4xx (except 429)', () => {
      expect(isRetryableStatus(400)).toBe(false)
      expect(isRetryableStatus(401)).toBe(false)
      expect(isRetryableStatus(403)).toBe(false)
      expect(isRetryableStatus(404)).toBe(false)
      expect(isRetryableStatus(422)).toBe(false)
    })

    it('returns false for 3xx', () => {
      expect(isRetryableStatus(301)).toBe(false)
      expect(isRetryableStatus(302)).toBe(false)
      expect(isRetryableStatus(304)).toBe(false)
    })
  })

  describe('calculateBackoffDelay', () => {
    it('calculates exponential backoff', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 }
      expect(calculateBackoffDelay(0, config)).toBe(1000)
      expect(calculateBackoffDelay(1, config)).toBe(2000)
      expect(calculateBackoffDelay(2, config)).toBe(4000)
      expect(calculateBackoffDelay(3, config)).toBe(8000)
      expect(calculateBackoffDelay(4, config)).toBe(16000)
    })

    it('caps at maxDelayMs', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 5000 }
      expect(calculateBackoffDelay(10, config)).toBe(5000)
      expect(calculateBackoffDelay(100, config)).toBe(5000)
    })

    it('uses DEFAULT_RETRY_CONFIG when not specified', () => {
      expect(calculateBackoffDelay(0)).toBe(1000)
      expect(calculateBackoffDelay(1)).toBe(2000)
    })

    it('handles different multipliers', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 1000, backoffMultiplier: 3, maxDelayMs: 100000 }
      expect(calculateBackoffDelay(0, config)).toBe(1000)
      expect(calculateBackoffDelay(1, config)).toBe(3000)
      expect(calculateBackoffDelay(2, config)).toBe(9000)
    })
  })

  describe('sleep', () => {
    it('returns a promise that resolves', async () => {
      const sleepPromise = sleep(100)
      await vi.advanceTimersByTimeAsync(100)
      // Should not throw
      await expect(sleepPromise).resolves.toBeUndefined()
    })

    it('can be awaited with fake timers', async () => {
      let resolved = false
      const sleepPromise = sleep(1000).then(() => { resolved = true })

      expect(resolved).toBe(false)
      await vi.advanceTimersByTimeAsync(500)
      expect(resolved).toBe(false)
      await vi.advanceTimersByTimeAsync(500)
      await sleepPromise
      expect(resolved).toBe(true)
    })
  })

  describe('withRetry', () => {
    it('returns result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await withRetry(fn)
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries on transient error and succeeds', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValue('success')

      const promise = withRetry(fn, { ...DEFAULT_RETRY_CONFIG, maxRetries: 2 })
      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('throws after max retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('503'))
      const config = { ...DEFAULT_RETRY_CONFIG, maxRetries: 2 }

      const promise = withRetry(fn, config)
      await vi.advanceTimersByTimeAsync(10000)

      await expect(promise).rejects.toThrow('503')
      expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
    })

    it('does not retry non-transient errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Invalid input'))

      await expect(withRetry(fn)).rejects.toThrow('Invalid input')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('uses custom shouldRetry function', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('custom error'))
      const shouldRetry = vi.fn().mockReturnValue(false)

      await expect(withRetry(fn, DEFAULT_RETRY_CONFIG, shouldRetry)).rejects.toThrow('custom error')
      expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error))
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('respects maxRetries of 0', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('503'))
      const config = { ...DEFAULT_RETRY_CONFIG, maxRetries: 0 }

      await expect(withRetry(fn, config)).rejects.toThrow('503')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('applies backoff delay between retries', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('503'))
        .mockRejectedValueOnce(new Error('503'))
        .mockResolvedValue('success')

      const config = { maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2 }
      const promise = withRetry(fn, config)

      // First call fails immediately
      expect(fn).toHaveBeenCalledTimes(1)

      // After 1000ms (first backoff), second call
      await vi.advanceTimersByTimeAsync(1000)
      expect(fn).toHaveBeenCalledTimes(2)

      // After 2000ms (second backoff), third call
      await vi.advanceTimersByTimeAsync(2000)
      expect(fn).toHaveBeenCalledTimes(3)

      const result = await promise
      expect(result).toBe('success')
    })
  })

  describe('callWithBackoff', () => {
    it('returns result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await callWithBackoff(fn, 'test-operation')
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries on 429 error', async () => {
      const error429 = new Error('Too Many Requests')
      ;(error429 as any).status = 429

      const fn = vi.fn()
        .mockRejectedValueOnce(error429)
        .mockResolvedValue('success')

      const promise = callWithBackoff(fn, 'test-operation')
      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('retries on transient error', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('503'))
        .mockResolvedValue('success')

      const promise = callWithBackoff(fn, 'test-operation')
      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('uses custom maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('503'))

      const promise = callWithBackoff(fn, 'test-operation', 1)
      await vi.advanceTimersByTimeAsync(10000)

      await expect(promise).rejects.toThrow('503')
      expect(fn).toHaveBeenCalledTimes(2) // initial + 1 retry
    })

    it('uses custom backoffMultiplier', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('503'))
        .mockRejectedValueOnce(new Error('503'))
        .mockResolvedValue('success')

      const promise = callWithBackoff(fn, 'test-operation', 3, 3) // multiplier = 3

      await vi.advanceTimersByTimeAsync(1000) // first retry at 1000ms
      expect(fn).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(3000) // second retry at 3000ms (1000 * 3)
      expect(fn).toHaveBeenCalledTimes(3)

      const result = await promise
      expect(result).toBe('success')
    })
  })
})
