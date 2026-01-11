/**
 * OpenAI Extraction Adapter
 * Handles clause extraction via OpenAI API for contract documents
 * Ported from supabase/functions/extract-clauses/index.ts
 */

import {
  EXTRACTION_MODEL,
  EXTRACTION_TIMEOUT_MS,
  EXTRACTION_CHUNK_SIZE,
  EXTRACTION_CHUNK_OVERLAP,
  EXTRACTION_MIN_CHARS_FOR_CHUNK,
  EXTRACTION_MIN_CLAUSES_PER_CHUNK,
  EXTRACTION_MAX_ATTEMPTS,
  MAX_CLAUSE_LENGTH,
  MIN_CLAUSE_LENGTH,
  MODEL_CONTEXT_LIMITS,
  estimateTokens,
} from '../config/extraction-config'
import { withRetry, isTransientError } from '../utils/retry'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Allowed extraction models
 */
export type ExtractionModel = 'gpt-4o' | 'gpt-5.1' | 'gpt-5.1-codex-mini'

/**
 * Extraction mode - how GPT returns clause positions
 */
export type ExtractionMode = 'line' | 'index'

/**
 * RAG status from extraction
 */
export type RagStatus = 'green' | 'amber' | 'red'

/**
 * Raw clause from GPT in line-based mode
 */
export interface RawLineClause {
  start_line: number
  end_line: number
  clause_type: string
  summary: string
  confidence: number
  rag_status: RagStatus
  section_title?: string
}

/**
 * Raw clause from GPT in index-based mode
 */
export interface RawIndexClause {
  start_index: number
  end_index: number
  clause_type: string
  summary: string
  confidence: number
  rag_status: RagStatus
  section_title?: string
}

/**
 * Extracted clause with all metadata
 */
export interface ExtractedClause {
  content: string
  start_index: number
  end_index: number
  clause_type: string
  summary: string
  confidence: number
  rag_status: RagStatus
  section_title?: string
}

/**
 * OpenAI API response structure
 */
interface OpenAIResponse {
  id?: string
  choices?: Array<{
    message?: {
      content?: string | object
      parsed?: object
    }
  }>
  error?: {
    message: string
    type: string
    code?: string
  }
}

/**
 * Extraction path decision
 */
export interface ExtractionPathDecision {
  path: 'single_pass' | 'chunked'
  model: ExtractionModel
  reason: string
  estimatedTokens: number
  contextLimit: number
}

/**
 * Extraction result
 */
export interface ExtractionResult {
  clauses: ExtractedClause[]
  mode: ExtractionMode
  model: ExtractionModel
  path: 'single_pass' | 'chunked'
  usedFallback: boolean
  telemetry: ExtractionTelemetry
}

/**
 * Extraction telemetry
 */
export interface ExtractionTelemetry {
  totalClauses: number
  extractionTimeMs: number
  tokensEstimated: number
  chunksProcessed?: number
  retriesUsed: number
}

/**
 * Extraction configuration
 */
export interface ExtractionConfig {
  /** OpenAI API key */
  apiKey: string
  /** Model to use for extraction */
  model?: ExtractionModel
  /** Extraction mode (line or index) */
  mode?: ExtractionMode
  /** Timeout in milliseconds */
  timeoutMs?: number
  /** Temperature for API calls */
  temperature?: number
  /** Max retry attempts */
  maxAttempts?: number
  /** Chunk size for chunked extraction */
  chunkSize?: number
  /** Overlap between chunks */
  chunkOverlap?: number
  /** Minimum chars to process a chunk */
  minCharsForChunk?: number
  /** Minimum expected clauses per chunk */
  minClausesPerChunk?: number
}

const DEFAULT_CONFIG: Omit<Required<ExtractionConfig>, 'apiKey'> = {
  model: EXTRACTION_MODEL as ExtractionModel,
  mode: 'line',
  timeoutMs: EXTRACTION_TIMEOUT_MS,
  temperature: 0.2,
  maxAttempts: EXTRACTION_MAX_ATTEMPTS,
  chunkSize: EXTRACTION_CHUNK_SIZE,
  chunkOverlap: EXTRACTION_CHUNK_OVERLAP,
  minCharsForChunk: EXTRACTION_MIN_CHARS_FOR_CHUNK,
  minClausesPerChunk: EXTRACTION_MIN_CLAUSES_PER_CHUNK,
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * OpenAI extraction error
 */
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'ExtractionError'
  }
}

