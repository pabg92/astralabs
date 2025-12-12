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

const MAX_CLAUSE_LENGTH = 400 // Single source of truth - used everywhere
const MIN_CLAUSE_LENGTH = 50 // Minimum length - rejects headers like "CAMPAIGN DETAILS" (16 chars)

// ============ EXTRACTION MODE FEATURE FLAGS ============
// LINE_BASED (recommended): GPT returns line numbers, we convert to character indices
// INDEX_BASED (legacy): GPT returns character indices directly (prone to counting errors)
// CONTENT_BASED (legacy): GPT returns content text, findClauseOffset() used for offset calculation
const USE_LINE_BASED_EXTRACTION = true // LINE MODE - GPT returns line numbers, we derive indices
const USE_INDEX_BASED_EXTRACTION = !USE_LINE_BASED_EXTRACTION // Fallback to index mode if line mode disabled

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

// ============ LINE-BASED EXTRACTION UTILITIES ============

/**
 * Line mapping for converting line numbers back to character indices.
 * Each entry maps a line number (0-indexed) to its character range in the original text.
 */
interface LineMapping {
  /** The line number (0-indexed) */
  lineNumber: number
  /** Start character index (inclusive) */
  startChar: number
  /** End character index (exclusive) */
  endChar: number
  /** The actual line content */
  content: string
}

interface LineNumberedDocument {
  /** Text with line numbers prefixed: "[0] First line\n[1] Second line\n..." */
  numberedText: string
  /** Map from line number to character positions */
  lineMap: Map<number, LineMapping>
  /** Original text (unchanged) */
  originalText: string
  /** Total number of lines */
  totalLines: number
}

/**
 * Prepares a document for line-based extraction by:
 * 1. Splitting into lines
 * 2. Prefixing each line with its number in brackets: [0], [1], etc.
 * 3. Creating a map from line numbers to character positions in the original text
 *
 * This allows GPT to reference lines by number, and we convert back to exact character indices.
 */
function prepareLineNumberedDocument(text: string): LineNumberedDocument {
  const lines = text.split('\n')
  const lineMap = new Map<number, LineMapping>()

  let numberedText = ''
  let charPosition = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const startChar = charPosition
    const endChar = charPosition + line.length

    lineMap.set(i, {
      lineNumber: i,
      startChar,
      endChar,
      content: line
    })

    // Build numbered text for GPT
    numberedText += `[${i}] ${line}\n`

    // Move char position past this line and the newline character
    // (except for the last line which may not have a trailing newline)
    charPosition = endChar + (i < lines.length - 1 ? 1 : 0)
  }

  return {
    numberedText,
    lineMap,
    originalText: text,
    totalLines: lines.length
  }
}

/**
 * Raw clause from GPT in line-based mode (before conversion to character indices)
 */
interface RawLineBasedClause {
  start_line: number
  end_line: number
  clause_type: string
  summary: string
  confidence: number
  rag_status: "green" | "amber" | "red"
  section_title?: string
}

/**
 * Converts line-based clauses to index-based clauses using the line map.
 * This gives us exact character positions without GPT having to count characters.
 */
function convertLinesToIndices(
  lineClauses: RawLineBasedClause[],
  lineDoc: LineNumberedDocument
): RawIndexedClause[] {
  const results: RawIndexedClause[] = []

  for (const clause of lineClauses) {
    const startLine = Math.max(0, clause.start_line)
    const endLine = Math.min(lineDoc.totalLines - 1, clause.end_line)

    // Validate line numbers
    if (startLine > endLine || startLine < 0 || endLine >= lineDoc.totalLines) {
      console.warn(`Invalid line range [${clause.start_line}, ${clause.end_line}] for clause: ${clause.summary?.slice(0, 50)}`)
      continue
    }

    const startMapping = lineDoc.lineMap.get(startLine)
    const endMapping = lineDoc.lineMap.get(endLine)

    if (!startMapping || !endMapping) {
      console.warn(`Line mapping not found for lines ${startLine}-${endLine}`)
      continue
    }

    // start_index: beginning of start line
    // end_index: end of end line (exclusive)
    const startIndex = startMapping.startChar
    const endIndex = endMapping.endChar

    results.push({
      start_index: startIndex,
      end_index: endIndex,
      clause_type: clause.clause_type,
      summary: clause.summary,
      confidence: clause.confidence,
      rag_status: clause.rag_status,
      section_title: clause.section_title
    })
  }

  return results
}

// ============ INDEX-BASED VALIDATION ============

interface IndexValidationTelemetry {
  clauses_returned: number
  clauses_valid: number
  dropped_for_bounds: number
  dropped_for_overlap: number
  dropped_for_empty: number
  dropped_for_length: number
  final_coverage_rate: number
}

interface ValidatedIndexedClause {
  start_index: number
  end_index: number
  content: string  // Derived from slice
  clause_type: string
  summary: string
  confidence: number
  rag_status: "green" | "amber" | "red"
  section_title?: string
}

/**
 * Snap an index to the nearest word boundary.
 * For start indices: snap backwards to find start of word (after whitespace/punctuation)
 * For end indices: snap forwards to find end of word (at whitespace/punctuation)
 */
function snapToWordBoundary(
  text: string,
  index: number,
  direction: 'start' | 'end',
  maxAdjust: number = 15  // Max characters to adjust
): number {
  if (index < 0) return 0
  if (index >= text.length) return text.length

  const isWordChar = (c: string) => /[a-zA-Z0-9]/.test(c)

  if (direction === 'start') {
    // For start: if we're in the middle of a word, snap backwards to word start
    // Check if current position is mid-word (previous char is word char)
    if (index > 0 && isWordChar(text[index - 1]) && isWordChar(text[index])) {
      // We're mid-word, find the start
      let adjusted = index
      while (adjusted > 0 && adjusted > index - maxAdjust && isWordChar(text[adjusted - 1])) {
        adjusted--
      }
      return adjusted
    }
    return index
  } else {
    // For end: if we're in the middle of a word, snap forwards to word end
    // Check if current position is mid-word (current char is word char)
    if (index < text.length && isWordChar(text[index])) {
      // We're mid-word, find the end
      let adjusted = index
      while (adjusted < text.length && adjusted < index + maxAdjust && isWordChar(text[adjusted])) {
        adjusted++
      }
      return adjusted
    }
    return index
  }
}

// ============ SENTENCE BOUNDARY SNAPPING ============
// Improves clause boundaries by snapping to sentence starts/ends

const SENTENCE_END_CHARS = new Set(['.', '!', '?', ':', ';'])
const SENTENCE_START_AFTER = new Set(['.', '!', '?', ':', ';', '\n'])

// List item markers: bullet points and numbered items
const LIST_MARKER_REGEX = /\n\s*[\u2022•·*\-]\s*|\n\s*\d+[\.\)]\s*/

// Telemetry for snap distance tracking
interface SnapTelemetry {
  total_snaps: number
  snapped_to_sentence: number
  snapped_to_list: number
  snapped_to_word: number
  no_snap_exceeded_window: number
  second_pass_corrections: number
  snap_distances: number[]
}

function createSnapTelemetry(): SnapTelemetry {
  return {
    total_snaps: 0,
    snapped_to_sentence: 0,
    snapped_to_list: 0,
    snapped_to_word: 0,
    no_snap_exceeded_window: 0,
    second_pass_corrections: 0,
    snap_distances: []
  }
}

// Global telemetry instance for current extraction
let snapTelemetry: SnapTelemetry = createSnapTelemetry()

function emitSnapTelemetry(documentId: string): void {
  const distances = snapTelemetry.snap_distances
  const avgDistance = distances.length > 0
    ? distances.reduce((a, b) => a + b, 0) / distances.length
    : 0
  const maxDistance = distances.length > 0 ? Math.max(...distances) : 0

  console.log(JSON.stringify({
    event: "snap_telemetry",
    document_id: documentId,
    total_snaps: snapTelemetry.total_snaps,
    snapped_to_sentence: snapTelemetry.snapped_to_sentence,
    snapped_to_list: snapTelemetry.snapped_to_list,
    snapped_to_word: snapTelemetry.snapped_to_word,
    no_snap_exceeded_window: snapTelemetry.no_snap_exceeded_window,
    second_pass_corrections: snapTelemetry.second_pass_corrections,
    avg_snap_distance: Math.round(avgDistance * 10) / 10,
    max_snap_distance: maxDistance
  }))

  // Reset for next document
  snapTelemetry = createSnapTelemetry()
}

