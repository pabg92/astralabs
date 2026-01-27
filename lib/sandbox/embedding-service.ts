/**
 * Sandbox Embedding Service
 * Generates vector embeddings for LCL sandbox testing
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const EMBEDDING_MODEL = 'text-embedding-3-large'
const EMBEDDING_DIMENSIONS = 1024
const EMBEDDING_MAX_CHARS = 2000
const EMBEDDING_BATCH_SIZE = 25

interface EmbeddingConfig {
  apiKey: string
  model?: string
  dimensions?: number
  maxChars?: number
}

interface EmbeddingResult {
  text: string
  embedding: number[]
}

interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[]
  totalTokens: number
  model: string
}

interface OpenAIEmbeddingResponse {
  data: Array<{
    index: number
    embedding: number[]
  }>
  model: string
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function prepareText(text: string, maxChars: number): string {
  if (!text) return ''
  return text.substring(0, maxChars)
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Generate embeddings for a batch of texts
 */
async function callOpenAIEmbeddings(
  texts: string[],
  config: EmbeddingConfig
): Promise<OpenAIEmbeddingResponse> {
  const { apiKey, model = EMBEDDING_MODEL, dimensions = EMBEDDING_DIMENSIONS } = config

  if (!apiKey) {
    throw new Error('OpenAI API key is required')
  }

  if (texts.length === 0) {
    throw new Error('No texts provided for embedding')
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
  }

  return response.json()
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig
): Promise<{ embedding: number[]; tokens: number; model: string }> {
  const maxChars = config.maxChars ?? EMBEDDING_MAX_CHARS
  const preparedText = prepareText(text, maxChars)

  const response = await callOpenAIEmbeddings([preparedText], config)

  return {
    embedding: response.data[0].embedding,
    tokens: response.usage.total_tokens,
    model: response.model,
  }
}

/**
 * Generate embeddings for multiple texts with automatic batching
 */
export async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig,
  onProgress?: (progress: { batch: number; total: number; processed: number }) => void
): Promise<{
  embeddings: number[][]
  totalTokens: number
  model: string
}> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, model: EMBEDDING_MODEL }
  }

  const maxChars = config.maxChars ?? EMBEDDING_MAX_CHARS
  const batchSize = EMBEDDING_BATCH_SIZE
  const allEmbeddings: number[][] = new Array(texts.length)
  let totalTokens = 0
  let model = ''

  const totalBatches = Math.ceil(texts.length / batchSize)

  for (let i = 0; i < texts.length; i += batchSize) {
    const batchNumber = Math.floor(i / batchSize) + 1
    const batchTexts = texts.slice(i, i + batchSize).map((t) => prepareText(t, maxChars))

    const response = await callOpenAIEmbeddings(batchTexts, config)

    // Sort by index to maintain order
    const sortedData = response.data.sort((a, b) => a.index - b.index)

    // Store embeddings
    sortedData.forEach((item, j) => {
      allEmbeddings[i + j] = item.embedding
    })

    totalTokens += response.usage.total_tokens
    model = response.model

    if (onProgress) {
      onProgress({
        batch: batchNumber,
        total: totalBatches,
        processed: Math.min(i + batchSize, texts.length),
      })
    }
  }

  return { embeddings: allEmbeddings, totalTokens, model }
}

/**
 * Convert embedding array to PostgreSQL vector string format
 */
export function embeddingToVectorString(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

/**
 * Create embedding config from environment
 */
export function createEmbeddingConfig(): EmbeddingConfig {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }
  return { apiKey }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { EmbeddingConfig, EmbeddingResult, BatchEmbeddingResult }