/**
 * Checks if an error is retryable
 */
export function isRetryableExtractionError(error: unknown): boolean {
  if (isTransientError(error)) return true
  if (error instanceof ExtractionError) return error.retryable

  const message = String((error as Error)?.message || error || '')

  // Rate limiting
  if (/rate.?limit|429|too.?many/i.test(message)) return true

  // Server errors
  if (/5\d\d|server.?error|overloaded/i.test(message)) return true

  // Timeout
  if (/timeout|ETIMEDOUT|aborted/i.test(message)) return true

  return false
}

// ============================================================================
// PROMPT CONSTRUCTION
// ============================================================================

/**
 * Clause types for extraction
 */
const CLAUSE_TYPES = [
  'payment_terms',
  'invoicing',
  'invoicing_obligation',
  'invoicing_consequence',
  'exclusivity',
  'usage_rights',
  'deliverables',
  'timeline',
  'termination',
  'confidentiality',
  'liability',
  'indemnification',
  'dispute_resolution',
  'governing_law',
  'force_majeure',
  'assignment',
  'modification',
  'notice',
  'intellectual_property',
  'non_compete',
  'non_solicitation',
  'warranty',
  'compliance',
  'audit_rights',
  'data_protection',
  'insurance',
  'publicity_rights',
  'morality_clause',
  'approval_rights',
  'expenses',
  'taxes',
  'miscellaneous',
].join(', ')

/**
 * Builds system prompt for line-based extraction
 */
export function buildLineBasedSystemPrompt(totalLines?: number): string {
  return `You are "ContractBuddy Clause Extractor" - a precision legal document parser.

YOUR TASK: Extract clauses by returning their LINE NUMBERS (start_line and end_line).
The document has been pre-processed with line numbers in brackets: [0], [1], [2], etc.
${totalLines ? `Total lines: ${totalLines} (line numbers 0 to ${totalLines - 1})` : ''}

OUTPUT FORMAT (strict JSON only, no markdown, no extra keys):
{
  "clauses": [
    {
      "start_line": 0,
      "end_line": 2,
      "clause_type": "payment_terms",
      "summary": "One sentence description",
      "confidence": 0.95,
      "rag_status": "green"
    }
  ]
}

WHAT IS A CLAUSE?
- ONE obligation, requirement, right, or definition
- A COMPLETE THOUGHT that can stand alone grammatically
- Typically 1-4 lines of text
- MUST include COMPLETE sentences - never cut mid-sentence

SPLITTING RULES (each becomes separate clause):
1. Each bullet point (•, ·, *, -) = separate clause
2. Each numbered item (1., 2., a)) = separate clause
3. Different obligations joined by "and shall" / "and must" = split
4. Different actors ("Influencer must" vs "Brand shall") = split

CLAUSE_TYPE VALUES (use exactly one of these):
${CLAUSE_TYPES}

RAG_STATUS:
- "green": Standard clause, no issues expected
- "amber": Non-standard language or potentially concerning
- "red": Unusual terms that may require legal review

CRITICAL RULES:
- Return COMPLETE JSON only - no markdown, no explanation
- Confidence between 0.0 and 1.0
- Never skip content - every substantive clause must be extracted
- Section headers like "PAYMENT TERMS" are NOT clauses`
}

/**
 * Builds system prompt for index-based extraction
 */
