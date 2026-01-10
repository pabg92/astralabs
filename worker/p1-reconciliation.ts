/**
 * P1 Reconciliation: Compare clauses against pre-agreed terms
 * OPTIMIZED: Uses batched GPT calls instead of sequential (5 min → ~15 sec)
 */

// ============ TYPES ============
import type {
  PreAgreedTerm,
  ClauseBoundary,
  ClauseMatchResult,
  ComparisonResult,
  BatchComparison,
  BatchResult,
  NormalizedTerm,
  ClauseCandidate,
  IdentityMatchResult,
  IdentityTermResult,
  P1ReconciliationResult,
  RAGStatus,
  MatchReason,
} from './types/p1-types'

// Re-export types for backward compatibility
export type { IdentityMatchResult, IdentityTermResult } from './types/p1-types'

// ============ CONFIGURATION ============
import {
  P1_MODEL,
  IDENTITY_TERM_CATEGORIES,
} from './config/p1-config'

// Re-export for backward compatibility
export { IDENTITY_TERM_CATEGORIES } from './config/p1-config'

// ============ IDENTITY MATCHER SERVICE ============
import {
  isIdentityTermCategory,
  normalizeForIdentityMatch,
  checkIdentityMatch,
  determineIdentityRag,
  generateIdentityExplanation,
} from './services/identity-matcher'

// Re-export identity functions for backward compatibility
export {
  isIdentityTermCategory,
  normalizeForIdentityMatch,
  checkIdentityMatch,
  determineIdentityRag,
  generateIdentityExplanation,
} from './services/identity-matcher'

// ============ GPT ADAPTER ============
import {
  normalizePatTerms,
  executeBatchComparison,
  callWithBackoff,
  calculateTimeout,
} from './adapters/gpt-adapter'

// Re-export GPT functions for backward compatibility
export {
  normalizePatTerms,
  executeBatchComparison,
  callWithBackoff,
  calculateTimeout,
} from './adapters/gpt-adapter'

// ============ DATABASE ADAPTER ============
import {
  fetchDocument,
  fetchPreAgreedTerms,
  fetchClauses,
  fetchMatchResults,
  createIdentityMatchResult,
  createMissingTermResult,
  batchUpdateMatchResults,
  createDiscrepancy,
  insertReviewQueueItem,
  type BatchUpdateItem,
} from './adapters/database-adapter'

// Re-export database types for backward compatibility
export type { DocumentMetadata, BatchUpdateItem, DiscrepancyInput, ReviewQueueInput } from './adapters/database-adapter'

// ============ CLAUSE SELECTOR SERVICE ============
import {
  keywordMatchClause,
  selectTopClausesForTerm,
  buildClauseIndex,
  ClauseSelector,
} from './services/clause-selector'

// Re-export clause selector functions for backward compatibility
export {
  keywordMatchClause,
  selectTopClausesForTerm,
  buildClauseIndex,
  ClauseSelector,
} from './services/clause-selector'

export type { ClauseIndex } from './services/clause-selector'

// ============ SEMANTIC MATCHER SERVICE ============
import {
  buildBatchComparisons,
  selectBestMatchPerTerm,
  isBetterMatch,
  calculateRagScore,
  SemanticMatcher,
} from './services/semantic-matcher'

// Re-export semantic matcher functions for backward compatibility
export {
  buildBatchComparisons,
  selectBestMatchPerTerm,
  isBetterMatch,
  calculateRagScore,
  SemanticMatcher,
} from './services/semantic-matcher'

export type { BatchComparisonResult, BestMatchResult } from './services/semantic-matcher'

// ============ RAG CALCULATOR SERVICE ============
import {
  calculateTermRAG,
  calculateClauseRAG,
  calculateFinalRAG,
  calculateReviewPriority,
  needsReview,
  RAGCalculator,
} from './services/rag-calculator'

// Re-export RAG calculator functions for backward compatibility
export {
  calculateTermRAG,
  calculateClauseRAG,
  calculateFinalRAG,
  calculateReviewPriority,
  needsReview,
  RAGCalculator,
} from './services/rag-calculator'

export type { PATComparison, ReviewPriority } from './services/rag-calculator'

