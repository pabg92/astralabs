/**
 * Error Type Definitions for Worker
 *
 * Provides type-safe error handling throughout the worker codebase.
 * Use these types instead of `any` in catch blocks.
 */

// ============ BASE ERROR TYPE ============

/**
 * Base error interface that all errors should satisfy
 */
export interface BaseError {
  message: string
  name?: string
  stack?: string
}

/**
 * Type guard to check if a value is an Error-like object
 */
export function isError(value: unknown): value is Error {
  return (
    value instanceof Error ||
    (typeof value === 'object' &&
      value !== null &&
      'message' in value &&
      typeof (value as { message: unknown }).message === 'string')
  )
}

/**
 * Safely extract error message from unknown error type
 * Also checks response.statusText for HTTP errors
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  // Check for response.statusText (HTTP errors)
  if (typeof error === 'object' && error !== null) {
    const obj = error as { response?: { statusText?: string } }
    if (obj.response?.statusText) {
      return obj.response.statusText
    }
  }
  return String(error)
}

/**
 * Safely extract error stack from unknown error type
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack
  }
  return undefined
}

// ============ HTTP/API ERRORS ============

/**
 * Error with HTTP status code
 */
export interface HttpError extends Error {
  status?: number
  statusCode?: number
  response?: {
    status?: number
    statusText?: string
    data?: unknown
  }
}

/**
 * Type guard for HTTP errors
 */
export function isHttpError(error: unknown): error is HttpError {
  return (
    isError(error) &&
    (typeof (error as HttpError).status === 'number' ||
      typeof (error as HttpError).statusCode === 'number' ||
      typeof (error as HttpError).response?.status === 'number')
  )
}

/**
 * Extract HTTP status from error
 */
export function getHttpStatus(error: unknown): number | undefined {
  if (!isHttpError(error)) return undefined
  return error.status ?? error.statusCode ?? error.response?.status
}

// ============ SUPABASE ERRORS ============

/**
 * Supabase/Postgrest error shape
 */
export interface SupabaseError {
  message: string
  details?: string | null
  hint?: string | null
  code?: string
}

/**
 * Type guard for Supabase errors
 */
export function isSupabaseError(error: unknown): error is SupabaseError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as SupabaseError).message === 'string'
  )
}

// ============ OPENAI ERRORS ============

/**
 * OpenAI API error shape
 */
export interface OpenAIError extends Error {
  status?: number
  code?: string
  type?: string
  param?: string
}

/**
 * Type guard for OpenAI errors
 */
export function isOpenAIError(error: unknown): error is OpenAIError {
  return (
    isError(error) &&
    (typeof (error as OpenAIError).code === 'string' ||
      typeof (error as OpenAIError).type === 'string')
  )
}

// ============ RATE LIMIT ERRORS ============

/**
 * Check if error is a rate limit error (429)
 */
export function isRateLimitError(error: unknown): boolean {
  const status = getHttpStatus(error)
  if (status === 429) return true

  const message = getErrorMessage(error).toLowerCase()
  return message.includes('rate limit') || message.includes('too many requests')
}

// ============ TRANSIENT ERRORS ============

/**
 * Patterns that indicate transient/retryable errors
 */
const TRANSIENT_PATTERNS = [
  /5\d{2}/, // 5xx server errors
  /429/, // Rate limiting
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /EPIPE/i,
  /socket hang up/i,
  /network/i,
  /timeout/i,
  /temporarily unavailable/i,
  /service unavailable/i,
]

/**
 * Check if error is transient and should be retried
 */
export function isTransientError(error: unknown): boolean {
  const message = getErrorMessage(error)
  const status = getHttpStatus(error)

  // 5xx errors are transient
  if (status && status >= 500 && status < 600) return true

  // 429 (rate limit) is transient
  if (status === 429) return true

  // Check message patterns
  return TRANSIENT_PATTERNS.some(pattern => pattern.test(message))
}

// ============ CUSTOM APPLICATION ERRORS ============

/**
 * Application-specific error with context
 */
export class AppError extends Error {
  public readonly code: string
  public readonly context?: Record<string, unknown>
  public readonly isRetryable: boolean

  constructor(
    message: string,
    code: string,
    options?: {
      cause?: Error
      context?: Record<string, unknown>
      isRetryable?: boolean
    }
  ) {
    super(message, { cause: options?.cause })
    this.name = 'AppError'
    this.code = code
    this.context = options?.context
    this.isRetryable = options?.isRetryable ?? false
  }
}

/**
 * Document processing error
 */
export class DocumentProcessingError extends AppError {
  constructor(
    message: string,
    documentId: string,
    options?: {
      cause?: Error
      stage?: string
      isRetryable?: boolean
    }
  ) {
    super(message, 'DOCUMENT_PROCESSING_ERROR', {
      cause: options?.cause,
      context: { documentId, stage: options?.stage },
      isRetryable: options?.isRetryable,
    })
    this.name = 'DocumentProcessingError'
  }
}

/**
 * GPT/AI service error
 */
export class AIServiceError extends AppError {
  constructor(
    message: string,
    service: 'openai' | 'gemini',
    options?: {
      cause?: Error
      isRetryable?: boolean
    }
  ) {
    super(message, 'AI_SERVICE_ERROR', {
      cause: options?.cause,
      context: { service },
      isRetryable: options?.isRetryable ?? true,
    })
    this.name = 'AIServiceError'
  }
}

/**
 * Database operation error
 */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    operation: string,
    options?: {
      cause?: Error
      table?: string
    }
  ) {
    super(message, 'DATABASE_ERROR', {
      cause: options?.cause,
      context: { operation, table: options?.table },
      isRetryable: false,
    })
    this.name = 'DatabaseError'
  }
}
