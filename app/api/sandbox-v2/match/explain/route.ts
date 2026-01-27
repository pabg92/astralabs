/**
 * Match Explanation API
 *
 * POST /api/sandbox-v2/match/explain
 * Generates an AI explanation for why two clauses match at a given similarity.
 *
 * @module app/api/sandbox-v2/match/explain/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateMatchExplanation } from '@/lib/sandbox-v2/explanation-service'
import type { ExplainMatchRequest, MatchExplanation } from '@/lib/sandbox-v2/types'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExplainMatchRequest

    // Validate required fields
    if (!body.inputText || !body.matchedText || body.similarity === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: inputText, matchedText, similarity',
        },
        { status: 400 }
      )
    }

    // Validate similarity range
    if (body.similarity < 0 || body.similarity > 1) {
      return NextResponse.json(
        {
          success: false,
          error: 'Similarity must be between 0 and 1',
        },
        { status: 400 }
      )
    }

    // Get API key
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Gemini API key not configured',
        },
        { status: 500 }
      )
    }

    // Generate explanation
    const explanation: MatchExplanation = await generateMatchExplanation(
      body.inputText,
      body.matchedText,
      body.similarity,
      apiKey
    )

    return NextResponse.json({
      success: true,
      data: explanation,
    })
  } catch (error) {
    console.error('Match explanation error:', error)

    const message = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      {
        success: false,
        error: `Failed to generate explanation: ${message}`,
      },
      { status: 500 }
    )
  }
}
