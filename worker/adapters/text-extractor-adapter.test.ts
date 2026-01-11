import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isPdfMimeType,
  isDocxMimeType,
  isPlainTextMimeType,
  isSupportedMimeType,
  getExtractionMethod,
  sanitizeText,
  extractPlainText,
  extractFromBuffer,
  extractFromBlob,
  TextExtractorAdapter,
  createTextExtractorAdapter,
  textExtractor,
} from './text-extractor-adapter'

describe('text-extractor-adapter', () => {
  describe('MIME type helpers', () => {
    describe('isPdfMimeType', () => {
      it('returns true for application/pdf', () => {
        expect(isPdfMimeType('application/pdf')).toBe(true)
      })

      it('returns true for application/x-pdf', () => {
        expect(isPdfMimeType('application/x-pdf')).toBe(true)
      })

      it('returns false for other types', () => {
        expect(isPdfMimeType('text/plain')).toBe(false)
        expect(isPdfMimeType('application/msword')).toBe(false)
      })

      it('handles case insensitivity', () => {
        expect(isPdfMimeType('APPLICATION/PDF')).toBe(true)
      })
    })

    describe('isDocxMimeType', () => {
      it('returns true for docx MIME type', () => {
        expect(isDocxMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
      })

      it('returns true for legacy doc MIME type', () => {
        expect(isDocxMimeType('application/msword')).toBe(true)
      })

      it('returns false for other types', () => {
        expect(isDocxMimeType('application/pdf')).toBe(false)
      })
    })

    describe('isPlainTextMimeType', () => {
      it('returns true for text/plain', () => {
        expect(isPlainTextMimeType('text/plain')).toBe(true)
      })

      it('returns false for other types', () => {
        expect(isPlainTextMimeType('application/pdf')).toBe(false)
      })
    })

    describe('isSupportedMimeType', () => {
      it('returns true for all supported types', () => {
        expect(isSupportedMimeType('application/pdf')).toBe(true)
        expect(isSupportedMimeType('application/x-pdf')).toBe(true)
        expect(isSupportedMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
        expect(isSupportedMimeType('application/msword')).toBe(true)
        expect(isSupportedMimeType('text/plain')).toBe(true)
      })

      it('returns false for unsupported types', () => {
        expect(isSupportedMimeType('image/png')).toBe(false)
        expect(isSupportedMimeType('application/json')).toBe(false)
      })
    })

    describe('getExtractionMethod', () => {
      it('returns unpdf for PDF types', () => {
        expect(getExtractionMethod('application/pdf')).toBe('unpdf')
        expect(getExtractionMethod('application/x-pdf')).toBe('unpdf')
      })

      it('returns mammoth for DOCX types', () => {
        expect(getExtractionMethod('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('mammoth')
        expect(getExtractionMethod('application/msword')).toBe('mammoth')
      })

      it('returns plaintext for text types', () => {
        expect(getExtractionMethod('text/plain')).toBe('plaintext')
      })

      it('throws for unsupported types', () => {
        expect(() => getExtractionMethod('image/png')).toThrow('Unsupported MIME type: image/png')
      })
    })
  })

  describe('sanitizeText', () => {
    it('removes null bytes', () => {
      expect(sanitizeText('hello\u0000world')).toBe('helloworld')
      expect(sanitizeText('\u0000\u0000test\u0000')).toBe('test')
    })

    it('preserves other whitespace', () => {
      expect(sanitizeText('hello world')).toBe('hello world')
      expect(sanitizeText('hello\nworld')).toBe('hello\nworld')
      expect(sanitizeText('hello\tworld')).toBe('hello\tworld')
    })

    it('handles empty string', () => {
      expect(sanitizeText('')).toBe('')
    })
  })

  describe('extractPlainText', () => {
    it('extracts text from buffer', () => {
      const encoder = new TextEncoder()
      const buffer = encoder.encode('Hello, World!').buffer
      expect(extractPlainText(buffer)).toBe('Hello, World!')
    })

    it('handles UTF-8 characters', () => {
      const encoder = new TextEncoder()
      const buffer = encoder.encode('Héllo Wörld 日本語').buffer
      expect(extractPlainText(buffer)).toBe('Héllo Wörld 日本語')
    })

    it('handles empty buffer', () => {
      const buffer = new ArrayBuffer(0)
      expect(extractPlainText(buffer)).toBe('')
    })
  })

  describe('extractFromBuffer', () => {
    it('throws for unsupported MIME type', async () => {
      const buffer = new ArrayBuffer(0)
      await expect(extractFromBuffer(buffer, 'image/png')).rejects.toThrow('Unsupported MIME type: image/png')
    })

    it('extracts plain text successfully', async () => {
      const encoder = new TextEncoder()
      const buffer = encoder.encode('Test content').buffer
      const result = await extractFromBuffer(buffer, 'text/plain')

      expect(result.text).toBe('Test content')
      expect(result.mimeType).toBe('text/plain')
      expect(result.characterCount).toBe(12)
      expect(result.extractionMethod).toBe('plaintext')
    })

    it('throws for empty extraction', async () => {
      const buffer = new ArrayBuffer(0)
      await expect(extractFromBuffer(buffer, 'text/plain')).rejects.toThrow('No text could be extracted from document')
    })

    it('throws for whitespace-only extraction', async () => {
      const encoder = new TextEncoder()
      const buffer = encoder.encode('   \n\t  ').buffer
      await expect(extractFromBuffer(buffer, 'text/plain')).rejects.toThrow('No text could be extracted from document')
    })

    it('sanitizes null bytes by default', async () => {
      const encoder = new TextEncoder()
      const buffer = encoder.encode('Hello\u0000World').buffer
      const result = await extractFromBuffer(buffer, 'text/plain')
      expect(result.text).toBe('HelloWorld')
    })

    it('preserves null bytes when sanitizeNullBytes is false', async () => {
      const encoder = new TextEncoder()
      const buffer = encoder.encode('Hello\u0000World').buffer
      const result = await extractFromBuffer(buffer, 'text/plain', { sanitizeNullBytes: false })
      expect(result.text).toBe('Hello\u0000World')
    })
  })

  describe('extractFromBlob', () => {
    it('extracts from blob using blob.type', async () => {
      const blob = new Blob(['Test content'], { type: 'text/plain' })
      const result = await extractFromBlob(blob)

      expect(result.text).toBe('Test content')
      expect(result.mimeType).toBe('text/plain')
      expect(result.extractionMethod).toBe('plaintext')
    })

    it('uses mimeTypeOverride when provided', async () => {
      const blob = new Blob(['Test content'], { type: 'application/octet-stream' })
      const result = await extractFromBlob(blob, 'text/plain')

      expect(result.text).toBe('Test content')
      expect(result.mimeType).toBe('text/plain')
    })
  })

  describe('TextExtractorAdapter class', () => {
    it('can be instantiated', () => {
      const adapter = new TextExtractorAdapter()
      expect(adapter).toBeInstanceOf(TextExtractorAdapter)
    })

    it('extractFromBuffer works', async () => {
      const adapter = new TextExtractorAdapter()
      const encoder = new TextEncoder()
      const buffer = encoder.encode('Test').buffer
      const result = await adapter.extractFromBuffer(buffer, 'text/plain')
      expect(result.text).toBe('Test')
    })

    it('isSupportedMimeType works', () => {
      const adapter = new TextExtractorAdapter()
      expect(adapter.isSupportedMimeType('application/pdf')).toBe(true)
      expect(adapter.isSupportedMimeType('image/png')).toBe(false)
    })

    it('getExtractionMethod works', () => {
      const adapter = new TextExtractorAdapter()
      expect(adapter.getExtractionMethod('application/pdf')).toBe('unpdf')
      expect(adapter.getExtractionMethod('text/plain')).toBe('plaintext')
    })
  })

  describe('factory and default instance', () => {
    it('createTextExtractorAdapter returns adapter', () => {
      const adapter = createTextExtractorAdapter()
      expect(adapter).toBeInstanceOf(TextExtractorAdapter)
    })

    it('textExtractor is a default instance', () => {
      expect(textExtractor).toBeInstanceOf(TextExtractorAdapter)
    })
  })
})
