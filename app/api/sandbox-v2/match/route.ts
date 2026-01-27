/**
 * Match API Route
 *
 * POST - Match clause text with risk resolution and optional PAT context
 */

import { NextRequest, NextResponse } from 'next/server'
import { matchClause } from '@/lib/sandbox-v2/matching-service'
import type { MatchRequest, PATContext } from '@/lib/sandbox-v2/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { text, pat_context, record_result, similarity_threshold, max_results } = body

    // Validate required fields
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing required field: text (string)' },
        { status: 400 }
      )
    }

    if (text.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Text cannot be empty' },
        { status: 400 }
      )
    }

    // Validate PAT context if provided
    let validatedPATContext: PATContext | undefined
    if (pat_context) {
      if (!pat_context.term_category || !pat_context.expected_value) {
        return NextResponse.json(
          {
            success: false,
            error: 'PAT context requires term_category and expected_value',
          },
          { status: 400 }
        )
      }
      validatedPATContext = {
        term_category: String(pat_context.term_category),
        expected_value: String(pat_context.expected_value),
        is_mandatory: Boolean(pat_context.is_mandatory ?? true),
      }
    }

    // Build match request
    const matchRequest: MatchRequest = {
      text: text.trim(),
      pat_context: validatedPATContext,
      record_result: Boolean(record_result),
      similarity_threshold:
        typeof similarity_threshold === 'number' ? similarity_threshold : undefined,
      max_results: typeof max_results === 'number' ? max_results : undefined,
    }

    // Execute matching
    const result = await matchClause(matchRequest)

    return NextResponse.json({
      success: true,
      data: {
        all_matches: result.all_matches,
        resolved_match: result.resolved_match,
        rag_library: result.rag_library,
        rag_pat: result.rag_pat,
        rag_final: result.rag_final,
        pat_override_applied: result.pat_override_applied,
        escalation_needed: result.escalation_needed,
        escalation_type: result.escalation_type,
        ...(result.match_result_id && { match_result_id: result.match_result_id }),
        ...(result.review_entry_id && { review_entry_id: result.review_entry_id }),
      },
    })
  } catch (error) {
    console.error('Match POST error:', error)

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('OPENAI_API_KEY')) {
        return NextResponse.json(
          { success: false, error: 'Embedding service not configured' },
          { status: 503 }
        )
      }
      if (error.message.includes('Similarity search failed')) {
        return NextResponse.json(
          { success: false, error: 'Database search failed. Ensure sandbox_v2 schema is set up.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