export function buildIndexBasedSystemPrompt(): string {
  return `You are "ContractBuddy Clause Extractor" - a precision legal document parser.

YOUR TASK: Extract clauses by returning CHARACTER INDICES (start_index and end_index).
Indices are 0-based. end_index is exclusive (like JavaScript slice).

OUTPUT FORMAT (strict JSON only, no markdown, no extra keys):
{
  "clauses": [
    {
      "start_index": 0,
      "end_index": 150,
      "clause_type": "payment_terms",
      "summary": "One sentence description",
      "confidence": 0.95,
      "rag_status": "green"
    }
  ]
}

WHAT IS A CLAUSE?
- ONE obligation, requirement, right, or definition
- A COMPLETE THOUGHT that can stand alone grammatically
- Typically ${MIN_CLAUSE_LENGTH}-${MAX_CLAUSE_LENGTH} characters
- MUST include COMPLETE sentences - never cut mid-sentence

SPLITTING RULES (each becomes separate clause):
1. Each bullet point (•, ·, *, -) = separate clause
2. Each numbered item (1., 2., a)) = separate clause
3. Different obligations joined by "and shall" / "and must" = split
4. Different actors ("Influencer must" vs "Brand shall") = split

CLAUSE_TYPE VALUES (use exactly one of these):
${CLAUSE_TYPES}

RAG_STATUS:
- "green": Standard clause, no issues expected
- "amber": Non-standard language or potentially concerning
- "red": Unusual terms that may require legal review

CRITICAL RULES:
- Return COMPLETE JSON only - no markdown, no explanation
- Indices must be accurate - start/end at word boundaries
- Confidence between 0.0 and 1.0
- Never skip content - every substantive clause must be extracted
- Section headers like "PAYMENT TERMS" are NOT clauses`
}

/**
 * Builds chunked extraction system prompt
 */
export function buildChunkedSystemPrompt(): string {
  return `You are the "ContractBuddy Clause Extractor", an AI paralegal specialized in influencer marketing contracts.

Global rules:
- You are conservative and literal - extract only what is explicitly stated
- Never hallucinate new obligations or interpret vague language liberally
- Never include explanations, commentary, markdown, or extra text
- Return ONLY valid JSON in the exact format specified

Semantics:
- A "clause" is a single obligation, definition, or right
- Return CHARACTER INDICES (0-based, end exclusive like JavaScript slice)
- Extract every substantive clause - do not skip content

CLAUSE_TYPE VALUES:
${CLAUSE_TYPES}

OUTPUT FORMAT:
{"clauses":[{"start_index":0,"end_index":100,"clause_type":"...","summary":"...","confidence":0.95,"rag_status":"green"}]}`
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

/**
 * Parses OpenAI response to extract clauses array
 */
export function parseClausesResponse(data: OpenAIResponse): unknown[] {
  // Handle SDK structured outputs (message.parsed)
  if (data.choices?.[0]?.message?.parsed) {
    const parsed = data.choices[0].message.parsed
    return extractClausesArray(parsed)
  }

  // Handle string content that needs parsing
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    console.error('No content in OpenAI response')
    return []
  }

  // If content is already parsed (object/array), use directly
  if (typeof content === 'object') {
    return extractClausesArray(content)
  }

  // Parse string content
  try {
    const parsed = JSON.parse(content)
    return extractClausesArray(parsed)
  } catch (err) {
    console.error(`JSON parse error: ${err}. Content preview: ${String(content).slice(0, 200)}`)
    return []
  }
}

/**
 * Extracts clauses array from various response shapes
 */
export function extractClausesArray(parsed: unknown): unknown[] {
  // Handle direct array
  if (Array.isArray(parsed)) {
    return parsed
  }

  // Handle { clauses: [...] }
  if (parsed && typeof parsed === 'object' && 'clauses' in parsed) {
    const obj = parsed as { clauses: unknown }
    if (Array.isArray(obj.clauses)) {
      return obj.clauses
    }
  }

  // Handle single clause object
  if (
    parsed &&
    typeof parsed === 'object' &&
    ('content' in parsed || 'clause_type' in parsed)
  ) {
    return [parsed]
  }

  console.warn('Unexpected response shape, returning empty array')
  return []
}

/**
 * Validates and normalizes RAG status
 */
export function validateRagStatus(status: unknown): RagStatus {
  const normalized = String(status || 'amber').toLowerCase()
  if (normalized === 'green' || normalized === 'amber' || normalized === 'red') {
    return normalized
  }
  return 'amber'
}

/**
 * Validates a raw clause from GPT
 */
