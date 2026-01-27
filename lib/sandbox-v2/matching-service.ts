/**
 * Sandbox V2 Matching Service
 *
 * Implements the three-tier clause architecture matching logic:
 * 1. "Highest risk wins" - prioritizes risk level over similarity
 * 2. PAT override hierarchy - surfaces both pre-agreed mismatch AND market-risk
 * 3. HITL queue - escalates uncertain matches for human review
 *
 * @module lib/sandbox-v2/matching-service
 */

import { supabaseServer } from '@/lib/supabase/server'
import { V2_THRESHOLDS } from './thresholds'
import {
  type RiskLevel,
  type RAGStatus,
  type EscalationType,
  type MatchEntry,
  type MatchingResult,
  type MatchRequest,
  type PATContext,
  type P1ComparisonResult,
  type PatternReviewEntry,
  type SimilarPatternInfo,
  RISK_WEIGHTS,
} from './types'

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

/**
 * Generate embedding for text using OpenAI API
 * Uses 1024-dimensional embeddings for sandbox (smaller than production 3072)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for embedding generation')
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: text.substring(0, 2000), // Truncate to max chars
      dimensions: 1024, // Smaller for sandbox
      encoding_format: 'float',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

// ============================================================================
// RISK-BASED MATCHING
// ============================================================================

/**
 * Compare two matches using "highest risk wins" logic
 * Priority: risk_level DESC (high > medium > low), then similarity DESC
 */
export function compareMatches(a: MatchEntry, b: MatchEntry): number {
  const riskDiff = RISK_WEIGHTS[b.risk_level] - RISK_WEIGHTS[a.risk_level]
  if (riskDiff !== 0) return riskDiff
  return b.similarity - a.similarity
}

/**
 * Find similar clauses using the RPC function with risk resolution
 */
export async function findSimilarWithRiskResolution(
  queryEmbedding: number[],
  similarityThreshold: number = V2_THRESHOLDS.MIN_SIMILARITY,
  maxResults: number = 10
): Promise<MatchEntry[]> {
  // Format embedding as PostgreSQL vector literal
  const embeddingLiteral = `[${queryEmbedding.join(',')}]`

  const { data, error } = await supabaseServer.rpc(
    'find_similar_with_risk_resolution' as 'get_feature_flags', // Type workaround for custom schema
    {
      p_query_embedding: embeddingLiteral,
      p_similarity_threshold: similarityThreshold,
      p_max_results: maxResults,
    }
  )

  if (error) {
    console.error('Error calling find_similar_with_risk_resolution:', error)
    throw new Error(`Similarity search failed: ${error.message}`)
  }

  // Map database result to MatchEntry type
  return (data as unknown as Array<{
    lcstx_id: string
    variant_code: string
    risk_level: RiskLevel
    similarity: number
    match_rank: number
    lcl_concept_code: string
    lcl_category: string
    canonical_text: string
    plain_english: string | null
    suggested_rewrite: string | null
  }>).map((row) => ({
    lcstx_id: row.lcstx_id,
    variant_code: row.variant_code,
    risk_level: row.risk_level,
    similarity: row.similarity,
    match_rank: row.match_rank,
    lcl_concept_code: row.lcl_concept_code,
    lcl_category: row.lcl_category,
    canonical_text: row.canonical_text,
    plain_english: row.plain_english ?? undefined,
    suggested_rewrite: row.suggested_rewrite ?? undefined,
  }))
}

// ============================================================================
// RAG STATUS CALCULATION
// ============================================================================

/**
 * Calculate library RAG status based on similarity score
 */
export function calculateLibraryRAG(similarity: number | null): RAGStatus {
  if (similarity === null || similarity < V2_THRESHOLDS.AMBER) {
    return 'RED'
  }
  if (similarity >= V2_THRESHOLDS.GREEN) {
    return 'GREEN'
  }
  return 'AMBER'
}

/**
 * Convert P1 comparison result to RAG status
 */
export function p1ResultToRAG(result: P1ComparisonResult): RAGStatus {
  if (result.matches && result.severity === 'none') {
    return 'GREEN'
  }
  if (result.matches && result.severity === 'minor') {
    return 'AMBER'
  }
  return 'RED'
}

/**
 * Calculate final RAG status by combining library and PAT statuses
 * Rules:
 * - Either RED → RED
 * - Both GREEN → GREEN
 * - Otherwise → AMBER
 */
export function calculateFinalRAG(
  ragLibrary: RAGStatus,
  ragPat: RAGStatus | null
): RAGStatus {
  // If no PAT context, use library status directly
  if (ragPat === null) {
    return ragLibrary
  }

  // Either RED → RED
  if (ragPat === 'RED' || ragLibrary === 'RED') {
    return 'RED'
  }

  // Both GREEN → GREEN
  if (ragPat === 'GREEN' && ragLibrary === 'GREEN') {
    return 'GREEN'
  }

  // Otherwise AMBER
  return 'AMBER'
}

// ============================================================================
// PAT COMPARISON
// ============================================================================

/**
 * Compare clause text against PAT using Gemini/GPT adapter
 * Uses the actual P1 adapter for realistic testing
 */
