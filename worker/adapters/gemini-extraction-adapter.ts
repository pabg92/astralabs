/**
 * Gemini Extraction Adapter
 * Handles clause extraction via Google Gemini 3 Flash API for contract documents
 * See: https://ai.google.dev/gemini-api/docs/gemini-3
 *
 * Benefits over OpenAI:
 * - 1M token context window (vs 128K) - no chunking needed
 * - Cheaper pricing ($0.50/$3 per 1M tokens for Gemini 3 Flash)
 * - Built-in reasoning with thinking levels
 * - Native Zod v4 JSON schema support
 */

import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import {
  EXTRACTION_TIMEOUT_MS,
  EXTRACTION_MAX_ATTEMPTS,
  MAX_CLAUSE_LENGTH,
  MIN_CLAUSE_LENGTH,
  estimateTokens,
} from '../config/extraction-config'
import { withRetry, isTransientError } from '../utils/retry'
import {
  prepareLineNumberedDocument,
  convertLinesToIndices,
  type LineNumberedDocument,
  type RawLineBasedClause,
  type RawIndexedClause,
} from '../utils/line-mapper'
import {
  validateClauseIndices,
  type ValidatedClause,
  type ValidationResult,
  type ValidationTelemetry,
  type SnapTelemetry,
} from '../utils/clause-validator'

// ============================================================================
// TYPES
// ============================================================================

/**
 * RAG status from extraction
 */
export type RagStatus = 'green' | 'amber' | 'red'

/**
 * Gemini model options
 * See: https://ai.google.dev/gemini-api/docs/gemini-3
 */
export type GeminiModel = 'gemini-3-flash-preview' | 'gemini-3-pro-preview' | 'gemini-2.5-flash'

/**
 * Extracted clause with all metadata (final output)
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
 * Extraction result
 */
export interface ExtractionResult {
  clauses: ExtractedClause[]
  model: GeminiModel
  telemetry: ExtractionTelemetry
  validation: ValidationTelemetry
  snapping?: SnapTelemetry
}

/**
 * Extraction telemetry
 */
export interface ExtractionTelemetry {
  totalClauses: number
  extractionTimeMs: number
  tokensEstimated: number
  totalLines: number
  retriesUsed: number
}

/**
 * Extraction configuration
 */
export interface GeminiExtractionConfig {
  /** Google AI API key */
  apiKey: string
  /** Model to use for extraction */
  model?: GeminiModel
  /** Timeout in milliseconds */
  timeoutMs?: number
  /** Temperature for API calls (0-2) */
  temperature?: number
  /** Max retry attempts */
  maxAttempts?: number
  /** Enable boundary snapping */
  enableSnapping?: boolean
  /** Enable forced boundary expansion */
  enableForcing?: boolean
  /** Minimum clause length */
  minClauseLength?: number
  /** Maximum clause length */
  maxClauseLength?: number
}

const DEFAULT_CONFIG: Omit<Required<GeminiExtractionConfig>, 'apiKey'> = {
  model: 'gemini-3-flash',
  timeoutMs: EXTRACTION_TIMEOUT_MS,
  temperature: 0.2,
  maxAttempts: EXTRACTION_MAX_ATTEMPTS,
  enableSnapping: true,
  enableForcing: true,
  minClauseLength: MIN_CLAUSE_LENGTH,
  maxClauseLength: MAX_CLAUSE_LENGTH,
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

/**
 * Zod schema for a single clause from Gemini
 */
export const ClauseSchema = z.object({
  start_line: z.number().int().min(0).describe('Starting line number (0-indexed)'),
  end_line: z.number().int().min(0).describe('Ending line number (0-indexed, inclusive)'),
  clause_type: z.string().min(1).describe('Type of clause from the allowed list'),
  summary: z.string().min(1).describe('One sentence description of the clause'),
  confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
  rag_status: z.enum(['green', 'amber', 'red']).describe('Risk assessment status'),
  section_title: z.string().optional().describe('Section header if present'),
})

/**
 * Zod schema for the full extraction response
 */
export const ExtractionResponseSchema = z.object({
  clauses: z.array(ClauseSchema).describe('Array of extracted clauses'),
})

export type ClauseFromGemini = z.infer<typeof ClauseSchema>
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Gemini extraction error
 */
export class GeminiExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'GeminiExtractionError'
  }
}

