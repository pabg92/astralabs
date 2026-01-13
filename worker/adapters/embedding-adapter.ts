/**
 * Embedding Adapter
 * Generates vector embeddings via OpenAI's API with batching and retry logic
 * Ported from supabase/functions/generate-embeddings/index.ts
 */

import { withRetry, isTransientError } from '../utils/retry.js'
import { getErrorMessage } from '../types/errors.js'
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_MAX_CHARS,
} from '../config/extraction-config'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Single embedding result
 */
export interface EmbeddingResult {
  /** The input text that was embedded */
  text: string
  /** The embedding vector */
  embedding: number[]
  /** Original index in the input array */
  index: number
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  /** All successful embeddings */
  embeddings: EmbeddingResult[]
  /** Total tokens used */
  totalTokens: number
  /** Model used */
  model: string
}

/**
 * OpenAI API response structure
 */
interface OpenAIEmbeddingResponse {
  object: string
  data: Array<{
    object: string
    index: number
    embedding: number[]
  }>
  model: string
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

/**
 * Configuration for embedding operations
 */
export interface EmbeddingConfig {
  /** OpenAI API key */
  apiKey: string
  /** Model to use (default: text-embedding-3-large) */
  model?: string
  /** Embedding dimensions (default: 1024) */
  dimensions?: number
  /** Maximum texts per batch (default: 25) */
  batchSize?: number
  /** Maximum characters per text (default: 2000) */
  maxChars?: number
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number
  /** OpenAI API base URL (default: https://api.openai.com/v1) */
  baseUrl?: string
}

const DEFAULT_CONFIG: Omit<EmbeddingConfig, 'apiKey'> = {
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
  batchSize: EMBEDDING_BATCH_SIZE,
  maxChars: EMBEDDING_MAX_CHARS,
  maxRetries: 3,
  baseUrl: 'https://api.openai.com/v1',
}

// ============================================================================
// ERROR HELPERS
// ============================================================================

/**
 * Embedding-specific error class
 */
export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message)
    this.name = 'EmbeddingError'
  }
}

/**
 * Checks if an embedding error is retryable
 */
export function isRetryableEmbeddingError(error: unknown): boolean {
  // Check for transient network errors
  if (isTransientError(error)) return true

  // Check if it's our custom error with retryable flag
  if (error instanceof EmbeddingError) return error.retryable

  const errorMessage = getErrorMessage(error)

  // Rate limiting (429) is retryable
  if (/429|rate.?limit/i.test(errorMessage)) return true

  // Server errors (5xx) are retryable
  if (/5\d{2}|server.?error/i.test(errorMessage)) return true

  // Timeout errors are retryable
  if (/timeout|ETIMEDOUT/i.test(errorMessage)) return true

  return false
}

// ============================================================================
// TEXT PREPROCESSING
// ============================================================================

/**
 * Prepares text for embedding by truncating to max characters
 */
export function prepareTextForEmbedding(text: string, maxChars: number = EMBEDDING_MAX_CHARS): string {
  if (!text) return ''
  return text.substring(0, maxChars)
}

/**
 * Prepares multiple texts for embedding
 */
export function prepareTextsForEmbedding(texts: string[], maxChars: number = EMBEDDING_MAX_CHARS): string[] {
  return texts.map(text => prepareTextForEmbedding(text, maxChars))
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Calls OpenAI embeddings API for a single batch
 */
export async function callEmbeddingsApi(
  texts: string[],
  config: EmbeddingConfig
): Promise<OpenAIEmbeddingResponse> {
  const {
    apiKey,
    model = DEFAULT_CONFIG.model,
    dimensions = DEFAULT_CONFIG.dimensions,
    baseUrl = DEFAULT_CONFIG.baseUrl,
  } = config

  if (!apiKey) {
    throw new EmbeddingError('OpenAI API key is required', 'MISSING_API_KEY')
  }

  if (texts.length === 0) {
    throw new EmbeddingError('No texts provided for embedding', 'EMPTY_INPUT')
  }

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
      dimensions,
      encoding_format: 'float',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    const isRetryable = response.status === 429 || response.status >= 500

    throw new EmbeddingError(
      `OpenAI API error (${response.status}): ${errorText}`,
      'API_ERROR',
      response.status,
      isRetryable
    )
  }

  return response.json()
}

/**
 * Calls OpenAI embeddings API with retry logic
 */
