/**
 * Types for Sandbox V2 - Three-Tier Clause Architecture
 *
 * @module lib/sandbox-v2/types
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type RiskLevel = 'low' | 'medium' | 'high'
export type RAGStatus = 'GREEN' | 'AMBER' | 'RED'
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'merged'
export type ReviewType = 'new_pattern' | 'variant_candidate' | 'low_confidence' | 'pat_conflict'
export type EscalationType = ReviewType
export type TestScenario = 'exact_pattern' | 'risk_resolution' | 'pat_override' | 'novel_escalation' | 'multi_match'

/** Risk level priority weights for sorting */
export const RISK_WEIGHTS: Record<RiskLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

// ============================================================================
// DATABASE TYPES
// ============================================================================

/** LCL (Legal Clause Library - Concepts) */
export interface LCL {
  id: string
  concept_code: string
  category: string
  display_name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** LCSTX (Legal Clause Standardization - Meanings + Patterns) */
export interface LCSTX {
  id: string
  lcl_id: string
  variant_code: string
  risk_level: RiskLevel
  canonical_text: string
  plain_english: string | null
  suggested_rewrite: string | null
  patterns: PatternEntry[]
  embedding: number[] | null
  version: number
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Pattern entry stored in LCSTX.patterns JSONB */
export interface PatternEntry {
  pattern: string
  confidence: number
}

/** LCSTX with joined LCL concept data */
export interface LCSTXWithConcept extends LCSTX {
  lcl: Pick<LCL, 'concept_code' | 'category' | 'display_name'>
}

/** Match result stored in database */
export interface MatchResult {
  id: string
  input_text: string
  all_matches: MatchEntry[]
  resolved_lcstx_id: string | null
  resolved_similarity: number | null
  resolved_risk_level: RiskLevel | null
  rag_library: RAGStatus | null
  rag_pat: RAGStatus | null
  rag_final: RAGStatus | null
  pat_context: PATContext | null
  pat_override_applied: boolean
  escalation_needed: boolean
  escalation_type: EscalationType | null
  created_at: string
}

/** Pattern review queue entry */
export interface PatternReviewEntry {
  id: string
  input_text: string
  proposed_lcstx_id: string | null
  similarity_score: number | null
  review_type: ReviewType
  similar_patterns: SimilarPatternInfo[]
  status: ReviewStatus
  resolution_notes: string | null
  resolved_by: string | null
  resolved_at: string | null
  match_result_id: string | null
  created_at: string
  updated_at: string
}

/** Test case for automated testing */
export interface TestCase {
  id: string
  test_id: string
  input_text: string
  expected_lcstx_variant_code: string | null
  expected_risk_level: RiskLevel | null
  expected_rag_library: RAGStatus | null
  pat_term_category: string | null
  pat_expected_value: string | null
  pat_is_mandatory: boolean | null
  expected_rag_final: RAGStatus | null
  scenario: TestScenario
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// MATCHING TYPES
// ============================================================================

/** Single match entry (part of all_matches) */
export interface MatchEntry {
  lcstx_id: string
  variant_code: string
  risk_level: RiskLevel
  similarity: number
  match_rank: number
  lcl_concept_code?: string
  lcl_category?: string
  canonical_text?: string
  plain_english?: string
  suggested_rewrite?: string
}

/** Similar pattern info for review context */
export interface SimilarPatternInfo {
  variant_code: string
  pattern: string
  similarity: number
}

/** PAT context for matching requests */
export interface PATContext {
  term_category: string
  expected_value: string
  is_mandatory: boolean
}

/** Result from the matching service */
export interface MatchingResult {
  /** All matches sorted by risk, then similarity */
  all_matches: MatchEntry[]
  /** The resolved best match (highest risk wins) */
  resolved_match: MatchEntry | null
  /** RAG status from library matching */
  rag_library: RAGStatus
  /** RAG status from PAT comparison (null if no PAT context) */
  rag_pat: RAGStatus | null
  /** Final combined RAG status */
  rag_final: RAGStatus
  /** Whether PAT override was applied */
  pat_override_applied: boolean
  /** Whether escalation is needed */
  escalation_needed: boolean
  /** Type of escalation (if needed) */
  escalation_type: EscalationType | null
  /** Stored match result ID (if recorded) */
  match_result_id?: string
  /** Review queue entry ID (if escalated) */
  review_entry_id?: string
}

/** Match request payload */
export interface MatchRequest {
  text: string
  pat_context?: PATContext
  record_result?: boolean
  similarity_threshold?: number
  max_results?: number
}

// ============================================================================
// P1 ADAPTER TYPES (for PAT comparison)
// ============================================================================

/** Result from P1 adapter comparison */
export interface P1ComparisonResult {
  matches: boolean
  severity: 'none' | 'minor' | 'major'
  confidence: number
  explanation: string
}

// ============================================================================
// STATS TYPES
// ============================================================================

/** Dashboard statistics */
export interface SandboxStats {
  total_concepts: number
  total_variants: number
  total_matches: number
  pending_reviews: number
  high_risk_variants: number
  medium_risk_variants: number
  low_risk_variants: number
  green_matches: number
  amber_matches: number
  red_matches: number
  escalation_rate: number
}

// ============================================================================
// TEST TYPES
// ============================================================================

/** Test run result */
export interface TestRunResult {
  test_id: string
  passed: boolean
  expected: {
    variant_code: string | null
    risk_level: RiskLevel | null
    rag_library: RAGStatus | null
    rag_final: RAGStatus | null
  }
  actual: {
    variant_code: string | null
    risk_level: RiskLevel | null
    rag_library: RAGStatus
    rag_final: RAGStatus
  }
  error?: string
}

/** Test suite result */
export interface TestSuiteResult {
  total: number
  passed: number
  failed: number
  results: TestRunResult[]
  duration_ms: number
}

// ============================================================================
// MATCH EXPLANATION TYPES
// ============================================================================

/** Explanation of why two clauses match at a given similarity */
export interface MatchExplanation {
  /** 1-2 sentence explanation of the match */
  summary: string
  /** 3-5 shared legal terms/concepts */
  keyOverlap: string[]
  /** Notable differences reducing similarity */
  keyDifferences: string[]
  /** Context about the threshold (e.g., "92.5% = GREEN (strong match)") */
  thresholdContext: string
  /** Detailed semantic comparison */
  semanticAnalysis: string
}

/** Request payload for match explanation API */
export interface ExplainMatchRequest {
  inputText: string
  matchedText: string
  similarity: number
  variantCode: string
}
