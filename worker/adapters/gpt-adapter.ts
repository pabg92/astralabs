/**
 * GPT Adapter
 *
 * Handles all OpenAI GPT API interactions for P1 reconciliation.
 * Includes retry logic, timeout handling, and response validation.
 *
 * @module adapters/gpt-adapter
 */

import type {
  BatchComparison,
  BatchResult,
  NormalizedTerm,
  PreAgreedTerm,
  DeviationSeverity,
} from '../types/p1-types.js'
import type { TypedSupabaseClient } from '../types/supabase.js'
import { getHttpStatus, isRateLimitError } from '../types/errors.js'

import {
  P1_MODEL,
  NORMALIZATION_MODEL,
  BATCH_SIZE,
  MAX_RETRIES,
  BACKOFF_MULTIPLIER,
  MAX_BACKOFF_MS,
  BASE_TIMEOUT_MS,
  PER_COMPARISON_MS,
  MAX_TIMEOUT_MS,
} from '../config/p1-config'

// ============ UTILITY FUNCTIONS ============

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Calculate timeout based on batch size (Issue #10)
 * Scales with number of comparisons to handle larger batches
 */
export function calculateTimeout(comparisonCount: number): number {
  return Math.min(
    BASE_TIMEOUT_MS + (comparisonCount * PER_COMPARISON_MS),
    MAX_TIMEOUT_MS
  )
}

/**
 * Call a function with exponential backoff retry on rate limit (429)
 *
 * @param fn - The async function to call
 * @param operationName - Name for logging purposes
 * @param retries - Number of retries remaining
 * @returns The result of the function
 */
export async function callWithBackoff<T>(
  fn: () => Promise<T>,
  operationName: string,
  retries = MAX_RETRIES
): Promise<T> {
  try {
    return await fn()
  } catch (err: unknown) {
    if (isRateLimitError(err) && retries > 0) {
      const delay = Math.min(1000 * Math.pow(BACKOFF_MULTIPLIER, MAX_RETRIES - retries), MAX_BACKOFF_MS)
      console.warn(`Rate limited on ${operationName}, retrying in ${delay}ms (${retries} retries left)`)
      await sleep(delay)
      return callWithBackoff(fn, operationName, retries - 1)
    }
    throw err
  }
}

// ============ RESPONSE VALIDATION ============

/** Raw batch result from GPT before validation */
interface RawBatchResult {
  idx?: unknown
  matches?: unknown
  severity?: unknown
  explanation?: unknown
  differences?: unknown
  key_differences?: unknown
  confidence?: unknown
}

/**
 * Validate and normalize a batch result from GPT response
 */
function validateBatchResult(raw: RawBatchResult): BatchResult | null {
  if (typeof raw?.idx !== 'number') return null

  return {
    idx: raw.idx,
    matches: typeof raw.matches === 'boolean' ? raw.matches : false,
    severity: validateSeverity(raw.severity),
    explanation: String(raw.explanation || ''),
    differences: Array.isArray(raw.differences)
      ? raw.differences
      : Array.isArray(raw.key_differences)
        ? raw.key_differences
        : [],
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
  }
}

/**
 * Validate severity value
 */
function validateSeverity(value: unknown): DeviationSeverity {
  if (value === 'none' || value === 'minor' || value === 'major') {
    return value
  }
  return 'major' // Default to major if invalid
}

/** Shape of parsed GPT response */
interface ParsedGPTResponse {
  results?: RawBatchResult[]
  comparisons?: RawBatchResult[]
  idx?: number
  matches?: boolean
}

/**
 * Parse GPT response content into batch results
 * Handles multiple response formats for robustness
 */
function parseGPTResponse(content: string): BatchResult[] {
  const parsed: unknown = JSON.parse(content)

  // Handle multiple response formats:
  // 1. Array directly: [{idx:0,...}, {idx:1,...}]
  // 2. Object with results key: {results: [...]}
  // 3. Object with comparisons key: {comparisons: [...]}
  // 4. Single object with idx: {idx:0, matches:...}
  let rawResults: RawBatchResult[]

  if (Array.isArray(parsed)) {
    rawResults = parsed as RawBatchResult[]
  } else if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as ParsedGPTResponse
    if (obj.results && Array.isArray(obj.results)) {
      rawResults = obj.results
    } else if (obj.comparisons && Array.isArray(obj.comparisons)) {
      rawResults = obj.comparisons
    } else if (typeof obj.idx === 'number' && typeof obj.matches === 'boolean') {
      rawResults = [obj as RawBatchResult]
    } else {
      console.error(`⚠️ Unexpected GPT response format:`, Object.keys(obj))
      return []
    }
  } else {
    console.error(`⚠️ Invalid GPT response type:`, typeof parsed)
    return []
  }

  // Validate each result
  const validResults: BatchResult[] = []
  for (const raw of rawResults) {
    const validated = validateBatchResult(raw)
    if (validated) {
      validResults.push(validated)
    }
  }

  return validResults
}

