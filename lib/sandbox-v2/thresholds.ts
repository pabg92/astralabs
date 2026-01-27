/**
 * Sandbox V2 Thresholds
 *
 * Centralized thresholds for the three-tier clause architecture sandbox.
 *
 * @module lib/sandbox-v2/thresholds
 */

/**
 * Similarity thresholds for RAG status determination
 */
export const V2_THRESHOLDS = {
  /** Minimum similarity for GREEN status */
  GREEN: 0.75,
  /** Minimum similarity for AMBER status (below is RED) */
  AMBER: 0.60,
  /** Minimum similarity to be considered a match at all */
  MIN_SIMILARITY: 0.60,
  /** Below this, flag for low confidence review */
  LOW_CONFIDENCE: 0.70,
  /** Above this, potential new pattern candidate */
  PATTERN_CANDIDATE: 0.85,
} as const

/**
 * Human-readable descriptions for thresholds
 */
export const V2_THRESHOLD_DESCRIPTIONS = {
  GREEN: 'Strong match - high confidence',
  AMBER: 'Partial match - needs review',
  MIN_SIMILARITY: 'Minimum threshold for any match',
  LOW_CONFIDENCE: 'Below this triggers low confidence escalation',
  PATTERN_CANDIDATE: 'Above this for potential new variant',
} as const

export type V2ThresholdKey = keyof typeof V2_THRESHOLDS
