/**
 * P1 Reconciliation: Compare clauses against pre-agreed terms
 * OPTIMIZED: Uses batched GPT calls instead of sequential (5 min → ~15 sec)
 */

import { createClient } from '@supabase/supabase-js'

// ============ CONFIGURATION ============
const P1_MODEL = process.env.P1_MODEL || "gpt-5.1"  // Higher-accuracy model for comparisons
const MAX_RETRIES = 3
const BACKOFF_MULTIPLIER = 2
const MAX_BACKOFF_MS = 30000
const BATCH_SIZE = 50 // Max comparisons per GPT call

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function callWithBackoff<T>(
  fn: () => Promise<T>,
  operationName: string,
  retries = MAX_RETRIES
): Promise<T> {
  try {
    return await fn()
  } catch (err: any) {
    const status = err.status || err.response?.status
    if (status === 429 && retries > 0) {
      const delay = Math.min(1000 * Math.pow(BACKOFF_MULTIPLIER, MAX_RETRIES - retries), MAX_BACKOFF_MS)
      console.warn(`Rate limited on ${operationName}, retrying in ${delay}ms (${retries} retries left)`)
      await sleep(delay)
      return callWithBackoff(fn, operationName, retries - 1)
    }
    throw err
  }
}

interface PreAgreedTerm {
  id: string
  term_category: string
  term_description: string
  expected_value: string
  is_mandatory: boolean
  related_clause_types: string[] | null
  normalized_term_category?: string
  normalized_clause_type?: string
}

interface ClauseBoundary {
  id: string
  content: string
  clause_type: string
  confidence: number
}

interface ClauseMatchResult {
  id: string
  clause_boundary_id: string
  matched_template_id: string | null
  similarity_score: number
  rag_risk: string
  gpt_analysis: any
}

interface ComparisonResult {
  matches: boolean
  deviation_severity: "none" | "minor" | "major"
  explanation: string
  key_differences: string[]
  confidence: number
}

interface BatchComparison {
  idx: number
  clauseId: string
  matchResultId: string
  termId: string
  clauseType: string
  termCategory: string
  isMandatory: boolean
  clauseContent: string
  termDescription: string
  expectedValue: string
  matchReason: 'type_match' | 'fallback_match' | 'semantic_fallback'
  semanticScore: number
}

interface BatchResult {
  idx: number
  matches: boolean
  severity: "none" | "minor" | "major"
  explanation: string
  differences: string[]
  confidence: number
}

interface NormalizedTerm {
  id: string
  term_category?: string
  clause_type_guess?: string
  description?: string
  expected_value?: string
  is_mandatory?: boolean
}

interface ClauseCandidate {
  clause: ClauseBoundary
  matchResult: ClauseMatchResult
  matchReason: 'type_match' | 'fallback_match' | 'semantic_fallback'
}

// ============ TERM CATEGORY → CLAUSE TYPE MAPPING ============
// Maps PAT term_category to allowed clause_types for targeted matching
const TERM_TO_CLAUSE_MAP: Record<string, { primary: string[], fallback: string[] }> = {
  // Payment
  "Payment Terms": { primary: ["payment_terms"], fallback: [] },

  // Exclusivity variants
  "Exclusivity": { primary: ["exclusivity"], fallback: ["deliverables"] },
  "Exclusivity Window": { primary: ["exclusivity"], fallback: ["deliverables"] },
  "Posting Restrictions": { primary: ["exclusivity", "deliverables"], fallback: [] },

  // Usage/IP
  "Usage Rights": { primary: ["intellectual_property"], fallback: ["deliverables"] },
  "Usage & Licensing": { primary: ["intellectual_property"], fallback: ["deliverables"] },

  // Approvals
  "Brand Approval Required": { primary: ["deliverables"], fallback: ["scope_of_work"] },
  "Approval & Reshoot Obligation": { primary: ["deliverables"], fallback: ["scope_of_work"] },

  // Compliance
  "FTC & Disclosure Compliance": { primary: ["compliance"], fallback: ["confidentiality"] },
  "Disclosure Requirements": { primary: ["compliance"], fallback: ["confidentiality"] },

  // Content/Deliverables
  "Content Standards & Lighting": { primary: ["deliverables"], fallback: ["scope_of_work"] },
  "Brand Tags, Hashtags & Links": { primary: ["deliverables"], fallback: [] },
  "Minimum Duration & Feed Placement": { primary: ["deliverables"], fallback: [] },
  "Posting Schedule": { primary: ["deliverables"], fallback: ["scope_of_work"] },
  "Creative Requirements": { primary: ["deliverables"], fallback: ["scope_of_work"] },
  "Delivery Deadline": { primary: ["deliverables"], fallback: ["termination"] },
  "Pre-Production Requirement": { primary: ["deliverables"], fallback: ["scope_of_work"] },
  "Clothing & Styling Requirement": { primary: ["deliverables"], fallback: [] },
  "Analytics Delivery": { primary: ["deliverables"], fallback: ["compliance"] },

  // ============ IDENTITY TERMS ============
  // These terms require presence/string matching, NOT semantic comparison
  // They map to definition/preamble clause types where party names appear
  "Brand Name": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
  "Brand": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
  "Talent Name": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
  "Talent": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
  "Influencer Name": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
  "Influencer": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
  "Agency": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
  "Agency Name": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
  "Client Name": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
  "Client": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
  "Company Name": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
  "Company": { primary: ["term_definition", "scope_of_work"], fallback: ["general_terms"] },
}

