// Edge Function: match-and-reconcile
// Phase 7: Three-way reconciliation - Contract vs Pre-Agreed (P1) vs Library (P2) → Final RAG Status (P3)
// Determines final rag_parsing, rag_status, creates discrepancies, handles missing clauses

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const functionStartTime = Date.now()
  let documentId: string | null = null
  let supabase: any = null

  try {
    console.log("match-and-reconcile: Function invoked")

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiApiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for P1 comparison"
      )
    }

    // Parse request body for document_id
    const body = await req.json().catch(() => ({}))
    documentId = body.document_id

    if (!documentId) {
      throw new Error("document_id is required")
    }

    console.log(`Processing document: ${documentId}`)

    // Step 1: Fetch document metadata
    const { data: document, error: docError } = await supabase
      .from("document_repository")
      .select("id, deal_id, tenant_id, processing_status")
      .eq("id", documentId)
      .single()

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`)
    }

    if (!document.deal_id) {
      throw new Error("Document has no associated deal_id")
    }

    console.log(`Deal ID: ${document.deal_id}`)

    // Step 2: Fetch pre-agreed terms for the deal
    const { data: preAgreedTerms, error: termsError } = await supabase
      .from("pre_agreed_terms")
      .select("*")
      .eq("deal_id", document.deal_id)

    if (termsError) {
      console.error("Error fetching pre-agreed terms:", termsError)
      throw termsError
    }

    console.log(`Found ${preAgreedTerms?.length || 0} pre-agreed terms`)

    // Step 3: Fetch clause boundaries with embeddings
    const { data: clauses, error: clausesError } = await supabase
      .from("clause_boundaries")
      .select("id, content, clause_type, confidence")
      .eq("document_id", documentId)

    if (clausesError) {
      console.error("Error fetching clauses:", clausesError)
      throw clausesError
    }

    console.log(`Found ${clauses?.length || 0} contract clauses`)

    // Step 4: Fetch existing clause match results from Phase 6
    const { data: matchResults, error: matchError } = await supabase
      .from("clause_match_results")
      .select("*")
      .eq("document_id", documentId)
      .not("clause_boundary_id", "is", null) // Only real clauses, not virtual

    if (matchError) {
      console.error("Error fetching match results:", matchError)
      throw matchError
    }

    console.log(`Found ${matchResults?.length || 0} existing match results`)

    // Step 5: P1 - Compare each clause against pre-agreed terms
    console.log("Starting P1 comparison: Contract vs Pre-Agreed Terms...")

    const reconciliationResults: any[] = []
    let p1ComparisonCount = 0

    for (const matchResult of matchResults || []) {
      // Find the clause
      const clause = clauses?.find((c) => c.id === matchResult.clause_boundary_id)
      if (!clause) {
        console.warn(`Clause not found for match result ${matchResult.id}`)
        continue
      }

      // Find relevant pre-agreed terms for this clause
      const relevantTerms = (preAgreedTerms || []).filter((term) => {
        // Match by related_clause_types (highest priority)
        if (
          term.related_clause_types &&
          term.related_clause_types.includes(clause.clause_type)
        ) {
          return true
        }

        // Fallback: Enhanced keyword matching
        // Normalize clause type for matching (e.g., "payment_terms" → "payment")
        const normalizedClauseType = clause.clause_type.replace(/_/g, " ").toLowerCase()
        const termCategory = term.term_category.toLowerCase()
        const termDescription = term.term_description.toLowerCase()

        // Comprehensive keyword map: keyword → related keywords
        const keywordMap: Record<string, string[]> = {
          "payment": ["payment", "fee", "compensation", "invoice", "remuneration", "cost"],
          "usage": ["usage", "rights", "license", "utilization", "media"],
          "deliverable": ["deliverable", "scope", "work", "service", "content", "output"],
          "exclusivity": ["exclusivity", "exclusive", "non-compete", "compete"],
          "approval": ["approval", "feedback", "review", "consent", "sign-off"],
          "confidentiality": ["confidential", "nda", "secret", "proprietary", "disclosure"],
          "termination": ["termination", "term", "duration", "cancel", "expire", "end"],
          "indemnification": ["indemn", "liability", "warranty", "insurance", "claim"],
          "intellectual": ["intellectual", "ip", "copyright", "trademark", "ownership", "property"],
          "party": ["party", "parties", "contact", "address", "entity"],
        }

        // Check if any keyword matches between term and clause
        for (const [baseKeyword, relatedKeywords] of Object.entries(keywordMap)) {
          const clauseMatches = relatedKeywords.some((kw) => normalizedClauseType.includes(kw))
          const termMatches = relatedKeywords.some((kw) =>
            termCategory.includes(kw) || termDescription.includes(kw)
          )

          if (clauseMatches && termMatches) {
            return true
          }
        }

        return false
      })

      let rag_parsing: "green" | "amber" | "red" = "amber" // Default
      const preAgreedComparisons: any[] = []

      if (relevantTerms.length > 0) {
        console.log(
          `Clause ${clause.id} (${clause.clause_type}): ${relevantTerms.length} relevant terms found`
        )

        // Compare against each relevant term using OpenAI
        for (const term of relevantTerms) {
          p1ComparisonCount++

          try {
            const openaiResponse = await fetch(
              "https://api.openai.com/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${openaiApiKey}`,
                },
                body: JSON.stringify({
                  model: "gpt-4o",
                  messages: [
                    {
                      role: "system",
                      content: `You are a contract compliance analyzer. Compare a contract clause against a pre-agreed term.

Output JSON format:
{
  "matches": boolean,
  "deviation_severity": "none" | "minor" | "major",
  "explanation": "Brief description of match/deviation",
  "key_differences": ["list", "of", "differences"],
  "confidence": 0.0-1.0
}`,
                    },
                    {
                      role: "user",
                      content: `Pre-Agreed Term:
Category: ${term.term_category}
Description: ${term.term_description}
Expected Value: ${term.expected_value || "N/A"}
Mandatory: ${term.is_mandatory}

Contract Clause:
Type: ${clause.clause_type}
Content: ${clause.content.substring(0, 1000)}

Does the contract clause satisfy the pre-agreed term?`,
                    },
                  ],
                  temperature: 0.2,
                  response_format: { type: "json_object" },
                }),
              }
            )

            if (!openaiResponse.ok) {
              const errorText = await openaiResponse.text()
              throw new Error(
                `OpenAI API error (${openaiResponse.status}): ${errorText}`
              )
            }

            const openaiData = await openaiResponse.json()
            const content = openaiData.choices[0]?.message?.content

            if (!content) {
              throw new Error("No content returned from OpenAI")
            }

            const comparisonResult: ComparisonResult = JSON.parse(content)

            // Determine rag_parsing based on comparison
            let termRagParsing: "green" | "amber" | "red"

            if (comparisonResult.matches && comparisonResult.deviation_severity === "none") {
              termRagParsing = "green"
            } else if (
              comparisonResult.matches &&
              comparisonResult.deviation_severity === "minor"
            ) {
              termRagParsing = "amber"
            } else {
              termRagParsing = "red" // major deviation or doesn't match
            }

            preAgreedComparisons.push({
              term_id: term.id,
              term_category: term.term_category,
              is_mandatory: term.is_mandatory,
              comparison_result: comparisonResult,
              rag_parsing: termRagParsing,
            })

            // Take worst-case rag_parsing if multiple terms
            // Priority: red > amber > green
            if (termRagParsing === "red" && term.is_mandatory) {
              rag_parsing = "red"
            } else if (termRagParsing === "red" && rag_parsing !== "red") {
              rag_parsing = "amber" // Non-mandatory red downgrades to amber
            } else if (termRagParsing === "amber" && rag_parsing === "green") {
              rag_parsing = "amber"
            } else if (termRagParsing === "green" && rag_parsing !== "red") {
              // Green is good, but don't override red
              if (rag_parsing === "amber") {
                // Keep amber if any other term was amber
              } else {
                rag_parsing = "green"
              }
            }

            console.log(
              `  Term "${term.term_category}": ${comparisonResult.matches ? "MATCH" : "NO MATCH"} (${comparisonResult.deviation_severity}) → ${termRagParsing}`
            )
          } catch (comparisonError) {
            console.error(
              `Error comparing clause ${clause.id} with term ${term.id}:`,
              comparisonError
            )
            // Continue with other terms
          }
        }
      } else {
        console.log(
          `Clause ${clause.id} (${clause.clause_type}): No relevant pre-agreed terms`
        )
        rag_parsing = "amber" // No expectations, neutral
      }

      // Step 6: P3 - Calculate final RAG status
      const rag_risk = matchResult.rag_risk as "green" | "amber" | "red"
      let rag_status: "green" | "amber" | "red"

      // Priority logic: P1 (pre-agreed) has highest priority
      if (rag_parsing === "red") {
        rag_status = "red" // Pre-agreed mismatch always escalates
      } else if (rag_risk === "red") {
        rag_status = "red" // Library risk also escalates
      } else if (rag_parsing === "green" && rag_risk === "green") {
        rag_status = "green" // Both good = overall good
      } else {
        rag_status = "amber" // Mixed signals = caution
      }

      reconciliationResults.push({
        match_result_id: matchResult.id,
        clause_boundary_id: clause.id,
        rag_parsing,
        rag_status,
        rag_risk, // Keep existing from Phase 6
        pre_agreed_comparisons: preAgreedComparisons,
        clause_type: clause.clause_type,
        clause_content_preview: clause.content.substring(0, 200),
      })
    }

    console.log(`P1 comparison complete: ${p1ComparisonCount} comparisons made`)

    // Step 7: Handle missing required clauses
    console.log("Checking for missing required clauses...")

    const matchedTermCategories = new Set(
      reconciliationResults
        .flatMap((r) => r.pre_agreed_comparisons)
        .filter((c) => c.comparison_result.matches)
        .map((c) => c.term_category)
    )

    const missingTerms = (preAgreedTerms || []).filter(
      (term) => term.is_mandatory && !matchedTermCategories.has(term.term_category)
    )

    console.log(`Found ${missingTerms.length} missing mandatory terms`)

    const virtualMatches: any[] = []

    for (const missingTerm of missingTerms) {
      console.log(`Creating virtual match for missing term: ${missingTerm.term_category}`)

      // Create virtual clause_match_result
      const { data: virtualMatch, error: virtualError } = await supabase
        .from("clause_match_results")
        .insert({
          document_id: documentId,
          clause_boundary_id: null, // No actual clause
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
              expected_value: missingTerm.expected_value,
            },
          },
          risk_assessment: {
            risk_type: "missing_required_clause",
            severity: "critical",
            impact: "Contract missing mandatory term from pre-agreed expectations",
          },
        })
        .select()
        .single()

      if (virtualError) {
        console.error("Error creating virtual match:", virtualError)
        continue
      }

      virtualMatches.push(virtualMatch)

      // Create discrepancy for missing clause
      await supabase.from("discrepancies").insert({
        match_result_id: virtualMatch.id,
        document_id: documentId,
        discrepancy_type: "missing",
        severity: "critical",
        description: `Missing required clause: ${missingTerm.term_category}`,
        suggested_action: `Add clause covering: ${missingTerm.term_description}`,
        affected_text: null,
      })

      // Flag in admin review queue
      await supabase.from("admin_review_queue").insert({
        document_id: documentId,
        review_type: "discrepancy",
        status: "pending",
        priority: "critical",
        issue_description: `Contract is missing required pre-agreed term: ${missingTerm.term_category}`,
        metadata: {
          missing_term: missingTerm,
          reason: "required_clause_not_found",
        },
      })
    }

    // Step 8: Update clause_match_results with reconciliation data
    console.log("Updating clause_match_results with P1 and P3 data...")

    let updatedCount = 0
    let discrepanciesCreated = 0
    let lowConfidenceEnqueued = 0

    for (const result of reconciliationResults) {
      // Get the original match result to access similarity_score
      const originalMatch = matchResults?.find((m) => m.id === result.match_result_id)

      // Update match result
      const { error: updateError } = await supabase
        .from("clause_match_results")
        .update({
          rag_parsing: result.rag_parsing,
          rag_status: result.rag_status,
          gpt_analysis: {
            ...(originalMatch?.gpt_analysis || {}),
            pre_agreed_comparisons: result.pre_agreed_comparisons,
            reconciliation_timestamp: new Date().toISOString(),
          },
          discrepancy_count:
            result.rag_status === "red" || result.rag_parsing === "red" ? 1 : 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", result.match_result_id)

      if (updateError) {
        console.error(`Error updating match result ${result.match_result_id}:`, updateError)
        continue
      }

      updatedCount++

      // Phase 8: Enqueue low-confidence matches for admin review
      const similarityScore = originalMatch?.similarity_score || 0
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

        await supabase.from("admin_review_queue").insert({
          document_id: documentId,
          review_type: "new_clause",
          status: "pending",
          priority: priority,
          issue_description: `Low confidence match (similarity: ${(similarityScore * 100).toFixed(1)}%) for ${result.clause_type} clause`,
          metadata: {
            clause_boundary_id: result.clause_boundary_id,
            match_result_id: result.match_result_id,
            similarity_score: similarityScore,
            clause_type: result.clause_type,
            reason: "low_similarity_new_clause_candidate",
          },
        })

        lowConfidenceEnqueued++
        console.log(
          `Enqueued low-confidence clause for review: ${result.clause_type} (similarity: ${(similarityScore * 100).toFixed(1)}%)`
        )
      }

      // Create discrepancy if RED
      if (result.rag_status === "red" || result.rag_parsing === "red") {
        const discrepancyType =
          result.rag_parsing === "red" ? "conflicting" : "modified"
        const severity = result.rag_parsing === "red" ? "critical" : "error"

        const redComparisons = result.pre_agreed_comparisons.filter(
          (c: any) => c.rag_parsing === "red"
        )

        const description =
          redComparisons.length > 0
            ? `Clause conflicts with pre-agreed term: ${redComparisons[0].term_category}`
            : `Clause deviates from standard library template`

        await supabase.from("discrepancies").insert({
          match_result_id: result.match_result_id,
          document_id: documentId,
          discrepancy_type: discrepancyType,
          severity: severity,
          description: description,
          affected_text: result.clause_content_preview,
          suggested_action: redComparisons.length > 0
            ? `Review and align with: ${redComparisons[0].comparison_result.explanation}`
            : "Review clause against library standards",
        })

        discrepanciesCreated++
      }
    }

    // Step 9: Update document processing status
    const { error: statusError } = await supabase
      .from("document_repository")
      .update({
        processing_status: "completed",
      })
      .eq("id", documentId)

    if (statusError) {
      console.error("Error updating document status:", statusError)
    } else {
      console.log("✅ Document status updated to 'completed'")
    }

    // Calculate final statistics
    const ragDistribution = {
      green: reconciliationResults.filter((r) => r.rag_status === "green").length,
      amber: reconciliationResults.filter((r) => r.rag_status === "amber").length,
      red: reconciliationResults.filter((r) => r.rag_status === "red").length +
        virtualMatches.length,
    }

    console.log(
      `✅ Phase 7 complete: ${updatedCount} clauses reconciled, ${virtualMatches.length} virtual matches created, ${discrepanciesCreated + virtualMatches.length} discrepancies, ${lowConfidenceEnqueued} low-confidence clauses enqueued`
    )

    // Log successful completion to database
    const executionTime = Date.now() - functionStartTime
    if (documentId && supabase) {
      await supabase.from("edge_function_logs").insert({
        document_id: documentId,
        stage: "match",
        status: "success",
        clause_count: updatedCount,
        raw_payload: {
          clauses_reconciled: updatedCount,
          virtual_matches_created: virtualMatches.length,
          discrepancies_created: discrepanciesCreated + virtualMatches.length,
          low_confidence_enqueued: lowConfidenceEnqueued,
          p1_comparisons_made: p1ComparisonCount,
          rag_distribution: ragDistribution,
          pre_agreed_terms_count: preAgreedTerms?.length || 0,
          missing_mandatory_terms: missingTerms.length,
        },
        execution_time_ms: executionTime,
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Three-way reconciliation complete",
        document_id: documentId,
        clauses_reconciled: updatedCount,
        virtual_matches_created: virtualMatches.length,
        discrepancies_created: discrepanciesCreated + virtualMatches.length,
        low_confidence_enqueued: lowConfidenceEnqueued,
        p1_comparisons_made: p1ComparisonCount,
        rag_distribution: ragDistribution,
        pre_agreed_terms_count: preAgreedTerms?.length || 0,
        missing_mandatory_terms: missingTerms.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    )
  } catch (error) {
    console.error("match-and-reconcile error:", error)

    // Log error to database
    const executionTime = Date.now() - functionStartTime
    if (documentId && supabase) {
      await supabase.from("edge_function_logs").insert({
        document_id: documentId,
        stage: "match",
        status: "error",
        error_message: error.message,
        raw_payload: {
          error_stack: error.stack,
          error_name: error.name,
        },
        execution_time_ms: executionTime,
      }).catch((logError) => {
        console.error("Failed to log error to database:", logError)
      })
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    )
  }
})
