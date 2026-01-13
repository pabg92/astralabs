/**
 * Similarity Search Adapter
 * Performs vector similarity searches against Legal Clause Library using pgvector
 * Ported from supabase/functions/generate-embeddings/index.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { withRetry, isTransientError } from '../utils/retry.js'
import { getErrorMessage } from '../types/errors.js'
import {
  SIMILARITY_THRESHOLD_MIN,
  SIMILARITY_THRESHOLD_GREEN,
  SIMILARITY_MAX_RESULTS,
} from '../config/extraction-config'

// ============================================================================
// TYPES
// ============================================================================

/**
 * RAG risk status (traffic light)
 */
export type RagRisk = 'green' | 'amber' | 'red'

/**
 * Match category based on similarity score
 */
export type MatchCategory = 'auto_merge' | 'review_required' | 'unique'

/**
 * Single similarity match from RPC
 */
export interface SimilarityMatch {
  /** LCL table id */
  id: string
  /** Clause identifier (e.g., LCL-001a) */
  clause_id: string
  /** Standard clause text */
  standard_text: string
  /** Clause type category */
  clause_type: string
  /** Clause category */
  category: string
  /** Risk level */
  risk_level: string
  /** Cosine similarity score (0-1) */
  similarity: number
  /** Match category based on thresholds */
  match_category: MatchCategory
}

/**
 * Result of similarity search for a single clause
 */
export interface SimilaritySearchResult {
  /** All matches above threshold */
  matches: SimilarityMatch[]
  /** Top match (highest similarity) or null if no matches */
  topMatch: SimilarityMatch | null
  /** Calculated RAG risk based on top match */
  ragRisk: RagRisk
  /** Whether any matches were found */
  hasMatches: boolean
}

/**
 * Match result ready for database storage
 */
export interface ClauseMatchResult {
  document_id?: string
  clause_boundary_id: string
  matched_template_id: string | null
  similarity_score: number
  rag_risk: RagRisk
  rag_status: RagRisk
  gpt_analysis: {
    embedding_source?: string
    no_library_match?: boolean
    reason?: string
    top_match?: {
      clause_id: string
      clause_type: string
      category: string
      risk_level: string
      similarity: number
      match_category: MatchCategory
    }
    all_matches?: Array<{
      clause_id: string
      similarity: number
      match_category: MatchCategory
    }>
  }
}

/**
 * Configuration for similarity operations
 */
export interface SimilarityConfig {
  /** Minimum similarity threshold (default: 0.60) */
  thresholdMin?: number
  /** Similarity threshold for GREEN status (default: 0.75) */
  thresholdGreen?: number
  /** Maximum results to return (default: 10) */
  maxResults?: number
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number
  /** Tenant ID filter (optional) */
  tenantId?: string | null
  /** Clause type filter (optional) */
  clauseType?: string | null
  /** Embedding model name for metadata */
  embeddingModel?: string
}

const DEFAULT_CONFIG: SimilarityConfig = {
  thresholdMin: SIMILARITY_THRESHOLD_MIN,
  thresholdGreen: SIMILARITY_THRESHOLD_GREEN,
  maxResults: SIMILARITY_MAX_RESULTS,
  maxRetries: 3,
  tenantId: null,
  clauseType: null,
  embeddingModel: 'text-embedding-3-large',
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Threshold for auto_merge category */
export const AUTO_MERGE_THRESHOLD = 0.92

/** Threshold for review_required category */
export const REVIEW_REQUIRED_THRESHOLD = 0.85

// ============================================================================
// ERROR HELPERS
// ============================================================================

/**
 * Similarity-specific error class
 */
export class SimilarityError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message)
    this.name = 'SimilarityError'
  }
}

/**
 * Checks if a similarity error is retryable
 */
