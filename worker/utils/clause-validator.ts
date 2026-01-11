/**
 * Clause Validator Utilities
 * Validates and adjusts clause boundaries for proper highlighting
 * Ported from supabase/functions/extract-clauses/index.ts
 */

import type { RawIndexedClause } from './line-mapper'
import {
  MAX_CLAUSE_LENGTH,
  MIN_CLAUSE_LENGTH,
} from '../config/extraction-config'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Validated clause with derived content
 */
export interface ValidatedClause {
  start_index: number
  end_index: number
  content: string
  clause_type: string
  summary: string
  confidence: number
  rag_status: 'green' | 'amber' | 'red'
  section_title?: string
}

/**
 * Telemetry for clause validation process
 */
export interface ValidationTelemetry {
  /** Number of clauses returned by GPT */
  clauses_returned: number
  /** Number of clauses that passed validation */
  clauses_valid: number
  /** Dropped due to out-of-bounds indices */
  dropped_for_bounds: number
  /** Dropped due to overlap with previous clause */
  dropped_for_overlap: number
  /** Dropped due to empty content after trim */
  dropped_for_empty: number
  /** Dropped due to length constraints */
  dropped_for_length: number
  /** Ratio of valid clauses to returned clauses */
  final_coverage_rate: number
}

/**
 * Telemetry for boundary snapping
 */
export interface SnapTelemetry {
  total_snaps: number
  snapped_to_sentence: number
  snapped_to_list: number
  snapped_to_word: number
  no_snap_exceeded_window: number
  second_pass_corrections: number
  snap_distances: number[]
}

/**
 * Result of clause validation
 */
export interface ValidationResult {
  valid: ValidatedClause[]
  telemetry: ValidationTelemetry
  snapTelemetry?: SnapTelemetry
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Characters that typically end sentences */
export const SENTENCE_END_CHARS = new Set(['.', '!', '?', ':', ';'])

/** Characters after which new sentences start */
export const SENTENCE_START_AFTER = new Set(['.', '!', '?', ':', ';', '\n'])

/** Regex for list item markers */
export const LIST_MARKER_REGEX = /\n\s*[\u2022•·*\-]\s*|\n\s*\d+[\.\)]\s*/

// ============================================================================
// WORD BOUNDARY SNAPPING
// ============================================================================

/**
 * Checks if a character is a word character (letter or digit)
 */
export function isWordChar(c: string): boolean {
  return /[a-zA-Z0-9]/.test(c)
}

/**
 * Snap an index to the nearest word boundary.
 * For start indices: snap backwards to find start of word
 * For end indices: snap forwards to find end of word
 */
export function snapToWordBoundary(
  text: string,
  index: number,
  direction: 'start' | 'end',
  maxAdjust: number = 15
): number {
  if (index < 0) return 0
  if (index >= text.length) return text.length

  if (direction === 'start') {
    // For start: if we're in the middle of a word, snap backwards to word start
    if (index > 0 && isWordChar(text[index - 1]) && isWordChar(text[index])) {
      let adjusted = index
      while (adjusted > 0 && adjusted > index - maxAdjust && isWordChar(text[adjusted - 1])) {
        adjusted--
      }
      return adjusted
    }
    return index
  } else {
    // For end: if we're in the middle of a word, snap forwards to word end
    if (index < text.length && isWordChar(text[index])) {
      let adjusted = index
      while (
        adjusted < text.length &&
        adjusted < index + maxAdjust &&
        isWordChar(text[adjusted])
      ) {
        adjusted++
      }
      return adjusted
    }
    return index
  }
}

// ============================================================================
// SENTENCE BOUNDARY DETECTION
// ============================================================================

/**
 * Check if a period is likely a sentence-ending period (not abbreviation/email/url)
 */
export function isSentenceEndPeriod(text: string, periodIndex: number): boolean {
  if (periodIndex <= 0 || periodIndex >= text.length - 1) return true

  const charAfter = text[periodIndex + 1]
  const charBefore = text[periodIndex - 1]

  // If followed by lowercase letter without space, it's likely not sentence end
  if (/[a-z]/.test(charAfter)) return false

  // If preceded by single uppercase letter, likely abbreviation
  if (/^[A-Z]$/.test(charBefore) && (periodIndex < 2 || /\s/.test(text[periodIndex - 2])))
    return false

  // If followed by @ or in email/URL context
  if (charAfter === '@' || charBefore === '@') return false

  // If followed by space then uppercase, very likely sentence end
  if (charAfter === ' ' || charAfter === '\n') return true

  return true
}

