import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { generateEmbedding, embeddingToVectorString, createEmbeddingConfig } from '@/lib/sandbox/embedding-service'
import { SANDBOX_THRESHOLDS } from '@/lib/sandbox/matching-service'

interface SimilarClause {
  clause_id: string
  clause_type: string
  category: string | null
  standard_text: string
  similarity: number
  match_category: string
  classification: string
}

/**
 * POST /api/sandbox/match
 * Find similar clauses for given input text
 * Body: { text: string, threshold?: number, max_results?: number, record_result?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      text,
      threshold = SANDBOX_THRESHOLDS.MIN_SIMILARITY,
      max_results = 5,
      record_result = false,
    } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing required field: text' },
        { status: 400 }
      )
    }

    // Generate embedding for input text
    const config = createEmbeddingConfig()
    const startTime = Date.now()
    const { embedding, tokens } = await generateEmbedding(text, config)
    const embeddingTime = Date.now() - startTime
    const embeddingString = embeddingToVectorString(embedding)

    // Call sandbox similarity search function
    const searchStart = Date.now()
    const { data: matches, error } = await supabaseServer.schema('sandbox').rpc('find_similar_clauses', {
      p_query_embedding: embeddingString,
      p_similarity_threshold: threshold,
      p_max_results: max_results,
    })
    const searchTime = Date.now() - searchStart

    if (error) {
      console.error('[POST /api/sandbox/match] Search error:', error)
      return NextResponse.json(
        { success: false, error: `Similarity search failed: ${error.message}` },
        { status: 500 }
      )
    }

    const typedMatches = (matches || []) as SimilarClause[]
    const topMatch = typedMatches.length > 0 ? typedMatches[0] : null

    // Determine escalation
    let escalation_needed = false
    let escalation_type: 'new_clause' | 'potential_variant' | null = null

    if (!topMatch || topMatch.similarity < SANDBOX_THRESHOLDS.PARTIAL) {
      escalation_needed = true
      escalation_type = 'new_clause'
    } else if (
      topMatch.similarity >= SANDBOX_THRESHOLDS.REVIEW_REQUIRED &&
      topMatch.similarity < SANDBOX_THRESHOLDS.AUTO_MERGE
    ) {
      escalation_needed = true
      escalation_type = 'potential_variant'
    }

    // Optionally record the result
    let result_id: string | null = null
    if (record_result) {
      const { data: recordedResult, error: recordError } = await supabaseServer
        .schema('sandbox')
        .from('clause_match_results')
        .insert({
          input_text: text,
          input_embedding: embeddingString,
          matched_clause_id: topMatch?.clause_id || null,
          matched_clause_text: topMatch?.standard_text || null,
          similarity_score: topMatch?.similarity || 0,
          match_category: topMatch?.match_category || 'unique',
          classification: topMatch?.classification || 'RED',
        })
        .select('id')
        .single()

      if (!recordError && recordedResult) {
        result_id = recordedResult.id
      }
    }

    // Add to review queue if escalation needed and recording
    let review_queue_id: string | null = null
    if (escalation_needed && record_result) {
      const { data: queueItem, error: queueError } = await supabaseServer
        .schema('sandbox')
        .from('admin_review_queue')
        .insert({
          input_text: text,
          input_embedding: embeddingString,
          matched_clause_id: topMatch?.clause_id || null,
          similarity_score: topMatch?.similarity || 0,
          review_type: escalation_type,
          status: 'pending',
        })
        .select('id')
        .single()

      if (!queueError && queueItem) {
        review_queue_id = queueItem.id
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        input_text: text,
        matches: typedMatches,
        top_match: topMatch,
        escalation_needed,
        escalation_type,
        tokens_used: tokens,
        timing: {
          embedding_ms: embeddingTime,
          search_ms: searchTime,
          total_ms: embeddingTime + searchTime,
        },
        result_id,
        review_queue_id,
      },
    })
  } catch (error) {
    console.error('[POST /api/sandbox/match] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/sandbox/match
 * Get match history
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const { data, error, count } = await supabaseServer
      .schema('sandbox')
      .from('clause_match_results')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch match history: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: count || 0,
      pagination: {
        limit,
        offset,
        total: count || 0,
      },
    })
  } catch (error) {
    console.error('[GET /api/sandbox/match] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