export function isRetryableSimilarityError(error: unknown): boolean {
  if (isTransientError(error)) return true
  if (error instanceof SimilarityError) return error.retryable

  const message = getErrorMessage(error)

  // Database connection errors are retryable
  if (/connection|timeout|ETIMEDOUT/i.test(message)) return true

  // Rate limiting is retryable
  if (/rate.?limit|too.?many/i.test(message)) return true

  return false
}

// ============================================================================
// RAG RISK CALCULATION
// ============================================================================

/**
 * Calculates RAG risk status based on similarity score
 */
export function calculateRagRisk(
  similarity: number | null,
  thresholdGreen: number = SIMILARITY_THRESHOLD_GREEN,
  thresholdMin: number = SIMILARITY_THRESHOLD_MIN
): RagRisk {
  if (similarity === null || similarity < thresholdMin) {
    return 'red'
  }
  if (similarity >= thresholdGreen) {
    return 'green'
  }
  return 'amber'
}

/**
 * Determines match category based on similarity score
 */
export function determineMatchCategory(similarity: number): MatchCategory {
  if (similarity >= AUTO_MERGE_THRESHOLD) {
    return 'auto_merge'
  }
  if (similarity >= REVIEW_REQUIRED_THRESHOLD) {
    return 'review_required'
  }
  return 'unique'
}

// ============================================================================
// EMBEDDING FORMATTING
// ============================================================================

/**
 * Formats embedding array as PostgreSQL vector string
 * Required for find_similar_clauses_v2 RPC which accepts text instead of vector
 */