/**
 * Find the start of the current/previous sentence
 */
export function findSentenceStart(
  text: string,
  index: number,
  maxLookback: number = 100
): number {
  let pos = index

  // Skip any leading whitespace
  while (pos > 0 && /\s/.test(text[pos - 1])) {
    pos--
  }

  const startPos = pos
  while (pos > 0 && startPos - pos < maxLookback) {
    const prevChar = text[pos - 1]

    // Found sentence-ending punctuation
    if (SENTENCE_START_AFTER.has(prevChar)) {
      if (pos < text.length && /[A-Z"'\(]/.test(text[pos])) {
        return pos
      }
    }

    // Stop at paragraph break
    if (prevChar === '\n' && pos > 1 && text[pos - 2] === '\n') {
      return pos
    }

    pos--
  }

  return index
}

/**
 * Find the end of the current sentence
 */
export function findSentenceEnd(
  text: string,
  index: number,
  maxLookahead: number = 100
): number {
  let pos = index

  while (pos < text.length && pos - index < maxLookahead) {
    const char = text[pos]

    if (SENTENCE_END_CHARS.has(char)) {
      return pos + 1
    }

    // Stop at paragraph break
    if (char === '\n' && pos + 1 < text.length && text[pos + 1] === '\n') {
      return pos
    }

    pos++
  }

  return index
}

// ============================================================================
// LIST ITEM DETECTION
// ============================================================================

/**
 * Find the start of a list item looking backwards
 */
export function findListItemStart(
  text: string,
  index: number,
  maxLookback: number
): number {
  const searchStart = Math.max(0, index - maxLookback)
  const searchText = text.slice(searchStart, index)

  let lastBulletPos = -1
  let lastNumberedPos = -1

  // Find bullet markers
  for (const match of searchText.matchAll(/\n\s*[\u2022•·*\-]\s*/g)) {
    lastBulletPos = searchStart + match.index! + match[0].length
  }

  // Find numbered markers
  for (const match of searchText.matchAll(/\n\s*\d+[\.\)]\s*/g)) {
    lastNumberedPos = searchStart + match.index! + match[0].length
  }

  const listStart = Math.max(lastBulletPos, lastNumberedPos)
  return listStart > 0 && index - listStart <= maxLookback ? listStart : -1
}

// ============================================================================
// HEADER DETECTION
// ============================================================================

/**
 * Check if a line looks like a section header
 */
export function isLikelyHeader(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < 3 || trimmed.length > 80) return false

  // ALL CAPS
  if (/^[A-Z][A-Z\s\d\.\-:]+$/.test(trimmed) && trimmed.length < 50) return true

  // Numbered sections
  if (/^[\dIVX]+[\.\)]\s+[A-Z]/.test(trimmed)) return true

  // Ends with colon only
  if (/^[a-zA-Z\s\d\.\-]+:\s*$/.test(trimmed) && trimmed.length < 40) return true

  return false
}

/**
 * Find the end of the current line
 */
export function findLineEnd(text: string, index: number): number {
  let pos = index
  while (pos < text.length && text[pos] !== '\n') {
    pos++
  }
  return pos
}

/**
 * Trim leading headers from clause start
 */
export function trimLeadingHeaders(
  text: string,
  startIndex: number,
  endIndex: number,
  minClauseLength: number = MIN_CLAUSE_LENGTH
): number {
  let pos = startIndex

  // Skip leading whitespace
  while (pos < endIndex && /\s/.test(text[pos])) {
    pos++
  }

  const lineStart = pos
  const lineEnd = findLineEnd(text, pos)
  const line = text.slice(lineStart, lineEnd)

  if (isLikelyHeader(line)) {
    pos = lineEnd
    while (pos < endIndex && /\s/.test(text[pos])) {
      pos++
    }

    if (pos < endIndex && endIndex - pos >= minClauseLength) {
      return pos
    }
  }

  return startIndex
}

/**
 * Trim trailing incomplete content
 */