export async function callEmbeddingsApiWithRetry(
  texts: string[],
  config: EmbeddingConfig
): Promise<OpenAIEmbeddingResponse> {
  const maxRetries = config.maxRetries ?? DEFAULT_CONFIG.maxRetries ?? 3

  return withRetry(
    () => callEmbeddingsApi(texts, config),
    {
      maxRetries,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    },
    isRetryableEmbeddingError,
    'openai-embeddings'
  )
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Generates embeddings for a single batch of texts
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  config: EmbeddingConfig
): Promise<BatchEmbeddingResult> {
  const maxChars = config.maxChars ?? DEFAULT_CONFIG.maxChars ?? 2000

  // Prepare texts (truncate to max chars)
  const preparedTexts = prepareTextsForEmbedding(texts, maxChars)

  // Call API with retry
  const response = await callEmbeddingsApiWithRetry(preparedTexts, config)

  // Sort by index to maintain original order
  const sortedData = response.data.sort((a, b) => a.index - b.index)

  // Map to our result format
  const embeddings: EmbeddingResult[] = sortedData.map((item, i) => ({
    text: texts[i], // Use original text, not truncated
    embedding: item.embedding,
    index: item.index,
  }))

  return {
    embeddings,
    totalTokens: response.usage.total_tokens,
    model: response.model,
  }
}

/**
 * Callback for batch progress reporting
 */
export type BatchProgressCallback = (progress: {
  batchNumber: number
  totalBatches: number
  processedTexts: number
  totalTexts: number
  batchTimeMs: number
}) => void

/**
 * Generates embeddings for multiple texts with automatic batching
 */
export async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig,
  onProgress?: BatchProgressCallback
): Promise<{
  embeddings: number[][]
  totalTokens: number
  model: string
  batchStats: Array<{ batch: number; count: number; timeMs: number; tokens: number }>
}> {
  if (texts.length === 0) {
    return {
      embeddings: [],
      totalTokens: 0,
      model: config.model || EMBEDDING_MODEL,
      batchStats: [],
    }
  }

  const batchSize = config.batchSize ?? DEFAULT_CONFIG.batchSize ?? 25
  const allEmbeddings: number[][] = new Array(texts.length)
  const batchStats: Array<{ batch: number; count: number; timeMs: number; tokens: number }> = []
  let totalTokens = 0
  let model = ''

  const totalBatches = Math.ceil(texts.length / batchSize)

  for (let i = 0; i < texts.length; i += batchSize) {
    const batchNumber = Math.floor(i / batchSize) + 1
    const batchTexts = texts.slice(i, i + batchSize)
    const batchStart = Date.now()

    const result = await generateEmbeddingsBatch(batchTexts, config)

    const batchTimeMs = Date.now() - batchStart

    // Store embeddings in correct positions
    result.embeddings.forEach((emb, j) => {
      allEmbeddings[i + j] = emb.embedding
    })

    totalTokens += result.totalTokens
    model = result.model

    batchStats.push({
      batch: batchNumber,
      count: batchTexts.length,
      timeMs: batchTimeMs,
      tokens: result.totalTokens,
    })

    // Report progress if callback provided
    if (onProgress) {
      onProgress({
        batchNumber,
        totalBatches,
        processedTexts: Math.min(i + batchSize, texts.length),
        totalTexts: texts.length,
        batchTimeMs,
      })
    }
  }

  return {
    embeddings: allEmbeddings,
    totalTokens,
    model,
    batchStats,
  }
}

/**
 * Generates a single embedding for one text
 */
export async function generateSingleEmbedding(
  text: string,
  config: EmbeddingConfig
): Promise<{ embedding: number[]; tokens: number; model: string }> {
  const result = await generateEmbeddingsBatch([text], config)

  return {
    embedding: result.embeddings[0].embedding,
    tokens: result.totalTokens,
    model: result.model,
  }
}

// ============================================================================
// ADAPTER CLASS
// ============================================================================

/**
 * Embedding Adapter class for dependency injection
 */
export class EmbeddingAdapter {
  private config: EmbeddingConfig

  constructor(config: EmbeddingConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Generates embeddings for multiple texts with batching
   */
  async generateEmbeddings(
    texts: string[],
    onProgress?: BatchProgressCallback
  ): Promise<{
    embeddings: number[][]
    totalTokens: number
    model: string
    batchStats: Array<{ batch: number; count: number; timeMs: number; tokens: number }>
  }> {
    return generateEmbeddings(texts, this.config, onProgress)
  }

  /**
   * Generates a single embedding
   */
  async generateSingleEmbedding(
    text: string
  ): Promise<{ embedding: number[]; tokens: number; model: string }> {
    return generateSingleEmbedding(text, this.config)
  }

  /**
   * Generates embeddings for a single batch (no automatic batching)
   */
  async generateBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    return generateEmbeddingsBatch(texts, this.config)
  }

  /**
   * Gets the configured model
   */
  getModel(): string {
    return this.config.model || EMBEDDING_MODEL
  }

  /**
   * Gets the configured dimensions
   */
  getDimensions(): number {
    return this.config.dimensions || EMBEDDING_DIMENSIONS
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates a new EmbeddingAdapter instance
 */
export function createEmbeddingAdapter(config: EmbeddingConfig): EmbeddingAdapter {
  return new EmbeddingAdapter(config)
}

/**
 * Creates an EmbeddingAdapter using environment variables
 */
export function createEmbeddingAdapterFromEnv(): EmbeddingAdapter {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new EmbeddingError('OPENAI_API_KEY environment variable is required', 'MISSING_API_KEY')
  }

  return createEmbeddingAdapter({ apiKey })
}
