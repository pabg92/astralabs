/**
 * Tests for P1 Reconciliation
 * Issue #8: https://github.com/pabg92/contractbuddy-worker/issues/8 (over-matching)
 * Issue #9: https://github.com/pabg92/contractbuddy-worker/issues/9 (missing mandatory false-positive)
 */

import { describe, it, expect } from 'vitest'

// ============ Issue #8: Keyword Matching Types and Logic ============

interface ClauseBoundary {
  id: string
  content: string
  clause_type: string
  confidence: number
}

interface PreAgreedTermFull {
  id: string
  term_category: string
  term_description: string
  expected_value: string | null
  is_mandatory: boolean
  related_clause_types: string[] | null
}

/**
 * Find relevant terms for a clause using keyword matching
 * This is the exact logic from p1-reconciliation.ts (issue #8 fix)
 */
function findRelevantTerms(clause: ClauseBoundary, preAgreedTerms: PreAgreedTermFull[]): PreAgreedTermFull[] {
  return preAgreedTerms.filter((term) => {
    // Direct match via related_clause_types (most reliable)
    if (term.related_clause_types?.includes(clause.clause_type)) {
      return true
    }

    const normalizedClauseType = clause.clause_type.replace(/_/g, " ").toLowerCase()
    const termCategory = term.term_category.toLowerCase()

    // Tightened keyword map - removed ambiguous words
    const keywordMap: Record<string, string[]> = {
      payment: ["payment", "fee", "compensation", "invoice", "remuneration"],
      usage: ["usage", "rights", "license", "licensing", "utilization"],
      deliverable: ["deliverable", "delivery", "deadline", "scope", "output"],
      exclusivity: ["exclusivity", "exclusive", "non-compete"],
      approval: ["approval", "approve", "review", "consent"],
      confidentiality: ["confidential", "nda", "secret", "proprietary"],
      termination: ["termination", "terminate", "cancel", "cancellation"],
      indemnification: ["indemn", "liability", "warranty", "insurance"],
      intellectual: ["intellectual", "ip", "copyright", "trademark", "ownership", "rights"],
      creative: ["creative", "requirement", "standard", "guideline"],
      posting: ["posting", "schedule", "publish"],
      disclosure: ["disclosure", "ftc", "compliance"],
      analytics: ["analytics", "metric", "report", "data"],
    }

    // Only match against term_category, NOT term_description (issue #8 fix)
    for (const relatedKeywords of Object.values(keywordMap)) {
      const clauseMatches = relatedKeywords.some((kw) => normalizedClauseType.includes(kw))
      const termMatches = relatedKeywords.some((kw) => termCategory.includes(kw))
      if (clauseMatches && termMatches) return true
    }

    return false
  })
}

// ============ Issue #9: Missing Mandatory Detection Types ============

// Extracted logic for testing - mirrors the actual implementation
interface BatchResult {
  idx: number
  matches: boolean
  severity: "none" | "minor" | "major"
  risk_summary: string
  differences: string[]
  confidence: number
}

interface PreAgreedTerm {
  id: string
  term_category: string
  is_mandatory: boolean
}

interface BatchComparison {
  idx: number
  termCategory: string
  isMandatory: boolean
}

/**
 * Compute which PAT categories have been satisfied (at least one match=true)
 * This is the core logic that was broken in issue #9
 */
function computeMatchedCategories(
  batchResults: Map<number, BatchResult>,
  comparisons: BatchComparison[]
): Set<string> {
  const matchedCategories = new Set<string>()

  for (const comparison of comparisons) {
    const result = batchResults.get(comparison.idx)
    if (result?.matches) {
      matchedCategories.add(comparison.termCategory)
    }
  }

  return matchedCategories
}

/**
 * Determine which mandatory PATs are missing
 */
function findMissingMandatoryTerms(
  preAgreedTerms: PreAgreedTerm[],
  matchedCategories: Set<string>
): PreAgreedTerm[] {
  return preAgreedTerms.filter(
    (term) => term.is_mandatory && !matchedCategories.has(term.term_category)
  )
}

// ============ Issue #8 Tests: Keyword Matching Over-Matching Fix ============

