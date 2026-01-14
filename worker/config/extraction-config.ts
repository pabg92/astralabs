/**
 * Extraction and embedding configuration for document processing
 * Ported from Edge Functions (extract-clauses, generate-embeddings)
 */

/**
 * Model context limits for extraction path decision
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-5.1': 400_000,
  'gpt-5.1-codex-mini': 400_000,
} as const

/**
 * Rough token estimation: ~4 characters per token
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ============================================================================
// EXTRACTION CONFIGURATION
// ============================================================================

/**
 * GPT model for clause extraction
 */
export const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL || 'gpt-4o'

/**
 * Timeout for extraction API calls (ms)
 */
export const EXTRACTION_TIMEOUT_MS = parseInt(
  process.env.EXTRACTION_TIMEOUT_MS || '90000',
  10
)

/**
 * Characters per chunk for chunked extraction
 */
export const EXTRACTION_CHUNK_SIZE = parseInt(
  process.env.EXTRACTION_CHUNK_SIZE || '12000',
  10
)

/**
 * Overlap between chunks to avoid splitting clauses
 */
export const EXTRACTION_CHUNK_OVERLAP = parseInt(
  process.env.EXTRACTION_CHUNK_OVERLAP || '800',
  10
)

/**
 * Minimum characters to process a chunk
 */
export const EXTRACTION_MIN_CHARS_FOR_CHUNK = parseInt(
  process.env.EXTRACTION_MIN_CHARS_FOR_CHUNK || '600',
  10
)

/**
 * Minimum clauses expected per chunk (triggers retry if fewer)
 */
export const EXTRACTION_MIN_CLAUSES_PER_CHUNK = parseInt(
  process.env.EXTRACTION_MIN_CLAUSES_PER_CHUNK || '3',
  10
)

/**
 * Max extraction attempts per chunk
 */
export const EXTRACTION_MAX_ATTEMPTS = parseInt(
  process.env.EXTRACTION_MAX_ATTEMPTS || '2',
  10
)

/**
 * Maximum clause content length (reject if longer)
 * Increased to 600 to accommodate metadata clauses (talent details, contract metadata)
 * which often span 500-800 chars with multiple fields
 */
export const MAX_CLAUSE_LENGTH = parseInt(
  process.env.MAX_CLAUSE_LENGTH || '600',
  10
)

/**
 * Minimum clause content length
 */
export const MIN_CLAUSE_LENGTH = parseInt(
  process.env.MIN_CLAUSE_LENGTH || '50',
  10
)

// ============================================================================
// EMBEDDING CONFIGURATION
// ============================================================================

/**
 * OpenAI embedding model
 */
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-large'

/**
 * Embedding vector dimensions
 */
export const EMBEDDING_DIMENSIONS = parseInt(
  process.env.EMBEDDING_DIMENSIONS || '1024',
  10
)

/**
 * Clauses per embedding API batch
 */
export const EMBEDDING_BATCH_SIZE = parseInt(
  process.env.EMBEDDING_BATCH_SIZE || '25',
  10
)

/**
 * Maximum characters per text for embedding
 */
export const EMBEDDING_MAX_CHARS = parseInt(
  process.env.EMBEDDING_MAX_CHARS || '2000',
  10
)

// ============================================================================
// SIMILARITY THRESHOLDS
// ============================================================================

/**
 * Minimum similarity to consider a match
 */
export const SIMILARITY_THRESHOLD_MIN = parseFloat(
  process.env.SIMILARITY_THRESHOLD_MIN || '0.60'
)

/**
 * Similarity threshold for GREEN status
 */
export const SIMILARITY_THRESHOLD_GREEN = parseFloat(
  process.env.SIMILARITY_THRESHOLD_GREEN || '0.75'
)

/**
 * Maximum matches to return from similarity search
 */
export const SIMILARITY_MAX_RESULTS = parseInt(
  process.env.SIMILARITY_MAX_RESULTS || '10',
  10
)

// ============================================================================
// QUALITY GATES
// ============================================================================

/**
 * Minimum expected clauses for a document (warn if fewer)
 */
export const QUALITY_MIN_CLAUSES = parseInt(
  process.env.QUALITY_MIN_CLAUSES || '50',
  10
)

/**
 * Maximum average clause length (warn if exceeded)
 */
export const QUALITY_MAX_AVG_LENGTH = parseInt(
  process.env.QUALITY_MAX_AVG_LENGTH || '450',
  10
)

/**
 * Maximum mega-clause rate (warn if exceeded)
 */
export const QUALITY_MAX_MEGA_CLAUSE_RATE = parseFloat(
  process.env.QUALITY_MAX_MEGA_CLAUSE_RATE || '0.15'
)

// ============================================================================
// CONSOLIDATED CONFIG OBJECTS (for dependency injection)
// ============================================================================

export const ExtractionConfig = {
  model: EXTRACTION_MODEL,
  timeoutMs: EXTRACTION_TIMEOUT_MS,
  chunkSize: EXTRACTION_CHUNK_SIZE,
  chunkOverlap: EXTRACTION_CHUNK_OVERLAP,
  minCharsForChunk: EXTRACTION_MIN_CHARS_FOR_CHUNK,
  minClausesPerChunk: EXTRACTION_MIN_CLAUSES_PER_CHUNK,
  maxAttempts: EXTRACTION_MAX_ATTEMPTS,
  maxClauseLength: MAX_CLAUSE_LENGTH,
  minClauseLength: MIN_CLAUSE_LENGTH,
  modelContextLimits: MODEL_CONTEXT_LIMITS,
} as const

export const EmbeddingConfig = {
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
  batchSize: EMBEDDING_BATCH_SIZE,
  maxChars: EMBEDDING_MAX_CHARS,
} as const

export const SimilarityConfig = {
  thresholdMin: SIMILARITY_THRESHOLD_MIN,
  thresholdGreen: SIMILARITY_THRESHOLD_GREEN,
  maxResults: SIMILARITY_MAX_RESULTS,
} as const

export const QualityConfig = {
  minClauses: QUALITY_MIN_CLAUSES,
  maxAvgLength: QUALITY_MAX_AVG_LENGTH,
  maxMegaClauseRate: QUALITY_MAX_MEGA_CLAUSE_RATE,
} as const