/**
 * Checks if an error is retryable
 */
export function isRetryableGeminiError(error: unknown): boolean {
  if (isTransientError(error)) return true
  if (error instanceof GeminiExtractionError) return error.retryable

  const message = String((error as Error)?.message || error || '')
  const errorName = (error as Error)?.name || ''

  // Rate limiting
  if (/rate.?limit|429|too.?many|quota/i.test(message)) return true

  // Server errors
  if (/5\d\d|server.?error|overloaded|unavailable/i.test(message)) return true

  // Timeout
  if (/timeout|ETIMEDOUT|aborted|deadline/i.test(message)) return true

  // Network errors (fetch failed, connection reset, etc.)
  if (/fetch.?failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|network|socket/i.test(message)) return true
  if (errorName === 'TypeError' && /fetch/i.test(message)) return true

  // JSON parsing errors (truncated response from Gemini)
  if (/unterminated|unexpected.?end|JSON|parse/i.test(message)) return true

  return false
}

// ============================================================================
// PROMPT CONSTRUCTION
// ============================================================================

/**
 * Clause type definitions with descriptions for the extraction prompt
 */
const CLAUSE_TYPE_GUIDE = `
INFLUENCER-SPECIFIC CLAUSES:
- morality_clause: Talent conduct, reputation, criminal history, behavior that could damage brand
  EXAMPLES: "Talent represents no criminal record", "shall not engage in conduct that would disparage", "Morals clause"
  NOTE: Often phrased as warranties - look for "morals", "conduct", "reputation", "criminal", "disparage"

- expenses: Expense reimbursement OR denial of expense coverage - capture BOTH
  EXAMPLES: "Brand shall reimburse travel expenses", "no obligation for expenses or costs"
  NOTE: Even "no expenses" clauses should be classified as expenses

- usage_rights: How brand can use talent's content/likeness
  EXAMPLES: "perpetual license to use Content", "whitelisting rights", "boosting rights", "paid media"

- publicity_rights: Brand's right to publicize the relationship with talent
  EXAMPLES: "may tag Talent's name", "announce partnership publicly", "press release"

- approval_rights: Talent's right to review/approve content before publication
  EXAMPLES: "subject to Talent's prior written approval", "24-hour review period", "right to approve"

- deliverables: Specific content talent must create (posts, videos, stories)
  EXAMPLES: "One (1) TikTok post", "Instagram Story", "YouTube video", "social media content"

- exclusivity: Restrictions on working with competitors
  EXAMPLES: "shall not promote competing products", "exclusive to Brand in category"

FINANCIAL CLAUSES:
- payment_terms: Amount, timing, method of payment
- invoicing: Invoice submission requirements
- invoicing_obligation: Specific invoicing duties
- invoicing_consequence: Penalties for invoicing failures
- taxes: Tax responsibility and withholding

LEGAL/LIABILITY CLAUSES:
- termination: How contract can be ended, effect of termination, cancellation fees
- confidentiality: NDA/secrecy obligations
- liability: Limitation of liability, damage caps
- indemnification: Protection from third-party claims
- warranty: Guarantees about work/product quality (NOT talent conduct - that's morality_clause)
- compliance: FTC disclosure, platform terms, regulatory requirements
  EXAMPLES: "FTC Endorsement Guidelines", "#ad disclosure", "platform terms of use"

STANDARD CONTRACT CLAUSES:
- intellectual_property: IP ownership, licensing, work-for-hire
- timeline: Project milestones, deadlines
- dispute_resolution: How disputes are handled
- governing_law: Which jurisdiction's laws apply
- force_majeure: Excuses for uncontrollable events
- assignment: Can contract be transferred
- modification: How contract can be changed
- notice: How formal notices must be sent
- non_compete: Restrictions on competing
- non_solicitation: Cannot poach employees/clients
- audit_rights: Right to inspect records
- data_protection: GDPR/privacy compliance
- insurance: Required insurance coverage

CATCH-ALL (use sparingly):
- miscellaneous: ONLY for true boilerplate (signatures, counterparts, electronic delivery, entire agreement)
  NOTE: If uncertain between miscellaneous and a specific type, prefer the specific type`

