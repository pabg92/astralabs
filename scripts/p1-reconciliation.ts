/**
 * P1 Reconciliation: Compare clauses against pre-agreed terms
 * This runs server-side with unlimited memory (not in Edge Function)
 */

import { createClient } from '@supabase/supabase-js'

// ============ RATE LIMITING CONFIGURATION ============
const RATE_LIMIT_DELAY_MS = 100    // Base delay between API calls
const MAX_RETRIES = 5              // Hard cap on retries
const BACKOFF_MULTIPLIER = 2       // Exponential backoff multiplier
const MAX_BACKOFF_MS = 30000       // Max 30s backoff

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
    // Check for rate limit (429) - handle both fetch response and error objects
    const status = err.status || err.response?.status

    if (status === 429 && retries > 0) {
      const delay = Math.min(
        RATE_LIMIT_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, MAX_RETRIES - retries),
        MAX_BACKOFF_MS
      )
      const jitter = Math.random() * 100
      console.warn(`Rate limited on ${operationName}, retrying in ${delay + jitter}ms (${retries} retries left)`)
      await sleep(delay + jitter)
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

export async function performP1Reconciliation(
  documentId: string,
  supabase: any,
  openaiApiKey: string
) {
  console.log(`   4️⃣ P1: Comparing against pre-agreed terms...`)

  // ============ IDEMPOTENCY CHECK ============
  // Check if P1 has already been run by looking for pre_agreed_comparisons in gpt_analysis
  const { data: existingP1, error: p1CheckError } = await supabase
    .from("clause_match_results")
    .select("id, gpt_analysis")
    .eq("document_id", documentId)
    .not("gpt_analysis->pre_agreed_comparisons", "is", null)
    .limit(1)

  if (p1CheckError) {
    console.warn(`   ⚠️ Error checking P1 idempotency: ${p1CheckError.message}`)
    // Continue anyway - better to risk duplicates than fail silently
  } else if (existingP1 && existingP1.length > 0) {
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

  if (termsError) {
    throw termsError
  }

  if (!preAgreedTerms || preAgreedTerms.length === 0) {
    console.log(`   ℹ️ No pre-agreed terms, skipping P1 comparison`)
    return { p1_comparisons_made: 0 }
  }

  console.log(`   Found ${preAgreedTerms.length} pre-agreed terms`)

  // Fetch clauses
  const { data: clauses, error: clausesError } = await supabase
    .from("clause_boundaries")
    .select("id, content, clause_type, confidence")
    .eq("document_id", documentId)

  if (clausesError) {
    throw clausesError
  }

  // Fetch match results
  const { data: matchResults, error: matchError } = await supabase
    .from("clause_match_results")
    .select("*")
    .eq("document_id", documentId)
    .not("clause_boundary_id", "is", null)

  if (matchError) {
    throw matchError
  }

  let p1ComparisonCount = 0
  let updatedCount = 0
  let discrepanciesCreated = 0

  // Process one clause at a time
  for (const matchResult of matchResults || []) {
    const clause = clauses?.find((c) => c.id === matchResult.clause_boundary_id)
    if (!clause) continue

    // Find relevant pre-agreed terms
    const relevantTerms = (preAgreedTerms || []).filter((term) => {
      if (
        term.related_clause_types &&
        term.related_clause_types.includes(clause.clause_type)
      ) {
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

      for (const [, relatedKeywords] of Object.entries(keywordMap)) {
        const clauseMatches = relatedKeywords.some((kw) => normalizedClauseType.includes(kw))
        const termMatches = relatedKeywords.some((kw) =>
          termCategory.includes(kw) || termDescription.includes(kw)
        )
        if (clauseMatches && termMatches) return true
      }

      return false
    })

    let rag_parsing: "green" | "amber" | "red" = "amber"
    const preAgreedComparisons: any[] = []

    if (relevantTerms.length > 0) {
      console.log(
        `   Clause ${clause.id.substring(0, 8)} (${clause.clause_type}): ${relevantTerms.length} terms`
      )

      // Compare against each relevant term
      for (const term of relevantTerms) {
        p1ComparisonCount++

        // Add delay between API calls to avoid rate limits
        if (p1ComparisonCount > 1) {
          await sleep(RATE_LIMIT_DELAY_MS)
        }

        try {
          const openaiResponse = await callWithBackoff(
            async () => {
              const response = await fetch(
                "https://api.openai.com/v1/chat/completions",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${openaiApiKey}`,
                  },
                  body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                      {
                        role: "system",
                        content: `Compare contract clause vs pre-agreed term. Output JSON:
{"matches":boolean,"deviation_severity":"none"|"minor"|"major","explanation":"<30 words","key_differences":["max 3"],"confidence":0-1}`,
                      },
                      {
                        role: "user",
                        content: `Pre-Agreed Term:
Category: ${term.term_category}
Description: ${term.term_description}
Expected: ${term.expected_value || "N/A"}
Mandatory: ${term.is_mandatory}

Contract Clause:
Type: ${clause.clause_type}
Content: ${clause.content.substring(0, 800)}

Match?`,
                      },
                    ],
                    temperature: 0.2,
                    response_format: { type: "json_object" },
                  }),
                }
              )

              if (!response.ok) {
                const error: any = new Error(`OpenAI error ${response.status}`)
                error.status = response.status
                throw error
              }

              return response
            },
            `P1 comparison for term ${term.id}`
          )

          const openaiData = await openaiResponse.json()
          const content = openaiData.choices[0]?.message?.content
          if (!content) throw new Error("No OpenAI response")

          // Safe JSON parsing with error handling
          let comparisonResult: ComparisonResult
          try {
            comparisonResult = JSON.parse(content)
          } catch (parseErr) {
            console.error(`   ⚠️ JSON parse error for term ${term.id}: ${parseErr}`)
            console.error(`   Content preview: ${content.substring(0, 200)}`)
            continue // Skip this comparison, don't crash
          }

          let termRagParsing: "green" | "amber" | "red"
          if (comparisonResult.matches && comparisonResult.deviation_severity === "none") {
            termRagParsing = "green"
          } else if (
            comparisonResult.matches &&
            comparisonResult.deviation_severity === "minor"
          ) {
            termRagParsing = "amber"
          } else {
            termRagParsing = "red"
          }

          preAgreedComparisons.push({
            term_id: term.id,
            term_category: term.term_category,
            is_mandatory: term.is_mandatory,
            comparison_result: comparisonResult,
            rag_parsing: termRagParsing,
          })

          // Worst-case rag_parsing
          if (termRagParsing === "red" && term.is_mandatory) {
            rag_parsing = "red"
          } else if (termRagParsing === "red" && rag_parsing !== "red") {
            rag_parsing = "amber"
          } else if (termRagParsing === "amber" && rag_parsing === "green") {
            rag_parsing = "amber"
          } else if (termRagParsing === "green" && rag_parsing !== "red") {
            if (rag_parsing !== "amber") {
              rag_parsing = "green"
            }
          }

          console.log(`     ${term.term_category}: ${termRagParsing}`)
        } catch (error) {
          console.error(`     Error comparing term ${term.id}:`, error)
        }
      }
    }

    // Calculate final rag_status (P3)
    const rag_risk = matchResult.rag_risk as "green" | "amber" | "red"
    let rag_status: "green" | "amber" | "red"

    if (rag_parsing === "red") {
      rag_status = "red"
    } else if (rag_risk === "red") {
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
        discrepancy_count: rag_status === "red" || rag_parsing === "red" ? 1 : 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matchResult.id)

    if (updateError) {
      console.error(`Error updating match result ${matchResult.id}:`, updateError)
      continue
    }

    updatedCount++

    // Phase 8: Flag low-confidence matches for LCL growth
    const similarityScore = matchResult.similarity_score || 0
    const LOW_CONFIDENCE_THRESHOLD = 0.85

    if (similarityScore < LOW_CONFIDENCE_THRESHOLD && similarityScore > 0) {
      const priority =
        similarityScore < 0.5
          ? "critical"
          : similarityScore < 0.6
            ? "high"
            : similarityScore < 0.7
              ? "medium"
              : "low"

      // Insert review queue item (ignore duplicates via unique constraint)
      const { error: reviewInsertError } = await supabase
        .from("admin_review_queue")
        .insert({
          document_id: documentId,
          clause_boundary_id: clause.id,
          review_type: "new_clause",
          status: "pending",
          priority: priority,
          issue_description: `Low confidence match (similarity: ${(similarityScore * 100).toFixed(1)}%) for ${clause.clause_type} clause`,
          original_text: clause.content,
          metadata: {
            clause_boundary_id: clause.id,
            match_result_id: matchResult.id,
            similarity_score: similarityScore,
            clause_type: clause.clause_type,
            matched_clause_id: matchResult.matched_template_id,
            reason: "low_similarity_new_clause_candidate",
          },
        })

      if (reviewInsertError) {
        // Ignore duplicate key errors (23505) - item already exists
        if (reviewInsertError.code !== '23505') {
          console.error(`   ⚠️ Failed to insert review queue item for clause ${clause.id}:`, reviewInsertError)
        }
        // Continue processing, don't crash
      } else {
        console.log(
          `   ⚠️ Low confidence (${(similarityScore * 100).toFixed(1)}%): flagged for LCL review`
        )
      }
    }

    // Create discrepancy if RED
    if (rag_status === "red" || rag_parsing === "red") {
      const redComparisons = preAgreedComparisons.filter((c) => c.rag_parsing === "red")
      const description =
        redComparisons.length > 0
          ? `Conflicts with: ${redComparisons[0].term_category}`
          : `Deviates from library`

      const discrepancyType = rag_parsing === "red" ? "conflicting" : "modified"

      // Insert discrepancy (ignore duplicates via unique constraint)
      const { error: discrepancyError } = await supabase
        .from("discrepancies")
        .insert({
          match_result_id: matchResult.id,
          document_id: documentId,
          discrepancy_type: discrepancyType,
          severity: rag_parsing === "red" ? "critical" : "error",
          description,
          affected_text: clause.content.substring(0, 200),
          suggested_action:
            redComparisons.length > 0
              ? `Review: ${redComparisons[0].comparison_result.explanation}`
              : "Review against library",
        })

      if (discrepancyError) {
        // Ignore duplicate key errors (23505) - item already exists
        if (discrepancyError.code !== '23505') {
          console.error(`   ⚠️ Failed to insert discrepancy for match ${matchResult.id}:`, discrepancyError)
        }
        // Continue processing, don't crash
      } else {
        discrepanciesCreated++
      }
    }
  }

  // Handle missing mandatory terms
  const matchedCategories = new Set(
    matchResults
      ?.flatMap((r: any) => r.gpt_analysis?.pre_agreed_comparisons || [])
      .filter((c: any) => c.comparison_result?.matches)
      .map((c: any) => c.term_category)
  )

  const missingTerms = preAgreedTerms.filter(
    (term) => term.is_mandatory && !matchedCategories.has(term.term_category)
  )

  for (const missingTerm of missingTerms) {
    console.log(`   ⚠️ Missing mandatory: ${missingTerm.term_category}`)

    const { data: virtualMatch, error: virtualMatchError } = await supabase
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

    if (virtualMatchError) {
      console.error(`   ⚠️ Failed to create virtual match for missing term ${missingTerm.id}:`, virtualMatchError)
      continue // Skip this missing term
    }

    if (virtualMatch) {
      const { error: missingDiscrepancyError } = await supabase
        .from("discrepancies")
        .insert({
          match_result_id: virtualMatch.id,
          document_id: documentId,
          discrepancy_type: "missing",
          severity: "critical",
          description: `Missing: ${missingTerm.term_category}`,
          suggested_action: `Add: ${missingTerm.term_description}`,
        })

      if (missingDiscrepancyError) {
        // Ignore duplicate key errors (23505) - item already exists
        if (missingDiscrepancyError.code !== '23505') {
          console.error(`   ⚠️ Failed to insert discrepancy for missing term ${missingTerm.id}:`, missingDiscrepancyError)
        }
        // Continue processing
      } else {
        discrepanciesCreated++
      }
    }
  }

  console.log(
    `   ✅ P1 complete: ${p1ComparisonCount} comparisons, ${updatedCount} updated, ${discrepanciesCreated} discrepancies`
  )

  return {
    p1_comparisons_made: p1ComparisonCount,
    clauses_updated: updatedCount,
    discrepancies_created: discrepanciesCreated,
    missing_terms: missingTerms.length,
  }
}
