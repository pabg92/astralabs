/**
 * Identity Matcher Service
 *
 * Handles identity term matching for P1 reconciliation.
 * Identity terms (Brand Name, Talent Name, Agency, etc.) use direct string
 * matching instead of GPT semantic comparison for faster, more accurate results.
 *
 * @module services/identity-matcher
 */

import type {
  IdentityMatchResult,
  IdentityTermResult,
  PreAgreedTerm,
  RAGStatus,
  IdentityMatchType,
} from '../types/p1-types'

import { IDENTITY_TERM_CATEGORIES } from '../config/p1-config'

// ============ STANDALONE FUNCTIONS (for backward compatibility) ============

/**
 * Check if a term category is an identity term (requires presence check, not semantic comparison)
 * @param category - The term category to check
 * @returns true if this is an identity term category
 */
export function isIdentityTermCategory(category: string): boolean {
  return IDENTITY_TERM_CATEGORIES.has(category) ||
         IDENTITY_TERM_CATEGORIES.has(category.toLowerCase().trim())
}

/**
 * Normalize text for identity matching (case-insensitive, whitespace-normalized)
 * @param text - The text to normalize
 * @returns Normalized lowercase text with condensed whitespace
 */
export function normalizeForIdentityMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Check if contract text contains the expected identity value
 * Uses multiple matching strategies: exact, normalized, and partial
 *
 * @param expectedValue - The value expected from the PAT (e.g., "Nike")
 * @param clauseContent - The content of a specific clause to search
 * @param fullContractText - Optional full contract text for broader search
 * @returns IdentityMatchResult with match details
 */
export function checkIdentityMatch(
  expectedValue: string,
  clauseContent: string,
  fullContractText?: string
): IdentityMatchResult {
  // Handle empty/missing expected values
  if (!expectedValue || expectedValue.trim() === '' || expectedValue === 'N/A') {
    return { matches: false, matchType: 'absent', confidence: 0 }
  }

  const normalizedExpected = normalizeForIdentityMatch(expectedValue)
  const normalizedClause = normalizeForIdentityMatch(clauseContent)
  const normalizedFullText = fullContractText
    ? normalizeForIdentityMatch(fullContractText)
    : normalizedClause

  // Check 1: Exact match in clause content
  if (normalizedClause.includes(normalizedExpected)) {
    return {
      matches: true,
      matchType: 'exact',
      confidence: 1.0,
      foundValue: expectedValue
    }
  }

  // Check 2: Exact match in full contract text (if provided)
  if (fullContractText && normalizedFullText.includes(normalizedExpected)) {
    return {
      matches: true,
      matchType: 'exact',
      confidence: 0.95,
      foundValue: expectedValue
    }
  }

  // Check 3: Partial/fuzzy match (e.g., "Nike" matches in "Nike Inc" or "Nike Corporation")
  // Only check significant words (length > 2 to skip articles)
  const expectedWords = normalizedExpected.split(' ').filter(w => w.length > 2)
  if (expectedWords.length > 0) {
    const foundWords = expectedWords.filter(w => normalizedFullText.includes(w))
    const matchRatio = foundWords.length / expectedWords.length

    // Require at least 70% word match for partial
    if (matchRatio >= 0.7) {
      return {
        matches: true,
        matchType: 'partial',
        confidence: matchRatio * 0.8, // Reduce confidence for partial matches
        foundValue: foundWords.join(' ')
      }
    }
  }

  // No match found
  return { matches: false, matchType: 'absent', confidence: 0 }
}

/**
 * Determine RAG status for an identity term match
 * - Exact/normalized match → GREEN
 * - Partial match → AMBER (needs human review)
 * - Absent + mandatory → RED
 * - Absent + non-mandatory → AMBER
 *
 * @param match - The identity match result
 * @param isMandatory - Whether this term is mandatory
 * @returns RAG status color
 */
export function determineIdentityRag(
  match: IdentityMatchResult,
  isMandatory: boolean
): RAGStatus {
  switch (match.matchType) {
    case 'exact':
      return 'green'
    case 'normalized':
      return 'green'
    case 'partial':
      return 'amber' // Partial match needs human review
    case 'absent':
      return isMandatory ? 'red' : 'amber'
    default:
      return 'amber'
  }
}

