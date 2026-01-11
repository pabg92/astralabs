/**
 * Line Mapper Utilities
 * Handles line numbering for GPT extraction and conversion back to character indices
 * Ported from supabase/functions/extract-clauses/index.ts
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Line mapping for converting line numbers back to character indices.
 * Each entry maps a line number (0-indexed) to its character range in the original text.
 */
export interface LineMapping {
  /** The line number (0-indexed) */
  lineNumber: number
  /** Start character index (inclusive) */
  startChar: number
  /** End character index (exclusive) */
  endChar: number
  /** The actual line content */
  content: string
}

/**
 * Document prepared for line-based extraction
 */
export interface LineNumberedDocument {
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
 * Raw clause from GPT in line-based mode (before conversion to character indices)
 */
export interface RawLineBasedClause {
  start_line: number
  end_line: number
  clause_type: string
  summary: string
  confidence: number
  rag_status: 'green' | 'amber' | 'red'
  section_title?: string
}

/**
 * Clause with character indices (after conversion from line numbers)
 */
export interface RawIndexedClause {
  start_index: number
  end_index: number
  clause_type: string
  summary: string
  confidence: number
  rag_status: 'green' | 'amber' | 'red'
  section_title?: string
}

// ============================================================================
// LINE NUMBERING
// ============================================================================

/**
 * Prepares a document for line-based extraction by:
 * 1. Splitting into lines
 * 2. Prefixing each line with its number in brackets: [0], [1], etc.
 * 3. Creating a map from line numbers to character positions in the original text
 *
 * This allows GPT to reference lines by number, and we convert back to exact character indices.
 */
export function prepareLineNumberedDocument(text: string): LineNumberedDocument {
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
      content: line,
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
    totalLines: lines.length,
  }
}

// ============================================================================
// LINE TO INDEX CONVERSION
// ============================================================================

/**
 * Converts line-based clauses to index-based clauses using the line map.
 * This gives us exact character positions without GPT having to count characters.
 */
export function convertLinesToIndices(
  lineClauses: RawLineBasedClause[],
  lineDoc: LineNumberedDocument
): RawIndexedClause[] {
  const results: RawIndexedClause[] = []

  for (const clause of lineClauses) {
    const startLine = Math.max(0, clause.start_line)
    const endLine = Math.min(lineDoc.totalLines - 1, clause.end_line)

    // Validate line numbers
    if (startLine > endLine || startLine < 0 || endLine >= lineDoc.totalLines) {
      console.warn(
        `Invalid line range [${clause.start_line}, ${clause.end_line}] for clause: ${clause.summary?.slice(0, 50)}`
      )
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
      section_title: clause.section_title,
    })
  }

  return results
}

// ============================================================================
// LINE LOOKUP UTILITIES
// ============================================================================

/**
 * Gets the line number for a character index
 */
export function getLineForCharIndex(
  lineDoc: LineNumberedDocument,
  charIndex: number
): number | null {
  for (const [lineNumber, mapping] of lineDoc.lineMap) {
    if (charIndex >= mapping.startChar && charIndex < mapping.endChar) {
      return lineNumber
    }
    // Handle position at end of line (before newline)
    if (charIndex === mapping.endChar && lineNumber === lineDoc.totalLines - 1) {
      return lineNumber
    }
  }
  return null
}

/**
 * Gets the character range for a line number
 */
export function getCharRangeForLine(
  lineDoc: LineNumberedDocument,
  lineNumber: number
): { start: number; end: number } | null {
  const mapping = lineDoc.lineMap.get(lineNumber)
  if (!mapping) return null
  return { start: mapping.startChar, end: mapping.endChar }
}

/**
 * Gets content for a range of lines
 */
export function getContentForLineRange(
  lineDoc: LineNumberedDocument,
  startLine: number,
  endLine: number
): string | null {
  const startMapping = lineDoc.lineMap.get(startLine)
  const endMapping = lineDoc.lineMap.get(endLine)

  if (!startMapping || !endMapping) return null

  return lineDoc.originalText.slice(startMapping.startChar, endMapping.endChar)
}

/**
 * Find the start of the current line containing charIndex
 */
export function findLineStart(text: string, index: number): number {
  let pos = index
  while (pos > 0 && text[pos - 1] !== '\n') {
    pos--
  }
  return pos
}

/**
 * Find the end of the current line containing charIndex
 */
export function findLineEnd(text: string, index: number): number {
  let pos = index
  while (pos < text.length && text[pos] !== '\n') {
    pos++
  }
  return pos
}

// ============================================================================
// LINE MAPPER CLASS
// ============================================================================

/**
 * Line Mapper class for dependency injection
 */
export class LineMapper {
  /**
   * Prepares a document for line-based extraction
   */
  prepare(text: string): LineNumberedDocument {
    return prepareLineNumberedDocument(text)
  }

  /**
   * Converts line-based clauses to index-based clauses
   */
  convertToIndices(
    lineClauses: RawLineBasedClause[],
    lineDoc: LineNumberedDocument
  ): RawIndexedClause[] {
    return convertLinesToIndices(lineClauses, lineDoc)
  }

  /**
   * Gets the line number for a character index
   */
  getLineForChar(lineDoc: LineNumberedDocument, charIndex: number): number | null {
    return getLineForCharIndex(lineDoc, charIndex)
  }

  /**
   * Gets content for a range of lines
   */
  getContent(
    lineDoc: LineNumberedDocument,
    startLine: number,
    endLine: number
  ): string | null {
    return getContentForLineRange(lineDoc, startLine, endLine)
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates a new LineMapper instance
 */
export function createLineMapper(): LineMapper {
  return new LineMapper()
}

/**
 * Default line mapper instance
 */
export const defaultLineMapper = new LineMapper()
