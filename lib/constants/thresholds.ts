/**
 * Centralized Similarity Thresholds
 *
 * These thresholds are used for:
 * - Library matching in generate-embeddings Edge Function
 * - P1 Reconciliation clause comparison
 * - Identity term matching
 *
 * Having them centralized ensures consistency across the codebase
 * and makes tuning easier.
 */

export const SIMILARITY_THRESHOLDS = {
  // Library matching (generate-embeddings)
  LIBRARY_GREEN: 0.75,
  LIBRARY_AMBER: 0.60,

  // P1 Reconciliation
  P1_MATCH_HIGH: 0.85,
  P1_MATCH_LOW: 0.50,

  // Clause selection fallback
  CLAUSE_SELECTION: 0.60,

  // Identity term matching
  IDENTITY_EXACT: 1.0,
  IDENTITY_PARTIAL: 0.7,
} as const

/**
 * Human-readable descriptions for logging and debugging
 */
export const THRESHOLD_DESCRIPTIONS = {
  LIBRARY_GREEN: 'Strong LCL match',
  LIBRARY_AMBER: 'Partial LCL match',
  P1_MATCH_HIGH: 'High confidence PAT match',
  P1_MATCH_LOW: 'Minimum PAT match threshold',
  CLAUSE_SELECTION: 'Clause selection similarity cutoff',
  IDENTITY_EXACT: 'Exact identity term match',
  IDENTITY_PARTIAL: 'Partial identity term match',
} as const

export type ThresholdKey = keyof typeof SIMILARITY_THRESHOLDS