export async function performP1Reconciliation(
  documentId: string,
  supabase: any,
  openaiApiKey: string
) {
  const startTime = Date.now()
  console.log(`   4️⃣ P1: Comparing against pre-agreed terms (batched)...`)

  // Fetch document metadata including extracted_text for identity term matching
  // Also includes p1_completed_at for idempotency check (Issue #3)
  const document = await fetchDocument(supabase, documentId)

  // ============ IDEMPOTENCY CHECK (Issue #3) ============
  // Use p1_completed_at column instead of checking JSONB presence
  // This correctly handles partial P1 failures - only skip if fully completed
  if (document.p1_completed_at) {
    console.log(`   ℹ️ P1 already completed at ${document.p1_completed_at}, skipping`)
    return {
      skipped: true,
      reason: "already_processed",
      p1_comparisons_made: 0,
      clauses_updated: 0,
      discrepancies_created: 0,
      missing_terms: 0,
    }
  }

  // Full contract text for identity term matching (presence check across entire document)
  const fullContractText = document.extracted_text || ''

  if (!document.deal_id) {
    console.log(`   ℹ️ No deal_id, skipping P1 comparison`)
    return { p1_comparisons_made: 0 }
  }

  // Fetch pre-agreed terms
  const preAgreedTerms = await fetchPreAgreedTerms(supabase, document.deal_id!)

  if (!preAgreedTerms.length) {
    console.log(`   ℹ️ No pre-agreed terms, skipping P1 comparison`)
    return { p1_comparisons_made: 0 }
  }

  console.log(`   Found ${preAgreedTerms.length} pre-agreed terms`)

  // Normalize PATs to reduce typos and map categories/clauses
  // Pass supabase client to enable caching of normalized values
  const normalizedTerms = await normalizePatTerms(preAgreedTerms, openaiApiKey, supabase)

  // Fetch clauses and match results
  const clauses = await fetchClauses(supabase, documentId)
  const matchResults = await fetchMatchResults(supabase, documentId)

  // Build all comparisons upfront (term-centric: top 1-3 clauses per PAT)
  // Identity terms are short-circuited and returned in identityResults
  const { comparisons, termComparisonMap, identityResults } = buildBatchComparisons(
    clauses || [],
    matchResults || [],
    normalizedTerms,
    fullContractText
  )

  console.log(`   Built ${comparisons.length} GPT comparisons, ${identityResults.size} identity short-circuits for ${termComparisonMap.size + identityResults.size} PAT terms`)

  // Track matched term IDs (include identity terms that matched)
  // Using term_id instead of term_category to handle multiple terms with same category correctly
  const matchedTermIdsFromIdentity = new Set<string>()

  // ============ PROCESS IDENTITY TERM RESULTS (PRE-GPT) ============
  // Identity terms (Brand Name, Talent Name, etc.) are resolved via direct
  // string matching - no GPT call needed
  let identityUpdatedCount = 0
  let identityDiscrepanciesCreated = 0

  for (const [termId, identityResult] of identityResults) {
    // Track matched identity terms by ID to prevent false "missing term" flags
    if (identityResult.matchResult.matches) {
      matchedTermIdsFromIdentity.add(termId)
    }

    // Create a virtual clause_match_result for identity terms
    const virtualMatch = await createIdentityMatchResult(supabase, documentId, identityResult)
    if (!virtualMatch) continue

    identityUpdatedCount++

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

      if (created) identityDiscrepanciesCreated++
    }

    console.log(`   📋 Identity: ${identityResult.termCategory} = ${identityResult.ragParsing.toUpperCase()} (${identityResult.matchResult.matchType})`)
  }

  // If only identity terms and all processed, we may have no GPT comparisons
  if (comparisons.length === 0) {
    const elapsedMs = Date.now() - startTime
    console.log(`   ✅ P1 complete in ${(elapsedMs / 1000).toFixed(1)}s: ${identityResults.size} identity terms processed, no semantic comparisons needed`)
    return {
      p1_comparisons_made: 0,
      identity_terms_processed: identityResults.size,
      clauses_updated: identityUpdatedCount,
      discrepancies_created: identityDiscrepanciesCreated,
      missing_terms: 0,
      execution_time_ms: elapsedMs,
    }
  }

  // Use configured P1 model for higher accuracy
  const estimatedTokens = comparisons.length * 150 // ~150 tokens per comparison
  console.log(`   Using model: ${P1_MODEL} (estimated ${estimatedTokens} tokens)`)

  // Execute batched comparison
  const batchResults = await executeBatchComparison(comparisons, openaiApiKey, P1_MODEL)

  console.log(`   Got ${batchResults.size}/${comparisons.length} results`)

  // Select best match per PAT term (green > amber > red)
  const bestMatchByTerm = selectBestMatchPerTerm(termComparisonMap, batchResults)

  console.log(`   Selected ${bestMatchByTerm.size} best matches (1 per PAT)`)

  // Group best matches by clause/matchResult for updating
  const clauseUpdates = new Map<string, {
    matchResult: ClauseMatchResult,
    clause: ClauseBoundary,
    patComparisons: any[]
  }>()

  for (const [termId, { comparison, result }] of bestMatchByTerm) {
    const matchResult = matchResults?.find((m: ClauseMatchResult) => m.id === comparison.matchResultId)
    const clause = clauses?.find((c: ClauseBoundary) => c.id === comparison.clauseId)
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

  // Process results and prepare batch update
  let updatedCount = 0
  let discrepanciesCreated = 0

  // First pass: calculate all updates and prepare batch
  const batchUpdates: Array<{
    id: string
    rag_parsing: string
    rag_status: string
    gpt_analysis: any
    discrepancy_count: number
  }> = []

  const processedClauses: Array<{
    matchResult: ClauseMatchResult
    clause: ClauseBoundary
    patComparisons: any[]
    rag_parsing: string
    rag_status: string
  }> = []

  for (const [matchResultId, { matchResult, clause, patComparisons }] of clauseUpdates) {
    // Calculate RAG status using RAG calculator
    const rag_parsing = calculateClauseRAG(patComparisons)
    const rag_risk = matchResult.rag_risk as 'green' | 'amber' | 'red'
    const rag_status = calculateFinalRAG(rag_parsing, rag_risk)

    // Add to batch
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

    // Store for second pass (side effects)
    processedClauses.push({ matchResult, clause, patComparisons, rag_parsing, rag_status })
  }

  // Execute batch update (single DB round-trip instead of N)
  if (batchUpdates.length > 0) {
    updatedCount = await batchUpdateMatchResults(supabase, batchUpdates as BatchUpdateItem[])
  }

  // Second pass: handle side effects (admin_review_queue, discrepancies)
  for (const { matchResult, clause, patComparisons, rag_parsing, rag_status } of processedClauses) {
    // Flag low-confidence matches for LCL growth
    const similarityScore = matchResult.similarity_score || 0
    if (needsReview(similarityScore)) {
      const priority = calculateReviewPriority(similarityScore)

      await insertReviewQueueItem(supabase, {
        document_id: documentId,
        clause_boundary_id: clause.id,
        review_type: 'low_confidence',
        status: 'pending',
        priority,
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
      const redComparisons = patComparisons.filter((c: any) => c.rag_parsing === 'red')
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

  // Handle missing mandatory terms
  // Combine GPT-matched term IDs with identity-matched term IDs
  // Using term_id instead of term_category to handle multiple terms with same category correctly
  const matchedTermIdsFromGPT = new Set(
    matchResults?.flatMap((r: any) => r.gpt_analysis?.pre_agreed_comparisons || [])
      .filter((c: any) => c.comparison_result?.matches)
      .map((c: any) => c.term_id)
  )

  // Merge both sets to avoid false "missing term" flags for identity terms
  const allMatchedTermIds = new Set([
    ...matchedTermIdsFromGPT,
    ...matchedTermIdsFromIdentity
  ])

  const missingTerms = preAgreedTerms.filter(
    (term: PreAgreedTerm) => term.is_mandatory && !allMatchedTermIds.has(term.id)
  )

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

  const elapsedMs = Date.now() - startTime
  const totalUpdated = updatedCount + identityUpdatedCount
  const totalDiscrepancies = discrepanciesCreated + identityDiscrepanciesCreated

  console.log(`   ✅ P1 complete in ${(elapsedMs / 1000).toFixed(1)}s: ${comparisons.length} GPT comparisons, ${identityResults.size} identity checks, ${totalUpdated} updated, ${totalDiscrepancies} discrepancies`)

  return {
    p1_comparisons_made: comparisons.length,
    identity_terms_processed: identityResults.size,
    clauses_updated: totalUpdated,
    discrepancies_created: totalDiscrepancies,
    missing_terms: missingTerms.length,
    execution_time_ms: elapsedMs,
  }
}