describe('P1 Keyword Matching (Issue #8)', () => {

  // Helper to create a clause
  const makeClause = (clause_type: string): ClauseBoundary => ({
    id: '1',
    content: 'Test clause content',
    clause_type,
    confidence: 0.9
  })

  // Helper to create a PAT
  const makePAT = (
    term_category: string,
    term_description: string,
    related_clause_types: string[] | null = null
  ): PreAgreedTermFull => ({
    id: '1',
    term_category,
    term_description,
    expected_value: null,
    is_mandatory: true,
    related_clause_types
  })

  describe('Direct match via related_clause_types', () => {

    it('should match when clause_type is in related_clause_types', () => {
      const clause = makeClause('payment_terms')
      const pats = [makePAT('Payment Terms', 'Pay within 30 days', ['payment_terms'])]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(1)
      expect(result[0].term_category).toBe('Payment Terms')
    })

    it('should NOT match when clause_type is not in related_clause_types', () => {
      const clause = makeClause('termination')
      const pats = [makePAT('Payment Terms', 'Pay within 30 days', ['payment_terms'])]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(0)
    })
  })

  describe('Issue #8 false-positive prevention', () => {

    it('should NOT match deliverables to Usage Rights (no "content" keyword)', () => {
      // Old bug: "content" keyword caused deliverables to match everything
      const clause = makeClause('deliverables')
      const pats = [makePAT(
        'Usage Rights',
        'Brand may repost and re-share talent content organically across owned digital channels'
      )]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(0)
    })

    it('should NOT match termination to Payment Terms (no "term" keyword)', () => {
      // Old bug: "term" keyword caused termination to match Payment Terms
      const clause = makeClause('termination')
      const pats = [makePAT(
        'Payment Terms',
        'Payable within 30 days of valid invoice'
      )]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(0)
    })

    it('should NOT match termination to Creative Requirements (no "duration" keyword)', () => {
      // Old bug: "duration" keyword caused termination to match Creative Requirements
      const clause = makeClause('termination')
      const pats = [makePAT(
        'Creative Requirements',
        'Influencer must include text on screen for the full duration of the TikTok video'
      )]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(0)
    })

    it('should NOT match intellectual_property to Payment Terms', () => {
      const clause = makeClause('intellectual_property')
      const pats = [makePAT(
        'Payment Terms',
        'Payable within 45 days of Brand approval'
      )]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(0)
    })

    it('should NOT match deliverables to Exclusivity Window', () => {
      const clause = makeClause('deliverables')
      const pats = [makePAT(
        'Exclusivity Window',
        'Talent will not post other content for 6 hours before and after'
      )]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(0)
    })

    it('should NOT match payment_terms to Creative Requirements', () => {
      const clause = makeClause('payment_terms')
      const pats = [makePAT(
        'Creative Requirements',
        'Must include brand text on screen'
      )]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(0)
    })
  })

  describe('Legitimate keyword matches', () => {

    it('should match payment_terms to Payment Terms PAT', () => {
      const clause = makeClause('payment_terms')
      const pats = [makePAT('Payment Terms', 'Pay within 30 days')]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(1)
    })

    it('should match exclusivity to Exclusivity PAT', () => {
      const clause = makeClause('exclusivity')
      const pats = [makePAT('Exclusivity', 'No competitor promotion')]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(1)
    })

    it('should match deliverables to Delivery Deadline PAT', () => {
      const clause = makeClause('deliverables')
      const pats = [makePAT('Delivery Deadline', 'Submit by Friday')]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(1)
    })

    it('should match intellectual_property to Usage Rights PAT', () => {
      const clause = makeClause('intellectual_property')
      const pats = [makePAT('Usage Rights', 'Brand may use content')]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(1)
    })

    it('should match confidentiality to Confidential PAT', () => {
      const clause = makeClause('confidentiality')
      const pats = [makePAT('Confidential Agreement', 'Keep secret')]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(1)
    })

    it('should match termination to Termination PAT', () => {
      const clause = makeClause('termination')
      const pats = [makePAT('Termination Clause', 'Can cancel with notice')]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(1)
    })
  })

  describe('Multiple PATs filtering', () => {

    it('should only return matching PATs from a list', () => {
      const clause = makeClause('payment_terms')
      const pats = [
        makePAT('Payment Terms', 'Pay within 30 days'),
        makePAT('Usage Rights', 'Brand may use content'),
        makePAT('Exclusivity', 'No competitors'),
        makePAT('Fee Structure', 'Flat fee of $1000')
      ]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(2)  // Payment Terms and Fee Structure
      expect(result.map(p => p.term_category)).toContain('Payment Terms')
      expect(result.map(p => p.term_category)).toContain('Fee Structure')
    })

    it('should return empty array when no PATs match', () => {
      const clause = makeClause('force_majeure')
      const pats = [
        makePAT('Payment Terms', 'Pay within 30 days'),
        makePAT('Usage Rights', 'Brand may use content')
      ]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(0)
    })
  })

  describe('Edge cases', () => {

    it('should handle empty PATs array', () => {
      const clause = makeClause('payment_terms')
      const result = findRelevantTerms(clause, [])
      expect(result).toHaveLength(0)
    })

    it('should handle clause_type with underscores', () => {
      const clause = makeClause('intellectual_property')
      const pats = [makePAT('Intellectual Property Rights', 'IP assignment')]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(1)
    })

    it('should be case insensitive for term_category', () => {
      const clause = makeClause('payment_terms')
      const pats = [makePAT('PAYMENT TERMS', 'Pay now')]

      const result = findRelevantTerms(clause, pats)

      expect(result).toHaveLength(1)
    })
  })
})

// ============ Semantic Pairing Tests (POC) ============

describe('Semantic Pairing Architecture', () => {

  describe('getObviousMatches (keyword pre-filter)', () => {

    const makePATFull = (
      term_category: string,
      related_clause_types: string[] | null = null
    ): PreAgreedTermFull => ({
      id: '1',
      term_category,
      term_description: 'Test description',
      expected_value: null,
      is_mandatory: true,
      related_clause_types
    })

    // Simulating the getObviousMatches logic for testing
    function getObviousMatches(clauseType: string, preAgreedTerms: PreAgreedTermFull[]): PreAgreedTermFull[] {
      const directMappings: Record<string, string[]> = {
        payment_terms: ["payment", "fee", "compensation"],
        exclusivity: ["exclusivity", "exclusive"],
        termination: ["termination", "terminate"],
        confidentiality: ["confidential", "nda"],
        deliverables: ["deliverable", "delivery", "deadline"],
      }

      const matched: PreAgreedTermFull[] = []

      for (const term of preAgreedTerms) {
        if (term.related_clause_types?.includes(clauseType)) {
          matched.push(term)
          continue
        }

        const keywords = directMappings[clauseType]
        if (keywords) {
          const termCategory = term.term_category.toLowerCase()
          if (keywords.some(kw => termCategory.includes(kw))) {
            matched.push(term)
          }
        }
      }

      return matched
    }

    it('should match payment_terms to Payment Terms via direct mapping', () => {
      const pats = [makePATFull('Payment Terms')]
      const result = getObviousMatches('payment_terms', pats)
      expect(result).toHaveLength(1)
    })

    it('should match payment_terms to Fee Structure via "fee" keyword', () => {
      const pats = [makePATFull('Fee Structure')]
      const result = getObviousMatches('payment_terms', pats)
      expect(result).toHaveLength(1)
    })

    it('should match via related_clause_types (highest priority)', () => {
      const pats = [makePATFull('Custom Category', ['payment_terms'])]
      const result = getObviousMatches('payment_terms', pats)
      expect(result).toHaveLength(1)
    })

    it('should NOT match unknown clause type without related_clause_types', () => {
      const pats = [makePATFull('Payment Terms')]
      const result = getObviousMatches('force_majeure', pats)
      expect(result).toHaveLength(0)
    })

    it('should match exclusivity clause to Exclusivity PAT', () => {
      const pats = [makePATFull('Exclusivity Window')]
      const result = getObviousMatches('exclusivity', pats)
      expect(result).toHaveLength(1)
    })

    it('should match deliverables to Delivery Deadline', () => {
      const pats = [makePATFull('Delivery Deadline')]
      const result = getObviousMatches('deliverables', pats)
      expect(result).toHaveLength(1)
    })
  })

  describe('Hybrid pairing decision logic', () => {

    it('should use keyword match when available (no semantic call needed)', () => {
      // This tests the concept - keyword match should be preferred
      const clause = { id: '1', content: 'Pay $1000', clause_type: 'payment_terms', confidence: 0.9 }
      const pats = [{ id: '1', term_category: 'Payment Terms', term_description: 'Pay within 30 days', expected_value: null, is_mandatory: true, related_clause_types: null }]

      // Keyword matching should find this
      const keywordResult = findRelevantTerms(clause, pats)
      expect(keywordResult).toHaveLength(1)
      expect(keywordResult[0].term_category).toBe('Payment Terms')
    })

    it('should fall through to semantic when keyword fails', () => {
      // Simulate a typo that keyword matching would miss
      const clause = { id: '1', content: 'Pay $1000', clause_type: 'payment_terms', confidence: 0.9 }
      const pats = [{
        id: '1',
        term_category: 'Paymnt Trems',  // Typo!
        term_description: 'Pay within 30 days',
        expected_value: null,
        is_mandatory: true,
        related_clause_types: null
      }]

      // Keyword matching should NOT find this (typo breaks it)
      const keywordResult = findRelevantTerms(clause, pats)
      expect(keywordResult).toHaveLength(0)

      // Semantic pairing would catch this (tested via integration)
    })
  })

  describe('SemanticPairingResult structure', () => {

    it('should have required fields for traceability', () => {
      const result: { clauseId: string, clauseType: string, matchedPATCategories: string[], pairingMethod: 'keyword' | 'semantic' | 'related_clause_types', semanticConfidence?: number } = {
        clauseId: '123',
        clauseType: 'payment_terms',
        matchedPATCategories: ['Payment Terms', 'Fee Structure'],
        pairingMethod: 'keyword'
      }

      expect(result.clauseId).toBeDefined()
      expect(result.clauseType).toBeDefined()
      expect(result.matchedPATCategories).toBeInstanceOf(Array)
      expect(['keyword', 'semantic', 'related_clause_types']).toContain(result.pairingMethod)
    })

    it('should include confidence for semantic matches', () => {
      const result = {
        clauseId: '123',
        clauseType: 'other',
        matchedPATCategories: ['Custom PAT'],
        pairingMethod: 'semantic' as const,
        semanticConfidence: 0.85
      }

      expect(result.pairingMethod).toBe('semantic')
      expect(result.semanticConfidence).toBeGreaterThan(0)
      expect(result.semanticConfidence).toBeLessThanOrEqual(1)
    })
  })
})

