/**
 * Semantic Matcher Service
 *
 * Handles semantic term comparison for P1 reconciliation.
 * Builds batch comparisons for GPT and selects best matches per term.
 *
 * @module services/semantic-matcher
 */

import type {
  PreAgreedTerm,
  ClauseBoundary,
  ClauseMatchResult,
  BatchComparison,
  BatchResult,
  IdentityTermResult,
  MatchReason,
} from '../types/p1-types'

import { MATCH_REASON_WEIGHTS } from '../config/p1-config'

import {
  isIdentityTermCategory,
  checkIdentityMatch,
  determineIdentityRag,
  generateIdentityExplanation,
} from './identity-matcher'

import {
  ClauseSelector,
  buildClauseIndex,
  type ClauseIndex,
} from './clause-selector'

// ============ TYPES ============

/**
 * Result of building batch comparisons
 */
export interface BatchComparisonResult {
  comparisons: BatchComparison[]
  termComparisonMap: Map<string, BatchComparison[]>
  identityResults: Map<string, IdentityTermResult>
}

/**
 * Best match selection result
 */
export interface BestMatchResult {
  comparison: BatchComparison
  result: BatchResult
}

// ============ MATCH COMPARISON ============

/**
 * Calculate RAG score for ranking (green=3, amber=2, red=1)
 */
export function calculateRagScore(result: BatchResult): number {
  if (result.matches && result.severity === 'none') return 3  // green
  if (result.matches && result.severity === 'minor') return 2  // amber
  return 1  // red
}

/**
 * Compare two matches to determine which is better
 * Priority: RAG score (green > amber > red) → match reason weight → confidence
 *
 * @param a - First match to compare
 * @param b - Second match to compare
 * @returns true if a is better than b
 */
export function isBetterMatch(
  a: { result: BatchResult; matchReason: string },
  b: { result: BatchResult; matchReason: string }
): boolean {
  const scoreA = calculateRagScore(a.result)
  const scoreB = calculateRagScore(b.result)

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

// ============ BEST MATCH SELECTION ============

/**
 * Select the best match per PAT term from GPT results
 * Uses priority: green > amber > red, then match reason weight, then confidence
 *
 * @param termComparisonMap - Map of term ID to comparisons
 * @param results - GPT batch results by comparison index
 * @returns Map of term ID to best match
 */
export function selectBestMatchPerTerm(
  termComparisonMap: Map<string, BatchComparison[]>,
  results: Map<number, BatchResult>
): Map<string, BestMatchResult> {
  const bestByTerm = new Map<string, BestMatchResult>()

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

// ============ BATCH COMPARISON BUILDING ============

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
export function buildBatchComparisons(
  clauses: ClauseBoundary[],
  matchResults: ClauseMatchResult[],
  preAgreedTerms: PreAgreedTerm[],
  fullContractText?: string
): BatchComparisonResult {
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

// ============ SEMANTIC MATCHER CLASS ============

/**
 * SemanticMatcher class for dependency injection and testing
 */
export class SemanticMatcher {
  private clauseSelector: ClauseSelector

  constructor(clauseSelector?: ClauseSelector) {
    this.clauseSelector = clauseSelector || new ClauseSelector()
  }

  /**
   * Build batch comparisons for GPT processing
   */
  buildComparisons(
    clauses: ClauseBoundary[],
    matchResults: ClauseMatchResult[],
    preAgreedTerms: PreAgreedTerm[],
    fullContractText?: string
  ): BatchComparisonResult {
    return buildBatchComparisons(clauses, matchResults, preAgreedTerms, fullContractText)
  }

  /**
   * Select best match per term from GPT results
   */
  selectBestMatches(
    termComparisonMap: Map<string, BatchComparison[]>,
    results: Map<number, BatchResult>
  ): Map<string, BestMatchResult> {
    return selectBestMatchPerTerm(termComparisonMap, results)
  }

  /**
   * Compare two matches
   */
  isBetterMatch(
    a: { result: BatchResult; matchReason: string },
    b: { result: BatchResult; matchReason: string }
  ): boolean {
    return isBetterMatch(a, b)
  }
}

// Default instance
export const semanticMatcher = new SemanticMatcher()
