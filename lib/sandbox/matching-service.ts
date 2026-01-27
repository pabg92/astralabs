/**
 * Sandbox Matching Service
 * Handles vector similarity matching against the sandbox LCL
 */

import { supabaseServer } from '@/lib/supabase/server'
import { generateEmbedding, embeddingToVectorString, createEmbeddingConfig } from './embedding-service'

// ============================================================================
// TYPES
// ============================================================================

export interface SimilarClause {
  clause_id: string
  clause_type: string
  category: string | null
  standard_text: string
  similarity: number
  match_category: 'auto_merge' | 'review_required' | 'similar' | 'partial' | 'unique'
  classification: 'GREEN' | 'AMBER' | 'RED'
}

export interface MatchResult {
  input_text: string
  matches: SimilarClause[]
  top_match: SimilarClause | null
  escalation_needed: boolean
  escalation_type: 'new_clause' | 'potential_variant' | null
  tokens_used: number
}

export interface SandboxLCLClause {
  id: string
  clause_id: string
  clause_type: string
  category: string | null
  standard_text: string
  risk_level: string
  embedding: number[] | null
  parent_clause_id: string | null
  variation_letter: string
  tags: string[] | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ReviewQueueItem {
  id: string
  input_text: string
  matched_clause_id: string | null
  similarity_score: number | null
  review_type: 'new_clause' | 'potential_variant'
  status: 'pending' | 'approved_new' | 'approved_variant' | 'rejected'
  resolution_notes: string | null
  created_clause_id: string | null
  reviewed_at: string | null
  created_at: string
}

// ============================================================================
// THRESHOLDS
// ============================================================================

export const SANDBOX_THRESHOLDS = {
  // Auto-merge: near-identical text
  AUTO_MERGE: 0.92,
  // Review required: high similarity but needs verification
  REVIEW_REQUIRED: 0.85,
  // Similar: good match for GREEN status
  SIMILAR: 0.75,
  // Partial: decent match for AMBER status
  PARTIAL: 0.60,
  // Below this is considered unique/novel
  MIN_SIMILARITY: 0.60,
} as const

// ============================================================================
// MATCHING FUNCTIONS
// ============================================================================

/**
 * Find similar clauses in the sandbox LCL using vector similarity
 */
export async function findSimilarClauses(
  inputText: string,
  threshold: number = SANDBOX_THRESHOLDS.MIN_SIMILARITY,
  maxResults: number = 5
): Promise<MatchResult> {
  // Generate embedding for input text
  const config = createEmbeddingConfig()
  const { embedding, tokens } = await generateEmbedding(inputText, config)
  const embeddingString = embeddingToVectorString(embedding)

  // Call sandbox similarity search function using schema-qualified name
  const { data: matches, error } = await supabaseServer.schema('sandbox').rpc('find_similar_clauses', {
    p_query_embedding: embeddingString,
    p_similarity_threshold: threshold,
    p_max_results: maxResults,
  })

  if (error) {
    throw new Error(`Similarity search failed: ${error.message}`)
  }

  const typedMatches = (matches || []) as SimilarClause[]
  const topMatch = typedMatches.length > 0 ? typedMatches[0] : null

  // Determine if escalation is needed
  let escalationNeeded = false
  let escalationType: 'new_clause' | 'potential_variant' | null = null

  if (!topMatch || topMatch.similarity < SANDBOX_THRESHOLDS.PARTIAL) {
    // No match or very low similarity - novel clause
    escalationNeeded = true
    escalationType = 'new_clause'
  } else if (
    topMatch.similarity >= SANDBOX_THRESHOLDS.REVIEW_REQUIRED &&
    topMatch.similarity < SANDBOX_THRESHOLDS.AUTO_MERGE
  ) {
    // High similarity but not identical - potential variant
    escalationNeeded = true
    escalationType = 'potential_variant'
  }

  return {
    input_text: inputText,
    matches: typedMatches,
    top_match: topMatch,
    escalation_needed: escalationNeeded,
    escalation_type: escalationType,
    tokens_used: tokens,
  }
}

/**
 * Record a match result in the sandbox
 */
export async function recordMatchResult(result: MatchResult): Promise<string> {
  const topMatch = result.top_match
  const config = createEmbeddingConfig()
  const { embedding } = await generateEmbedding(result.input_text, config)
  const embeddingString = embeddingToVectorString(embedding)

  const { data, error } = await supabaseServer.schema('sandbox').rpc('record_match_result', {
    p_input_text: result.input_text,
    p_input_embedding: embeddingString,
    p_matched_clause_id: topMatch?.clause_id || null,
    p_matched_clause_text: topMatch?.standard_text || null,
    p_similarity_score: topMatch?.similarity || 0,
    p_match_category: topMatch?.match_category || 'unique',
    p_classification: topMatch?.classification || 'RED',
  })

  if (error) {
    throw new Error(`Failed to record match result: ${error.message}`)
  }

  return data as string
}

/**
 * Add an item to the escalation review queue
 */
export async function addToReviewQueue(
  inputText: string,
  matchedClauseId: string | null,
  similarity: number,
  reviewType: 'new_clause' | 'potential_variant'
): Promise<string> {
  const config = createEmbeddingConfig()
  const { embedding } = await generateEmbedding(inputText, config)
  const embeddingString = embeddingToVectorString(embedding)

  const { data, error } = await supabaseServer.schema('sandbox').rpc('add_to_review_queue', {
    p_input_text: inputText,
    p_input_embedding: embeddingString,
    p_matched_clause_id: matchedClauseId,
    p_similarity_score: similarity,
    p_review_type: reviewType,
  })

  if (error) {
    throw new Error(`Failed to add to review queue: ${error.message}`)
  }

  return data as string
}

/**
 * Get classification based on similarity score
 */
export function getClassification(similarity: number): 'GREEN' | 'AMBER' | 'RED' {
  if (similarity >= SANDBOX_THRESHOLDS.SIMILAR) return 'GREEN'
  if (similarity >= SANDBOX_THRESHOLDS.PARTIAL) return 'AMBER'
  return 'RED'
}

/**
 * Get match category based on similarity score
 */
export function getMatchCategory(
  similarity: number
): 'auto_merge' | 'review_required' | 'similar' | 'partial' | 'unique' {
  if (similarity >= SANDBOX_THRESHOLDS.AUTO_MERGE) return 'auto_merge'
  if (similarity >= SANDBOX_THRESHOLDS.REVIEW_REQUIRED) return 'review_required'
  if (similarity >= SANDBOX_THRESHOLDS.SIMILAR) return 'similar'
  if (similarity >= SANDBOX_THRESHOLDS.PARTIAL) return 'partial'
  return 'unique'
}

// ============================================================================
// LCL CRUD FUNCTIONS
// ============================================================================

/**
 * Get all clauses from the sandbox LCL
 */
export async function getAllClauses(): Promise<SandboxLCLClause[]> {
  const { data, error } = await supabaseServer
    .from('sandbox.legal_clause_library')
    .select('*')
    .order('clause_id')

  if (error) {
    // Try using raw query if schema prefix doesn't work
    const { data: rawData, error: rawError } = await supabaseServer.rpc('get_sandbox_lcl_clauses')
    if (rawError) {
      throw new Error(`Failed to fetch clauses: ${error.message}`)
    }
    return rawData as SandboxLCLClause[]
  }

  return data as SandboxLCLClause[]
}

/**
 * Get a single clause by ID
 */
export async function getClauseById(clauseId: string): Promise<SandboxLCLClause | null> {
  // Direct SQL query for sandbox schema
  const { data, error } = await supabaseServer
    .from('sandbox.legal_clause_library')
    .select('*')
    .eq('clause_id', clauseId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw new Error(`Failed to fetch clause: ${error.message}`)
  }

  return data as SandboxLCLClause
}

/**
 * Create a new clause in the sandbox LCL
 */
export async function createClause(clause: {
  clause_id: string
  clause_type: string
  category?: string
  standard_text: string
  risk_level?: string
  parent_clause_id?: string
  variation_letter?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}): Promise<SandboxLCLClause> {
  // Generate embedding for the clause text
  const config = createEmbeddingConfig()
  const { embedding } = await generateEmbedding(clause.standard_text, config)
  const embeddingString = embeddingToVectorString(embedding)

  const { data, error } = await supabaseServer
    .from('sandbox.legal_clause_library')
    .insert({
      ...clause,
      embedding: embeddingString,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create clause: ${error.message}`)
  }

  return data as SandboxLCLClause
}

/**
 * Update an existing clause
 */
export async function updateClause(
  clauseId: string,
  updates: {
    clause_type?: string
    category?: string
    standard_text?: string
    risk_level?: string
    tags?: string[]
    metadata?: Record<string, unknown>
  }
): Promise<SandboxLCLClause> {
  // If text changed, regenerate embedding
  let embeddingString: string | undefined
  if (updates.standard_text) {
    const config = createEmbeddingConfig()
    const { embedding } = await generateEmbedding(updates.standard_text, config)
    embeddingString = embeddingToVectorString(embedding)
  }

  const { data, error } = await supabaseServer
    .from('sandbox.legal_clause_library')
    .update({
      ...updates,
      ...(embeddingString ? { embedding: embeddingString } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('clause_id', clauseId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update clause: ${error.message}`)
  }

  return data as SandboxLCLClause
}

/**
 * Delete a clause from the sandbox LCL
 */
export async function deleteClause(clauseId: string): Promise<void> {
  const { error } = await supabaseServer.from('sandbox.legal_clause_library').delete().eq('clause_id', clauseId)

  if (error) {
    throw new Error(`Failed to delete clause: ${error.message}`)
  }
}

// ============================================================================
// REVIEW QUEUE FUNCTIONS
// ============================================================================

/**
 * Get all pending review queue items
 */
export async function getReviewQueue(status?: string): Promise<ReviewQueueItem[]> {
  let query = supabaseServer.from('sandbox.admin_review_queue').select('*').order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch review queue: ${error.message}`)
  }

  return data as ReviewQueueItem[]
}

/**
 * Resolve a review queue item
 */
export async function resolveReviewItem(
  id: string,
  resolution: {
    status: 'approved_new' | 'approved_variant' | 'rejected'
    resolution_notes?: string
    created_clause_id?: string
  }
): Promise<ReviewQueueItem> {
  const { data, error } = await supabaseServer
    .from('sandbox.admin_review_queue')
    .update({
      ...resolution,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to resolve review item: ${error.message}`)
  }

  return data as ReviewQueueItem
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get sandbox statistics
 */
export async function getSandboxStats(): Promise<{
  total_clauses: number
  clauses_with_embeddings: number
  clause_types: { type: string; count: number }[]
  categories: { category: string; count: number }[]
  pending_reviews: number
  match_results_count: number
}> {
  // Get clause counts
  const { count: totalClauses } = await supabaseServer
    .from('sandbox.legal_clause_library')
    .select('*', { count: 'exact', head: true })

  const { count: withEmbeddings } = await supabaseServer
    .from('sandbox.legal_clause_library')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null)

  // Get pending reviews count
  const { count: pendingReviews } = await supabaseServer
    .from('sandbox.admin_review_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  // Get match results count
  const { count: matchResults } = await supabaseServer
    .from('sandbox.clause_match_results')
    .select('*', { count: 'exact', head: true })

  return {
    total_clauses: totalClauses || 0,
    clauses_with_embeddings: withEmbeddings || 0,
    clause_types: [], // TODO: aggregate query
    categories: [], // TODO: aggregate query
    pending_reviews: pendingReviews || 0,
    match_results_count: matchResults || 0,
  }
}
