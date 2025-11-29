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
  termId: string
  clauseType: string
  termCategory: string
  isMandatory: boolean
  clauseContent: string
  termDescription: string
  expectedValue: string
}

interface BatchResult {
  idx: number
  matches: boolean
  severity: "none" | "minor" | "major"
  explanation: string
  differences: string[]
  confidence: number
}

// Find relevant terms for a clause using keyword matching
function findRelevantTerms(clause: ClauseBoundary, preAgreedTerms: PreAgreedTerm[]): PreAgreedTerm[] {
  return preAgreedTerms.filter((term) => {
    // Direct match via related_clause_types
    if (term.related_clause_types?.includes(clause.clause_type)) {
      return true
    }

    const normalizedClauseType = clause.clause_type.replace(/_/g, " ").toLowerCase()
    const termCategory = term.term_category.toLowerCase()
    const termDescription = term.term_description.toLowerCase()

    const keywordMap: Record<string, string[]> = {
      payment: ["payment", "fee", "compensation", "invoice", "remuneration", "cost"],
      usage: ["usage", "rights", "license", "utilization", "media"],
      deliverable: ["deliverable", "scope", "work", "service", "content", "output"],
      exclusivity: ["exclusivity", "exclusive", "non-compete", "compete"],
      approval: ["approval", "feedback", "review", "consent", "sign-off"],
      confidentiality: ["confidential", "nda", "secret", "proprietary", "disclosure"],
      termination: ["termination", "term", "duration", "cancel", "expire", "end"],
      indemnification: ["indemn", "liability", "warranty", "insurance", "claim"],
      intellectual: ["intellectual", "ip", "copyright", "trademark", "ownership", "property"],
      party: ["party", "parties", "contact", "address", "entity"],
    }

    for (const relatedKeywords of Object.values(keywordMap)) {
      const clauseMatches = relatedKeywords.some((kw) => normalizedClauseType.includes(kw))
      const termMatches = relatedKeywords.some((kw) =>
        termCategory.includes(kw) || termDescription.includes(kw)
      )
      if (clauseMatches && termMatches) return true
    }

    return false
  })
}

