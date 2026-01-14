/**
 * Gemini P1 Adapter
 *
 * Handles Gemini API interactions for P1 reconciliation.
 * Mirrors the interface of gpt-adapter.ts for drop-in replacement.
 *
 * @module adapters/gemini-p1-adapter
 */

import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'

import type {
  BatchComparison,
  BatchResult,
  NormalizedTerm,
  PreAgreedTerm,
  DeviationSeverity,
} from '../types/p1-types.js'
import type { TypedSupabaseClient } from '../types/supabase.js'
import { withRetry, isTransientError, sleep } from '../utils/retry'
import {
  BATCH_SIZE,
  BASE_TIMEOUT_MS,
  PER_COMPARISON_MS,
  MAX_TIMEOUT_MS,
  MAX_RETRIES,
  BACKOFF_MULTIPLIER,
  MAX_BACKOFF_MS,
} from '../config/p1-config'

// ============ TYPES ============

export type GeminiP1Model =
  | 'gemini-3-flash-preview'
  | 'gemini-3-flash'
  | 'gemini-3-pro-preview'
  | 'gemini-2.5-flash'

// ============ ZOD SCHEMAS FOR STRUCTURED OUTPUT ============

const BatchResultSchema = z.object({
  idx: z.number(),
  matches: z.boolean(),
  severity: z.enum(['none', 'minor', 'major']),
  explanation: z.string(),
  differences: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

const BatchResponseSchema = z.object({
  results: z.array(BatchResultSchema),
})

const NormalizationResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      term_category: z.string().optional(),
      clause_type_guess: z.string().optional(),
      description: z.string().optional(),
      expected_value: z.string().optional(),
      is_mandatory: z.boolean().optional(),
    })
  ),
})

// ============ ERROR HANDLING ============

export class GeminiP1Error extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message)
    this.name = 'GeminiP1Error'
  }
}

/**
 * Check if an error from Gemini is retryable
 */
export function isRetryableGeminiP1Error(error: unknown): boolean {
  if (isTransientError(error)) return true
  if (error instanceof GeminiP1Error) return error.retryable

  const message = String((error as Error)?.message || '')

  // Rate limiting
  if (/rate.?limit|429|quota|resource.?exhausted/i.test(message)) return true
  // Server errors
  if (/5\d\d|server.?error|overloaded|unavailable/i.test(message)) return true
  // Timeouts
  if (/timeout|aborted|deadline/i.test(message)) return true
  // JSON parse errors (response truncation)
  if (/JSON.?(parse|error)|unterminated|unexpected.?end/i.test(message)) return true
  // Network errors
  if (/fetch.?failed|ECONNRESET|ECONNREFUSED|network/i.test(message)) return true

  return false
}

// ============ UTILITY FUNCTIONS ============

/**
 * Calculate timeout based on batch size
 */
export function calculateTimeout(comparisonCount: number): number {
  return Math.min(
    BASE_TIMEOUT_MS + comparisonCount * PER_COMPARISON_MS,
    MAX_TIMEOUT_MS
  )
}

/**
 * Convert Zod schema to JSON Schema for Gemini's responseSchema
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Use Zod's built-in JSON schema generation if available
  if ('toJSONSchema' in z && typeof (z as unknown as { toJSONSchema: (s: z.ZodType) => Record<string, unknown> }).toJSONSchema === 'function') {
    return (z as unknown as { toJSONSchema: (s: z.ZodType) => Record<string, unknown> }).toJSONSchema(schema)
  }

  // Fallback: manual schema for our specific types
  return {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            idx: { type: 'number' },
            matches: { type: 'boolean' },
            severity: { type: 'string', enum: ['none', 'minor', 'major'] },
            explanation: { type: 'string' },
            differences: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number' },
          },
          required: ['idx', 'matches', 'severity', 'explanation', 'differences', 'confidence'],
        },
      },
    },
    required: ['results'],
  }
}

// ============ PROMPTS ============

const NORMALIZATION_SYSTEM_PROMPT = `You are a contract term normalizer. Normalize pre-agreed terms (PATs) to reduce typos and map to known categories.

Return JSON {"results":[{"id":"...","term_category":"<normalized>","clause_type_guess":"<payment_terms|exclusivity|usage_rights|approval|posting_schedule|compliance|content_standards|analytics|delivery_deadline|pre_production|usage_licensing>","description":"<cleaned description>","expected_value":"<cleaned value>","is_mandatory":true/false}]}`

const COMPARISON_SYSTEM_PROMPT = `You are a contract compliance checker comparing contract clauses against pre-agreed terms.

IMPORTANT: This comparison is for SEMANTIC/LEGAL terms only (payments, exclusivity, deliverables, etc.).
Identity terms (Brand Name, Talent Name, Agency) are handled separately and will NOT appear in this batch.

For each comparison, determine if the clause satisfies the term:

**GREEN (matches=true, severity="none"):** Clause fully satisfies the term requirements.
**AMBER (matches=true, severity="minor"):** Clause partially satisfies but has minor deviations:
  - Timing slightly off (e.g., 45 days vs 30 days)
  - Amount close but not exact
  - Scope slightly broader/narrower than expected
  - Minor wording differences that don't change intent
**RED (matches=false, severity="major"):** Clause conflicts with term OR term requirements absent:
  - Contradictory requirements
  - Missing critical elements specified in the term
  - Fundamentally different scope/intent

PLACEHOLDER HANDLING: Ignore template placeholders like [PARTY A], [PARTY B], [BRAND NAME], [AMOUNT] in
library clauses. Focus on the semantic meaning and legal obligations, not exact party identifiers.

Use AMBER for close-but-not-exact matches. Use RED only for clear conflicts or missing requirements.
Be strict for [MANDATORY] terms. Be concise.

IMPORTANT: Return results for ALL comparisons. Output format:
{"results":[{"idx":0,"matches":true,"severity":"none","explanation":"<15 words>","differences":[],"confidence":0.95},{"idx":1,...},...]}
`

// ============ API CALLS ============

/**
 * Call Gemini with retry logic
 */
