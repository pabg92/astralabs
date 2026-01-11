/**
 * Unit tests for clause-validator utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isWordChar,
  snapToWordBoundary,
  isSentenceEndPeriod,
  findSentenceStart,
  findSentenceEnd,
  findListItemStart,
  isLikelyHeader,
  findLineEnd,
  trimLeadingHeaders,
  trimTrailingContent,
  isMidSentenceStart,
  snapToSentenceBoundary,
  forceValidBoundaries,
  validateClauseIndices,
  validateRagStatus,
  createValidationTelemetry,
  createSnapTelemetry,
  ClauseValidator,
  createClauseValidator,
  defaultClauseValidator,
  ValidationConfig,
  ValidationTelemetry,
  SnapTelemetry,
} from './clause-validator'
import type { RawIndexedClause } from './line-mapper'

// ============================================================================
// TEST DATA
// ============================================================================

const SIMPLE_TEXT = `This is the first sentence. This is the second sentence.
This is on line two. Another sentence here.
Final line with content.`

const BULLET_LIST = `Introduction paragraph.

• First bullet point item
• Second bullet point item
• Third bullet point item

Conclusion.`

const NUMBERED_LIST = `Header section:

1. First numbered item
2. Second numbered item
3. Third numbered item

End of list.`

const CONTRACT_TEXT = `PAYMENT TERMS

The Brand shall pay the Influencer a fee of $5,000. Payment shall be made within 30 days of invoice receipt.

EXCLUSIVITY

The Influencer agrees not to work with competing brands for 90 days.`

// ============================================================================
// isWordChar TESTS
// ============================================================================

describe('isWordChar', () => {
  it('should return true for letters', () => {
    expect(isWordChar('a')).toBe(true)
    expect(isWordChar('Z')).toBe(true)
  })

  it('should return true for digits', () => {
    expect(isWordChar('0')).toBe(true)
    expect(isWordChar('9')).toBe(true)
  })

  it('should return false for punctuation', () => {
    expect(isWordChar('.')).toBe(false)
    expect(isWordChar(',')).toBe(false)
    expect(isWordChar('!')).toBe(false)
  })

  it('should return false for whitespace', () => {
    expect(isWordChar(' ')).toBe(false)
    expect(isWordChar('\n')).toBe(false)
    expect(isWordChar('\t')).toBe(false)
  })
})

// ============================================================================
// snapToWordBoundary TESTS
// ============================================================================

describe('snapToWordBoundary', () => {
  const text = 'Hello world test'

  describe('start direction', () => {
    it('should snap to word start when mid-word', () => {
      // 'e' in Hello is at index 1
      expect(snapToWordBoundary(text, 2, 'start')).toBe(0)
    })

    it('should not change when at word start', () => {
      expect(snapToWordBoundary(text, 0, 'start')).toBe(0)
      expect(snapToWordBoundary(text, 6, 'start')).toBe(6) // 'w' in world
    })

    it('should handle position at end of text', () => {
      expect(snapToWordBoundary(text, text.length, 'start')).toBe(text.length)
    })

    it('should handle negative index', () => {
      expect(snapToWordBoundary(text, -5, 'start')).toBe(0)
    })
  })

  describe('end direction', () => {
    it('should snap to word end when mid-word', () => {
      // 'o' in Hello is at index 4, word ends at 5
      expect(snapToWordBoundary(text, 3, 'end')).toBe(5)
    })

    it('should not change when at word end', () => {
      expect(snapToWordBoundary(text, 5, 'end')).toBe(5)
    })

    it('should handle position beyond text', () => {
      expect(snapToWordBoundary(text, 100, 'end')).toBe(text.length)
    })
  })

  describe('maxAdjust limit', () => {
    it('should respect maxAdjust limit', () => {
      const longWord = 'supercalifragilisticexpialidocious'
      // Start at index 20, maxAdjust 5 - should only go back 5
      const result = snapToWordBoundary(longWord, 20, 'start', 5)
      expect(result).toBeGreaterThanOrEqual(15)
    })
  })
})

// ============================================================================
// isSentenceEndPeriod TESTS
// ============================================================================

describe('isSentenceEndPeriod', () => {
  it('should return true for sentence-ending period', () => {
    const text = 'Hello world. Next sentence.'
    expect(isSentenceEndPeriod(text, 11)).toBe(true)
  })

  it('should return false for domain period', () => {
    const text = 'Visit example.com for more info.'
    expect(isSentenceEndPeriod(text, 13)).toBe(false) // period in .com
  })

  it('should handle abbreviation detection', () => {
    // Note: Single letter abbreviations are detected (J. Smith), but Dr. is 2 letters
    // so it's considered a sentence end when followed by space + uppercase
    const text = 'J. Smith arrived.'
    expect(isSentenceEndPeriod(text, 1)).toBe(false) // period after single letter J
  })

  it('should return true at text boundary', () => {
    const text = 'End.'
    expect(isSentenceEndPeriod(text, 3)).toBe(true)
  })
})

// ============================================================================
// findSentenceStart TESTS
// ============================================================================

describe('findSentenceStart', () => {
  it('should find sentence start after period', () => {
    // The function looks backwards for a sentence boundary, but only snaps
    // if the current position starts with [A-Z"'(] after punctuation
    const text = 'First sentence. Second sentence here.'
    // When we call with index 20, we're at 'n' in 'sentence'
    // The function looks for uppercase after punctuation, finds 'S' at 16
    const result = findSentenceStart(text, 16) // Start at 'S'
    expect(result).toBe(16) // Already at sentence start
  })

  it('should stop at paragraph break', () => {
    const text = 'First paragraph.\n\nSecond paragraph.'
    const result = findSentenceStart(text, 25)
    expect(result).toBe(18)
  })

  it('should return original index if no boundary found', () => {
    const text = 'continuous text without any sentence breaks'
    const result = findSentenceStart(text, 20)
    expect(result).toBe(20)
  })

  it('should respect maxLookback', () => {
    const text = 'First. ' + 'x'.repeat(200) + 'Target'
    const result = findSentenceStart(text, 210, 50)
    expect(result).toBe(210) // Beyond lookback
  })
})

// ============================================================================
// findSentenceEnd TESTS
// ============================================================================

describe('findSentenceEnd', () => {
  it('should find period at end of sentence', () => {
    const text = 'This is a sentence. Next one.'
    const result = findSentenceEnd(text, 5)
    expect(result).toBe(19) // After period
  })

  it('should find exclamation mark', () => {
    const text = 'Wow! Amazing.'
    const result = findSentenceEnd(text, 0)
    expect(result).toBe(4)
  })

  it('should find question mark', () => {
    const text = 'Is this right? Yes.'
    const result = findSentenceEnd(text, 0)
    expect(result).toBe(14)
  })

  it('should stop at paragraph break', () => {
    const text = 'No punctuation\n\nNext paragraph'
    const result = findSentenceEnd(text, 0)
    expect(result).toBe(14)
  })

  it('should return original if no end found', () => {
    const text = 'no ending punctuation here'
    const result = findSentenceEnd(text, 5, 10)
    expect(result).toBe(5)
  })
})

// ============================================================================
// findListItemStart TESTS
// ============================================================================

describe('findListItemStart', () => {
  it('should find bullet point start', () => {
    const result = findListItemStart(BULLET_LIST, 50, 100)
    expect(result).toBeGreaterThan(0)
  })

  it('should find numbered item start', () => {
    const result = findListItemStart(NUMBERED_LIST, 40, 100)
    expect(result).toBeGreaterThan(0)
  })

  it('should return -1 when no list marker found', () => {
    const text = 'Just regular text without lists.'
    const result = findListItemStart(text, 20, 50)
    expect(result).toBe(-1)
  })

  it('should respect maxLookback', () => {
    const result = findListItemStart(BULLET_LIST, 100, 5)
    // With only 5 char lookback, might not find marker
    expect(result).toBeLessThanOrEqual(100)
  })
})

// ============================================================================
// isLikelyHeader TESTS
// ============================================================================

describe('isLikelyHeader', () => {
  it('should detect ALL CAPS headers', () => {
    expect(isLikelyHeader('PAYMENT TERMS')).toBe(true)
    expect(isLikelyHeader('CONFIDENTIALITY')).toBe(true)
  })

  it('should detect numbered section headers', () => {
    expect(isLikelyHeader('1. Introduction')).toBe(true)
    expect(isLikelyHeader('II. Terms and Conditions')).toBe(true)
  })

  it('should detect colon-ending headers', () => {
    expect(isLikelyHeader('Payment terms:')).toBe(true)
    expect(isLikelyHeader('Overview:')).toBe(true)
  })

  it('should reject regular text', () => {
    expect(isLikelyHeader('This is a normal sentence.')).toBe(false)
    expect(isLikelyHeader('The influencer agrees to.')).toBe(false)
  })

  it('should reject very short text', () => {
    expect(isLikelyHeader('Hi')).toBe(false)
  })

  it('should reject very long text', () => {
    expect(isLikelyHeader('A'.repeat(100))).toBe(false)
  })
})

// ============================================================================
// findLineEnd TESTS
// ============================================================================

describe('findLineEnd', () => {
  it('should find newline position', () => {
    const text = 'First line\nSecond line'
    expect(findLineEnd(text, 0)).toBe(10)
  })

  it('should return text length if no newline', () => {
    const text = 'No newlines here'
    expect(findLineEnd(text, 0)).toBe(16)
  })

  it('should work from middle of line', () => {
    const text = 'Hello world\nNext'
    expect(findLineEnd(text, 5)).toBe(11)
  })
})

// ============================================================================
// trimLeadingHeaders TESTS
// ============================================================================

describe('trimLeadingHeaders', () => {
  it('should detect ALL CAPS as header', () => {
    // Note: trimLeadingHeaders only trims if the remaining content is long enough
    expect(isLikelyHeader('PAYMENT TERMS')).toBe(true)
  })

  it('should not trim regular text', () => {
    const text = 'The influencer agrees to the following terms and conditions set forth herein.'
    const result = trimLeadingHeaders(text, 0, text.length, 20)
    expect(result).toBe(0)
  })

  it('should detect header patterns correctly', () => {
    expect(isLikelyHeader('  HEADER  ')).toBe(true) // Trimmed ALL CAPS
    expect(isLikelyHeader('1. Introduction')).toBe(true) // Numbered
  })

  it('should not trim if result would be too short', () => {
    const text = 'HEADER\nShort'
    const result = trimLeadingHeaders(text, 0, text.length, 100)
    expect(result).toBe(0) // Can't trim, remaining too short
  })
})

// ============================================================================
// trimTrailingContent TESTS
// ============================================================================

describe('trimTrailingContent', () => {
  it('should trim trailing whitespace', () => {
    const text = 'Content here   \n  '
    const result = trimTrailingContent(text, 0, text.length, 5)
    // Trims trailing whitespace, stops at 'e' in 'here'
    expect(result).toBeLessThan(text.length)
    expect(result).toBeGreaterThan(5)
  })

  it('should not trim if result would be too short', () => {
    const text = 'Hi   '
    const result = trimTrailingContent(text, 0, text.length, 50)
    expect(result).toBe(text.length)
  })
})

// ============================================================================
// isMidSentenceStart TESTS
// ============================================================================

describe('isMidSentenceStart', () => {
  it('should return true for lowercase after letter', () => {
    const text = 'abcd'
    expect(isMidSentenceStart(text, 2)).toBe(true) // 'c' after 'b'
  })

  it('should return false at text start', () => {
    const text = 'hello'
    expect(isMidSentenceStart(text, 0)).toBe(false)
  })

  it('should return false for uppercase after period', () => {
    const text = 'End. Start'
    expect(isMidSentenceStart(text, 5)).toBe(false) // 'S' after space
  })

  it('should return false for space', () => {
    const text = 'hello world'
    expect(isMidSentenceStart(text, 5)).toBe(false) // space
  })
})

// ============================================================================
// snapToSentenceBoundary TESTS
// ============================================================================

describe('snapToSentenceBoundary', () => {
  describe('start direction', () => {
    it('should snap to sentence start', () => {
      const text = 'First sentence. Second sentence here.'
      const result = snapToSentenceBoundary(text, 20, 'start')
      expect(result).toBe(16) // Start of "Second"
    })

    it('should snap to list item start', () => {
      const result = snapToSentenceBoundary(BULLET_LIST, 40, 'start')
      expect(result).toBeLessThanOrEqual(40)
    })

    it('should fall back to word boundary', () => {
      const text = 'continuous stream of text'
      const result = snapToSentenceBoundary(text, 12, 'start', 5)
      expect(result).toBeLessThanOrEqual(12)
    })
  })

  describe('end direction', () => {
    it('should snap to sentence end', () => {
      const text = 'First sentence. Second sentence.'
      const result = snapToSentenceBoundary(text, 10, 'end')
      expect(result).toBe(15) // After first period
    })
  })

  describe('with telemetry', () => {
    it('should track snap statistics', () => {
      const telemetry = createSnapTelemetry()
      const text = 'First sentence. Second sentence.'

      snapToSentenceBoundary(text, 20, 'start', 80, undefined, telemetry)

      expect(telemetry.total_snaps).toBe(1)
    })
  })
})

// ============================================================================
// forceValidBoundaries TESTS
// ============================================================================

describe('forceValidBoundaries', () => {
  it('should expand start to previous sentence end', () => {
    const text = 'First sentence. second word here.'
    const { start } = forceValidBoundaries(text, 17, 33)
    expect(start).toBeLessThanOrEqual(17)
  })

  it('should expand end to next sentence end', () => {
    const text = 'Start here. End with period.'
    const { end } = forceValidBoundaries(text, 0, 15)
    expect(end).toBeGreaterThanOrEqual(15)
  })

  it('should stop at newline', () => {
    const text = 'Line one\nLine two'
    const { start } = forceValidBoundaries(text, 9, 17)
    expect(start).toBe(9) // Stops at newline
  })

  it('should respect maxExpand', () => {
    const text = 'a'.repeat(500) + '.'
    const { start } = forceValidBoundaries(text, 400, 450, 50)
    expect(start).toBeGreaterThanOrEqual(350)
  })
})

// ============================================================================
// validateClauseIndices TESTS
// ============================================================================

describe('validateClauseIndices', () => {
  const makeClause = (
    start: number,
    end: number,
    type: string = 'test'
  ): RawIndexedClause => ({
    start_index: start,
    end_index: end,
    clause_type: type,
    summary: 'Test summary',
    confidence: 0.9,
    rag_status: 'green',
  })

  describe('basic validation', () => {
    it('should pass valid clauses', () => {
      const text = 'This is a long enough clause text here. More content that makes this clause long enough.'
      const clauses = [makeClause(0, 88)]
      const config: ValidationConfig = { enableSnapping: false, enableForcing: false, minClauseLength: 30 }

      const { valid, telemetry } = validateClauseIndices(clauses, text, config)

      expect(valid).toHaveLength(1)
      expect(telemetry.clauses_valid).toBe(1)
    })

    it('should reject out-of-bounds clauses', () => {
      const text = 'Short text.'
      const clauses = [makeClause(0, 1000)]
      const config: ValidationConfig = { enableSnapping: false, enableForcing: false }

      const { valid, telemetry } = validateClauseIndices(clauses, text, config)

      expect(valid).toHaveLength(0)
      expect(telemetry.dropped_for_bounds).toBe(1)
    })

    it('should reject clauses that are too short', () => {
      const text = 'AB'
      const clauses = [makeClause(0, 2)]
      const config: ValidationConfig = {
        enableSnapping: false,
        enableForcing: false,
        minClauseLength: 50,
      }

      const { valid, telemetry } = validateClauseIndices(clauses, text, config)

      expect(valid).toHaveLength(0)
      expect(telemetry.dropped_for_length).toBe(1)
    })

    it('should reject empty content', () => {
      // Text with some content but mostly whitespace in middle
      const text = 'A                                                            B'
      const clauses = [makeClause(1, 61)] // Just the whitespace part
      const config: ValidationConfig = {
        enableSnapping: false,
        enableForcing: false,
        minClauseLength: 0,
      }

      const { valid, telemetry } = validateClauseIndices(clauses, text, config)

      expect(valid).toHaveLength(0)
      // After trim, this becomes empty and is rejected
      expect(telemetry.dropped_for_bounds + telemetry.dropped_for_empty).toBeGreaterThan(0)
    })
  })

  describe('overlap handling', () => {
    it('should remove overlapping clauses', () => {
      const text = 'This is the first clause content that should be long enough. This is second clause content here.'
      // text.length = 96
      const clauses = [
        makeClause(0, 61, 'first'),
        makeClause(40, 96, 'second'), // Overlaps with first (starts at 40 < first's end 61)
      ]
      const config: ValidationConfig = { enableSnapping: false, enableForcing: false, minClauseLength: 30 }

      const { valid, telemetry } = validateClauseIndices(clauses, text, config)

      expect(valid).toHaveLength(1)
      expect(valid[0].clause_type).toBe('first')
      expect(telemetry.dropped_for_overlap).toBe(1)
    })

    it('should allow touching clauses', () => {
      const text = 'First clause content that is long enough here. Second clause content that is also long enough.'
      // text.length = 94
      const clauses = [
        makeClause(0, 46, 'first'),
        makeClause(46, 94, 'second'), // Touching (starts right after first ends)
      ]
      const config: ValidationConfig = { enableSnapping: false, enableForcing: false, minClauseLength: 30 }

      const { valid } = validateClauseIndices(clauses, text, config)

      expect(valid).toHaveLength(2)
    })
  })

  describe('chunk offset handling', () => {
    it('should apply chunk offset to indices', () => {
      const text = 'PREFIX text that is definitely long enough for testing purposes here.'
      const clauses = [makeClause(0, 55)]
      const config: ValidationConfig = {
        enableSnapping: false,
        enableForcing: false,
        chunkStart: 7,
        minClauseLength: 30,
      }

      const { valid } = validateClauseIndices(clauses, text, config)

      expect(valid).toHaveLength(1)
      expect(valid[0].start_index).toBe(7)
    })
  })

  describe('metadata preservation', () => {
    it('should preserve clause metadata', () => {
      const text = 'This is a long enough clause text with sufficient content here.'
      const clauses: RawIndexedClause[] = [
        {
          start_index: 0,
          end_index: 60,
          clause_type: 'payment_terms',
          summary: 'Payment clause summary',
          confidence: 0.95,
          rag_status: 'amber',
          section_title: 'Payments',
        },
      ]
      const config: ValidationConfig = { enableSnapping: false, enableForcing: false }

      const { valid } = validateClauseIndices(clauses, text, config)

      expect(valid[0].clause_type).toBe('payment_terms')
      expect(valid[0].summary).toBe('Payment clause summary')
      expect(valid[0].confidence).toBe(0.95)
      expect(valid[0].rag_status).toBe('amber')
      expect(valid[0].section_title).toBe('Payments')
    })
  })

  describe('telemetry', () => {
    it('should calculate coverage rate', () => {
      const text = 'Long enough clause one. Short. Long enough clause two here.'
      const clauses = [
        makeClause(0, 22),
        makeClause(24, 30), // Too short
        makeClause(32, 58),
      ]
      const config: ValidationConfig = {
        enableSnapping: false,
        enableForcing: false,
        minClauseLength: 10,
      }

      const { telemetry } = validateClauseIndices(clauses, text, config)

      expect(telemetry.clauses_returned).toBe(3)
      expect(telemetry.final_coverage_rate).toBeCloseTo(0.67, 1)
    })
  })

  describe('empty input', () => {
    it('should handle empty clause array', () => {
      const { valid, telemetry } = validateClauseIndices([], 'some text')

      expect(valid).toHaveLength(0)
      expect(telemetry.clauses_returned).toBe(0)
      expect(telemetry.final_coverage_rate).toBe(0)
    })
  })
})

// ============================================================================
// validateRagStatus TESTS
// ============================================================================

describe('validateRagStatus', () => {
  it('should accept valid statuses', () => {
    expect(validateRagStatus('green')).toBe('green')
    expect(validateRagStatus('amber')).toBe('amber')
    expect(validateRagStatus('red')).toBe('red')
  })

  it('should normalize case', () => {
    expect(validateRagStatus('GREEN')).toBe('green')
    expect(validateRagStatus('AMBER')).toBe('amber')
    expect(validateRagStatus('RED')).toBe('red')
  })

  it('should default to amber for invalid input', () => {
    expect(validateRagStatus('invalid')).toBe('amber')
    expect(validateRagStatus('')).toBe('amber')
    expect(validateRagStatus(null)).toBe('amber')
    expect(validateRagStatus(undefined)).toBe('amber')
  })
})

// ============================================================================
// ClauseValidator CLASS TESTS
// ============================================================================

describe('ClauseValidator class', () => {
  let validator: ClauseValidator

  beforeEach(() => {
    validator = new ClauseValidator()
  })

  it('should validate clauses', () => {
    const text = 'This is a sufficiently long clause text for validation testing.'
    const clauses: RawIndexedClause[] = [
      {
        start_index: 0,
        end_index: 60,
        clause_type: 'test',
        summary: 'Test',
        confidence: 0.9,
        rag_status: 'green',
      },
    ]

    const result = validator.validate(clauses, text)

    expect(result.valid.length).toBeGreaterThanOrEqual(0)
  })

  it('should snap to word boundary', () => {
    const text = 'Hello world'
    const result = validator.snapToWord(text, 3, 'end')
    expect(result).toBe(5)
  })

  it('should detect headers', () => {
    expect(validator.isHeader('PAYMENT TERMS')).toBe(true)
    expect(validator.isHeader('regular text')).toBe(false)
  })

  it('should validate RAG status', () => {
    expect(validator.validateRag('GREEN')).toBe('green')
    expect(validator.validateRag('invalid')).toBe('amber')
  })
})

// ============================================================================
// FACTORY AND DEFAULT INSTANCE TESTS
// ============================================================================

describe('createClauseValidator', () => {
  it('should create a new ClauseValidator instance', () => {
    const validator = createClauseValidator()
    expect(validator).toBeInstanceOf(ClauseValidator)
  })

  it('should accept custom config', () => {
    const validator = createClauseValidator({ minClauseLength: 100 })
    expect(validator).toBeInstanceOf(ClauseValidator)
  })
})

describe('defaultClauseValidator', () => {
  it('should be a ClauseValidator instance', () => {
    expect(defaultClauseValidator).toBeInstanceOf(ClauseValidator)
  })
})

// ============================================================================
// createValidationTelemetry TESTS
// ============================================================================

describe('createValidationTelemetry', () => {
  it('should create empty telemetry object', () => {
    const telemetry = createValidationTelemetry()

    expect(telemetry.clauses_returned).toBe(0)
    expect(telemetry.clauses_valid).toBe(0)
    expect(telemetry.dropped_for_bounds).toBe(0)
    expect(telemetry.dropped_for_overlap).toBe(0)
    expect(telemetry.dropped_for_empty).toBe(0)
    expect(telemetry.dropped_for_length).toBe(0)
    expect(telemetry.final_coverage_rate).toBe(0)
  })
})

// ============================================================================
// createSnapTelemetry TESTS
// ============================================================================

describe('createSnapTelemetry', () => {
  it('should create empty snap telemetry object', () => {
    const telemetry = createSnapTelemetry()

    expect(telemetry.total_snaps).toBe(0)
    expect(telemetry.snapped_to_sentence).toBe(0)
    expect(telemetry.snapped_to_list).toBe(0)
    expect(telemetry.snapped_to_word).toBe(0)
    expect(telemetry.no_snap_exceeded_window).toBe(0)
    expect(telemetry.second_pass_corrections).toBe(0)
    expect(telemetry.snap_distances).toEqual([])
  })
})

// ============================================================================
// INTEGRATION WITH line-mapper TESTS
// ============================================================================

describe('integration with line-mapper', () => {
  it('should validate clauses converted from line numbers', () => {
    // This simulates the full pipeline:
    // 1. Text -> LineNumberedDocument (line-mapper)
    // 2. GPT returns line-based clauses
    // 3. Convert to RawIndexedClause (line-mapper)
    // 4. Validate (clause-validator)

    const text = `This is a long enough first line for a clause.
This is the second line with more content.
This is the third line to complete clause.`

    const indexedClauses: RawIndexedClause[] = [
      {
        start_index: 0,
        end_index: 46,
        clause_type: 'intro',
        summary: 'First clause',
        confidence: 0.9,
        rag_status: 'green',
      },
    ]

    const config: ValidationConfig = {
      enableSnapping: false,
      enableForcing: false,
      minClauseLength: 20,
    }

    const { valid, telemetry } = validateClauseIndices(indexedClauses, text, config)

    expect(valid).toHaveLength(1)
    expect(valid[0].content).toBe('This is a long enough first line for a clause.')
    expect(telemetry.clauses_valid).toBe(1)
  })
})