export function validateRawClause(
  clause: unknown,
  mode: ExtractionMode
): RawLineClause | RawIndexClause | null {
  if (!clause || typeof clause !== 'object') return null

  const c = clause as Record<string, unknown>

  // Validate required fields
  if (typeof c.clause_type !== 'string') return null
  if (typeof c.summary !== 'string') return null

  const confidence = typeof c.confidence === 'number' ? c.confidence : 0.5
  const ragStatus = validateRagStatus(c.rag_status)
  const sectionTitle = typeof c.section_title === 'string' ? c.section_title : undefined

  if (mode === 'line') {
    if (typeof c.start_line !== 'number' || typeof c.end_line !== 'number') {
      return null
    }
    return {
      start_line: c.start_line,
      end_line: c.end_line,
      clause_type: c.clause_type,
      summary: c.summary,
      confidence,
      rag_status: ragStatus,
      section_title: sectionTitle,
    }
  } else {
    if (typeof c.start_index !== 'number' || typeof c.end_index !== 'number') {
      return null
    }
    return {
      start_index: c.start_index,
      end_index: c.end_index,
      clause_type: c.clause_type,
      summary: c.summary,
      confidence,
      rag_status: ragStatus,
      section_title: sectionTitle,
    }
  }
}

// ============================================================================
// EXTRACTION PATH DECISION
// ============================================================================

/**
 * Decides extraction path based on document size
 */
export function decideExtractionPath(
  text: string,
  preferredModel: ExtractionModel
): ExtractionPathDecision {
  const estimatedTokens = estimateTokens(text)
  const contextLimit = MODEL_CONTEXT_LIMITS[preferredModel] || 128_000

  // Reserve 30% of context for system prompt + output
  const safeInputLimit = Math.floor(contextLimit * 0.7)

  if (estimatedTokens <= safeInputLimit) {
    return {
      path: 'single_pass',
      model: preferredModel,
      reason: `Input (${estimatedTokens} tokens) fits in ${preferredModel} context (${safeInputLimit} safe limit)`,
      estimatedTokens,
      contextLimit,
    }
  }

  // Context overflow - fall back to chunked extraction with gpt-4o
  const fallbackModel: ExtractionModel = 'gpt-4o'
  console.warn(
    `Context overflow: ${estimatedTokens} tokens exceeds ${safeInputLimit} safe limit for ${preferredModel}`
  )

  return {
    path: 'chunked',
    model: fallbackModel,
    reason: `Input too large (${estimatedTokens} tokens), falling back to chunked ${fallbackModel} extraction`,
    estimatedTokens,
    contextLimit,
  }
}

// ============================================================================
// TEXT PREPARATION
// ============================================================================

/**
 * Sanitizes text for extraction (removes null bytes)
 */
export function sanitizeText(text: string): string {
  return text.replace(/\0/g, '')
}

/**
 * Splits text into overlapping chunks
 */
export function splitIntoChunks(
  text: string,
  chunkSize: number,
  overlap: number
): Array<{ text: string; startOffset: number }> {
  const chunks: Array<{ text: string; startOffset: number }> = []
  let position = 0

  while (position < text.length) {
    const end = Math.min(position + chunkSize, text.length)
    chunks.push({
      text: text.slice(position, end),
      startOffset: position,
    })

    // Move position forward, accounting for overlap
    position = end - overlap

    // If we're near the end, just finish
    if (position + overlap >= text.length) {
      break
    }
  }

  return chunks
}

// ============================================================================
// OPENAI API CALLS
// ============================================================================

/**
 * Makes OpenAI API call for extraction
 */
export async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: ExtractionModel,
  temperature: number = 0.2,
  timeoutMs: number = EXTRACTION_TIMEOUT_MS
): Promise<OpenAIResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      const retryable = response.status >= 500 || response.status === 429
      throw new ExtractionError(
        `OpenAI API error (${response.status}): ${errorText}`,
        'API_ERROR',
        retryable,
        response.status
      )
    }

    return (await response.json()) as OpenAIResponse
  } catch (error) {
    clearTimeout(timeoutId)

    if ((error as Error).name === 'AbortError') {
      throw new ExtractionError(
        `OpenAI API request timed out after ${timeoutMs}ms`,
        'TIMEOUT',
        true
      )
    }

    throw error
  }
}

/**
 * Makes OpenAI API call with retry logic
 */