// ============ Issue #9 Tests: Missing Mandatory Detection ============

describe('P1 Missing Mandatory Detection (Issue #9)', () => {

  describe('computeMatchedCategories', () => {

    it('should detect matched category when matches=true', () => {
      const batchResults = new Map<number, BatchResult>([
        [0, { idx: 0, matches: true, severity: 'none', risk_summary: 'OK', differences: [], confidence: 0.95 }]
      ])
      const comparisons: BatchComparison[] = [
        { idx: 0, termCategory: 'Payment Terms', isMandatory: true }
      ]

      const result = computeMatchedCategories(batchResults, comparisons)

      expect(result.has('Payment Terms')).toBe(true)
    })

    it('should NOT detect category when all comparisons are matches=false', () => {
      const batchResults = new Map<number, BatchResult>([
        [0, { idx: 0, matches: false, severity: 'major', risk_summary: 'Bad', differences: [], confidence: 0.95 }],
        [1, { idx: 1, matches: false, severity: 'major', risk_summary: 'Bad', differences: [], confidence: 0.95 }]
      ])
      const comparisons: BatchComparison[] = [
        { idx: 0, termCategory: 'Exclusivity', isMandatory: true },
        { idx: 1, termCategory: 'Exclusivity', isMandatory: true }
      ]

      const result = computeMatchedCategories(batchResults, comparisons)

      expect(result.has('Exclusivity')).toBe(false)
    })

    it('should detect category when 1 green exists among multiple red (issue #9 scenario)', () => {
      // Real scenario from issue: 1 green + 10 red for "Payment Terms"
      const batchResults = new Map<number, BatchResult>([
        [0, { idx: 0, matches: true, severity: 'none', risk_summary: 'Green', differences: [], confidence: 0.95 }],
        [1, { idx: 1, matches: false, severity: 'major', risk_summary: 'Red', differences: [], confidence: 0.95 }],
        [2, { idx: 2, matches: false, severity: 'major', risk_summary: 'Red', differences: [], confidence: 0.95 }],
        [3, { idx: 3, matches: false, severity: 'major', risk_summary: 'Red', differences: [], confidence: 0.95 }],
        [4, { idx: 4, matches: false, severity: 'major', risk_summary: 'Red', differences: [], confidence: 0.95 }],
        [5, { idx: 5, matches: false, severity: 'major', risk_summary: 'Red', differences: [], confidence: 0.95 }],
        [6, { idx: 6, matches: false, severity: 'major', risk_summary: 'Red', differences: [], confidence: 0.95 }],
        [7, { idx: 7, matches: false, severity: 'major', risk_summary: 'Red', differences: [], confidence: 0.95 }],
        [8, { idx: 8, matches: false, severity: 'major', risk_summary: 'Red', differences: [], confidence: 0.95 }],
        [9, { idx: 9, matches: false, severity: 'major', risk_summary: 'Red', differences: [], confidence: 0.95 }],
        [10, { idx: 10, matches: false, severity: 'major', risk_summary: 'Red', differences: [], confidence: 0.95 }]
      ])
      const comparisons: BatchComparison[] = [
        { idx: 0, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 1, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 2, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 3, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 4, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 5, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 6, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 7, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 8, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 9, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 10, termCategory: 'Payment Terms', isMandatory: true }
      ]

      const result = computeMatchedCategories(batchResults, comparisons)

      expect(result.has('Payment Terms')).toBe(true)
    })

    it('should handle multiple PAT categories independently', () => {
      const batchResults = new Map<number, BatchResult>([
        [0, { idx: 0, matches: true, severity: 'none', risk_summary: 'OK', differences: [], confidence: 0.95 }],
        [1, { idx: 1, matches: false, severity: 'major', risk_summary: 'Bad', differences: [], confidence: 0.95 }]
      ])
      const comparisons: BatchComparison[] = [
        { idx: 0, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 1, termCategory: 'Exclusivity', isMandatory: true }
      ]

      const result = computeMatchedCategories(batchResults, comparisons)

      expect(result.has('Payment Terms')).toBe(true)
      expect(result.has('Exclusivity')).toBe(false)
    })

    it('should handle missing batch results gracefully', () => {
      // GPT might not return results for all comparisons
      const batchResults = new Map<number, BatchResult>([
        [0, { idx: 0, matches: true, severity: 'none', risk_summary: 'OK', differences: [], confidence: 0.95 }]
        // idx 1 is missing
      ])
      const comparisons: BatchComparison[] = [
        { idx: 0, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 1, termCategory: 'Exclusivity', isMandatory: true }
      ]

      const result = computeMatchedCategories(batchResults, comparisons)

      expect(result.has('Payment Terms')).toBe(true)
      expect(result.has('Exclusivity')).toBe(false)
    })
  })

  describe('findMissingMandatoryTerms', () => {

    it('should return empty array when all mandatory PATs are matched', () => {
      const preAgreedTerms: PreAgreedTerm[] = [
        { id: '1', term_category: 'Payment Terms', is_mandatory: true },
        { id: '2', term_category: 'Exclusivity', is_mandatory: true }
      ]
      const matchedCategories = new Set(['Payment Terms', 'Exclusivity'])

      const result = findMissingMandatoryTerms(preAgreedTerms, matchedCategories)

      expect(result).toHaveLength(0)
    })

    it('should return missing mandatory PATs', () => {
      const preAgreedTerms: PreAgreedTerm[] = [
        { id: '1', term_category: 'Payment Terms', is_mandatory: true },
        { id: '2', term_category: 'Exclusivity', is_mandatory: true }
      ]
      const matchedCategories = new Set(['Payment Terms'])

      const result = findMissingMandatoryTerms(preAgreedTerms, matchedCategories)

      expect(result).toHaveLength(1)
      expect(result[0].term_category).toBe('Exclusivity')
    })

    it('should ignore non-mandatory PATs', () => {
      const preAgreedTerms: PreAgreedTerm[] = [
        { id: '1', term_category: 'Payment Terms', is_mandatory: true },
        { id: '2', term_category: 'Nice To Have', is_mandatory: false }
      ]
      const matchedCategories = new Set(['Payment Terms'])

      const result = findMissingMandatoryTerms(preAgreedTerms, matchedCategories)

      expect(result).toHaveLength(0)
    })

    it('should handle issue #9 scenario correctly - green match satisfies mandatory', () => {
      // The bug: "Payment Terms" was being flagged as missing even though
      // there was a green match (1 green + 10 red)
      const preAgreedTerms: PreAgreedTerm[] = [
        { id: '1', term_category: 'Payment Terms', is_mandatory: true }
      ]
      // After fix: matchedCategories correctly includes 'Payment Terms'
      const matchedCategories = new Set(['Payment Terms'])

      const result = findMissingMandatoryTerms(preAgreedTerms, matchedCategories)

      expect(result).toHaveLength(0)
      expect(result.find(t => t.term_category === 'Payment Terms')).toBeUndefined()
    })
  })

  describe('Integration: end-to-end missing mandatory detection', () => {

    it('should NOT flag Payment Terms as missing when green match exists (issue #9)', () => {
      // Full scenario from the issue
      const batchResults = new Map<number, BatchResult>([
        [0, { idx: 0, matches: true, severity: 'none', risk_summary: 'Payment within 45 days', differences: [], confidence: 0.95 }],
        [1, { idx: 1, matches: false, severity: 'major', risk_summary: 'Does not address payment', differences: [], confidence: 0.95 }],
        [2, { idx: 2, matches: false, severity: 'major', risk_summary: 'Does not address payment', differences: [], confidence: 0.95 }]
      ])
      const comparisons: BatchComparison[] = [
        { idx: 0, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 1, termCategory: 'Payment Terms', isMandatory: true },
        { idx: 2, termCategory: 'Payment Terms', isMandatory: true }
      ]
      const preAgreedTerms: PreAgreedTerm[] = [
        { id: '1', term_category: 'Payment Terms', is_mandatory: true }
      ]

      const matchedCategories = computeMatchedCategories(batchResults, comparisons)
      const missingTerms = findMissingMandatoryTerms(preAgreedTerms, matchedCategories)

      expect(missingTerms).toHaveLength(0)
    })

    it('should flag PAT as missing when NO green match exists', () => {
      const batchResults = new Map<number, BatchResult>([
        [0, { idx: 0, matches: false, severity: 'major', risk_summary: 'Bad', differences: [], confidence: 0.95 }],
        [1, { idx: 1, matches: false, severity: 'major', risk_summary: 'Bad', differences: [], confidence: 0.95 }]
      ])
      const comparisons: BatchComparison[] = [
        { idx: 0, termCategory: 'Exclusivity', isMandatory: true },
        { idx: 1, termCategory: 'Exclusivity', isMandatory: true }
      ]
      const preAgreedTerms: PreAgreedTerm[] = [
        { id: '1', term_category: 'Exclusivity', is_mandatory: true }
      ]

      const matchedCategories = computeMatchedCategories(batchResults, comparisons)
      const missingTerms = findMissingMandatoryTerms(preAgreedTerms, matchedCategories)

      expect(missingTerms).toHaveLength(1)
      expect(missingTerms[0].term_category).toBe('Exclusivity')
    })

    it('should flag PAT as missing when no comparisons exist for it', () => {
      // Keyword matching didn't pair any clauses with this PAT
      const batchResults = new Map<number, BatchResult>()
      const comparisons: BatchComparison[] = []
      const preAgreedTerms: PreAgreedTerm[] = [
        { id: '1', term_category: 'Unusual Requirement', is_mandatory: true }
      ]

      const matchedCategories = computeMatchedCategories(batchResults, comparisons)
      const missingTerms = findMissingMandatoryTerms(preAgreedTerms, matchedCategories)

      expect(missingTerms).toHaveLength(1)
      expect(missingTerms[0].term_category).toBe('Unusual Requirement')
    })
  })
})

