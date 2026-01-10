/**
 * Tests for Result Processor Service
 *
 * Tests post-GPT processing logic for P1 reconciliation:
 * - Clause update grouping
 * - Batch update preparation
 * - Matched term ID extraction
 * - Identity result processing (with mocked DB)
 * - Side effects processing (with mocked DB)
 * - Missing terms processing (with mocked DB)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  groupClauseUpdates,
  prepareBatchUpdates,
  getMatchedTermIdsFromResults,
  processIdentityResults,
  processSideEffects,
  processMissingTerms,
  ResultProcessor,
  type ClauseUpdate,
  type ProcessedClause,
  type PATComparisonRecord,
} from './result-processor'

import type {
  BatchComparison,
  BatchResult,
  ClauseBoundary,
  ClauseMatchResult,
  IdentityTermResult,
  PreAgreedTerm,
} from '../types/p1-types'

// ============ TEST FIXTURES ============

const createClause = (overrides: Partial<ClauseBoundary> = {}): ClauseBoundary => ({
  id: 'clause-1',
  document_id: 'doc-1',
  content: 'Test clause content about payment terms.',
  clause_type: 'payment_terms',
  start_position: 0,
  end_position: 100,
  confidence: 0.95,
  metadata: {},
  created_at: '2024-01-01',
  ...overrides,
})

const createMatchResult = (overrides: Partial<ClauseMatchResult> = {}): ClauseMatchResult => ({
  id: 'match-1',
  document_id: 'doc-1',
  clause_boundary_id: 'clause-1',
  matched_template_id: 'template-1',
  similarity_score: 0.9,
  rag_risk: 'green',
  rag_parsing: null,
  rag_status: null,
  gpt_analysis: null,
  discrepancy_count: 0,
  created_at: '2024-01-01',
  ...overrides,
})

const createBatchComparison = (overrides: Partial<BatchComparison> = {}): BatchComparison => ({
  idx: 0,
  clauseId: 'clause-1',
  matchResultId: 'match-1',
  termId: 'term-1',
  clauseType: 'payment_terms',
  termCategory: 'Payment Terms',
  isMandatory: true,
  clauseContent: 'Test clause content',
  termDescription: 'Payment within 30 days',
  expectedValue: '30 days',
  matchReason: 'type_match',
  semanticScore: 0.9,
  ...overrides,
})

const createBatchResult = (overrides: Partial<BatchResult> = {}): BatchResult => ({
  idx: 0,
  matches: true,
  severity: 'none',
  explanation: 'Clause matches the expected terms.',
  differences: [],
  confidence: 0.95,
  ...overrides,
})

const createIdentityTermResult = (overrides: Partial<IdentityTermResult> = {}): IdentityTermResult => ({
  termId: 'term-1',
  termCategory: 'Brand Name',
  isMandatory: true,
  expectedValue: 'Nike',
  matchResult: {
    matches: true,
    matchType: 'exact',
    confidence: 1.0,
    foundValue: 'Nike',
  },
  ragParsing: 'green',
  explanation: 'Brand Name "Nike" found exactly in contract.',
  ...overrides,
})

const createPreAgreedTerm = (overrides: Partial<PreAgreedTerm> = {}): PreAgreedTerm => ({
  id: 'term-1',
  deal_id: 'deal-1',
  term_category: 'Payment Terms',
  term_description: 'Payment within 30 days',
  expected_value: '30 days',
  is_mandatory: true,
  related_clause_types: ['payment_terms'],
  normalized_term_category: 'Payment Terms',
  normalized_at: null,
  created_at: '2024-01-01',
  ...overrides,
})

// ============ groupClauseUpdates TESTS ============

describe('groupClauseUpdates', () => {
  it('should group single term match correctly', () => {
    const clause = createClause()
    const matchResult = createMatchResult()
    const comparison = createBatchComparison()
    const result = createBatchResult()

    const bestMatchByTerm = new Map([
      ['term-1', { comparison, result }]
    ])
    const matchResults = [matchResult]
    const clauses = [clause]
    const termComparisonMap = new Map([['term-1', [comparison]]])

    const updates = groupClauseUpdates(bestMatchByTerm, matchResults, clauses, termComparisonMap)

    expect(updates.size).toBe(1)
    expect(updates.has('match-1')).toBe(true)

    const update = updates.get('match-1')!
    expect(update.matchResult.id).toBe('match-1')
    expect(update.clause.id).toBe('clause-1')
    expect(update.patComparisons.length).toBe(1)
    expect(update.patComparisons[0].term_id).toBe('term-1')
    expect(update.patComparisons[0].rag_parsing).toBe('green')
  })

  it('should group multiple terms to same clause', () => {
    const clause = createClause()
    const matchResult = createMatchResult()

    const comparison1 = createBatchComparison({ idx: 0, termId: 'term-1', termCategory: 'Payment Terms' })
    const comparison2 = createBatchComparison({ idx: 1, termId: 'term-2', termCategory: 'Payment Schedule' })

    const result1 = createBatchResult({ idx: 0, matches: true, severity: 'none' })
    const result2 = createBatchResult({ idx: 1, matches: true, severity: 'minor' })

    const bestMatchByTerm = new Map([
      ['term-1', { comparison: comparison1, result: result1 }],
      ['term-2', { comparison: comparison2, result: result2 }],
    ])
    const matchResults = [matchResult]
    const clauses = [clause]
    const termComparisonMap = new Map([
      ['term-1', [comparison1]],
      ['term-2', [comparison2]],
    ])

    const updates = groupClauseUpdates(bestMatchByTerm, matchResults, clauses, termComparisonMap)

    expect(updates.size).toBe(1)
    const update = updates.get('match-1')!
    expect(update.patComparisons.length).toBe(2)
    expect(update.patComparisons[0].rag_parsing).toBe('green')
    expect(update.patComparisons[1].rag_parsing).toBe('amber')
  })

  it('should group terms to different clauses', () => {
    const clause1 = createClause({ id: 'clause-1' })
    const clause2 = createClause({ id: 'clause-2', clause_type: 'exclusivity' })
    const matchResult1 = createMatchResult({ id: 'match-1', clause_boundary_id: 'clause-1' })
    const matchResult2 = createMatchResult({ id: 'match-2', clause_boundary_id: 'clause-2' })

    const comparison1 = createBatchComparison({ idx: 0, termId: 'term-1', matchResultId: 'match-1', clauseId: 'clause-1' })
    const comparison2 = createBatchComparison({ idx: 1, termId: 'term-2', matchResultId: 'match-2', clauseId: 'clause-2' })

    const result1 = createBatchResult({ idx: 0 })
    const result2 = createBatchResult({ idx: 1 })

    const bestMatchByTerm = new Map([
      ['term-1', { comparison: comparison1, result: result1 }],
      ['term-2', { comparison: comparison2, result: result2 }],
    ])
    const matchResults = [matchResult1, matchResult2]
    const clauses = [clause1, clause2]
    const termComparisonMap = new Map([
      ['term-1', [comparison1]],
      ['term-2', [comparison2]],
    ])

    const updates = groupClauseUpdates(bestMatchByTerm, matchResults, clauses, termComparisonMap)

    expect(updates.size).toBe(2)
    expect(updates.has('match-1')).toBe(true)
    expect(updates.has('match-2')).toBe(true)
  })

  it('should skip if matchResult not found', () => {
    const clause = createClause()
    const comparison = createBatchComparison({ matchResultId: 'non-existent' })
    const result = createBatchResult()

    const bestMatchByTerm = new Map([['term-1', { comparison, result }]])
    const matchResults: ClauseMatchResult[] = []
    const clauses = [clause]
    const termComparisonMap = new Map([['term-1', [comparison]]])

    const updates = groupClauseUpdates(bestMatchByTerm, matchResults, clauses, termComparisonMap)

    expect(updates.size).toBe(0)
  })

  it('should skip if clause not found', () => {
    const matchResult = createMatchResult()
    const comparison = createBatchComparison({ clauseId: 'non-existent' })
    const result = createBatchResult()

    const bestMatchByTerm = new Map([['term-1', { comparison, result }]])
    const matchResults = [matchResult]
    const clauses: ClauseBoundary[] = []
    const termComparisonMap = new Map([['term-1', [comparison]]])

    const updates = groupClauseUpdates(bestMatchByTerm, matchResults, clauses, termComparisonMap)

    expect(updates.size).toBe(0)
  })

  it('should calculate correct RAG for non-matching result', () => {
    const clause = createClause()
    const matchResult = createMatchResult()
    const comparison = createBatchComparison()
    const result = createBatchResult({ matches: false, severity: 'major' })

    const bestMatchByTerm = new Map([['term-1', { comparison, result }]])
    const matchResults = [matchResult]
    const clauses = [clause]
    const termComparisonMap = new Map([['term-1', [comparison]]])

    const updates = groupClauseUpdates(bestMatchByTerm, matchResults, clauses, termComparisonMap)

    const update = updates.get('match-1')!
    expect(update.patComparisons[0].rag_parsing).toBe('red')
  })

  it('should record match metadata correctly', () => {
    const clause = createClause()
    const matchResult = createMatchResult()
    const comparison = createBatchComparison({
      matchReason: 'fallback_match',
      semanticScore: 0.75,
    })
    const result = createBatchResult()

    const bestMatchByTerm = new Map([['term-1', { comparison, result }]])
    const matchResults = [matchResult]
    const clauses = [clause]
    const termComparisonMap = new Map([['term-1', [comparison, createBatchComparison({ idx: 1 })]]])

    const updates = groupClauseUpdates(bestMatchByTerm, matchResults, clauses, termComparisonMap)

    const update = updates.get('match-1')!
    expect(update.patComparisons[0].match_metadata).toEqual({
      clause_type_match: false,
      match_reason: 'fallback_match',
      semantic_score: 0.75,
      candidates_considered: 2,
    })
  })
})

// ============ prepareBatchUpdates TESTS ============

describe('prepareBatchUpdates', () => {
  const createClauseUpdate = (overrides: Partial<ClauseUpdate> = {}): ClauseUpdate => ({
    matchResult: createMatchResult(),
    clause: createClause(),
    patComparisons: [{
      term_id: 'term-1',
      term_category: 'Payment Terms',
      is_mandatory: true,
      match_metadata: {
        clause_type_match: true,
        match_reason: 'type_match',
        semantic_score: 0.9,
        candidates_considered: 1,
      },
      comparison_result: {
        matches: true,
        deviation_severity: 'none',
        explanation: 'Matches',
        key_differences: [],
        confidence: 0.95,
      },
      rag_parsing: 'green',
    }],
    ...overrides,
  })

  it('should prepare batch update with GREEN status', () => {
    const clauseUpdates = new Map([['match-1', createClauseUpdate()]])

    const { batchUpdates, processedClauses } = prepareBatchUpdates(clauseUpdates)

    expect(batchUpdates.length).toBe(1)
    expect(batchUpdates[0].id).toBe('match-1')
    expect(batchUpdates[0].rag_parsing).toBe('green')
    expect(batchUpdates[0].rag_status).toBe('green')
    expect(batchUpdates[0].discrepancy_count).toBe(0)

    expect(processedClauses.length).toBe(1)
    expect(processedClauses[0].rag_parsing).toBe('green')
    expect(processedClauses[0].rag_status).toBe('green')
  })

  it('should prepare batch update with RED status for mandatory failure', () => {
    const clauseUpdate = createClauseUpdate({
      patComparisons: [{
        term_id: 'term-1',
        term_category: 'Payment Terms',
        is_mandatory: true,
        match_metadata: {
          clause_type_match: true,
          match_reason: 'type_match',
          semantic_score: 0.9,
          candidates_considered: 1,
        },
        comparison_result: {
          matches: false,
          deviation_severity: 'major',
          explanation: 'Does not match',
          key_differences: ['Payment period differs'],
          confidence: 0.9,
        },
        rag_parsing: 'red',
      }],
    })
    const clauseUpdates = new Map([['match-1', clauseUpdate]])

    const { batchUpdates, processedClauses } = prepareBatchUpdates(clauseUpdates)

    expect(batchUpdates[0].rag_parsing).toBe('red')
    expect(batchUpdates[0].rag_status).toBe('red')
    expect(batchUpdates[0].discrepancy_count).toBe(1)

    expect(processedClauses[0].rag_parsing).toBe('red')
    expect(processedClauses[0].rag_status).toBe('red')
  })

  it('should combine rag_parsing with rag_risk for final status', () => {
    const clauseUpdate = createClauseUpdate({
      matchResult: createMatchResult({ rag_risk: 'red' }),
    })
    const clauseUpdates = new Map([['match-1', clauseUpdate]])

    const { batchUpdates } = prepareBatchUpdates(clauseUpdates)

    // rag_parsing is green, rag_risk is red → final is red
    expect(batchUpdates[0].rag_parsing).toBe('green')
    expect(batchUpdates[0].rag_status).toBe('red')
    expect(batchUpdates[0].discrepancy_count).toBe(1)
  })

  it('should include reconciliation timestamp in gpt_analysis', () => {
    const clauseUpdates = new Map([['match-1', createClauseUpdate()]])

    const { batchUpdates } = prepareBatchUpdates(clauseUpdates)

    expect(batchUpdates[0].gpt_analysis).toBeDefined()
    expect(batchUpdates[0].gpt_analysis.pre_agreed_comparisons).toBeDefined()
    expect(batchUpdates[0].gpt_analysis.reconciliation_timestamp).toBeDefined()
  })

  it('should preserve existing gpt_analysis fields', () => {
    const clauseUpdate = createClauseUpdate({
      matchResult: createMatchResult({
        gpt_analysis: { existing_field: 'value', clause_summary: 'Summary' },
      }),
    })
    const clauseUpdates = new Map([['match-1', clauseUpdate]])

    const { batchUpdates } = prepareBatchUpdates(clauseUpdates)

    expect(batchUpdates[0].gpt_analysis.existing_field).toBe('value')
    expect(batchUpdates[0].gpt_analysis.clause_summary).toBe('Summary')
    expect(batchUpdates[0].gpt_analysis.pre_agreed_comparisons).toBeDefined()
  })

  it('should handle empty clauseUpdates', () => {
    const clauseUpdates = new Map<string, ClauseUpdate>()

    const { batchUpdates, processedClauses } = prepareBatchUpdates(clauseUpdates)

    expect(batchUpdates.length).toBe(0)
    expect(processedClauses.length).toBe(0)
  })

  it('should calculate AMBER for non-mandatory RED', () => {
    const clauseUpdate = createClauseUpdate({
      patComparisons: [{
        term_id: 'term-1',
        term_category: 'Optional Feature',
        is_mandatory: false,
        match_metadata: {
          clause_type_match: true,
          match_reason: 'type_match',
          semantic_score: 0.9,
          candidates_considered: 1,
        },
        comparison_result: {
          matches: false,
          deviation_severity: 'major',
          explanation: 'Does not match',
          key_differences: [],
          confidence: 0.9,
        },
        rag_parsing: 'red',
      }],
    })
    const clauseUpdates = new Map([['match-1', clauseUpdate]])

    const { batchUpdates } = prepareBatchUpdates(clauseUpdates)

    // Non-mandatory RED → AMBER at clause level
    expect(batchUpdates[0].rag_parsing).toBe('amber')
    expect(batchUpdates[0].rag_status).toBe('amber')
    expect(batchUpdates[0].discrepancy_count).toBe(0)
  })
})

// ============ getMatchedTermIdsFromResults TESTS ============

describe('getMatchedTermIdsFromResults', () => {
  it('should extract matched term IDs from match results', () => {
    const matchResults: ClauseMatchResult[] = [
      createMatchResult({
        gpt_analysis: {
          pre_agreed_comparisons: [
            { term_id: 'term-1', comparison_result: { matches: true } },
            { term_id: 'term-2', comparison_result: { matches: false } },
          ],
        },
      }),
    ]

    const matchedIds = getMatchedTermIdsFromResults(matchResults)

    expect(matchedIds.size).toBe(1)
    expect(matchedIds.has('term-1')).toBe(true)
    expect(matchedIds.has('term-2')).toBe(false)
  })

  it('should handle multiple match results', () => {
    const matchResults: ClauseMatchResult[] = [
      createMatchResult({
        id: 'match-1',
        gpt_analysis: {
          pre_agreed_comparisons: [
            { term_id: 'term-1', comparison_result: { matches: true } },
          ],
        },
      }),
      createMatchResult({
        id: 'match-2',
        gpt_analysis: {
          pre_agreed_comparisons: [
            { term_id: 'term-2', comparison_result: { matches: true } },
            { term_id: 'term-3', comparison_result: { matches: true } },
          ],
        },
      }),
    ]

    const matchedIds = getMatchedTermIdsFromResults(matchResults)

    expect(matchedIds.size).toBe(3)
    expect(matchedIds.has('term-1')).toBe(true)
    expect(matchedIds.has('term-2')).toBe(true)
    expect(matchedIds.has('term-3')).toBe(true)
  })

  it('should handle empty match results', () => {
    const matchedIds = getMatchedTermIdsFromResults([])

    expect(matchedIds.size).toBe(0)
  })

  it('should handle match results without gpt_analysis', () => {
    const matchResults: ClauseMatchResult[] = [
      createMatchResult({ gpt_analysis: null }),
    ]

    const matchedIds = getMatchedTermIdsFromResults(matchResults)

    expect(matchedIds.size).toBe(0)
  })

  it('should handle match results with empty pre_agreed_comparisons', () => {
    const matchResults: ClauseMatchResult[] = [
      createMatchResult({
        gpt_analysis: { pre_agreed_comparisons: [] },
      }),
    ]

    const matchedIds = getMatchedTermIdsFromResults(matchResults)

    expect(matchedIds.size).toBe(0)
  })

  it('should deduplicate term IDs across match results', () => {
    const matchResults: ClauseMatchResult[] = [
      createMatchResult({
        id: 'match-1',
        gpt_analysis: {
          pre_agreed_comparisons: [
            { term_id: 'term-1', comparison_result: { matches: true } },
          ],
        },
      }),
      createMatchResult({
        id: 'match-2',
        gpt_analysis: {
          pre_agreed_comparisons: [
            { term_id: 'term-1', comparison_result: { matches: true } },
          ],
        },
      }),
    ]

    const matchedIds = getMatchedTermIdsFromResults(matchResults)

    expect(matchedIds.size).toBe(1)
    expect(matchedIds.has('term-1')).toBe(true)
  })
})

// ============ processIdentityResults TESTS (with mocks) ============

describe('processIdentityResults', () => {
  const createMockSupabase = (insertReturnValue: any = { id: 'virtual-match-1' }) => ({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: insertReturnValue, error: null }),
        }),
      }),
    }),
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should track matched identity terms', async () => {
    const mockSupabase = createMockSupabase()

    const identityResults = new Map([
      ['term-1', createIdentityTermResult({ matchResult: { matches: true, matchType: 'exact', confidence: 1.0 } })],
      ['term-2', createIdentityTermResult({ termId: 'term-2', matchResult: { matches: false, matchType: 'absent', confidence: 0 }, ragParsing: 'red' })],
    ])

    const result = await processIdentityResults(mockSupabase, 'doc-1', identityResults)

    expect(result.matchedTermIds.has('term-1')).toBe(true)
    expect(result.matchedTermIds.has('term-2')).toBe(false)
  })

  it('should count updated identity results', async () => {
    const mockSupabase = createMockSupabase()

    const identityResults = new Map([
      ['term-1', createIdentityTermResult()],
      ['term-2', createIdentityTermResult({ termId: 'term-2' })],
    ])

    const result = await processIdentityResults(mockSupabase, 'doc-1', identityResults)

    expect(result.updatedCount).toBe(2)
  })

  it('should create discrepancies for RED identity terms', async () => {
    const mockSupabase = createMockSupabase()

    const identityResults = new Map([
      ['term-1', createIdentityTermResult({
        ragParsing: 'red',
        matchResult: { matches: false, matchType: 'absent', confidence: 0 },
        isMandatory: true,
      })],
    ])

    const result = await processIdentityResults(mockSupabase, 'doc-1', identityResults)

    expect(result.discrepanciesCreated).toBe(1)
  })

  it('should not create discrepancies for GREEN identity terms', async () => {
    const mockSupabase = createMockSupabase()

    const identityResults = new Map([
      ['term-1', createIdentityTermResult({ ragParsing: 'green' })],
    ])

    const result = await processIdentityResults(mockSupabase, 'doc-1', identityResults)

    expect(result.discrepanciesCreated).toBe(0)
  })

  it('should handle empty identity results', async () => {
    const mockSupabase = createMockSupabase()

    const result = await processIdentityResults(mockSupabase, 'doc-1', new Map())

    expect(result.updatedCount).toBe(0)
    expect(result.discrepanciesCreated).toBe(0)
    expect(result.matchedTermIds.size).toBe(0)
  })

  it('should skip if createIdentityMatchResult returns null', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
          }),
        }),
      }),
    }

    const identityResults = new Map([
      ['term-1', createIdentityTermResult()],
    ])

    const result = await processIdentityResults(mockSupabase, 'doc-1', identityResults)

    expect(result.updatedCount).toBe(0)
  })
})

// ============ processMissingTerms TESTS (with mocks) ============

describe('processMissingTerms', () => {
  const createMockSupabase = (insertReturnValue: any = { id: 'virtual-match-1' }) => ({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: insertReturnValue, error: null }),
        }),
      }),
    }),
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should identify missing mandatory terms', async () => {
    const mockSupabase = createMockSupabase()

    const preAgreedTerms: PreAgreedTerm[] = [
      createPreAgreedTerm({ id: 'term-1', is_mandatory: true }),
      createPreAgreedTerm({ id: 'term-2', is_mandatory: true }),
      createPreAgreedTerm({ id: 'term-3', is_mandatory: false }),
    ]
    const matchedTermIds = new Set(['term-1'])

    const result = await processMissingTerms(mockSupabase, 'doc-1', preAgreedTerms, matchedTermIds)

    // term-2 is mandatory and not matched, term-3 is optional
    expect(result.count).toBe(1)
  })

  it('should not flag optional missing terms', async () => {
    const mockSupabase = createMockSupabase()

    const preAgreedTerms: PreAgreedTerm[] = [
      createPreAgreedTerm({ id: 'term-1', is_mandatory: false }),
      createPreAgreedTerm({ id: 'term-2', is_mandatory: false }),
    ]
    const matchedTermIds = new Set<string>()

    const result = await processMissingTerms(mockSupabase, 'doc-1', preAgreedTerms, matchedTermIds)

    expect(result.count).toBe(0)
  })

  it('should return zero when all mandatory terms are matched', async () => {
    const mockSupabase = createMockSupabase()

    const preAgreedTerms: PreAgreedTerm[] = [
      createPreAgreedTerm({ id: 'term-1', is_mandatory: true }),
      createPreAgreedTerm({ id: 'term-2', is_mandatory: true }),
    ]
    const matchedTermIds = new Set(['term-1', 'term-2'])

    const result = await processMissingTerms(mockSupabase, 'doc-1', preAgreedTerms, matchedTermIds)

    expect(result.count).toBe(0)
  })

  it('should create discrepancies for missing mandatory terms', async () => {
    const mockSupabase = createMockSupabase()

    const preAgreedTerms: PreAgreedTerm[] = [
      createPreAgreedTerm({ id: 'term-1', is_mandatory: true }),
      createPreAgreedTerm({ id: 'term-2', is_mandatory: true }),
    ]
    const matchedTermIds = new Set<string>()

    const result = await processMissingTerms(mockSupabase, 'doc-1', preAgreedTerms, matchedTermIds)

    expect(result.count).toBe(2)
    expect(result.discrepanciesCreated).toBe(2)
  })

  it('should handle mixed mandatory and optional terms', async () => {
    const mockSupabase = createMockSupabase()

    const preAgreedTerms: PreAgreedTerm[] = [
      createPreAgreedTerm({ id: 'term-1', is_mandatory: true }),
      createPreAgreedTerm({ id: 'term-2', is_mandatory: false }),
      createPreAgreedTerm({ id: 'term-3', is_mandatory: true }),
      createPreAgreedTerm({ id: 'term-4', is_mandatory: false }),
    ]
    const matchedTermIds = new Set(['term-1']) // Only first mandatory matched

    const result = await processMissingTerms(mockSupabase, 'doc-1', preAgreedTerms, matchedTermIds)

    // Only term-3 is missing (mandatory and not matched)
    expect(result.count).toBe(1)
    expect(result.discrepanciesCreated).toBe(1)
  })

  it('should skip discrepancy creation if virtualMatch fails', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
          }),
        }),
      }),
    }

    const preAgreedTerms: PreAgreedTerm[] = [
      createPreAgreedTerm({ id: 'term-1', is_mandatory: true }),
    ]
    const matchedTermIds = new Set<string>()

    const result = await processMissingTerms(mockSupabase, 'doc-1', preAgreedTerms, matchedTermIds)

    expect(result.count).toBe(1)
    expect(result.discrepanciesCreated).toBe(0)
  })

  it('should handle empty preAgreedTerms', async () => {
    const mockSupabase = createMockSupabase()

    const result = await processMissingTerms(mockSupabase, 'doc-1', [], new Set())

    expect(result.count).toBe(0)
    expect(result.discrepanciesCreated).toBe(0)
  })
})

// ============ ResultProcessor CLASS TESTS ============

describe('ResultProcessor class', () => {
  it('should instantiate with default configuration', () => {
    const processor = new ResultProcessor()
    expect(processor).toBeDefined()
  })

  it('should delegate groupClauseUpdates to standalone function', () => {
    const processor = new ResultProcessor()
    const clause = createClause()
    const matchResult = createMatchResult()
    const comparison = createBatchComparison()
    const result = createBatchResult()

    const bestMatchByTerm = new Map([['term-1', { comparison, result }]])
    const matchResults = [matchResult]
    const clauses = [clause]
    const termComparisonMap = new Map([['term-1', [comparison]]])

    const updates = processor.groupClauseUpdates(bestMatchByTerm, matchResults, clauses, termComparisonMap)

    expect(updates.size).toBe(1)
    expect(updates.has('match-1')).toBe(true)
  })

  it('should delegate prepareBatchUpdates to standalone function', () => {
    const processor = new ResultProcessor()
    const clauseUpdate: ClauseUpdate = {
      matchResult: createMatchResult(),
      clause: createClause(),
      patComparisons: [{
        term_id: 'term-1',
        term_category: 'Payment Terms',
        is_mandatory: true,
        match_metadata: {
          clause_type_match: true,
          match_reason: 'type_match',
          semantic_score: 0.9,
          candidates_considered: 1,
        },
        comparison_result: {
          matches: true,
          deviation_severity: 'none',
          explanation: 'Matches',
          key_differences: [],
          confidence: 0.95,
        },
        rag_parsing: 'green',
      }],
    }
    const clauseUpdates = new Map([['match-1', clauseUpdate]])

    const { batchUpdates, processedClauses } = processor.prepareBatchUpdates(clauseUpdates)

    expect(batchUpdates.length).toBe(1)
    expect(processedClauses.length).toBe(1)
  })
})

// ============ EDGE CASES ============

describe('Edge Cases', () => {
  describe('groupClauseUpdates edge cases', () => {
    it('should handle empty bestMatchByTerm', () => {
      const updates = groupClauseUpdates(
        new Map(),
        [createMatchResult()],
        [createClause()],
        new Map()
      )
      expect(updates.size).toBe(0)
    })

    it('should handle comparison with no candidates in termComparisonMap', () => {
      const clause = createClause()
      const matchResult = createMatchResult()
      const comparison = createBatchComparison()
      const result = createBatchResult()

      const bestMatchByTerm = new Map([['term-1', { comparison, result }]])
      const matchResults = [matchResult]
      const clauses = [clause]
      const termComparisonMap = new Map<string, BatchComparison[]>() // Empty map

      const updates = groupClauseUpdates(bestMatchByTerm, matchResults, clauses, termComparisonMap)

      const update = updates.get('match-1')!
      expect(update.patComparisons[0].match_metadata.candidates_considered).toBe(1)
    })
  })

  describe('prepareBatchUpdates edge cases', () => {
    it('should handle null rag_risk on matchResult', () => {
      const clauseUpdate: ClauseUpdate = {
        matchResult: createMatchResult({ rag_risk: null as any }),
        clause: createClause(),
        patComparisons: [{
          term_id: 'term-1',
          term_category: 'Payment Terms',
          is_mandatory: false,
          match_metadata: {
            clause_type_match: true,
            match_reason: 'type_match',
            semantic_score: 0.9,
            candidates_considered: 1,
          },
          comparison_result: {
            matches: true,
            deviation_severity: 'none',
            explanation: 'Matches',
            key_differences: [],
            confidence: 0.95,
          },
          rag_parsing: 'green',
        }],
      }
      const clauseUpdates = new Map([['match-1', clauseUpdate]])

      const { batchUpdates } = prepareBatchUpdates(clauseUpdates)

      // Should default rag_risk to 'green'
      expect(batchUpdates[0].rag_status).toBe('green')
    })

    it('should handle multiple PAT comparisons with mixed RAG', () => {
      const clauseUpdate: ClauseUpdate = {
        matchResult: createMatchResult(),
        clause: createClause(),
        patComparisons: [
          {
            term_id: 'term-1',
            term_category: 'Payment Terms',
            is_mandatory: false,
            match_metadata: { clause_type_match: true, match_reason: 'type_match', semantic_score: 0.9, candidates_considered: 1 },
            comparison_result: { matches: true, deviation_severity: 'none', explanation: 'Matches', key_differences: [], confidence: 0.95 },
            rag_parsing: 'green',
          },
          {
            term_id: 'term-2',
            term_category: 'Exclusivity',
            is_mandatory: false,
            match_metadata: { clause_type_match: true, match_reason: 'type_match', semantic_score: 0.85, candidates_considered: 1 },
            comparison_result: { matches: true, deviation_severity: 'minor', explanation: 'Minor diff', key_differences: ['Duration'], confidence: 0.8 },
            rag_parsing: 'amber',
          },
        ],
      }
      const clauseUpdates = new Map([['match-1', clauseUpdate]])

      const { batchUpdates } = prepareBatchUpdates(clauseUpdates)

      // GREEN + AMBER → AMBER at clause level
      expect(batchUpdates[0].rag_parsing).toBe('amber')
    })
  })

  describe('getMatchedTermIdsFromResults edge cases', () => {
    it('should handle malformed comparison_result', () => {
      const matchResults: ClauseMatchResult[] = [
        createMatchResult({
          gpt_analysis: {
            pre_agreed_comparisons: [
              { term_id: 'term-1', comparison_result: null },
              { term_id: 'term-2' }, // No comparison_result at all
            ],
          },
        }),
      ]

      const matchedIds = getMatchedTermIdsFromResults(matchResults)

      expect(matchedIds.size).toBe(0)
    })
  })
})