export function trimTrailingContent(
  text: string,
  startIndex: number,
  endIndex: number,
  minClauseLength: number = MIN_CLAUSE_LENGTH
): number {
  let pos = endIndex

  while (pos > startIndex && /\s/.test(text[pos - 1])) {
    pos--
  }

  if (pos - startIndex >= minClauseLength) {
    return pos
  }

  return endIndex
}

// ============================================================================
// SENTENCE BOUNDARY SNAPPING
// ============================================================================

/**
 * Check if position starts mid-sentence
 */
export function isMidSentenceStart(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return false
  const currentChar = text[index]
  const prevChar = text[index - 1]
  return /[a-z]/.test(currentChar) && /[a-zA-Z0-9]/.test(prevChar)
}

/**
 * Snap an index to sentence/list boundaries
 */
export function snapToSentenceBoundary(
  text: string,
  index: number,
  direction: 'start' | 'end',
  baseMaxAdjust: number = 80,
  clauseLength?: number,
  telemetry?: SnapTelemetry
): number {
  if (index < 0) return 0
  if (index >= text.length) return text.length

  if (telemetry) telemetry.total_snaps++

  if (direction === 'start') {
    let maxAdjust = baseMaxAdjust

    // Adaptive window for mid-sentence starts
    const needsExtendedSearch =
      index > 0 &&
      index < text.length &&
      /[a-z]/.test(text[index]) &&
      /[a-zA-Z0-9]/.test(text[index - 1])

    if (needsExtendedSearch && clauseLength) {
      maxAdjust = Math.min(150, Math.max(baseMaxAdjust, Math.floor(clauseLength * 0.5)))
    }

    // Try list item boundary first
    const listStart = findListItemStart(text, index, maxAdjust)
    if (listStart > 0 && index - listStart <= maxAdjust) {
      if (telemetry) {
        telemetry.snapped_to_list++
        telemetry.snap_distances.push(index - listStart)
      }
      return listStart
    }

    // Try sentence start
    const sentenceStart = findSentenceStart(text, index, maxAdjust)
    if (sentenceStart < index && index - sentenceStart <= maxAdjust) {
      if (telemetry) {
        telemetry.snapped_to_sentence++
        telemetry.snap_distances.push(index - sentenceStart)
      }
      return sentenceStart
    }

    // Fall back to word boundary
    const wordStart = snapToWordBoundary(text, index, 'start', 15)

    // Second-pass check
    if (isMidSentenceStart(text, wordStart) && clauseLength) {
      const extendedMax = Math.min(200, clauseLength)

      const extendedListStart = findListItemStart(text, wordStart, extendedMax)
      if (extendedListStart > 0 && wordStart - extendedListStart <= extendedMax) {
        if (telemetry) {
          telemetry.second_pass_corrections++
          telemetry.snapped_to_list++
          telemetry.snap_distances.push(wordStart - extendedListStart)
        }
        return extendedListStart
      }

      const extendedSentenceStart = findSentenceStart(text, wordStart, extendedMax)
      if (extendedSentenceStart < wordStart && wordStart - extendedSentenceStart <= extendedMax) {
        if (telemetry) {
          telemetry.second_pass_corrections++
          telemetry.snapped_to_sentence++
          telemetry.snap_distances.push(wordStart - extendedSentenceStart)
        }
        return extendedSentenceStart
      }

      if (telemetry) telemetry.no_snap_exceeded_window++
    }

    if (telemetry) {
      telemetry.snapped_to_word++
      if (wordStart !== index) {
        telemetry.snap_distances.push(index - wordStart)
      }
    }
    return wordStart
  } else {
    // End snapping
    const sentenceEnd = findSentenceEnd(text, index, baseMaxAdjust)

    if (sentenceEnd > index && sentenceEnd - index <= baseMaxAdjust) {
      if (telemetry) {
        telemetry.snapped_to_sentence++
        telemetry.snap_distances.push(sentenceEnd - index)
      }
      return sentenceEnd
    }

    const wordEnd = snapToWordBoundary(text, index, 'end', 15)
    if (telemetry) {
      telemetry.snapped_to_word++
      if (wordEnd !== index) {
        telemetry.snap_distances.push(wordEnd - index)
      }
    }
    return wordEnd
  }
}

// ============================================================================
// FORCED BOUNDARY CORRECTION
// ============================================================================