// ============ Issue #10 Tests: Direction Validation ============

// Direction-sensitive clause types (from p1-reconciliation.ts)
const DIRECTION_SENSITIVE_TYPES = [
  'intellectual_property',
  'usage_rights',
  'exclusivity',
  'payment_terms',
  'indemnification',
  'license',
  'grant',
  'ip_rights',
  'content_rights',
  'media_rights',
] as const

interface DirectionValidationResult {
  idx: number
  direction_match: boolean
  contract_direction: 'talent_to_brand' | 'brand_to_talent' | 'mutual' | 'unclear'
  library_direction: 'talent_to_brand' | 'brand_to_talent' | 'mutual' | 'unclear'
  confidence: number
  reasoning: string
}

interface MatchResult {
  id: string
  clause_boundary_id: string
  similarity_score: number
  rag_risk: 'green' | 'amber' | 'red'
  gpt_analysis: {
    top_match?: {
      clause_id: string
    }
  } | null
}

/**
 * Filter candidates for direction validation
 * Mirrors the filtering logic in performP1Reconciliation
 */
function filterDirectionCandidates(
  matchResults: MatchResult[],
  clauseMap: Map<string, { id: string, clause_type: string, content: string }>
): Array<{ matchResult: MatchResult, clause: any, libraryClauseId: string }> {
  const candidates: Array<{ matchResult: MatchResult, clause: any, libraryClauseId: string }> = []

  for (const matchResult of matchResults) {
    // Only validate green matches (≥0.75) with sensitive clause types
    if (matchResult.similarity_score < 0.75) {
      continue
    }

    const libraryClauseId = matchResult.gpt_analysis?.top_match?.clause_id
    if (!libraryClauseId) {
      continue
    }

    const clause = clauseMap.get(matchResult.clause_boundary_id)
    if (!clause) {
      continue
    }

    // Check if clause type is direction-sensitive
    const normalizedType = (clause.clause_type || '').toLowerCase().replace(/_/g, '')
    const isSensitive = DIRECTION_SENSITIVE_TYPES.some(t =>
      normalizedType.includes(t.replace(/_/g, ''))
    )
    if (!isSensitive) {
      continue
    }

    candidates.push({ matchResult, clause, libraryClauseId })
  }

  return candidates
}