async function callGeminiWithRetry(
  client: GoogleGenAI,
  model: GeminiP1Model,
  prompt: string,
  jsonSchema: Record<string, unknown>,
  timeout: number
): Promise<string> {
  return withRetry(
    async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        const response = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: jsonSchema,
            abortSignal: controller.signal,
          },
        })

        const text = response.text
        if (!text) {
          throw new GeminiP1Error('Empty response from Gemini', 'EMPTY_RESPONSE', true)
        }
        return text
      } finally {
        clearTimeout(timeoutId)
      }
    },
    {
      maxRetries: MAX_RETRIES,
      initialDelayMs: 1000,
      maxDelayMs: MAX_BACKOFF_MS,
      backoffMultiplier: BACKOFF_MULTIPLIER,
    },
    isRetryableGeminiP1Error,
    'gemini-p1-call'
  )
}

/**
 * Normalize PAT terms via Gemini
 */
export async function normalizePatTermsGemini(
  terms: PreAgreedTerm[],
  apiKey: string,
  model: GeminiP1Model = 'gemini-2.5-flash',
  supabase?: TypedSupabaseClient
): Promise<PreAgreedTerm[]> {
  if (!terms.length) return terms

  // Check which terms need normalization
  const needsNormalization = terms.filter((t) => {
    if (!t.normalized_at) return true
    if (!t.updated_at) return true
    const updatedAt = new Date(t.updated_at)
    const normalizedAt = new Date(t.normalized_at)
    return updatedAt > normalizedAt
  })

  // Use cached values for already-normalized terms
  const cachedTerms = terms.filter((t) => !needsNormalization.includes(t))
  const cachedResults = cachedTerms.map((t) => ({
    ...t,
    normalized_term_category: t.normalized_value || t.term_category,
    normalized_clause_type: undefined,
  }))

  if (needsNormalization.length === 0) {
    console.log(`   ✓ All ${terms.length} PATs using cached normalization`)
    return cachedResults
  }

  console.log(
    `   Normalizing ${needsNormalization.length}/${terms.length} PATs via Gemini (${cachedTerms.length} cached)`
  )

  const payload = needsNormalization.map((t) => ({
    id: t.id,
    term_category: t.term_category,
    description: t.term_description,
    expected_value: t.expected_value,
    is_mandatory: t.is_mandatory,
  }))

  try {
    const client = new GoogleGenAI({ apiKey })
    const prompt = `${NORMALIZATION_SYSTEM_PROMPT}

Normalize these PATs:
${JSON.stringify(payload, null, 0)}

Use the closest known term_category; leave clause_type_guess empty if unsure; keep unknown fields as-is. Output JSON only.`

    const normalizationSchema = {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              term_category: { type: 'string' },
              clause_type_guess: { type: 'string' },
              description: { type: 'string' },
              expected_value: { type: 'string' },
              is_mandatory: { type: 'boolean' },
            },
            required: ['id'],
          },
        },
      },
      required: ['results'],
    }

    const responseText = await callGeminiWithRetry(
      client,
      model,
      prompt,
      normalizationSchema,
      30000 // 30s timeout for normalization
    )

    const parsed = JSON.parse(responseText)
    const validated = NormalizationResultSchema.safeParse(parsed)

    if (!validated.success) {
      console.warn('⚠️ Gemini normalization response validation failed:', validated.error)
      return terms
    }

    const normalized: NormalizedTerm[] = validated.data.results
    const normalizedById = new Map<string, NormalizedTerm>()
    for (const n of normalized) {
      if (n?.id) normalizedById.set(n.id, n)
    }

    // Cache normalized values
    if (supabase) {
      const now = new Date().toISOString()
      for (const n of normalized) {
        if (n?.id && n?.term_category) {
          await supabase
            .from('pre_agreed_terms')
            .update({
              normalized_value: n.term_category,
              normalized_at: now,
            })
            .eq('id', n.id)
        }
      }
    }

    // Build results for freshly normalized terms
    const freshResults = needsNormalization.map((t) => {
      const n = normalizedById.get(t.id)
      if (!n) return t
      return {
        ...t,
        normalized_term_category: n.term_category || t.term_category,
        normalized_clause_type: n.clause_type_guess,
        term_description: n.description || t.term_description,
        expected_value: n.expected_value || t.expected_value,
        is_mandatory: typeof n.is_mandatory === 'boolean' ? n.is_mandatory : t.is_mandatory,
      }
    })

    return [...cachedResults, ...freshResults]
  } catch (err) {
    console.warn('⚠️ Gemini PAT normalization failed, using raw terms:', err)
    return terms
  }
}