// ============ GPT API CALLS ============

/**
 * Normalize PAT terms via GPT to correct typos and map categories/clauses
 * Uses timestamp-based caching to avoid redundant GPT calls
 *
 * @param terms - Pre-agreed terms to normalize
 * @param openaiApiKey - OpenAI API key
 * @param supabase - Optional Supabase client for caching
 * @returns Normalized terms
 */
export async function normalizePatTerms(
  terms: PreAgreedTerm[],
  openaiApiKey: string,
  supabase?: TypedSupabaseClient
): Promise<PreAgreedTerm[]> {
  if (!terms.length) return terms

  // Check which terms need normalization (no cache or term modified after last normalization)
  const needsNormalization = terms.filter(t => {
    if (!t.normalized_at) return true
    if (!t.updated_at) return true
    const updatedAt = new Date(t.updated_at)
    const normalizedAt = new Date(t.normalized_at)
    return updatedAt > normalizedAt
  })

  // Use cached values for already-normalized terms
  const cachedTerms = terms.filter(t => !needsNormalization.includes(t))
  const cachedResults = cachedTerms.map(t => ({
    ...t,
    normalized_term_category: t.normalized_value || t.term_category,
    normalized_clause_type: undefined,
  }))

  if (needsNormalization.length === 0) {
    console.log(`   ✓ All ${terms.length} PATs using cached normalization`)
    return cachedResults
  }

  console.log(`   Normalizing ${needsNormalization.length}/${terms.length} PATs (${cachedTerms.length} cached)`)

  const payload = needsNormalization.map((t) => ({
    id: t.id,
    term_category: t.term_category,
    description: t.term_description,
    expected_value: t.expected_value,
    is_mandatory: t.is_mandatory,
  }))

  try {
    const response = await callWithBackoff(
      async () => {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: NORMALIZATION_MODEL,
            messages: [
              {
                role: 'system',
                content: `You are a contract term normalizer. Normalize pre-agreed terms (PATs) to reduce typos and map to known categories.

Return JSON {"results":[{"id":"...","term_category":"<normalized>","clause_type_guess":"<payment_terms|exclusivity|usage_rights|approval|posting_schedule|compliance|content_standards|analytics|delivery_deadline|pre_production|usage_licensing>","description":"<cleaned description>","expected_value":"<cleaned value>","is_mandatory":true/false}]}`,
              },
              {
                role: 'user',
                content: `Normalize these PATs:
${JSON.stringify(payload, null, 0)}

Use the closest known term_category; leave clause_type_guess empty if unsure; keep unknown fields as-is. Output JSON only.`,
              },
            ],
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
        })
        if (!res.ok) {
          const err = new Error(`OpenAI error ${res.status}`) as Error & { status: number }
          err.status = res.status
          throw err
        }
        return res
      },
      'PAT normalization'
    )

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return terms

    const parsed = JSON.parse(content)
    const normalized: NormalizedTerm[] = parsed.results || parsed || []
    const normalizedById = new Map<string, NormalizedTerm>()
    for (const n of normalized) {
      if (n?.id) normalizedById.set(n.id, n)
    }

    // Cache normalized values if supabase client provided
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

    // Merge cached + fresh results
    return [...cachedResults, ...freshResults]
  } catch (err) {
    console.warn('⚠️ PAT normalization failed, using raw terms:', err)
    return terms
  }
}

