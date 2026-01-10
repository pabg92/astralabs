/**
 * RAG Calculator Service
 *
 * Handles RAG (Red/Amber/Green) status calculation for P1 reconciliation.
 * Provides explicit decision logic for determining clause and term statuses.
 *
 * Decision Table:
 * - mandatory RED → RED
 * - non-mandatory RED → AMBER
 * - AMBER → AMBER
 * - (ragParsing RED || ragRisk RED) → RED
 * - (ragParsing GREEN && ragRisk GREEN) → GREEN
 * - otherwise → AMBER
 *
 * @module services/rag-calculator
 */

import type {
  BatchResult,
  RAGStatus,
  DeviationSeverity,
} from '../types/p1-types'

// ============ TYPES ============

/**
 * PAT comparison with RAG status for aggregation
 */
export interface PATComparison {
  rag_parsing: RAGStatus
  is_mandatory: boolean
}

/**
 * Review priority levels
 */
export type ReviewPriority = 'critical' | 'high' | 'medium' | 'low'

// ============ SINGLE TERM RAG CALCULATION ============

/**
 * Calculate RAG status for a single GPT comparison result
 *
 * Logic:
 * - matches=true, severity=none → GREEN
 * - matches=true, severity=minor → AMBER
 * - matches=false (any severity) → RED
 *
 * @param result - GPT batch result
 * @returns RAG status
 */
export function calculateTermRAG(result: BatchResult): RAGStatus {
  if (result.matches && result.severity === 'none') {
    return 'green'
  }
  if (result.matches && result.severity === 'minor') {
    return 'amber'
  }
  return 'red'
}

/**
 * Convert severity to RAG status
 *
 * @param severity - Deviation severity from GPT
 * @param matches - Whether the clause matches the term
 * @returns RAG status
 */
export function severityToRAG(severity: DeviationSeverity, matches: boolean): RAGStatus {
  if (!matches) return 'red'
  if (severity === 'none') return 'green'
  if (severity === 'minor') return 'amber'
  return 'red' // major
}

// ============ CLAUSE-LEVEL RAG AGGREGATION ============

/**
 * Calculate aggregate RAG status from multiple PAT comparisons
 *
 * Decision Logic:
 * - Any mandatory RED → RED (critical failure)
 * - Any non-mandatory RED → AMBER (needs review but not blocking)
 * - Any AMBER → AMBER
 * - All GREEN → GREEN
 *
 * @param patComparisons - Array of PAT comparison results
 * @returns Aggregate RAG status for the clause
 */
export function calculateClauseRAG(patComparisons: PATComparison[]): RAGStatus {
  let result: RAGStatus = 'green'

  for (const comp of patComparisons) {
    if (comp.rag_parsing === 'red' && comp.is_mandatory) {
      // Mandatory RED is immediately RED
      return 'red'
    }
    if (comp.rag_parsing === 'red' && result !== 'red') {
      // Non-mandatory RED becomes AMBER
      result = 'amber'
    }
    if (comp.rag_parsing === 'amber' && result === 'green') {
      // AMBER downgrades from GREEN
      result = 'amber'
    }
  }

  return result
}

// ============ FINAL RAG STATUS (P1 + LIBRARY) ============

/**
 * Calculate final RAG status combining P1 parsing result with library risk
 *
 * Decision Table:
 * | ragParsing | ragRisk | Result |
 * |------------|---------|--------|
 * | RED        | *       | RED    |
 * | *          | RED     | RED    |
 * | GREEN      | GREEN   | GREEN  |
 * | *          | *       | AMBER  |
 *
 * @param ragParsing - RAG from P1 term comparison
 * @param ragRisk - RAG from library matching
 * @returns Final combined RAG status
 */
export function calculateFinalRAG(ragParsing: RAGStatus, ragRisk: RAGStatus): RAGStatus {
  // Any RED → RED
  if (ragParsing === 'red' || ragRisk === 'red') {
    return 'red'
  }

  // Both GREEN → GREEN
  if (ragParsing === 'green' && ragRisk === 'green') {
    return 'green'
  }

  // Otherwise → AMBER
  return 'amber'
}

// ============ REVIEW PRIORITY ============

/**
 * Calculate review priority based on similarity score
 *
 * Thresholds:
 * - < 0.5 → critical
 * - < 0.6 → high
 * - < 0.7 → medium
 * - >= 0.7 → low
 *
 * @param similarityScore - Similarity score from embedding match
 * @returns Review priority level
 */
export function calculateReviewPriority(similarityScore: number): ReviewPriority {
  if (similarityScore < 0.5) return 'critical'
  if (similarityScore < 0.6) return 'high'
  if (similarityScore < 0.7) return 'medium'
  return 'low'
}

/**
 * Check if a clause needs review based on similarity score
 *
 * @param similarityScore - Similarity score from embedding match
 * @param threshold - Minimum score to skip review (default: 0.85)
 * @returns true if the clause needs review
 */
export function needsReview(similarityScore: number, threshold: number = 0.85): boolean {
  return similarityScore > 0 && similarityScore < threshold
}

// ============ RAG CALCULATOR CLASS ============

/**
 * RAGCalculator class for dependency injection and testing
 */
export class RAGCalculator {
  private reviewThreshold: number

  constructor(reviewThreshold: number = 0.85) {
    this.reviewThreshold = reviewThreshold
  }

  /**
   * Calculate RAG for a single term comparison
   */
  calculateTermRAG(result: BatchResult): RAGStatus {
    return calculateTermRAG(result)
  }

  /**
   * Calculate aggregate RAG for a clause from PAT comparisons
   */
  calculateClauseRAG(patComparisons: PATComparison[]): RAGStatus {
    return calculateClauseRAG(patComparisons)
  }

  /**
   * Calculate final RAG combining P1 and library results
   */
  calculateFinalRAG(ragParsing: RAGStatus, ragRisk: RAGStatus): RAGStatus {
    return calculateFinalRAG(ragParsing, ragRisk)
  }

  /**
   * Calculate review priority
   */
  calculateReviewPriority(similarityScore: number): ReviewPriority {
    return calculateReviewPriority(similarityScore)
  }

  /**
   * Check if clause needs review
   */
  needsReview(similarityScore: number): boolean {
    return needsReview(similarityScore, this.reviewThreshold)
  }

  /**
   * Full RAG calculation pipeline for a clause
   *
   * @param patComparisons - PAT comparison results
   * @param ragRisk - Library risk RAG
   * @returns Object with ragParsing, ragStatus, and discrepancyCount
   */
  calculateAll(
    patComparisons: PATComparison[],
    ragRisk: RAGStatus
  ): {
    ragParsing: RAGStatus
    ragStatus: RAGStatus
    discrepancyCount: number
  } {
    const ragParsing = this.calculateClauseRAG(patComparisons)
    const ragStatus = this.calculateFinalRAG(ragParsing, ragRisk)
    const discrepancyCount = ragStatus === 'red' ? 1 : 0

    return { ragParsing, ragStatus, discrepancyCount }
  }
}

// Default instance
export const ragCalculator = new RAGCalculator()