/**
 * Execute batched Gemini comparison for clause-term pairs
 */
export async function executeBatchComparisonGemini(
  comparisons: BatchComparison[],
  apiKey: string,
  model: GeminiP1Model = 'gemini-3-flash-preview'
): Promise<Map<number, BatchResult>> {
  const results = new Map<number, BatchResult>()
  const client = new GoogleGenAI({ apiKey })

  // Process in batches
  for (let i = 0; i < comparisons.length; i += BATCH_SIZE) {
    const batch = comparisons.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(comparisons.length / BATCH_SIZE)

    console.log(`     Batch ${batchNum}/${totalBatches}: ${batch.length} comparisons (Gemini)...`)

    // Build compact input format
    const comparisonInputs = batch.map((c) => ({
      idx: c.idx,
      term: `[${c.termCategory}] ${c.termDescription} (expected: ${c.expectedValue})${c.isMandatory ? ' [MANDATORY]' : ''}`,
      clause: `[${c.clauseType}] ${c.clauseContent}`,
    }))

    const prompt = `${COMPARISON_SYSTEM_PROMPT}

Compare these ${batch.length} clause-term pairs and return a result for EACH one:

${JSON.stringify(comparisonInputs, null, 0)}

Return JSON {"results":[...]} with exactly ${batch.length} result objects, one for each idx (0 to ${batch.length - 1}).`

    const timeout = calculateTimeout(batch.length)

    try {
      const responseText = await callGeminiWithRetry(
        client,
        model,
        prompt,
        zodToJsonSchema(BatchResponseSchema),
        timeout
      )

      const parsed = JSON.parse(responseText)
      const validated = BatchResponseSchema.safeParse(parsed)

      if (!validated.success) {
        console.error(`     ⚠️ Batch ${batchNum}: Response validation failed:`, validated.error)
        continue
      }

      for (const result of validated.data.results) {
        results.set(result.idx, result)
      }

      // Log warning if we didn't get all expected results
      if (validated.data.results.length < batch.length) {
        console.warn(
          `     ⚠️ Batch ${batchNum}: Got ${validated.data.results.length}/${batch.length} results`
        )
      }
    } catch (err) {
      console.error(`     ⚠️ Batch ${batchNum} failed:`, err)
    }
  }

  return results
}

// ============ ADAPTER CLASS ============

/**
 * GeminiP1Adapter class for dependency injection and testing
 * Matches the interface of GPTAdapter for drop-in replacement
 */
export class GeminiP1Adapter {
  private apiKey: string
  private model: GeminiP1Model
  private normalizationModel: GeminiP1Model

  constructor(
    apiKey: string,
    model: GeminiP1Model = 'gemini-3-flash-preview',
    normalizationModel: GeminiP1Model = 'gemini-2.5-flash'
  ) {
    this.apiKey = apiKey
    this.model = model
    this.normalizationModel = normalizationModel
  }

  /**
   * Normalize PAT terms
   */
  async normalizePATs(
    terms: PreAgreedTerm[],
    supabase?: TypedSupabaseClient
  ): Promise<PreAgreedTerm[]> {
    return normalizePatTermsGemini(terms, this.apiKey, this.normalizationModel, supabase)
  }

  /**
   * Execute batch comparison
   */
  async compareBatch(comparisons: BatchComparison[]): Promise<Map<number, BatchResult>> {
    return executeBatchComparisonGemini(comparisons, this.apiKey, this.model)
  }

  /**
   * Calculate timeout for a given batch size
   */
  calculateTimeout(comparisonCount: number): number {
    return calculateTimeout(comparisonCount)
  }
}

/**
 * Factory function to create a GeminiP1Adapter
 */
export function createGeminiP1Adapter(
  apiKey: string,
  model?: GeminiP1Model,
  normalizationModel?: GeminiP1Model
): GeminiP1Adapter {
  return new GeminiP1Adapter(apiKey, model, normalizationModel)
}