/**
 * Builds the system prompt for Gemini extraction
 */
export function buildGeminiSystemPrompt(totalLines: number): string {
  return `You are "ContractBuddy Clause Extractor" - a precision legal document parser specialized in influencer marketing contracts.

YOUR TASK: Extract all clauses from the contract by identifying their LINE NUMBERS.
The document has been pre-processed with line numbers in brackets: [0], [1], [2], etc.
Total lines in this document: ${totalLines} (line numbers 0 to ${totalLines - 1})

WHAT IS A CLAUSE?
- ONE obligation, requirement, right, or definition
- A COMPLETE THOUGHT that can stand alone grammatically
- Typically 1-10 lines of text
- MUST include COMPLETE sentences - never cut mid-sentence

SPLITTING RULES (each becomes separate clause):
1. Each bullet point (bullet, dash, asterisk) = separate clause
2. Each numbered item (1., 2., a)) = separate clause
3. Different obligations joined by "and shall" / "and must" = split
4. Different actors ("Influencer must" vs "Brand shall") = split
5. CRITICAL - "Representations and Warranties" sections:
   - Split by each lettered sub-item: (a), (b), (c), (d), etc.
   - Each sub-item becomes its OWN clause with appropriate type
   - Example: "(d) Morals" sub-item → separate morality_clause
   - Do NOT combine entire R&W section into one warranty clause

CLAUSE TYPES - Use the most specific match:
${CLAUSE_TYPE_GUIDE}

EDGE CASE RULES:
1. MORALITY vs WARRANTY:
   - If clause mentions "morals", "conduct", "reputation", "criminal", "disparage" → morality_clause
   - Even if phrased as "Talent represents and warrants..." → still morality_clause
   - warranty is for product/service QUALITY guarantees, NOT personal conduct

2. NEGATIVE CLAUSES - Still capture them:
   - "No expenses will be paid" → expenses (captures the term's denial)
   - "No exclusivity" → exclusivity (captures absence of exclusivity)
   - Capture what the contract SAYS, even if it denies something

3. SECTION HEADERS as hints:
   - If section is labeled "d. Morals" → clauses inside are morality_clause
   - Use explicit headers to guide classification

TYPE SELECTION PRIORITY:
1. Check explicit section headers first (e.g., "d. Morals" → morality_clause)
2. Look for influencer-specific keywords (deliverables, usage, exclusivity, morals)
3. Match the PRIMARY obligation, not secondary phrasing
4. When in doubt between warranty and morality_clause → choose morality_clause
5. miscellaneous is ONLY for execution/signature boilerplate

RAG_STATUS:
- "green": Standard clause, no issues expected
- "amber": Non-standard language or potentially concerning
- "red": Unusual terms that may require legal review

CRITICAL RULES:
- Extract EVERY substantive clause - do not skip content
- Section headers like "PAYMENT TERMS" are NOT clauses themselves
- start_line and end_line are 0-indexed and inclusive
- Confidence must be between 0.0 and 1.0
- If a clause spans lines 5-7, use start_line: 5, end_line: 7`
}

// ============================================================================
// GEMINI API CALLS
// ============================================================================

/**
 * Makes Gemini API call for extraction with structured output
 */
