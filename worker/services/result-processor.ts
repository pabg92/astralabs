/**
 * Result Processor Service
 *
 * Handles post-GPT processing for P1 reconciliation:
 * - Identity term result processing
 * - Clause update grouping and batch preparation
 * - Side effects (review queue, discrepancies)
 * - Missing term detection and handling
 *
 * @module services/result-processor
 */

import type {
  PreAgreedTerm,
  ClauseBoundary,
  ClauseMatchResult,
  BatchComparison,
  BatchResult,
  IdentityTermResult,
  RAGStatus,
} from '../types/p1-types'

import {
  createIdentityMatchResult,
  createMissingTermResult,
  batchUpdateMatchResults,
  createDiscrepancy,
  insertReviewQueueItem,
  type BatchUpdateItem,
} from '../adapters/database-adapter'

import {
  calculateTermRAG,
  calculateClauseRAG,
  calculateFinalRAG,
  calculateReviewPriority,
  needsReview,
} from './rag-calculator'

// ============ TYPES ============

export interface ClauseUpdate {
  matchResult: ClauseMatchResult
  clause: ClauseBoundary
  patComparisons: PATComparisonRecord[]
}

export interface PATComparisonRecord {
  term_id: string
  term_category: string
  is_mandatory: boolean
  match_metadata: {
    clause_type_match: boolean
    match_reason: string
    semantic_score: number
    candidates_considered: number
  }
  comparison_result: {
    matches: boolean
    deviation_severity: string
    explanation: string
    key_differences: string[]
    confidence: number
  }
  rag_parsing: RAGStatus
}

export interface ProcessedClause {
  matchResult: ClauseMatchResult
  clause: ClauseBoundary
  patComparisons: PATComparisonRecord[]
  rag_parsing: RAGStatus
  rag_status: RAGStatus
}

export interface IdentityProcessingResult {
  updatedCount: number
  discrepanciesCreated: number
  matchedTermIds: Set<string>
}

export interface SemanticProcessingResult {
  updatedCount: number
  discrepanciesCreated: number
}

// ============ IDENTITY TERM PROCESSING ============

/**
 * Process identity term results and persist to database
 */
export async function processIdentityResults(
  supabase: any,
  documentId: string,
  identityResults: Map<string, IdentityTermResult>
): Promise<IdentityProcessingResult> {
  const matchedTermIds = new Set<string>()
  let updatedCount = 0
  let discrepanciesCreated = 0

  for (const [termId, identityResult] of identityResults) {
    // Track matched identity terms
    if (identityResult.matchResult.matches) {
      matchedTermIds.add(termId)
    }

    // Create virtual match result
    const virtualMatch = await createIdentityMatchResult(supabase, documentId, identityResult)
    if (!virtualMatch) continue

    updatedCount++

    // Create discrepancy for RED identity terms
    if (identityResult.ragParsing === 'red') {
      const created = await createDiscrepancy(supabase, {
        match_result_id: virtualMatch.id,
        document_id: documentId,
        discrepancy_type: identityResult.matchResult.matchType === 'absent' ? 'missing' : 'conflicting',
        severity: identityResult.isMandatory ? 'critical' : 'error',
        description: identityResult.explanation,
        suggested_action: `Verify ${identityResult.termCategory}: expected "${identityResult.expectedValue}"`,
      })

      if (created) discrepanciesCreated++
    }

    console.log(`   📋 Identity: ${identityResult.termCategory} = ${identityResult.ragParsing.toUpperCase()} (${identityResult.matchResult.matchType})`)
  }

  return { updatedCount, discrepanciesCreated, matchedTermIds }
}

// ============ CLAUSE UPDATE GROUPING ============

/**
 * Group best matches by clause/matchResult for batch updating
 */
