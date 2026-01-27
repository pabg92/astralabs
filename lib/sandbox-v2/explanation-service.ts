/**
 * Match Explanation Service
 *
 * Generates AI-powered explanations for why two legal clauses
 * match at a given similarity percentage.
 *
 * @module lib/sandbox-v2/explanation-service
 */

import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import type { MatchExplanation } from './types'
import { V2_THRESHOLDS } from './thresholds'

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

const EXPLANATION_MODEL = 'gemini-2.5-flash'
const TIMEOUT_MS = 30000

// ============================================================================
// ZOD SCHEMA
// ============================================================================

const ExplanationResponseSchema = z.object({
  summary: z.string(),
  keyOverlap: z.array(z.string()),
  keyDifferences: z.array(z.string()),
  semanticAnalysis: z.string(),
})

// ============================================================================
// JSON SCHEMA FOR GEMINI
// ============================================================================

const EXPLANATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: '1-2 sentence explanation of why these clauses match',
    },
    keyOverlap: {
      type: 'array',
      items: { type: 'string' },
      description: '3-5 shared legal terms or concepts',
    },
    keyDifferences: {
      type: 'array',
      items: { type: 'string' },
      description: 'Notable differences that reduce similarity',
    },
    semanticAnalysis: {
      type: 'string',
      description: 'Detailed explanation of semantic relationship',
    },
  },
  required: ['summary', 'keyOverlap', 'keyDifferences', 'semanticAnalysis'],
}

// ============================================================================
// PROMPT
// ============================================================================

function buildExplanationPrompt(
  inputText: string,
  matchedText: string,
  similarity: number
): string {
  const similarityPct = (similarity * 100).toFixed(1)

  return `<role>
You are a legal AI assistant that explains semantic similarity between contract clauses. Your task is to explain WHY two clauses have a ${similarityPct}% similarity score.
</role>

<context>
Similarity is computed using vector embeddings that capture semantic meaning, not just word overlap. A high similarity means the clauses convey similar legal concepts and obligations, even if worded differently.

Thresholds:
- GREEN (≥${V2_THRESHOLDS.GREEN * 100}%): Strong match - clauses are semantically equivalent
- AMBER (${V2_THRESHOLDS.AMBER * 100}%-${V2_THRESHOLDS.GREEN * 100 - 0.1}%): Partial match - related but with notable differences
- RED (<${V2_THRESHOLDS.AMBER * 100}%): Weak match - different legal concepts
</context>

<input_clause>
${inputText}
</input_clause>

<matched_clause>
${matchedText}
</matched_clause>

<similarity>${similarityPct}%</similarity>

<instructions>
Analyze why these two clauses have ${similarityPct}% semantic similarity:

1. SUMMARY: Write 1-2 sentences explaining the core reason for this match level
2. KEY_OVERLAP: List 3-5 specific legal terms, concepts, or obligations they share
3. KEY_DIFFERENCES: List specific differences that prevent a higher similarity score (if any)
4. SEMANTIC_ANALYSIS: Provide a detailed paragraph explaining the semantic relationship

Focus on legal substance (obligations, rights, conditions, timeframes) rather than superficial wording.
</instructions>

Return JSON only.`
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Generate an explanation for why two clauses match at a given similarity
 */
export async function generateMatchExplanation(
  inputText: string,
  matchedText: string,
  similarity: number,
  apiKey: string
): Promise<MatchExplanation> {
  const client = new GoogleGenAI({ apiKey })
  const prompt = buildExplanationPrompt(inputText, matchedText, similarity)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await client.models.generateContent({
      model: EXPLANATION_MODEL,
      contents: prompt,
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: EXPLANATION_JSON_SCHEMA,
        abortSignal: controller.signal,
      },
    })

    const text = response.text
    if (!text) {
      throw new Error('Empty response from Gemini')
    }

    const parsed = JSON.parse(text)
    const validated = ExplanationResponseSchema.safeParse(parsed)

    if (!validated.success) {
      console.error('Explanation validation failed:', validated.error)
      throw new Error('Invalid response format from Gemini')
    }

    // Build threshold context string
    const similarityPct = similarity * 100
    let thresholdContext: string
    if (similarityPct >= V2_THRESHOLDS.GREEN * 100) {
      thresholdContext = `${similarityPct.toFixed(1)}% = GREEN (strong match, ≥${V2_THRESHOLDS.GREEN * 100}%)`
    } else if (similarityPct >= V2_THRESHOLDS.AMBER * 100) {
      thresholdContext = `${similarityPct.toFixed(1)}% = AMBER (partial match, ${V2_THRESHOLDS.AMBER * 100}-${V2_THRESHOLDS.GREEN * 100 - 0.1}%)`
    } else {
      thresholdContext = `${similarityPct.toFixed(1)}% = RED (weak match, <${V2_THRESHOLDS.AMBER * 100}%)`
    }

    return {
      summary: validated.data.summary,
      keyOverlap: validated.data.keyOverlap,
      keyDifferences: validated.data.keyDifferences,
      thresholdContext,
      semanticAnalysis: validated.data.semanticAnalysis,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