export async function callGemini(
  client: GoogleGenAI,
  systemPrompt: string,
  documentText: string,
  model: GeminiModel,
  temperature: number = 0.2,
  timeoutMs: number = EXTRACTION_TIMEOUT_MS
): Promise<ExtractionResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // Get JSON schema from Zod v4
    const jsonSchema = z.toJSONSchema(ExtractionResponseSchema)

    const response = await client.models.generateContent({
      model,
      contents: `${systemPrompt}\n\n---\n\nExtract all clauses from this contract:\n\n${documentText}`,
      config: {
        temperature,
        responseMimeType: 'application/json',
        responseSchema: jsonSchema as Record<string, unknown>,
      },
    })

    clearTimeout(timeoutId)

    // Parse and validate response
    const text = response.text
    if (!text) {
      throw new GeminiExtractionError(
        'Empty response from Gemini API',
        'EMPTY_RESPONSE',
        true
      )
    }

    try {
      const parsed = JSON.parse(text)
      const validated = ExtractionResponseSchema.parse(parsed)
      return validated
    } catch (parseError) {
      // JSON parse errors are often transient (truncated responses) - mark as retryable
      throw new GeminiExtractionError(
        `Failed to parse Gemini response: ${(parseError as Error).message}`,
        'PARSE_ERROR',
        true  // Retryable - Gemini sometimes returns truncated JSON
      )
    }
  } catch (error) {
    clearTimeout(timeoutId)

    if ((error as Error).name === 'AbortError') {
      throw new GeminiExtractionError(
        `Gemini API request timed out after ${timeoutMs}ms`,
        'TIMEOUT',
        true
      )
    }

    if (error instanceof GeminiExtractionError) {
      throw error
    }

    // Check for API errors
    const errorMessage = (error as Error).message || String(error)
    const retryable = isRetryableGeminiError(error)
    throw new GeminiExtractionError(
      `Gemini API error: ${errorMessage}`,
      'API_ERROR',
      retryable
    )
  }
}

/**
 * Makes Gemini API call with retry logic
 */
export async function callGeminiWithRetry(
  client: GoogleGenAI,
  systemPrompt: string,
  documentText: string,
  model: GeminiModel,
  temperature: number = 0.2,
  timeoutMs: number = EXTRACTION_TIMEOUT_MS,
  maxRetries: number = 3
): Promise<{ response: ExtractionResponse; retriesUsed: number }> {
  let retriesUsed = 0

  const response = await withRetry(
    async () => {
      try {
        return await callGemini(client, systemPrompt, documentText, model, temperature, timeoutMs)
      } catch (err) {
        retriesUsed++
        throw err
      }
    },
    {
      maxRetries,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    },
    isRetryableGeminiError,
    'gemini-extraction'
  )

  return { response, retriesUsed }
}

// ============================================================================
// CLAUSE PROCESSING
// ============================================================================

/**
 * Converts Gemini line-based clauses to indexed clauses using line mapper
 */
export function convertGeminiClausesToIndices(
  geminiClauses: ClauseFromGemini[],
  lineDoc: LineNumberedDocument
): RawIndexedClause[] {
  // Convert to RawLineBasedClause format
  const lineClauses: RawLineBasedClause[] = geminiClauses.map((c) => ({
    start_line: c.start_line,
    end_line: c.end_line,
    clause_type: c.clause_type,
    summary: c.summary,
    confidence: c.confidence,
    rag_status: c.rag_status,
    section_title: c.section_title,
  }))

  // Use line-mapper to convert
  return convertLinesToIndices(lineClauses, lineDoc)
}

/**
 * Converts validated clauses to final ExtractedClause format
 */
export function toExtractedClauses(validated: ValidatedClause[]): ExtractedClause[] {
  return validated.map((v) => ({
    content: v.content,
    start_index: v.start_index,
    end_index: v.end_index,
    clause_type: v.clause_type,
    summary: v.summary,
    confidence: v.confidence,
    rag_status: v.rag_status,
    section_title: v.section_title,
  }))
}

