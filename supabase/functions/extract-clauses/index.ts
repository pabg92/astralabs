// Edge Function: extract-clauses
// Phase 5 - Checkpoint A: Queue polling
// Polls document_processing_queue, extracts clauses from contracts, persists to database

import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const OPENAI_CHUNK_SIZE = 12000 // characters per chunk (≈3k tokens)
const OPENAI_CHUNK_OVERLAP = 800 // characters of overlap between chunks
const OPENAI_MIN_CHARS_FOR_CHUNK = 600
const OPENAI_MIN_CLAUSES_PER_CHUNK = 3
const OPENAI_MAX_ATTEMPTS = 2

// ============ MODEL CONFIGURATION ============
const ALLOWED_MODELS = ["gpt-4o", "gpt-5.1", "gpt-5.1-codex-mini"] as const
type AllowedModel = typeof ALLOWED_MODELS[number]

const MAX_CLAUSE_LENGTH = 600 // Increased from 400 to reduce mid-sentence fragments (legal sentences often 300-500 chars)

// Model context limits (tokens)
const MODEL_CONTEXT_LIMITS: Record<AllowedModel, number> = {
  "gpt-4o": 128_000,
  "gpt-5.1": 400_000,
  "gpt-5.1-codex-mini": 400_000
}

// Timeout budget for extraction (Supabase Edge default 60s, max 150s)
const EXTRACTION_TIMEOUT_MS = 90_000 // 90 seconds

function getExtractionModel(): { model: AllowedModel; isValid: boolean } {
  const configuredModel = Deno.env.get("EXTRACTION_MODEL") || "gpt-5.1"

  if (ALLOWED_MODELS.includes(configuredModel as AllowedModel)) {
    return { model: configuredModel as AllowedModel, isValid: true }
  }

  console.error(`Invalid EXTRACTION_MODEL: "${configuredModel}". Allowed: ${ALLOWED_MODELS.join(", ")}`)
  console.warn(`Falling back to gpt-5.1 extraction`)
  return { model: "gpt-5.1", isValid: false }
}

const { model: EXTRACTION_MODEL, isValid: modelConfigValid } = getExtractionModel()
console.log(`Extraction model: ${EXTRACTION_MODEL} (config valid: ${modelConfigValid})`)

// Rough token estimation: ~4 chars per token for English text
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

interface ExtractionPathDecision {
  path: "single_pass" | "chunked"
  model: AllowedModel
  reason: string
  estimatedTokens: number
  contextLimit: number
}

function decideExtractionPath(
  text: string,
  preferredModel: AllowedModel
): ExtractionPathDecision {
  const estimatedTokens = estimateTokens(text)
  const contextLimit = MODEL_CONTEXT_LIMITS[preferredModel]

  // Reserve 30% of context for system prompt + output (conservative for OCR/noisy docs)
  const safeInputLimit = Math.floor(contextLimit * 0.7)

  if (estimatedTokens <= safeInputLimit) {
    return {
      path: "single_pass",
      model: preferredModel,
      reason: `Input (${estimatedTokens} tokens) fits in ${preferredModel} context (${safeInputLimit} safe limit)`,
      estimatedTokens,
      contextLimit
    }
  }

  // Context overflow - fall back to chunked extraction with gpt-4o
  const fallbackModel: AllowedModel = "gpt-4o"
  console.warn(`Context overflow: ${estimatedTokens} tokens exceeds ${safeInputLimit} safe limit for ${preferredModel}`)

  return {
    path: "chunked",
    model: fallbackModel,
    reason: `Input too large (${estimatedTokens} tokens), falling back to chunked ${fallbackModel} extraction`,
    estimatedTokens,
    contextLimit
  }
}

// ============ LEGAL ABBREVIATION PROTECTION ============

// Common legal abbreviations that contain periods but shouldn't trigger sentence splits
const LEGAL_ABBREVIATIONS = [
  'Inc.', 'Corp.', 'Ltd.', 'LLC.', 'L.L.C.', 'Co.',
  'No.', 'Nos.', 'vs.', 'v.', 'U.S.', 'U.K.',
  'et al.', 'e.g.', 'i.e.', 'etc.',
  'F.2d', 'F.3d', 'F. Supp.', 'S. Ct.',
  'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Jr.', 'Sr.',
  'Art.', 'Sec.', 'Ch.', 'Pt.', 'Vol.',
  'approx.', 'min.', 'max.', 'avg.',
  'Jan.', 'Feb.', 'Mar.', 'Apr.', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'
]

// Placeholder character that won't appear in contracts
const ABBREV_PLACEHOLDER = '§'

/**
 * Protect legal abbreviations from false sentence splits.
 * Replaces periods in known abbreviations with a placeholder.
 */
function protectLegalAbbreviations(text: string): string {
  let result = text
  for (const abbr of LEGAL_ABBREVIATIONS) {
    // Create regex that matches the abbreviation (escape special chars)
    const escaped = abbr.replace(/\./g, '\\.')
    const pattern = new RegExp(escaped, 'g')
    // Replace with placeholder version
    const placeholder = abbr.replace(/\./g, ABBREV_PLACEHOLDER)
    result = result.replace(pattern, placeholder)
  }
  return result
}

/**
 * Restore legal abbreviations after sentence splitting.
 * Replaces placeholders back with periods.
 */
function restoreLegalAbbreviations(text: string): string {
  return text.replace(new RegExp(ABBREV_PLACEHOLDER, 'g'), '.')
}

// ============ HELPER FUNCTIONS ============

/**
 * Monotonic search for clause offset in extracted text.
 * Searches starting from lastEnd to prevent duplicate misplacement.
 * Falls back to fuzzy whitespace-normalized matching if exact match fails.
 */
function findClauseOffset(
  fullText: string,
  clauseContent: string,
  searchFrom: number
): { start: number; end: number } | null {
  if (!clauseContent || !fullText) return null

  // First try: exact match from searchFrom position
  const exactIdx = fullText.indexOf(clauseContent, searchFrom)
  if (exactIdx >= 0) {
    return { start: exactIdx, end: exactIdx + clauseContent.length }
  }

  // Fallback: whitespace-normalized fuzzy search
  const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim()
  const normalizedClause = normalizeWs(clauseContent)

  if (normalizedClause.length < 20) {
    // Too short for reliable fuzzy matching
    return null
  }

  // Search in a window from searchFrom
  const searchWindow = fullText.slice(searchFrom)
  const normalizedWindow = normalizeWs(searchWindow)
  const fuzzyIdx = normalizedWindow.indexOf(normalizedClause)

  if (fuzzyIdx >= 0) {
    // Map back to original positions (approximate)
    // Walk through original text counting normalized chars
    let normalizedCount = 0
    let originalStart = searchFrom
    let inWhitespace = false

    for (let i = 0; i < searchWindow.length && normalizedCount < fuzzyIdx; i++) {
      const isWs = /\s/.test(searchWindow[i])
      if (!isWs) {
        normalizedCount++
        inWhitespace = false
      } else if (!inWhitespace) {
        normalizedCount++ // Count first whitespace as single space
        inWhitespace = true
      }
      originalStart = searchFrom + i + 1
    }

    // Find where the clause ends in original text
    const endSearchStart = originalStart
    let endNormalizedCount = 0
    let originalEnd = originalStart
    inWhitespace = false

    for (let i = 0; i < fullText.length - endSearchStart && endNormalizedCount < normalizedClause.length; i++) {
      const char = fullText[endSearchStart + i]
      const isWs = /\s/.test(char)
      if (!isWs) {
        endNormalizedCount++
        inWhitespace = false
      } else if (!inWhitespace) {
        endNormalizedCount++
        inWhitespace = true
      }
      originalEnd = endSearchStart + i + 1
    }

    // Validate span length to avoid truncated highlights on fuzzy matches
    const spanLength = originalEnd - originalStart
    const expectedLength = clauseContent.length
    const lengthDiff = Math.abs(spanLength - expectedLength)

    if (lengthDiff > expectedLength * 0.2 || lengthDiff > 50) {
      return null // Better to skip highlight than render wrong span
    }

    return { start: originalStart, end: originalEnd }
  }

  // Not found - return null rather than wrong offset
  return null
}

function validateRagStatus(status: any): "green" | "amber" | "red" {
  const normalized = String(status || "amber").toLowerCase()
  if (normalized === "green" || normalized === "amber" || normalized === "red") {
    return normalized
  }
  return "amber"
}

// ============ ROBUST JSON PARSING ============