/**
 * Aggressively force expansion to valid boundaries
 */
export function forceValidBoundaries(
  text: string,
  start: number,
  end: number,
  maxExpand: number = 300
): { start: number; end: number } {
  let newStart = start
  let newEnd = end

  // Force start to valid boundary
  while (newStart > 0 && newStart > start - maxExpand) {
    const prevChar = text[newStart - 1]

    if (prevChar === '\n') break
    if (prevChar === ':' || prevChar === ';' || prevChar === '!' || prevChar === '?') break
    if (prevChar === '.' && isSentenceEndPeriod(text, newStart - 1)) break

    // Stop at bullet marker
    if (
      /[•·*\-]/.test(prevChar) &&
      (newStart < 2 || text[newStart - 2] === '\n' || /\s/.test(text[newStart - 2]))
    ) {
      break
    }

    newStart--
  }

  // Skip whitespace after boundary
  while (newStart < end && /\s/.test(text[newStart])) {
    newStart++
  }

  // Force end to valid boundary
  while (newEnd < text.length && newEnd < end + maxExpand) {
    const lastChar = text[newEnd - 1]

    if (lastChar === '\n') break
    if (lastChar === ':' || lastChar === ';' || lastChar === '!' || lastChar === '?') break
    if (lastChar === '.' && isSentenceEndPeriod(text, newEnd - 1)) break

    newEnd++
  }

  return { start: newStart, end: newEnd }
}

// ============================================================================
// CLAUSE VALIDATION
// ============================================================================

/**
 * Creates empty validation telemetry
 */
export function createValidationTelemetry(): ValidationTelemetry {
  return {
    clauses_returned: 0,
    clauses_valid: 0,
    dropped_for_bounds: 0,
    dropped_for_overlap: 0,
    dropped_for_empty: 0,
    dropped_for_length: 0,
    final_coverage_rate: 0,
  }
}

/**
 * Creates empty snap telemetry
 */
export function createSnapTelemetry(): SnapTelemetry {
  return {
    total_snaps: 0,
    snapped_to_sentence: 0,
    snapped_to_list: 0,
    snapped_to_word: 0,
    no_snap_exceeded_window: 0,
    second_pass_corrections: 0,
    snap_distances: [],
  }
}

/**
 * Configuration for clause validation
 */
export interface ValidationConfig {
  minClauseLength?: number
  maxClauseLength?: number
  snapBaseMaxAdjust?: number
  forceMaxExpand?: number
  chunkStart?: number
  enableSnapping?: boolean
  enableForcing?: boolean
}

const DEFAULT_VALIDATION_CONFIG: Required<ValidationConfig> = {
  minClauseLength: MIN_CLAUSE_LENGTH,
  maxClauseLength: MAX_CLAUSE_LENGTH,
  snapBaseMaxAdjust: 80,
  forceMaxExpand: 300,
  chunkStart: 0,
  enableSnapping: true,
  enableForcing: true,
}

/**
 * Validates and deduplicates indexed clauses from GPT.
 * Enforces: bounds, min/max length, non-empty slice, non-overlapping ranges.
 */
