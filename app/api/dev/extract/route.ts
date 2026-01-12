import { NextRequest, NextResponse } from "next/server"
import { extractText } from 'unpdf'
import mammoth from 'mammoth'
import { GoogleGenAI } from '@google/genai'

/**
 * POST /api/dev/extract
 *
 * Direct extraction endpoint for dev testing - extracts clauses from a PDF/DOCX
 * without creating a deal or saving to database. Just returns raw extraction results.
 *
 * Protected: Only works in non-production environments
 */
export async function POST(request: NextRequest) {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Dev routes disabled in production' },
      { status: 403 }
    )
  }

  const startTime = Date.now()

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    // Validate file
    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PDF and DOCX are supported." },
        { status: 400 }
      )
    }

    // Check for Gemini API key
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY or GOOGLE_AI_API_KEY not configured" },
        { status: 500 }
      )
    }

    // 1. Extract text from file
    const textStartTime = Date.now()
    const buffer = await file.arrayBuffer()
    let text: string

    if (file.type === 'application/pdf') {
      const result = await extractText(new Uint8Array(buffer))
      text = typeof result === 'string' ? result : (result as { text: string }).text || String(result)
    } else {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer })
      text = result.value
    }
    const textExtractionTime = Date.now() - textStartTime

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "No text could be extracted from document" },
        { status: 400 }
      )
    }

    // Sanitize null bytes
    text = text.replace(/\u0000/g, '')

    // 2. Call Gemini for clause extraction
    const geminiStartTime = Date.now()
    const client = new GoogleGenAI({ apiKey })

    const systemPrompt = buildExtractionPrompt(text)
    const response = await client.models.generateContent({
      model: 'gemini-3-flash',
      contents: systemPrompt,
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_JSON_SCHEMA,
      },
    })
    const geminiTime = Date.now() - geminiStartTime

    // Parse response
    const responseText = response.text
    if (!responseText) {
      return NextResponse.json(
        { error: "Empty response from Gemini" },
        { status: 500 }
      )
    }

    let parsed: ExtractionResponse
    try {
      parsed = JSON.parse(responseText)
    } catch (parseError) {
      return NextResponse.json(
        { error: "Failed to parse Gemini response", details: (parseError as Error).message },
        { status: 500 }
      )
    }

    // 3. Build stats
    const clausesByType: Record<string, number> = {}
    for (const clause of parsed.clauses) {
      clausesByType[clause.clause_type] = (clausesByType[clause.clause_type] || 0) + 1
    }

    const totalTime = Date.now() - startTime

    return NextResponse.json({
      success: true,
      text_length: text.length,
      extraction_time_ms: totalTime,
      text_extraction_time_ms: textExtractionTime,
      gemini_time_ms: geminiTime,
      clauses: parsed.clauses.map(c => ({
        clause_type: c.clause_type,
        content: c.content,
        confidence: c.confidence,
        rag_status: c.rag_status,
        summary: c.summary,
        section_title: c.section_title,
      })),
      stats: {
        total: parsed.clauses.length,
        by_type: clausesByType,
      },
    })

  } catch (error) {
    console.error("Unexpected error in POST /api/dev/extract:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}

// ============================================================================
// TYPES AND JSON SCHEMA
// ============================================================================

interface ExtractedClause {
  content: string
  clause_type: string
  summary: string
  confidence: number
  rag_status: 'green' | 'amber' | 'red'
  section_title?: string
}

interface ExtractionResponse {
  clauses: ExtractedClause[]
}

// JSON Schema for Gemini structured output
const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    clauses: {
      type: 'array',
      description: 'Extracted clauses from the contract',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Full text of the clause' },
          clause_type: { type: 'string', description: 'Type of clause' },
          summary: { type: 'string', description: 'One sentence description' },
          confidence: { type: 'number', description: 'Confidence score 0-1' },
          rag_status: { type: 'string', enum: ['green', 'amber', 'red'], description: 'Risk assessment' },
          section_title: { type: 'string', description: 'Section header if present' },
        },
        required: ['content', 'clause_type', 'summary', 'confidence', 'rag_status'],
      },
    },
  },
  required: ['clauses'],
}

function buildExtractionPrompt(documentText: string): string {
  return `You are "ContractBuddy Clause Extractor" - a precision legal document parser for influencer marketing contracts.

Extract all clauses from the contract below. Each clause should be:
- ONE obligation, requirement, right, or definition
- A complete thought that can stand alone

CLAUSE TYPES (use most specific):
- deliverables: Content talent must create (posts, videos, stories)
- payment_terms: Amount, timing, method of payment
- exclusivity: Restrictions on working with competitors
- usage_rights: How brand can use talent's content/likeness
- approval_rights: Talent's right to review/approve content
- morality_clause: Talent conduct, reputation requirements
- termination: How contract can be ended
- confidentiality: NDA/secrecy obligations
- indemnification: Protection from third-party claims
- liability: Limitation of liability, damage caps
- expenses: Expense reimbursement or denial
- compliance: FTC disclosure, platform terms
- intellectual_property: IP ownership, licensing
- governing_law: Which jurisdiction's laws apply
- force_majeure: Excuses for uncontrollable events
- warranty: Guarantees about work quality
- miscellaneous: True boilerplate only

RAG_STATUS:
- green: Standard clause, no issues expected
- amber: Non-standard or potentially concerning
- red: Unusual terms requiring legal review

Extract all substantive clauses. Section headers are NOT clauses.

---

CONTRACT TEXT:

${documentText}`
}
