// Edge Function: match-and-reconcile
// Phase 6: Library matching only (LCL comparison)
// P1 (pre-agreed terms) moved to worker script for unlimited memory

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

// Interfaces moved to worker's p1-reconciliation.ts

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

    // OpenAI not needed here - P1 handled by worker

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

    // Step 2: Fetch clause boundaries
    const { data: clauses, error: clausesError } = await supabase
      .from("clause_boundaries")
      .select("id, content, clause_type, confidence")
      .eq("document_id", documentId)

    if (clausesError) {
      console.error("Error fetching clauses:", clausesError)
      throw clausesError
    }

    console.log(`Found ${clauses?.length || 0} contract clauses`)

    // Step 3: Fetch existing clause match results (already have rag_risk from library matching)
    const { data: matchResults, error: matchError } = await supabase
      .from("clause_match_results")
      .select("*")
      .eq("document_id", documentId)
      .not("clause_boundary_id", "is", null)

    if (matchError) {
      console.error("Error fetching match results:", matchError)
      throw matchError
    }

    console.log(`Found ${matchResults?.length || 0} match results`)

    // Initialize rag_status from rag_risk (library matching)
    // P1 comparison (pre-agreed terms) will be done by worker script
    let updatedCount = 0

    for (const matchResult of matchResults || []) {
      const rag_risk = matchResult.rag_risk || "amber"

      const { error: updateError } = await supabase
        .from("clause_match_results")
        .update({
          rag_parsing: "amber", // Will be set by P1 in worker
          rag_status: rag_risk, // Initialize from library risk
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchResult.id)

      if (!updateError) {
        updatedCount++
      }
    }

    console.log(`✅ Initialized ${updatedCount} match results`)

    // Step 4: Mark document as ready for P1 (worker will handle pre-agreed terms)
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

    // Log successful completion
    const executionTime = Date.now() - functionStartTime
    console.log(`✅ Library matching complete in ${executionTime}ms`)

    return new Response(
      JSON.stringify({
        success: true,
        message: "Library matching complete (P1 will be done by worker)",
        document_id: documentId,
        clauses_reconciled: updatedCount,
        execution_time_ms: executionTime,
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