export function validateClauseIndices(
  rawClauses: RawIndexedClause[],
  fullText: string,
  config: ValidationConfig = {}
): ValidationResult {
  const cfg = { ...DEFAULT_VALIDATION_CONFIG, ...config }
  const textLength = fullText.length

  const telemetry = createValidationTelemetry()
  telemetry.clauses_returned = rawClauses.length

  const snapTelemetry = createSnapTelemetry()

  if (rawClauses.length === 0) {
    return { valid: [], telemetry, snapTelemetry }
  }

  type InternalClause = ValidatedClause & { _globalStart: number; _globalEnd: number }
  const withContent: InternalClause[] = []

  for (const raw of rawClauses) {
    // Convert local indices to global (for chunked extraction)
    let globalStart = cfg.chunkStart + raw.start_index
    let globalEnd = cfg.chunkStart + raw.end_index

    // Bounds check
    if (globalStart < 0 || globalEnd > textLength || globalStart >= globalEnd) {
      telemetry.dropped_for_bounds++
      continue
    }

    const rawClauseLength = globalEnd - globalStart

    // Snap to sentence boundaries
    if (cfg.enableSnapping) {
      globalStart = snapToSentenceBoundary(
        fullText,
        globalStart,
        'start',
        cfg.snapBaseMaxAdjust,
        rawClauseLength,
        snapTelemetry
      )
      globalEnd = snapToSentenceBoundary(
        fullText,
        globalEnd,
        'end',
        cfg.snapBaseMaxAdjust,
        rawClauseLength,
        snapTelemetry
      )
    }

    // Force valid boundaries
    if (cfg.enableForcing) {
      const forced = forceValidBoundaries(fullText, globalStart, globalEnd, cfg.forceMaxExpand)
      globalStart = forced.start
      globalEnd = forced.end
    }

    // Trim headers and trailing content
    globalStart = trimLeadingHeaders(fullText, globalStart, globalEnd, cfg.minClauseLength)
    globalEnd = trimTrailingContent(fullText, globalStart, globalEnd, cfg.minClauseLength)

    // Re-validate bounds
    if (globalStart < 0 || globalEnd > textLength || globalStart >= globalEnd) {
      telemetry.dropped_for_bounds++
      continue
    }

    // Length check
    const length = globalEnd - globalStart
    if (length <= cfg.minClauseLength) {
      telemetry.dropped_for_length++
      continue
    }
    // Allow up to 2x max due to aggressive boundary expansion
    if (length > cfg.maxClauseLength * 2) {
      telemetry.dropped_for_length++
      continue
    }

    // Derive content
    const content = fullText.slice(globalStart, globalEnd)

    if (!content.trim() || content.trim().length <= cfg.minClauseLength) {
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
      _globalEnd: globalEnd,
    })
  }

  // Sort by position and remove overlaps
  withContent.sort((a, b) => {
    if (a._globalStart !== b._globalStart) return a._globalStart - b._globalStart
    return a._globalEnd - b._globalEnd
  })

  const valid: ValidatedClause[] = []
  let lastEnd = -1

  for (const clause of withContent) {
    // Allow touching, reject true overlaps
    if (clause._globalStart < lastEnd) {
      telemetry.dropped_for_overlap++
      continue
    }

    const { _globalStart, _globalEnd, ...cleaned } = clause
    valid.push(cleaned)
    lastEnd = clause._globalEnd
  }

  telemetry.clauses_valid = valid.length
  telemetry.final_coverage_rate =
    rawClauses.length > 0 ? valid.length / rawClauses.length : 0

  return { valid, telemetry, snapTelemetry }
}

// ============================================================================
// RAG STATUS VALIDATION
// ============================================================================

/**
 * Validates and normalizes RAG status
 */
export function validateRagStatus(status: unknown): 'green' | 'amber' | 'red' {
  const normalized = String(status || 'amber').toLowerCase()
  if (normalized === 'green' || normalized === 'amber' || normalized === 'red') {
    return normalized
  }
  return 'amber'
}

// ============================================================================
// CLAUSE VALIDATOR CLASS
// ============================================================================

/**
 * Clause Validator class for dependency injection
 */
export class ClauseValidator {
  private config: Required<ValidationConfig>

  constructor(config: ValidationConfig = {}) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config }
  }

  /**
   * Validates clauses
   */
  validate(rawClauses: RawIndexedClause[], fullText: string): ValidationResult {
    return validateClauseIndices(rawClauses, fullText, this.config)
  }

  /**
   * Snaps index to word boundary
   */
  snapToWord(
    text: string,
    index: number,
    direction: 'start' | 'end'
  ): number {
    return snapToWordBoundary(text, index, direction)
  }

  /**
   * Snaps index to sentence boundary
   */
  snapToSentence(
    text: string,
    index: number,
    direction: 'start' | 'end'
  ): number {
    return snapToSentenceBoundary(text, index, direction, this.config.snapBaseMaxAdjust)
  }

  /**
   * Checks if a line is a header
   */
  isHeader(line: string): boolean {
    return isLikelyHeader(line)
  }

  /**
   * Validates RAG status
   */
  validateRag(status: unknown): 'green' | 'amber' | 'red' {
    return validateRagStatus(status)
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates a new ClauseValidator instance
 */
export function createClauseValidator(config: ValidationConfig = {}): ClauseValidator {
  return new ClauseValidator(config)
}

/**
 * Default clause validator instance
 */
export const defaultClauseValidator = new ClauseValidator()
