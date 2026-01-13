/**
 * Supabase Type Definitions for Worker
 *
 * Provides type-safe Supabase client interface for use in the worker.
 * These types mirror the Supabase client API without requiring Next.js dependencies.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// Re-export the Database types from the main types file
// Worker uses relative path since it's outside the Next.js alias scope
import type { Database, Json } from '../../types/database.js'

// ============ SUPABASE CLIENT TYPE ============

/**
 * Typed Supabase client for the worker
 * Use this instead of `any` for all Supabase client parameters
 */
export type TypedSupabaseClient = SupabaseClient<Database>

// ============ TABLE ROW TYPES ============

/** Document repository row */
export type DocumentRow = Database['public']['Tables']['document_repository']['Row']

/** Clause boundary row */
export type ClauseBoundaryRow = Database['public']['Tables']['clause_boundaries']['Row']

/** Clause match result row */
export type ClauseMatchResultRow = Database['public']['Tables']['clause_match_results']['Row']

/** Pre-agreed term row */
export type PreAgreedTermRow = Database['public']['Tables']['pre_agreed_terms']['Row']

/** Deal row */
export type DealRow = Database['public']['Tables']['deals']['Row']

/** Admin review queue row */
export type AdminReviewQueueRow = Database['public']['Tables']['admin_review_queue']['Row']

/** Discrepancy row */
export type DiscrepancyRow = Database['public']['Tables']['discrepancies']['Row']

/** Legal clause library row */
export type LegalClauseLibraryRow = Database['public']['Tables']['legal_clause_library']['Row']

// ============ INSERT TYPES ============

export type ClauseBoundaryInsert = Database['public']['Tables']['clause_boundaries']['Insert']
export type ClauseMatchResultInsert = Database['public']['Tables']['clause_match_results']['Insert']
export type DiscrepancyInsert = Database['public']['Tables']['discrepancies']['Insert']
export type AdminReviewQueueInsert = Database['public']['Tables']['admin_review_queue']['Insert']

// ============ UPDATE TYPES ============

export type DocumentUpdate = Database['public']['Tables']['document_repository']['Update']
export type ClauseMatchResultUpdate = Database['public']['Tables']['clause_match_results']['Update']

// ============ JSON TYPE ============

export type { Json }

// ============ QUERY RESULT TYPES ============

/**
 * Standard Supabase query result shape
 */
export interface QueryResult<T> {
  data: T | null
  error: PostgrestError | null
}

/**
 * Standard Supabase single row result
 */
export interface SingleResult<T> {
  data: T | null
  error: PostgrestError | null
}

/**
 * Supabase RPC result
 */
export interface RpcResult<T> {
  data: T | null
  error: PostgrestError | null
}

/**
 * PostgrestError shape from Supabase
 */
export interface PostgrestError {
  message: string
  details: string | null
  hint: string | null
  code: string
}

// ============ STORAGE TYPES ============

export interface StorageError {
  message: string
  statusCode?: string
  error?: string
}

export interface StorageDownloadResult {
  data: Blob | null
  error: StorageError | null
}

// ============ EDGE FUNCTION TYPES ============

/**
 * Payload for extract-clauses Edge Function
 */
export interface ExtractClausesPayload {
  document_id: string
  tenant_id: string
  object_path: string
}

/**
 * Payload for generate-embeddings Edge Function
 */
export interface GenerateEmbeddingsPayload {
  document_id: string
}

/**
 * Payload for match-and-reconcile Edge Function
 */
export interface MatchAndReconcilePayload {
  document_id: string
  tenant_id: string
}

/**
 * Generic Edge Function response
 */
export interface EdgeFunctionResponse {
  success: boolean
  error?: string
  clauses_extracted?: number
  embeddings_generated?: number
  clauses_reconciled?: number
  [key: string]: unknown
}

// ============ QUEUE MESSAGE TYPES ============

export interface QueueMessagePayload {
  document_id: string
  tenant_id: string
  object_path: string
  processing_type: string
  enqueued_at: string
}

export interface QueueMessage {
  msg_id: bigint
  message: QueueMessagePayload
  enqueued_at: string
  vt: string
}
