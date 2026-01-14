/**
 * P1 Reconciliation Configuration
 *
 * Centralized configuration for the P1 reconciliation system.
 * All hardcoded values are extracted here with environment variable overrides.
 */

import { SIMILARITY_THRESHOLDS } from '../../lib/constants/thresholds'
import type { TermToClauseMap, MatchReason } from '../types/p1-types'

// ============ MODEL CONFIGURATION ============

/** Model for P1 comparisons (supports both GPT and Gemini models) */
export const P1_MODEL = process.env.P1_MODEL || 'gpt-4o'

/** Check if a model name indicates a Gemini model */
export function isGeminiModel(model: string): boolean {
  return model.startsWith('gemini-')
}

/** Get the AI provider for P1 based on model name */
export function getP1Provider(): 'gemini' | 'openai' {
  return isGeminiModel(P1_MODEL) ? 'gemini' : 'openai'
}

/** GPT model for PAT normalization (lightweight) */
export const NORMALIZATION_MODEL = process.env.P1_NORMALIZATION_MODEL || 'gpt-4o-mini'

/** Maximum comparisons per GPT batch call */
export const BATCH_SIZE = parseInt(process.env.P1_BATCH_SIZE || '50', 10)

// ============ RETRY CONFIGURATION ============

/** Maximum retry attempts on rate limit */
export const MAX_RETRIES = parseInt(process.env.P1_MAX_RETRIES || '3', 10)

/** Backoff multiplier for exponential backoff */
export const BACKOFF_MULTIPLIER = parseInt(process.env.P1_BACKOFF_MULTIPLIER || '2', 10)

/** Maximum backoff delay in milliseconds */
export const MAX_BACKOFF_MS = parseInt(process.env.P1_MAX_BACKOFF_MS || '30000', 10)

// ============ TIMEOUT CONFIGURATION ============

/** Base timeout for GPT calls in milliseconds */
export const BASE_TIMEOUT_MS = parseInt(process.env.P1_BASE_TIMEOUT_MS || '30000', 10)

/** Additional timeout per comparison in milliseconds */
export const PER_COMPARISON_MS = parseInt(process.env.P1_PER_COMPARISON_MS || '2000', 10)

/** Maximum timeout cap in milliseconds */
export const MAX_TIMEOUT_MS = parseInt(process.env.P1_MAX_TIMEOUT_MS || '120000', 10)

// ============ THRESHOLD CONFIGURATION ============

/** Minimum similarity score for clause selection fallback */
export const CLAUSE_SELECTION_THRESHOLD = SIMILARITY_THRESHOLDS.CLAUSE_SELECTION

/** Minimum word match ratio for partial identity matches */
export const IDENTITY_PARTIAL_THRESHOLD = SIMILARITY_THRESHOLDS.IDENTITY_PARTIAL

/** Similarity threshold for flagging low-confidence matches */
export const LOW_CONFIDENCE_THRESHOLD = SIMILARITY_THRESHOLDS.P1_MATCH_HIGH

// ============ MATCH REASON WEIGHTS ============

/**
 * Weights for selecting best match per term.
 * Higher weight = more reliable match reason.
 */
export const MATCH_REASON_WEIGHTS: Record<MatchReason | 'primary_type' | 'fallback_type' | 'keyword', number> = {
  type_match: 1.0,        // Matched via primary clause type (most reliable)
  'primary_type': 1.0,    // Alias for type_match
  fallback_match: 0.8,    // Matched via fallback clause type
  'fallback_type': 0.8,   // Alias for fallback_match
  embedding_similarity: 0.7,  // Matched via embedding similarity
  semantic_fallback: 0.5, // Matched via keyword search (least reliable)
  'keyword': 0.5,         // Alias for semantic_fallback
}

// ============ TERM CATEGORY → CLAUSE TYPE MAPPING ============

/**
 * Maps PAT term_category to allowed clause_types for targeted matching.
 * Primary types are checked first, fallback types if no primary matches.
 */
