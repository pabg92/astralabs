/**
 * Database Adapter
 *
 * Handles all Supabase database interactions for P1 reconciliation.
 * Centralizes database operations for easier testing and maintenance.
 *
 * @module adapters/database-adapter
 */

import type {
  PreAgreedTerm,
  ClauseBoundary,
  ClauseMatchResult,
  IdentityTermResult,
  RAGStatus,
} from '../types/p1-types'

// ============ TYPES ============

export interface DocumentMetadata {
  id: string
  deal_id: string | null
  tenant_id: string | null
  extracted_text: string | null
  p1_completed_at: string | null
}

export interface BatchUpdateItem {
  id: string
  rag_parsing: RAGStatus
  rag_status: RAGStatus
  gpt_analysis: Record<string, any>
  discrepancy_count: number
}

export interface DiscrepancyInput {
  match_result_id: string
  document_id: string
  discrepancy_type: 'missing' | 'conflicting' | 'modified'
  severity: 'critical' | 'error' | 'warning'
  description: string
  affected_text?: string
  suggested_action: string
}

export interface ReviewQueueInput {
  document_id: string
  clause_boundary_id: string
  review_type: 'low_confidence' | 'new_clause' | 'high_risk'
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'critical' | 'high' | 'medium' | 'low'
  issue_description: string
  original_text: string
  metadata: Record<string, any>
}

/**
 * Input for saving extracted clauses to clause_boundaries
 */
export interface ExtractedClauseInput {
  content: string
  clause_type: string
  confidence: number
  start_index: number
  end_index: number
  rag_status: RAGStatus
  section_title?: string
  summary?: string
}

/**
 * Result from saving extracted clauses
 */
export interface SaveClausesResult {
  inserted: number
  clauses: Array<{ id: string; clause_type: string; confidence: number }>
}

// ============ STANDALONE FUNCTIONS ============

/**
 * Fetch document metadata including extracted text and completion status
 */
export async function fetchDocument(
  supabase: any,
  documentId: string
): Promise<DocumentMetadata> {
  const { data: document, error } = await supabase
    .from('document_repository')
    .select('id, deal_id, tenant_id, extracted_text, p1_completed_at')
    .eq('id', documentId)
    .single()

  if (error || !document) {
    throw new Error(`Document not found: ${error?.message}`)
  }

  return document
}

/**
 * Fetch pre-agreed terms for a deal
 */
export async function fetchPreAgreedTerms(
  supabase: any,
  dealId: string
): Promise<PreAgreedTerm[]> {
  const { data: terms, error } = await supabase
    .from('pre_agreed_terms')
    .select('*')
    .eq('deal_id', dealId)

  if (error) throw error
  return terms || []
}

/**
 * Fetch clause boundaries for a document
 */
export async function fetchClauses(
  supabase: any,
  documentId: string
): Promise<ClauseBoundary[]> {
  const { data: clauses, error } = await supabase
    .from('clause_boundaries')
    .select('id, content, clause_type, confidence')
    .eq('document_id', documentId)

  if (error) throw error
  return clauses || []
}

/**
 * Fetch clause match results for a document
 */
export async function fetchMatchResults(
  supabase: any,
  documentId: string
): Promise<ClauseMatchResult[]> {
  const { data: results, error } = await supabase
    .from('clause_match_results')
    .select('*')
    .eq('document_id', documentId)
    .not('clause_boundary_id', 'is', null)

  if (error) throw error
  return results || []
}

/**
 * Create a clause match result for an identity term check
 */
export async function createIdentityMatchResult(
  supabase: any,
  documentId: string,
  identityResult: IdentityTermResult
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('clause_match_results')
    .insert({
      document_id: documentId,
      clause_boundary_id: null, // Identity terms check full document
      matched_template_id: null,
      similarity_score: identityResult.matchResult.confidence,
      rag_parsing: identityResult.ragParsing,
      rag_risk: 'green', // Identity doesn't use library risk assessment
      rag_status: identityResult.ragParsing,
      discrepancy_count: identityResult.ragParsing === 'red' ? 1 : 0,
      gpt_analysis: {
        identity_term_check: {
          term_id: identityResult.termId,
          term_category: identityResult.termCategory,
          expected_value: identityResult.expectedValue,
          match_type: identityResult.matchResult.matchType,
          found_value: identityResult.matchResult.foundValue,
          confidence: identityResult.matchResult.confidence,
        },
        pre_agreed_comparisons: [{
          term_id: identityResult.termId,
          term_category: identityResult.termCategory,
          is_mandatory: identityResult.isMandatory,
          match_metadata: {
            match_reason: 'identity_short_circuit',
            identity_match_type: identityResult.matchResult.matchType,
          },
          comparison_result: {
            matches: identityResult.matchResult.matches,
            deviation_severity: identityResult.ragParsing === 'green' ? 'none' :
                               identityResult.ragParsing === 'amber' ? 'minor' : 'major',
            explanation: identityResult.explanation,
            key_differences: [],
            confidence: identityResult.matchResult.confidence,
          },
          rag_parsing: identityResult.ragParsing,
        }],
        reconciliation_timestamp: new Date().toISOString(),
      },
    })
    .select('id')
    .single()

  if (error) {
    console.error(`   ⚠️ Failed to create identity match result for ${identityResult.termCategory}: ${error.message}`)
    return null
  }

  return data
}

