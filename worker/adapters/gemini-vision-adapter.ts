/**
 * Gemini Vision Adapter
 * Extracts clauses directly from scanned PDFs using Gemini's vision capabilities
 *
 * Use case: When text extraction fails (scanned/image PDFs), we send the PDF
 * directly to Gemini Vision which can read images and extract clauses.
 */

import { GoogleGenAI } from '@google/genai'

// ============================================================================
// TYPES
// ============================================================================

export type RagStatus = 'green' | 'amber' | 'red'

export interface VisionExtractedClause {
  content: string
  clause_type: string
  summary: string
  confidence: number
  rag_status: RagStatus
  section_title?: string
  // Vision extraction doesn't have character indices (no source text)
  start_index: number
  end_index: number
}

export interface VisionExtractionResult {
  clauses: VisionExtractedClause[]
  model: string
  telemetry: {
    extractionTimeMs: number
    pdfSizeBytes: number
    method: 'vision'
  }
}

export interface GeminiVisionConfig {
  apiKey: string
  model?: string
  temperature?: number
  timeoutMs?: number
}

// ============================================================================
// EXTRACTION PROMPT
// ============================================================================

const VISION_EXTRACTION_PROMPT = `You are "ContractBuddy Clause Extractor" - a legal document parser for influencer marketing contracts.

Extract ALL clauses from this scanned contract PDF. Return JSON only.

CLAUSE TYPES (use most specific):
INFLUENCER: deliverables, payment_terms, exclusivity, usage_rights, approval_rights, morality_clause, expenses, compliance
LEGAL: termination, confidentiality, indemnification, liability, warranty
STANDARD: intellectual_property, timeline, governing_law, dispute_resolution, force_majeure, non_compete, assignment, modification, notice
OTHER: tagging, posting_restrictions, disclosure, performance_metrics, content_restrictions, ethical_conduct, independent_contractor, entire_agreement, counterparts, severability, survival, good_faith

RAG_STATUS: "green" (standard), "amber" (non-standard), "red" (needs review)

CONFIDENCE: 0.9-1.0 (clear), 0.7-0.9 (some ambiguity), 0.5-0.7 (uncertain)

OUTPUT FORMAT:
{
  "clauses": [
    {
      "clause_type": "payment_terms",
      "content": "The exact clause text from the document",
      "summary": "One-sentence summary",
      "confidence": 0.95,
      "rag_status": "green"
    }
  ]
}

RULES:
- Extract EVERY substantive clause
- Capture FULL clause text
- Skip section headers
- Use most specific clause_type`

// ============================================================================
// ADAPTER CLASS
// ============================================================================

export class GeminiVisionAdapter {
  private client: GoogleGenAI
  private model: string
  private temperature: number
  private timeoutMs: number

  constructor(config: GeminiVisionConfig) {
    if (!config.apiKey) {
      throw new Error('Gemini API key is required')
    }
    this.client = new GoogleGenAI({ apiKey: config.apiKey })
    this.model = config.model || 'gemini-3-flash-preview' // 64K output token limit
    this.temperature = config.temperature ?? 0 // Deterministic for consistent extraction
    this.timeoutMs = config.timeoutMs || 120000 // 2 minutes default
  }

  /**
   * Extract clauses from a PDF using Gemini Vision
   * @param pdfBuffer - The PDF file as an ArrayBuffer
   * @returns Extraction result with clauses
   */
  async extractFromPdf(pdfBuffer: ArrayBuffer): Promise<VisionExtractionResult> {
    const startTime = Date.now()
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: VISION_EXTRACTION_PROMPT },
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64
              }
            }
          ]
        }
      ],
      config: {
        temperature: this.temperature,
        maxOutputTokens: 65536, // Gemini 2.5/3 Flash supports higher output
        responseMimeType: 'application/json', // Force JSON output
      }
    })

    const responseText = response.text
    if (!responseText) {
      throw new Error('Empty response from Gemini Vision')
    }

    // Parse JSON response (may be wrapped in markdown code block)
    let parsed: { clauses: Array<{
      clause_type: string
      content: string
      summary: string
      confidence: number
      rag_status: string
      section_title?: string
    }> }

    try {
      // With responseMimeType: 'application/json', response should be clean JSON
      // But fallback to markdown extraction just in case
      let jsonStr = responseText.trim()

      // If response is wrapped in markdown code block (shouldn't happen with JSON mode)
      if (jsonStr.startsWith('```')) {
        const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
        if (codeBlockMatch && codeBlockMatch[1]) {
          jsonStr = codeBlockMatch[1].trim()
        } else {
          jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
        }
      }

      // If still not starting with {, find the JSON object
      if (!jsonStr.startsWith('{')) {
        const objectStart = jsonStr.indexOf('{')
        const objectEnd = jsonStr.lastIndexOf('}')
        if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
          jsonStr = jsonStr.slice(objectStart, objectEnd + 1)
        }
      }

      parsed = JSON.parse(jsonStr)
    } catch (parseError) {
      // Log a snippet of the response for debugging
      const snippet = responseText.slice(0, 300).replace(/\n/g, '\\n')
      throw new Error(`Failed to parse Gemini Vision response: ${(parseError as Error).message}. Response starts with: "${snippet}"`)
    }

    if (!parsed.clauses || !Array.isArray(parsed.clauses)) {
      throw new Error('Invalid response structure: missing clauses array')
    }

    // Convert to VisionExtractedClause format
    // For vision extraction, we don't have character indices, so we use sequential indices
    let currentIndex = 0
    const clauses: VisionExtractedClause[] = parsed.clauses.map((clause) => {
      const startIndex = currentIndex
      const endIndex = currentIndex + clause.content.length
      currentIndex = endIndex + 1

      return {
        content: clause.content,
        clause_type: clause.clause_type,
        summary: clause.summary,
        confidence: Math.min(1, Math.max(0, clause.confidence || 0.8)),
        rag_status: (['green', 'amber', 'red'].includes(clause.rag_status)
          ? clause.rag_status
          : 'amber') as RagStatus,
        section_title: clause.section_title,
        start_index: startIndex,
        end_index: endIndex,
      }
    })

    return {
      clauses,
      model: this.model,
      telemetry: {
        extractionTimeMs: Date.now() - startTime,
        pdfSizeBytes: pdfBuffer.byteLength,
        method: 'vision',
      }
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createGeminiVisionAdapter(config: GeminiVisionConfig): GeminiVisionAdapter {
  return new GeminiVisionAdapter(config)
}

export function createGeminiVisionAdapterFromEnv(): GeminiVisionAdapter {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_AI_API_KEY environment variable not set')
  }
  return new GeminiVisionAdapter({ apiKey })
}