export async function callOpenAIWithRetry(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: ExtractionModel,
  temperature: number = 0.2,
  timeoutMs: number = EXTRACTION_TIMEOUT_MS,
  maxRetries: number = 3
): Promise<OpenAIResponse> {
  return withRetry(
    () => callOpenAI(apiKey, systemPrompt, userMessage, model, temperature, timeoutMs),
    {
      maxRetries,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    },
    isRetryableExtractionError,
    'openai-extraction'
  )
}

// ============================================================================
// EXTRACTION ADAPTER CLASS
// ============================================================================

/**
 * OpenAI Extraction Adapter class
 */
export class OpenAIExtractionAdapter {
  private config: Required<ExtractionConfig>

  constructor(config: ExtractionConfig) {
    if (!config.apiKey) {
      throw new ExtractionError('OpenAI API key is required', 'CONFIG_ERROR', false)
    }
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<ExtractionConfig>
  }

  /**
   * Extracts clauses from text using single-pass or chunked extraction
   */
  async extract(text: string): Promise<ExtractionResult> {
    const startTime = Date.now()
    const sanitizedText = sanitizeText(text)

    // Decide extraction path
    const decision = decideExtractionPath(sanitizedText, this.config.model)

    if (decision.path === 'single_pass') {
      try {
        const result = await this.extractSinglePass(sanitizedText, decision)
        return {
          ...result,
          telemetry: {
            ...result.telemetry,
            extractionTimeMs: Date.now() - startTime,
          },
        }
      } catch (error) {
        // Fallback to chunked on timeout
        if ((error as Error).message?.includes('timed out')) {
          console.warn('Single-pass timed out, falling back to chunked extraction')
          const result = await this.extractChunked(sanitizedText)
          return {
            ...result,
            usedFallback: true,
            telemetry: {
              ...result.telemetry,
              extractionTimeMs: Date.now() - startTime,
            },
          }
        }
        throw error
      }
    }

    const result = await this.extractChunked(sanitizedText)
    return {
      ...result,
      telemetry: {
        ...result.telemetry,
        extractionTimeMs: Date.now() - startTime,
      },
    }
  }

  /**
   * Single-pass extraction for smaller documents
   */
  async extractSinglePass(
    text: string,
    decision: ExtractionPathDecision
  ): Promise<ExtractionResult> {
    const systemPrompt =
      this.config.mode === 'line'
        ? buildLineBasedSystemPrompt()
        : buildIndexBasedSystemPrompt()

    const userMessage =
      this.config.mode === 'line'
        ? `Extract all clauses from this contract:\n\n${text}`
        : `Extract all clauses from this contract:\n\n${text}`

    const response = await callOpenAIWithRetry(
      this.config.apiKey,
      systemPrompt,
      userMessage,
      decision.model,
      this.config.temperature,
      this.config.timeoutMs,
      this.config.maxAttempts
    )

    const rawClauses = parseClausesResponse(response)
    const clauses = this.processRawClauses(rawClauses, text)

    return {
      clauses,
      mode: this.config.mode,
      model: decision.model,
      path: 'single_pass',
      usedFallback: false,
      telemetry: {
        totalClauses: clauses.length,
        extractionTimeMs: 0, // Will be set by caller
        tokensEstimated: decision.estimatedTokens,
        retriesUsed: 0,
      },
    }
  }

  /**
   * Chunked extraction for large documents
   */
  async extractChunked(text: string): Promise<ExtractionResult> {
    const chunks = splitIntoChunks(text, this.config.chunkSize, this.config.chunkOverlap)
    const allClauses: ExtractedClause[] = []
    let totalRetries = 0

    const systemPrompt = buildChunkedSystemPrompt()

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]

      // Skip very small chunks
      if (chunk.text.length < this.config.minCharsForChunk) {
        continue
      }

      const userMessage = `Extract all clauses from this section of a contract (section ${i + 1} of ${chunks.length}):\n\n${chunk.text}`

      let response: OpenAIResponse | null = null
      let rawClauses: unknown[] = []

      // Retry logic for chunks
      for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
        const temperature = attempt === 1 ? this.config.temperature : 0.1