// Build batch comparisons list
function buildBatchComparisons(
  clauses: ClauseBoundary[],
  matchResults: ClauseMatchResult[],
  preAgreedTerms: PreAgreedTerm[]
): { comparisons: BatchComparison[], clauseTermMap: Map<string, Map<string, BatchComparison>> } {
  const comparisons: BatchComparison[] = []
  const clauseTermMap = new Map<string, Map<string, BatchComparison>>()
  let idx = 0

  for (const matchResult of matchResults) {
    const clause = clauses.find((c) => c.id === matchResult.clause_boundary_id)
    if (!clause) continue

    const relevantTerms = findRelevantTerms(clause, preAgreedTerms)
    if (relevantTerms.length === 0) continue

    const termMap = new Map<string, BatchComparison>()

    for (const term of relevantTerms) {
      const comparison: BatchComparison = {
        idx: idx++,
        clauseId: clause.id,
        termId: term.id,
        clauseType: clause.clause_type,
        termCategory: term.term_category,
        isMandatory: term.is_mandatory,
        clauseContent: clause.content.substring(0, 600), // Truncate for context window
        termDescription: term.term_description,
        expectedValue: term.expected_value || "N/A",
      }
      comparisons.push(comparison)
      termMap.set(term.id, comparison)
    }

    clauseTermMap.set(matchResult.id, termMap)
  }

  return { comparisons, clauseTermMap }
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
                content: `You are a contract compliance checker. For each comparison, determine if the contract clause satisfies the pre-agreed term.

Output a JSON array with one object per comparison:
[{"idx":0,"matches":true,"severity":"none","explanation":"<15 words>","differences":[],"confidence":0.95},...]

Severity levels:
- "none": Clause fully satisfies term
- "minor": Small deviation, acceptable
- "major": Significant deviation, requires attention

Be strict for MANDATORY terms. Be concise.`,
              },
              {
                role: "user",
                content: `Compare these ${batch.length} clause-term pairs:

${JSON.stringify(comparisonInputs, null, 0)}

Return JSON array with results for each idx.`,
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
      // Handle both array and object with results key
      const batchResults: BatchResult[] = Array.isArray(parsed) ? parsed : (parsed.results || parsed.comparisons || [])

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

  // Build all comparisons upfront
  const { comparisons, clauseTermMap } = buildBatchComparisons(
    clauses || [],
    matchResults || [],
    preAgreedTerms
  )

  console.log(`   Built ${comparisons.length} comparisons across ${clauseTermMap.size} clauses`)

  if (comparisons.length === 0) {
    console.log(`   ℹ️ No relevant clause-term matches found`)
    return { p1_comparisons_made: 0 }
  }

  // Select model based on context size
  // GPT-4o: 128k context, GPT-5.1: 400k context (for very large batches)
  const estimatedTokens = comparisons.length * 150 // ~150 tokens per comparison
  const model = estimatedTokens > 100000 ? "gpt-5.1" : "gpt-4o"
  console.log(`   Using model: ${model} (estimated ${estimatedTokens} tokens)`)

  // Execute batched comparison
  const batchResults = await executeBatchComparison(comparisons, openaiApiKey, model)

  console.log(`   Got ${batchResults.size}/${comparisons.length} results`)

  // Process results and update database
  let updatedCount = 0
  let discrepanciesCreated = 0

  for (const matchResult of matchResults || []) {
    const clause = clauses?.find((c: ClauseBoundary) => c.id === matchResult.clause_boundary_id)
    if (!clause) continue

    const termMap = clauseTermMap.get(matchResult.id)
    if (!termMap || termMap.size === 0) {
      // No relevant terms for this clause - mark as green
      await supabase
        .from("clause_match_results")
        .update({
          rag_parsing: "green",
          rag_status: matchResult.rag_risk === "green" ? "green" : "amber",
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchResult.id)
      continue
    }

    let rag_parsing: "green" | "amber" | "red" = "green"
    const preAgreedComparisons: any[] = []

    for (const [termId, comparison] of termMap) {
      const result = batchResults.get(comparison.idx)
      if (!result) continue

      let termRagParsing: "green" | "amber" | "red"
      if (result.matches && result.severity === "none") {
        termRagParsing = "green"
      } else if (result.matches && result.severity === "minor") {
        termRagParsing = "amber"
      } else {
        termRagParsing = "red"
      }

      preAgreedComparisons.push({
        term_id: termId,
        term_category: comparison.termCategory,
        is_mandatory: comparison.isMandatory,
        comparison_result: {
          matches: result.matches,
          deviation_severity: result.severity,
          explanation: result.explanation,
          key_differences: result.differences,
          confidence: result.confidence,
        },
        rag_parsing: termRagParsing,
      })

      // Calculate worst-case rag_parsing
      if (termRagParsing === "red" && comparison.isMandatory) {
        rag_parsing = "red"
      } else if (termRagParsing === "red" && rag_parsing !== "red") {
        rag_parsing = "amber"
      } else if (termRagParsing === "amber" && rag_parsing === "green") {
        rag_parsing = "amber"
      }
    }

    // Calculate final rag_status
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
          pre_agreed_comparisons: preAgreedComparisons,
          reconciliation_timestamp: new Date().toISOString(),
        },
        discrepancy_count: rag_status === "red" ? 1 : 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matchResult.id)

    if (!updateError) updatedCount++

    // Phase 8: Flag low-confidence matches for LCL growth
    const similarityScore = matchResult.similarity_score || 0
    if (similarityScore < 0.85 && similarityScore > 0) {
      const priority = similarityScore < 0.5 ? "critical" : similarityScore < 0.6 ? "high" : similarityScore < 0.7 ? "medium" : "low"

      const { error: reviewError } = await supabase.from("admin_review_queue").insert({
        document_id: documentId,
        clause_boundary_id: clause.id,
        review_type: "new_clause",
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
      const redComparisons = preAgreedComparisons.filter((c) => c.rag_parsing === "red")
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
  const matchedCategories = new Set(
    matchResults?.flatMap((r: any) => r.gpt_analysis?.pre_agreed_comparisons || [])
      .filter((c: any) => c.comparison_result?.matches)
      .map((c: any) => c.term_category)
  )

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
