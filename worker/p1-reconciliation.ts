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
  MATCH_REASON_WEIGHTS,
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
  ClauseSelector,
  buildClauseIndex,
  keywordMatchClause,
  selectTopClausesForTerm,
  type ClauseIndex,
} from './services/clause-selector'

// Re-export clause selector functions for backward compatibility
export {
  keywordMatchClause,
  selectTopClausesForTerm,
  buildClauseIndex,
  ClauseSelector,
} from './services/clause-selector'

export type { ClauseIndex } from './services/clause-selector'

/**
 * Build batch comparisons list - term-centric approach (top 1-3 clauses per PAT)
 *
 * IDENTITY TERM SHORT-CIRCUIT:
 * Identity terms (Brand Name, Talent Name, Agency, etc.) are handled via direct
 * string matching against the contract text, bypassing GPT comparison. This:
 * - Reduces GPT API calls and latency
 * - Eliminates false negatives from semantic comparison of referential data
 * - Provides instant GREEN/RED determination based on presence check
 *
 * PERFORMANCE OPTIMIZATION:
 * Uses pre-indexed clause lookup (O(1) by type) instead of linear scanning.
 *
 * @param clauses - Extracted clause boundaries from the contract
 * @param matchResults - LCL match results for each clause
 * @param preAgreedTerms - Pre-agreed terms to compare against
 * @param fullContractText - Optional full contract text for identity term matching
 * @returns Comparisons for GPT, term map, and pre-resolved identity results
 */
function buildBatchComparisons(
  clauses: ClauseBoundary[],
  matchResults: ClauseMatchResult[],
  preAgreedTerms: PreAgreedTerm[],
  fullContractText?: string
): {
  comparisons: BatchComparison[],
  termComparisonMap: Map<string, BatchComparison[]>,
  identityResults: Map<string, IdentityTermResult>
} {
  const comparisons: BatchComparison[] = []
  const termComparisonMap = new Map<string, BatchComparison[]>()
  const identityResults = new Map<string, IdentityTermResult>()
  let idx = 0

  // Build clause index for O(1) lookup (performance optimization)
  const clauseIndex = buildClauseIndex(clauses, matchResults)
  const selector = new ClauseSelector()

  // For each PAT term, either short-circuit (identity) or build GPT comparison
  for (const term of preAgreedTerms) {
    const category = term.normalized_term_category || term.term_category

    // ============ IDENTITY TERM SHORT-CIRCUIT ============
    // Identity terms (Brand Name, Talent Name, etc.) use direct string matching
    // instead of GPT semantic comparison
    if (isIdentityTermCategory(category)) {
      const expectedValue = term.expected_value || ''
      const identityMatch = checkIdentityMatch(
        expectedValue,
        '', // No specific clause - check against full contract
        fullContractText
      )

      const ragParsing = determineIdentityRag(identityMatch, term.is_mandatory)
      const explanation = generateIdentityExplanation(identityMatch, expectedValue, category)

      identityResults.set(term.id, {
        termId: term.id,
        termCategory: category,
        isMandatory: term.is_mandatory,
        expectedValue,
        matchResult: identityMatch,
        ragParsing,
        explanation,
      })

      // Skip GPT comparison for identity terms
      continue
    }

    // ============ SEMANTIC TERMS → GPT COMPARISON ============
    // Use indexed clause selection for O(1) type lookup
    const candidates = selector.selectForTerm(term, clauseIndex)
    if (candidates.length === 0) continue

    const termComparisons: BatchComparison[] = []

    for (const { clause, matchResult, matchReason } of candidates) {
      const comparison: BatchComparison = {
        idx: idx++,
        clauseId: clause.id,
        matchResultId: matchResult.id,
        termId: term.id,
        clauseType: clause.clause_type,
        termCategory: category,
        isMandatory: term.is_mandatory,
        clauseContent: clause.content.substring(0, 600), // Truncate for context window
        termDescription: term.term_description,
        expectedValue: term.expected_value || 'N/A',
        matchReason,
        semanticScore: matchResult.similarity_score || 0,
      }
      comparisons.push(comparison)
      termComparisons.push(comparison)
    }

    termComparisonMap.set(term.id, termComparisons)
  }

  return { comparisons, termComparisonMap, identityResults }
}