        try {
          response = await callOpenAI(
            this.config.apiKey,
            systemPrompt,
            userMessage,
            'gpt-4o', // Always use gpt-4o for chunked
            temperature,
            this.config.timeoutMs
          )

          rawClauses = parseClausesResponse(response)

          // Check if we got enough clauses
          if (rawClauses.length >= this.config.minClausesPerChunk) {
            break
          }

          if (attempt < this.config.maxAttempts) {
            console.warn(
              `Chunk ${i + 1}: Only ${rawClauses.length} clauses, retrying with lower temperature`
            )
            totalRetries++
          }
        } catch (error) {
          if (attempt === this.config.maxAttempts) throw error
          totalRetries++
        }
      }

      // Process clauses with offset adjustment
      const chunkClauses = this.processRawClauses(rawClauses, text, chunk.startOffset)
      allClauses.push(...chunkClauses)
    }

    // Deduplicate overlapping clauses
    const deduplicatedClauses = this.deduplicateClauses(allClauses)

    return {
      clauses: deduplicatedClauses,
      mode: 'index', // Chunked always uses index mode
      model: 'gpt-4o',
      path: 'chunked',
      usedFallback: false,
      telemetry: {
        totalClauses: deduplicatedClauses.length,
        extractionTimeMs: 0, // Will be set by caller
        tokensEstimated: estimateTokens(text),
        chunksProcessed: chunks.length,
        retriesUsed: totalRetries,
      },
    }
  }

  /**
   * Processes raw clauses from GPT response
   */
  private processRawClauses(
    rawClauses: unknown[],
    fullText: string,
    offsetAdjustment: number = 0
  ): ExtractedClause[] {
    const results: ExtractedClause[] = []

    for (const raw of rawClauses) {
      const validated = validateRawClause(raw, this.config.mode)
      if (!validated) continue

      let startIndex: number
      let endIndex: number

      if ('start_line' in validated) {
        // Line-based: would need line map to convert
        // For now, skip as line conversion should happen externally
        console.warn('Line-based clause received but line map not available')
        continue
      } else {
        startIndex = validated.start_index + offsetAdjustment
        endIndex = validated.end_index + offsetAdjustment
      }

      // Bounds check
      if (startIndex < 0 || endIndex > fullText.length || startIndex >= endIndex) {
        continue
      }

      const content = fullText.slice(startIndex, endIndex)

      // Length check
      if (content.length < MIN_CLAUSE_LENGTH || content.length > MAX_CLAUSE_LENGTH * 2) {
        continue
      }

      results.push({
        content,
        start_index: startIndex,
        end_index: endIndex,
        clause_type: validated.clause_type,
        summary: validated.summary,
        confidence: validated.confidence,
        rag_status: validated.rag_status,
        section_title: validated.section_title,
      })
    }

    return results
  }

  /**
   * Deduplicates clauses by removing overlaps
   */
  private deduplicateClauses(clauses: ExtractedClause[]): ExtractedClause[] {
    if (clauses.length === 0) return []

    // Sort by start index
    const sorted = [...clauses].sort((a, b) => {
      if (a.start_index !== b.start_index) return a.start_index - b.start_index
      return a.end_index - b.end_index
    })

    const deduped: ExtractedClause[] = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const last = deduped[deduped.length - 1]

      // Skip if overlapping with previous clause
      if (current.start_index < last.end_index) {
        // Keep the longer clause
        if (current.end_index - current.start_index > last.end_index - last.start_index) {
          deduped[deduped.length - 1] = current
        }
        continue
      }

      deduped.push(current)
    }

    return deduped
  }

  /**
   * Gets current configuration
   */
  getConfig(): Required<ExtractionConfig> {
    return { ...this.config }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates a new OpenAI extraction adapter
 */
export function createOpenAIExtractionAdapter(
  config: ExtractionConfig
): OpenAIExtractionAdapter {
  return new OpenAIExtractionAdapter(config)
}

/**
 * Creates adapter from environment variables
 */
export function createOpenAIExtractionAdapterFromEnv(): OpenAIExtractionAdapter {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new ExtractionError('OPENAI_API_KEY environment variable not set', 'CONFIG_ERROR', false)
  }

  return new OpenAIExtractionAdapter({
    apiKey,
    model: (process.env.EXTRACTION_MODEL as ExtractionModel) || 'gpt-4o',
    mode: (process.env.EXTRACTION_MODE as ExtractionMode) || 'line',
  })
}
