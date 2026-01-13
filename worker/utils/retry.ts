/**
 * Shared retry utilities for the worker
 * Consolidated from worker.ts and gpt-adapter.ts
 */

import { getErrorMessage, getHttpStatus } from '../types/errors.js'

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

/**
 * Default retry configuration - sensible defaults for API calls
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
}

/**
 * Patterns that indicate transient/retryable errors
 */
export const TRANSIENT_ERROR_PATTERNS: RegExp[] = [
  /5\d{2}/,                    // 5xx server errors (500, 502, 503, 504, 520, etc.)
  /429/,                       // Rate limiting
  /ECONNRESET/i,               // Connection reset
  /ETIMEDOUT/i,                // Timeout
  /ECONNREFUSED/i,             // Connection refused
  /EPIPE/i,                    // Broken pipe
  /socket hang up/i,           // Socket hang up
  /network/i,                  // Network errors
  /timeout/i,                  // Timeout errors
  /temporarily unavailable/i,
  /service unavailable/i,
]

/**
 * Checks if an error is transient and should be retried
 */
export function isTransientError(error: unknown): boolean {
  const errorString = getErrorMessage(error)
  return TRANSIENT_ERROR_PATTERNS.some(pattern => pattern.test(errorString))
}

/**
 * Checks if an HTTP status code indicates a retryable error
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

/**
 * Calculates exponential backoff delay for a given attempt
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt)
  return Math.min(delay, config.maxDelayMs)
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Executes a function with retry logic and exponential backoff
 *
 * @param fn - The async function to execute
 * @param config - Retry configuration
 * @param shouldRetry - Optional custom function to determine if error is retryable
 * @param operationName - Optional name for logging
 * @returns Promise resolving to the function result
 * @throws The last error if all retries exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  shouldRetry: (error: unknown) => boolean = isTransientError,
  operationName?: string
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Check if we should retry this error
      const isRetryable = shouldRetry(error)
      const hasRetriesLeft = attempt < config.maxRetries

      if (isRetryable && hasRetriesLeft) {
        const delay = calculateBackoffDelay(attempt, config)
        const name = operationName || 'operation'
        console.warn(
          `${name} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), ` +
          `retrying in ${delay}ms...`
        )
        await sleep(delay)
        // Continue to next iteration
      } else {
        // Either error is not retryable, or we've exhausted retries
        if (!isRetryable) {
          // Non-retryable error - fail immediately
          throw error
        }
        // Retries exhausted
        const name = operationName || 'Operation'
        console.error(`${name} failed after ${config.maxRetries + 1} attempts`)
        throw lastError
      }
    }
  }

  throw lastError
}

/**
 * Creates a retry wrapper for rate-limited API calls (429 handling)
 * Convenience wrapper matching existing gpt-adapter.ts pattern
 */
export async function callWithBackoff<T>(
  fn: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  backoffMultiplier: number = 2,
  maxBackoffMs: number = 30000
): Promise<T> {
  const config: RetryConfig = {
    maxRetries,
    initialDelayMs: 1000,
    maxDelayMs: maxBackoffMs,
    backoffMultiplier,
  }

  const shouldRetry = (error: unknown): boolean => {
    const status = getHttpStatus(error)
    return status === 429 || isTransientError(error)
  }

  return withRetry(fn, config, shouldRetry, operationName)
}