/**
 * Generate a human-readable explanation for an identity term match
 *
 * @param match - The identity match result
 * @param expectedValue - The expected value from the PAT
 * @param category - The term category (e.g., "Brand Name")
 * @returns Explanation string (max 15 words to match GPT output format)
 */
export function generateIdentityExplanation(
  match: IdentityMatchResult,
  expectedValue: string,
  category: string
): string {
  switch (match.matchType) {
    case 'exact':
      return `${category} "${expectedValue}" found in contract`
    case 'normalized':
      return `${category} "${expectedValue}" found (case-insensitive)`
    case 'partial':
      return `Partial match: expected "${expectedValue}", found "${match.foundValue}"`
    case 'absent':
      return `${category} "${expectedValue}" not found in contract`
    default:
      return `Unable to verify ${category}`
  }
}

// ============ CLASS-BASED SERVICE ============

/**
 * IdentityMatcher class for processing identity terms
 *
 * Provides a class-based interface for identity matching with
 * configuration injection support for testing.
 */
export class IdentityMatcher {
  private identityCategories: Set<string>

  constructor(identityCategories?: Set<string>) {
    // Use provided categories or default from config
    this.identityCategories = identityCategories || IDENTITY_TERM_CATEGORIES
  }

  /**
   * Check if a term category is an identity term
   */
  isIdentityTerm(category: string): boolean {
    return this.identityCategories.has(category) ||
           this.identityCategories.has(category.toLowerCase().trim())
  }

  /**
   * Check if contract text contains the expected identity value
   */
  checkMatch(
    expectedValue: string,
    clauseContent: string,
    fullContractText?: string
  ): IdentityMatchResult {
    return checkIdentityMatch(expectedValue, clauseContent, fullContractText)
  }

  /**
   * Determine RAG status for an identity match
   */
  determineRag(match: IdentityMatchResult, isMandatory: boolean): RAGStatus {
    return determineIdentityRag(match, isMandatory)
  }

  /**
   * Generate explanation for an identity match
   */
  generateExplanation(
    match: IdentityMatchResult,
    expectedValue: string,
    category: string
  ): string {
    return generateIdentityExplanation(match, expectedValue, category)
  }

  /**
   * Process a single identity term against contract text
   *
   * @param term - The pre-agreed term to process
   * @param fullContractText - The full contract text to search
   * @returns IdentityTermResult with match details
   */
  processTerm(term: PreAgreedTerm, fullContractText: string): IdentityTermResult {
    const category = term.normalized_term_category || term.term_category
    const expectedValue = term.expected_value || ''

    const matchResult = this.checkMatch(expectedValue, '', fullContractText)
    const ragParsing = this.determineRag(matchResult, term.is_mandatory)
    const explanation = this.generateExplanation(matchResult, expectedValue, category)

    return {
      termId: term.id,
      termCategory: category,
      isMandatory: term.is_mandatory,
      expectedValue,
      matchResult,
      ragParsing,
      explanation,
    }
  }

  /**
   * Process all identity terms from a list of pre-agreed terms
   *
   * @param terms - Array of pre-agreed terms
   * @param fullContractText - The full contract text to search
   * @returns Map of term ID to IdentityTermResult for identity terms only
   */
  processIdentityTerms(
    terms: PreAgreedTerm[],
    fullContractText: string
  ): Map<string, IdentityTermResult> {
    const results = new Map<string, IdentityTermResult>()

    for (const term of terms) {
      const category = term.normalized_term_category || term.term_category

      if (this.isIdentityTerm(category)) {
        const result = this.processTerm(term, fullContractText)
        results.set(term.id, result)
      }
    }

    return results
  }

  /**
   * Filter terms to get only semantic (non-identity) terms
   *
   * @param terms - Array of pre-agreed terms
   * @returns Array of semantic terms that need GPT comparison
   */
  filterSemanticTerms(terms: PreAgreedTerm[]): PreAgreedTerm[] {
    return terms.filter(term => {
      const category = term.normalized_term_category || term.term_category
      return !this.isIdentityTerm(category)
    })
  }
}

// Default instance for convenience
export const identityMatcher = new IdentityMatcher()
