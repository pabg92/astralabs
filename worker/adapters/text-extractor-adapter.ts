/**
 * Text Extraction Adapter
 * Extracts raw text from PDF, DOCX, and plain text files
 * Ported from supabase/functions/extract-clauses/index.ts
 */

import { extractText } from 'unpdf'
import mammoth from 'mammoth'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported extraction methods
 */
export type ExtractionMethod = 'unpdf' | 'mammoth' | 'plaintext'

/**
 * Result of text extraction
 */
export interface TextExtractionResult {
  /** Extracted text content */
  text: string
  /** Original MIME type of the file */
  mimeType: string
  /** Number of characters extracted */
  characterCount: number
  /** Method used for extraction */
  extractionMethod: ExtractionMethod
}

/**
 * Options for text extraction
 */
export interface TextExtractionOptions {
  /** Whether to sanitize null bytes (default: true) */
  sanitizeNullBytes?: boolean
}

// ============================================================================
// MIME TYPE HELPERS
// ============================================================================

const PDF_MIME_TYPES = ['application/pdf', 'application/x-pdf']

const DOCX_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]

const PLAINTEXT_MIME_TYPES = ['text/plain']

/**
 * Checks if MIME type is a supported PDF type
 */
export function isPdfMimeType(mimeType: string): boolean {
  return PDF_MIME_TYPES.includes(mimeType.toLowerCase())
}

/**
 * Checks if MIME type is a supported DOCX type
 */
export function isDocxMimeType(mimeType: string): boolean {
  return DOCX_MIME_TYPES.includes(mimeType.toLowerCase())
}

/**
 * Checks if MIME type is plain text
 */
export function isPlainTextMimeType(mimeType: string): boolean {
  return PLAINTEXT_MIME_TYPES.includes(mimeType.toLowerCase())
}

/**
 * Checks if MIME type is supported for extraction
 */
export function isSupportedMimeType(mimeType: string): boolean {
  return isPdfMimeType(mimeType) || isDocxMimeType(mimeType) || isPlainTextMimeType(mimeType)
}

/**
 * Gets the extraction method for a MIME type
 */
export function getExtractionMethod(mimeType: string): ExtractionMethod {
  if (isPdfMimeType(mimeType)) return 'unpdf'
  if (isDocxMimeType(mimeType)) return 'mammoth'
  if (isPlainTextMimeType(mimeType)) return 'plaintext'
  throw new Error(`Unsupported MIME type: ${mimeType}`)
}

// ============================================================================
// TEXT SANITIZATION
// ============================================================================

/**
 * Sanitizes extracted text by removing null bytes
 * Preserves all other characters including whitespace (for index accuracy)
 */
export function sanitizeText(text: string): string {
  return text.replace(/\u0000/g, '')
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extracts text from a PDF buffer
 * Uses unpdf library
 */
export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const result = await extractText(new Uint8Array(buffer))

  // unpdf can return string or { text: string }
  if (typeof result === 'string') {
    return result
  } else if (result && typeof result === 'object' && 'text' in result) {
    return String((result as { text: string }).text)
  } else {
    return String(result || '')
  }
}

/**
 * Extracts text from a DOCX buffer
 * Uses mammoth library
 */
export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

/**
 * Extracts text from a plain text buffer
 */
export function extractPlainText(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder('utf-8')
  return decoder.decode(buffer)
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extracts text from a buffer based on MIME type
 *
 * @param buffer - The file content as ArrayBuffer
 * @param mimeType - The MIME type of the file
 * @param options - Extraction options
 * @returns TextExtractionResult with extracted text and metadata
 * @throws Error if MIME type is unsupported or extraction fails
 */
export async function extractFromBuffer(
  buffer: ArrayBuffer,
  mimeType: string,
  options: TextExtractionOptions = {}
): Promise<TextExtractionResult> {
  const { sanitizeNullBytes = true } = options

  if (!isSupportedMimeType(mimeType)) {
    throw new Error(`Unsupported MIME type: ${mimeType}`)
  }

  const method = getExtractionMethod(mimeType)
  let text: string

  switch (method) {
    case 'unpdf':
      text = await extractPdfText(buffer)
      break
    case 'mammoth':
      text = await extractDocxText(buffer)
      break
    case 'plaintext':
      text = extractPlainText(buffer)
      break
  }

  // Sanitize if requested
  if (sanitizeNullBytes) {
    text = sanitizeText(text)
  }

  // Validate extraction produced content
  if (!text || text.trim().length === 0) {
    throw new Error('No text could be extracted from document')
  }

  return {
    text,
    mimeType,
    characterCount: text.length,
    extractionMethod: method,
  }
}

/**
 * Extracts text from a Blob based on its type
 *
 * @param blob - The file as a Blob
 * @param mimeTypeOverride - Optional MIME type override (uses blob.type if not provided)
 * @param options - Extraction options
 * @returns TextExtractionResult with extracted text and metadata
 */
export async function extractFromBlob(
  blob: Blob,
  mimeTypeOverride?: string,
  options: TextExtractionOptions = {}
): Promise<TextExtractionResult> {
  const mimeType = mimeTypeOverride || blob.type
  const buffer = await blob.arrayBuffer()
  return extractFromBuffer(buffer, mimeType, options)
}

// ============================================================================
// ADAPTER CLASS
// ============================================================================

/**
 * Text Extractor Adapter class for dependency injection
 */
export class TextExtractorAdapter {
  /**
   * Extracts text from an ArrayBuffer
   */
  async extractFromBuffer(
    buffer: ArrayBuffer,
    mimeType: string,
    options?: TextExtractionOptions
  ): Promise<TextExtractionResult> {
    return extractFromBuffer(buffer, mimeType, options)
  }

  /**
   * Extracts text from a Blob
   */
  async extractFromBlob(
    blob: Blob,
    mimeTypeOverride?: string,
    options?: TextExtractionOptions
  ): Promise<TextExtractionResult> {
    return extractFromBlob(blob, mimeTypeOverride, options)
  }

  /**
   * Checks if a MIME type is supported
   */
  isSupportedMimeType(mimeType: string): boolean {
    return isSupportedMimeType(mimeType)
  }

  /**
   * Gets the extraction method for a MIME type
   */
  getExtractionMethod(mimeType: string): ExtractionMethod {
    return getExtractionMethod(mimeType)
  }
}

// ============================================================================
// FACTORY & DEFAULT INSTANCE
// ============================================================================

/**
 * Creates a new TextExtractorAdapter instance
 */
export function createTextExtractorAdapter(): TextExtractorAdapter {
  return new TextExtractorAdapter()
}

/**
 * Default text extractor instance for convenience
 */
export const textExtractor = createTextExtractorAdapter()
