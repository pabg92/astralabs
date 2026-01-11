/**
 * Gemini Extraction Adapter
 * Handles clause extraction via Google Gemini 3 Flash API for contract documents
 *
 * Benefits over OpenAI:
 * - 1M token context window (vs 128K) - no chunking needed
 * - 5-16x cheaper ($0.50/1M input vs $2.50/1M)
 * - 3x faster response times
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
 */
export type GeminiModel = 'gemini-3-flash' | 'gemini-3-pro' | 'gemini-2.0-flash'

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

  // Rate limiting
  if (/rate.?limit|429|too.?many|quota/i.test(message)) return true

  // Server errors
  if (/5\d\d|server.?error|overloaded|unavailable/i.test(message)) return true

  // Timeout
  if (/timeout|ETIMEDOUT|aborted|deadline/i.test(message)) return true

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

CLAUSE_TYPE VALUES (use exactly one):
${CLAUSE_TYPES}

RAG_STATUS:
- "green": Standard clause, no issues expected
- "amber": Non-standard language or potentially concerning
- "red": Unusual terms that may require legal review

CRITICAL RULES:
- Extract EVERY substantive clause - do not skip content
- Section headers like "PAYMENT TERMS" are NOT clauses
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
      throw new GeminiExtractionError(
        `Failed to parse Gemini response: ${(parseError as Error).message}`,
        'PARSE_ERROR',
        false
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
    model: (process.env.EXTRACTION_MODEL as GeminiModel) || 'gemini-3-flash',
  })
}