/**
 * Execute batched GPT comparison for clause-term pairs
 *
 * @param comparisons - Array of comparisons to process
 * @param openaiApiKey - OpenAI API key
 * @param model - GPT model to use (default: P1_MODEL from config)
 * @returns Map of comparison idx to BatchResult
 */
export async function executeBatchComparison(
  comparisons: BatchComparison[],
  openaiApiKey: string,
  model: string = P1_MODEL
): Promise<Map<number, BatchResult>> {
  const results = new Map<number, BatchResult>()

  // Process in batches
  for (let i = 0; i < comparisons.length; i += BATCH_SIZE) {
    const batch = comparisons.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(comparisons.length / BATCH_SIZE)

    console.log(`     Batch ${batchNum}/${totalBatches}: ${batch.length} comparisons...`)

    // Build compact input format
    const comparisonInputs = batch.map((c) => ({
      idx: c.idx,
      term: `[${c.termCategory}] ${c.termDescription} (expected: ${c.expectedValue})${c.isMandatory ? ' [MANDATORY]' : ''}`,
      clause: `[${c.clauseType}] ${c.clauseContent}`,
    }))

    // Add timeout to prevent hanging on slow GPT responses
    const timeout = calculateTimeout(batch.length)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    let response: Response
    try {
      response = await callWithBackoff(
        async () => {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiApiKey}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: 'system',
                  content: `<role>
You are a senior legal analyst specializing in influencer marketing contract compliance. You compare contract clauses against pre-agreed terms (PATs) to identify discrepancies.
</role>

<task>
For each clause-term pair, determine if the contract clause SATISFIES the pre-agreed term requirement using bidirectional analysis:
1. Does the clause contain what the term requires? (term→clause entailment)
2. Does the clause introduce conflicting obligations? (clause→term conflict check)
</task>

<classification_rules>
GREEN (matches=true, severity="none"):
- Clause fully satisfies or exceeds the term requirements
- All key elements present with equivalent or better terms
- Example: Term expects "30 day payment", clause states "payment within 30 days of invoice"

AMBER (matches=true, severity="minor"):
- Clause partially satisfies with acceptable deviations
- Timing differences within 25% (e.g., 30 days vs 37 days)
- Amounts within 15% variance
- Scope slightly broader OR narrower but intent preserved
- Additional conditions that don't fundamentally alter the obligation
- Example: Term expects "30 day payment", clause states "45 day payment" (50% deviation = AMBER)

RED (matches=false, severity="major"):
- Clause contradicts the term (opposite obligation)
- Critical elements from the term are absent entirely
- Timing/amounts differ by more than 50%
- Scope fundamentally incompatible
- Term marked [MANDATORY] and clause doesn't address it
- Example: Term expects "30 day payment", clause states "90 day payment" (200% deviation = RED)
</classification_rules>

<special_handling>
PLACEHOLDERS: Ignore template markers like [PARTY A], [BRAND], [AMOUNT]. Focus on the legal obligation structure, not party names.
MANDATORY TERMS: Apply stricter thresholds - any deviation over 10% for [MANDATORY] terms is AMBER, over 25% is RED.
IMPLICIT TERMS: If a term is commonly implied by the clause type even if not explicitly stated, consider it present (e.g., exclusivity clauses typically imply the stated duration applies).
</special_handling>

<examples>
Example 1 - GREEN:
Term: [Payment Terms] Net 30 from invoice date (expected: 30 days)
Clause: [payment_terms] Payment shall be made within thirty (30) calendar days following receipt of valid invoice.
Result: {"matches":true,"severity":"none","explanation":"30-day payment matches exactly","differences":[],"confidence":0.95}

Example 2 - AMBER:
Term: [Exclusivity] Brand exclusivity in athletic category (expected: athletic wear only)
Clause: [exclusivity] Talent agrees to exclusivity in sporting goods and athletic apparel.
Result: {"matches":true,"severity":"minor","explanation":"Scope slightly broader than athletic wear only","differences":["Includes sporting goods beyond apparel"],"confidence":0.85}

Example 3 - RED:
Term: [Payment Terms] Net 30 from invoice date (expected: 30 days) [MANDATORY]
Clause: [payment_terms] Payment within 90 days of campaign completion.
Result: {"matches":false,"severity":"major","explanation":"90 days conflicts with mandatory 30-day requirement","differences":["Payment timeline 3x longer than agreed","Trigger is campaign completion vs invoice date"],"confidence":0.92}

Example 4 - RED (missing):
Term: [Usage Rights] Perpetual usage rights for social media (expected: perpetual) [MANDATORY]
Clause: [usage_rights] Brand may use content for 12 months from delivery date.
Result: {"matches":false,"severity":"major","explanation":"12-month limit contradicts perpetual requirement","differences":["Time-limited vs perpetual usage","Missing perpetual rights clause"],"confidence":0.90}
</examples>

<output_format>
Return exactly one result per comparison in this structure:
{"results":[
  {"idx":0,"matches":bool,"severity":"none|minor|major","explanation":"<20 words max>","differences":["<specific difference>"],"confidence":0.0-1.0},
  ...
]}

Confidence scoring:
- 0.90+: Clear match or clear conflict, unambiguous language
- 0.75-0.89: Reasonable inference required, some ambiguity
- 0.60-0.74: Significant interpretation needed
- <0.60: Highly ambiguous, flag for human review
</output_format>`,
                },
                {
                  role: 'user',
                  content: `Compare these ${batch.length} clause-term pairs and return a result for EACH one:

${JSON.stringify(comparisonInputs, null, 0)}

Return JSON {"results":[...]} with exactly ${batch.length} result objects, one for each idx (0 to ${batch.length - 1}).`,
                },
              ],
              temperature: 0.1,
              response_format: { type: 'json_object' },
            }),
          })

          if (!res.ok) {
            const error = new Error(`OpenAI error ${res.status}`) as Error & { status: number }
            error.status = res.status
            throw error
          }
          return res
        },
        `Batch ${batchNum} comparison`
      )
    } finally {
      clearTimeout(timeoutId)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      console.error(`     ⚠️ Empty response for batch ${batchNum}`)
      continue
    }

    try {
      const batchResults = parseGPTResponse(content)

      for (const result of batchResults) {
        results.set(result.idx, result)
      }

      // Log warning if we didn't get all expected results
      if (batchResults.length < batch.length) {
        console.warn(`     ⚠️ Batch ${batchNum}: Got ${batchResults.length}/${batch.length} results`)
      }
    } catch (parseErr) {
      console.error(`     ⚠️ JSON parse error for batch ${batchNum}:`, parseErr)
      console.error(`     Content preview: ${content.substring(0, 200)}`)
    }
  }

  return results
}

// ============ GPT ADAPTER CLASS ============

/**
 * GPTAdapter class for dependency injection and testing
 */
export class GPTAdapter {
  private apiKey: string
  private model: string
  private normalizationModel: string

  constructor(
    apiKey: string,
    model: string = P1_MODEL,
    normalizationModel: string = NORMALIZATION_MODEL
  ) {
    this.apiKey = apiKey
    this.model = model
    this.normalizationModel = normalizationModel
  }

  /**
   * Normalize PAT terms
   */
  async normalizePATs(terms: PreAgreedTerm[], supabase?: TypedSupabaseClient): Promise<PreAgreedTerm[]> {
    return normalizePatTerms(terms, this.apiKey, supabase)
  }

  /**
   * Execute batch comparison
   */
  async compareBatch(comparisons: BatchComparison[]): Promise<Map<number, BatchResult>> {
    return executeBatchComparison(comparisons, this.apiKey, this.model)
  }

  /**
   * Calculate timeout for a given batch size
   */
  calculateTimeout(comparisonCount: number): number {
    return calculateTimeout(comparisonCount)
  }
}

// Default instance factory
export function createGPTAdapter(apiKey: string): GPTAdapter {
  return new GPTAdapter(apiKey)
}
