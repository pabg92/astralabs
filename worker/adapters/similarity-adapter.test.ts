import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SimilarityError,
  isRetryableSimilarityError,
  calculateRagRisk,
  determineMatchCategory,
  formatEmbeddingForPostgres,
  findSimilarClauses,
  prepareClauseMatchResult,
  batchSimilaritySearch,
  SimilarityAdapter,
  createSimilarityAdapter,
  AUTO_MERGE_THRESHOLD,
  REVIEW_REQUIRED_THRESHOLD,
  type SimilarityMatch,
  type SimilaritySearchResult,
} from './similarity-adapter'

// Mock Supabase client factory
const createMockSupabase = () => ({
  rpc: vi.fn(),
  from: vi.fn(() => ({
    upsert: vi.fn().mockResolvedValue({ error: null }),
  })),
})

describe('similarity-adapter', () => {
  describe('SimilarityError', () => {
    it('creates error with all properties', () => {
      const error = new SimilarityError('Test error', 'TEST_CODE', true)
      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_CODE')
      expect(error.retryable).toBe(true)
      expect(error.name).toBe('SimilarityError')
    })

    it('defaults retryable to false', () => {
      const error = new SimilarityError('Test', 'CODE')
      expect(error.retryable).toBe(false)
    })
  })

  describe('isRetryableSimilarityError', () => {
    it('returns true for connection errors', () => {
      expect(isRetryableSimilarityError(new Error('connection refused'))).toBe(true)
      expect(isRetryableSimilarityError(new Error('ETIMEDOUT'))).toBe(true)
    })

    it('returns true for rate limit errors', () => {
      expect(isRetryableSimilarityError(new Error('rate limit exceeded'))).toBe(true)
      expect(isRetryableSimilarityError(new Error('too many requests'))).toBe(true)
    })

    it('returns true for SimilarityError with retryable flag', () => {
      const error = new SimilarityError('Test', 'CODE', true)
      expect(isRetryableSimilarityError(error)).toBe(true)
    })

    it('returns false for non-retryable errors', () => {
      expect(isRetryableSimilarityError(new Error('Invalid query'))).toBe(false)
    })

    it('returns false for SimilarityError with retryable=false', () => {
      const error = new SimilarityError('Test', 'CODE', false)
      expect(isRetryableSimilarityError(error)).toBe(false)
    })
  })

  describe('calculateRagRisk', () => {
    it('returns green for similarity >= 0.75', () => {
      expect(calculateRagRisk(0.75)).toBe('green')
      expect(calculateRagRisk(0.80)).toBe('green')
      expect(calculateRagRisk(1.0)).toBe('green')
    })

    it('returns amber for similarity >= 0.60 and < 0.75', () => {
      expect(calculateRagRisk(0.60)).toBe('amber')
      expect(calculateRagRisk(0.70)).toBe('amber')
      expect(calculateRagRisk(0.749)).toBe('amber')
    })

    it('returns red for similarity < 0.60', () => {
      expect(calculateRagRisk(0.59)).toBe('red')
      expect(calculateRagRisk(0.30)).toBe('red')
      expect(calculateRagRisk(0)).toBe('red')
    })

    it('returns red for null similarity', () => {
      expect(calculateRagRisk(null)).toBe('red')
    })

    it('uses custom thresholds', () => {
      expect(calculateRagRisk(0.80, 0.85, 0.70)).toBe('amber')
      expect(calculateRagRisk(0.90, 0.85, 0.70)).toBe('green')
      expect(calculateRagRisk(0.65, 0.85, 0.70)).toBe('red')
    })
  })

  describe('determineMatchCategory', () => {
    it('returns auto_merge for >= 0.92', () => {
      expect(determineMatchCategory(0.92)).toBe('auto_merge')
      expect(determineMatchCategory(0.95)).toBe('auto_merge')
      expect(determineMatchCategory(1.0)).toBe('auto_merge')
    })

    it('returns review_required for >= 0.85 and < 0.92', () => {
      expect(determineMatchCategory(0.85)).toBe('review_required')
      expect(determineMatchCategory(0.88)).toBe('review_required')
      expect(determineMatchCategory(0.919)).toBe('review_required')
    })

    it('returns unique for < 0.85', () => {
      expect(determineMatchCategory(0.84)).toBe('unique')
      expect(determineMatchCategory(0.60)).toBe('unique')
      expect(determineMatchCategory(0)).toBe('unique')
    })
  })

  describe('formatEmbeddingForPostgres', () => {
    it('formats embedding array as vector string', () => {
      expect(formatEmbeddingForPostgres([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]')
    })

    it('handles empty array', () => {
      expect(formatEmbeddingForPostgres([])).toBe('[]')
    })

    it('handles single element', () => {
      expect(formatEmbeddingForPostgres([0.5])).toBe('[0.5]')
    })

    it('handles negative numbers', () => {
      expect(formatEmbeddingForPostgres([-0.1, 0.2, -0.3])).toBe('[-0.1,0.2,-0.3]')
    })

    it('handles large arrays', () => {
      const largeArray = Array(1024).fill(0.1)
      const result = formatEmbeddingForPostgres(largeArray)
      expect(result.startsWith('[')).toBe(true)
      expect(result.endsWith(']')).toBe(true)
      expect(result.split(',').length).toBe(1024)
    })
  })

  describe('findSimilarClauses', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>

    beforeEach(() => {
      mockSupabase = createMockSupabase()
    })

    it('calls RPC with correct parameters', async () => {
      const mockMatches: SimilarityMatch[] = [
        {
          id: 'uuid-1',
          clause_id: 'LCL-001a',
          standard_text: 'Test clause',
          clause_type: 'payment_terms',
          category: 'Financial',
          risk_level: 'low',
          similarity: 0.85,
          match_category: 'review_required',
        },
      ]
      mockSupabase.rpc.mockResolvedValueOnce({ data: mockMatches, error: null })

      const embedding = [0.1, 0.2, 0.3]
      const result = await findSimilarClauses(mockSupabase as any, embedding)

      expect(mockSupabase.rpc).toHaveBeenCalledWith('find_similar_clauses_v2', {
        p_query_embedding: '[0.1,0.2,0.3]',
        p_similarity_threshold: 0.60,
        p_max_results: 10,
        p_tenant_id: null,
        p_clause_type: null,
      })
      expect(result.hasMatches).toBe(true)
      expect(result.topMatch).toEqual(mockMatches[0])
    })

    it('returns sorted matches by similarity', async () => {
      const mockMatches = [
        { id: '1', clause_id: 'LCL-001', similarity: 0.70, match_category: 'unique' },
        { id: '2', clause_id: 'LCL-002', similarity: 0.90, match_category: 'review_required' },
        { id: '3', clause_id: 'LCL-003', similarity: 0.80, match_category: 'unique' },
      ]
      mockSupabase.rpc.mockResolvedValueOnce({ data: mockMatches, error: null })

      const result = await findSimilarClauses(mockSupabase as any, [0.1])

      expect(result.matches[0].similarity).toBe(0.90)
      expect(result.matches[1].similarity).toBe(0.80)
      expect(result.matches[2].similarity).toBe(0.70)
      expect(result.topMatch?.clause_id).toBe('LCL-002')
    })

    it('returns amber RAG risk when no matches (matches Edge Function)', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: [], error: null })

      const result = await findSimilarClauses(mockSupabase as any, [0.1])

      expect(result.hasMatches).toBe(false)
      expect(result.topMatch).toBeNull()
      expect(result.ragRisk).toBe('amber') // Edge Function returns amber for no matches
    })

    it('returns null matches array as no matches', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null })

      const result = await findSimilarClauses(mockSupabase as any, [0.1])

      expect(result.hasMatches).toBe(false)
      expect(result.ragRisk).toBe('amber')
    })

    it('calculates correct RAG risk based on top match', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ id: '1', similarity: 0.80, match_category: 'unique' }],
        error: null,
      })

      const result = await findSimilarClauses(mockSupabase as any, [0.1])

      expect(result.ragRisk).toBe('green')
    })

    it('throws SimilarityError on RPC failure', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      })

      await expect(findSimilarClauses(mockSupabase as any, [0.1]))
        .rejects.toThrow('Similarity search failed')
    })

    it('uses custom config parameters', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: [], error: null })

      await findSimilarClauses(mockSupabase as any, [0.1], {
        thresholdMin: 0.70,
        maxResults: 5,
        tenantId: 'tenant-123',
        clauseType: 'exclusivity',
      })

      expect(mockSupabase.rpc).toHaveBeenCalledWith('find_similar_clauses_v2', {
        p_query_embedding: '[0.1]',
        p_similarity_threshold: 0.70,
        p_max_results: 5,
        p_tenant_id: 'tenant-123',
        p_clause_type: 'exclusivity',
      })
    })
  })

  describe('prepareClauseMatchResult', () => {
    it('prepares result with top match', () => {
      const searchResult: SimilaritySearchResult = {
        matches: [
          {
            id: '1',
            clause_id: 'LCL-001',
            standard_text: 'Test clause',
            clause_type: 'payment_terms',
            category: 'Financial',
            risk_level: 'low',
            similarity: 0.85,
            match_category: 'review_required',
          },
          {
            id: '2',
            clause_id: 'LCL-002',
            standard_text: 'Another clause',
            clause_type: 'payment_terms',
            category: 'Financial',
            risk_level: 'medium',
            similarity: 0.75,
            match_category: 'unique',
          },
        ],
        topMatch: {
          id: '1',
          clause_id: 'LCL-001',
          standard_text: 'Test clause',
          clause_type: 'payment_terms',
          category: 'Financial',
          risk_level: 'low',
          similarity: 0.85,
          match_category: 'review_required',
        },
        ragRisk: 'green',
        hasMatches: true,
      }

      const result = prepareClauseMatchResult('boundary-123', searchResult, 'doc-456')

      expect(result.clause_boundary_id).toBe('boundary-123')
      expect(result.document_id).toBe('doc-456')
      expect(result.matched_template_id).toBe('1')
      expect(result.similarity_score).toBe(0.85)
      expect(result.rag_risk).toBe('green')
      expect(result.rag_status).toBe('green')
      expect(result.gpt_analysis.top_match?.clause_id).toBe('LCL-001')
      expect(result.gpt_analysis.all_matches).toHaveLength(2)
    })

    it('prepares result with no matches', () => {
      const searchResult: SimilaritySearchResult = {
        matches: [],
        topMatch: null,
        ragRisk: 'amber',
        hasMatches: false,
      }

      const result = prepareClauseMatchResult('boundary-123', searchResult)

      expect(result.matched_template_id).toBeNull()
      expect(result.similarity_score).toBe(0)
      expect(result.rag_risk).toBe('amber')
      expect(result.gpt_analysis.no_library_match).toBe(true)
      expect(result.gpt_analysis.reason).toContain('No similar clauses found')
    })

    it('limits all_matches to 5 entries', () => {
      const matches: SimilarityMatch[] = Array(10).fill(null).map((_, i) => ({
        id: String(i),
        clause_id: `LCL-00${i}`,
        standard_text: `Clause ${i}`,
        clause_type: 'payment_terms',
        category: 'Financial',
        risk_level: 'low',
        similarity: 0.90 - i * 0.02,
        match_category: 'review_required' as const,
      }))

      const searchResult: SimilaritySearchResult = {
        matches,
        topMatch: matches[0],
        ragRisk: 'green',
        hasMatches: true,
      }

      const result = prepareClauseMatchResult('boundary-123', searchResult)

      expect(result.gpt_analysis.all_matches).toHaveLength(5)
    })

    it('includes embedding model in gpt_analysis', () => {
      const searchResult: SimilaritySearchResult = {
        matches: [],
        topMatch: null,
        ragRisk: 'amber',
        hasMatches: false,
      }

      const result = prepareClauseMatchResult(
        'boundary-123',
        searchResult,
        undefined,
        'custom-model'
      )

      expect(result.gpt_analysis.embedding_source).toBe('custom-model')
    })
  })

  describe('batchSimilaritySearch', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>

    beforeEach(() => {
      mockSupabase = createMockSupabase()
    })

    it('processes multiple items', async () => {
      mockSupabase.rpc
        .mockResolvedValueOnce({
          data: [{
            id: '1',
            clause_id: 'LCL-001',
            similarity: 0.85,
            match_category: 'review_required',
          }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{
            id: '2',
            clause_id: 'LCL-002',
            similarity: 0.75,
            match_category: 'unique',
          }],
          error: null,
        })

      const items = [
        { clauseBoundaryId: 'b1', embedding: [0.1] },
        { clauseBoundaryId: 'b2', embedding: [0.2] },
      ]

      const results = await batchSimilaritySearch(mockSupabase as any, items)

      expect(results).toHaveLength(2)
      expect(results[0].clauseBoundaryId).toBe('b1')
      expect(results[1].clauseBoundaryId).toBe('b2')
    })

    it('calls progress callback', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: [], error: null })

      const onProgress = vi.fn()
      const items = [
        { clauseBoundaryId: 'b1', embedding: [0.1] },
        { clauseBoundaryId: 'b2', embedding: [0.2] },
      ]

      await batchSimilaritySearch(mockSupabase as any, items, {}, onProgress)

      expect(onProgress).toHaveBeenCalledTimes(3) // 2 items + final
      expect(onProgress).toHaveBeenCalledWith({
        processed: 0,
        total: 2,
        currentClauseId: 'b1',
      })
      expect(onProgress).toHaveBeenCalledWith({
        processed: 2,
        total: 2,
        currentClauseId: '',
      })
    })

    it('includes document ID in match results', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: [{ id: '1', similarity: 0.85 }],
        error: null,
      })

      const items = [
        { clauseBoundaryId: 'b1', documentId: 'doc-123', embedding: [0.1] },
      ]

      const results = await batchSimilaritySearch(mockSupabase as any, items)

      expect(results[0].matchResult.document_id).toBe('doc-123')
    })
  })

  describe('SimilarityAdapter class', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>

    beforeEach(() => {
      mockSupabase = createMockSupabase()
    })

    it('can be instantiated', () => {
      const adapter = new SimilarityAdapter(mockSupabase as any)
      expect(adapter).toBeInstanceOf(SimilarityAdapter)
    })

    it('findSimilar delegates to function', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ id: '1', similarity: 0.85 }],
        error: null,
      })

      const adapter = new SimilarityAdapter(mockSupabase as any)
      const result = await adapter.findSimilar([0.1])

      expect(result.hasMatches).toBe(true)
    })

    it('calculateRagRisk uses configured thresholds', () => {
      const adapter = new SimilarityAdapter(mockSupabase as any, {
        thresholdGreen: 0.80,
        thresholdMin: 0.65,
      })

      expect(adapter.calculateRagRisk(0.75)).toBe('amber')
      expect(adapter.calculateRagRisk(0.85)).toBe('green')
      expect(adapter.calculateRagRisk(0.60)).toBe('red')
    })

    it('getThresholds returns configured values', () => {
      const adapter = new SimilarityAdapter(mockSupabase as any, {
        thresholdGreen: 0.80,
        thresholdMin: 0.65,
      })

      const thresholds = adapter.getThresholds()
      expect(thresholds.min).toBe(0.65)
      expect(thresholds.green).toBe(0.80)
    })

    it('prepareMatchResult uses configured embedding model', () => {
      const adapter = new SimilarityAdapter(mockSupabase as any, {
        embeddingModel: 'custom-model',
      })

      const searchResult: SimilaritySearchResult = {
        matches: [],
        topMatch: null,
        ragRisk: 'amber',
        hasMatches: false,
      }

      const result = adapter.prepareMatchResult('b1', searchResult)
      expect(result.gpt_analysis.embedding_source).toBe('custom-model')
    })
  })

  describe('createSimilarityAdapter', () => {
    it('creates adapter with supabase client', () => {
      const mockSupabase = createMockSupabase()
      const adapter = createSimilarityAdapter(mockSupabase as any)
      expect(adapter).toBeInstanceOf(SimilarityAdapter)
    })

    it('passes config to adapter', () => {
      const mockSupabase = createMockSupabase()
      const adapter = createSimilarityAdapter(mockSupabase as any, {
        thresholdGreen: 0.80,
      })
      expect(adapter.getThresholds().green).toBe(0.80)
    })
  })

  describe('constants', () => {
    it('exports correct thresholds', () => {
      expect(AUTO_MERGE_THRESHOLD).toBe(0.92)
      expect(REVIEW_REQUIRED_THRESHOLD).toBe(0.85)
    })
  })
})