export function formatEmbeddingForPostgres(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

// ============================================================================
// SIMILARITY SEARCH
// ============================================================================

/**
 * Finds similar clauses using pgvector RPC
 * Uses find_similar_clauses_v2 which accepts string-formatted embedding
 */
export async function findSimilarClauses(
  supabase: SupabaseClient,
  embedding: number[],
  config: SimilarityConfig = {}
): Promise<SimilaritySearchResult> {
  const {
    thresholdMin = DEFAULT_CONFIG.thresholdMin!,
    thresholdGreen = DEFAULT_CONFIG.thresholdGreen!,
    maxResults = DEFAULT_CONFIG.maxResults!,
    tenantId = DEFAULT_CONFIG.tenantId,
    clauseType = DEFAULT_CONFIG.clauseType,
  } = config

  // Format embedding for PostgreSQL (string format for v2 RPC)
  const embeddingString = formatEmbeddingForPostgres(embedding)

  // Call RPC function (v2 accepts string-formatted embedding)
  const { data: matches, error } = await supabase.rpc('find_similar_clauses_v2', {
    p_query_embedding: embeddingString,
    p_similarity_threshold: thresholdMin,
    p_max_results: maxResults,
    p_tenant_id: tenantId,
    p_clause_type: clauseType,
  })

  if (error) {
    throw new SimilarityError(
      `Similarity search failed: ${error.message}`,
      'RPC_ERROR',
      isRetryableSimilarityError(error)
    )
  }

  // Handle no matches
  if (!matches || matches.length === 0) {
    return {
      matches: [],
      topMatch: null,
      ragRisk: 'amber', // No match means needs review (matches Edge Function behavior)
      hasMatches: false,
    }
  }

  // Sort by similarity (descending) to ensure top match is first
  const sortedMatches = [...matches].sort(
    (a: SimilarityMatch, b: SimilarityMatch) => b.similarity - a.similarity
  )
  const topMatch = sortedMatches[0]

  return {
    matches: sortedMatches,
    topMatch,
    ragRisk: calculateRagRisk(topMatch.similarity, thresholdGreen, thresholdMin),
    hasMatches: true,
  }
}

/**
 * Finds similar clauses with retry logic
 */
export async function findSimilarClausesWithRetry(
  supabase: SupabaseClient,
  embedding: number[],
  config: SimilarityConfig = {}
): Promise<SimilaritySearchResult> {
  const maxRetries = config.maxRetries ?? DEFAULT_CONFIG.maxRetries ?? 3

  return withRetry(
    () => findSimilarClauses(supabase, embedding, config),
    {
      maxRetries,
      initialDelayMs: 500,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    },
    isRetryableSimilarityError,
    'similarity-search'
  )
}

// ============================================================================
// MATCH RESULT PREPARATION
// ============================================================================

/**
 * Prepares a clause match result for database storage
 * Matches the exact format used by the Edge Function
 */
export function prepareClauseMatchResult(
  clauseBoundaryId: string,
  searchResult: SimilaritySearchResult,
  documentId?: string,
  embeddingModel: string = 'text-embedding-3-large'
): ClauseMatchResult {
  const { topMatch, matches, ragRisk, hasMatches } = searchResult

  if (!hasMatches || !topMatch) {
    return {
      document_id: documentId,
      clause_boundary_id: clauseBoundaryId,
      matched_template_id: null,
      similarity_score: 0,
      rag_risk: 'amber',
      rag_status: 'amber',
      gpt_analysis: {
        no_library_match: true,
        embedding_source: embeddingModel,
        reason: `No similar clauses found in library above ${SIMILARITY_THRESHOLD_MIN} similarity threshold`,
      },
    }
  }

  return {
    document_id: documentId,
    clause_boundary_id: clauseBoundaryId,
    matched_template_id: topMatch.id,
    similarity_score: topMatch.similarity,
    rag_risk: ragRisk,
    rag_status: ragRisk,
    gpt_analysis: {
      embedding_source: embeddingModel,
      top_match: {
        clause_id: topMatch.clause_id,
        clause_type: topMatch.clause_type,
        category: topMatch.category,
        risk_level: topMatch.risk_level,
        similarity: topMatch.similarity,
        match_category: topMatch.match_category,
      },
      all_matches: matches.slice(0, 5).map((m) => ({
        clause_id: m.clause_id,
        similarity: m.similarity,
        match_category: m.match_category,
      })),
    },
  }
}

/**
 * Stores clause match result in database
 * Uses upsert with clause_boundary_id as conflict key (matches Edge Function)
 */
export async function storeClauseMatchResult(
  supabase: SupabaseClient,
  matchResult: ClauseMatchResult
): Promise<void> {
  const { error } = await supabase
    .from('clause_match_results')
    .upsert(matchResult, {
      onConflict: 'clause_boundary_id',
      ignoreDuplicates: false,
    })

  if (error) {
    throw new SimilarityError(
      `Failed to store match result: ${error.message}`,
      'STORAGE_ERROR',
      isRetryableSimilarityError(error)
    )
  }
}

/**
 * Stores clause match result with retry logic
 */
export async function storeClauseMatchResultWithRetry(
  supabase: SupabaseClient,
  matchResult: ClauseMatchResult,
  maxRetries: number = 3
): Promise<void> {
  return withRetry(
    () => storeClauseMatchResult(supabase, matchResult),
    {
      maxRetries,
      initialDelayMs: 500,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    },
    isRetryableSimilarityError,
    'store-match-result'
  )
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Progress callback for batch similarity search
 */
export type SimilarityProgressCallback = (progress: {
  processed: number
  total: number
  currentClauseId: string
}) => void

/**
 * Batch search input item
 */
export interface BatchSearchItem {
  clauseBoundaryId: string
  documentId?: string
  embedding: number[]
}

/**
 * Batch search result item
 */
export interface BatchSearchResultItem {
  clauseBoundaryId: string
  result: SimilaritySearchResult
  matchResult: ClauseMatchResult
}

/**
 * Performs similarity search for multiple clauses
 */
export async function batchSimilaritySearch(
  supabase: SupabaseClient,
  items: BatchSearchItem[],
  config: SimilarityConfig = {},
  onProgress?: SimilarityProgressCallback
): Promise<BatchSearchResultItem[]> {
  const results: BatchSearchResultItem[] = []
  const embeddingModel = config.embeddingModel ?? DEFAULT_CONFIG.embeddingModel!

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    if (onProgress) {
      onProgress({
        processed: i,
        total: items.length,
        currentClauseId: item.clauseBoundaryId,
      })
    }

    const result = await findSimilarClausesWithRetry(supabase, item.embedding, config)
    const matchResult = prepareClauseMatchResult(
      item.clauseBoundaryId,
      result,
      item.documentId,
      embeddingModel
    )

    results.push({
      clauseBoundaryId: item.clauseBoundaryId,
      result,
      matchResult,
    })
  }

  if (onProgress) {
    onProgress({
      processed: items.length,
      total: items.length,
      currentClauseId: '',
    })
  }

  return results
}

/**
 * Performs similarity search and stores results for multiple clauses
 */
export async function batchSimilaritySearchAndStore(
  supabase: SupabaseClient,
  items: BatchSearchItem[],
  config: SimilarityConfig = {},
  onProgress?: SimilarityProgressCallback
): Promise<BatchSearchResultItem[]> {
  const results = await batchSimilaritySearch(supabase, items, config, onProgress)

  // Store all results
  for (const item of results) {
    await storeClauseMatchResultWithRetry(supabase, item.matchResult, config.maxRetries)
  }

  return results
}

// ============================================================================
// ADAPTER CLASS
// ============================================================================

/**
 * Similarity Adapter class for dependency injection
 */
export class SimilarityAdapter {
  private supabase: SupabaseClient
  private config: SimilarityConfig

  constructor(supabase: SupabaseClient, config: SimilarityConfig = {}) {
    this.supabase = supabase
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Finds similar clauses for a single embedding
   */
  async findSimilar(embedding: number[]): Promise<SimilaritySearchResult> {
    return findSimilarClausesWithRetry(this.supabase, embedding, this.config)
  }

  /**
   * Performs batch similarity search
   */
  async batchSearch(
    items: BatchSearchItem[],
    onProgress?: SimilarityProgressCallback
  ): Promise<BatchSearchResultItem[]> {
    return batchSimilaritySearch(this.supabase, items, this.config, onProgress)
  }

  /**
   * Performs batch similarity search and stores results
   */
  async batchSearchAndStore(
    items: BatchSearchItem[],
    onProgress?: SimilarityProgressCallback
  ): Promise<BatchSearchResultItem[]> {
    return batchSimilaritySearchAndStore(this.supabase, items, this.config, onProgress)
  }

  /**
   * Stores a single match result
   */
  async storeMatchResult(matchResult: ClauseMatchResult): Promise<void> {
    return storeClauseMatchResultWithRetry(
      this.supabase,
      matchResult,
      this.config.maxRetries
    )
  }

  /**
   * Prepares a match result for storage
   */
  prepareMatchResult(
    clauseBoundaryId: string,
    searchResult: SimilaritySearchResult,
    documentId?: string
  ): ClauseMatchResult {
    return prepareClauseMatchResult(
      clauseBoundaryId,
      searchResult,
      documentId,
      this.config.embeddingModel
    )
  }

  /**
   * Calculates RAG risk for a similarity score
   */
  calculateRagRisk(similarity: number | null): RagRisk {
    return calculateRagRisk(
      similarity,
      this.config.thresholdGreen,
      this.config.thresholdMin
    )
  }

  /**
   * Gets the configured thresholds
   */
  getThresholds(): { min: number; green: number } {
    return {
      min: this.config.thresholdMin ?? SIMILARITY_THRESHOLD_MIN,
      green: this.config.thresholdGreen ?? SIMILARITY_THRESHOLD_GREEN,
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates a new SimilarityAdapter instance
 */
export function createSimilarityAdapter(
  supabase: SupabaseClient,
  config: SimilarityConfig = {}
): SimilarityAdapter {
  return new SimilarityAdapter(supabase, config)
}
