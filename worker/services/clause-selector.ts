/**
 * Clause Selector Service
 *
 * Handles clause selection for P1 reconciliation using a Strategy pattern.
 * Each strategy implements a different matching approach, applied in priority order:
 * 1. TypeMatchStrategy - Primary clause type matching
 * 2. FallbackTypeStrategy - Fallback clause types
 * 3. KeywordStrategy - Keyword-based matching
 * 4. EmbeddingStrategy - Embedding similarity fallback
 *
 * @module services/clause-selector
 */

import type {
  PreAgreedTerm,
  ClauseBoundary,
  ClauseMatchResult,
  ClauseCandidate,
  MatchReason,
} from '../types/p1-types'

import {
  TERM_TO_CLAUSE_MAP,
  KEYWORD_MAP,
  CLAUSE_SELECTION_THRESHOLD,
} from '../config/p1-config'

// ============ CLAUSE INDEX ============

/**
 * Pre-indexed clause lookup for O(1) access by clause type
 */
export interface ClauseIndex {
  byType: Map<string, ClauseBoundary[]>
  byId: Map<string, ClauseBoundary>
  matchResultsByClauseId: Map<string, ClauseMatchResult>
  allMatchResults: ClauseMatchResult[]
}

/**
 * Build an index of clauses for efficient lookup
 */
export function buildClauseIndex(
  clauses: ClauseBoundary[],
  matchResults: ClauseMatchResult[]
): ClauseIndex {
  const byType = new Map<string, ClauseBoundary[]>()
  const byId = new Map<string, ClauseBoundary>()
  const matchResultsByClauseId = new Map<string, ClauseMatchResult>()

  // Index clauses by type and ID
  for (const clause of clauses) {
    byId.set(clause.id, clause)

    const existing = byType.get(clause.clause_type) || []
    existing.push(clause)
    byType.set(clause.clause_type, existing)
  }

  // Index match results by clause ID
  for (const result of matchResults) {
    if (result.clause_boundary_id) {
      matchResultsByClauseId.set(result.clause_boundary_id, result)
    }
  }

  return {
    byType,
    byId,
    matchResultsByClauseId,
    allMatchResults: matchResults,
  }
}

// ============ STRATEGY INTERFACE ============

/**
 * Interface for clause selection strategies
 */
export interface ClauseSelectionStrategy {
  readonly name: MatchReason
  select(term: PreAgreedTerm, index: ClauseIndex): ClauseCandidate[]
}

// ============ STRATEGY IMPLEMENTATIONS ============

/**
 * TypeMatchStrategy - Matches clauses by primary clause type mapping
 */
export class TypeMatchStrategy implements ClauseSelectionStrategy {
  readonly name: MatchReason = 'type_match'

  select(term: PreAgreedTerm, index: ClauseIndex): ClauseCandidate[] {
    const category = term.normalized_term_category || term.term_category
    const mapping = TERM_TO_CLAUSE_MAP[category]

    if (!mapping?.primary.length) {
      // Check for GPT-suggested clause type from normalization
      if (term.normalized_clause_type) {
        return this.selectByTypes([term.normalized_clause_type], index)
      }
      return []
    }

    return this.selectByTypes(mapping.primary, index)
  }

  private selectByTypes(types: string[], index: ClauseIndex): ClauseCandidate[] {
    const candidates: ClauseCandidate[] = []

    for (const clauseType of types) {
      const clauses = index.byType.get(clauseType) || []
      for (const clause of clauses) {
        const matchResult = index.matchResultsByClauseId.get(clause.id)
        if (matchResult) {
          candidates.push({ clause, matchResult, matchReason: this.name })
        }
      }
    }

    return candidates
  }
}

/**
 * FallbackTypeStrategy - Matches clauses by fallback clause type mapping
 */
export class FallbackTypeStrategy implements ClauseSelectionStrategy {
  readonly name: MatchReason = 'fallback_match'

  select(term: PreAgreedTerm, index: ClauseIndex): ClauseCandidate[] {
    const category = term.normalized_term_category || term.term_category
    const mapping = TERM_TO_CLAUSE_MAP[category]

    if (!mapping?.fallback.length) return []

    const candidates: ClauseCandidate[] = []

    for (const clauseType of mapping.fallback) {
      const clauses = index.byType.get(clauseType) || []
      for (const clause of clauses) {
        const matchResult = index.matchResultsByClauseId.get(clause.id)
        if (matchResult) {
          candidates.push({ clause, matchResult, matchReason: this.name })
        }
      }
    }

    return candidates
  }
}

/**
 * KeywordStrategy - Matches clauses by keyword overlap
 */
export class KeywordStrategy implements ClauseSelectionStrategy {
  readonly name: MatchReason = 'semantic_fallback'

  select(term: PreAgreedTerm, index: ClauseIndex): ClauseCandidate[] {
    const candidates: ClauseCandidate[] = []

    for (const [clauseId, clause] of index.byId) {
      if (this.keywordMatch(term, clause)) {
        const matchResult = index.matchResultsByClauseId.get(clauseId)
        if (matchResult) {
          candidates.push({ clause, matchResult, matchReason: this.name })
        }
      }
    }

    return candidates
  }