/**
 * Check if a line looks like a section header (should be excluded from clauses)
 * Examples: "PAYMENT TERMS", "1. Introduction", "Campaign Details:"
 */
function isLikelyHeader(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < 3 || trimmed.length > 80) return false

  // ALL CAPS (e.g., "PAYMENT TERMS", "CONFIDENTIALITY")
  if (/^[A-Z][A-Z\s\d\.\-:]+$/.test(trimmed) && trimmed.length < 50) return true

  // Numbered sections (e.g., "1. Payment", "II. Terms")
  if (/^[\dIVX]+[\.\)]\s+[A-Z]/.test(trimmed)) return true

  // Ends with colon only (e.g., "Payment terms:")
  if (/^[a-zA-Z\s\d\.\-]+:\s*$/.test(trimmed) && trimmed.length < 40) return true

  return false
}

/**
 * Find the start of a list item (bullet or numbered) looking backwards
 * Returns the position after the list marker, or -1 if not found
 */
function findListItemStart(text: string, index: number, maxLookback: number): number {
  // Look backwards for list marker pattern
  const searchStart = Math.max(0, index - maxLookback)
  const searchText = text.slice(searchStart, index)

  // Find all list markers in the search region
  const bulletMatch = searchText.match(/\n\s*[\u2022•·*\-]\s*(?=[^\s])/g)
  const numberedMatch = searchText.match(/\n\s*\d+[\.\)]\s*(?=[^\s])/g)

  let lastBulletPos = -1
  let lastNumberedPos = -1

  if (bulletMatch) {
    // Find position of last bullet marker
    let searchPos = 0
    for (const match of searchText.matchAll(/\n\s*[\u2022•·*\-]\s*/g)) {
      lastBulletPos = searchStart + match.index! + match[0].length
    }
  }

  if (numberedMatch) {
    // Find position of last numbered marker
    for (const match of searchText.matchAll(/\n\s*\d+[\.\)]\s*/g)) {
      lastNumberedPos = searchStart + match.index! + match[0].length
    }
  }

  // Return the closest list marker (highest position)
  const listStart = Math.max(lastBulletPos, lastNumberedPos)
  return listStart > 0 && index - listStart <= maxLookback ? listStart : -1
}

/**
 * Find the start of the current/previous sentence
 * Looks backwards for sentence-ending punctuation or newline
 */
