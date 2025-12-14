/**
 * P1 Reconciliation: Compare clauses against pre-agreed terms
 * OPTIMIZED: Uses batched GPT calls instead of sequential (5 min → ~15 sec)
 */

import { createClient } from '@supabase/supabase-js'

// ============ CONFIGURATION ============
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
  semanticRelevance: number // How relevant clause content is to PAT terms (dollar amounts, platforms, etc.)
}

interface BatchResult {
  idx: number
  matches: boolean
  severity: "none" | "minor" | "major"
  explanation: string
  differences: string[]
  confidence: number
}

interface ClauseCandidate {
  clause: ClauseBoundary
  matchResult: ClauseMatchResult
  matchReason: 'type_match' | 'fallback_match' | 'semantic_fallback'
}

// ============ TERM CATEGORY → CLAUSE TYPE MAPPING ============
// Maps PAT term_category to allowed clause_types for targeted matching
// UPDATED: Added actual PAT categories from deals (CIDER, Milk Makeup)
const TERM_TO_CLAUSE_MAP: Record<string, { primary: string[], fallback: string[] }> = {
  // ===== ACTUAL PAT CATEGORIES (from pre_agreed_terms table) =====
  // Payment & Compensation
  // FIX: Added usage_rights and general_terms to fallback because fee info sometimes
  // appears in combined clauses (e.g., "60 days usage... Compensation $4,000 NET 30")
  // FIX: Added social_platform_tiktok and agreed_in_the_agreement - OpenAI sometimes
  // types Schedule A content (fees, usage) with these non-standard types
  "Compensation & Payment Timing": {
    primary: ["payment_terms"],
    fallback: ["invoicing_obligation", "timeline_obligation", "usage_rights", "general_terms", "social_platform_tiktok", "agreed_in_the_agreement"]
  },

  // Content Approvals
  "Content Approval & Revisions": {
    primary: ["content_requirement", "deliverables", "deliverable_obligation"],
    fallback: ["acceptance_mechanism", "general_terms"]
  },

  // Content Retention
  // FIX: Removed content_restriction (too broad - includes "no other brands", "no bots")
  // Content retention is about how long posts must stay up, usually in:
  // - usage_rights (license duration), term_definition, timeline_obligation
  "Content Retention & Non-Removal": {
    primary: ["usage_rights", "term_definition", "timeline_obligation"],
    fallback: ["deliverables", "general_terms"]
  },

  // Deliverables
  "Deliverables & Posting Requirements": {
    primary: ["deliverables", "deliverable_obligation", "content_requirement"],
    fallback: ["timeline_obligation", "general_terms"]
  },

  // Usage Rights & IP
  // FIX: Added social_platform_tiktok - OpenAI often types usage duration in Schedule A with this type
  "Usage Rights & Licensing": {
    primary: ["usage_rights", "intellectual_property"],
    fallback: ["content_restriction", "general_terms", "social_platform_tiktok", "agreed_in_the_agreement"]
  },

  // ===== LEGACY MAPPINGS (for backward compatibility) =====
  // Payment
  "Payment Terms": { primary: ["payment_terms"], fallback: [] },

  // Exclusivity variants
  "Exclusivity": { primary: ["exclusivity"], fallback: ["deliverables"] },
  "Exclusivity Window": { primary: ["exclusivity"], fallback: ["deliverables"] },
  "Posting Restrictions": { primary: ["exclusivity", "deliverables"], fallback: [] },

  // Usage/IP
  "Usage Rights": { primary: ["intellectual_property", "usage_rights"], fallback: ["deliverables"] },
  "Usage & Licensing": { primary: ["intellectual_property", "usage_rights"], fallback: ["deliverables"] },

  // Approvals
  "Brand Approval Required": { primary: ["deliverables", "content_requirement"], fallback: ["acceptance_mechanism"] },
  "Approval & Reshoot Obligation": { primary: ["deliverables", "content_requirement"], fallback: ["acceptance_mechanism"] },

  // Compliance
  "FTC & Disclosure Compliance": { primary: ["compliance"], fallback: ["confidentiality"] },
  "Disclosure Requirements": { primary: ["compliance"], fallback: ["confidentiality"] },

  // Content/Deliverables
  "Content Standards & Lighting": { primary: ["deliverables", "content_requirement"], fallback: ["deliverable_obligation"] },
  "Brand Tags, Hashtags & Links": { primary: ["deliverables", "content_requirement"], fallback: [] },
  "Minimum Duration & Feed Placement": { primary: ["deliverables", "content_restriction"], fallback: [] },
  "Posting Schedule": { primary: ["deliverables", "timeline_obligation"], fallback: ["deliverable_obligation"] },
  "Creative Requirements": { primary: ["deliverables", "content_requirement"], fallback: ["deliverable_obligation"] },
  "Delivery Deadline": { primary: ["deliverables", "timeline_obligation"], fallback: ["termination"] },
  "Pre-Production Requirement": { primary: ["deliverables", "content_requirement"], fallback: ["deliverable_obligation"] },
  "Clothing & Styling Requirement": { primary: ["deliverables", "content_requirement"], fallback: [] },
  "Analytics Delivery": { primary: ["deliverables", "reporting_requirements"], fallback: ["deliverable_obligation"] },
}

