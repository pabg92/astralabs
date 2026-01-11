import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('extraction-config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('MODEL_CONTEXT_LIMITS', () => {
    it('has expected model limits', async () => {
      const { MODEL_CONTEXT_LIMITS } = await import('./extraction-config')
      expect(MODEL_CONTEXT_LIMITS['gpt-4o']).toBe(128_000)
      expect(MODEL_CONTEXT_LIMITS['gpt-5.1']).toBe(400_000)
      expect(MODEL_CONTEXT_LIMITS['gpt-5.1-codex-mini']).toBe(400_000)
    })
  })

  describe('estimateTokens', () => {
    it('estimates ~4 chars per token', async () => {
      const { estimateTokens } = await import('./extraction-config')
      expect(estimateTokens('hello world')).toBe(3) // 11 chars / 4 = 2.75 -> ceil = 3
      expect(estimateTokens('a'.repeat(100))).toBe(25)
      expect(estimateTokens('a'.repeat(4))).toBe(1)
      expect(estimateTokens('')).toBe(0)
    })

    it('rounds up for partial tokens', async () => {
      const { estimateTokens } = await import('./extraction-config')
      expect(estimateTokens('abc')).toBe(1) // 3/4 = 0.75 -> ceil = 1
      expect(estimateTokens('abcde')).toBe(2) // 5/4 = 1.25 -> ceil = 2
    })
  })

  describe('default values', () => {
    it('uses default extraction model', async () => {
      delete process.env.EXTRACTION_MODEL
      const { EXTRACTION_MODEL } = await import('./extraction-config')
      expect(EXTRACTION_MODEL).toBe('gpt-4o')
    })

    it('uses default extraction timeout', async () => {
      delete process.env.EXTRACTION_TIMEOUT_MS
      const { EXTRACTION_TIMEOUT_MS } = await import('./extraction-config')
      expect(EXTRACTION_TIMEOUT_MS).toBe(90000)
    })

    it('uses default chunk size', async () => {
      delete process.env.EXTRACTION_CHUNK_SIZE
      const { EXTRACTION_CHUNK_SIZE } = await import('./extraction-config')
      expect(EXTRACTION_CHUNK_SIZE).toBe(12000)
    })

    it('uses default chunk overlap', async () => {
      delete process.env.EXTRACTION_CHUNK_OVERLAP
      const { EXTRACTION_CHUNK_OVERLAP } = await import('./extraction-config')
      expect(EXTRACTION_CHUNK_OVERLAP).toBe(800)
    })

    it('uses default min chars for chunk', async () => {
      delete process.env.EXTRACTION_MIN_CHARS_FOR_CHUNK
      const { EXTRACTION_MIN_CHARS_FOR_CHUNK } = await import('./extraction-config')
      expect(EXTRACTION_MIN_CHARS_FOR_CHUNK).toBe(600)
    })

    it('uses default min clauses per chunk', async () => {
      delete process.env.EXTRACTION_MIN_CLAUSES_PER_CHUNK
      const { EXTRACTION_MIN_CLAUSES_PER_CHUNK } = await import('./extraction-config')
      expect(EXTRACTION_MIN_CLAUSES_PER_CHUNK).toBe(3)
    })

    it('uses default max attempts', async () => {
      delete process.env.EXTRACTION_MAX_ATTEMPTS
      const { EXTRACTION_MAX_ATTEMPTS } = await import('./extraction-config')
      expect(EXTRACTION_MAX_ATTEMPTS).toBe(2)
    })

    it('uses default max clause length', async () => {
      delete process.env.MAX_CLAUSE_LENGTH
      const { MAX_CLAUSE_LENGTH } = await import('./extraction-config')
      expect(MAX_CLAUSE_LENGTH).toBe(400)
    })

    it('uses default min clause length', async () => {
      delete process.env.MIN_CLAUSE_LENGTH
      const { MIN_CLAUSE_LENGTH } = await import('./extraction-config')
      expect(MIN_CLAUSE_LENGTH).toBe(50)
    })

    it('uses default embedding model', async () => {
      delete process.env.EMBEDDING_MODEL
      const { EMBEDDING_MODEL } = await import('./extraction-config')
      expect(EMBEDDING_MODEL).toBe('text-embedding-3-large')
    })

    it('uses default embedding dimensions', async () => {
      delete process.env.EMBEDDING_DIMENSIONS
      const { EMBEDDING_DIMENSIONS } = await import('./extraction-config')
      expect(EMBEDDING_DIMENSIONS).toBe(1024)
    })

    it('uses default embedding batch size', async () => {
      delete process.env.EMBEDDING_BATCH_SIZE
      const { EMBEDDING_BATCH_SIZE } = await import('./extraction-config')
      expect(EMBEDDING_BATCH_SIZE).toBe(25)
    })

    it('uses default similarity threshold min', async () => {
      delete process.env.SIMILARITY_THRESHOLD_MIN
      const { SIMILARITY_THRESHOLD_MIN } = await import('./extraction-config')
      expect(SIMILARITY_THRESHOLD_MIN).toBe(0.60)
    })

    it('uses default similarity threshold green', async () => {
      delete process.env.SIMILARITY_THRESHOLD_GREEN
      const { SIMILARITY_THRESHOLD_GREEN } = await import('./extraction-config')
      expect(SIMILARITY_THRESHOLD_GREEN).toBe(0.75)
    })

    it('uses default similarity max results', async () => {
      delete process.env.SIMILARITY_MAX_RESULTS
      const { SIMILARITY_MAX_RESULTS } = await import('./extraction-config')
      expect(SIMILARITY_MAX_RESULTS).toBe(10)
    })

    it('uses default quality min clauses', async () => {
      delete process.env.QUALITY_MIN_CLAUSES
      const { QUALITY_MIN_CLAUSES } = await import('./extraction-config')
      expect(QUALITY_MIN_CLAUSES).toBe(50)
    })

    it('uses default quality max avg length', async () => {
      delete process.env.QUALITY_MAX_AVG_LENGTH
      const { QUALITY_MAX_AVG_LENGTH } = await import('./extraction-config')
      expect(QUALITY_MAX_AVG_LENGTH).toBe(450)
    })

    it('uses default quality max mega clause rate', async () => {
      delete process.env.QUALITY_MAX_MEGA_CLAUSE_RATE
      const { QUALITY_MAX_MEGA_CLAUSE_RATE } = await import('./extraction-config')
      expect(QUALITY_MAX_MEGA_CLAUSE_RATE).toBe(0.15)
    })
  })

  describe('environment overrides', () => {
    it('respects EXTRACTION_MODEL env var', async () => {
      process.env.EXTRACTION_MODEL = 'gpt-5.1'
      const { EXTRACTION_MODEL } = await import('./extraction-config')
      expect(EXTRACTION_MODEL).toBe('gpt-5.1')
    })

    it('respects EXTRACTION_TIMEOUT_MS env var', async () => {
      process.env.EXTRACTION_TIMEOUT_MS = '120000'
      const { EXTRACTION_TIMEOUT_MS } = await import('./extraction-config')
      expect(EXTRACTION_TIMEOUT_MS).toBe(120000)
    })

    it('respects EXTRACTION_CHUNK_SIZE env var', async () => {
      process.env.EXTRACTION_CHUNK_SIZE = '8000'
      const { EXTRACTION_CHUNK_SIZE } = await import('./extraction-config')
      expect(EXTRACTION_CHUNK_SIZE).toBe(8000)
    })

    it('respects EMBEDDING_MODEL env var', async () => {
      process.env.EMBEDDING_MODEL = 'text-embedding-3-small'
      const { EMBEDDING_MODEL } = await import('./extraction-config')
      expect(EMBEDDING_MODEL).toBe('text-embedding-3-small')
    })

    it('respects EMBEDDING_DIMENSIONS env var', async () => {
      process.env.EMBEDDING_DIMENSIONS = '3072'
      const { EMBEDDING_DIMENSIONS } = await import('./extraction-config')
      expect(EMBEDDING_DIMENSIONS).toBe(3072)
    })

    it('respects EMBEDDING_BATCH_SIZE env var', async () => {
      process.env.EMBEDDING_BATCH_SIZE = '50'
      const { EMBEDDING_BATCH_SIZE } = await import('./extraction-config')
      expect(EMBEDDING_BATCH_SIZE).toBe(50)
    })

    it('respects SIMILARITY_THRESHOLD_MIN env var', async () => {
      process.env.SIMILARITY_THRESHOLD_MIN = '0.70'
      const { SIMILARITY_THRESHOLD_MIN } = await import('./extraction-config')
      expect(SIMILARITY_THRESHOLD_MIN).toBe(0.70)
    })

    it('respects SIMILARITY_THRESHOLD_GREEN env var', async () => {
      process.env.SIMILARITY_THRESHOLD_GREEN = '0.80'
      const { SIMILARITY_THRESHOLD_GREEN } = await import('./extraction-config')
      expect(SIMILARITY_THRESHOLD_GREEN).toBe(0.80)
    })
  })

  describe('consolidated config objects', () => {
    it('ExtractionConfig has all required fields', async () => {
      const { ExtractionConfig } = await import('./extraction-config')
      expect(ExtractionConfig).toHaveProperty('model')
      expect(ExtractionConfig).toHaveProperty('timeoutMs')
      expect(ExtractionConfig).toHaveProperty('chunkSize')
      expect(ExtractionConfig).toHaveProperty('chunkOverlap')
      expect(ExtractionConfig).toHaveProperty('minCharsForChunk')
      expect(ExtractionConfig).toHaveProperty('minClausesPerChunk')
      expect(ExtractionConfig).toHaveProperty('maxAttempts')
      expect(ExtractionConfig).toHaveProperty('maxClauseLength')
      expect(ExtractionConfig).toHaveProperty('minClauseLength')
      expect(ExtractionConfig).toHaveProperty('modelContextLimits')
    })

    it('ExtractionConfig values match individual exports', async () => {
      const config = await import('./extraction-config')
      expect(config.ExtractionConfig.model).toBe(config.EXTRACTION_MODEL)
      expect(config.ExtractionConfig.timeoutMs).toBe(config.EXTRACTION_TIMEOUT_MS)
      expect(config.ExtractionConfig.chunkSize).toBe(config.EXTRACTION_CHUNK_SIZE)
      expect(config.ExtractionConfig.chunkOverlap).toBe(config.EXTRACTION_CHUNK_OVERLAP)
    })

    it('EmbeddingConfig has all required fields', async () => {
      const { EmbeddingConfig } = await import('./extraction-config')
      expect(EmbeddingConfig).toHaveProperty('model')
      expect(EmbeddingConfig).toHaveProperty('dimensions')
      expect(EmbeddingConfig).toHaveProperty('batchSize')
    })

    it('EmbeddingConfig values match individual exports', async () => {
      const config = await import('./extraction-config')
      expect(config.EmbeddingConfig.model).toBe(config.EMBEDDING_MODEL)
      expect(config.EmbeddingConfig.dimensions).toBe(config.EMBEDDING_DIMENSIONS)
      expect(config.EmbeddingConfig.batchSize).toBe(config.EMBEDDING_BATCH_SIZE)
    })

    it('SimilarityConfig has all required fields', async () => {
      const { SimilarityConfig } = await import('./extraction-config')
      expect(SimilarityConfig).toHaveProperty('thresholdMin')
      expect(SimilarityConfig).toHaveProperty('thresholdGreen')
      expect(SimilarityConfig).toHaveProperty('maxResults')
    })

    it('SimilarityConfig values match individual exports', async () => {
      const config = await import('./extraction-config')
      expect(config.SimilarityConfig.thresholdMin).toBe(config.SIMILARITY_THRESHOLD_MIN)
      expect(config.SimilarityConfig.thresholdGreen).toBe(config.SIMILARITY_THRESHOLD_GREEN)
      expect(config.SimilarityConfig.maxResults).toBe(config.SIMILARITY_MAX_RESULTS)
    })

    it('QualityConfig has all required fields', async () => {
      const { QualityConfig } = await import('./extraction-config')
      expect(QualityConfig).toHaveProperty('minClauses')
      expect(QualityConfig).toHaveProperty('maxAvgLength')
      expect(QualityConfig).toHaveProperty('maxMegaClauseRate')
    })

    it('QualityConfig values match individual exports', async () => {
      const config = await import('./extraction-config')
      expect(config.QualityConfig.minClauses).toBe(config.QUALITY_MIN_CLAUSES)
      expect(config.QualityConfig.maxAvgLength).toBe(config.QUALITY_MAX_AVG_LENGTH)
      expect(config.QualityConfig.maxMegaClauseRate).toBe(config.QUALITY_MAX_MEGA_CLAUSE_RATE)
    })
  })
})
