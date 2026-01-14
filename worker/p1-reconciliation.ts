/**
 * P1 Reconciliation Orchestrator
 *
 * Compares contract clauses against pre-agreed terms using a two-tier approach:
 * - Tier 1: Identity terms (string matching) - Brand Name, Talent Name, etc.
 * - Tier 2: Semantic terms (GPT comparison) - Payment Terms, Exclusivity, etc.
 *
 * OPTIMIZED: Uses batched GPT calls (5 min → ~15 sec)
 *
 * @module p1-reconciliation
 */

// ============ TYPES ============
import type {
  PreAgreedTerm,
  ClauseBoundary,
  ClauseMatchResult,
  BatchComparison,
  BatchResult,
  IdentityTermResult,
  RAGStatus,
} from './types/p1-types.js'
import type { TypedSupabaseClient } from './types/supabase.js'

// Re-export types for backward compatibility
export type { IdentityMatchResult, IdentityTermResult } from './types/p1-types'

// ============ CONFIGURATION ============
import { P1_MODEL } from './config/p1-config'
export { IDENTITY_TERM_CATEGORIES } from './config/p1-config'

// ============ SERVICES - Import and Re-export ============

// Identity Matcher
export {
  isIdentityTermCategory,
  normalizeForIdentityMatch,
  checkIdentityMatch,
  determineIdentityRag,
  generateIdentityExplanation,
} from './services/identity-matcher'

// Clause Selector
export {
  keywordMatchClause,
  selectTopClausesForTerm,
  buildClauseIndex,
  ClauseSelector,
} from './services/clause-selector'
export type { ClauseIndex } from './services/clause-selector'

// Semantic Matcher
import { buildBatchComparisons, selectBestMatchPerTerm } from './services/semantic-matcher'
export {
  buildBatchComparisons,
  selectBestMatchPerTerm,
  isBetterMatch,
  calculateRagScore,
  SemanticMatcher,
} from './services/semantic-matcher'
export type { BatchComparisonResult, BestMatchResult } from './services/semantic-matcher'

// RAG Calculator
export {
  calculateTermRAG,
  calculateClauseRAG,
  calculateFinalRAG,
  calculateReviewPriority,
  needsReview,
  RAGCalculator,
} from './services/rag-calculator'
export type { PATComparison, ReviewPriority } from './services/rag-calculator'

// ============ ADAPTERS - Import and Re-export ============

// P1 Adapter Factory (supports GPT and Gemini)
import { createP1AdapterFromKeys } from './adapters/p1-adapter-factory'
export { createP1Adapter, createP1AdapterFromKeys, isGeminiModel, getP1Provider } from './adapters/p1-adapter-factory'
export type { P1Adapter, P1Provider } from './adapters/p1-adapter-factory'

// GPT Adapter (for backward compatibility)
import { normalizePatTerms, executeBatchComparison } from './adapters/gpt-adapter'
export {
  normalizePatTerms,
  executeBatchComparison,
  callWithBackoff,
  calculateTimeout,
} from './adapters/gpt-adapter'

// Gemini P1 Adapter
export {
  normalizePatTermsGemini,
  executeBatchComparisonGemini,
  GeminiP1Adapter,
  createGeminiP1Adapter,
} from './adapters/gemini-p1-adapter'
export type { GeminiP1Model } from './adapters/gemini-p1-adapter'

// Database Adapter
import {
  fetchDocument,
  fetchPreAgreedTerms,
  fetchClauses,
  fetchMatchResults,
  batchUpdateMatchResults,
  type BatchUpdateItem,
} from './adapters/database-adapter'
export type { DocumentMetadata, BatchUpdateItem, DiscrepancyInput, ReviewQueueInput } from './adapters/database-adapter'

// Result Processor
import {
  processIdentityResults,
  groupClauseUpdates,
  prepareBatchUpdates,
  processSideEffects,
  processMissingTerms,
  getMatchedTermIdsFromResults,
} from './services/result-processor'
export {
  processIdentityResults,
  groupClauseUpdates,
  prepareBatchUpdates,
  processSideEffects,
  processMissingTerms,
  ResultProcessor,
} from './services/result-processor'

// ============ MAIN ORCHESTRATOR ============

/**
 * Perform P1 reconciliation: compare contract clauses against pre-agreed terms
 *
 * Supports both GPT and Gemini models. The provider is selected based on P1_MODEL:
 * - If P1_MODEL starts with 'gemini-', uses Gemini (requires geminiApiKey)
 * - Otherwise uses GPT (requires openaiApiKey)
 *
 * @param documentId - Document to reconcile
 * @param supabase - Supabase client
 * @param openaiApiKey - OpenAI API key for GPT comparisons (optional if using Gemini)
 * @param geminiApiKey - Gemini API key for Gemini comparisons (optional if using GPT)
 * @returns Reconciliation statistics
 */