export function groupClauseUpdates(
  bestMatchByTerm: Map<string, { comparison: BatchComparison; result: BatchResult }>,
  matchResults: ClauseMatchResult[],
  clauses: ClauseBoundary[],
  termComparisonMap: Map<string, BatchComparison[]>
): Map<string, ClauseUpdate> {
  const clauseUpdates = new Map<string, ClauseUpdate>()

  for (const [termId, { comparison, result }] of bestMatchByTerm) {
    const matchResult = matchResults.find(m => m.id === comparison.matchResultId)
    const clause = clauses.find(c => c.id === comparison.clauseId)
    if (!matchResult || !clause) continue

    if (!clauseUpdates.has(comparison.matchResultId)) {
      clauseUpdates.set(comparison.matchResultId, {
        matchResult,
        clause,
        patComparisons: []
      })
    }

    const termRagParsing = calculateTermRAG(result)

    clauseUpdates.get(comparison.matchResultId)!.patComparisons.push({
      term_id: termId,
      term_category: comparison.termCategory,
      is_mandatory: comparison.isMandatory,
      match_metadata: {
        clause_type_match: comparison.matchReason === 'type_match',
        match_reason: comparison.matchReason,
        semantic_score: comparison.semanticScore,
        candidates_considered: termComparisonMap.get(termId)?.length || 1,
      },
      comparison_result: {
        matches: result.matches,
        deviation_severity: result.severity,
        explanation: result.explanation,
        key_differences: result.differences,
        confidence: result.confidence,
      },
      rag_parsing: termRagParsing,
    })
  }

  return clauseUpdates
}

// ============ BATCH UPDATE PREPARATION ============

/**
 * Prepare batch updates from clause updates
 */
export function prepareBatchUpdates(
  clauseUpdates: Map<string, ClauseUpdate>
): {
  batchUpdates: BatchUpdateItem[]
  processedClauses: ProcessedClause[]
} {
  const batchUpdates: BatchUpdateItem[] = []
  const processedClauses: ProcessedClause[] = []

  for (const [, { matchResult, clause, patComparisons }] of clauseUpdates) {
    const rag_parsing = calculateClauseRAG(patComparisons)
    const rag_risk = (matchResult.rag_risk || 'green') as RAGStatus
    const rag_status = calculateFinalRAG(rag_parsing, rag_risk)

    batchUpdates.push({
      id: matchResult.id,
      rag_parsing,
      rag_status,
      gpt_analysis: {
        ...(matchResult.gpt_analysis || {}),
        pre_agreed_comparisons: patComparisons,
        reconciliation_timestamp: new Date().toISOString(),
      },
      discrepancy_count: rag_status === 'red' ? 1 : 0,
    })

    processedClauses.push({ matchResult, clause, patComparisons, rag_parsing, rag_status })
  }

  return { batchUpdates, processedClauses }
}

// ============ SIDE EFFECTS PROCESSING ============

/**
 * Process side effects: review queue and discrepancies
 */
export async function processSideEffects(
  supabase: any,
  documentId: string,
  processedClauses: ProcessedClause[]
): Promise<number> {
  let discrepanciesCreated = 0

  for (const { matchResult, clause, patComparisons, rag_parsing, rag_status } of processedClauses) {
    // Flag low-confidence matches for review
    const similarityScore = matchResult.similarity_score || 0
    if (needsReview(similarityScore)) {
      await insertReviewQueueItem(supabase, {
        document_id: documentId,
        clause_boundary_id: clause.id,
        review_type: 'low_confidence',
        status: 'pending',
        priority: calculateReviewPriority(similarityScore),
        issue_description: `Low confidence match (${(similarityScore * 100).toFixed(1)}%) for ${clause.clause_type}`,
        original_text: clause.content,
        metadata: {
          clause_boundary_id: clause.id,
          match_result_id: matchResult.id,
          similarity_score: similarityScore,
          clause_type: clause.clause_type,
          matched_clause_id: matchResult.matched_template_id,
        },
      })
    }

    // Create discrepancy if RED
    if (rag_status === 'red' || rag_parsing === 'red') {
      const redComparisons = patComparisons.filter(c => c.rag_parsing === 'red')
      const description = redComparisons.length > 0
        ? `Conflicts with: ${redComparisons[0].term_category}`
        : `Deviates from library`

      const created = await createDiscrepancy(supabase, {
        match_result_id: matchResult.id,
        document_id: documentId,
        discrepancy_type: rag_parsing === 'red' ? 'conflicting' : 'modified',
        severity: rag_parsing === 'red' ? 'critical' : 'error',
        description,
        affected_text: clause.content.substring(0, 200),
        suggested_action: redComparisons.length > 0
          ? `Review: ${redComparisons[0].comparison_result.explanation}`
          : 'Review against library',
      })

      if (created) discrepanciesCreated++
    }
  }

  return discrepanciesCreated
}