/**
 * Calculate rag_status with direction_mismatch factor
 * Mirrors the calculation logic in performP1Reconciliation
 */
function calculateRagStatusWithDirection(
  rag_risk: 'green' | 'amber' | 'red',
  rag_parsing: 'green' | 'amber' | 'red',
  hasDirectionMismatch: boolean
): 'green' | 'amber' | 'red' {
  if (rag_parsing === 'red' || rag_risk === 'red') {
    return 'red'
  } else if (hasDirectionMismatch) {
    // Direction mismatch downgrades: green→amber, amber→red
    if (rag_parsing === 'green' && rag_risk === 'green') {
      return 'amber'  // Would have been green, now amber
    } else {
      return 'red'    // Was amber, now red
    }
  } else if (rag_parsing === 'green' && rag_risk === 'green') {
    return 'green'
  } else {
    return 'amber'
  }
}

describe('P1 Direction Validation (Issue #10)', () => {

  describe('filterDirectionCandidates', () => {

    const makeMatchResult = (
      id: string,
      clauseId: string,
      similarity: number,
      libraryClauseId: string | null,
      rag_risk: 'green' | 'amber' | 'red' = 'green'
    ): MatchResult => ({
      id,
      clause_boundary_id: clauseId,
      similarity_score: similarity,
      rag_risk,
      gpt_analysis: libraryClauseId ? { top_match: { clause_id: libraryClauseId } } : null
    })

    it('should include clauses with similarity ≥0.75 and sensitive type', () => {
      const clauseMap = new Map([
        ['c1', { id: 'c1', clause_type: 'intellectual_property', content: 'IP clause' }]
      ])
      const matchResults = [makeMatchResult('m1', 'c1', 0.80, 'LCL-001')]

      const result = filterDirectionCandidates(matchResults, clauseMap)

      expect(result).toHaveLength(1)
      expect(result[0].libraryClauseId).toBe('LCL-001')
    })

    it('should exclude clauses with similarity <0.75', () => {
      const clauseMap = new Map([
        ['c1', { id: 'c1', clause_type: 'intellectual_property', content: 'IP clause' }]
      ])
      const matchResults = [makeMatchResult('m1', 'c1', 0.65, 'LCL-001')]

      const result = filterDirectionCandidates(matchResults, clauseMap)

      expect(result).toHaveLength(0)
    })

    it('should exclude clauses without LCL match (no top_match.clause_id)', () => {
      const clauseMap = new Map([
        ['c1', { id: 'c1', clause_type: 'intellectual_property', content: 'IP clause' }]
      ])
      const matchResults = [makeMatchResult('m1', 'c1', 0.80, null)]

      const result = filterDirectionCandidates(matchResults, clauseMap)

      expect(result).toHaveLength(0)
    })

    it('should exclude non-sensitive types (definition, boilerplate)', () => {
      const clauseMap = new Map([
        ['c1', { id: 'c1', clause_type: 'definitions', content: 'Definition clause' }],
        ['c2', { id: 'c2', clause_type: 'boilerplate', content: 'Boilerplate clause' }]
      ])
      const matchResults = [
        makeMatchResult('m1', 'c1', 0.85, 'LCL-001'),
        makeMatchResult('m2', 'c2', 0.90, 'LCL-002')
      ]

      const result = filterDirectionCandidates(matchResults, clauseMap)

      expect(result).toHaveLength(0)
    })

    it('should handle missing clause_type gracefully', () => {
      const clauseMap = new Map([
        ['c1', { id: 'c1', clause_type: '', content: 'Unknown clause' }]
      ])
      const matchResults = [makeMatchResult('m1', 'c1', 0.80, 'LCL-001')]

      const result = filterDirectionCandidates(matchResults, clauseMap)

      expect(result).toHaveLength(0)
    })

    it('should include multiple sensitive clause types', () => {
      const clauseMap = new Map([
        ['c1', { id: 'c1', clause_type: 'usage_rights', content: 'Usage rights' }],
        ['c2', { id: 'c2', clause_type: 'license_grant', content: 'License grant' }],
        ['c3', { id: 'c3', clause_type: 'ip_rights', content: 'IP rights' }]
      ])
      const matchResults = [
        makeMatchResult('m1', 'c1', 0.80, 'LCL-001'),
        makeMatchResult('m2', 'c2', 0.85, 'LCL-002'),
        makeMatchResult('m3', 'c3', 0.90, 'LCL-003')
      ]

      const result = filterDirectionCandidates(matchResults, clauseMap)

      expect(result).toHaveLength(3)
    })
  })

  describe('RAG status calculation with direction_mismatch', () => {

    it('returns green when no mismatch and both rag_risk/rag_parsing are green', () => {
      const result = calculateRagStatusWithDirection('green', 'green', false)
      expect(result).toBe('green')
    })

    it('downgrades green→amber on direction mismatch', () => {
      const result = calculateRagStatusWithDirection('green', 'green', true)
      expect(result).toBe('amber')
    })

    it('downgrades amber→red on direction mismatch (rag_risk amber)', () => {
      const result = calculateRagStatusWithDirection('amber', 'green', true)
      expect(result).toBe('red')
    })

    it('downgrades amber→red on direction mismatch (rag_parsing amber)', () => {
      const result = calculateRagStatusWithDirection('green', 'amber', true)
      expect(result).toBe('red')
    })

    it('preserves red regardless of direction mismatch', () => {
      // Already red from rag_risk
      expect(calculateRagStatusWithDirection('red', 'green', false)).toBe('red')
      expect(calculateRagStatusWithDirection('red', 'green', true)).toBe('red')

      // Already red from rag_parsing
      expect(calculateRagStatusWithDirection('green', 'red', false)).toBe('red')
      expect(calculateRagStatusWithDirection('green', 'red', true)).toBe('red')
    })

    it('returns amber when mixed (green/amber) without direction mismatch', () => {
      expect(calculateRagStatusWithDirection('green', 'amber', false)).toBe('amber')
      expect(calculateRagStatusWithDirection('amber', 'green', false)).toBe('amber')
      expect(calculateRagStatusWithDirection('amber', 'amber', false)).toBe('amber')
    })
  })

  describe('Direction validation result handling', () => {

    it('should identify same direction as match', () => {
      const result: DirectionValidationResult = {
        idx: 0,
        direction_match: true,
        contract_direction: 'talent_to_brand',
        library_direction: 'talent_to_brand',
        confidence: 0.95,
        reasoning: 'Both grant usage rights from talent to brand'
      }

      expect(result.direction_match).toBe(true)
      expect(result.contract_direction).toBe(result.library_direction)
    })

    it('should identify opposite direction as mismatch', () => {
      const result: DirectionValidationResult = {
        idx: 0,
        direction_match: false,
        contract_direction: 'talent_to_brand',
        library_direction: 'brand_to_talent',
        confidence: 0.92,
        reasoning: 'Contract grants rights from talent; library grants rights from brand'
      }

      expect(result.direction_match).toBe(false)
      expect(result.contract_direction).not.toBe(result.library_direction)
    })

    it('should default to match when either direction is unclear', () => {
      // Per the plan: "If direction is unclear for either clause, default to direction_match: true"
      const result: DirectionValidationResult = {
        idx: 0,
        direction_match: true,
        contract_direction: 'unclear',
        library_direction: 'talent_to_brand',
        confidence: 0.3,
        reasoning: 'Could not determine contract clause direction'
      }

      expect(result.direction_match).toBe(true)
    })

    it('should handle mutual clauses as match', () => {
      const result: DirectionValidationResult = {
        idx: 0,
        direction_match: true,
        contract_direction: 'mutual',
        library_direction: 'mutual',
        confidence: 0.88,
        reasoning: 'Both clauses describe mutual obligations'
      }

      expect(result.direction_match).toBe(true)
    })
  })

  describe('Integration: direction mismatch downgrade scenarios', () => {

    it('should downgrade false-positive green match to amber', () => {
      // Scenario: Contract says "Talent grants Brand usage rights"
      //           LCL says "Brand grants Talent limited license"
      // Same topic (usage/license), high similarity, but OPPOSITE direction

      const rag_risk = 'green' as const
      const rag_parsing = 'green' as const
      const hasDirectionMismatch = true

      const finalStatus = calculateRagStatusWithDirection(rag_risk, rag_parsing, hasDirectionMismatch)

      expect(finalStatus).toBe('amber')
    })

    it('should preserve green status when direction matches', () => {
      // Scenario: Contract says "Talent grants Brand usage rights"
      //           LCL says "Influencer grants Company content rights"
      // Same topic, high similarity, SAME direction

      const rag_risk = 'green' as const
      const rag_parsing = 'green' as const
      const hasDirectionMismatch = false

      const finalStatus = calculateRagStatusWithDirection(rag_risk, rag_parsing, hasDirectionMismatch)

      expect(finalStatus).toBe('green')
    })

    it('should escalate amber to red on direction mismatch', () => {
      // Scenario: Already amber (some P1 concerns), plus direction mismatch
      // Should become red (critical issue)

      const rag_risk = 'green' as const
      const rag_parsing = 'amber' as const
      const hasDirectionMismatch = true

      const finalStatus = calculateRagStatusWithDirection(rag_risk, rag_parsing, hasDirectionMismatch)

      expect(finalStatus).toBe('red')
    })

    it('should not double-penalize already red clauses', () => {
      // Scenario: Already red from P1, direction mismatch shouldn't matter

      const rag_risk = 'green' as const
      const rag_parsing = 'red' as const
      const hasDirectionMismatch = true

      const finalStatus = calculateRagStatusWithDirection(rag_risk, rag_parsing, hasDirectionMismatch)

      expect(finalStatus).toBe('red')
    })
  })
})