export async function compareToPAT(
  clauseText: string,
  patContext: PATContext
): Promise<P1ComparisonResult> {
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  const openaiApiKey = process.env.OPENAI_API_KEY

  // Use a simple prompt-based comparison for sandbox
  // In production, this would use the full P1 adapter
  const apiKey = geminiApiKey || openaiApiKey
  if (!apiKey) {
    console.warn('No API key for PAT comparison, returning default match')
    return {
      matches: true,
      severity: 'minor',
      confidence: 0.5,
      explanation: 'No API key available for comparison',
    }
  }

  try {
    // Use Gemini if available, otherwise OpenAI
    if (geminiApiKey) {
      return await compareToPATWithGemini(clauseText, patContext, geminiApiKey)
    } else {
      return await compareToPATWithOpenAI(clauseText, patContext, openaiApiKey!)
    }
  } catch (error) {
    console.error('PAT comparison error:', error)
    return {
      matches: false,
      severity: 'major',
      confidence: 0.5,
      explanation: `Comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

async function compareToPATWithGemini(
  clauseText: string,
  patContext: PATContext,
  apiKey: string
): Promise<P1ComparisonResult> {
  const prompt = buildComparisonPrompt(clauseText, patContext)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  return parseComparisonResponse(text)
}

async function compareToPATWithOpenAI(
  clauseText: string,
  patContext: PATContext,
  apiKey: string
): Promise<P1ComparisonResult> {
  const prompt = buildComparisonPrompt(clauseText, patContext)

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || '{}'
  return parseComparisonResponse(text)
}

function buildComparisonPrompt(clauseText: string, patContext: PATContext): string {
  return `Compare this contract clause against the pre-agreed term (PAT).

CONTRACT CLAUSE:
${clauseText}

PRE-AGREED TERM:
Category: ${patContext.term_category}
Expected Value: ${patContext.expected_value}
Mandatory: ${patContext.is_mandatory ? 'Yes' : 'No'}

Analyze whether the contract clause matches the pre-agreed term.

Return JSON with:
{
  "matches": true/false (does the clause align with the PAT?),
  "severity": "none" | "minor" | "major" (if deviation, how significant?),
  "confidence": 0.0-1.0 (your confidence in this assessment),
  "explanation": "Brief explanation of the comparison result"
}

If the clause matches the PAT exactly or closely, matches=true and severity="none".
If there's a small deviation that might be acceptable, matches=true and severity="minor".
If there's a significant deviation or conflict, matches=false and severity="major".`
}

function parseComparisonResponse(text: string): P1ComparisonResult {
  try {
    const parsed = JSON.parse(text)
    return {
      matches: Boolean(parsed.matches),
      severity: ['none', 'minor', 'major'].includes(parsed.severity)
        ? parsed.severity
        : 'major',
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
      explanation: String(parsed.explanation || 'No explanation provided'),
    }
  } catch {
    return {
      matches: false,
      severity: 'major',
      confidence: 0,
      explanation: 'Failed to parse comparison response',
    }
  }
}

// ============================================================================
// ESCALATION LOGIC
// ============================================================================

/**
 * Determine escalation type based on matching results
 *
 * | Condition | Escalation Type |
 * |-----------|-----------------|
 * | No match found | `new_pattern` |
 * | Similarity < 0.70 | `low_confidence` |
 * | 0.70 ≤ Similarity < 0.85 | `variant_candidate` |
 * | PAT status = RED | `pat_conflict` |
 */
export function determineEscalationType(
  matches: MatchEntry[],
  ragPat: RAGStatus | null
): { needed: boolean; type: EscalationType | null } {
  // No matches at all → new pattern
  if (matches.length === 0) {
    return { needed: true, type: 'new_pattern' }
  }

  const bestMatch = matches[0]

  // PAT conflict always escalates
  if (ragPat === 'RED') {
    return { needed: true, type: 'pat_conflict' }
  }

  // Low confidence match
  if (bestMatch.similarity < V2_THRESHOLDS.LOW_CONFIDENCE) {
    return { needed: true, type: 'low_confidence' }
  }

  // Potential variant candidate (high similarity but might be new pattern)
  if (bestMatch.similarity >= V2_THRESHOLDS.LOW_CONFIDENCE &&
      bestMatch.similarity < V2_THRESHOLDS.PATTERN_CANDIDATE) {
    return { needed: true, type: 'variant_candidate' }
  }

  // No escalation needed
  return { needed: false, type: null }
}

// ============================================================================
// RESULT PERSISTENCE
// ============================================================================

/**
 * Store match result in database
 */
export async function storeMatchResult(
  inputText: string,
  matches: MatchEntry[],
  resolvedMatch: MatchEntry | null,
  ragLibrary: RAGStatus,
  ragPat: RAGStatus | null,
  ragFinal: RAGStatus,
  patContext: PATContext | null,
  patOverrideApplied: boolean,
  escalationNeeded: boolean,
  escalationType: EscalationType | null
): Promise<string> {
  const { data, error } = await supabaseServer
    .from('match_results' as 'deals') // Type workaround for custom schema
    .insert({
      input_text: inputText,
      all_matches: matches,
      resolved_lcstx_id: resolvedMatch?.lcstx_id || null,
      resolved_similarity: resolvedMatch?.similarity || null,
      resolved_risk_level: resolvedMatch?.risk_level || null,
      rag_library: ragLibrary,
      rag_pat: ragPat,
      rag_final: ragFinal,
      pat_context: patContext,
      pat_override_applied: patOverrideApplied,
      escalation_needed: escalationNeeded,
      escalation_type: escalationType,
    } as unknown)
    .select('id')
    .single()

  if (error) {
    console.error('Error storing match result:', error)
    throw new Error(`Failed to store match result: ${error.message}`)
  }

  return (data as unknown as { id: string }).id
}

/**
 * Create an entry in the pattern review queue
 */
export async function createReviewEntry(
  inputText: string,
  proposedLcstxId: string | null,
  similarityScore: number | null,
  reviewType: EscalationType,
  similarPatterns: SimilarPatternInfo[],
  matchResultId: string | null
): Promise<string> {
  const { data, error } = await supabaseServer
    .from('pattern_review_queue' as 'deals') // Type workaround for custom schema
    .insert({
      input_text: inputText,
      proposed_lcstx_id: proposedLcstxId,
      similarity_score: similarityScore,
      review_type: reviewType,
      similar_patterns: similarPatterns,
      status: 'pending',
      match_result_id: matchResultId,
    } as unknown)
    .select('id')
    .single()

  if (error) {
    console.error('Error creating review entry:', error)
    throw new Error(`Failed to create review entry: ${error.message}`)
  }

  return (data as unknown as { id: string }).id
}

// ============================================================================
// MAIN MATCHING FUNCTION
// ============================================================================

/**
 * Main matching function - implements full matching pipeline
 *
 * 1. Generate embedding for input text
 * 2. Find similar clauses using risk resolution
 * 3. Calculate library RAG status
 * 4. Compare to PAT if context provided
 * 5. Calculate final RAG status
 * 6. Determine if escalation needed
 * 7. Optionally store results and create review entry
 */
export async function matchClause(request: MatchRequest): Promise<MatchingResult> {
  const {
    text,
    pat_context,
    record_result = false,
    similarity_threshold = V2_THRESHOLDS.MIN_SIMILARITY,
    max_results = 10,
  } = request

  // 1. Generate embedding
  const embedding = await generateEmbedding(text)

  // 2. Find similar clauses with risk resolution
  const matches = await findSimilarWithRiskResolution(
    embedding,
    similarity_threshold,
    max_results
  )

  // 3. Get resolved match (first in risk-ordered list)
  const resolvedMatch = matches.length > 0 ? matches[0] : null

  // 4. Calculate library RAG status
  const ragLibrary = calculateLibraryRAG(resolvedMatch?.similarity || null)

  // 5. Compare to PAT if context provided
  let ragPat: RAGStatus | null = null
  let patOverrideApplied = false

  if (pat_context && resolvedMatch) {
    const patResult = await compareToPAT(
      resolvedMatch.canonical_text || text,
      pat_context
    )
    ragPat = p1ResultToRAG(patResult)
    patOverrideApplied = ragPat !== ragLibrary
  }

  // 6. Calculate final RAG status
  const ragFinal = calculateFinalRAG(ragLibrary, ragPat)

  // 7. Determine escalation
  const escalation = determineEscalationType(matches, ragPat)

  // 8. Build result
  const result: MatchingResult = {
    all_matches: matches,
    resolved_match: resolvedMatch,
    rag_library: ragLibrary,
    rag_pat: ragPat,
    rag_final: ragFinal,
    pat_override_applied: patOverrideApplied,
    escalation_needed: escalation.needed,
    escalation_type: escalation.type,
  }

  // 9. Store results if requested
  if (record_result) {
    const matchResultId = await storeMatchResult(
      text,
      matches,
      resolvedMatch,
      ragLibrary,
      ragPat,
      ragFinal,
      pat_context || null,
      patOverrideApplied,
      escalation.needed,
      escalation.type
    )
    result.match_result_id = matchResultId

    // 10. Create review entry if escalation needed
    if (escalation.needed && escalation.type) {
      const similarPatterns: SimilarPatternInfo[] = matches.slice(0, 3).map((m) => ({
        variant_code: m.variant_code,
        pattern: m.canonical_text || '',
        similarity: m.similarity,
      }))

      const reviewEntryId = await createReviewEntry(
        text,
        resolvedMatch?.lcstx_id || null,
        resolvedMatch?.similarity || null,
        escalation.type,
        similarPatterns,
        matchResultId
      )
      result.review_entry_id = reviewEntryId
    }
  }

  return result
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get dashboard statistics
 */
export async function getSandboxStats() {
  const { data, error } = await supabaseServer.rpc(
    'get_sandbox_stats' as 'get_feature_flags' // Type workaround
  )

  if (error) {
    console.error('Error getting sandbox stats:', error)
    throw new Error(`Failed to get stats: ${error.message}`)
  }

  return (data as unknown[])[0]
}