/**
 * Create a clause match result for a missing mandatory term
 */
export async function createMissingTermResult(
  supabase: any,
  documentId: string,
  missingTerm: PreAgreedTerm
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('clause_match_results')
    .insert({
      document_id: documentId,
      clause_boundary_id: null,
      matched_template_id: null,
      similarity_score: 0,
      rag_parsing: 'red',
      rag_risk: 'red',
      rag_status: 'red',
      discrepancy_count: 1,
      gpt_analysis: {
        missing_required_term: {
          term_id: missingTerm.id,
          term_category: missingTerm.term_category,
          term_description: missingTerm.term_description,
        },
      },
    })
    .select('id')
    .single()

  if (error) {
    console.error(`   ⚠️ Failed to create missing term result for ${missingTerm.term_category}: ${error.message}`)
    return null
  }

  return data
}

/**
 * Batch update clause match results using RPC for efficiency
 * Falls back to sequential updates if RPC not available
 *
 * @returns Number of successfully updated records
 */
export async function batchUpdateMatchResults(
  supabase: any,
  updates: BatchUpdateItem[]
): Promise<number> {
  if (updates.length === 0) return 0

  // Try batch RPC first
  const { data: batchResult, error: batchError } = await supabase
    .rpc('batch_update_clause_match_results', { updates })

  if (!batchError) {
    return batchResult?.[0]?.updated_count || updates.length
  }

  // Fallback to sequential updates
  console.warn(`   ⚠️ Batch update RPC failed, falling back to sequential:`, batchError)

  let updatedCount = 0
  for (const update of updates) {
    const { error } = await supabase
      .from('clause_match_results')
      .update({
        rag_parsing: update.rag_parsing,
        rag_status: update.rag_status,
        gpt_analysis: update.gpt_analysis,
        discrepancy_count: update.discrepancy_count,
        updated_at: new Date().toISOString(),
      })
      .eq('id', update.id)

    if (!error) updatedCount++
  }

  return updatedCount
}

/**
 * Create a discrepancy record
 *
 * @returns true if created successfully (or already exists)
 */
export async function createDiscrepancy(
  supabase: any,
  input: DiscrepancyInput
): Promise<boolean> {
  const { error } = await supabase.from('discrepancies').insert({
    match_result_id: input.match_result_id,
    document_id: input.document_id,
    discrepancy_type: input.discrepancy_type,
    severity: input.severity,
    description: input.description,
    affected_text: input.affected_text,
    suggested_action: input.suggested_action,
  })

  // 23505 = unique constraint violation (already exists)
  return !error || error.code === '23505'
}

/**
 * Insert an item into the admin review queue
 *
 * @returns true if inserted successfully (or already exists)
 */
export async function insertReviewQueueItem(
  supabase: any,
  input: ReviewQueueInput
): Promise<boolean> {
  const { error } = await supabase.from('admin_review_queue').insert({
    document_id: input.document_id,
    clause_boundary_id: input.clause_boundary_id,
    review_type: input.review_type,
    status: input.status,
    priority: input.priority,
    issue_description: input.issue_description,
    original_text: input.original_text,
    metadata: input.metadata,
  })

  if (error && error.code !== '23505') {
    console.error(`   ⚠️ Failed to insert review queue item:`, error)
    return false
  }

  return true
}

/**
 * Save extracted clauses to clause_boundaries table
 *
 * Uses upsert with onConflict to prevent duplicate insertions
 * for the same document_id + content combination.
 */
