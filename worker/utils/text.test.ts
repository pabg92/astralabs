import { describe, it, expect } from 'vitest'
import { smartTruncate } from './text.js'

describe('smartTruncate', () => {
  describe('short text (no truncation needed)', () => {
    it('returns text unchanged when under maxLength', () => {
      expect(smartTruncate('Hello world', 100)).toBe('Hello world')
    })

    it('returns text unchanged when exactly at maxLength', () => {
      expect(smartTruncate('Hello', 5)).toBe('Hello')
    })

    it('handles empty string', () => {
      expect(smartTruncate('', 100)).toBe('')
    })
  })

  describe('sentence boundary truncation', () => {
    it('truncates at period when in latter half', () => {
      const text = 'This is a sentence. Another one here.'
      expect(smartTruncate(text, 25)).toBe('This is a sentence.')
    })

    it('truncates at question mark', () => {
      const text = 'Is this working? Yes it is.'
      expect(smartTruncate(text, 20)).toBe('Is this working?')
    })

    it('truncates at exclamation mark when in latter half', () => {
      const text = 'This is great! Yes it really is!'
      // "!" at position 13 is > 50% of maxLength 20
      expect(smartTruncate(text, 20)).toBe('This is great!')
    })

    it('prefers word boundary when sentence boundary too early', () => {
      // "." at position 5 is only 33% of 15, below 50% threshold
      // So it falls back to word boundary
      const text = 'Short. This is a longer sentence that goes on.'
      expect(smartTruncate(text, 15)).toBe('Short. This is...')
    })
  })

  describe('word boundary truncation', () => {
    it('falls back to word boundary when no sentence boundary in latter half', () => {
      const text = 'One two three four five six seven'
      const result = smartTruncate(text, 20)
      expect(result).toBe('One two three four...')
    })

    it('truncates at word boundary near end', () => {
      const text = 'Word word word word word'
      const result = smartTruncate(text, 15)
      expect(result).toContain('...')
      expect(result.length).toBeLessThanOrEqual(18) // 15 + "..."
    })
  })

  describe('hard cut truncation', () => {
    it('hard cuts very long words when no good boundary found', () => {
      const text = 'Supercalifragilisticexpialidocious is a word'
      const result = smartTruncate(text, 10)
      expect(result).toBe('Supercalif...')
    })

    it('adds ellipsis on hard cut', () => {
      const text = 'AAAAAAAAAA'
      const result = smartTruncate(text, 5)
      expect(result).toBe('AAAAA...')
    })
  })

  describe('edge cases', () => {
    it('handles text with only punctuation', () => {
      const text = '... ... ...'
      const result = smartTruncate(text, 5)
      expect(result.length).toBeLessThanOrEqual(8)
    })

    it('handles single character truncation', () => {
      const text = 'Hello'
      const result = smartTruncate(text, 1)
      expect(result).toBe('H...')
    })

    it('handles text starting with punctuation', () => {
      const text = '. After the period'
      const result = smartTruncate(text, 5)
      // Hard cuts at 5 chars and adds ellipsis
      expect(result).toBe('. Aft...')
    })
  })

  describe('real-world contract clause scenarios', () => {
    it('truncates contract clause at sentence boundary', () => {
      const clause = 'The Talent agrees to create and deliver the Content by the Delivery Date. ' +
        'Content must comply with all applicable FTC guidelines. ' +
        'Brand shall have the right to request revisions.'
      // First "." is at position 73, which is > 50% of 100
      const result = smartTruncate(clause, 100)
      expect(result).toBe(
        'The Talent agrees to create and deliver the Content by the Delivery Date.'
      )
    })

    it('handles clause without sentence boundaries', () => {
      const clause = 'Payment of $10,000 USD for all deliverables including one Instagram post, ' +
        'one TikTok video, and associated stories'
      const result = smartTruncate(clause, 50)
      expect(result).toContain('...')
      expect(result.length).toBeLessThanOrEqual(53)
    })
  })
})
