/**
 * Unit tests for line-mapper utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  prepareLineNumberedDocument,
  convertLinesToIndices,
  getLineForCharIndex,
  getCharRangeForLine,
  getContentForLineRange,
  findLineStart,
  findLineEnd,
  LineMapper,
  createLineMapper,
  defaultLineMapper,
  RawLineBasedClause,
  LineNumberedDocument,
} from './line-mapper'

// ============================================================================
// TEST DATA
// ============================================================================

const SIMPLE_TEXT = `First line
Second line
Third line`

const MULTI_PARAGRAPH = `Introduction paragraph.

This is the second paragraph.
It has multiple lines.

Final paragraph here.`

const SINGLE_LINE = 'Just one line here'

const EMPTY_LINES = `Line one

Line three
`

// ============================================================================
// prepareLineNumberedDocument TESTS
// ============================================================================

describe('prepareLineNumberedDocument', () => {
  describe('basic line numbering', () => {
    it('should split text into lines and create map', () => {
      const result = prepareLineNumberedDocument(SIMPLE_TEXT)

      expect(result.totalLines).toBe(3)
      expect(result.lineMap.size).toBe(3)
      expect(result.originalText).toBe(SIMPLE_TEXT)
    })

    it('should prefix each line with its number in brackets', () => {
      const result = prepareLineNumberedDocument(SIMPLE_TEXT)

      expect(result.numberedText).toBe(
        '[0] First line\n[1] Second line\n[2] Third line\n'
      )
    })

    it('should handle single line text', () => {
      const result = prepareLineNumberedDocument(SINGLE_LINE)

      expect(result.totalLines).toBe(1)
      expect(result.numberedText).toBe('[0] Just one line here\n')
    })

    it('should handle empty text', () => {
      const result = prepareLineNumberedDocument('')

      expect(result.totalLines).toBe(1)
      expect(result.numberedText).toBe('[0] \n')
      expect(result.lineMap.get(0)?.content).toBe('')
    })

    it('should handle text with empty lines', () => {
      const result = prepareLineNumberedDocument(EMPTY_LINES)

      expect(result.totalLines).toBe(4)
      expect(result.lineMap.get(1)?.content).toBe('')
    })
  })

  describe('character position mapping', () => {
    it('should calculate correct start positions', () => {
      const result = prepareLineNumberedDocument(SIMPLE_TEXT)

      expect(result.lineMap.get(0)?.startChar).toBe(0)
      expect(result.lineMap.get(1)?.startChar).toBe(11) // "First line\n" = 11 chars
      expect(result.lineMap.get(2)?.startChar).toBe(23) // + "Second line\n" = 12 chars
    })

    it('should calculate correct end positions', () => {
      const result = prepareLineNumberedDocument(SIMPLE_TEXT)

      expect(result.lineMap.get(0)?.endChar).toBe(10) // "First line" = 10 chars
      expect(result.lineMap.get(1)?.endChar).toBe(22) // end of "Second line"
      expect(result.lineMap.get(2)?.endChar).toBe(33) // end of "Third line" (10 chars starting at 23)
    })

    it('should store line content correctly', () => {
      const result = prepareLineNumberedDocument(SIMPLE_TEXT)

      expect(result.lineMap.get(0)?.content).toBe('First line')
      expect(result.lineMap.get(1)?.content).toBe('Second line')
      expect(result.lineMap.get(2)?.content).toBe('Third line')
    })

    it('should handle multi-paragraph text', () => {
      const result = prepareLineNumberedDocument(MULTI_PARAGRAPH)

      expect(result.totalLines).toBe(6)
      expect(result.lineMap.get(1)?.content).toBe('') // Empty line
      expect(result.lineMap.get(2)?.content).toBe('This is the second paragraph.')
    })
  })

  describe('round-trip accuracy', () => {
    it('should allow extracting original text using positions', () => {
      const result = prepareLineNumberedDocument(SIMPLE_TEXT)

      const line0 = result.lineMap.get(0)!
      const extracted = result.originalText.slice(line0.startChar, line0.endChar)

      expect(extracted).toBe('First line')
    })

    it('should correctly span multiple lines', () => {
      const result = prepareLineNumberedDocument(SIMPLE_TEXT)

      const line0 = result.lineMap.get(0)!
      const line2 = result.lineMap.get(2)!
      const extracted = result.originalText.slice(line0.startChar, line2.endChar)

      expect(extracted).toBe(SIMPLE_TEXT)
    })
  })
})

// ============================================================================
// convertLinesToIndices TESTS
// ============================================================================

describe('convertLinesToIndices', () => {
  let lineDoc: LineNumberedDocument

  beforeEach(() => {
    lineDoc = prepareLineNumberedDocument(SIMPLE_TEXT)
  })

  describe('valid conversions', () => {
    it('should convert single line clause', () => {
      const lineClauses: RawLineBasedClause[] = [
        {
          start_line: 0,
          end_line: 0,
          clause_type: 'test',
          summary: 'Test summary',
          confidence: 0.9,
          rag_status: 'green',
        },
      ]

      const result = convertLinesToIndices(lineClauses, lineDoc)

      expect(result).toHaveLength(1)
      expect(result[0].start_index).toBe(0)
      expect(result[0].end_index).toBe(10)
      expect(result[0].clause_type).toBe('test')
    })

    it('should convert multi-line clause', () => {
      const lineClauses: RawLineBasedClause[] = [
        {
          start_line: 0,
          end_line: 2,
          clause_type: 'full_doc',
          summary: 'Entire document',
          confidence: 0.95,
          rag_status: 'amber',
        },
      ]

      const result = convertLinesToIndices(lineClauses, lineDoc)

      expect(result).toHaveLength(1)
      expect(result[0].start_index).toBe(0)
      expect(result[0].end_index).toBe(33) // End of third line (text.length)
    })

    it('should convert multiple clauses', () => {
      const lineClauses: RawLineBasedClause[] = [
        {
          start_line: 0,
          end_line: 0,
          clause_type: 'first',
          summary: 'First line',
          confidence: 0.9,
          rag_status: 'green',
        },
        {
          start_line: 2,
          end_line: 2,
          clause_type: 'third',
          summary: 'Third line',
          confidence: 0.85,
          rag_status: 'red',
        },
      ]

      const result = convertLinesToIndices(lineClauses, lineDoc)

      expect(result).toHaveLength(2)
      expect(result[0].start_index).toBe(0)
      expect(result[1].start_index).toBe(23)
    })

    it('should preserve clause metadata', () => {
      const lineClauses: RawLineBasedClause[] = [
        {
          start_line: 1,
          end_line: 1,
          clause_type: 'payment_terms',
          summary: 'Payment clause',
          confidence: 0.92,
          rag_status: 'amber',
          section_title: 'Payment',
        },
      ]

      const result = convertLinesToIndices(lineClauses, lineDoc)

      expect(result[0].clause_type).toBe('payment_terms')
      expect(result[0].summary).toBe('Payment clause')
      expect(result[0].confidence).toBe(0.92)
      expect(result[0].rag_status).toBe('amber')
      expect(result[0].section_title).toBe('Payment')
    })
  })

  describe('boundary handling', () => {
    it('should clamp negative start_line to 0', () => {
      const lineClauses: RawLineBasedClause[] = [
        {
          start_line: -5,
          end_line: 0,
          clause_type: 'test',
          summary: 'Test',
          confidence: 0.9,
          rag_status: 'green',
        },
      ]

      const result = convertLinesToIndices(lineClauses, lineDoc)

      expect(result).toHaveLength(1)
      expect(result[0].start_index).toBe(0)
    })

    it('should clamp end_line to last line', () => {
      const lineClauses: RawLineBasedClause[] = [
        {
          start_line: 0,
          end_line: 100,
          clause_type: 'test',
          summary: 'Test',
          confidence: 0.9,
          rag_status: 'green',
        },
      ]

      const result = convertLinesToIndices(lineClauses, lineDoc)

      expect(result).toHaveLength(1)
      expect(result[0].end_index).toBe(33) // End of last line (text.length)
    })
  })

  describe('invalid clauses', () => {
    it('should skip clause where start > end after clamping', () => {
      const lineClauses: RawLineBasedClause[] = [
        {
          start_line: 5, // Beyond end
          end_line: 1,
          clause_type: 'invalid',
          summary: 'Invalid',
          confidence: 0.5,
          rag_status: 'red',
        },
      ]

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = convertLinesToIndices(lineClauses, lineDoc)

      expect(result).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    it('should handle clause with missing summary gracefully', () => {
      const lineClauses: RawLineBasedClause[] = [
        {
          start_line: 0,
          end_line: 0,
          clause_type: 'test',
          summary: '', // Empty but valid
          confidence: 0.9,
          rag_status: 'green',
        },
      ]

      const result = convertLinesToIndices(lineClauses, lineDoc)

      expect(result).toHaveLength(1)
    })
  })
})

// ============================================================================
// LINE LOOKUP UTILITIES TESTS
// ============================================================================

describe('getLineForCharIndex', () => {
  let lineDoc: LineNumberedDocument

  beforeEach(() => {
    lineDoc = prepareLineNumberedDocument(SIMPLE_TEXT)
  })

  it('should return line 0 for first character', () => {
    expect(getLineForCharIndex(lineDoc, 0)).toBe(0)
  })

  it('should return line 0 for middle of first line', () => {
    expect(getLineForCharIndex(lineDoc, 5)).toBe(0)
  })

  it('should return line 1 for start of second line', () => {
    expect(getLineForCharIndex(lineDoc, 11)).toBe(1)
  })

  it('should return line 2 for last character', () => {
    expect(getLineForCharIndex(lineDoc, 31)).toBe(2)
  })

  it('should return null for index beyond text', () => {
    expect(getLineForCharIndex(lineDoc, 100)).toBe(null)
  })

  it('should return null for negative index', () => {
    expect(getLineForCharIndex(lineDoc, -1)).toBe(null)
  })
})

describe('getCharRangeForLine', () => {
  let lineDoc: LineNumberedDocument

  beforeEach(() => {
    lineDoc = prepareLineNumberedDocument(SIMPLE_TEXT)
  })

  it('should return correct range for first line', () => {
    const range = getCharRangeForLine(lineDoc, 0)

    expect(range).toEqual({ start: 0, end: 10 })
  })

  it('should return correct range for middle line', () => {
    const range = getCharRangeForLine(lineDoc, 1)

    expect(range).toEqual({ start: 11, end: 22 })
  })

  it('should return null for invalid line number', () => {
    expect(getCharRangeForLine(lineDoc, 10)).toBe(null)
    expect(getCharRangeForLine(lineDoc, -1)).toBe(null)
  })
})

describe('getContentForLineRange', () => {
  let lineDoc: LineNumberedDocument

  beforeEach(() => {
    lineDoc = prepareLineNumberedDocument(SIMPLE_TEXT)
  })

  it('should return content for single line', () => {
    const content = getContentForLineRange(lineDoc, 0, 0)

    expect(content).toBe('First line')
  })

  it('should return content spanning multiple lines', () => {
    const content = getContentForLineRange(lineDoc, 0, 1)

    expect(content).toBe('First line\nSecond line')
  })

  it('should return entire text for full range', () => {
    const content = getContentForLineRange(lineDoc, 0, 2)

    expect(content).toBe(SIMPLE_TEXT)
  })

  it('should return null for invalid start line', () => {
    expect(getContentForLineRange(lineDoc, -1, 1)).toBe(null)
  })

  it('should return null for invalid end line', () => {
    expect(getContentForLineRange(lineDoc, 0, 10)).toBe(null)
  })
})

// ============================================================================
// findLineStart and findLineEnd TESTS
// ============================================================================

describe('findLineStart', () => {
  it('should return 0 for index in first line', () => {
    expect(findLineStart(SIMPLE_TEXT, 5)).toBe(0)
  })

  it('should return line start for middle of text', () => {
    expect(findLineStart(SIMPLE_TEXT, 15)).toBe(11) // Middle of "Second line"
  })

  it('should return line start for last line', () => {
    expect(findLineStart(SIMPLE_TEXT, 25)).toBe(23) // "Third line"
  })

  it('should return 0 for index 0', () => {
    expect(findLineStart(SIMPLE_TEXT, 0)).toBe(0)
  })
})

describe('findLineEnd', () => {
  it('should return newline position for first line', () => {
    expect(findLineEnd(SIMPLE_TEXT, 0)).toBe(10)
  })

  it('should return newline position for middle line', () => {
    expect(findLineEnd(SIMPLE_TEXT, 15)).toBe(22)
  })

  it('should return text length for last line', () => {
    expect(findLineEnd(SIMPLE_TEXT, 25)).toBe(33) // text.length = 33
  })

  it('should handle single line text', () => {
    expect(findLineEnd(SINGLE_LINE, 5)).toBe(18)
  })
})

// ============================================================================
// LineMapper CLASS TESTS
// ============================================================================

describe('LineMapper class', () => {
  let mapper: LineMapper

  beforeEach(() => {
    mapper = new LineMapper()
  })

  it('should prepare document correctly', () => {
    const doc = mapper.prepare(SIMPLE_TEXT)

    expect(doc.totalLines).toBe(3)
    expect(doc.lineMap.size).toBe(3)
  })

  it('should convert to indices correctly', () => {
    const doc = mapper.prepare(SIMPLE_TEXT)
    const lineClauses: RawLineBasedClause[] = [
      {
        start_line: 0,
        end_line: 1,
        clause_type: 'test',
        summary: 'Test',
        confidence: 0.9,
        rag_status: 'green',
      },
    ]

    const result = mapper.convertToIndices(lineClauses, doc)

    expect(result).toHaveLength(1)
    expect(result[0].start_index).toBe(0)
    expect(result[0].end_index).toBe(22)
  })

  it('should get line for char correctly', () => {
    const doc = mapper.prepare(SIMPLE_TEXT)

    expect(mapper.getLineForChar(doc, 15)).toBe(1)
  })

  it('should get content correctly', () => {
    const doc = mapper.prepare(SIMPLE_TEXT)

    expect(mapper.getContent(doc, 1, 2)).toBe('Second line\nThird line')
  })
})

// ============================================================================
// FACTORY AND DEFAULT INSTANCE TESTS
// ============================================================================

describe('createLineMapper', () => {
  it('should create a new LineMapper instance', () => {
    const mapper = createLineMapper()

    expect(mapper).toBeInstanceOf(LineMapper)
  })

  it('should create independent instances', () => {
    const mapper1 = createLineMapper()
    const mapper2 = createLineMapper()

    expect(mapper1).not.toBe(mapper2)
  })
})

describe('defaultLineMapper', () => {
  it('should be a LineMapper instance', () => {
    expect(defaultLineMapper).toBeInstanceOf(LineMapper)
  })

  it('should work for basic operations', () => {
    const doc = defaultLineMapper.prepare('Hello\nWorld')

    expect(doc.totalLines).toBe(2)
  })
})

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge cases', () => {
  it('should handle text with only newlines', () => {
    const result = prepareLineNumberedDocument('\n\n\n')

    expect(result.totalLines).toBe(4)
    expect(result.lineMap.get(0)?.content).toBe('')
    expect(result.lineMap.get(1)?.content).toBe('')
  })

  it('should handle text with unicode characters', () => {
    const unicodeText = 'Hello\n世界\nEmoji 👋'
    const result = prepareLineNumberedDocument(unicodeText)

    expect(result.totalLines).toBe(3)
    expect(result.lineMap.get(1)?.content).toBe('世界')
  })

  it('should handle very long lines', () => {
    const longLine = 'a'.repeat(10000)
    const result = prepareLineNumberedDocument(longLine)

    expect(result.totalLines).toBe(1)
    expect(result.lineMap.get(0)?.endChar).toBe(10000)
  })

  it('should handle Windows line endings (CRLF)', () => {
    const crlfText = 'Line 1\r\nLine 2\r\nLine 3'
    const result = prepareLineNumberedDocument(crlfText)

    // Note: split('\n') keeps \r at end of lines
    expect(result.totalLines).toBe(3)
    expect(result.lineMap.get(0)?.content).toBe('Line 1\r')
  })

  it('should handle trailing newline', () => {
    const textWithTrailing = 'Line 1\nLine 2\n'
    const result = prepareLineNumberedDocument(textWithTrailing)

    expect(result.totalLines).toBe(3)
    expect(result.lineMap.get(2)?.content).toBe('')
  })
})