export const TERM_TO_CLAUSE_MAP: TermToClauseMap = {
  // Payment
  'Payment Terms': { primary: ['payment_terms'], fallback: [] },

  // Exclusivity variants
  'Exclusivity': { primary: ['exclusivity'], fallback: ['deliverables'] },
  'Exclusivity Window': { primary: ['exclusivity'], fallback: ['deliverables'] },
  'Posting Restrictions': { primary: ['exclusivity', 'deliverables'], fallback: [] },

  // Usage/IP
  'Usage Rights': { primary: ['intellectual_property'], fallback: ['deliverables'] },
  'Usage & Licensing': { primary: ['intellectual_property'], fallback: ['deliverables'] },

  // Approvals
  'Brand Approval Required': { primary: ['deliverables'], fallback: ['scope_of_work'] },
  'Approval & Reshoot Obligation': { primary: ['deliverables'], fallback: ['scope_of_work'] },

  // Compliance
  'FTC & Disclosure Compliance': { primary: ['compliance'], fallback: ['confidentiality'] },
  'Disclosure Requirements': { primary: ['compliance'], fallback: ['confidentiality'] },

  // Content/Deliverables
  'Content Standards & Lighting': { primary: ['deliverables'], fallback: ['scope_of_work'] },
  'Brand Tags, Hashtags & Links': { primary: ['deliverables'], fallback: [] },
  'Minimum Duration & Feed Placement': { primary: ['deliverables'], fallback: [] },
  'Posting Schedule': { primary: ['deliverables'], fallback: ['scope_of_work'] },
  'Creative Requirements': { primary: ['deliverables'], fallback: ['scope_of_work'] },
  'Delivery Deadline': { primary: ['deliverables'], fallback: ['termination'] },
  'Pre-Production Requirement': { primary: ['deliverables'], fallback: ['scope_of_work'] },
  'Clothing & Styling Requirement': { primary: ['deliverables'], fallback: [] },
  'Analytics Delivery': { primary: ['deliverables'], fallback: ['compliance'] },

  // ============ IDENTITY TERMS ============
  // These terms require presence/string matching, NOT semantic comparison
  // They map to definition/preamble clause types where party names appear
  'Brand Name': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
  'Brand': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
  'Talent Name': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
  'Talent': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
  'Influencer Name': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
  'Influencer': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
  'Agency': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
  'Agency Name': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
  'Client Name': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
  'Client': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
  'Company Name': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
  'Company': { primary: ['term_definition', 'scope_of_work'], fallback: ['general_terms'] },
}

// ============ IDENTITY TERM CATEGORIES ============

/**
 * Set of term categories that require presence/string matching instead of semantic comparison.
 * These compare PAT expected_value against contract text directly.
 *
 * Note: We normalize on comparison instead of storing duplicates.
 */
const IDENTITY_CATEGORIES_BASE = [
  'Brand Name',
  'Brand',
  'Talent Name',
  'Talent',
  'Influencer Name',
  'Influencer',
  'Agency',
  'Agency Name',
  'Client Name',
  'Client',
  'Company Name',
  'Company',
] as const

/** Set of identity term categories (case-insensitive lookup) */
export const IDENTITY_TERM_CATEGORIES = new Set([
  ...IDENTITY_CATEGORIES_BASE,
  ...IDENTITY_CATEGORIES_BASE.map(c => c.toLowerCase()),
])

// ============ KEYWORD MATCHING MAP ============

/**
 * Keywords for legacy clause matching when no type mapping exists.
 * Used as fallback when primary/fallback clause types don't match.
 */
export const KEYWORD_MAP: Record<string, string[]> = {
  payment: ['payment', 'fee', 'compensation', 'invoice'],
  usage: ['usage', 'rights', 'license', 'media'],
  deliverable: ['deliverable', 'scope', 'work', 'content'],
  exclusivity: ['exclusivity', 'exclusive', 'compete'],
  approval: ['approval', 'review', 'consent'],
  intellectual: ['intellectual', 'ip', 'copyright', 'ownership'],
}

// ============ CONFIG OBJECT ============

/**
 * Complete P1 configuration object for dependency injection.
 * Use this for easier testing and mocking.
 */
export const P1Config = {
  // GPT
  model: P1_MODEL,
  normalizationModel: NORMALIZATION_MODEL,
  batchSize: BATCH_SIZE,

  // Retry
  maxRetries: MAX_RETRIES,
  backoffMultiplier: BACKOFF_MULTIPLIER,
  maxBackoffMs: MAX_BACKOFF_MS,

  // Timeout
  baseTimeoutMs: BASE_TIMEOUT_MS,
  perComparisonMs: PER_COMPARISON_MS,
  maxTimeoutMs: MAX_TIMEOUT_MS,

  // Thresholds
  clauseSelectionThreshold: CLAUSE_SELECTION_THRESHOLD,
  identityPartialThreshold: IDENTITY_PARTIAL_THRESHOLD,
  lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,

  // Weights
  matchReasonWeights: MATCH_REASON_WEIGHTS,

  // Mappings
  termToClauseMap: TERM_TO_CLAUSE_MAP,
  identityTermCategories: IDENTITY_TERM_CATEGORIES,
  keywordMap: KEYWORD_MAP,
} as const

export type P1ConfigType = typeof P1Config