export async function performP1Reconciliation(
  documentId: string,
  supabase: TypedSupabaseClient,
  openaiApiKey?: string,
  geminiApiKey?: string
) {
  const startTime = Date.now()
  console.log(`   4️⃣ P1: Comparing against pre-agreed terms (batched)...`)

  // ============ STEP 1: Fetch and validate data ============
  const document = await fetchDocument(supabase, documentId)

  // Idempotency check
  if (document.p1_completed_at) {
    console.log(`   ℹ️ P1 already completed at ${document.p1_completed_at}, skipping`)
    return { skipped: true, reason: 'already_processed', p1_comparisons_made: 0, clauses_updated: 0, discrepancies_created: 0, missing_terms: 0 }
  }

  if (!document.deal_id) {
    console.log(`   ℹ️ No deal_id, skipping P1 comparison`)
    return { p1_comparisons_made: 0 }
  }

  const preAgreedTerms = await fetchPreAgreedTerms(supabase, document.deal_id)
  if (!preAgreedTerms.length) {
    console.log(`   ℹ️ No pre-agreed terms, skipping P1 comparison`)
    return { p1_comparisons_made: 0 }
  }

  console.log(`   Found ${preAgreedTerms.length} pre-agreed terms`)

  // ============ STEP 2: Create adapter and normalize PATs ============
  const adapter = createP1AdapterFromKeys(openaiApiKey, geminiApiKey)
  if (!adapter) {
    console.log(`   ℹ️ No AI API key available, skipping P1 comparison`)
    return { p1_comparisons_made: 0, clauses_updated: 0, discrepancies_created: 0, missing_terms: 0 }
  }

  const normalizedTerms = await adapter.normalizePATs(preAgreedTerms, supabase)
  const clauses = await fetchClauses(supabase, documentId)
  const matchResults = await fetchMatchResults(supabase, documentId)
  const fullContractText = document.extracted_text || ''

  // ============ STEP 3: Build comparisons (identity short-circuit) ============
  const { comparisons, termComparisonMap, identityResults } = buildBatchComparisons(
    clauses, matchResults, normalizedTerms, fullContractText
  )

  console.log(`   Built ${comparisons.length} GPT comparisons, ${identityResults.size} identity short-circuits`)

  // ============ STEP 4: Process identity terms ============
  const identityProcessing = await processIdentityResults(supabase, documentId, identityResults)

  // Early return if only identity terms
  if (comparisons.length === 0) {
    const elapsedMs = Date.now() - startTime
    console.log(`   ✅ P1 complete in ${(elapsedMs / 1000).toFixed(1)}s: ${identityResults.size} identity terms, no semantic comparisons`)
    return {
      p1_comparisons_made: 0,
      identity_terms_processed: identityResults.size,
      clauses_updated: identityProcessing.updatedCount,
      discrepancies_created: identityProcessing.discrepanciesCreated,
      missing_terms: 0,
      execution_time_ms: elapsedMs,
    }
  }

  // ============ STEP 5: Execute AI comparison ============
  console.log(`   Using model: ${P1_MODEL} (estimated ${comparisons.length * 150} tokens)`)
  const batchResults = await adapter.compareBatch(comparisons)
  console.log(`   Got ${batchResults.size}/${comparisons.length} results`)

  // ============ STEP 6: Select best matches and prepare updates ============
  const bestMatchByTerm = selectBestMatchPerTerm(termComparisonMap, batchResults)
  console.log(`   Selected ${bestMatchByTerm.size} best matches (1 per PAT)`)

  const clauseUpdates = groupClauseUpdates(bestMatchByTerm, matchResults, clauses, termComparisonMap)
  const { batchUpdates, processedClauses } = prepareBatchUpdates(clauseUpdates)

  // ============ STEP 7: Persist results ============
  let updatedCount = 0
  if (batchUpdates.length > 0) {
    updatedCount = await batchUpdateMatchResults(supabase, batchUpdates as BatchUpdateItem[])
  }

  // ============ STEP 8: Process side effects ============
  const discrepanciesCreated = await processSideEffects(supabase, documentId, processedClauses)

  // ============ STEP 9: Handle missing mandatory terms ============
  const matchedTermIds = new Set([
    ...getMatchedTermIdsFromResults(matchResults),
    ...identityProcessing.matchedTermIds
  ])
  const missingResult = await processMissingTerms(supabase, documentId, preAgreedTerms, matchedTermIds)

  // ============ STEP 10: Return results ============
  const elapsedMs = Date.now() - startTime
  const totalUpdated = updatedCount + identityProcessing.updatedCount
  const totalDiscrepancies = discrepanciesCreated + identityProcessing.discrepanciesCreated + missingResult.discrepanciesCreated

  console.log(`   ✅ P1 complete in ${(elapsedMs / 1000).toFixed(1)}s: ${comparisons.length} GPT comparisons, ${identityResults.size} identity checks, ${totalUpdated} updated, ${totalDiscrepancies} discrepancies`)

  return {
    p1_comparisons_made: comparisons.length,
    identity_terms_processed: identityResults.size,
    clauses_updated: totalUpdated,
    discrepancies_created: totalDiscrepancies,
    missing_terms: missingResult.count,
    execution_time_ms: elapsedMs,
  }
}