// ============ MISSING TERMS PROCESSING ============

/**
 * Find and process missing mandatory terms
 */
export async function processMissingTerms(
  supabase: any,
  documentId: string,
  preAgreedTerms: PreAgreedTerm[],
  matchedTermIds: Set<string>
): Promise<{ count: number; discrepanciesCreated: number }> {
  const missingTerms = preAgreedTerms.filter(
    term => term.is_mandatory && !matchedTermIds.has(term.id)
  )

  let discrepanciesCreated = 0

  for (const missingTerm of missingTerms) {
    console.log(`   ⚠️ Missing mandatory: ${missingTerm.term_category}`)

    const virtualMatch = await createMissingTermResult(supabase, documentId, missingTerm)
    if (!virtualMatch) continue

    const created = await createDiscrepancy(supabase, {
      match_result_id: virtualMatch.id,
      document_id: documentId,
      discrepancy_type: 'missing',
      severity: 'critical',
      description: `Missing: ${missingTerm.term_category}`,
      suggested_action: `Add: ${missingTerm.term_description}`,
    })

    if (created) discrepanciesCreated++
  }

  return { count: missingTerms.length, discrepanciesCreated }
}

/**
 * Get matched term IDs from existing match results
 */
export function getMatchedTermIdsFromResults(matchResults: ClauseMatchResult[]): Set<string> {
  return new Set(
    matchResults
      .flatMap((r: any) => r.gpt_analysis?.pre_agreed_comparisons || [])
      .filter((c: any) => c.comparison_result?.matches)
      .map((c: any) => c.term_id)
  )
}

// ============ RESULT PROCESSOR CLASS ============

/**
 * ResultProcessor class for dependency injection
 */
export class ResultProcessor {
  async processIdentityResults(
    supabase: any,
    documentId: string,
    identityResults: Map<string, IdentityTermResult>
  ): Promise<IdentityProcessingResult> {
    return processIdentityResults(supabase, documentId, identityResults)
  }

  groupClauseUpdates(
    bestMatchByTerm: Map<string, { comparison: BatchComparison; result: BatchResult }>,
    matchResults: ClauseMatchResult[],
    clauses: ClauseBoundary[],
    termComparisonMap: Map<string, BatchComparison[]>
  ): Map<string, ClauseUpdate> {
    return groupClauseUpdates(bestMatchByTerm, matchResults, clauses, termComparisonMap)
  }

  prepareBatchUpdates(clauseUpdates: Map<string, ClauseUpdate>) {
    return prepareBatchUpdates(clauseUpdates)
  }

  async processSideEffects(
    supabase: any,
    documentId: string,
    processedClauses: ProcessedClause[]
  ): Promise<number> {
    return processSideEffects(supabase, documentId, processedClauses)
  }

  async processMissingTerms(
    supabase: any,
    documentId: string,
    preAgreedTerms: PreAgreedTerm[],
    matchedTermIds: Set<string>
  ) {
    return processMissingTerms(supabase, documentId, preAgreedTerms, matchedTermIds)
  }
}

// Default instance
export const resultProcessor = new ResultProcessor()