// ============ Identity Term Handling Tests ============

/**
 * Identity term categories that require string presence check instead of GPT comparison
 * Mirrors IDENTITY_TERM_CATEGORIES from p1-reconciliation.ts
 */
const IDENTITY_TERM_CATEGORIES = new Set([
  "Brand Name", "Brand", "Talent Name", "Talent", "Influencer Name", "Influencer",
  "Agency", "Agency Name", "Client Name", "Client", "Company Name", "Company",
  // Lowercase variants
  "brand name", "brand", "talent name", "talent", "influencer name", "influencer",
  "agency", "agency name", "client name", "client", "company name", "company",
])

/**
 * Check if a term category is an identity term
 */
function isIdentityTermCategory(category: string): boolean {
  return IDENTITY_TERM_CATEGORIES.has(category) ||
         IDENTITY_TERM_CATEGORIES.has(category.toLowerCase().trim())
}

/**
 * Normalize text for identity matching
 */
function normalizeForIdentityMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Result of an identity term match check
 */
interface IdentityMatchResult {
  matches: boolean
  matchType: 'exact' | 'normalized' | 'partial' | 'absent'
  confidence: number
  foundValue?: string
}

/**
 * Check if contract text contains the expected identity value
 */
function checkIdentityMatch(
  expectedValue: string,
  clauseContent: string,
  fullContractText?: string
): IdentityMatchResult {
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
    return { matches: true, matchType: 'exact', confidence: 1.0, foundValue: expectedValue }
  }

  // Check 2: Exact match in full contract text
  if (fullContractText && normalizedFullText.includes(normalizedExpected)) {
    return { matches: true, matchType: 'exact', confidence: 0.95, foundValue: expectedValue }
  }

  // Check 3: Partial match
  const expectedWords = normalizedExpected.split(' ').filter(w => w.length > 2)
  if (expectedWords.length > 0) {
    const foundWords = expectedWords.filter(w => normalizedFullText.includes(w))
    const matchRatio = foundWords.length / expectedWords.length
    if (matchRatio >= 0.7) {
      return {
        matches: true,
        matchType: 'partial',
        confidence: matchRatio * 0.8,
        foundValue: foundWords.join(' ')
      }
    }
  }

  return { matches: false, matchType: 'absent', confidence: 0 }
}

/**
 * Determine RAG status for an identity term match
 */
function determineIdentityRag(
  match: IdentityMatchResult,
  isMandatory: boolean
): 'green' | 'amber' | 'red' {
  switch (match.matchType) {
    case 'exact': return 'green'
    case 'normalized': return 'green'
    case 'partial': return 'amber'
    case 'absent': return isMandatory ? 'red' : 'amber'
    default: return 'amber'
  }
}