export async function saveExtractedClauses(
  supabase: any,
  documentId: string,
  tenantId: string,
  clauses: ExtractedClauseInput[]
): Promise<SaveClausesResult> {
  if (clauses.length === 0) {
    return { inserted: 0, clauses: [] }
  }

  // Map clauses to database records
  const clauseRecords = clauses.map((clause) => ({
    document_id: documentId,
    tenant_id: tenantId,
    content: clause.content,
    clause_type: clause.clause_type,
    confidence: clause.confidence,
    parsing_quality: clause.confidence, // Use confidence as parsing quality
    section_title: clause.section_title || null,
    start_char: clause.start_index,
    end_char: clause.end_index,
    rag_parsing: clause.rag_status,
    parsing_issues: clause.confidence < 0.7
      ? [{ issue: 'low_confidence', score: clause.confidence }]
      : [],
  }))

  // Upsert clauses (skip duplicates)
  const { data: insertedClauses, error: insertError } = await supabase
    .from('clause_boundaries')
    .upsert(clauseRecords, {
      onConflict: 'document_id,content',
      ignoreDuplicates: true,
    })
    .select('id, clause_type, confidence')

  if (insertError) {
    throw new Error(`Failed to save clauses: ${insertError.message}`)
  }

  return {
    inserted: insertedClauses?.length || 0,
    clauses: insertedClauses || [],
  }
}

/**
 * Update document with extracted text
 */
export async function updateDocumentExtractedText(
  supabase: any,
  documentId: string,
  extractedText: string
): Promise<void> {
  const { error } = await supabase
    .from('document_repository')
    .update({ extracted_text: extractedText })
    .eq('id', documentId)

  if (error) {
    throw new Error(`Failed to update extracted text: ${error.message}`)
  }
}

/**
 * Mark a document's P1 reconciliation as complete
 */
export async function markP1Complete(
  supabase: any,
  documentId: string
): Promise<void> {
  const { error } = await supabase
    .from('document_repository')
    .update({ p1_completed_at: new Date().toISOString() })
    .eq('id', documentId)

  if (error) {
    console.error(`   ⚠️ Failed to mark P1 complete:`, error)
  }
}

// ============ DATABASE ADAPTER CLASS ============

/**
 * DatabaseAdapter class for dependency injection and testing
 */
export class DatabaseAdapter {
  private supabase: any

  constructor(supabase: any) {
    this.supabase = supabase
  }

  /**
   * Fetch document metadata
   */
  async fetchDocument(documentId: string): Promise<DocumentMetadata> {
    return fetchDocument(this.supabase, documentId)
  }

  /**
   * Fetch pre-agreed terms for a deal
   */
  async fetchPreAgreedTerms(dealId: string): Promise<PreAgreedTerm[]> {
    return fetchPreAgreedTerms(this.supabase, dealId)
  }

  /**
   * Fetch clause boundaries for a document
   */
  async fetchClauses(documentId: string): Promise<ClauseBoundary[]> {
    return fetchClauses(this.supabase, documentId)
  }

  /**
   * Fetch clause match results for a document
   */
  async fetchMatchResults(documentId: string): Promise<ClauseMatchResult[]> {
    return fetchMatchResults(this.supabase, documentId)
  }

  /**
   * Create identity match result
   */
  async createIdentityMatchResult(
    documentId: string,
    identityResult: IdentityTermResult
  ): Promise<{ id: string } | null> {
    return createIdentityMatchResult(this.supabase, documentId, identityResult)
  }

  /**
   * Create missing term result
   */
  async createMissingTermResult(
    documentId: string,
    missingTerm: PreAgreedTerm
  ): Promise<{ id: string } | null> {
    return createMissingTermResult(this.supabase, documentId, missingTerm)
  }

  /**
   * Batch update clause match results
   */
  async batchUpdateMatchResults(updates: BatchUpdateItem[]): Promise<number> {
    return batchUpdateMatchResults(this.supabase, updates)
  }

  /**
   * Create a discrepancy record
   */
  async createDiscrepancy(input: DiscrepancyInput): Promise<boolean> {
    return createDiscrepancy(this.supabase, input)
  }

  /**
   * Insert review queue item
   */
  async insertReviewQueueItem(input: ReviewQueueInput): Promise<boolean> {
    return insertReviewQueueItem(this.supabase, input)
  }

  /**
   * Mark P1 reconciliation as complete
   */
  async markP1Complete(documentId: string): Promise<void> {
    return markP1Complete(this.supabase, documentId)
  }

  /**
   * Save extracted clauses to clause_boundaries
   */
  async saveExtractedClauses(
    documentId: string,
    tenantId: string,
    clauses: ExtractedClauseInput[]
  ): Promise<SaveClausesResult> {
    return saveExtractedClauses(this.supabase, documentId, tenantId, clauses)
  }

  /**
   * Update document with extracted text
   */
  async updateDocumentExtractedText(
    documentId: string,
    extractedText: string
  ): Promise<void> {
    return updateDocumentExtractedText(this.supabase, documentId, extractedText)
  }
}

/**
 * Factory function to create a DatabaseAdapter instance
 */
export function createDatabaseAdapter(supabase: any): DatabaseAdapter {
  return new DatabaseAdapter(supabase)
}