function parseClausesResponse(data: any): any[] {
  // Handle SDK structured outputs (message.parsed)
  if (data.choices?.[0]?.message?.parsed) {
    const parsed = data.choices[0].message.parsed
    return extractClausesArray(parsed)
  }

  // Handle string content that needs parsing
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    console.error("No content in OpenAI response")
    return []
  }

  // If content is already parsed (object/array), use directly
  if (typeof content === "object") {
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

function extractClausesArray(parsed: any): any[] {
  // Handle direct array
  if (Array.isArray(parsed)) {
    return parsed
  }

  // Handle { clauses: [...] }
  if (parsed?.clauses && Array.isArray(parsed.clauses)) {
    return parsed.clauses
  }

  // Handle single clause object
  if (parsed?.content && parsed?.clause_type) {
    return [parsed]
  }

  console.warn("Unexpected response shape, returning empty array")
  return []
}

// ============ SINGLE-PASS EXTRACTION ============

async function extractClausesSinglePass(
  contractText: string,
  apiKey: string,
  model: AllowedModel = "gpt-5.1"
): Promise<ExtractedClause[]> {
  const estimatedTokens = estimateTokens(contractText)
  console.log(`${model} extraction: ${contractText.length} chars (~${estimatedTokens} tokens) in single pass`)

  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS)

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      signal: controller.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are "ContractBuddy Clause Extractor" - a precision legal document parser.

YOUR PRIMARY OBJECTIVE: Decompose this contract into ATOMIC, SINGLE-OBLIGATION clauses.

OUTPUT MUST BE JSON:
- Return ONLY a single JSON object (no prose, no markdown).
- The word "json" here is intentional to satisfy response_format requirements.

WHAT IS AN ATOMIC CLAUSE?
- ONE obligation, requirement, right, or definition
- 50-${MAX_CLAUSE_LENGTH} characters (ideal: 150-300)
- 1-2 sentences maximum
- Can stand alone grammatically

MANDATORY SPLITTING RULES:
1. NUMBERED LISTS (1., 2., 3.): Each item = separate clause
2. BULLETED LISTS (-, *, •): Each bullet = separate clause
3. MULTIPLE SENTENCES: Split if expressing DIFFERENT obligations
4. CONJUNCTIONS ("and shall", "and must"): Split at each obligation
5. DIFFERENT DEADLINES: Each deadline = separate clause
6. DIFFERENT ACTORS ("Influencer must", "Brand shall"): Split by actor

HARD LIMIT: Maximum ${MAX_CLAUSE_LENGTH} characters per clause. If longer, SPLIT IT.

CRITICAL - SENTENCE COMPLETENESS:
- Every clause MUST be a COMPLETE sentence ending with . or ; or ! or ?
- NEVER cut a clause mid-sentence
- If splitting a long sentence, find natural break points (semicolons, colons, commas before conjunctions)
- A clause like "The influencer shall deliver" is WRONG (incomplete)
- A clause like "The influencer shall deliver all content by the deadline." is CORRECT

EXAMPLE:
Input: "PAYMENT: Invoice within 7 days. Payment within 30 days. Invoice must include: (1) date (2) VAT number (3) address"
Output: 5 clauses (one per obligation, each a complete sentence)

WHEN IN DOUBT: SPLIT. More small clauses is always better than one mega-clause.

OUTPUT FORMAT:
{
  "clauses": [
    {
      "section_title": "exact section heading from document",
      "content": "verbatim clause text (50-${MAX_CLAUSE_LENGTH} chars)",
      "clause_type": "snake_case_type",
      "summary": "1 sentence description",
      "confidence": 0.0-1.0,
      "rag_status": "green" | "amber" | "red"
    }
  ]
}

VALIDATION BEFORE OUTPUT:
- Every clause < ${MAX_CLAUSE_LENGTH} chars? If not, SPLIT IT
- Every clause has ≤ 2 sentences? If not, SPLIT IT
- Every list item is a separate clause? If not, FIX IT
- Expected: 80-150 clauses for a typical contract`
          },
          {
            role: "user",
            content: `Extract all clauses from this contract. Remember: SPLIT aggressively. Each obligation = one clause.

CONTRACT TEXT:
${contractText}`
          }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${model} API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()

    // Robust JSON parsing - handle SDK structured outputs and edge cases
    const clausesArray = parseClausesResponse(data)

    return clausesArray.map((clause: any, index: number) => ({
      content: String(clause.content || ""),
      clause_type: String(clause.clause_type || "general_terms").replace(/\s+/g, "_"),
      summary: String(clause.summary || ""),
      confidence: Number(clause.confidence || 0.8),
      rag_status: validateRagStatus(clause.rag_status),
      section_title: clause.section_title || null,
      chunk_index: 0, // Single pass, no chunks
      start_page: clause.start_page || null,
      end_page: clause.end_page || null,
      parsing_quality: Number(clause.confidence || 0.8)
    }))
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.warn(`${model} extraction timed out after ${EXTRACTION_TIMEOUT_MS / 1000}s`)
      // Don't retry here - let caller decide (may fall back to chunked)
      throw new Error(`${model} extraction timed out after ${EXTRACTION_TIMEOUT_MS / 1000}s - consider chunked fallback`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

// ============ EXTRACTION WRAPPERS ============

// Wrapper with timeout fallback to chunked extraction
async function extractWithTimeoutFallback(
  contractText: string,
  apiKey: string,
  pathDecision: ExtractionPathDecision
): Promise<{ clauses: ExtractedClause[]; usedFallback: boolean }> {
  if (pathDecision.path === "chunked") {
    // Already chunked path - use existing flow
    const clauses = await runChunkedExtraction(contractText, apiKey, pathDecision.model)
    return { clauses, usedFallback: false }
  }

  try {
    const clauses = await extractClausesSinglePass(contractText, apiKey, pathDecision.model)
    return { clauses, usedFallback: false }
  } catch (err: any) {
    if (err.message.includes("timed out")) {
      console.warn(`Single-pass timed out, falling back to chunked extraction`)
      const clauses = await runChunkedExtraction(contractText, apiKey, "gpt-4o")
      return { clauses, usedFallback: true }
    }
    throw err
  }
}

// runChunkedExtraction wraps the existing chunked flow
// Note: Forward declaration - callOpenAIForChunk and chunkContractText defined below
async function runChunkedExtraction(
  contractText: string,
  apiKey: string,
  model: AllowedModel
): Promise<ExtractedClause[]> {
  const textChunks = chunkContractText(contractText)
  let extractedClauses: ExtractedClause[] = []

  for (let i = 0; i < textChunks.length; i++) {
    const chunkPayload = textChunks[i]
    // IMPORTANT: Pass model to allow chunked 5.1 if needed
    const chunkClauses = await callOpenAIForChunk({
      apiKey,
      chunkText: chunkPayload.text,
      chunkIndex: i,
      totalChunks: textChunks.length,
      sections: chunkPayload.sections,
      model // Pass model param
    })
    const coveredClauses = ensureSectionCoverage(chunkPayload.sections, chunkClauses, i)
    extractedClauses.push(...coveredClauses)
  }

  return dedupeClauses(extractedClauses)
}

type ExtractedClause = {
  content: string
  clause_type: string
  summary: string
  confidence: number
  rag_status: "green" | "amber" | "red"
  start_page?: number
  end_page?: number
  parsing_quality?: number
  section_title?: string
  chunk_index?: number
}

type SectionInfo = {
  title: string
  content: string
}

type ChunkPayload = {
  text: string
  sections: SectionInfo[]
}

function normalizeSectionTitle(title: string | undefined | null) {
  if (!title) return ""
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function cleanHeading(line: string) {
  return line.replace(/[:\-–—\s]+$/g, "").trim()
}

/**
 * Signature/contact block filter: Excludes common signature placeholders,
 * party headers, and contact fields to reduce noise in clause extraction.
 *
 * Filters out:
 * - Party/entity names: DIOR, INFLUENCER, BRAND, TALENT, LOAN OUT ENTITY, COUNTERPARTY
 * - Signature fields: "By:", "Name:", "Its:", "Title:", "Signature", "[ ] By", "[ ] Name"
 * - Contact labels: "Influencer Contact", "Contact Information", "Phone", "Email"
 *
 * Only filters lines that consist primarily of these tokens; genuine headings
 * that happen to include keywords (e.g., "Confidentiality of Influencer shall remain...")
 * are preserved.
 */
function isSignatureOrContactHeading(line: string): boolean {
  const cleaned = cleanHeading(line).toLowerCase()

  // Party/entity headers (typically standalone or with minimal context)
  const partyPatterns = /^(dior|influencer|brand|talent|loan out entity|counterparty|client|agency|advertiser)$/i
  if (partyPatterns.test(cleaned)) return true

  // Signature field labels (often with brackets or colons)
  const signaturePatterns = /^(\[\s*\])?\s*(by|name|its|title|signature|date|signed|executed)[\s:]*$/i
  if (signaturePatterns.test(cleaned)) return true

  // Signature blocks with placeholder structure: "[ ] By: ___ Name: ___ Its: ___"
  if (/\[\s*\]\s*(by|name|its|title)/i.test(cleaned)) return true

  // Contact/address labels
  const contactPatterns = /^(influencer\s+contact|contact\s+information|phone|email|address|telephone|mobile)[\s:]*$/i
  if (contactPatterns.test(cleaned)) return true

  // Generic signature placeholders
  if (/^_+$/.test(cleaned)) return true  // Lines with only underscores
  if (/^(signature|print\s+name|authorized\s+signatory)$/i.test(cleaned)) return true

  return false
}

function isHeadingLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 150) return false
  const cleaned = cleanHeading(trimmed)
  if (cleaned.length < 2) return false

  const words = cleaned.split(/\s+/)
  const wordCount = words.length

  // === EXCLUSION RULES (filter out false positives) ===

  // Skip signature blocks and contact information (added to reduce noise)
  if (isSignatureOrContactHeading(line)) return false

  // Skip bullet points
  if (/^[-•*]\s/.test(trimmed)) return false

  // Skip person titles
  if (/^(Mr\.|Mrs\.|Ms\.|Miss|Dr\.)\s/i.test(cleaned)) return false

  // Skip obvious sentence fragments
  if (/\b(is|are|was|were|the|a|an|to|of|for|and|or|must|shall|will|may|can|be)\s*$/i.test(cleaned)) return false

  // Skip lowercase roman numeral list items with long text
  if (/^[ivxlcdm]+\.\s+\w{4,}/i.test(cleaned) && cleaned.length > 25) return false

  // Skip address components and other noise
  if (wordCount <= 2) {
    // Postcodes
    if (/^[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}$/i.test(cleaned)) return false
    // Common address/location words
    if (/^(Building|Street|Road|Avenue|Lane|Drive|Court|Place|Square|Way|Close|City|Town)$/i.test(cleaned)) return false
    // Company suffixes
    if (/^(Limited|Ltd|LLC|Inc|Corp|plc)$/i.test(cleaned)) return false
    // Single place names without context (too ambiguous)
    if (wordCount === 1 && /^[A-Z][a-z]+$/.test(cleaned) && !/^(Cost|Fees|Term|Scope|Brief|Reviews)$/i.test(cleaned)) {
      // Only allow whitelisted single words
      return false
    }
  }

  // Skip 2-word address patterns (e.g., "Dantzic Building", "Date Date")
  if (wordCount === 2) {
    const [word1, word2] = words
    // Both words capitalized but look like address (Second word is Building/Street/etc or repeated word)
    if (word1 === word2) return false  // "Date Date"
    if (/^(Building|Street|Road|Avenue)$/i.test(word2)) return false
  }

  // === POSITIVE DETECTION RULES ===

  // All uppercase (like "CAMPAIGN DETAILS")
  const isUpper =
    cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned.replace(/[^A-Z]/g, ""))
  if (isUpper) return true

  // Ends with colon (like "Payment terms:")
  const endsWithColon = /:\s*$/.test(trimmed)
  if (endsWithColon) return true

  // Roman numerals standalone (like "I.", "II.")
  const romanNumeral = /^[IVXLCDM]+\.\s*$/i.test(cleaned) && cleaned.length <= 10
  if (romanNumeral) return true

  // Whitelisted clause keywords
  const clauseKeywords = /\b(terms|details|requirements|deliverables|confidentially|confidentiality|agreement|approval|feedback|invoicing|payment|scope|brief|cost|fees|usage|schedule|exhibit|annex|appendix|definitions|recitals|whereas)\b/i
  if (clauseKeywords.test(cleaned) && wordCount <= 4) return true

  // Count capitalized words
  const capitalizedWords = words.filter((word) =>
    /^[A-Z][a-zA-Z&\/0-9\-\(\)\.]*$/.test(word)
  ).length

  // 2-3 word phrases with at least 50% capitalization
  if (wordCount >= 2 && wordCount <= 3 && capitalizedWords >= Math.ceil(wordCount * 0.5)) {
    return true
  }

  return false
}

function detectSections(text: string): SectionInfo[] {
  const sections: SectionInfo[] = []
  const lines = text.split(/\n/).map((line) => line.trim())

  let current: SectionInfo | null = null

  for (const line of lines) {
    if (!line) continue  // Skip empty lines

    if (isHeadingLine(line)) {
      // Found a new heading - create a new section
      const heading = cleanHeading(line)
      current = {
        title: heading,
        content: "",
      }
      sections.push(current)
    } else if (current) {
      // Add content to the current section
      current.content = current.content
        ? `${current.content}\n${line}`
        : line
    }
  }

  return sections
}

function buildSectionOutline(sections: SectionInfo[]) {
  if (!sections.length) {
    return "No explicit section headings detected in this chunk."
  }

  return sections.map((section, index) => `${index + 1}. ${section.title}`).join("\n")
}

function inferClauseTypeFromTitle(title: string) {
  const normalized = normalizeSectionTitle(title)
  if (!normalized) return "general_terms"
  if (normalized.includes("payment") || normalized.includes("cost")) return "payment_terms"
  if (normalized.includes("invoice") || normalized.includes("invoicing"))
    return "payment_terms"
  if (normalized.includes("confidential")) return "confidentiality"
  if (normalized.includes("term_and_usage") || normalized.includes("usage"))
    return "terms_and_usage"
  if (normalized.includes("deliverable") || normalized.includes("deliveries"))
    return "deliverables"
  if (normalized.includes("brief") || normalized.includes("content"))
    return "content_requirements"
  if (normalized.includes("approval") || normalized.includes("feedback"))
    return "approval_process"
  if (normalized.includes("general_requirement")) return "general_requirements"
  if (normalized.includes("exclusivity") || normalized.includes("non_competition"))
    return "exclusivity"
  if (normalized.includes("term") && !normalized.includes("terms_and_usage"))
    return "term"
  return normalized || "general_terms"
}

// Split long/compound text into micro-clauses (single obligations) for better matching.
// UPDATED: Now uses sentence-based splitting to avoid mid-sentence fragments.
function splitIntoMicroClauses(
  content: string,
  sectionTitle: string | null,
  clauseType: string,
  chunkIndex: number
): ExtractedClause[] {
  const sanitized = content.trim()
  if (!sanitized) return []

  const MICRO_MIN = 40
  const MICRO_MAX = MAX_CLAUSE_LENGTH
  const MICRO_MAX_GRACE = MICRO_MAX + 100 // Allow 100 char grace for complete sentences

  // Priority 1: Split on bullet points (keep existing logic)
  const bulletParts = sanitized
    .split(/(?:\r?\n|\r)[\u2022\u2023\u25E6\u2024\u2043\-•▪]\s*/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  if (bulletParts.length > 1) {
    // Recursively process each bullet point
    return bulletParts.flatMap((part) =>
      splitIntoMicroClauses(part, sectionTitle, clauseType, chunkIndex)
    )
  }

  // Priority 2: Split on numbered list items (1., 2., (a), (b), etc.)
  const numberedPattern = /(?:^|\n)\s*(?:\d+[.):]|\([a-z]\)|\([0-9]+\))\s+/gi
  if (numberedPattern.test(sanitized)) {
    const numberedParts = sanitized
      .split(/(?:^|\n)\s*(?:\d+[.):]|\([a-z]\)|\([0-9]+\))\s+/gi)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
    if (numberedParts.length > 1) {
      return numberedParts.flatMap((part) =>
        splitIntoMicroClauses(part, sectionTitle, clauseType, chunkIndex)
      )
    }
  }

  // Priority 3: Sentence-based splitting (NEW - replaces word boundary splitting)
  // Split on sentence boundaries first, then combine sentences up to MICRO_MAX
  // Note: Semicolons are valid clause separators in legal text (e.g., "Influencer shall; (a) deliver...")

  // Protect legal abbreviations before splitting to avoid false sentence breaks
  const protectedText = protectLegalAbbreviations(sanitized)
  const sentences = protectedText
    .split(/(?<=[.!?;])\s+/)
    .map((s) => restoreLegalAbbreviations(s.trim()))
    .filter((s) => s.length > 0)

  const segments: string[] = []
  let current = ""

  for (const sentence of sentences) {
    const combined = current ? current + " " + sentence : sentence

    if (combined.length <= MICRO_MAX) {
      // Sentence fits, add to current buffer
      current = combined
    } else if (current.length === 0) {
      // Single sentence too long - try to keep it complete if within grace period
      if (sentence.length <= MICRO_MAX_GRACE) {
        segments.push(sentence)
      } else {
        // Last resort: split at word boundary for very long single sentences
        let remaining = sentence
        while (remaining.length > MICRO_MAX) {
          const splitAt = remaining.lastIndexOf(" ", MICRO_MAX)
          if (splitAt > MICRO_MAX * 0.5) {
            segments.push(remaining.slice(0, splitAt).trim())
            remaining = remaining.slice(splitAt).trim()
          } else {
            // No good split point, keep as-is to avoid mid-word breaks
            break
          }
        }
        if (remaining.length > 0) {
          segments.push(remaining)
        }
      }
    } else {
      // Current buffer is full, push it and start new with this sentence
      segments.push(current.trim())
      current = sentence
    }
  }

  // Push remaining buffer
  if (current.trim()) {
    segments.push(current.trim())
  }

  return segments
    .map((piece) => piece.trim())
    .filter((piece) => piece.length >= MICRO_MIN)
    .map((piece) => ({
      content: piece,
      clause_type: clauseType,
      summary: piece.slice(0, 220),
      confidence: 0.6,
      rag_status: "amber" as const,
      parsing_quality: 0.6,
      section_title: sectionTitle,
      chunk_index: chunkIndex,
      start_page: null,
      end_page: null,
    }))
}

function ensureSectionCoverage(
  sections: SectionInfo[],
  clauses: ExtractedClause[],
  chunkIndex: number
) {
  if (!sections.length) return clauses

  const coverage = new Set(
    clauses
      .filter((clause) => clause.section_title)
      .map((clause) => normalizeSectionTitle(clause.section_title))
  )
  let added = 0

  for (const section of sections) {
    const normalizedTitle = normalizeSectionTitle(section.title)
    if (!normalizedTitle || coverage.has(normalizedTitle)) {
      continue
    }

    const snippet = section.content?.trim() || section.title
    const microClauses =
      splitIntoMicroClauses(
        snippet,
        section.title,
        inferClauseTypeFromTitle(section.title),
        chunkIndex
      ) || []

    if (microClauses.length > 0) {
      clauses.push(...microClauses)
      added += microClauses.length
    }

    coverage.add(normalizedTitle)
  }

  if (added > 0) {
    console.log(
      `🧩 Added ${added} micro-clause(s) to cover missing headings in chunk ${chunkIndex + 1}`
    )
  }

  return clauses
}

/**
 * Split the contract text into overlapping character chunks so GPT does not
 * attempt to summarize a 50k+ character payload in one go.
 */
function chunkContractText(text: string): ChunkPayload[] {
  const sanitized = text.replace(/\u0000/g, "").trim()
  if (sanitized.length === 0) {
    return []
  }

  if (sanitized.length <= OPENAI_CHUNK_SIZE) {
    return [
      {
        text: sanitized,
        sections: detectSections(sanitized),
      },
    ]
  }

  const chunks: ChunkPayload[] = []
  let start = 0

  while (start < sanitized.length) {
    const end = Math.min(start + OPENAI_CHUNK_SIZE, sanitized.length)
    const chunkText = sanitized.slice(start, end)
    chunks.push({
      text: chunkText,
      sections: detectSections(chunkText),
    })
    if (end === sanitized.length) break
    start = end - OPENAI_CHUNK_OVERLAP
  }

  return chunks
}

/**
 * Lightweight fallback in case GPT still refuses to return clauses for a chunk.
 * Splits the chunk into paragraphs so downstream steps never receive <1 clause.
 */
function heuristicClausesFromChunk(chunk: string, chunkIndex: number) {
  const sentences = chunk
    .split(/(?<=[\.!\?])\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40)

  if (sentences.length === 0) {
    return []
  }

  return sentences.slice(0, 12).map((sentence) => ({
    content: sentence.slice(0, MAX_CLAUSE_LENGTH),
    clause_type: "general_terms",
    summary: sentence.slice(0, 180),
    confidence: 0.45,
    rag_status: "amber" as const,
    parsing_quality: 0.45,
    chunk_index: chunkIndex,
  }))
}

function normalizeContentFingerprint(content: string) {
  return content.replace(/\s+/g, " ").trim()
}

function dedupeClauses(clauses: ExtractedClause[]) {
  const seen = new Set<string>()

  return clauses.filter((clause) => {
    const fingerprint = normalizeContentFingerprint(clause.content.toLowerCase())

    if (!fingerprint) return false
    if (seen.has(fingerprint)) return false
    seen.add(fingerprint)
    return true
  })
}

function enforceClauseGranularity(
  clauses: ExtractedClause[],
  chunkIndex: number
): ExtractedClause[] {
  const result: ExtractedClause[] = []
  let splits = 0
  let tooLong = 0
  let bulletSplits = 0

  const countBullets = (text: string) => {
    const matches = text.match(/[\u2022\u2023\u25E6\u2024\u2043•▪\-]\s/g)
    return matches ? matches.length : 0
  }

  for (const clause of clauses) {
    const bulletCount = countBullets(clause.content)
    const needsSplit =
      clause.content.length > MAX_CLAUSE_LENGTH ||
      clause.content.split(/(?<=[\.!\?])\s+/).length > 3 ||
      bulletCount > 1

    if (needsSplit) {
      if (clause.content.length > MAX_CLAUSE_LENGTH) tooLong++
      if (bulletCount > 1) bulletSplits++

      const micros = splitIntoMicroClauses(
        clause.content,
        clause.section_title || null,
        clause.clause_type,
        clause.chunk_index ?? chunkIndex
      )

      if (micros.length > 0) {
        splits += micros.length
        const merged = micros.map((m) => ({
          ...m,
          rag_status: clause.rag_status,
          confidence: Math.min(clause.confidence, m.confidence),
          parsing_quality: Math.min(clause.parsing_quality || clause.confidence, m.parsing_quality || m.confidence),
          start_page: clause.start_page ?? null,
          end_page: clause.end_page ?? null,
        }))
        result.push(...merged)
        continue
      }
    }

    result.push(clause)
  }

  if (splits > 0 || tooLong > 0 || bulletSplits > 0) {
    console.log(
      `📏 Granularity enforcement: added ${splits} micro-clauses (tooLong=${tooLong}, bulletSplits=${bulletSplits}) for chunk ${chunkIndex + 1}`
    )
  }

  return result
}

// ============ SMART FORCE-SPLIT (List-Aware) ============

function forceGranularitySmart(clauses: ExtractedClause[]): ExtractedClause[] {
  const result: ExtractedClause[] = []

  for (const clause of clauses) {
    if (clause.content.length <= MAX_CLAUSE_LENGTH) {
      result.push(clause)
      continue
    }

    console.warn(`Force-splitting mega-clause: ${clause.content.length} chars in "${clause.section_title}"`)

    const splitClauses = smartSplitClause(clause)
    result.push(...splitClauses)
  }

  return result
}

function smartSplitClause(clause: ExtractedClause): ExtractedClause[] {
  const content = clause.content

  // PRIORITY 1: Split numbered lists (1., 2., 3. or (1), (2), (3))
  const numberedPattern = /(?:^|\n)\s*(?:\d+[\.\)]\s+|\(\d+\)\s+)/
  if (numberedPattern.test(content)) {
    const items = content.split(/(?=(?:^|\n)\s*(?:\d+[\.\)]\s+|\(\d+\)\s+))/)
      .map(s => s.trim())
      .filter(s => s.length >= 30)

    if (items.length > 1) {
      return items.flatMap((item, idx) => createSplitClause(clause, item, idx))
    }
  }

  // PRIORITY 2: Split bulleted lists
  const bulletPattern = /(?:^|\n)\s*[•\-\*▪]\s+/
  if (bulletPattern.test(content)) {
    const items = content.split(/(?=(?:^|\n)\s*[•\-\*▪]\s+)/)
      .map(s => s.trim())
      .filter(s => s.length >= 30)

    if (items.length > 1) {
      return items.flatMap((item, idx) => createSplitClause(clause, item, idx))
    }
  }

  // PRIORITY 3: Split on semicolons (common obligation separator)
  if (content.includes(';')) {
    const items = content.split(/;\s*/)
      .map(s => s.trim())
      .filter(s => s.length >= 30)

    if (items.length > 1) {
      return items.flatMap((item, idx) => createSplitClause(clause, item, idx))
    }
  }

  // PRIORITY 4: Split on sentence boundaries (with abbreviation protection)
  const protectedText = content
    .replace(/\b(Mr|Mrs|Ms|Dr|Inc|Ltd|LLC|Corp|etc|e\.g|i\.e|vs|No)\./gi, '$1###DOT###')

  const sentences = protectedText
    .split(/(?<=[\.!\?])\s+(?=[A-Z])/)
    .map(s => s.replace(/###DOT###/g, '.').trim())
    .filter(s => s.length >= 30)

  if (sentences.length > 1) {
    return sentences.flatMap((item, idx) => createSplitClause(clause, item, idx))
  }

  // PRIORITY 5: Hard chunk at word boundaries if still too long
  if (content.length > MAX_CLAUSE_LENGTH) {
    const chunks = chunkAtWordBoundaries(content, MAX_CLAUSE_LENGTH)
    return chunks.flatMap((item, idx) => createSplitClause(clause, item, idx))
  }

  // Can't split further, keep as-is but flag
  return [{
    ...clause,
    rag_status: "amber",
    confidence: Math.min(clause.confidence, 0.5)
  }]
}

function createSplitClause(
  parent: ExtractedClause,
  content: string,
  index: number
): ExtractedClause[] {
  // Final length check - recurse if still too long
  if (content.length > MAX_CLAUSE_LENGTH) {
    const subChunks = chunkAtWordBoundaries(content, MAX_CLAUSE_LENGTH)
    return subChunks.map((chunk, idx) => ({
      ...parent,
      content: chunk,
      summary: chunk.slice(0, 200),
      confidence: Math.min(parent.confidence, 0.6),
      parsing_quality: 0.6,
      chunk_index: index * 100 + idx // Nested index
    }))
  }

  return [{
    ...parent,
    content: content,
    summary: content.slice(0, 200),
    confidence: Math.min(parent.confidence, 0.6),
    parsing_quality: 0.6,
    chunk_index: index
  }]
}

// UPDATED: Prefer sentence boundaries over word boundaries to avoid mid-sentence fragments
function chunkAtWordBoundaries(text: string, maxLength: number): string[] {
  const maxLengthGrace = maxLength + 100 // Allow grace period for complete sentences

  // First try: split on sentence boundaries and combine up to maxLength
  // Note: Semicolons are valid clause separators in legal text

  // Protect legal abbreviations before splitting to avoid false sentence breaks
  const protectedText = protectLegalAbbreviations(text)
  const sentences = protectedText
    .split(/(?<=[.!?;])\s+/)
    .map((s) => restoreLegalAbbreviations(s.trim()))
    .filter((s) => s.length > 0)

  if (sentences.length > 1) {
    const chunks: string[] = []
    let current = ""

    for (const sentence of sentences) {
      const combined = current ? current + " " + sentence : sentence

      if (combined.length <= maxLength) {
        current = combined
      } else if (current.length === 0) {
        // Single sentence too long - keep if within grace, else word-split
        if (sentence.length <= maxLengthGrace) {
          chunks.push(sentence)
        } else {
          // Fall through to word-based splitting for this sentence
          chunks.push(...wordBasedChunk(sentence, maxLength))
        }
      } else {
        chunks.push(current.trim())
        current = sentence
      }
    }

    if (current.trim()) {
      chunks.push(current.trim())
    }

    return chunks.filter((c) => c.length > 0)
  }

  // Fallback: word-based chunking for text without sentence boundaries
  return wordBasedChunk(text, maxLength)
}

// Helper for pure word-based chunking (last resort)
function wordBasedChunk(text: string, maxLength: number): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  let current: string[] = []
  let currentLen = 0

  for (const word of words) {
    if (currentLen + word.length + 1 > maxLength && current.length > 0) {
      chunks.push(current.join(" "))
      current = []
      currentLen = 0
    }
    current.push(word)
    currentLen += word.length + 1
  }

  if (current.length > 0) {
    chunks.push(current.join(" "))
  }

  return chunks
}

// ============ QUALITY GATE ============

interface ExtractionMetrics {
  clauseCount: number
  avgLength: number
  megaClauseCount: number
  megaClauseRate: number
  underMinCount: number
}

function computeExtractionMetrics(clauses: ExtractedClause[]): ExtractionMetrics {
  const total = clauses.length
  const avgLength = total > 0
    ? Math.round(clauses.reduce((s, c) => s + c.content.length, 0) / total)
    : 0
  const megaClauseCount = clauses.filter(c => c.content.length > MAX_CLAUSE_LENGTH).length
  const underMinCount = clauses.filter(c => c.content.length < 30).length

  return {
    clauseCount: total,
    avgLength,
    megaClauseCount,
    megaClauseRate: total > 0 ? megaClauseCount / total : 0,
    underMinCount
  }
}

interface QualityGateResult {
  passed: boolean
  warnings: string[]
  action: "persist" | "flag_for_review" | "reject"
}

async function validateAndGateQuality(
  clauses: ExtractedClause[],
  documentId: string,
  tenantId: string,
  supabase: any
): Promise<QualityGateResult> {
  const metrics = computeExtractionMetrics(clauses)
  const warnings: string[] = []

  // Quality thresholds (aligned with MAX_CLAUSE_LENGTH = 400 target)
  const MIN_CLAUSE_COUNT = 50        // Expect 80-150, warn below 50
  // MAX_AVG_LENGTH = 450 provides 50-char headroom above MAX_CLAUSE_LENGTH = 400
  // This accounts for variance - some clauses at 350, some at 450 = avg ~400
  const MAX_AVG_LENGTH = 450
  const MAX_MEGA_RATE = 0.10         // 10% mega-clauses max

  if (metrics.clauseCount < MIN_CLAUSE_COUNT) {
    warnings.push(`Low clause count: ${metrics.clauseCount} (expected ${MIN_CLAUSE_COUNT}+)`)
  }

  if (metrics.avgLength > MAX_AVG_LENGTH) {
    warnings.push(`High avg length: ${metrics.avgLength} chars (max ${MAX_AVG_LENGTH})`)
  }

  if (metrics.megaClauseRate > MAX_MEGA_RATE) {
    warnings.push(`High mega-clause rate: ${(metrics.megaClauseRate * 100).toFixed(1)}% (max ${MAX_MEGA_RATE * 100}%)`)
  }

  // Determine action based on severity
  let action: QualityGateResult["action"] = "persist"

  if (warnings.length >= 2 || metrics.clauseCount < 10) {
    action = "flag_for_review"

    // Insert into admin review queue for manual inspection
    const { error: reviewInsertError } = await supabase.from("admin_review_queue").insert({
      document_id: documentId,
      tenant_id: tenantId,
      review_type: "extraction_quality",
      status: "pending",
      priority: warnings.length >= 3 ? "high" : "medium",
      issue_description: `Extraction quality concerns: ${warnings.join("; ")}`,
      metadata: {
        metrics,
        warnings,
        extraction_model: EXTRACTION_MODEL
      }
    })
    if (reviewInsertError) {
      console.error("Failed to insert review queue item:", reviewInsertError)
    }

    // Set distinct processing_status so document isn't stuck as "processing"
    const { error: statusUpdateError } = await supabase.from("document_repository").update({
      processing_status: "needs_review"
    }).eq("id", documentId)
    if (statusUpdateError) {
      console.error("Failed to update document status to needs_review:", statusUpdateError)
    }

    console.warn(`Quality gate FLAGGED document ${documentId}: ${warnings.join("; ")}`)
  }

  // REJECT: Zero clauses = bail before DB insert
  if (metrics.clauseCount === 0) {
    action = "reject"
    console.error(`Quality gate REJECTED document ${documentId}: No clauses extracted`)

    // Flag for manual intervention
    const { error: failedInsertError } = await supabase.from("admin_review_queue").insert({
      document_id: documentId,
      tenant_id: tenantId,
      review_type: "extraction_failed",
      status: "pending",
      priority: "critical",
      issue_description: "Zero clauses extracted - requires manual re-extraction",
      metadata: { metrics, extraction_model: EXTRACTION_MODEL }
    })
    if (failedInsertError) {
      console.error("Failed to insert review queue item:", failedInsertError)
    }
  }

  return {
    passed: warnings.length === 0,
    warnings,
    action
  }
}

// ============ TELEMETRY ============

interface ExtractionTelemetry {
  // Identification
  document_id: string
  tenant_id: string
  extraction_id: string // Unique per run

  // Model info
  model: string
  extraction_mode: "single_pass" | "chunked"
  model_config_valid: boolean

  // Input metrics
  input_chars: number
  tokens_in_estimate: number
  context_overflow: boolean

  // Output metrics
  clause_count: number
  avg_clause_length: number
  mega_clause_count: number
  mega_clause_rate: number
  under_min_count: number

  // Quality
  quality_passed: boolean
  quality_action: string
  quality_warnings: string[]
  force_split_count: number

  // Performance
  extraction_time_ms: number
  tokens_out_estimate: number

  // Timestamps
  started_at: string
  completed_at: string
}

function emitExtractionTelemetry(telemetry: ExtractionTelemetry): void {
  // Structured log for aggregation (works with Supabase Edge Function logs)
  console.log(JSON.stringify({
    event: "extraction_complete",
    level: telemetry.quality_passed ? "info" : "warn",
    ...telemetry
  }))
}

// ============ A/B SAMPLING ============

// A/B configuration - simple sampling by document ID hash
const AB_SAMPLE_RATE = parseFloat(Deno.env.get("AB_SAMPLE_RATE") || "0") // 0-1, e.g., 0.1 = 10%

function shouldRunABComparison(documentId: string): boolean {
  if (AB_SAMPLE_RATE <= 0) return false

  // Deterministic sampling based on document ID hash
  // Same document always gets same decision (reproducible)
  const hash = simpleHash(documentId)
  return (hash % 100) < (AB_SAMPLE_RATE * 100)
}

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

// Alert thresholds (configurable via env, aligned with quality gate)
const ALERT_MEGA_RATE_THRESHOLD = parseFloat(Deno.env.get("ALERT_MEGA_RATE") || "0.15")
const ALERT_MIN_CLAUSE_COUNT = parseInt(Deno.env.get("ALERT_MIN_CLAUSES") || "50")
const ALERT_MAX_AVG_LENGTH = parseInt(Deno.env.get("ALERT_MAX_AVG_LEN") || "450")

interface AlertCondition {
  triggered: boolean
  severity: "warning" | "error"
  message: string
}

function checkAlertConditions(metrics: ExtractionMetrics): AlertCondition[] {
  const alerts: AlertCondition[] = []

  if (metrics.megaClauseRate > ALERT_MEGA_RATE_THRESHOLD) {
    alerts.push({
      triggered: true,
      severity: "warning",
      message: `High mega-clause rate: ${(metrics.megaClauseRate * 100).toFixed(1)}% > ${ALERT_MEGA_RATE_THRESHOLD * 100}% threshold`
    })
  }

  if (metrics.clauseCount < ALERT_MIN_CLAUSE_COUNT) {
    alerts.push({
      triggered: true,
      severity: metrics.clauseCount < 10 ? "error" : "warning",
      message: `Low clause count: ${metrics.clauseCount} < ${ALERT_MIN_CLAUSE_COUNT} threshold`
    })
  }

  if (metrics.avgLength > ALERT_MAX_AVG_LENGTH) {
    alerts.push({
      triggered: true,
      severity: "warning",
      message: `High avg clause length: ${metrics.avgLength} > ${ALERT_MAX_AVG_LENGTH} threshold`
    })
  }

  return alerts
}

// Log alerts for monitoring system to pick up
function emitAlerts(alerts: AlertCondition[], documentId: string): void {
  for (const alert of alerts) {
    if (alert.triggered) {
      console.log(JSON.stringify({
        event: "extraction_alert",
        level: alert.severity,
        document_id: documentId,
        alert_message: alert.message
      }))
    }
  }
}

function normalizeForMatch(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

function ensureContentFromChunk(
  clauses: ExtractedClause[],
  chunkText: string,
  chunkIndex: number
): ExtractedClause[] {
  const normalizedChunk = normalizeForMatch(chunkText)
  const filtered: ExtractedClause[] = []
  let removed = 0

  for (const clause of clauses) {
    const normalizedContent = normalizeForMatch(clause.content)
    if (!normalizedContent) {
      removed++
      continue
    }
    if (!normalizedChunk.includes(normalizedContent)) {
      removed++
      continue
    }
    filtered.push(clause)
  }

  if (removed > 0) {
    console.warn(
      `🧹 Dropped ${removed} clause(s) not found verbatim in chunk ${chunkIndex + 1}`
    )
  }

  return filtered
}

async function callOpenAIForChunk({
  apiKey,
  chunkText,
  chunkIndex,
  totalChunks,
  sections,
  model = "gpt-4o",
}: {
  apiKey: string
  chunkText: string
  chunkIndex: number
  totalChunks: number
  sections: SectionInfo[]
  model?: AllowedModel
}) {
  let attempt = 0
  let lastError: any = null

  while (attempt < OPENAI_MAX_ATTEMPTS) {
    attempt += 1

    try {
      const openaiResponse = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            temperature: attempt === 1 ? 0.2 : 0.1,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `You are the "ContractBuddy Clause Extractor", an AI paralegal specialised in commercial and influencer marketing agreements.

Your job:
- Read contract text.
- Identify sections and clauses.
- Output a clean, strictly valid JSON object describing clauses.

Global rules:
- You are conservative and literal: you only use information that is explicitly present in the text you are given.
- You never hallucinate new obligations, parties, dates, or numbers.
- You never invent section headings that are not provided.
- You never guess missing content: if content is not present in this chunk, treat it as absent and lower your confidence.
- You NEVER include explanations, commentary, markdown, or any text outside of the JSON object.
- All keys MUST be in double quotes, no trailing commas, and the JSON MUST be syntactically valid.

Semantics (granular clauses required):
- A "clause" is a **single obligation/definition/right**, ideally 50–${MAX_CLAUSE_LENGTH} characters, max 2 sentences. Do NOT merge multiple obligations into one clause.
- CRITICAL: Every clause MUST be a COMPLETE sentence ending with . or ; or ! or ?
- NEVER cut a clause mid-sentence. A fragment like "The influencer shall deliver" is WRONG.
- Split bullets/numbered lists into separate clauses (one per bullet/sub-item). If a paragraph has multiple obligations, split them.
- If a clause looks truncated at the start or end (chunk boundary), still return it but:
  - set a lower confidence (≤ 0.4)
  - mention "likely truncated at chunk boundary" in the summary.
- rag_status is a quick quality/risk indicator:
  - "green": clear, complete clause that reads as standard / low risk for this section.
  - "amber": ambiguous, incomplete, or partially present; content may be missing from this chunk.
  - "red": clearly risky, contradictory, or appears to omit something critical for this section.

If instructions in later messages conflict with these global rules, follow THESE global rules.`,
              },
              {
                role: "user",
                content: `You are processing chunk ${chunkIndex + 1} of ${totalChunks} for a contract document.
You MUST only use text from this chunk.

Section headings expected for this chunk (from document formatting):
${buildSectionOutline(sections)}

---

Your task:
Convert the chunk text below into a JSON object with a "clauses" array, following ALL rules here.

### 1. Output format (hard requirement)

Return ONLY a single JSON object:

{
  "clauses": [
    {
      "section_title": string,
      "content": string,
      "clause_type": string,
      "summary": string,
      "confidence": number,
      "rag_status": "green" | "amber" | "red",
      "start_page": number | null,
      "end_page": number | null
    }
  ]
}

No other fields. No extra top-level keys. No comments. No markdown.

### 2. Section / clause rules

1. For EVERY section heading listed above, create as many clauses as there are distinct obligations/sub-clauses in this chunk.
   - If there are ${sections.length} headings above, you MUST have at least ${sections.length} clauses total, but usually more.
   - NEVER merge multiple obligations into one clause; split paragraphs with multiple requirements into separate clauses (one per obligation).
   - Split bullets/numbered lists into separate clauses with the SAME section_title.

2. section_title:
   - MUST be an exact string match to one of the listed headings.
   - NEVER invent new section titles.
   - NEVER combine multiple headings into a single clause.

3. Mapping content to headings:
   - Attach each obligation/sentence/bullet to the nearest relevant heading that appears in this chunk.
   - If a heading from the list has no visible content in this chunk, still create a clause object with:
     {
       "section_title": heading,
       "content": "",
       "summary": "Section heading detected but content not present in this chunk.",
       "confidence": 0.0,
       "rag_status": "amber",
       "start_page": null,
       "end_page": null
     }

4. Chunk boundaries:
   - If a clause seems cut off at the start or end of the chunk, still output it.
   - Set confidence ≤ 0.4 and mention "likely truncated at chunk boundary" in the summary.

### 3. Field semantics

- content: Verbatim or lightly cleaned text from this chunk only (core clause body). Aim for 50–${MAX_CLAUSE_LENGTH} characters; NEVER return a mega-clause. MUST be a complete sentence ending with . or ; or ! or ?
- clause_type (snake_case): e.g. "parties", "scope_of_work", "fees_and_payment", "term_and_termination", "usage_rights", "confidentiality", "miscellaneous".
- summary: 1–3 sentences, neutral and factual.
- confidence: 0.8–1.0 (clear), 0.5–0.79 (some ambiguity), 0.0–0.49 (incomplete/ambiguous/truncated).
- rag_status: "green", "amber", or "red" based only on this chunk.
- start_page / end_page: Use numbers if obvious, else null.

### 4. Validation checklist

Before returning the JSON, ensure:
- Top level is { "clauses": [ ... ] }.
- clauses.length ≥ ${sections.length}, and clauses are split so no clause is a multi-obligation blob.
- EVERY heading from the list appears in at least one section_title.
- All required fields exist for every clause.
- rag_status ∈ { "green", "amber", "red" }.
- JSON is syntactically valid (no trailing commas/comments).

---

Chunk text (only source of truth):

${chunkText}`,
              },
            ],
          }),
        }
      )

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text()
        throw new Error(
          `OpenAI API error (${openaiResponse.status}): ${errorText}`
        )
      }

      const openaiData = await openaiResponse.json()
      const content = openaiData.choices[0]?.message?.content

      if (!content) {
        throw new Error("No content returned from OpenAI")
      }

      const parsed = JSON.parse(content)
      const clausesArray = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.clauses)
          ? parsed.clauses
          : parsed?.content && parsed?.clause_type
            ? [parsed]
            : []

      let normalizedClauses: ExtractedClause[] = clausesArray.map((clause: any) => ({
        content: String(clause.content || clause.text || ""),
        clause_type: String(
          clause.clause_type || clause.type || "unknown"
        ).replace(/\s+/g, "_"),
        summary: String(clause.summary || ""),
        confidence: Number(clause.confidence || 0.7),
        rag_status: String(clause.rag_status || "amber").toLowerCase() as
          | "green"
          | "amber"
          | "red",
        start_page: clause.start_page || null,
        end_page: clause.end_page || null,
        parsing_quality: Number(clause.parsing_quality || clause.confidence || 0.7),
        section_title: clause.section_title || clause.heading || null,
        chunk_index: chunkIndex,
      }))

      normalizedClauses = enforceClauseGranularity(normalizedClauses, chunkIndex)
      normalizedClauses = ensureContentFromChunk(normalizedClauses, chunkText, chunkIndex)

      if (
        normalizedClauses.length < OPENAI_MIN_CLAUSES_PER_CHUNK &&
        chunkText.length > OPENAI_MIN_CHARS_FOR_CHUNK
      ) {
        console.warn(
          `Chunk ${chunkIndex + 1}/${totalChunks} produced ${
            normalizedClauses.length
          } clause(s) on attempt ${attempt}, retrying`
        )
        lastError = new Error("Insufficient clauses returned")
        continue
      }

      const avgLength =
        normalizedClauses.reduce((sum, c) => sum + c.content.length, 0) /
        (normalizedClauses.length || 1)
      const overLimit = normalizedClauses.filter((c) => c.content.length > MAX_CLAUSE_LENGTH).length
      console.log(
        `📊 Chunk ${chunkIndex + 1}/${totalChunks}: clauses=${normalizedClauses.length}, avgLen=${Math.round(
          avgLength
        )}, overLimit=${overLimit}`
      )

      if (normalizedClauses.length === 0) {
        normalizedClauses = heuristicClausesFromChunk(chunkText, chunkIndex)
      }

      return normalizedClauses
    } catch (error) {
      lastError = error
      console.error(
        `OpenAI chunk extraction failed (chunk ${chunkIndex + 1}/${
          totalChunks
        }, attempt ${attempt}):`,
        error
      )
    }
  }

  return heuristicClausesFromChunk(chunkText, chunkIndex)
}

interface QueueMessage {
  msg_id: number
  read_ct: number
  enqueued_at: string
  vt: string
  message: {
    document_id: string
    tenant_id: string
    object_path: string
    processing_type: string
    enqueued_at: string
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log("extract-clauses: Function invoked")

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body to check for direct invocation from worker
    let document_id: string
    let tenant_id: string
    let object_path: string
    let messageId: bigint | null = null

    const body = await req.json().catch(() => ({}))

    if (body.document_id) {
      // Direct invocation - may be ad-hoc retry
      console.log(`Direct invocation for document ${body.document_id}`)
      document_id = body.document_id

      // If tenant_id and object_path not provided, fetch from database
      if (!body.tenant_id || !body.object_path) {
        console.log(`Fetching metadata from document_repository...`)
        const { data: docMeta, error: metaError } = await supabase
          .from('document_repository')
          .select('tenant_id, object_path, processing_status')
          .eq('id', document_id)
          .single()

        if (metaError || !docMeta) {
          console.error(`Document ${document_id} not found:`, metaError)
          return new Response(
            JSON.stringify({
              success: false,
              error: `Document ${document_id} not found in repository`,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 404,
            }
          )
        }

        // Check if document is still pending (not yet uploaded to storage)
        if (docMeta.processing_status === 'pending' && !docMeta.object_path) {
          console.error(`Document ${document_id} is still pending, no object_path`)
          return new Response(
            JSON.stringify({
              success: false,
              error: `Document ${document_id} is still pending upload, cannot retry yet`,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            }
          )
        }

        tenant_id = docMeta.tenant_id
        object_path = docMeta.object_path
        console.log(`✅ Fetched metadata: tenant=${tenant_id}, path=${object_path}`)
      } else {
        tenant_id = body.tenant_id
        object_path = body.object_path
      }
    } else {
      // No document_id - poll queue for messages
      console.log("Checkpoint A: Polling document_processing_queue...")

      const { data: messages, error: queueError } = await supabase.rpc(
        "dequeue_document_processing",
        {
          batch_size: 1, // Process one at a time
        }
      )

      if (queueError) {
        console.error("Queue polling error:", queueError)
        throw queueError
      }

      if (!messages || messages.length === 0) {
        console.log("No messages in queue")
        return new Response(
          JSON.stringify({
            success: true,
            message: "No messages to process",
            processed: 0,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        )
      }

      const message = messages[0] as QueueMessage
      console.log(`Processing message ${message.msg_id} for document ${message.message.document_id}`)

      document_id = message.message.document_id
      tenant_id = message.message.tenant_id
      object_path = message.message.object_path
      messageId = message.msg_id
    }

    // IDEMPOTENCY CHECK: Skip if document already has clauses
    const { data: existingClauses, error: checkError } = await supabase
      .from("clause_boundaries")
      .select("id")
      .eq("document_id", document_id)
      .limit(1)

    if (checkError) {
      console.error("Error checking for existing clauses:", checkError)
      // Don't throw - continue processing
    } else if (existingClauses && existingClauses.length > 0) {
      console.log(`⏩ Document ${document_id} already has clauses extracted, skipping...`)

      // Log skip event
      await supabase.from("edge_function_logs").insert({
        document_id,
        stage: "extract",
        status: "skipped",
        clause_count: 0,
        raw_payload: {
          reason: "idempotency_check_passed",
          message: "Document already processed"
        }
      })

      return new Response(
        JSON.stringify({
          success: true,
          message: "Document already processed (idempotent skip)",
          clauses_extracted: 0,
          skipped: true
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        }
      )
    }

    // Update document status to processing
    const { error: updateError } = await supabase
      .from("document_repository")
      .update({
        processing_status: "processing",
      })
      .eq("id", document_id)

    if (updateError) {
      console.error("Error updating document status:", updateError)
      // Don't throw - continue processing
    }

    // Checkpoint B: Download & text extraction
    console.log("Checkpoint B: Downloading document from storage...")
    console.log(`Storage path: ${object_path}`)

    let extractedText = ""
    let mime_type = ""

    try {
      // Download file from storage
      // Note: Files may be in 'documents' or 'contracts' bucket
      let fileData: Blob | null = null
      let downloadError: any = null

      // Try 'contracts' bucket first (newer uploads)
      const contractsDownload = await supabase.storage
        .from("contracts")
        .download(object_path)

      if (contractsDownload.error) {
        // Try 'documents' bucket (legacy/existing uploads)
        const documentsDownload = await supabase.storage
          .from("documents")
          .download(object_path)

        if (documentsDownload.error) {
          downloadError = documentsDownload.error
        } else {
          fileData = documentsDownload.data
        }
      } else {
        fileData = contractsDownload.data
      }

      if (!fileData || downloadError) {
        throw new Error(
          `Storage download failed: ${JSON.stringify(downloadError)}`
        )
      }

      // Get document metadata for mime type
      const { data: docMeta, error: metaError } = await supabase
        .from("document_repository")
        .select("mime_type, original_filename")
        .eq("id", document_id)
        .single()

      if (metaError) {
        console.warn("Could not fetch document metadata:", metaError)
        mime_type = "application/pdf" // default assumption
      } else {
        mime_type = docMeta.mime_type
      }

      console.log(`File downloaded: ${fileData.size} bytes, type: ${mime_type}`)

      // Extract text based on mime type
      if (mime_type === "application/pdf" || mime_type === "application/x-pdf") {
        // Import unpdf dynamically
        const { extractText } = await import("npm:unpdf@0.11.0")
        const arrayBuffer = await fileData.arrayBuffer()
        const result = await extractText(new Uint8Array(arrayBuffer))

        // unpdf can return different formats, normalize to string
        if (typeof result === 'string') {
          extractedText = result
        } else if (result && typeof result === 'object' && 'text' in result) {
          extractedText = String(result.text)
        } else {
          extractedText = String(result || '')
        }

        console.log(`PDF text extracted: ${extractedText.length} characters, type: ${typeof extractedText}`)
      } else if (
        mime_type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mime_type === "application/msword"
      ) {
        // Import mammoth dynamically
        const mammoth = await import("npm:mammoth@1.6.0")
        const arrayBuffer = await fileData.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        extractedText = result.value
        console.log(`DOCX text extracted: ${extractedText.length} characters`)
      } else if (mime_type === "text/plain") {
        // Plain text - just read directly
        extractedText = await fileData.text()
        console.log(`Plain text extracted: ${extractedText.length} characters`)
      } else {
        throw new Error(`Unsupported mime type: ${mime_type}`)
      }

      // Ensure extractedText is a string and has content
      extractedText = String(extractedText || '')
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text could be extracted from document")
      }
    } catch (extractError) {
      console.error("Checkpoint B failed:", extractError)

      // Update document status to failed
      await supabase
        .from("document_repository")
        .update({
          processing_status: "failed",
          error_message: `Text extraction failed: ${extractError.message}`,
        })
        .eq("id", document_id)

      throw extractError
    }

    // Checkpoint C: OpenAI clause extraction
    console.log("Checkpoint C: OpenAI clause extraction starting...")
    console.log(`Processing ${extractedText.length} characters of text`)

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiApiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for clause extraction"
      )
    }

    let extractedClauses: ExtractedClause[] = []

    // ============ UNIFIED EXTRACTION WITH PATH DECISION ============
    const extractionId = crypto.randomUUID()
    const startedAt = new Date().toISOString()

    // Decide extraction path based on input size and model
    const pathDecision = decideExtractionPath(extractedText, EXTRACTION_MODEL)
    console.log(`Extraction path: ${pathDecision.path} (${pathDecision.reason})`)

    console.log(`Checkpoint C: ${pathDecision.model} extraction starting...`)

    try {
      const startTime = Date.now()

      // Use wrapper that handles timeouts and falls back to chunked if needed
      const { clauses: rawClauses, usedFallback } = await extractWithTimeoutFallback(
        extractedText,
        openaiApiKey,
        pathDecision
      )
      const extractionTime = Date.now() - startTime

      if (usedFallback) {
        console.warn(`Extraction used timeout fallback to chunked path`)
      }

      // Deduplication
      const preDedupCount = rawClauses.length
      extractedClauses = dedupeClauses(rawClauses)

      if (extractedClauses.length !== preDedupCount) {
        console.log(
          `🧹 Dedupe removed ${preDedupCount - extractedClauses.length} overlapping clause(s)`
        )
      }

      // Capture mega-clause count BEFORE force-split
      const preSplitMetrics = computeExtractionMetrics(extractedClauses)
      const preSplitMegaCount = preSplitMetrics.megaClauseCount

      // Force-split any remaining mega-clauses (safety net)
      if (preSplitMegaCount > 0) {
        console.log(`Force-splitting ${preSplitMegaCount} mega-clauses...`)
        extractedClauses = forceGranularitySmart(extractedClauses)
        const postSplitMetrics = computeExtractionMetrics(extractedClauses)
        console.log(`Post-split: ${postSplitMetrics.clauseCount} clauses, avg ${postSplitMetrics.avgLength} chars`)
      }

      // Compute final metrics AFTER force-split
      const metrics = computeExtractionMetrics(extractedClauses)

      console.log(`Extraction results: ${metrics.clauseCount} clauses, avg ${metrics.avgLength} chars, ${metrics.megaClauseCount} over ${MAX_CLAUSE_LENGTH} chars, ${extractionTime}ms`)

      // Quality gate - route to review if metrics are bad (MUST await)
      const qualityResult = await validateAndGateQuality(extractedClauses, document_id, tenant_id, supabase)

      // Check alert conditions
      const alerts = checkAlertConditions(metrics)
      emitAlerts(alerts, document_id)

      // context_overflow = true when configured model couldn't be used (downshifted)
      const contextOverflow = pathDecision.path === "chunked" && EXTRACTION_MODEL !== "gpt-4o"

      // Cap tokens_out_estimate to avoid blowing logs (sample first 50 clauses, scale up)
      const tokensOutEstimate = extractedClauses.length === 0 ? 0 : Math.min(
        estimateTokens(JSON.stringify(extractedClauses.slice(0, 50))) *
          Math.ceil(extractedClauses.length / 50),
        100_000 // Hard cap
      )

      // Emit telemetry
      const telemetry: ExtractionTelemetry = {
        document_id,
        tenant_id,
        extraction_id: extractionId,
        model: usedFallback ? "gpt-4o" : pathDecision.model,
        extraction_mode: usedFallback ? "chunked" : pathDecision.path,
        model_config_valid: modelConfigValid,
        input_chars: extractedText.length,
        tokens_in_estimate: pathDecision.estimatedTokens,
        context_overflow: contextOverflow,
        clause_count: metrics.clauseCount,
        avg_clause_length: metrics.avgLength,
        mega_clause_count: metrics.megaClauseCount,
        mega_clause_rate: metrics.megaClauseRate,
        under_min_count: metrics.underMinCount,
        quality_passed: qualityResult.passed,
        quality_action: qualityResult.action,
        quality_warnings: qualityResult.warnings,
        force_split_count: preSplitMegaCount - metrics.megaClauseCount,
        extraction_time_ms: extractionTime,
        tokens_out_estimate: tokensOutEstimate,
        started_at: startedAt,
        completed_at: new Date().toISOString()
      }

      emitExtractionTelemetry(telemetry)

      // Handle quality gate reject action
      if (qualityResult.action === "reject") {
        // Update document status and return early - do NOT persist empty clauses
        await supabase.from("document_repository").update({
          processing_status: "failed",
          error_message: `Extraction rejected: ${qualityResult.warnings.join("; ")}`
        }).eq("id", document_id)

        throw new Error(`Extraction failed quality gate: ${qualityResult.warnings.join("; ")}`)
      }

      // Fallback for zero clauses (should be caught by quality gate, but just in case)
      if (extractedClauses.length === 0) {
        console.warn(
          `⚠️ Zero clauses extracted for document ${document_id}`
        )
        await supabase.from("edge_function_logs").insert({
          document_id,
          stage: "extract",
          status: "fallback",
          clause_count: 1,
          raw_payload: {
            text_length: extractedText.length,
            model: pathDecision.model,
            extraction_mode: pathDecision.path,
            reason: "Zero clauses extracted",
          },
        })

        extractedClauses = [
          {
            content: extractedText.substring(0, MAX_CLAUSE_LENGTH),
            clause_type: "general_terms",
            summary: "Full contract text (no clauses extracted)",
            confidence: 0.5,
            rag_status: "amber",
            parsing_quality: 0.5,
          },
        ]
      } else {
        await supabase.from("edge_function_logs").insert({
          document_id,
          stage: "extract",
          status: "success",
          clause_count: extractedClauses.length,
          raw_payload: {
            text_length: extractedText.length,
            model: usedFallback ? "gpt-4o" : pathDecision.model,
            extraction_mode: usedFallback ? "chunked_fallback" : pathDecision.path,
            extraction_time_ms: extractionTime,
            metrics,
            quality_passed: qualityResult.passed,
            quality_warnings: qualityResult.warnings,
            rag_distribution: {
              green: extractedClauses.filter((c) => c.rag_status === "green").length,
              amber: extractedClauses.filter((c) => c.rag_status === "amber").length,
              red: extractedClauses.filter((c) => c.rag_status === "red").length,
            },
          },
        })
      }

      console.log(`✅ Extracted ${extractedClauses.length} clauses using ${pathDecision.model}`)
      console.log(
        `RAG distribution: ${
          extractedClauses.filter((c) => c.rag_status === "green").length
        } green, ${
          extractedClauses.filter((c) => c.rag_status === "amber").length
        } amber, ${
          extractedClauses.filter((c) => c.rag_status === "red").length
        } red`
      )
    } catch (openaiError) {
      console.error("Checkpoint C failed:", openaiError)

      // Log error to database
      await supabase.from('edge_function_logs').insert({
        document_id,
        stage: 'extract',
        status: 'error',
        clause_count: 0,
        error_message: openaiError.message,
        raw_payload: {
          error_stack: openaiError.stack,
          error_name: openaiError.name
        }
      })

      // Update document status to failed
      await supabase
        .from("document_repository")
        .update({
          processing_status: "failed",
          error_message: `OpenAI clause extraction failed: ${openaiError.message}`,
        })
        .eq("id", document_id)

      throw openaiError
    }

    // Checkpoint D: Persistence
    console.log("Checkpoint D: Persisting clauses to database...")
    console.log(`Inserting ${extractedClauses.length} clauses into clause_boundaries`)

    try {
      // Calculate character offsets using monotonic search
      let lastEnd = 0
      let offsetHits = 0
      let offsetMisses = 0
      const clauseRecords = extractedClauses.map((clause) => {
        const offset = findClauseOffset(extractedText, clause.content, lastEnd)

        if (offset) {
          lastEnd = offset.end // Advance search position for next clause
          offsetHits++
        } else {
          // SAFETY: Advance lastEnd even on miss to prevent duplicate matching
          // Use clause content length as minimum advancement
          lastEnd = Math.min(lastEnd + clause.content.length, extractedText.length)
          offsetMisses++
        }

        return {
          document_id,
          tenant_id,
          content: clause.content,
          clause_type: clause.clause_type,
          confidence: clause.confidence,
          start_page: clause.start_page,
          end_page: clause.end_page,
          parsing_quality: clause.parsing_quality || clause.confidence,
          section_title: clause.section_title || null,
          start_char: offset?.start ?? null,
          end_char: offset?.end ?? null,
          parsing_issues: clause.confidence < 0.7
            ? [{ issue: "low_confidence", score: clause.confidence }]
            : [],
        }
      })

      // Insert clauses into clause_boundaries
      const { data: insertedClauses, error: insertError } = await supabase
        .from("clause_boundaries")
        .insert(clauseRecords)
        .select("id, clause_type, confidence")

      if (insertError) {
        throw new Error(`Failed to insert clauses: ${insertError.message}`)
      }

      console.log(`✅ Inserted ${insertedClauses?.length || 0} clauses`)

      // Log offset calculation stats (no raw text for security)
      console.log(`📍 Offset mapping: ${offsetHits} hits, ${offsetMisses} misses (${((offsetHits / (offsetHits + offsetMisses)) * 100).toFixed(1)}% coverage)`)

      // Identify low-confidence clauses for admin review queue
      const lowConfidenceClauses = extractedClauses.filter(
        (clause) => clause.confidence < 0.7
      )

      if (lowConfidenceClauses.length > 0) {
        console.log(
          `Flagging ${lowConfidenceClauses.length} low-confidence clauses for review`
        )

        // Create admin review queue entries for low-confidence clauses
        const reviewQueueEntries = lowConfidenceClauses.map((clause, index) => {
          const correspondingClause = insertedClauses?.find(
            (ic, idx) => idx === extractedClauses.indexOf(clause)
          )

          return {
            document_id,
            clause_boundary_id: correspondingClause?.id || null,
            tenant_id,
            review_type: "low_confidence_clause",
            status: "pending",
            original_text: clause.content, // Store full text (removed 500 char truncation)
            original_clause_type: clause.clause_type,
            confidence_score: clause.confidence,
            issue_description: `Low confidence score (${clause.confidence.toFixed(2)}) - requires manual review`,
            priority: clause.confidence < 0.5 ? "high" : "medium",
            metadata: {
              rag_status: clause.rag_status,
              summary: clause.summary,
              extraction_source: "openai_gpt4o",
            },
          }
        })

        const { error: reviewQueueError } = await supabase
          .from("admin_review_queue")
          .insert(reviewQueueEntries)

        if (reviewQueueError) {
          console.error("Failed to insert review queue entries:", reviewQueueError)
          // Don't throw - this is non-critical
        } else {
          console.log(
            `✅ Added ${reviewQueueEntries.length} items to admin review queue`
          )
        }
      }

      // Update document status to clauses_extracted and save extracted text
      const { error: statusUpdateError } = await supabase
        .from("document_repository")
        .update({
          processing_status: "clauses_extracted",
          extracted_text: extractedText, // Store raw extracted text for full document view
          error_message: null, // Clear any previous errors
        })
        .eq("id", document_id)

      if (statusUpdateError) {
        console.error("Failed to update document status:", statusUpdateError)
        // Don't throw - clauses are already inserted
      } else {
        console.log(`✅ Updated document status to 'clauses_extracted'`)
      }

      console.log("Checkpoint D complete!")
    } catch (persistError) {
      console.error("Checkpoint D failed:", persistError)

      // Update document status to failed
      await supabase
        .from("document_repository")
        .update({
          processing_status: "failed",
          error_message: `Clause persistence failed: ${persistError.message}`,
        })
        .eq("id", document_id)

      throw persistError
    }

    // Delete the message from queue only if we dequeued it ourselves
    if (messageId) {
      const { data: deleted, error: deleteError } = await supabase.rpc(
        "delete_queue_message",
        {
          p_queue_name: "document_processing_queue",
          p_msg_id: messageId,
        }
      )

      if (deleteError) {
        console.error("Error deleting message from queue:", deleteError)
      } else {
        console.log(`Message ${messageId} processed and removed from queue`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "All checkpoints complete - clauses extracted and persisted",
        document_id,
        msg_id: messageId,
        text_length: extractedText.length,
        mime_type,
        clauses_extracted: extractedClauses.length,
        low_confidence_count: extractedClauses.filter((c) => c.confidence < 0.7)
          .length,
        rag_distribution: {
          green: extractedClauses.filter((c) => c.rag_status === "green").length,
          amber: extractedClauses.filter((c) => c.rag_status === "amber").length,
          red: extractedClauses.filter((c) => c.rag_status === "red").length,
        },
        checkpoints: {
          a_queue_polling: "✅",
          b_text_extraction: "✅",
          c_openai_extraction: "✅",
          d_persistence: "✅",
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    )
  } catch (error) {
    console.error("extract-clauses error:", error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    )
  }
})