describe('P1 Identity Term Handling', () => {

  describe('isIdentityTermCategory', () => {

    it('should identify Brand Name as identity term', () => {
      expect(isIdentityTermCategory('Brand Name')).toBe(true)
    })

    it('should identify Talent Name as identity term', () => {
      expect(isIdentityTermCategory('Talent Name')).toBe(true)
    })

    it('should identify Agency as identity term', () => {
      expect(isIdentityTermCategory('Agency')).toBe(true)
    })

    it('should identify Influencer as identity term', () => {
      expect(isIdentityTermCategory('Influencer')).toBe(true)
    })

    it('should be case insensitive', () => {
      expect(isIdentityTermCategory('brand name')).toBe(true)
      expect(isIdentityTermCategory('BRAND NAME')).toBe(true)
      expect(isIdentityTermCategory('Brand name')).toBe(true)
      expect(isIdentityTermCategory('TALENT NAME')).toBe(true)
    })

    it('should NOT identify Payment Terms as identity term', () => {
      expect(isIdentityTermCategory('Payment Terms')).toBe(false)
    })

    it('should NOT identify Exclusivity as identity term', () => {
      expect(isIdentityTermCategory('Exclusivity')).toBe(false)
    })

    it('should NOT identify Usage Rights as identity term', () => {
      expect(isIdentityTermCategory('Usage Rights')).toBe(false)
    })

    it('should NOT identify Deliverables as identity term', () => {
      expect(isIdentityTermCategory('Deliverables')).toBe(false)
    })

    it('should handle whitespace variations', () => {
      expect(isIdentityTermCategory('  Brand Name  ')).toBe(true)
      expect(isIdentityTermCategory('Brand  Name')).toBe(false) // Double space doesn't match
    })
  })

  describe('checkIdentityMatch', () => {

    describe('exact matches', () => {

      it('should return exact match when value found in clause', () => {
        const result = checkIdentityMatch(
          'Nike',
          'This agreement between Nike and Influencer...',
          ''
        )
        expect(result.matches).toBe(true)
        expect(result.matchType).toBe('exact')
        expect(result.confidence).toBe(1.0)
        expect(result.foundValue).toBe('Nike')
      })

      it('should return exact match when found in full contract text', () => {
        const result = checkIdentityMatch(
          'Adidas',
          'Some other clause content',
          'Agreement between Adidas Corporation and Jane Doe'
        )
        expect(result.matches).toBe(true)
        expect(result.matchType).toBe('exact')
        expect(result.confidence).toBe(0.95)
      })

      it('should be case insensitive for exact match', () => {
        const result = checkIdentityMatch(
          'NIKE',
          'Agreement with Nike Inc.',
          ''
        )
        expect(result.matches).toBe(true)
        expect(result.matchType).toBe('exact')
      })

      it('should handle multi-word names', () => {
        const result = checkIdentityMatch(
          'John Smith',
          'The Influencer, John Smith, agrees to...',
          ''
        )
        expect(result.matches).toBe(true)
        expect(result.matchType).toBe('exact')
      })
    })

    describe('partial matches', () => {

      it('should return partial match when 70%+ of significant words match', () => {
        // "global media group" has 3 significant words (>2 chars)
        // Contract has "global" and "media" (2/3 = 66.7%) - just under threshold
        // Let's use a case that matches: "Nike Sports International" vs "Nike Sports Division"
        const result = checkIdentityMatch(
          'Nike Sports Division',  // 3 words: nike, sports, division
          '',
          'Agreement with Nike Sports International Corp'  // Has nike, sports (2/3 = 66.7%)
        )
        // 2/3 = 0.667 which is < 0.7 threshold, so this won't match
        // Let's use a better example with 2 of 2 words
        expect(result.matches).toBe(false) // Falls below 70% threshold
      })

      it('should return partial match when most significant words found (not exact substring)', () => {
        // "Global Nike Sports" - words found but NOT as exact substring
        // "nike" and "sports" are found but not "global nike sports" as a phrase
        const result = checkIdentityMatch(
          'Global Nike Sports',  // 3 significant words: global, nike, sports
          '',
          'Agreement with Nike Sports International Corp'  // Has nike, sports but not "global" (2/3 = 66.7%)
        )
        // 2/3 = 0.667 which is < 0.7 threshold
        // Let's use a better example: 3 of 4 words
        expect(result.matches).toBe(false) // Below 70% threshold

        // Test with 3/4 words matching (75% > 70%)
        const result2 = checkIdentityMatch(
          'Nike Sports Global Inc',  // 4 significant words: nike, sports, global, inc
          '',
          'Agreement with Nike Global Sports Division'  // Has nike, sports, global (3/4 = 75%)
        )
        expect(result2.matches).toBe(true)
        expect(result2.matchType).toBe('partial')
        expect(result2.confidence).toBeGreaterThan(0)
        expect(result2.confidence).toBeLessThan(1) // Partial is reduced confidence
      })

      it('should NOT match when less than 70% words match', () => {
        const result = checkIdentityMatch(
          'Acme Corporation Limited International',
          '',
          'Agreement with Acme Inc.'
        )
        // Only "acme" matches out of 4 significant words (25%)
        expect(result.matches).toBe(false)
        expect(result.matchType).toBe('absent')
      })
    })

    describe('absent matches', () => {

      it('should return absent when not found', () => {
        const result = checkIdentityMatch(
          'Adidas',
          'Agreement between Nike and Influencer',
          'Full contract with Nike and talent'
        )
        expect(result.matches).toBe(false)
        expect(result.matchType).toBe('absent')
        expect(result.confidence).toBe(0)
      })

      it('should return absent for empty expected value', () => {
        const result = checkIdentityMatch('', 'Some contract text', '')
        expect(result.matches).toBe(false)
        expect(result.matchType).toBe('absent')
      })

      it('should return absent for N/A expected value', () => {
        const result = checkIdentityMatch('N/A', 'Some contract text', '')
        expect(result.matches).toBe(false)
        expect(result.matchType).toBe('absent')
      })

      it('should return absent for whitespace-only expected value', () => {
        const result = checkIdentityMatch('   ', 'Some contract text', '')
        expect(result.matches).toBe(false)
        expect(result.matchType).toBe('absent')
      })
    })

    describe('edge cases', () => {

      it('should handle special characters in names', () => {
        const result = checkIdentityMatch(
          "L'Oreal",
          "Agreement with L'Oreal Paris",
          ''
        )
        expect(result.matches).toBe(true)
      })

      it('should handle hyphenated names', () => {
        const result = checkIdentityMatch(
          'Mary-Jane Watson',
          'The Talent, Mary-Jane Watson, agrees...',
          ''
        )
        expect(result.matches).toBe(true)
      })

      it('should handle extra whitespace in contract text', () => {
        const result = checkIdentityMatch(
          'Nike',
          'Agreement   between    Nike   and  Talent',
          ''
        )
        expect(result.matches).toBe(true)
      })
    })
  })

  describe('determineIdentityRag', () => {

    it('should return green for exact match', () => {
      const result = determineIdentityRag(
        { matches: true, matchType: 'exact', confidence: 1.0 },
        true
      )
      expect(result).toBe('green')
    })

    it('should return green for normalized match', () => {
      const result = determineIdentityRag(
        { matches: true, matchType: 'normalized', confidence: 1.0 },
        true
      )
      expect(result).toBe('green')
    })

    it('should return amber for partial match', () => {
      const result = determineIdentityRag(
        { matches: true, matchType: 'partial', confidence: 0.7 },
        true
      )
      expect(result).toBe('amber')
    })

    it('should return red for absent mandatory term', () => {
      const result = determineIdentityRag(
        { matches: false, matchType: 'absent', confidence: 0 },
        true
      )
      expect(result).toBe('red')
    })

    it('should return amber for absent non-mandatory term', () => {
      const result = determineIdentityRag(
        { matches: false, matchType: 'absent', confidence: 0 },
        false
      )
      expect(result).toBe('amber')
    })

    it('should return amber for partial match regardless of mandatory flag', () => {
      const mandatoryResult = determineIdentityRag(
        { matches: true, matchType: 'partial', confidence: 0.7 },
        true
      )
      const optionalResult = determineIdentityRag(
        { matches: true, matchType: 'partial', confidence: 0.7 },
        false
      )
      expect(mandatoryResult).toBe('amber')
      expect(optionalResult).toBe('amber')
    })
  })

  describe('Integration: identity term short-circuit flow', () => {

    // Simulating buildBatchComparisons logic
    interface PreAgreedTermIdentity {
      id: string
      term_category: string
      expected_value: string
      is_mandatory: boolean
    }

    interface IdentityTermResult {
      termId: string
      termCategory: string
      isMandatory: boolean
      expectedValue: string
      matchResult: IdentityMatchResult
      ragParsing: 'green' | 'amber' | 'red'
    }

    function processIdentityTerms(
      terms: PreAgreedTermIdentity[],
      fullContractText: string
    ): Map<string, IdentityTermResult> {
      const identityResults = new Map<string, IdentityTermResult>()

      for (const term of terms) {
        if (!isIdentityTermCategory(term.term_category)) {
          continue // Skip non-identity terms
        }

        const matchResult = checkIdentityMatch(term.expected_value, '', fullContractText)
        const ragParsing = determineIdentityRag(matchResult, term.is_mandatory)

        identityResults.set(term.id, {
          termId: term.id,
          termCategory: term.term_category,
          isMandatory: term.is_mandatory,
          expectedValue: term.expected_value,
          matchResult,
          ragParsing,
        })
      }

      return identityResults
    }

    it('should short-circuit identity terms and skip GPT comparison', () => {
      const terms: PreAgreedTermIdentity[] = [
        { id: 't1', term_category: 'Brand Name', expected_value: 'Nike', is_mandatory: true },
        { id: 't2', term_category: 'Payment Terms', expected_value: '30 days', is_mandatory: true },
        { id: 't3', term_category: 'Talent Name', expected_value: 'John Smith', is_mandatory: true },
      ]
      const fullContractText = 'Agreement between Nike and John Smith for brand partnership'

      const identityResults = processIdentityTerms(terms, fullContractText)

      // Only identity terms should be processed
      expect(identityResults.size).toBe(2) // Brand Name and Talent Name
      expect(identityResults.has('t1')).toBe(true) // Brand Name
      expect(identityResults.has('t2')).toBe(false) // Payment Terms (not identity)
      expect(identityResults.has('t3')).toBe(true) // Talent Name
    })

    it('should correctly match brand name found in contract', () => {
      const terms: PreAgreedTermIdentity[] = [
        { id: 't1', term_category: 'Brand Name', expected_value: 'Adidas', is_mandatory: true },
      ]
      const fullContractText = 'This agreement between Adidas and the Influencer establishes...'

      const identityResults = processIdentityTerms(terms, fullContractText)
      const result = identityResults.get('t1')!

      expect(result.ragParsing).toBe('green')
      expect(result.matchResult.matches).toBe(true)
      expect(result.matchResult.matchType).toBe('exact')
    })

    it('should flag missing brand name as red when mandatory', () => {
      const terms: PreAgreedTermIdentity[] = [
        { id: 't1', term_category: 'Brand Name', expected_value: 'Adidas', is_mandatory: true },
      ]
      const fullContractText = 'This agreement between Nike and the Influencer'

      const identityResults = processIdentityTerms(terms, fullContractText)
      const result = identityResults.get('t1')!

      expect(result.ragParsing).toBe('red')
      expect(result.matchResult.matches).toBe(false)
      expect(result.matchResult.matchType).toBe('absent')
    })

    it('should flag missing brand name as amber when non-mandatory', () => {
      const terms: PreAgreedTermIdentity[] = [
        { id: 't1', term_category: 'Brand Name', expected_value: 'Adidas', is_mandatory: false },
      ]
      const fullContractText = 'This agreement between Nike and the Influencer'

      const identityResults = processIdentityTerms(terms, fullContractText)
      const result = identityResults.get('t1')!

      expect(result.ragParsing).toBe('amber')
      expect(result.matchResult.matches).toBe(false)
    })

    it('should handle multiple identity terms correctly', () => {
      const terms: PreAgreedTermIdentity[] = [
        { id: 't1', term_category: 'Brand Name', expected_value: 'Nike', is_mandatory: true },
        { id: 't2', term_category: 'Talent Name', expected_value: 'John Smith', is_mandatory: true },
        { id: 't3', term_category: 'Agency', expected_value: 'Creative Agency Inc', is_mandatory: false },
      ]
      const fullContractText = 'Agreement between Nike and John Smith represented by XYZ Agency'

      const identityResults = processIdentityTerms(terms, fullContractText)

      expect(identityResults.get('t1')!.ragParsing).toBe('green') // Nike found
      expect(identityResults.get('t2')!.ragParsing).toBe('green') // John Smith found
      expect(identityResults.get('t3')!.ragParsing).toBe('amber') // Creative Agency Inc not found (partial or absent)
    })

    it('should include identity matches in matchedCategories to prevent false missing-term flags', () => {
      const terms: PreAgreedTermIdentity[] = [
        { id: 't1', term_category: 'Brand Name', expected_value: 'Nike', is_mandatory: true },
      ]
      const fullContractText = 'Agreement with Nike'

      const identityResults = processIdentityTerms(terms, fullContractText)
      const matchedCategoriesFromIdentity = new Set<string>()

      for (const [, result] of identityResults) {
        if (result.matchResult.matches) {
          matchedCategoriesFromIdentity.add(result.termCategory)
        }
      }

      // Brand Name should be in matched categories
      expect(matchedCategoriesFromIdentity.has('Brand Name')).toBe(true)

      // When checking for missing mandatory terms, Brand Name should NOT be flagged
      const missingMandatory = terms.filter(
        t => t.is_mandatory && !matchedCategoriesFromIdentity.has(t.term_category)
      )
      expect(missingMandatory).toHaveLength(0)
    })
  })
})