// Legacy keyword matching for unmapped term categories
function keywordMatchClause(term: PreAgreedTerm, clause: ClauseBoundary): boolean {
  const normalizedClauseType = clause.clause_type.replace(/_/g, " ").toLowerCase()
  const termCategory = term.term_category.toLowerCase()
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

// Calculate semantic relevance between PAT description and clause content
// This prioritizes clauses that contain the SAME KEY TERMS as the PAT
// E.g., if PAT mentions "$3,500", prioritize clauses with dollar amounts
function calculateSemanticRelevance(term: PreAgreedTerm, clause: ClauseBoundary): number {
  const termDesc = term.term_description.toLowerCase()
  const clauseContent = clause.content.toLowerCase()
  let score = 0

  // Extract key terms from PAT description
  // 1. Dollar amounts - most important for payment terms
  const patAmounts = termDesc.match(/\$[\d,]+(?:\.\d{2})?/g) || []
  const clauseAmounts = clauseContent.match(/\$[\d,]+(?:\.\d{2})?/g) || []
  if (patAmounts.length > 0 && clauseAmounts.length > 0) {
    score += 50 // High boost if both mention money
  }

  // 2. Platforms (TikTok, Instagram, YouTube, etc.)
  const platforms = ['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'snapchat', 'reels']
  const patPlatforms = platforms.filter(p => termDesc.includes(p))
  const clausePlatforms = platforms.filter(p => clauseContent.includes(p))
  if (patPlatforms.length > 0 && clausePlatforms.length > 0) {
    score += 40 // Boost for platform match
  }

  // 3. Time periods (days, months, etc.)
  const timePatterns = /(\d+)\s*(day|week|month|year)s?/gi
  const patHasTime = timePatterns.test(termDesc)
  timePatterns.lastIndex = 0 // Reset regex
  const clauseHasTime = timePatterns.test(clauseContent)
  if (patHasTime && clauseHasTime) {
    score += 30 // Boost for time period match
  }

  // 4. Deliverable counts - flexible pattern to handle "(1) video", "1 video", "one video"
  // Also match content type words even without numbers
  const contentTypes = ['video', 'photo', 'tiktok', 'post', 'reel', 'story', 'image', 'asset', 'overlay']
  const patContentTypes = contentTypes.filter(t => termDesc.includes(t))
  const clauseContentTypes = contentTypes.filter(t => clauseContent.includes(t))
  if (patContentTypes.length > 0 && clauseContentTypes.length > 0) {
    // Check for overlap
    const overlap = patContentTypes.filter(t => clauseContentTypes.includes(t))
    score += 15 * overlap.length // Boost per matching content type
  }

  // Also check for number + content type patterns more flexibly
  const deliverablePattern = /\(?\d+\)?\s*[a-z]*\s*(video|photo|tiktok|post|reel|story|image|asset)/gi
  const patHasDeliverable = deliverablePattern.test(termDesc)
  deliverablePattern.lastIndex = 0
  const clauseHasDeliverable = deliverablePattern.test(clauseContent)
  if (patHasDeliverable && clauseHasDeliverable) {
    score += 35 // High boost for deliverable count match
  }

  // 5. Key action words that indicate the main clause purpose
  const actionWords = ['fee', 'payment', 'pay', 'paid', 'compensation', 'license', 'rights', 'usage', 'deliverable', 'post', 'publish', 'link in bio']
  for (const word of actionWords) {
    if (termDesc.includes(word) && clauseContent.includes(word)) {
      score += 5
    }
  }

  // 6. Special boost for "link in bio" which is a common deliverable
  if (termDesc.includes('link in bio') && clauseContent.includes('link in bio')) {
    score += 20
  }

  return score
}

// Select top 1-3 clauses for a given PAT term using type mapping
function selectTopClausesForTerm(
  term: PreAgreedTerm,
  clauses: ClauseBoundary[],
  matchResults: ClauseMatchResult[]
): ClauseCandidate[] {
  const mapping = TERM_TO_CLAUSE_MAP[term.term_category]

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

  // Step 4: Sort by SEMANTIC RELEVANCE first, then by LCL similarity
  // FIX: LCL similarity measures template match, not PAT relevance
  // E.g., "withhold compensation" (penalty) may score higher than "$2,300 fee" (actual payment)
  // Semantic relevance checks if clause contains same key terms as PAT (amounts, platforms, etc.)
  return candidates
    .map(c => ({
      ...c,
      semanticRelevance: calculateSemanticRelevance(term, c.clause)
    }))
    .sort((a, b) => {
      // Primary sort: semantic relevance (higher = better match to PAT content)
      if (b.semanticRelevance !== a.semanticRelevance) {
        return b.semanticRelevance - a.semanticRelevance
      }
      // Secondary sort: LCL similarity (as tiebreaker)
      return (b.matchResult.similarity_score || 0) - (a.matchResult.similarity_score || 0)
    })
    .slice(0, 10)
}

// Build batch comparisons list - term-centric approach (top 10 clauses per PAT)
function buildBatchComparisons(
  clauses: ClauseBoundary[],
  matchResults: ClauseMatchResult[],
  preAgreedTerms: PreAgreedTerm[]
): { comparisons: BatchComparison[], termComparisonMap: Map<string, BatchComparison[]> } {
  const comparisons: BatchComparison[] = []
  const termComparisonMap = new Map<string, BatchComparison[]>()
  let idx = 0

  // For each PAT term, find top 1-3 relevant clauses
  for (const term of preAgreedTerms) {
    const candidates = selectTopClausesForTerm(term, clauses, matchResults)
    if (candidates.length === 0) continue

    const termComparisons: BatchComparison[] = []

    for (const candidate of candidates) {
      const { clause, matchResult, matchReason } = candidate
      // Get semantic relevance from candidate (calculated in selectTopClausesForTerm)
      const semanticRelevance = (candidate as any).semanticRelevance || 0
      const comparison: BatchComparison = {
        idx: idx++,
        clauseId: clause.id,
        matchResultId: matchResult.id,
        termId: term.id,
        clauseType: clause.clause_type,
        termCategory: term.term_category,
        isMandatory: term.is_mandatory,
        clauseContent: clause.content.substring(0, 600), // Truncate for context window
        termDescription: term.term_description,
        expectedValue: term.expected_value || "N/A",
        matchReason,
        semanticScore: matchResult.similarity_score || 0,
        semanticRelevance, // FIX: Pass semantic relevance for best-match selection
      }
      comparisons.push(comparison)
      termComparisons.push(comparison)
    }

    termComparisonMap.set(term.id, termComparisons)
  }

  return { comparisons, termComparisonMap }
}

// Select best match per PAT term
// PRIORITY: Semantic relevance FIRST, then match status
// Rationale: A clause with high semantic relevance that shows RED is MORE useful than
// a clause with low relevance that shows GREEN (the latter is just incidental matching)
// E.g., for fee PAT: "$4,000 fee" clause (RED) > "30 days payment" clause (GREEN)
function selectBestMatchPerTerm(
  termComparisonMap: Map<string, BatchComparison[]>,
  results: Map<number, BatchResult>
): Map<string, { comparison: BatchComparison, result: BatchResult }> {
  const bestByTerm = new Map<string, { comparison: BatchComparison, result: BatchResult }>()

  for (const [termId, comparisons] of termComparisonMap) {
    let best: { comparison: BatchComparison, result: BatchResult } | null = null

    for (const comparison of comparisons) {
      const result = results.get(comparison.idx)
      if (!result) continue

      if (!best || isBetterMatch(comparison, result, best.comparison, best.result)) {
        best = { comparison, result }
      }
    }

    if (best) {
      bestByTerm.set(termId, best)
    }
  }

  return bestByTerm
}

// Compare matches: prioritize semantic relevance, then match status
// High relevance (>30) means clause talks about same thing as PAT (fee, usage, platforms)
function isBetterMatch(
  compA: BatchComparison, resultA: BatchResult,
  compB: BatchComparison, resultB: BatchResult
): boolean {
  const HIGH_RELEVANCE_THRESHOLD = 30

  const relevanceA = compA.semanticRelevance || 0
  const relevanceB = compB.semanticRelevance || 0
  const aIsHighRelevance = relevanceA >= HIGH_RELEVANCE_THRESHOLD
  const bIsHighRelevance = relevanceB >= HIGH_RELEVANCE_THRESHOLD

  // Case 1: If one has high relevance and other doesn't, prefer high relevance
  // (even if it's RED - because it's checking the RIGHT thing)
  if (aIsHighRelevance && !bIsHighRelevance) return true
  if (!aIsHighRelevance && bIsHighRelevance) return false

  // Case 2: Both have high relevance - this is the key case for talent protection
  if (aIsHighRelevance && bIsHighRelevance) {
    // If relevance difference is significant (>15), prefer higher relevance
    // E.g., fee clause (50) vs timing clause (30) → prefer fee clause
    if (Math.abs(relevanceA - relevanceB) > 15) {
      return relevanceA > relevanceB
    }
    // If similar relevance, PREFER RED to surface problems!
    // Talent managers need to see mismatches, not incidental matches
    // E.g., $2000 fee clause (RED) > 14-30 days timing (GREEN)
    const aIsRed = !resultA.matches || resultA.severity === "major"
    const bIsRed = !resultB.matches || resultB.severity === "major"
    if (aIsRed && !bIsRed) return true   // Prefer RED - surface the problem!
    if (!aIsRed && bIsRed) return false
    // Both same color (both RED or both GREEN), use relevance as tiebreaker
    return relevanceA > relevanceB
  }

  // Case 3: Both low relevance - use traditional scoring (prefer green)
  const scoreResult = (r: BatchResult) => {
    if (r.matches && r.severity === "none") return 3  // green
    if (r.matches && r.severity === "minor") return 2  // amber
    return 1  // red
  }

  const scoreA = scoreResult(resultA)
  const scoreB = scoreResult(resultB)

  if (scoreA !== scoreB) return scoreA > scoreB

  // Case 4: Same match score - prefer higher semantic relevance
  if (relevanceA !== relevanceB) return relevanceA > relevanceB

  // Case 5: Same relevance - use confidence as tiebreaker
  return resultA.confidence > resultB.confidence
}

// Execute batched GPT comparison
async function executeBatchComparison(
  comparisons: BatchComparison[],
  openaiApiKey: string,
  model: string = "gpt-4o"
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
                content: `You are a contract compliance checker protecting TALENT interests. Compare contract clauses against pre-agreed terms.

CRITICAL: You are protecting the TALENT (influencer/creator), not the brand. Flag issues that are BAD for talent:
- Brand gets MORE usage rights than agreed = RED (talent's content used longer)
- Brand pays LESS fee than agreed = RED (talent earns less)
- Talent must deliver MORE than agreed = RED (more work for same pay)

For each comparison:

**GREEN (matches=true, severity="none"):** Values match exactly or are BETTER for talent.
**AMBER (matches=true, severity="minor"):** Minor deviation that's acceptable.
**RED (matches=false, severity="major"):** Contract differs from agreed terms in ways that HURT talent:
  - Fee lower than agreed
  - Usage period longer than agreed
  - More deliverables than agreed
  - Less favorable terms

ALWAYS COMPARE NUMBERS:
- If term says "30 days" and clause says "60 days" → RED (brand gets 2x more usage!)
- If term says "$5,000" and clause says "$4,000" → RED ($1,000 shortfall)
- If term says "1 video" and clause says "2 videos" → RED (more work required)

EXPLANATION FORMAT - State BOTH values:
- "Contract: 60 days, Agreed: 30 days - brand gets 30 extra days"
- "Contract: $4,000, Agreed: $5,500 - $1,500 shortfall"

DIFFERENCES array format:
- ["contract_usage: 60 days", "agreed_usage: 30 days"]
- ["contract_fee: $4,000", "agreed_fee: $5,500"]

Be strict for [MANDATORY] terms.

IMPORTANT: Return results for ALL comparisons.
{"results":[{"idx":0,"matches":true,"severity":"none","explanation":"Matches: $5,000 fee exactly","differences":[],"confidence":0.95},{"idx":1,"matches":false,"severity":"major","explanation":"Contract: 60 days, Agreed: 30 days - brand gets 30 extra days of usage","differences":["contract_usage: 60 days","agreed_usage: 30 days"],"confidence":0.9},...]}`,
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

  // Fetch document metadata
  const { data: document, error: docError } = await supabase
    .from("document_repository")
    .select("id, deal_id, tenant_id")
    .eq("id", documentId)
    .single()

  if (docError || !document) {
    throw new Error(`Document not found: ${docError?.message}`)
  }

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
  const { comparisons, termComparisonMap } = buildBatchComparisons(
    clauses || [],
    matchResults || [],
    preAgreedTerms
  )

  console.log(`   Built ${comparisons.length} comparisons for ${termComparisonMap.size} PAT terms`)

  if (comparisons.length === 0) {
    console.log(`   ℹ️ No relevant clause-term matches found`)
    return { p1_comparisons_made: 0 }
  }

  // Select model based on context size
  const estimatedTokens = comparisons.length * 150 // ~150 tokens per comparison
  const model = estimatedTokens > 100000 ? "gpt-4o" : "gpt-4o"
  console.log(`   Using model: ${model} (estimated ${estimatedTokens} tokens)`)

  // Execute batched comparison
  const batchResults = await executeBatchComparison(comparisons, openaiApiKey, model)

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
  // FIX: Build matchedCategories from bestMatchByTerm (actual P1 results), not stale matchResults
  const matchedCategories = new Set<string>()
  for (const [termId, { comparison, result }] of bestMatchByTerm) {
    // A term is "matched" if GPT found a matching clause (matches=true)
    if (result.matches) {
      matchedCategories.add(comparison.termCategory)
    }
  }

  const missingTerms = preAgreedTerms.filter(
    (term: PreAgreedTerm) => term.is_mandatory && !matchedCategories.has(term.term_category)
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
  console.log(`   ✅ P1 complete in ${(elapsedMs / 1000).toFixed(1)}s: ${comparisons.length} comparisons, ${updatedCount} updated, ${discrepanciesCreated} discrepancies`)

  return {
    p1_comparisons_made: comparisons.length,
    clauses_updated: updatedCount,
    discrepancies_created: discrepanciesCreated,
    missing_terms: missingTerms.length,
    execution_time_ms: elapsedMs,
  }
}