// ============ IDENTITY TERM CATEGORIES ============
// These terms require presence/string matching, NOT semantic comparison
// They compare PAT expected_value against contract text directly
export const IDENTITY_TERM_CATEGORIES = new Set([
  // Standard forms
  "Brand Name",
  "Brand",
  "Talent Name",
  "Talent",
  "Influencer Name",
  "Influencer",
  "Agency",
  "Agency Name",
  "Client Name",
  "Client",
  "Company Name",
  "Company",
  // Normalized lowercase variants
  "brand name",
  "brand",
  "talent name",
  "talent",
  "influencer name",
  "influencer",
  "agency",
  "agency name",
  "client name",
  "client",
  "company name",
  "company",
])

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
 * Result of an identity term match check
 */
export interface IdentityMatchResult {
  /** Whether the expected value was found */
  matches: boolean
  /** Type of match: exact, normalized, partial, or absent */
  matchType: 'exact' | 'normalized' | 'partial' | 'absent'
  /** Confidence score 0-1 */
  confidence: number
  /** The value that was found (if any) */
  foundValue?: string
}

/**
 * Result of identity term processing (pre-GPT short-circuit)
 */
export interface IdentityTermResult {
  termId: string
  termCategory: string
  isMandatory: boolean
  expectedValue: string
  matchResult: IdentityMatchResult
  ragParsing: 'green' | 'amber' | 'red'
  explanation: string
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
): 'green' | 'amber' | 'red' {
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

// Legacy keyword matching for unmapped term categories
function keywordMatchClause(term: PreAgreedTerm, clause: ClauseBoundary): boolean {
  const normalizedClauseType = clause.clause_type.replace(/_/g, " ").toLowerCase()
  const termCategory = (term.normalized_term_category || term.term_category).toLowerCase()
  const termDescription = term.term_description.toLowerCase()

  const keywordMap: Record<string, string[]> = {
    payment: ["payment", "fee", "compensation", "invoice"],
    usage: ["usage", "rights", "license", "media"],
    deliverable: ["deliverable", "scope", "work", "content"],
    exclusivity: ["exclusivity", "exclusive", "compete"],
    approval: ["approval", "review", "consent"],
    intellectual: ["intellectual", "ip", "copyright", "ownership"],
  }

  for (const relatedKeywords of Object.values(keywordMap)) {
    const clauseMatches = relatedKeywords.some((kw) => normalizedClauseType.includes(kw))
    const termMatches = relatedKeywords.some((kw) =>
      termCategory.includes(kw) || termDescription.includes(kw)
    )
    if (clauseMatches && termMatches) return true
  }
  return false
}

// Normalize PAT terms via GPT to correct typos and map categories/clauses
async function normalizePatTerms(
  terms: PreAgreedTerm[],
  openaiApiKey: string
): Promise<PreAgreedTerm[]> {
  if (!terms.length) return terms

  const payload = terms.map((t) => ({
    id: t.id,
    term_category: t.term_category,
    description: t.term_description,
    expected_value: t.expected_value,
    is_mandatory: t.is_mandatory,
  }))

  try {
    const response = await callWithBackoff(
      async () => {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
            body: JSON.stringify({
              // Use lightweight model to avoid rate limits on normalization
              model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a contract term normalizer. Normalize pre-agreed terms (PATs) to reduce typos and map to known categories.

Return JSON {"results":[{"id":"...","term_category":"<normalized>","clause_type_guess":"<payment_terms|exclusivity|usage_rights|approval|posting_schedule|compliance|content_standards|analytics|delivery_deadline|pre_production|usage_licensing>","description":"<cleaned description>","expected_value":"<cleaned value>","is_mandatory":true/false}]}`,
              },
              {
                role: "user",
                content: `Normalize these PATs:
${JSON.stringify(payload, null, 0)}

Use the closest known term_category; leave clause_type_guess empty if unsure; keep unknown fields as-is. Output JSON only.`,
              },
            ],
            temperature: 0,
            response_format: { type: "json_object" },
          }),
        })
        if (!res.ok) {
          const err: any = new Error(`OpenAI error ${res.status}`)
          err.status = res.status
          throw err
        }
        return res
      },
      "PAT normalization"
    )

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return terms

    const parsed = JSON.parse(content)
    const normalized: NormalizedTerm[] = parsed.results || parsed || []
    const normalizedById = new Map<string, NormalizedTerm>()
    for (const n of normalized) {
      if (n?.id) normalizedById.set(n.id, n)
    }

    return terms.map((t) => {
      const n = normalizedById.get(t.id)
      if (!n) return t
      return {
        ...t,
        normalized_term_category: n.term_category || t.term_category,
        normalized_clause_type: n.clause_type_guess,
        term_description: n.description || t.term_description,
        expected_value: n.expected_value || t.expected_value,
        is_mandatory: typeof n.is_mandatory === "boolean" ? n.is_mandatory : t.is_mandatory,
      }
    })
  } catch (err) {
    console.warn("⚠️ PAT normalization failed, using raw terms:", err)
    return terms
  }
}

// Select top 1-3 clauses for a given PAT term using type mapping
function selectTopClausesForTerm(
  term: PreAgreedTerm,
  clauses: ClauseBoundary[],
  matchResults: ClauseMatchResult[]
): ClauseCandidate[] {
  const category = term.normalized_term_category || term.term_category
  const mapping = TERM_TO_CLAUSE_MAP[category] || (term.normalized_clause_type
    ? { primary: [term.normalized_clause_type], fallback: [] }
    : undefined)

  // Step 1: Filter by primary clause types
  let candidates: ClauseCandidate[] = []
  if (mapping?.primary.length) {
    for (const clause of clauses) {
      if (!mapping.primary.includes(clause.clause_type)) continue
      const matchResult = matchResults.find(m => m.clause_boundary_id === clause.id)
      if (matchResult) {
        candidates.push({ clause, matchResult, matchReason: 'type_match' })
      }
    }
  }

  // Step 2: Fallback to secondary types if no primary matches
  if (candidates.length === 0 && mapping?.fallback.length) {
    for (const clause of clauses) {
      if (!mapping.fallback.includes(clause.clause_type)) continue
      const matchResult = matchResults.find(m => m.clause_boundary_id === clause.id)
      if (matchResult) {
        candidates.push({ clause, matchResult, matchReason: 'fallback_match' })
      }
    }
  }

  // Step 3: If still empty, use keyword matching for unmapped categories
  if (candidates.length === 0) {
    for (const clause of clauses) {
      if (!keywordMatchClause(term, clause)) continue
      const matchResult = matchResults.find(m => m.clause_boundary_id === clause.id)
      if (matchResult) {
        candidates.push({ clause, matchResult, matchReason: 'semantic_fallback' })
      }
    }
  }

  // Step 4: Sort by similarity score, take top 3
  return candidates
    .sort((a, b) => (b.matchResult.similarity_score || 0) - (a.matchResult.similarity_score || 0))
    .slice(0, 3)
}

/**
 * Build batch comparisons list - term-centric approach (top 1-3 clauses per PAT)
 *
 * IDENTITY TERM SHORT-CIRCUIT:
 * Identity terms (Brand Name, Talent Name, Agency, etc.) are handled via direct
 * string matching against the contract text, bypassing GPT comparison. This:
 * - Reduces GPT API calls and latency
 * - Eliminates false negatives from semantic comparison of referential data
 * - Provides instant GREEN/RED determination based on presence check
 *
 * @param clauses - Extracted clause boundaries from the contract
 * @param matchResults - LCL match results for each clause
 * @param preAgreedTerms - Pre-agreed terms to compare against
 * @param fullContractText - Optional full contract text for identity term matching
 * @returns Comparisons for GPT, term map, and pre-resolved identity results
 */
function buildBatchComparisons(
  clauses: ClauseBoundary[],
  matchResults: ClauseMatchResult[],
  preAgreedTerms: PreAgreedTerm[],
  fullContractText?: string
): {
  comparisons: BatchComparison[],
  termComparisonMap: Map<string, BatchComparison[]>,
  identityResults: Map<string, IdentityTermResult>
} {
  const comparisons: BatchComparison[] = []
  const termComparisonMap = new Map<string, BatchComparison[]>()
  const identityResults = new Map<string, IdentityTermResult>()
  let idx = 0

  // For each PAT term, either short-circuit (identity) or build GPT comparison
  for (const term of preAgreedTerms) {
    const category = term.normalized_term_category || term.term_category

    // ============ IDENTITY TERM SHORT-CIRCUIT ============
    // Identity terms (Brand Name, Talent Name, etc.) use direct string matching
    // instead of GPT semantic comparison
    if (isIdentityTermCategory(category)) {
      const expectedValue = term.expected_value || ''
      const identityMatch = checkIdentityMatch(
        expectedValue,
        '', // No specific clause - check against full contract
        fullContractText
      )

      const ragParsing = determineIdentityRag(identityMatch, term.is_mandatory)
      const explanation = generateIdentityExplanation(identityMatch, expectedValue, category)

      identityResults.set(term.id, {
        termId: term.id,
        termCategory: category,
        isMandatory: term.is_mandatory,
        expectedValue,
        matchResult: identityMatch,
        ragParsing,
        explanation,
      })

      // Skip GPT comparison for identity terms
      continue
    }

    // ============ SEMANTIC TERMS → GPT COMPARISON ============
    const candidates = selectTopClausesForTerm(term, clauses, matchResults)
    if (candidates.length === 0) continue

    const termComparisons: BatchComparison[] = []

    for (const { clause, matchResult, matchReason } of candidates) {
      const comparison: BatchComparison = {
        idx: idx++,
        clauseId: clause.id,
        matchResultId: matchResult.id,
        termId: term.id,
        clauseType: clause.clause_type,
        termCategory: category,
        isMandatory: term.is_mandatory,
        clauseContent: clause.content.substring(0, 600), // Truncate for context window
        termDescription: term.term_description,
        expectedValue: term.expected_value || "N/A",
        matchReason,
        semanticScore: matchResult.similarity_score || 0,
      }
      comparisons.push(comparison)
      termComparisons.push(comparison)
    }

    termComparisonMap.set(term.id, termComparisons)
  }

  return { comparisons, termComparisonMap, identityResults }
}

// Select best match per PAT term (green > amber > red, then by confidence)
function selectBestMatchPerTerm(
  termComparisonMap: Map<string, BatchComparison[]>,
  results: Map<number, BatchResult>
): Map<string, { comparison: BatchComparison, result: BatchResult }> {
  const bestByTerm = new Map<string, { comparison: BatchComparison, result: BatchResult }>()

  for (const [termId, comparisons] of termComparisonMap) {
    for (const comparison of comparisons) {
      const result = results.get(comparison.idx)
      if (!result) continue

      const existing = bestByTerm.get(termId)
      if (!existing || isBetterResult(result, existing.result)) {
        bestByTerm.set(termId, { comparison, result })
      }
    }
  }

  return bestByTerm
}

// Compare results: green > amber > red, then by confidence
function isBetterResult(a: BatchResult, b: BatchResult): boolean {
  const score = (r: BatchResult) => {
    if (r.matches && r.severity === "none") return 3  // green
    if (r.matches && r.severity === "minor") return 2  // amber
    return 1  // red
  }
  return score(a) > score(b) || (score(a) === score(b) && a.confidence > b.confidence)
}

// Execute batched GPT comparison
async function executeBatchComparison(
  comparisons: BatchComparison[],
  openaiApiKey: string,
  model: string = P1_MODEL
): Promise<Map<number, BatchResult>> {
  const results = new Map<number, BatchResult>()

  // Process in batches
  for (let i = 0; i < comparisons.length; i += BATCH_SIZE) {
    const batch = comparisons.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(comparisons.length / BATCH_SIZE)

    console.log(`     Batch ${batchNum}/${totalBatches}: ${batch.length} comparisons...`)

    // Build compact input format
    const comparisonInputs = batch.map((c) => ({
      idx: c.idx,
      term: `[${c.termCategory}] ${c.termDescription} (expected: ${c.expectedValue})${c.isMandatory ? " [MANDATORY]" : ""}`,
      clause: `[${c.clauseType}] ${c.clauseContent}`,
    }))

    const response = await callWithBackoff(
      async () => {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: `You are a contract compliance checker comparing contract clauses against pre-agreed terms.

IMPORTANT: This comparison is for SEMANTIC/LEGAL terms only (payments, exclusivity, deliverables, etc.).
Identity terms (Brand Name, Talent Name, Agency) are handled separately and will NOT appear in this batch.

For each comparison, determine if the clause satisfies the term:

**GREEN (matches=true, severity="none"):** Clause fully satisfies the term requirements.
**AMBER (matches=true, severity="minor"):** Clause partially satisfies but has minor deviations:
  - Timing slightly off (e.g., 45 days vs 30 days)
  - Amount close but not exact
  - Scope slightly broader/narrower than expected
  - Minor wording differences that don't change intent
**RED (matches=false, severity="major"):** Clause conflicts with term OR term requirements absent:
  - Contradictory requirements
  - Missing critical elements specified in the term
  - Fundamentally different scope/intent

PLACEHOLDER HANDLING: Ignore template placeholders like [PARTY A], [PARTY B], [BRAND NAME], [AMOUNT] in
library clauses. Focus on the semantic meaning and legal obligations, not exact party identifiers.

Use AMBER for close-but-not-exact matches. Use RED only for clear conflicts or missing requirements.
Be strict for [MANDATORY] terms. Be concise.

IMPORTANT: Return results for ALL comparisons. Output format:
{"results":[{"idx":0,"matches":true,"severity":"none","explanation":"<15 words>","differences":[],"confidence":0.95},{"idx":1,...},...]}`,
              },
              {
                role: "user",
                content: `Compare these ${batch.length} clause-term pairs and return a result for EACH one:

${JSON.stringify(comparisonInputs, null, 0)}

Return JSON {"results":[...]} with exactly ${batch.length} result objects, one for each idx (0 to ${batch.length - 1}).`,
              },
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
          }),
        })

        if (!res.ok) {
          const error: any = new Error(`OpenAI error ${res.status}`)
          error.status = res.status
          throw error
        }
        return res
      },
      `Batch ${batchNum} comparison`
    )

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      console.error(`     ⚠️ Empty response for batch ${batchNum}`)
      continue
    }

    try {
      const parsed = JSON.parse(content)
      // Handle multiple response formats:
      // 1. Array directly: [{idx:0,...}, {idx:1,...}]
      // 2. Object with results/comparisons key: {results: [...]} or {comparisons: [...]}
      // 3. Single object with idx: {idx:0, matches:...} (wrap in array)
      let batchResults: BatchResult[]
      if (Array.isArray(parsed)) {
        batchResults = parsed
      } else if (parsed.results && Array.isArray(parsed.results)) {
        batchResults = parsed.results
      } else if (parsed.comparisons && Array.isArray(parsed.comparisons)) {
        batchResults = parsed.comparisons
      } else if (typeof parsed.idx === 'number' && typeof parsed.matches === 'boolean') {
        // Single result object - wrap in array
        batchResults = [parsed]
      } else {
        console.error(`     ⚠️ Unexpected response format:`, Object.keys(parsed))
        batchResults = []
      }

      for (const result of batchResults) {
        results.set(result.idx, {
          idx: result.idx,
          matches: result.matches ?? false,
          severity: result.severity || "major",
          explanation: result.explanation || "",
          differences: result.differences || (result as any).key_differences || [],
          confidence: result.confidence ?? 0.5,
        })
      }
    } catch (parseErr) {
      console.error(`     ⚠️ JSON parse error for batch ${batchNum}:`, parseErr)
      console.error(`     Content preview: ${content.substring(0, 200)}`)
    }
  }

  return results
}

export async function performP1Reconciliation(
  documentId: string,
  supabase: any,
  openaiApiKey: string
) {
  const startTime = Date.now()
  console.log(`   4️⃣ P1: Comparing against pre-agreed terms (batched)...`)

  // ============ IDEMPOTENCY CHECK ============
  const { data: existingP1, error: p1CheckError } = await supabase
    .from("clause_match_results")
    .select("id, gpt_analysis")
    .eq("document_id", documentId)
    .not("gpt_analysis->pre_agreed_comparisons", "is", null)
    .limit(1)

  if (!p1CheckError && existingP1?.length > 0) {
    console.log(`   ℹ️ P1 already completed for document ${documentId}, skipping`)
    return {
      skipped: true,
      reason: "already_processed",
      p1_comparisons_made: 0,
      clauses_updated: 0,
      discrepancies_created: 0,
      missing_terms: 0,
    }
  }

  // Fetch document metadata including extracted_text for identity term matching
  const { data: document, error: docError } = await supabase
    .from("document_repository")
    .select("id, deal_id, tenant_id, extracted_text")
    .eq("id", documentId)
    .single()

  if (docError || !document) {
    throw new Error(`Document not found: ${docError?.message}`)
  }

  // Full contract text for identity term matching (presence check across entire document)
  const fullContractText = document.extracted_text || ''

  if (!document.deal_id) {
    console.log(`   ℹ️ No deal_id, skipping P1 comparison`)
    return { p1_comparisons_made: 0 }
  }

  // Fetch pre-agreed terms
  const { data: preAgreedTerms, error: termsError } = await supabase
    .from("pre_agreed_terms")
    .select("*")
    .eq("deal_id", document.deal_id)

  if (termsError) throw termsError

  if (!preAgreedTerms?.length) {
    console.log(`   ℹ️ No pre-agreed terms, skipping P1 comparison`)
    return { p1_comparisons_made: 0 }
  }

  console.log(`   Found ${preAgreedTerms.length} pre-agreed terms`)

  // Normalize PATs to reduce typos and map categories/clauses
  const normalizedTerms = await normalizePatTerms(preAgreedTerms, openaiApiKey)

  // Fetch clauses
  const { data: clauses, error: clausesError } = await supabase
    .from("clause_boundaries")
    .select("id, content, clause_type, confidence")
    .eq("document_id", documentId)

  if (clausesError) throw clausesError

  // Fetch match results
  const { data: matchResults, error: matchError } = await supabase
    .from("clause_match_results")
    .select("*")
    .eq("document_id", documentId)
    .not("clause_boundary_id", "is", null)

  if (matchError) throw matchError

  // Build all comparisons upfront (term-centric: top 1-3 clauses per PAT)
  // Identity terms are short-circuited and returned in identityResults
  const { comparisons, termComparisonMap, identityResults } = buildBatchComparisons(
    clauses || [],
    matchResults || [],
    normalizedTerms,
    fullContractText
  )

  console.log(`   Built ${comparisons.length} GPT comparisons, ${identityResults.size} identity short-circuits for ${termComparisonMap.size + identityResults.size} PAT terms`)

  // Track matched categories (include identity terms that matched)
  const matchedCategoriesFromIdentity = new Set<string>()

  // ============ PROCESS IDENTITY TERM RESULTS (PRE-GPT) ============
  // Identity terms (Brand Name, Talent Name, etc.) are resolved via direct
  // string matching - no GPT call needed
  let identityUpdatedCount = 0
  let identityDiscrepanciesCreated = 0

  for (const [termId, identityResult] of identityResults) {
    // Track matched identity terms to prevent false "missing term" flags
    if (identityResult.matchResult.matches) {
      matchedCategoriesFromIdentity.add(identityResult.termCategory)
    }

    // Create a virtual clause_match_result for identity terms
    // These don't link to a specific clause but track the identity verification
    const { data: virtualMatch, error: virtualError } = await supabase
      .from("clause_match_results")
      .insert({
        document_id: documentId,
        clause_boundary_id: null, // Identity terms check full document, not specific clause
        matched_template_id: null,
        similarity_score: identityResult.matchResult.confidence,
        rag_parsing: identityResult.ragParsing,
        rag_risk: 'green', // Identity doesn't use library risk assessment
        rag_status: identityResult.ragParsing,
        discrepancy_count: identityResult.ragParsing === 'red' ? 1 : 0,
        gpt_analysis: {
          identity_term_check: {
            term_id: termId,
            term_category: identityResult.termCategory,
            expected_value: identityResult.expectedValue,
            match_type: identityResult.matchResult.matchType,
            found_value: identityResult.matchResult.foundValue,
            confidence: identityResult.matchResult.confidence,
          },
          pre_agreed_comparisons: [{
            term_id: termId,
            term_category: identityResult.termCategory,
            is_mandatory: identityResult.isMandatory,
            match_metadata: {
              match_reason: 'identity_short_circuit',
              identity_match_type: identityResult.matchResult.matchType,
            },
            comparison_result: {
              matches: identityResult.matchResult.matches,
              deviation_severity: identityResult.ragParsing === 'green' ? 'none' :
                                 identityResult.ragParsing === 'amber' ? 'minor' : 'major',
              explanation: identityResult.explanation,
              key_differences: [],
              confidence: identityResult.matchResult.confidence,
            },
            rag_parsing: identityResult.ragParsing,
          }],
          reconciliation_timestamp: new Date().toISOString(),
        },
      })
      .select()
      .single()

    if (virtualError) {
      console.error(`   ⚠️ Failed to create identity match result for ${identityResult.termCategory}: ${virtualError.message}`)
      continue
    }

    identityUpdatedCount++

    // Create discrepancy for RED identity terms
    if (identityResult.ragParsing === 'red' && virtualMatch) {
      const { error: discError } = await supabase.from("discrepancies").insert({
        match_result_id: virtualMatch.id,
        document_id: documentId,
        discrepancy_type: identityResult.matchResult.matchType === 'absent' ? 'missing' : 'conflicting',
        severity: identityResult.isMandatory ? 'critical' : 'error',
        description: identityResult.explanation,
        suggested_action: `Verify ${identityResult.termCategory}: expected "${identityResult.expectedValue}"`,
      })

      if (!discError || discError.code === "23505") {
        identityDiscrepanciesCreated++
      }
    }

    console.log(`   📋 Identity: ${identityResult.termCategory} = ${identityResult.ragParsing.toUpperCase()} (${identityResult.matchResult.matchType})`)
  }

  // If only identity terms and all processed, we may have no GPT comparisons
  if (comparisons.length === 0) {
    const elapsedMs = Date.now() - startTime
    console.log(`   ✅ P1 complete in ${(elapsedMs / 1000).toFixed(1)}s: ${identityResults.size} identity terms processed, no semantic comparisons needed`)
    return {
      p1_comparisons_made: 0,
      identity_terms_processed: identityResults.size,
      clauses_updated: identityUpdatedCount,
      discrepancies_created: identityDiscrepanciesCreated,
      missing_terms: 0,
      execution_time_ms: elapsedMs,
    }
  }

  // Use configured P1 model for higher accuracy
  const estimatedTokens = comparisons.length * 150 // ~150 tokens per comparison
  console.log(`   Using model: ${P1_MODEL} (estimated ${estimatedTokens} tokens)`)

  // Execute batched comparison
  const batchResults = await executeBatchComparison(comparisons, openaiApiKey, P1_MODEL)

  console.log(`   Got ${batchResults.size}/${comparisons.length} results`)

  // Select best match per PAT term (green > amber > red)
  const bestMatchByTerm = selectBestMatchPerTerm(termComparisonMap, batchResults)

  console.log(`   Selected ${bestMatchByTerm.size} best matches (1 per PAT)`)

  // Group best matches by clause/matchResult for updating
  const clauseUpdates = new Map<string, {
    matchResult: ClauseMatchResult,
    clause: ClauseBoundary,
    patComparisons: any[]
  }>()

  for (const [termId, { comparison, result }] of bestMatchByTerm) {
    const matchResult = matchResults?.find((m: ClauseMatchResult) => m.id === comparison.matchResultId)
    const clause = clauses?.find((c: ClauseBoundary) => c.id === comparison.clauseId)
    if (!matchResult || !clause) continue

    if (!clauseUpdates.has(comparison.matchResultId)) {
      clauseUpdates.set(comparison.matchResultId, {
        matchResult,
        clause,
        patComparisons: []
      })
    }

    let termRagParsing: "green" | "amber" | "red"
    if (result.matches && result.severity === "none") {
      termRagParsing = "green"
    } else if (result.matches && result.severity === "minor") {
      termRagParsing = "amber"
    } else {
      termRagParsing = "red"
    }

    clauseUpdates.get(comparison.matchResultId)!.patComparisons.push({
      term_id: termId,
      term_category: comparison.termCategory,
      is_mandatory: comparison.isMandatory,
      match_metadata: {
        clause_type_match: comparison.matchReason === 'type_match',
        match_reason: comparison.matchReason,
        semantic_score: comparison.semanticScore,
        candidates_considered: termComparisonMap.get(termId)?.length || 1,
      },
      comparison_result: {
        matches: result.matches,
        deviation_severity: result.severity,
        explanation: result.explanation,
        key_differences: result.differences,
        confidence: result.confidence,
      },
      rag_parsing: termRagParsing,
    })
  }

  // Process results and update database
  let updatedCount = 0
  let discrepanciesCreated = 0

  for (const [matchResultId, { matchResult, clause, patComparisons }] of clauseUpdates) {
    // Calculate worst-case rag_parsing from PAT comparisons
    let rag_parsing: "green" | "amber" | "red" = "green"
    for (const comp of patComparisons) {
      if (comp.rag_parsing === "red" && comp.is_mandatory) {
        rag_parsing = "red"
      } else if (comp.rag_parsing === "red" && rag_parsing !== "red") {
        rag_parsing = "amber"
      } else if (comp.rag_parsing === "amber" && rag_parsing === "green") {
        rag_parsing = "amber"
      }
    }

    // Calculate final rag_status (combine with library matching)
    const rag_risk = matchResult.rag_risk as "green" | "amber" | "red"
    let rag_status: "green" | "amber" | "red"

    if (rag_parsing === "red" || rag_risk === "red") {
      rag_status = "red"
    } else if (rag_parsing === "green" && rag_risk === "green") {
      rag_status = "green"
    } else {
      rag_status = "amber"
    }

    // Update database
    const { error: updateError } = await supabase
      .from("clause_match_results")
      .update({
        rag_parsing,
        rag_status,
        gpt_analysis: {
          ...(matchResult.gpt_analysis || {}),
          pre_agreed_comparisons: patComparisons,
          reconciliation_timestamp: new Date().toISOString(),
        },
        discrepancy_count: rag_status === "red" ? 1 : 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matchResult.id)

    if (!updateError) updatedCount++

    // Flag low-confidence matches for LCL growth
    const similarityScore = matchResult.similarity_score || 0
    if (similarityScore < 0.85 && similarityScore > 0) {
      const priority = similarityScore < 0.5 ? "critical" : similarityScore < 0.6 ? "high" : similarityScore < 0.7 ? "medium" : "low"

      const { error: reviewError } = await supabase.from("admin_review_queue").insert({
        document_id: documentId,
        clause_boundary_id: clause.id,
        review_type: "low_confidence",  // Fixed: was "new_clause" which violates constraint
        status: "pending",
        priority,
        issue_description: `Low confidence match (${(similarityScore * 100).toFixed(1)}%) for ${clause.clause_type}`,
        original_text: clause.content,
        metadata: {
          clause_boundary_id: clause.id,
          match_result_id: matchResult.id,
          similarity_score: similarityScore,
          clause_type: clause.clause_type,
          matched_clause_id: matchResult.matched_template_id,
        },
      })

      if (reviewError && reviewError.code !== "23505") {
        console.error(`   ⚠️ Failed to insert review queue item:`, reviewError)
      }
    }

    // Create discrepancy if RED
    if (rag_status === "red" || rag_parsing === "red") {
      const redComparisons = patComparisons.filter((c: any) => c.rag_parsing === "red")
      const description = redComparisons.length > 0
        ? `Conflicts with: ${redComparisons[0].term_category}`
        : `Deviates from library`

      const { error: discrepancyError } = await supabase.from("discrepancies").insert({
        match_result_id: matchResult.id,
        document_id: documentId,
        discrepancy_type: rag_parsing === "red" ? "conflicting" : "modified",
        severity: rag_parsing === "red" ? "critical" : "error",
        description,
        affected_text: clause.content.substring(0, 200),
        suggested_action: redComparisons.length > 0
          ? `Review: ${redComparisons[0].comparison_result.explanation}`
          : "Review against library",
      })

      if (!discrepancyError || discrepancyError.code === "23505") {
        discrepanciesCreated++
      }
    }
  }

  // Handle missing mandatory terms
  // Combine GPT-matched categories with identity-matched categories
  const matchedCategoriesFromGPT = new Set(
    matchResults?.flatMap((r: any) => r.gpt_analysis?.pre_agreed_comparisons || [])
      .filter((c: any) => c.comparison_result?.matches)
      .map((c: any) => c.term_category)
  )

  // Merge both sets to avoid false "missing term" flags for identity terms
  const allMatchedCategories = new Set([
    ...matchedCategoriesFromGPT,
    ...matchedCategoriesFromIdentity
  ])

  const missingTerms = preAgreedTerms.filter(
    (term: PreAgreedTerm) => term.is_mandatory && !allMatchedCategories.has(term.term_category)
  )

  for (const missingTerm of missingTerms) {
    console.log(`   ⚠️ Missing mandatory: ${missingTerm.term_category}`)

    const { data: virtualMatch, error: virtualError } = await supabase
      .from("clause_match_results")
      .insert({
        document_id: documentId,
        clause_boundary_id: null,
        matched_template_id: null,
        similarity_score: 0,
        rag_parsing: "red",
        rag_risk: "red",
        rag_status: "red",
        discrepancy_count: 1,
        gpt_analysis: {
          missing_required_term: {
            term_id: missingTerm.id,
            term_category: missingTerm.term_category,
            term_description: missingTerm.term_description,
          },
        },
      })
      .select()
      .single()

    if (virtualError) continue

    if (virtualMatch) {
      const { error: discError } = await supabase.from("discrepancies").insert({
        match_result_id: virtualMatch.id,
        document_id: documentId,
        discrepancy_type: "missing",
        severity: "critical",
        description: `Missing: ${missingTerm.term_category}`,
        suggested_action: `Add: ${missingTerm.term_description}`,
      })

      if (!discError || discError.code === "23505") discrepanciesCreated++
    }
  }

  const elapsedMs = Date.now() - startTime
  const totalUpdated = updatedCount + identityUpdatedCount
  const totalDiscrepancies = discrepanciesCreated + identityDiscrepanciesCreated

  console.log(`   ✅ P1 complete in ${(elapsedMs / 1000).toFixed(1)}s: ${comparisons.length} GPT comparisons, ${identityResults.size} identity checks, ${totalUpdated} updated, ${totalDiscrepancies} discrepancies`)

  return {
    p1_comparisons_made: comparisons.length,
    identity_terms_processed: identityResults.size,
    clauses_updated: totalUpdated,
    discrepancies_created: totalDiscrepancies,
    missing_terms: missingTerms.length,
    execution_time_ms: elapsedMs,
  }
}
