/**
 * Text manipulation utilities for the worker
 */

/**
 * Truncates text intelligently at sentence or word boundaries
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum length of the result
 * @returns Truncated text, preserving sentence/word boundaries when possible
 *
 * @example
 * smartTruncate("This is a sentence. Another one.", 20)
 * // Returns: "This is a sentence."
 *
 * @example
 * smartTruncate("Word word word word word", 15)
 * // Returns: "Word word..."
 */
export function smartTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  // Find last sentence boundary before maxLength
  const truncated = text.substring(0, maxLength)
  const lastPeriod = truncated.lastIndexOf('.')
  const lastQuestion = truncated.lastIndexOf('?')
  const lastExclaim = truncated.lastIndexOf('!')

  const lastBoundary = Math.max(lastPeriod, lastQuestion, lastExclaim)

  // If we found a sentence boundary in the latter half, use it
  if (lastBoundary > maxLength * 0.5) {
    return text.substring(0, lastBoundary + 1)
  }

  // Fallback: cut at word boundary
  const lastSpace = truncated.lastIndexOf(' ')

  if (lastSpace > maxLength * 0.8) {
    return text.substring(0, lastSpace) + '...'
  }

  // Last resort: hard cut with ellipsis
  return truncated + '...'
}