  /**
   * Check if term and clause share related keywords
   */
  private keywordMatch(term: PreAgreedTerm, clause: ClauseBoundary): boolean {
    const normalizedClauseType = clause.clause_type.replace(/_/g, ' ').toLowerCase()
    const termCategory = (term.normalized_term_category || term.term_category).toLowerCase()
    const termDescription = term.term_description.toLowerCase()

    for (const relatedKeywords of Object.values(KEYWORD_MAP)) {
      const clauseMatches = relatedKeywords.some((kw) => normalizedClauseType.includes(kw))
      const termMatches = relatedKeywords.some((kw) =>
        termCategory.includes(kw) || termDescription.includes(kw)
      )
      if (clauseMatches && termMatches) return true
    }

    return false
  }
}

/**
 * EmbeddingStrategy - Matches clauses by embedding similarity score
 * Uses pre-computed similarity scores from the generate-embeddings phase
 */
export class EmbeddingStrategy implements ClauseSelectionStrategy {
  readonly name: MatchReason = 'embedding_similarity'
  private threshold: number

  constructor(threshold: number = CLAUSE_SELECTION_THRESHOLD) {
    this.threshold = threshold
  }

  select(term: PreAgreedTerm, index: ClauseIndex): ClauseCandidate[] {
    // Get top matches above threshold, sorted by similarity
    const eligibleResults = index.allMatchResults
      .filter(m => m.similarity_score && m.similarity_score >= this.threshold)
      .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0))
      .slice(0, 3)

    const candidates: ClauseCandidate[] = []

    for (const matchResult of eligibleResults) {
      if (matchResult.clause_boundary_id) {
        const clause = index.byId.get(matchResult.clause_boundary_id)
        if (clause) {
          candidates.push({ clause, matchResult, matchReason: this.name })
        }
      }
    }

    return candidates
  }
}

// ============ CLAUSE SELECTOR CLASS ============

/**
 * ClauseSelector orchestrates clause selection using multiple strategies
 */
export class ClauseSelector {
  private strategies: ClauseSelectionStrategy[]
  private maxCandidates: number

  constructor(
    strategies?: ClauseSelectionStrategy[],
    maxCandidates: number = 3
  ) {
    // Default strategy chain: type → fallback → keyword → embedding
    this.strategies = strategies || [
      new TypeMatchStrategy(),
      new FallbackTypeStrategy(),
      new KeywordStrategy(),
      new EmbeddingStrategy(),
    ]
    this.maxCandidates = maxCandidates
  }

  /**
   * Select top clauses for a term using the strategy chain
   * Stops at the first strategy that returns candidates
   */
  selectForTerm(term: PreAgreedTerm, index: ClauseIndex): ClauseCandidate[] {
    for (const strategy of this.strategies) {
      const candidates = strategy.select(term, index)
      if (candidates.length > 0) {
        // Sort by similarity score and take top N
        return candidates
          .sort((a, b) => (b.matchResult.similarity_score || 0) - (a.matchResult.similarity_score || 0))
          .slice(0, this.maxCandidates)
      }
    }

    return []
  }

  /**
   * Get the strategy chain names for debugging
   */
  getStrategyNames(): MatchReason[] {
    return this.strategies.map(s => s.name)
  }
}

// ============ STANDALONE FUNCTIONS (for backward compatibility) ============

/**
 * Legacy keyword matching function
 * @deprecated Use KeywordStrategy.keywordMatch instead
 */
export function keywordMatchClause(term: PreAgreedTerm, clause: ClauseBoundary): boolean {
  const strategy = new KeywordStrategy()
  // Access private method through a workaround for backward compat
  const normalizedClauseType = clause.clause_type.replace(/_/g, ' ').toLowerCase()
  const termCategory = (term.normalized_term_category || term.term_category).toLowerCase()
  const termDescription = term.term_description.toLowerCase()

  for (const relatedKeywords of Object.values(KEYWORD_MAP)) {
    const clauseMatches = relatedKeywords.some((kw) => normalizedClauseType.includes(kw))
    const termMatches = relatedKeywords.some((kw) =>
      termCategory.includes(kw) || termDescription.includes(kw)
    )
    if (clauseMatches && termMatches) return true
  }

  return false
}

/**
 * Select top 1-3 clauses for a given PAT term
 * @deprecated Use ClauseSelector.selectForTerm instead
 */
export function selectTopClausesForTerm(
  term: PreAgreedTerm,
  clauses: ClauseBoundary[],
  matchResults: ClauseMatchResult[]
): ClauseCandidate[] {
  const index = buildClauseIndex(clauses, matchResults)
  const selector = new ClauseSelector()
  return selector.selectForTerm(term, index)
}

// Default instances
export const defaultClauseSelector = new ClauseSelector()