// MATCH_REASON_WEIGHTS imported from ./config/p1-config

// Select best match per PAT term (green > amber > red, then by match reason weight, then by confidence)
function selectBestMatchPerTerm(
  termComparisonMap: Map<string, BatchComparison[]>,
  results: Map<number, BatchResult>
): Map<string, { comparison: BatchComparison, result: BatchResult }> {
  const bestByTerm = new Map<string, { comparison: BatchComparison, result: BatchResult }>()

  for (const [termId, comparisons] of termComparisonMap) {
    for (const comparison of comparisons) {
      const result = results.get(comparison.idx)
      if (!result) continue

      const existing = bestByTerm.get(termId)
      if (!existing || isBetterMatch(
        { result, matchReason: comparison.matchReason },
        { result: existing.result, matchReason: existing.comparison.matchReason }
      )) {
        bestByTerm.set(termId, { comparison, result })
      }
    }
  }

  return bestByTerm
}

// Compare matches: green > amber > red, then by match reason weight, then by confidence
function isBetterMatch(
  a: { result: BatchResult, matchReason: string },
  b: { result: BatchResult, matchReason: string }
): boolean {
  const ragScore = (r: BatchResult) => {
    if (r.matches && r.severity === "none") return 3  // green
    if (r.matches && r.severity === "minor") return 2  // amber
    return 1  // red
  }

  const scoreA = ragScore(a.result)
  const scoreB = ragScore(b.result)

  // First compare RAG score
  if (scoreA !== scoreB) {
    return scoreA > scoreB
  }

  // Then compare match reason weight
  const weightA = MATCH_REASON_WEIGHTS[a.matchReason] ?? 0.5
  const weightB = MATCH_REASON_WEIGHTS[b.matchReason] ?? 0.5
  if (weightA !== weightB) {
    return weightA > weightB
  }

  // Finally compare confidence
  return a.result.confidence > b.result.confidence
}

// calculateTimeout and executeBatchComparison imported from ./adapters/gpt-adapter

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

    let termRagParsing: "green" | "amber" | "red"
    if (result.matches && result.severity === "none") {
      termRagParsing = "green"
    } else if (result.matches && result.severity === "minor") {
      termRagParsing = "amber"
    } else {
      termRagParsing = "red"
    }

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
    // Calculate worst-case rag_parsing from PAT comparisons
    let rag_parsing: "green" | "amber" | "red" = "green"
    for (const comp of patComparisons) {
      if (comp.rag_parsing === "red" && comp.is_mandatory) {
        rag_parsing = "red"
      } else if (comp.rag_parsing === "red" && rag_parsing !== "red") {
        rag_parsing = "amber"
      } else if (comp.rag_parsing === "amber" && rag_parsing === "green") {
        rag_parsing = "amber"
      }
    }

    // Calculate final rag_status (combine with library matching)
    const rag_risk = matchResult.rag_risk as "green" | "amber" | "red"
    let rag_status: "green" | "amber" | "red"

    if (rag_parsing === "red" || rag_risk === "red") {
      rag_status = "red"
    } else if (rag_parsing === "green" && rag_risk === "green") {
      rag_status = "green"
    } else {
      rag_status = "amber"
    }

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
      discrepancy_count: rag_status === "red" ? 1 : 0,
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
    if (similarityScore < 0.85 && similarityScore > 0) {
      const priority = similarityScore < 0.5 ? 'critical' : similarityScore < 0.6 ? 'high' : similarityScore < 0.7 ? 'medium' : 'low'

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
