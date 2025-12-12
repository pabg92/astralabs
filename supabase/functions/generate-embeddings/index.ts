// Edge Function: generate-embeddings
// Phase 6: Generate embeddings for contract clauses and find library matches
// Processes clauses from extract-clauses, generates OpenAI embeddings, finds similar library clauses

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

interface ClauseRecord {
  id: string
  content: string
  clause_type: string
  document_id: string
  tenant_id: string
}

interface SimilarClause {
  id: string
  clause_id: string
  standard_text: string
  clause_type: string
  category: string
  risk_level: string
  similarity: number
  match_category: string
}

interface OpenAIEmbeddingResponse {
  data: { embedding: number[]; index: number }[]
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
    console.log("generate-embeddings: Function invoked")

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
      throw new Error("OPENAI_API_KEY is required for embedding generation")
    }
    const EMBEDDING_MODEL =
      Deno.env.get("EMBEDDING_MODEL") || "text-embedding-3-large"
    const EMBEDDING_DIMENSIONS = Number(Deno.env.get("EMBEDDING_DIMENSIONS") || "1024")
    if (!Number.isFinite(EMBEDDING_DIMENSIONS) || EMBEDDING_DIMENSIONS <= 0) {
      throw new Error("Invalid EMBEDDING_DIMENSIONS; must be a positive number")
    }

    // Parse request body for document_id (optional - if not provided, process all)
    const body = await req.json().catch(() => ({}))
    documentId = body.document_id || null

    console.log(
      documentId
        ? `Processing clauses for document: ${documentId}`
        : "Processing all clauses without embeddings"
    )

    // Log function invocation to database (schema: stage, status, document_id, clause_count, raw_payload, execution_time_ms)
    // Note: Final success/error log will be written at the end with complete metrics

    // Step 1: Fetch clauses without embeddings
    let query = supabase
      .from("clause_boundaries")
      .select("id, content, clause_type, document_id, tenant_id")
      .is("embedding", null)
      .limit(100) // Process up to 100 clauses per invocation

    if (documentId) {
      query = query.eq("document_id", documentId)
    }

    const { data: clauses, error: fetchError } = await query

    if (fetchError) {
      console.error("Error fetching clauses:", fetchError)
      throw fetchError
    }

    if (!clauses || clauses.length === 0) {
      console.log("No clauses found without embeddings")
      return new Response(
        JSON.stringify({
          success: true,
          message: "No clauses to process",
          clauses_processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      )
    }

    console.log(`Found ${clauses.length} clauses without embeddings`)

    // Step 2: Batch process with OpenAI embeddings (25 clauses per batch)
    const batchSize = 25
    let totalEmbeddingsGenerated = 0
    let totalMatchesCreated = 0
    const embeddingStats: { batch: number; clauses: number; time_ms: number }[] = []

    for (let i = 0; i < clauses.length; i += batchSize) {
      const batchStart = Date.now()
      const batch = clauses.slice(i, i + batchSize) as ClauseRecord[]
      const batchNum = Math.floor(i / batchSize) + 1

      console.log(
        `Processing batch ${batchNum}: ${batch.length} clauses (${i + 1}-${i + batch.length} of ${clauses.length})`
      )

      // Extract texts for embeddings
      const texts = batch.map((c) => c.content.substring(0, 2000)) // Limit to 2000 chars per clause

      try {
        // Step 3: Call OpenAI embeddings API
        // Note: text-embedding-3-large natively produces 3072 dims, but our DB schema uses vector(1024)
        // OpenAI supports dimension reduction via the 'dimensions' parameter (uses Matryoshka Representation Learning)
        const embedResponse = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: texts,
            dimensions: EMBEDDING_DIMENSIONS,
            encoding_format: "float",
          }),
        })

        if (!embedResponse.ok) {
          const errorText = await embedResponse.text()
          throw new Error(
            `OpenAI embeddings error (${embedResponse.status}): ${errorText}`
          )
        }

        const embedData = (await embedResponse.json()) as OpenAIEmbeddingResponse
        const embeddings = embedData.data
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding)

        if (embeddings.length !== batch.length) {
          throw new Error(
            `OpenAI returned ${embeddings.length} embeddings but expected ${batch.length}`
          )
        }

        console.log(`✅ Generated ${embeddings.length} embeddings from OpenAI (${EMBEDDING_MODEL})`)

        // Step 4: Store embeddings and find matches
        for (let j = 0; j < batch.length; j++) {
          const clause = batch[j]
          const embedding = embeddings[j]
          // Convert to numeric array for pgvector storage
          const embeddingArray = Array.from(embedding)

          // Store embedding in clause_boundaries
          const { error: updateError } = await supabase
            .from("clause_boundaries")
            .update({ embedding: embeddingArray })
            .eq("id", clause.id)

          if (updateError) {
            console.error(
              `Error updating embedding for clause ${clause.id}:`,
              updateError
            )
            continue // Skip to next clause
          }

          totalEmbeddingsGenerated++

          // Step 5: Find similar clauses from library using direct SQL
          // (avoiding RPC function overload ambiguity issues)
          const embeddingString = `[${embeddingArray.join(',')}]`
          // Note: Not filtering by clause_type since extracted clause types
          // use different naming conventions than LCL (e.g., 'content_requirement' vs 'compliance')
          // Semantic similarity will still find the best matches regardless of type naming
          const { data: matches, error: matchError } = await supabase.rpc(
            'find_similar_clauses_v2',
            {
              p_query_embedding: embeddingString,
              p_similarity_threshold: 0.60,
              p_max_results: 10,
              p_tenant_id: null,
              p_clause_type: null
            }
          )

          if (matchError) {
            console.error(
              `Error finding similar clauses for ${clause.id}:`,
              matchError.message || matchError
            )
            // Continue without match - still create clause_match_results entry
          }

          // Step 6: Persist match to clause_match_results (even if no library match)
          let matched_template_id = null
          let similarity_score = 0
          let ragRisk: "green" | "amber" | "red" = "amber"
          let gpt_analysis: any = {
            embedding_source: EMBEDDING_MODEL,
          }

          if (!matches || matches.length === 0) {
            console.log(`No library matches found for clause ${clause.id} - creating unmatched entry`)
            ragRisk = "amber" // No match means needs review
            gpt_analysis = {
              no_library_match: true,
              embedding_source: EMBEDDING_MODEL,
              reason: "No similar clauses found in library above 0.60 similarity threshold"
            }
          } else {
            // Found matches - use top match
            const topMatch = matches[0] as SimilarClause
            console.log(
              `Top match for clause ${clause.id}: ${topMatch.clause_id} (similarity: ${topMatch.similarity.toFixed(3)})`
            )

            matched_template_id = topMatch.id
            similarity_score = topMatch.similarity

            // Determine RAG risk based on similarity
            // Thresholds adjusted based on real-world similarity scores (avg: 0.577, max: 0.791)
            if (topMatch.similarity >= 0.75) {
              ragRisk = "green" // Strong match (top ~10% of similarities)
            } else if (topMatch.similarity >= 0.60) {
              ragRisk = "amber" // Moderate match (acceptable similarity)
            } else {
              ragRisk = "red" // Weak match (below threshold, needs review)
            }

            gpt_analysis = {
              top_match: {
                clause_id: topMatch.clause_id,
                clause_type: topMatch.clause_type,
                category: topMatch.category,
                risk_level: topMatch.risk_level,
                similarity: topMatch.similarity,
                match_category: topMatch.match_category,
              },
              all_matches: matches.slice(0, 5).map((m: any) => ({
                clause_id: m.clause_id,
                similarity: m.similarity,
                match_category: m.match_category,
              })),
              embedding_source: EMBEDDING_MODEL,
            }
          }

          // Create clause_match_results entry (always, even with no match)
          const { error: matchResultError } = await supabase
            .from("clause_match_results")
            .insert({
              document_id: clause.document_id,
              clause_boundary_id: clause.id,
              matched_template_id: matched_template_id,
              similarity_score: similarity_score,
              rag_risk: ragRisk,
              rag_status: ragRisk, // Initialize overall status with risk
              gpt_analysis: gpt_analysis,
            })

          if (matchResultError) {
            console.error(
              `Error creating match result for clause ${clause.id}:`,
              matchResultError
            )
          } else {
            totalMatchesCreated++
          }
        }

        const batchTime = Date.now() - batchStart
        embeddingStats.push({
          batch: batchNum,
          clauses: batch.length,
          time_ms: batchTime,
        })

        console.log(
          `Batch ${batchNum} complete: ${batchTime}ms (${(batchTime / batch.length).toFixed(0)}ms per clause)`
        )
      } catch (batchError) {
        console.error(`Error processing batch ${batchNum}:`, batchError)
        // Continue with next batch
      }
    }

    // Calculate statistics
    const totalTime = embeddingStats.reduce((sum, s) => sum + s.time_ms, 0)
    const avgTimePerClause =
      totalEmbeddingsGenerated > 0 ? totalTime / totalEmbeddingsGenerated : 0

    console.log(
      `✅ Phase 6 complete: ${totalEmbeddingsGenerated} embeddings generated, ${totalMatchesCreated} matches created`
    )

    // Log successful completion to database
    const executionTime = Date.now() - functionStartTime
    if (documentId && supabase) {
      await supabase.from("edge_function_logs").insert({
        document_id: documentId,
        stage: "embed",
        status: "success",
        clause_count: totalEmbeddingsGenerated,
        raw_payload: {
          clauses_found: clauses.length,
          embeddings_generated: totalEmbeddingsGenerated,
          matches_created: totalMatchesCreated,
          batches_processed: embeddingStats.length,
          batch_stats: embeddingStats,
          embedding_model: EMBEDDING_MODEL,
          embedding_dimensions: EMBEDDING_DIMENSIONS,
        },
        execution_time_ms: executionTime,
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Embeddings generated and matches created",
        clauses_found: clauses.length,
        embeddings_generated: totalEmbeddingsGenerated,
        matches_created: totalMatchesCreated,
        batches_processed: embeddingStats.length,
        total_time_ms: totalTime,
        avg_time_per_clause_ms: Math.round(avgTimePerClause),
        batch_stats: embeddingStats,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    )
  } catch (error) {
    console.error("generate-embeddings error:", error)

    // Log error to database
    const executionTime = Date.now() - functionStartTime
    if (documentId && supabase) {
      await supabase.from("edge_function_logs").insert({
        document_id: documentId,
        stage: "embed",
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