function findSentenceStart(text: string, index: number, maxLookback: number = 100): number {
  let pos = index

  // First, skip any leading whitespace at current position
  while (pos > 0 && /\s/.test(text[pos - 1])) {
    pos--
  }

  // Look backwards for sentence boundary
  const startPos = pos
  while (pos > 0 && startPos - pos < maxLookback) {
    const prevChar = text[pos - 1]

    // Found sentence-ending punctuation followed by space/newline
    if (SENTENCE_START_AFTER.has(prevChar)) {
      // Make sure we're at the start of a new sentence (after punct + space)
      if (pos < text.length && /[A-Z"'\(]/.test(text[pos])) {
        return pos
      }
      // Keep looking if current char isn't a sentence start
    }

    // Stop at paragraph break (double newline)
    if (prevChar === '\n' && pos > 1 && text[pos - 2] === '\n') {
      return pos
    }

    pos--
  }

  // Didn't find sentence boundary, return original
  return index
}

/**
 * Find the end of the current sentence
 * Looks forward for sentence-ending punctuation
 */
function findSentenceEnd(text: string, index: number, maxLookahead: number = 100): number {
  let pos = index

  while (pos < text.length && pos - index < maxLookahead) {
    const char = text[pos]

    // Found sentence end
    if (SENTENCE_END_CHARS.has(char)) {
      // Include the punctuation
      return pos + 1
    }

    // Stop at paragraph break
    if (char === '\n' && pos + 1 < text.length && text[pos + 1] === '\n') {
      return pos
    }

    pos++
  }

  // Didn't find sentence end, return original
  return index
}

/**
 * Find the start of the current line
 */
function findLineStart(text: string, index: number): number {
  let pos = index
  while (pos > 0 && text[pos - 1] !== '\n') {
    pos--
  }
  return pos
}

/**
 * Find the end of the current line
 */
function findLineEnd(text: string, index: number): number {
  let pos = index
  while (pos < text.length && text[pos] !== '\n') {
    pos++
  }
  return pos
}

/**
 * Check if a position starts mid-sentence (lowercase after alphanumeric)
 */
function isMidSentenceStart(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return false
  const currentChar = text[index]
  const prevChar = text[index - 1]

  // If current char is lowercase and previous char is alphanumeric (not punct/newline), we're mid-sentence
  return /[a-z]/.test(currentChar) && /[a-zA-Z0-9]/.test(prevChar)
}

/**
 * Check if position is at a valid clause end (at sentence-ending punctuation)
 */
function isValidClauseEnd(text: string, index: number): boolean {
  if (index <= 0 || index > text.length) return false
  const prevChar = text[index - 1]
  return SENTENCE_END_CHARS.has(prevChar) || prevChar === '\n'
}

/**
 * Check if a period is likely a sentence-ending period (not abbreviation/email/url)
 */
function isSentenceEndPeriod(text: string, periodIndex: number): boolean {
  // Period not at text boundary
  if (periodIndex <= 0 || periodIndex >= text.length - 1) return true

  const charAfter = text[periodIndex + 1]
  const charBefore = text[periodIndex - 1]

  // If followed by lowercase letter without space, it's likely not sentence end
  // e.g., "adanola.com" or "e.g."
  if (/[a-z]/.test(charAfter)) return false

  // If preceded by single uppercase letter, likely abbreviation (e.g., "J. Smith")
  if (/^[A-Z]$/.test(charBefore) && (periodIndex < 2 || /\s/.test(text[periodIndex - 2]))) return false

  // If followed by @ or in email/URL context
  if (charAfter === '@' || charBefore === '@') return false

  // If followed by space then uppercase, very likely sentence end
  if (charAfter === ' ' || charAfter === '\n') return true

  return true
}

/**
 * AGGRESSIVE boundary correction - forces expansion to valid boundaries
 * Unlike snapToSentenceBoundary which has a window limit, this will expand
 * as far as needed (up to maxExpand) to find a valid boundary.
 */
function forceValidBoundaries(
  text: string,
  start: number,
  end: number,
  maxExpand: number = 300
): { start: number; end: number } {
  let newStart = start
  let newEnd = end

  // FORCE START to valid boundary
  // If char before start is alphanumeric, we're mid-word/sentence - expand backwards
  while (newStart > 0 && newStart > start - maxExpand) {
    const prevChar = text[newStart - 1]

    // Stop at newline
    if (prevChar === '\n') break

    // Stop at sentence-ending punctuation (but check period carefully)
    if (prevChar === ':' || prevChar === ';' || prevChar === '!' || prevChar === '?') break
    if (prevChar === '.' && isSentenceEndPeriod(text, newStart - 1)) break

    // Stop if we hit a bullet marker (we're at list item start)
    if (/[•·*\-]/.test(prevChar) && (newStart < 2 || text[newStart - 2] === '\n' || /\s/.test(text[newStart - 2]))) {
      break
    }

    newStart--
  }

  // Skip any whitespace after the boundary
  while (newStart < end && /\s/.test(text[newStart])) {
    newStart++
  }

  // FORCE END to valid boundary
  // If char at end-1 is not sentence-ending punctuation, expand forwards
  while (newEnd < text.length && newEnd < end + maxExpand) {
    const lastChar = text[newEnd - 1]

    // Stop at newline (paragraph break)
    if (lastChar === '\n') break

    // Stop at sentence-ending punctuation (but check period carefully)
    if (lastChar === ':' || lastChar === ';' || lastChar === '!' || lastChar === '?') break
    if (lastChar === '.' && isSentenceEndPeriod(text, newEnd - 1)) break

    newEnd++
  }

  return { start: newStart, end: newEnd }
}

/**
 * Snap an index to sentence/list boundaries with adaptive window
 *
 * Features:
 * - List-aware: Prefers \n\s*[•·*-]\s or \n\s*\d+[.)]\s boundaries for list items
 * - Adaptive window: Expands to min(150, clause_length * 0.5) when first char is lowercase
 * - Second-pass: If still mid-sentence after snap, tries extended lookback
 * - Telemetry: Logs snap distances for tuning
 */
function snapToSentenceBoundary(
  text: string,
  index: number,
  direction: 'start' | 'end',
  baseMaxAdjust: number = 80,
  clauseLength?: number  // Optional: for adaptive window calculation
): number {
  if (index < 0) return 0
  if (index >= text.length) return text.length

  snapTelemetry.total_snaps++

  if (direction === 'start') {
    // Calculate adaptive window
    let maxAdjust = baseMaxAdjust

    // Check if we might be mid-sentence (lowercase start with alphanumeric predecessor)
    const needsExtendedSearch = index > 0 && index < text.length &&
      /[a-z]/.test(text[index]) && /[a-zA-Z0-9]/.test(text[index - 1])

    if (needsExtendedSearch && clauseLength) {
      // Adaptive window: up to min(150, clause_length * 0.5)
      maxAdjust = Math.min(150, Math.max(baseMaxAdjust, Math.floor(clauseLength * 0.5)))
    }

    // Priority 1: Try list item boundary (safe for list contexts)
    const listStart = findListItemStart(text, index, maxAdjust)
    if (listStart > 0 && index - listStart <= maxAdjust) {
      snapTelemetry.snapped_to_list++
      snapTelemetry.snap_distances.push(index - listStart)
      return listStart
    }

    // Priority 2: Try sentence start
    const sentenceStart = findSentenceStart(text, index, maxAdjust)
    if (sentenceStart < index && index - sentenceStart <= maxAdjust) {
      snapTelemetry.snapped_to_sentence++
      snapTelemetry.snap_distances.push(index - sentenceStart)
      return sentenceStart
    }

    // Priority 3: Word boundary fallback
    const wordStart = snapToWordBoundary(text, index, 'start', 15)

    // Second-pass check: If we're still mid-sentence, try harder
    if (isMidSentenceStart(text, wordStart) && clauseLength) {
      // Extended search with larger window
      const extendedMax = Math.min(200, clauseLength)
      const extendedListStart = findListItemStart(text, wordStart, extendedMax)
      if (extendedListStart > 0 && wordStart - extendedListStart <= extendedMax) {
        snapTelemetry.second_pass_corrections++
        snapTelemetry.snapped_to_list++
        snapTelemetry.snap_distances.push(wordStart - extendedListStart)
        return extendedListStart
      }

      const extendedSentenceStart = findSentenceStart(text, wordStart, extendedMax)
      if (extendedSentenceStart < wordStart && wordStart - extendedSentenceStart <= extendedMax) {
        snapTelemetry.second_pass_corrections++
        snapTelemetry.snapped_to_sentence++
        snapTelemetry.snap_distances.push(wordStart - extendedSentenceStart)
        return extendedSentenceStart
      }

      // Log that we couldn't fix this one
      snapTelemetry.no_snap_exceeded_window++
    }

    snapTelemetry.snapped_to_word++
    if (wordStart !== index) {
      snapTelemetry.snap_distances.push(index - wordStart)
    }
    return wordStart

  } else {
    // End snapping (less complex - just find sentence end)
    const sentenceEnd = findSentenceEnd(text, index, baseMaxAdjust)

    if (sentenceEnd > index && sentenceEnd - index <= baseMaxAdjust) {
      snapTelemetry.snapped_to_sentence++
      snapTelemetry.snap_distances.push(sentenceEnd - index)
      return sentenceEnd
    }

    // Fall back to word boundary
    const wordEnd = snapToWordBoundary(text, index, 'end', 15)
    snapTelemetry.snapped_to_word++
    if (wordEnd !== index) {
      snapTelemetry.snap_distances.push(wordEnd - index)
    }
    return wordEnd
  }
}

/**
 * Trim leading headers from clause start
 * Returns adjusted start index that skips header lines
 */
function trimLeadingHeaders(text: string, startIndex: number, endIndex: number): number {
  let pos = startIndex

  // Skip leading whitespace
  while (pos < endIndex && /\s/.test(text[pos])) {
    pos++
  }

  // Check if we're at a header line
  const lineStart = pos
  const lineEnd = findLineEnd(text, pos)
  const line = text.slice(lineStart, lineEnd)

  if (isLikelyHeader(line)) {
    // Skip the header line and any following whitespace
    pos = lineEnd
    while (pos < endIndex && /\s/.test(text[pos])) {
      pos++
    }

    // Make sure we haven't gone past endIndex or made clause too short
    if (pos < endIndex && endIndex - pos >= MIN_CLAUSE_LENGTH) {
      return pos
    }
  }

  return startIndex
}

/**
 * Trim trailing incomplete content
 * Returns adjusted end index
 */
function trimTrailingContent(text: string, startIndex: number, endIndex: number): number {
  // Just ensure we end at word boundary if we didn't find sentence end
  let pos = endIndex

  // Skip trailing whitespace
  while (pos > startIndex && /\s/.test(text[pos - 1])) {
    pos--
  }

  // Make sure we haven't made clause too short
  if (pos - startIndex >= MIN_CLAUSE_LENGTH) {
    return pos
  }

  return endIndex
}

/**
 * Validates and dedupes indexed clauses from GPT.
 * Enforces: bounds, min/max length, non-empty slice, non-overlapping ranges.
 * Returns validated clauses with derived content + telemetry.
 */
function validateClauseIndices(
  rawClauses: RawIndexedClause[],
  fullText: string,
  chunkStart: number = 0  // For chunked extraction, add this to convert local -> global
): { valid: ValidatedIndexedClause[]; telemetry: IndexValidationTelemetry } {
  const textLength = fullText.length
  const telemetry: IndexValidationTelemetry = {
    clauses_returned: rawClauses.length,
    clauses_valid: 0,
    dropped_for_bounds: 0,
    dropped_for_overlap: 0,
    dropped_for_empty: 0,
    dropped_for_length: 0,
    final_coverage_rate: 0
  }

  if (rawClauses.length === 0) {
    return { valid: [], telemetry }
  }

  // Step 1: Filter by bounds and length, derive content
  const withContent: Array<ValidatedIndexedClause & { _globalStart: number; _globalEnd: number }> = []

  for (const raw of rawClauses) {
    // Convert local indices to global (for chunked extraction)
    let globalStart = chunkStart + raw.start_index
    let globalEnd = chunkStart + raw.end_index

    // Bounds check (before snapping)
    if (globalStart < 0 || globalEnd > textLength || globalStart >= globalEnd) {
      telemetry.dropped_for_bounds++
      continue
    }

    // Calculate raw clause length for adaptive window
    const rawClauseLength = globalEnd - globalStart

    // Snap indices to SENTENCE boundaries (not just word boundaries)
    // This fixes GPT's tendency to start/end clauses mid-sentence
    // Pass clause length for adaptive window calculation
    globalStart = snapToSentenceBoundary(fullText, globalStart, 'start', 80, rawClauseLength)
    globalEnd = snapToSentenceBoundary(fullText, globalEnd, 'end', 80, rawClauseLength)

    // AGGRESSIVE boundary correction: force valid boundaries if still mid-sentence
    // This expands up to 300 chars to find proper sentence start/end
    const forced = forceValidBoundaries(fullText, globalStart, globalEnd, 300)
    globalStart = forced.start
    globalEnd = forced.end

    // Trim leading headers (e.g., "PAYMENT TERMS:", "1. Introduction")
    globalStart = trimLeadingHeaders(fullText, globalStart, globalEnd)

    // Trim trailing incomplete content
    globalEnd = trimTrailingContent(fullText, globalStart, globalEnd)

    // Re-validate bounds after snapping and trimming
    if (globalStart < 0 || globalEnd > textLength || globalStart >= globalEnd) {
      telemetry.dropped_for_bounds++
      continue
    }

    // Length check (after snapping and boundary forcing)
    const length = globalEnd - globalStart
    if (length <= MIN_CLAUSE_LENGTH) {
      telemetry.dropped_for_length++
      continue
    }
    // Allow up to 2x MAX due to aggressive boundary expansion (we expand up to 300 chars)
    if (length > MAX_CLAUSE_LENGTH * 2) {
      telemetry.dropped_for_length++
      continue
    }

    // Derive content from slice (with snapped indices)
    const content = fullText.slice(globalStart, globalEnd)

    // Non-empty check (after trim)
    if (!content.trim() || content.trim().length <= MIN_CLAUSE_LENGTH) {
      telemetry.dropped_for_empty++
      continue
    }

    withContent.push({
      start_index: globalStart,
      end_index: globalEnd,
      content,
      clause_type: raw.clause_type,
      summary: raw.summary,
      confidence: raw.confidence,
      rag_status: raw.rag_status,
      section_title: raw.section_title,
      _globalStart: globalStart,
      _globalEnd: globalEnd
    })
  }

  // Step 2: Sort by [start, end] and remove overlaps (keep first, allow touching)
  withContent.sort((a, b) => {
    if (a._globalStart !== b._globalStart) return a._globalStart - b._globalStart
    return a._globalEnd - b._globalEnd
  })

  const valid: ValidatedIndexedClause[] = []
  let lastEnd = -1

  for (const clause of withContent) {
    // Allow touching (start == lastEnd), reject true overlaps (start < lastEnd)
    if (clause._globalStart < lastEnd) {
      telemetry.dropped_for_overlap++
      continue
    }

    // Remove internal tracking fields
    const { _globalStart, _globalEnd, ...cleaned } = clause
    valid.push(cleaned)
    lastEnd = clause._globalEnd
  }

  telemetry.clauses_valid = valid.length
  telemetry.final_coverage_rate = rawClauses.length > 0
    ? valid.length / rawClauses.length
    : 0

  return { valid, telemetry }
}

/**
 * Emit index validation telemetry for monitoring.
 */
function emitIndexValidationTelemetry(
  telemetry: IndexValidationTelemetry,
  documentId: string,
  chunkIndex?: number
): void {
  console.log(JSON.stringify({
    event: "index_validation",
    level: telemetry.final_coverage_rate < 0.8 ? "warn" : "info",
    document_id: documentId,
    chunk_index: chunkIndex ?? null,
    ...telemetry
  }))
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

// Build system prompt based on extraction mode
function buildSinglePassSystemPrompt(totalLines?: number): string {
  // LINE-BASED MODE (recommended): GPT returns line numbers, we convert to character indices
  if (USE_LINE_BASED_EXTRACTION) {
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
payment_terms, invoicing, invoicing_obligation, invoicing_consequence,
deliverable_obligation, content_requirement, content_restriction,
timeline_obligation, usage_rights, exclusivity, confidentiality,
termination_right, term_definition, execution_clause, acceptance_mechanism,
third_party_terms, indemnification, liability_limitation, general_terms

RAG_STATUS VALUES:
- "green": Standard/favorable term
- "amber": Unusual term needing review
- "red": Problematic/risky term

LINE NUMBER RULES (CRITICAL):
- start_line: The line number where the clause BEGINS (look at the [N] prefix)
- end_line: The line number where the clause ENDS (inclusive)
- Example: If clause spans lines [5] to [7], return start_line: 5, end_line: 7
- EXCLUDE section headers (ALL CAPS lines like "PAYMENT TERMS") from clause content
- Include the FULL sentence even if it spans multiple lines

BOUNDARY GUIDANCE:
- ALWAYS start at the beginning of a sentence
- ALWAYS end at the end of a sentence (after the period/punctuation)
- If a sentence continues on the next line, include that line in end_line
- Never split a sentence between two clauses

REQUIREMENTS:
1. Return 15-35 clauses for typical contracts
2. No overlapping line ranges
3. Valid line numbers within document range
4. Every clause must contain COMPLETE sentences`
  }

  // INDEX-BASED MODE (legacy): GPT returns character indices directly
  if (USE_INDEX_BASED_EXTRACTION) {
    return `You are "ContractBuddy Clause Extractor" - a precision legal document parser.

YOUR TASK: Extract clauses by returning their CHARACTER POSITIONS (start_index and end_index).

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
- LENGTH: ${MIN_CLAUSE_LENGTH}-${MAX_CLAUSE_LENGTH} characters (HARD LIMIT - we will reject clauses outside this range)

SPLITTING RULES (each becomes separate clause):
1. Each bullet point (•, ·, *, -) = separate clause
2. Each numbered item (1., 2., a)) = separate clause
3. Different obligations joined by "and shall" / "and must" = split
4. Different actors ("Influencer must" vs "Brand shall") = split

CLAUSE_TYPE VALUES (use exactly one of these):
payment_terms, invoicing, invoicing_obligation, invoicing_consequence,
deliverable_obligation, content_requirement, content_restriction,
timeline_obligation, usage_rights, exclusivity, confidentiality,
termination_right, term_definition, execution_clause, acceptance_mechanism,
third_party_terms, indemnification, liability_limitation, general_terms

RAG_STATUS VALUES:
- "green": Standard/favorable term
- "amber": Unusual term needing review
- "red": Problematic/risky term

INDEX RULES (CRITICAL):
- start_index: 0-based position of FIRST character of clause
- end_index: Position AFTER last character (Python slice notation: text[start:end])
- For bullet items: start AFTER the bullet marker ("· " or "- ")
- EXCLUDE section headers (ALL CAPS lines) from clause content
- Clause = text[start_index:end_index]

BOUNDARY GUIDANCE:
- Prefer starting at sentence beginnings (after . or newline)
- Prefer ending at sentence ends (at . or before newline)
- We will auto-correct minor boundary drift, so approximate positions are OK

REQUIREMENTS:
1. Every clause: ${MIN_CLAUSE_LENGTH}-${MAX_CLAUSE_LENGTH} characters
2. Return 15-35 clauses for typical contracts
3. No overlapping indices
4. Valid positions within document length`
  }

  // Legacy content-based prompt
  return `You are "ContractBuddy Clause Extractor" - a precision legal document parser.

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

EXAMPLE:
Input: "PAYMENT: Invoice within 7 days. Payment within 30 days. Invoice must include: (1) date (2) VAT number (3) address"
Output: 5 clauses (one per obligation)

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
}

async function extractClausesSinglePass(
  contractText: string,
  apiKey: string,
  model: AllowedModel = "gpt-5.1",
  documentId?: string  // For telemetry
): Promise<ExtractedClause[]> {
  // In index/line mode, text is already sanitized by extractWithTimeoutFallback
  // In legacy mode, apply traditional sanitization (nulls + trim)
  const sanitizedText = (USE_LINE_BASED_EXTRACTION || USE_INDEX_BASED_EXTRACTION)
    ? contractText  // Already sanitized, don't modify
    : contractText.replace(/\u0000/g, "").trim()

  // Prepare line-numbered document for line-based extraction
  let lineDoc: LineNumberedDocument | null = null
  let textForGpt = sanitizedText

  if (USE_LINE_BASED_EXTRACTION) {
    lineDoc = prepareLineNumberedDocument(sanitizedText)
    textForGpt = lineDoc.numberedText
    console.log(`Line-based extraction: ${lineDoc.totalLines} lines prepared`)
  }

  const estimatedTokens = estimateTokens(textForGpt)
  const extractionMode = USE_LINE_BASED_EXTRACTION ? 'line_mode' : (USE_INDEX_BASED_EXTRACTION ? 'index_mode' : 'content_mode')
  console.log(`${model} extraction: ${sanitizedText.length} chars (~${estimatedTokens} tokens) in single pass (${extractionMode})`)

  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS)

  // Build user message based on extraction mode
  let userMessage: string
  if (USE_LINE_BASED_EXTRACTION && lineDoc) {
    userMessage = `Extract all clauses from this contract by identifying their LINE NUMBERS. Each line is prefixed with its number in brackets [N].

Remember: SPLIT aggressively. Each obligation = one clause with its start_line and end_line.
IMPORTANT: Always include COMPLETE sentences. If a sentence spans multiple lines, include all those lines.

The document has ${lineDoc.totalLines} lines (numbered 0 to ${lineDoc.totalLines - 1}).

CONTRACT TEXT:
${textForGpt}`
  } else if (USE_INDEX_BASED_EXTRACTION) {
    userMessage = `Extract all clauses from this contract by identifying their CHARACTER POSITIONS. Remember: SPLIT aggressively. Each obligation = one clause with its start_index and end_index.

The text below is exactly ${sanitizedText.length} characters long (0-indexed from 0 to ${sanitizedText.length - 1}).

CONTRACT TEXT:
${sanitizedText}`
  } else {
    userMessage = `Extract all clauses from this contract. Remember: SPLIT aggressively. Each obligation = one clause.

CONTRACT TEXT:
${sanitizedText}`
  }

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
            content: buildSinglePassSystemPrompt(lineDoc?.totalLines)
          },
          {
            role: "user",
            content: userMessage
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

    // LINE-BASED MODE: Convert line numbers to character indices
    if (USE_LINE_BASED_EXTRACTION && lineDoc) {
      const firstClause = clausesArray[0]
      const isLineBased = firstClause &&
        (firstClause.start_line !== undefined || firstClause.end_line !== undefined)

      if (!isLineBased) {
        console.warn('Expected line-based response but got different format, falling back to index detection')
      }

      // Parse line-based clauses
      const lineClauses: RawLineBasedClause[] = clausesArray.map((clause: any) => ({
        start_line: Number(clause.start_line ?? 0),
        end_line: Number(clause.end_line ?? 0),
        clause_type: String(clause.clause_type || "general_terms").replace(/\s+/g, "_"),
        summary: String(clause.summary || ""),
        confidence: Number(clause.confidence || 0.8),
        rag_status: validateRagStatus(clause.rag_status),
        section_title: clause.section_title || null
      }))

      console.log(`Line-based extraction: ${lineClauses.length} clauses returned by GPT`)

      // Convert line numbers to character indices
      const rawClauses = convertLinesToIndices(lineClauses, lineDoc)
      console.log(`Line-to-index conversion: ${rawClauses.length} clauses with valid indices`)

      // Validate and derive content (using original text, not numbered text)
      const { valid, telemetry } = validateClauseIndices(rawClauses, sanitizedText, 0)

      // Emit telemetry
      if (documentId) {
        emitIndexValidationTelemetry(telemetry, documentId)
        emitSnapTelemetry(documentId)
      }

      console.log(`Line-based extraction complete: ${valid.length} valid clauses`)

      // Convert to ExtractedClause format
      return valid.map((clause) => ({
        content: clause.content,
        clause_type: clause.clause_type,
        summary: clause.summary,
        confidence: clause.confidence,
        rag_status: clause.rag_status,
        section_title: clause.section_title || null,
        chunk_index: 0,
        start_index: clause.start_index,
        end_index: clause.end_index,
        parsing_quality: clause.confidence
      }))
    }

    // INDEX-BASED MODE (legacy): GPT returns character indices directly
    if (USE_INDEX_BASED_EXTRACTION) {
      // Detect if response is anchor-based or index-based
      const firstClause = clausesArray[0]
      const isAnchorBased = firstClause &&
        (firstClause.start_anchor || firstClause.end_anchor) &&
        !firstClause.start_index

      let rawClauses: RawIndexedClause[]

      if (isAnchorBased) {
        // Anchor-based: GPT returned text anchors, convert to indices
        console.log('Detected anchor-based response, converting to indices...')
        const anchorClauses: RawAnchorClause[] = clausesArray.map((clause: any) => ({
          start_anchor: String(clause.start_anchor || ""),
          end_anchor: String(clause.end_anchor || ""),
          clause_type: String(clause.clause_type || "general_terms").replace(/\s+/g, "_"),
          summary: String(clause.summary || ""),
          confidence: Number(clause.confidence || 0.8),
          rag_status: validateRagStatus(clause.rag_status),
          section_title: clause.section_title || null
        }))
        rawClauses = convertAnchorsToIndices(anchorClauses, sanitizedText)
      } else {
        // Index-based: validate indices and derive content from slice
        rawClauses = clausesArray.map((clause: any) => ({
          start_index: Number(clause.start_index || 0),
          end_index: Number(clause.end_index || 0),
          clause_type: String(clause.clause_type || "general_terms").replace(/\s+/g, "_"),
          summary: String(clause.summary || ""),
          confidence: Number(clause.confidence || 0.8),
          rag_status: validateRagStatus(clause.rag_status),
          section_title: clause.section_title || null
        }))
      }

      // Validate and derive content
      const { valid, telemetry } = validateClauseIndices(rawClauses, sanitizedText, 0)

      // Emit telemetry
      if (documentId) {
        emitIndexValidationTelemetry(telemetry, documentId)
        emitSnapTelemetry(documentId)
      }

      // Convert to ExtractedClause format
      return valid.map((clause) => ({
        content: clause.content,
        clause_type: clause.clause_type,
        summary: clause.summary,
        confidence: clause.confidence,
        rag_status: clause.rag_status,
        section_title: clause.section_title || null,
        chunk_index: 0,
        start_index: clause.start_index,
        end_index: clause.end_index,
        parsing_quality: clause.confidence
      }))
    }

    // Legacy content-based parsing
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

// Canonical sanitization for index mode - MUST be used consistently
// for both GPT input and extracted_text persistence
function sanitizeForIndexMode(text: string): string {
  // Only strip nulls, do NOT trim - preserves character positions
  return text.replace(/\u0000/g, "")
}

// Wrapper with timeout fallback to chunked extraction
// Returns sanitizedText so persistence can use the same string as indices
async function extractWithTimeoutFallback(
  contractText: string,
  apiKey: string,
  pathDecision: ExtractionPathDecision,
  documentId?: string  // For telemetry in index mode
): Promise<{ clauses: ExtractedClause[]; usedFallback: boolean; sanitizedText: string }> {
  // CRITICAL: Sanitize once at the top, use everywhere
  const sanitizedText = USE_INDEX_BASED_EXTRACTION
    ? sanitizeForIndexMode(contractText)
    : contractText

  if (pathDecision.path === "chunked") {
    // Already chunked path - use existing flow
    const clauses = await runChunkedExtraction(sanitizedText, apiKey, pathDecision.model, documentId)
    return { clauses, usedFallback: false, sanitizedText }
  }

  try {
    const clauses = await extractClausesSinglePass(sanitizedText, apiKey, pathDecision.model, documentId)
    return { clauses, usedFallback: false, sanitizedText }
  } catch (err: any) {
    if (err.message.includes("timed out")) {
      console.warn(`Single-pass timed out, falling back to chunked extraction`)
      const clauses = await runChunkedExtraction(sanitizedText, apiKey, "gpt-4o", documentId)
      return { clauses, usedFallback: true, sanitizedText }
    }
    throw err
  }
}

// runChunkedExtraction wraps the existing chunked flow
// Note: Forward declaration - callOpenAIForChunk and chunkContractText defined below
async function runChunkedExtraction(
  contractText: string,
  apiKey: string,
  model: AllowedModel,
  documentId?: string  // For telemetry
): Promise<ExtractedClause[]> {
  const { chunks: textChunks, sanitizedText } = chunkContractText(contractText)
  let extractedClauses: ExtractedClause[] = []

  for (let i = 0; i < textChunks.length; i++) {
    const chunkPayload = textChunks[i]
    // IMPORTANT: Pass model to allow chunked 5.1 if needed
    // Pass chunkStart and sanitizedText for index-based extraction
    const chunkClauses = await callOpenAIForChunk({
      apiKey,
      chunkText: chunkPayload.text,
      chunkIndex: i,
      totalChunks: textChunks.length,
      sections: chunkPayload.sections,
      model,
      chunkStart: chunkPayload.start,
      sanitizedText,
      documentId
    })

    // In index mode, skip ensureSectionCoverage (no header padding)
    if (USE_INDEX_BASED_EXTRACTION) {
      extractedClauses.push(...chunkClauses)
    } else {
      const coveredClauses = ensureSectionCoverage(chunkPayload.sections, chunkClauses, i)
      extractedClauses.push(...coveredClauses)
    }
  }

  return USE_INDEX_BASED_EXTRACTION
    ? dedupeClausesByRange(extractedClauses)
    : dedupeClauses(extractedClauses)
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
  // Index-based extraction fields (when USE_INDEX_BASED_EXTRACTION=true)
  start_index?: number  // Global character offset where clause begins (0-indexed)
  end_index?: number    // Global character offset where clause ends (exclusive)
}

// Raw clause from GPT in index-based mode (before content derivation)
type RawIndexedClause = {
  start_index: number
  end_index: number
  clause_type: string
  summary: string
  confidence: number
  rag_status: "green" | "amber" | "red"
  section_title?: string
}

// Raw clause from GPT in anchor-based mode
type RawAnchorClause = {
  start_anchor: string
  end_anchor: string
  clause_type: string
  summary: string
  confidence: number
  rag_status: "green" | "amber" | "red"
  section_title?: string
}

/**
 * Convert anchor-based clauses to index-based by finding anchor positions in text.
 * Uses fuzzy matching to handle minor GPT transcription errors.
 */
function convertAnchorsToIndices(
  anchorClauses: RawAnchorClause[],
  fullText: string
): RawIndexedClause[] {
  const results: RawIndexedClause[] = []
  const normalizedText = fullText.toLowerCase().replace(/\s+/g, ' ')

  for (const clause of anchorClauses) {
    const startAnchor = clause.start_anchor?.trim()
    const endAnchor = clause.end_anchor?.trim()

    if (!startAnchor || !endAnchor) {
      console.warn('Skipping clause with missing anchors:', clause.summary?.slice(0, 50))
      continue
    }

    // Find start position using fuzzy search
    const startPos = findAnchorPosition(fullText, normalizedText, startAnchor, 0)
    if (startPos < 0) {
      console.warn('Could not find start anchor:', startAnchor.slice(0, 40))
      continue
    }

    // Find end position (search from after start position)
    const endPos = findAnchorEndPosition(fullText, normalizedText, endAnchor, startPos)
    if (endPos < 0) {
      console.warn('Could not find end anchor:', endAnchor.slice(0, 40))
      continue
    }

    // Validate reasonable clause length
    const length = endPos - startPos
    if (length < MIN_CLAUSE_LENGTH || length > MAX_CLAUSE_LENGTH + 100) {
      console.warn(`Clause length out of range (${length}):`, startAnchor.slice(0, 30))
      continue
    }

    results.push({
      start_index: startPos,
      end_index: endPos,
      clause_type: clause.clause_type,
      summary: clause.summary,
      confidence: clause.confidence,
      rag_status: clause.rag_status,
      section_title: clause.section_title
    })
  }

  console.log(`Converted ${results.length}/${anchorClauses.length} anchor clauses to indices`)
  return results
}

/**
 * Find the position of an anchor in the text using fuzzy matching
 */
function findAnchorPosition(
  fullText: string,
  normalizedText: string,
  anchor: string,
  searchFrom: number
): number {
  // First try exact match
  const exactPos = fullText.indexOf(anchor, searchFrom)
  if (exactPos >= 0) return exactPos

  // Try normalized match (lowercase, collapsed whitespace)
  const normalizedAnchor = anchor.toLowerCase().replace(/\s+/g, ' ')
  const normalizedPos = normalizedText.indexOf(normalizedAnchor, searchFrom)
  if (normalizedPos >= 0) {
    // Map back to original text position (approximate)
    return findOriginalPosition(fullText, normalizedPos, anchor)
  }

  // Try with first few words only (more forgiving)
  const firstWords = anchor.split(/\s+/).slice(0, 5).join(' ')
  const firstWordsPos = fullText.toLowerCase().indexOf(firstWords.toLowerCase(), searchFrom)
  if (firstWordsPos >= 0) {
    return firstWordsPos
  }

  return -1
}

/**
 * Find the END position of an anchor (returns position AFTER the anchor text)
 */
function findAnchorEndPosition(
  fullText: string,
  normalizedText: string,
  anchor: string,
  searchFrom: number
): number {
  // First try exact match
  const exactPos = fullText.indexOf(anchor, searchFrom)
  if (exactPos >= 0) return exactPos + anchor.length

  // Try normalized match
  const normalizedAnchor = anchor.toLowerCase().replace(/\s+/g, ' ')
  const normalizedPos = normalizedText.indexOf(normalizedAnchor, searchFrom)
  if (normalizedPos >= 0) {
    const originalPos = findOriginalPosition(fullText, normalizedPos, anchor)
    // Find the actual end in original text
    const endSearch = fullText.toLowerCase().indexOf(
      anchor.split(/\s+/).slice(-3).join(' ').toLowerCase(),
      originalPos
    )
    if (endSearch >= 0) {
      // Find the sentence end after this point
      const sentenceEnd = findNextSentenceEnd(fullText, endSearch)
      return sentenceEnd
    }
    return originalPos + anchor.length
  }

  // Try with last few words only
  const lastWords = anchor.split(/\s+/).slice(-4).join(' ')
  const lastWordsPos = fullText.toLowerCase().indexOf(lastWords.toLowerCase(), searchFrom)
  if (lastWordsPos >= 0) {
    return findNextSentenceEnd(fullText, lastWordsPos)
  }

  return -1
}

/**
 * Map a position in normalized text back to original text
 */
function findOriginalPosition(fullText: string, normalizedPos: number, anchor: string): number {
  // Simple approach: find the first few words in the original text
  const firstWords = anchor.split(/\s+/).slice(0, 4).join('\\s+')
  const regex = new RegExp(firstWords.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  const match = fullText.slice(Math.max(0, normalizedPos - 50)).match(regex)
  if (match && match.index !== undefined) {
    return Math.max(0, normalizedPos - 50) + match.index
  }
  return normalizedPos
}

/**
 * Find the next sentence end from a position
 */
function findNextSentenceEnd(text: string, from: number): number {
  const sentenceEnders = ['.', '!', '?', ':', ';']
  for (let i = from; i < text.length && i < from + 200; i++) {
    if (sentenceEnders.includes(text[i])) {
      return i + 1
    }
  }
  return from + 50 // fallback
}

type SectionInfo = {
  title: string
  content: string
}

type ChunkPayload = {
  text: string
  sections: SectionInfo[]
  start: number  // Global character offset where this chunk begins (for index-based extraction)
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
function splitIntoMicroClauses(
  content: string,
  sectionTitle: string | null,
  clauseType: string,
  chunkIndex: number
): ExtractedClause[] {
  const sanitized = content.trim()
  if (!sanitized) return []

  // Prefer bullet/line splits; fallback to sentences.
  const bulletParts = sanitized
    .split(/(?:\r?\n|\r)[\u2022\u2023\u25E6\u2024\u2043\-•▪]\s*/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const candidates =
    bulletParts.length > 1
      ? bulletParts
      : sanitized
          .split(/(?<=[\.!\?])\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)

  const MICRO_MIN = 40
  const MICRO_MAX = MAX_CLAUSE_LENGTH
  const pieces = candidates.flatMap((text) => {
    if (text.length <= MICRO_MAX) return [text]
    // Chunk oversized sentences at word boundaries to avoid mid-word splits
    const segments: string[] = []
    let remaining = text
    while (remaining.length > MICRO_MAX) {
      // Find the last space within the max length
      let splitAt = remaining.lastIndexOf(' ', MICRO_MAX)
      // If no space found (very long word), fall back to hard split
      if (splitAt === -1 || splitAt < MICRO_MAX * 0.5) {
        splitAt = MICRO_MAX
      }
      segments.push(remaining.slice(0, splitAt).trim())
      remaining = remaining.slice(splitAt).trim()
    }
    if (remaining.length > 0) {
      segments.push(remaining)
    }
    return segments
  })

  return pieces
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
 *
 * IMPORTANT (String Identity Guardrail): In index mode, the text passed here
 * should already be sanitized by sanitizeForIndexMode() at the wrapper level.
 * This function does NOT do additional sanitization to preserve index alignment.
 *
 * Returns: { chunks, sanitizedText } where sanitizedText is the canonical
 * string for all index-based slicing operations.
 */
function chunkContractText(text: string): { chunks: ChunkPayload[]; sanitizedText: string } {
  // In index mode, text is already sanitized by extractWithTimeoutFallback
  // In legacy mode, apply traditional sanitization (nulls + trim)
  const sanitized = USE_INDEX_BASED_EXTRACTION
    ? text  // Already sanitized, don't modify
    : text.replace(/\u0000/g, "").trim()

  if (sanitized.length === 0) {
    return { chunks: [], sanitizedText: sanitized }
  }

  if (sanitized.length <= OPENAI_CHUNK_SIZE) {
    return {
      chunks: [
        {
          text: sanitized,
          sections: detectSections(sanitized),
          start: 0,  // Single chunk starts at position 0
        },
      ],
      sanitizedText: sanitized
    }
  }

  const chunks: ChunkPayload[] = []
  let start = 0

  while (start < sanitized.length) {
    const end = Math.min(start + OPENAI_CHUNK_SIZE, sanitized.length)
    const chunkText = sanitized.slice(start, end)
    chunks.push({
      text: chunkText,
      sections: detectSections(chunkText),
      start,  // Global character offset where this chunk begins
    })
    if (end === sanitized.length) break
    start = end - OPENAI_CHUNK_OVERLAP
  }

  return { chunks, sanitizedText: sanitized }
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

/**
 * Range-based deduplication for index-based extraction.
 * Sort by [start, end], keep first occurrence, drop overlaps.
 * Allows touching ranges (start == prev.end), rejects true overlaps.
 */
function dedupeClausesByRange(clauses: ExtractedClause[]): ExtractedClause[] {
  // Filter clauses that have valid indices
  const withIndices = clauses.filter(c =>
    typeof c.start_index === 'number' &&
    typeof c.end_index === 'number'
  )

  const withoutIndices = clauses.length - withIndices.length
  if (withoutIndices > 0) {
    console.warn(`⚠️ Range dedupe: ${withoutIndices} clause(s) missing indices (dropped)`)
  }

  // Sort by [start, end] tuple
  withIndices.sort((a, b) => {
    if (a.start_index !== b.start_index) return a.start_index! - b.start_index!
    return a.end_index! - b.end_index!
  })

  const result: ExtractedClause[] = []
  let lastEnd = -1
  let overlapDrops = 0

  for (const clause of withIndices) {
    // Allow touching (start == lastEnd), reject true overlaps (start < lastEnd)
    if (clause.start_index! < lastEnd) {
      overlapDrops++
      continue
    }
    result.push(clause)
    lastEnd = clause.end_index!
  }

  if (overlapDrops > 0) {
    console.log(`🔄 Range dedupe: dropped ${overlapDrops} overlapping clause(s)`)
  }

  return result
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

function chunkAtWordBoundaries(text: string, maxLength: number): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  let current: string[] = []
  let currentLen = 0

  for (const word of words) {
    if (currentLen + word.length + 1 > maxLength && current.length > 0) {
      chunks.push(current.join(' '))
      current = []
      currentLen = 0
    }
    current.push(word)
    currentLen += word.length + 1
  }

  if (current.length > 0) {
    chunks.push(current.join(' '))
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

// Build chunked extraction prompt based on mode
function buildChunkedSystemPrompt(): string {
  if (USE_INDEX_BASED_EXTRACTION) {
    return `You are the "ContractBuddy Clause Extractor", an AI paralegal specialised in commercial and influencer marketing agreements.

Your job:
- Read contract text.
- Identify sections and clauses by their CHARACTER POSITIONS.
- Output a clean, strictly valid JSON object with clause indices.

Global rules:
- You are conservative and literal: you only use information that is explicitly present in the text you are given.
- You never hallucinate new obligations, parties, dates, or numbers.
- You never invent section headings that are not provided.
- You NEVER include explanations, commentary, markdown, or any text outside of the JSON object.
- All keys MUST be in double quotes, no trailing commas, and the JSON MUST be syntactically valid.

Semantics (granular clauses required):
- A "clause" is a **single obligation/definition/right**, ideally ${MIN_CLAUSE_LENGTH + 1}–${MAX_CLAUSE_LENGTH} characters, max 3 sentences.
- Split bullets/numbered lists into separate clauses (one per bullet/sub-item).
- Return CHARACTER INDICES not text content. We will extract the exact text using your indices.

If instructions in later messages conflict with these global rules, follow THESE global rules.`
  }

  return `You are the "ContractBuddy Clause Extractor", an AI paralegal specialised in commercial and influencer marketing agreements.

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
- A "clause" is a **single obligation/definition/right**, ideally 50–400 characters, max 3 sentences. Do NOT merge multiple obligations into one clause.
- Split bullets/numbered lists into separate clauses (one per bullet/sub-item). If a paragraph has multiple obligations, split them.
- If a clause looks truncated at the start or end (chunk boundary), still return it but:
  - set a lower confidence (≤ 0.4)
  - mention "likely truncated at chunk boundary" in the summary.
- rag_status is a quick quality/risk indicator:
  - "green": clear, complete clause that reads as standard / low risk for this section.
  - "amber": ambiguous, incomplete, or partially present; content may be missing from this chunk.
  - "red": clearly risky, contradictory, or appears to omit something critical for this section.

If instructions in later messages conflict with these global rules, follow THESE global rules.`
}

function buildChunkedUserPrompt(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
  sections: SectionInfo[]
): string {
  if (USE_INDEX_BASED_EXTRACTION) {
    return `You are processing chunk ${chunkIndex + 1} of ${totalChunks} for a contract document.
You MUST only use text from this chunk.

Section headings expected for this chunk (from document formatting):
${buildSectionOutline(sections)}

---

Your task:
Identify clauses in this chunk by their CHARACTER POSITIONS. Return a JSON object with a "clauses" array.

### 1. Output format (hard requirement)

Return ONLY a single JSON object:

{
  "clauses": [
    {
      "start_index": <integer>,  // Character offset where clause begins (0-indexed within THIS chunk)
      "end_index": <integer>,    // Character offset where clause ends (exclusive, like slice())
      "clause_type": "snake_case_type",
      "summary": "1-3 sentence description",
      "confidence": 0.0-1.0,
      "rag_status": "green" | "amber" | "red"
    }
  ]
}

No other fields. No extra top-level keys. No comments. No markdown.

### 2. Index rules

- start_index and end_index are 0-indexed positions WITHIN THIS CHUNK TEXT
- end_index - start_index must be between ${MIN_CLAUSE_LENGTH + 1} and ${MAX_CLAUSE_LENGTH}
- Indices must not overlap (but can touch: one clause's end_index can equal next clause's start_index)
- Count characters carefully including spaces and punctuation
- CRITICAL: Indices MUST align with WORD BOUNDARIES - never cut a word in half!
  - start_index: beginning of a word (after space/newline/punctuation)
  - end_index: end of a word (at space/newline/punctuation/end-of-text)

### 3. Field semantics

- clause_type (snake_case): e.g. "parties", "scope_of_work", "fees_and_payment", "term_and_termination", "usage_rights", "confidentiality", "miscellaneous".
- summary: 1–3 sentences, neutral and factual.
- confidence: 0.8–1.0 (clear), 0.5–0.79 (some ambiguity), 0.0–0.49 (incomplete/ambiguous/truncated).
- rag_status: "green", "amber", or "red" based only on this chunk.

### 4. Validation checklist

Before returning the JSON, ensure:
- Top level is { "clauses": [ ... ] }.
- Every clause length (end_index - start_index) is ${MIN_CLAUSE_LENGTH + 1}-${MAX_CLAUSE_LENGTH}
- No overlapping ranges
- JSON is syntactically valid (no trailing commas/comments).

---

Chunk text (exactly ${chunkText.length} characters, 0-indexed from 0 to ${chunkText.length - 1}):

${chunkText}`
  }

  // Legacy content-based prompt
  return `You are processing chunk ${chunkIndex + 1} of ${totalChunks} for a contract document.
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

- content: Verbatim or lightly cleaned text from this chunk only (core clause body). Aim for 50–400 characters; NEVER return a mega-clause.
- content: **Verbatim text from this chunk only** (light whitespace cleanup allowed). Aim for 50–400 characters; NEVER paraphrase or merge multiple obligations; NEVER return a mega-clause.
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

${chunkText}`
}

async function callOpenAIForChunk({
  apiKey,
  chunkText,
  chunkIndex,
  totalChunks,
  sections,
  model = "gpt-4o",
  chunkStart = 0,
  sanitizedText = "",
  documentId
}: {
  apiKey: string
  chunkText: string
  chunkIndex: number
  totalChunks: number
  sections: SectionInfo[]
  model?: AllowedModel
  chunkStart?: number       // Global offset where this chunk begins (for index mode)
  sanitizedText?: string    // Full sanitized text (for index mode slicing)
  documentId?: string       // For telemetry
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
                content: buildChunkedSystemPrompt()
              },
              {
                role: "user",
                content: buildChunkedUserPrompt(chunkText, chunkIndex, totalChunks, sections)
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

      let normalizedClauses: ExtractedClause[]

      if (USE_INDEX_BASED_EXTRACTION) {
        // Index-based parsing: validate indices and derive content from slice
        // GPT returns local indices (within this chunk), we convert to global indices
        const rawClauses: RawIndexedClause[] = clausesArray.map((clause: any) => ({
          start_index: Number(clause.start_index || 0),
          end_index: Number(clause.end_index || 0),
          clause_type: String(clause.clause_type || "general_terms").replace(/\s+/g, "_"),
          summary: String(clause.summary || ""),
          confidence: Number(clause.confidence || 0.8),
          rag_status: validateRagStatus(clause.rag_status),
          section_title: clause.section_title || null
        }))

        // Validate using the FULL sanitized text, with chunkStart offset for global coordinates
        // CRITICAL: We slice from sanitizedText (the full document), not chunkText
        const { valid, telemetry } = validateClauseIndices(rawClauses, sanitizedText, chunkStart)

        // Emit telemetry
        if (documentId) {
          emitIndexValidationTelemetry(telemetry, documentId, chunkIndex)
        }

        // Convert to ExtractedClause format with global indices
        normalizedClauses = valid.map((clause) => ({
          content: clause.content,
          clause_type: clause.clause_type,
          summary: clause.summary,
          confidence: clause.confidence,
          rag_status: clause.rag_status,
          section_title: clause.section_title || null,
          chunk_index: chunkIndex,
          start_index: clause.start_index,
          end_index: clause.end_index,
          parsing_quality: clause.confidence
        }))

        // In index mode, skip enforceClauseGranularity and ensureContentFromChunk
        // (splitting is done in the prompt, content is derived from slice)
      } else {
        // Legacy content-based parsing
        normalizedClauses = clausesArray.map((clause: any) => ({
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

        // Legacy post-processing
        normalizedClauses = enforceClauseGranularity(normalizedClauses, chunkIndex)
        normalizedClauses = ensureContentFromChunk(normalizedClauses, chunkText, chunkIndex)
      }

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
        )}, overLimit=${overLimit} (index_mode=${USE_INDEX_BASED_EXTRACTION})`
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

    // Declare at function scope so it's accessible in Checkpoint D
    let textForPersistence: string = extractedText

    try {
      const startTime = Date.now()

      // Use wrapper that handles timeouts and falls back to chunked if needed
      // Returns sanitizedText for index mode persistence (ensures indices align with stored text)
      const { clauses: rawClauses, usedFallback, sanitizedText } = await extractWithTimeoutFallback(
        extractedText,
        openaiApiKey,
        pathDecision,
        document_id  // For index validation telemetry
      )

      // CRITICAL: Use sanitizedText for all downstream operations in index mode
      // This ensures indices computed on sanitizedText align with persisted extracted_text
      textForPersistence = USE_INDEX_BASED_EXTRACTION ? sanitizedText : extractedText
      const extractionTime = Date.now() - startTime

      if (usedFallback) {
        console.warn(`Extraction used timeout fallback to chunked path`)
      }

      // Deduplication - use range-based for index mode, content-based for legacy
      const preDedupCount = rawClauses.length
      extractedClauses = USE_INDEX_BASED_EXTRACTION
        ? dedupeClausesByRange(rawClauses)
        : dedupeClauses(rawClauses)

      if (extractedClauses.length !== preDedupCount) {
        console.log(
          `🧹 Dedupe removed ${preDedupCount - extractedClauses.length} overlapping clause(s) [index_mode=${USE_INDEX_BASED_EXTRACTION}]`
        )
      }

      // Capture mega-clause count BEFORE force-split
      const preSplitMetrics = computeExtractionMetrics(extractedClauses)
      const preSplitMegaCount = preSplitMetrics.megaClauseCount

      // Force-split any remaining mega-clauses (safety net)
      // In index mode, skip force-split to preserve verbatim indices
      if (preSplitMegaCount > 0 && !USE_INDEX_BASED_EXTRACTION) {
        console.log(`Force-splitting ${preSplitMegaCount} mega-clauses...`)
        extractedClauses = forceGranularitySmart(extractedClauses)
        const postSplitMetrics = computeExtractionMetrics(extractedClauses)
        console.log(`Post-split: ${postSplitMetrics.clauseCount} clauses, avg ${postSplitMetrics.avgLength} chars`)
      } else if (preSplitMegaCount > 0 && USE_INDEX_BASED_EXTRACTION) {
        console.log(`⚠️ ${preSplitMegaCount} mega-clauses detected but skipping force-split in index mode`)
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
    console.log(`Inserting ${extractedClauses.length} clauses into clause_boundaries (index_mode=${USE_INDEX_BASED_EXTRACTION})`)

    try {
      let offsetHits = 0
      let offsetMisses = 0
      let clauseRecords: Array<{
        document_id: string
        tenant_id: string
        content: string
        clause_type: string
        confidence: number
        start_page?: number | null
        end_page?: number | null
        parsing_quality: number
        section_title: string | null
        start_char: number | null
        end_char: number | null
        parsing_issues: Array<{ issue: string; score?: number }>
      }>

      if (USE_INDEX_BASED_EXTRACTION) {
        // Index-based: clauses already have start_index/end_index from validation
        // Content was already derived from slice, so 100% match guaranteed
        clauseRecords = extractedClauses.map((clause) => {
          const hasIndices = typeof clause.start_index === 'number' && typeof clause.end_index === 'number'
          if (hasIndices) {
            offsetHits++
          } else {
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
            start_char: clause.start_index ?? null,  // Use index directly
            end_char: clause.end_index ?? null,      // Use index directly
            parsing_issues: clause.confidence < 0.7
              ? [{ issue: "low_confidence", score: clause.confidence }]
              : [],
          }
        })
      } else {
        // Legacy: Calculate character offsets using monotonic search (findClauseOffset)
        let lastEnd = 0
        clauseRecords = extractedClauses.map((clause) => {
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
      }

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
      const totalClauses = offsetHits + offsetMisses
      const coveragePct = totalClauses > 0 ? ((offsetHits / totalClauses) * 100).toFixed(1) : '0'
      console.log(`📍 Offset mapping: ${offsetHits} hits, ${offsetMisses} misses (${coveragePct}% coverage) [index_mode=${USE_INDEX_BASED_EXTRACTION}]`)

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

      // Update document status to completed and save extracted text
      // CRITICAL: In index mode, persist sanitizedText (same as used for indices)
      const { error: statusUpdateError } = await supabase
        .from("document_repository")
        .update({
          processing_status: "completed",
          extracted_text: textForPersistence, // In index mode: sanitized; in legacy: original
          error_message: null, // Clear any previous errors
        })
        .eq("id", document_id)

      if (statusUpdateError) {
        console.error("Failed to update document status:", statusUpdateError)
        // Don't throw - clauses are already inserted
      } else {
        console.log(`✅ Updated document status to 'completed'`)
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
