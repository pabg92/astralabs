// Edge Function: generate-lcl-embeddings
// Generates OpenAI embeddings for legal_clause_library entries
// Updated to use OpenAI text-embedding-3-large (1024 dims) to match clause_boundaries

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("generate-lcl-embeddings: Function invoked (OpenAI mode)");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse options from request body
    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 500;
    const forceRegenerate = body.force_regenerate === true;

    // Fetch LCL clauses - either without embeddings or all (if force regenerate)
    let query = supabase
      .from("legal_clause_library")
      .select("id, clause_id, standard_text, clause_type")
      .limit(limit);

    if (!forceRegenerate) {
      query = query.is("embedding", null);
    }

    const { data: clauses, error: fetchError } = await query;

    if (fetchError) {
      throw fetchError;
    }

    if (!clauses || clauses.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No LCL clauses need embeddings",
        processed: 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`Found ${clauses.length} LCL clauses to process (force_regenerate: ${forceRegenerate})`);

    // Process in batches of 25 (OpenAI handles up to 2048, but 25 is safer for memory)
    const batchSize = 25;
    let totalProcessed = 0;
    let totalErrors = 0;

    for (let i = 0; i < clauses.length; i += batchSize) {
      const batch = clauses.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      console.log(`Processing batch ${batchNum}: ${batch.length} clauses (${i + 1}-${i + batch.length} of ${clauses.length})`);

      const texts = batch.map(c => c.standard_text.substring(0, 2000));

      try {
        // Call OpenAI embeddings API with dimension reduction
        const embedResponse = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey}`
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: texts,
            dimensions: EMBEDDING_DIMENSIONS,
            encoding_format: "float"
          })
        });

        if (!embedResponse.ok) {
          const errorText = await embedResponse.text();
          throw new Error(`OpenAI API error (${embedResponse.status}): ${errorText}`);
        }

        const embedData = await embedResponse.json();
        const embeddings = embedData.data
          .sort((a: any, b: any) => a.index - b.index)
          .map((d: any) => d.embedding);

        // Update each clause with its embedding
        for (let j = 0; j < batch.length; j++) {
          const clause = batch[j];
          const embedding = embeddings[j];

          const { error: updateError } = await supabase
            .from("legal_clause_library")
            .update({ embedding: embedding })
            .eq("id", clause.id);

          if (updateError) {
            console.error(`Error updating ${clause.clause_id}:`, updateError);
            totalErrors++;
          } else {
            totalProcessed++;
          }
        }

        console.log(`✅ Batch ${batchNum} complete: ${batch.length} embeddings generated`);

      } catch (batchError) {
        console.error(`Batch ${batchNum} error:`, batchError);
        totalErrors += batch.length;
      }
    }

    console.log(`✅ Complete: ${totalProcessed} embeddings generated, ${totalErrors} errors`);

    return new Response(JSON.stringify({
      success: true,
      message: "LCL embeddings generated with OpenAI",
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      clauses_found: clauses.length,
      embeddings_generated: totalProcessed,
      errors: totalErrors
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("generate-lcl-embeddings error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
