/**
 * P1 Reconciliation Type Definitions
 *
 * Centralized types for the P1 reconciliation system.
 * These types are used across services, adapters, and the main orchestrator.
 */

// ============ BASIC TYPE ALIASES ============

/** RAG status color for clause/term assessment */
export type RAGStatus = 'green' | 'amber' | 'red'

/** How a clause was matched to a term */
export type MatchReason = 'type_match' | 'fallback_match' | 'semantic_fallback' | 'embedding_similarity'

/** Type of identity match found */
export type IdentityMatchType = 'exact' | 'normalized' | 'partial' | 'absent'

/** Severity of deviation from expected term */
export type DeviationSeverity = 'none' | 'minor' | 'major'

// ============ DATABASE ENTITY INTERFACES ============

/** Pre-agreed term from the database */
export interface PreAgreedTerm {
  id: string
  term_category: string
  term_description: string
  expected_value: string
  is_mandatory: boolean
  related_clause_types: string[] | null
  normalized_term_category?: string
  normalized_clause_type?: string
  // PAT normalization caching (from migration 20260106000001)
  normalized_value?: string
  normalized_at?: string
  updated_at?: string
}

/** Clause boundary extracted from a contract */
export interface ClauseBoundary {
  id: string
  content: string
  clause_type: string
  confidence: number
}

/** Match result linking a clause to a library template */
export interface ClauseMatchResult {
  id: string
  clause_boundary_id: string
  matched_template_id: string | null
  similarity_score: number
  rag_risk: string
  gpt_analysis: Record<string, unknown> | null
}

// ============ COMPARISON INTERFACES ============

/** Result of comparing a clause against a pre-agreed term */
export interface ComparisonResult {
  matches: boolean
  deviation_severity: DeviationSeverity
  explanation: string
  key_differences: string[]
  confidence: number
}

/** Input for a single GPT batch comparison */
export interface BatchComparison {
  idx: number
  clauseId: string
  matchResultId: string
  termId: string
  clauseType: string
  termCategory: string
  isMandatory: boolean
  clauseContent: string
  termDescription: string
  expectedValue: string
  matchReason: MatchReason
  semanticScore: number
}

/** Output from a single GPT batch comparison */
export interface BatchResult {
  idx: number
  matches: boolean
  severity: DeviationSeverity
  explanation: string
  differences: string[]
  confidence: number
}

/** Normalized PAT term from GPT normalization */
export interface NormalizedTerm {
  id: string
  term_category?: string
  clause_type_guess?: string
  description?: string
  expected_value?: string
  is_mandatory?: boolean
}

/** A clause candidate selected for comparison against a PAT */
export interface ClauseCandidate {
  clause: ClauseBoundary
  matchResult: ClauseMatchResult
  matchReason: MatchReason
}

// ============ IDENTITY MATCHING INTERFACES ============

/** Result of an identity term match check */
export interface IdentityMatchResult {
  /** Whether the expected value was found */
  matches: boolean
  /** Type of match: exact, normalized, partial, or absent */
  matchType: IdentityMatchType
  /** Confidence score 0-1 */
  confidence: number
  /** The value that was found (if any) */
  foundValue?: string
}

/** Result of identity term processing (pre-GPT short-circuit) */
export interface IdentityTermResult {
  termId: string
  termCategory: string
  isMandatory: boolean
  expectedValue: string
  matchResult: IdentityMatchResult
  ragParsing: RAGStatus
  explanation: string
}

// ============ P1 RECONCILIATION RESULT ============

/** Result returned from performP1Reconciliation */
export interface P1ReconciliationResult {
  /** True if P1 was skipped (already processed or no terms) */
  skipped?: boolean
  /** Reason for skipping */
  reason?: string
  /** Number of GPT comparisons made */
  p1_comparisons_made: number
  /** Number of identity terms processed via short-circuit */
  identity_terms_processed?: number
  /** Number of clause match results updated */
  clauses_updated: number
  /** Number of discrepancies created */
  discrepancies_created: number
  /** Number of missing mandatory terms detected */
  missing_terms: number
  /** Total execution time in milliseconds */
  execution_time_ms?: number
}

// ============ PAT COMPARISON STORED IN JSONB ============

/** PAT comparison stored in gpt_analysis.pre_agreed_comparisons */
export interface StoredPatComparison {
  term_id: string
  term_category: string
  is_mandatory: boolean
  match_metadata: {
    clause_type_match?: boolean
    match_reason: MatchReason | 'identity_short_circuit'
    semantic_score?: number
    candidates_considered?: number
    identity_match_type?: IdentityMatchType
  }
  comparison_result: {
    matches: boolean
    deviation_severity: DeviationSeverity
    explanation: string
    key_differences: string[]
    confidence: number
  }
  rag_parsing: RAGStatus
}

// ============ CLAUSE TYPE MAPPING ============

/** Mapping from PAT term category to allowed clause types */
export interface ClauseTypeMapping {
  primary: string[]
  fallback: string[]
}

/** Full mapping of term categories to clause types */
export type TermToClauseMap = Record<string, ClauseTypeMapping>