// ============================================================================
// EXTRACTION ADAPTER CLASS
// ============================================================================

/**
 * Gemini Extraction Adapter class
 * Single-pass extraction with 1M token context window
 */
export class GeminiExtractionAdapter {
  private config: Required<GeminiExtractionConfig>
  private client: GoogleGenAI

  constructor(config: GeminiExtractionConfig) {
    if (!config.apiKey) {
      throw new GeminiExtractionError('Google AI API key is required', 'CONFIG_ERROR', false)
    }
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<GeminiExtractionConfig>
    this.client = new GoogleGenAI({ apiKey: this.config.apiKey })
  }

  /**
   * Extracts clauses from contract text
   * Uses single-pass extraction (no chunking) thanks to 1M token context
   */
  async extract(text: string): Promise<ExtractionResult> {
    const startTime = Date.now()
    const sanitizedText = sanitizeText(text)
    const tokensEstimated = estimateTokens(sanitizedText)

    // Guard against extremely large documents (>900K tokens)
    // This should be rare - 900K tokens = ~3.6M characters = ~720,000 words
    if (tokensEstimated > 900_000) {
      throw new GeminiExtractionError(
        `Document too large (${tokensEstimated} tokens). Maximum supported: 900,000 tokens.`,
        'DOCUMENT_TOO_LARGE',
        false
      )
    }

    // Step 1: Prepare line-numbered document
    const lineDoc = prepareLineNumberedDocument(sanitizedText)

    // Step 2: Build prompt with total lines
    const systemPrompt = buildGeminiSystemPrompt(lineDoc.totalLines)

    // Step 3: Call Gemini with structured output
    const { response, retriesUsed } = await callGeminiWithRetry(
      this.client,
      systemPrompt,
      lineDoc.numberedText,
      this.config.model,
      this.config.temperature,
      this.config.timeoutMs,
      this.config.maxAttempts
    )

    // Step 4: Convert line numbers to character indices
    const indexedClauses = convertGeminiClausesToIndices(response.clauses, lineDoc)

    // Step 5: Validate and snap boundaries
    const validationResult = validateClauseIndices(indexedClauses, sanitizedText, {
      minClauseLength: this.config.minClauseLength,
      maxClauseLength: this.config.maxClauseLength,
      enableSnapping: this.config.enableSnapping,
      enableForcing: this.config.enableForcing,
    })

    // Step 6: Convert to final format
    const clauses = toExtractedClauses(validationResult.valid)

    return {
      clauses,
      model: this.config.model,
      telemetry: {
        totalClauses: clauses.length,
        extractionTimeMs: Date.now() - startTime,
        tokensEstimated,
        totalLines: lineDoc.totalLines,
        retriesUsed,
      },
      validation: validationResult.telemetry,
      snapping: validationResult.snapTelemetry,
    }
  }

  /**
   * Gets current configuration
   */
  getConfig(): Required<GeminiExtractionConfig> {
    return { ...this.config }
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Sanitizes text for extraction (removes null bytes)
 */
export function sanitizeText(text: string): string {
  return text.replace(/\0/g, '')
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates a new Gemini extraction adapter
 */
export function createGeminiExtractionAdapter(
  config: GeminiExtractionConfig
): GeminiExtractionAdapter {
  return new GeminiExtractionAdapter(config)
}

/**
 * Creates adapter from environment variables
 */
export function createGeminiExtractionAdapterFromEnv(): GeminiExtractionAdapter {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new GeminiExtractionError(
      'GEMINI_API_KEY or GOOGLE_AI_API_KEY environment variable not set',
      'CONFIG_ERROR',
      false
    )
  }

  return new GeminiExtractionAdapter({
    apiKey,
    model: (process.env.EXTRACTION_MODEL as GeminiModel) || 'gemini-3-flash-preview',
  })
}
