import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

/**
 * POST /api/admin/review-queue/accept
 * Accepts a flagged clause into the Legal Clause Library
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      review_queue_id,
      clause_id,
      parent_clause_id,
      variation_letter,
      category,
      risk_level,
      plain_english_summary,
      tags,
      action, // "add_new" or "add_variant"
    } = body

    if (!review_queue_id || !clause_id || !action) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }

    // 1. Get review queue item
    const { data: queueItem, error: queueError } = await supabaseServer
      .from("admin_review_queue")
      .select("*")
      .eq("id", review_queue_id)
      .eq("status", "pending")
      .single()

    if (queueError || !queueItem) {
      return NextResponse.json(
        { success: false, error: "Review queue item not found or already processed" },
        { status: 404 }
      )
    }

    // 2. Check if clause_id already exists
    const { data: existing } = await supabaseServer
      .from("legal_clause_library")
      .select("clause_id")
      .eq("clause_id", clause_id)
      .single()

    if (existing) {
      return NextResponse.json(
        { success: false, error: `Clause ID ${clause_id} already exists` },
        { status: 400 }
      )
    }

    // 3. If it's a variant, verify parent exists
    if (action === "add_variant") {
      const { data: parentClause, error: parentError } = await supabaseServer
        .from("legal_clause_library")
        .select("clause_id")
        .eq("clause_id", parent_clause_id)
        .single()

      if (parentError || !parentClause) {
        return NextResponse.json(
          { success: false, error: `Parent clause ${parent_clause_id} not found` },
          { status: 400 }
        )
      }
    }

    // 4. Insert into legal_clause_library
    const { data: newClause, error: insertError } = await supabaseServer
      .from("legal_clause_library")
      .insert({
        clause_id,
        category: category || queueItem.metadata?.clause_type || "general",
        clause_type: queueItem.metadata?.clause_type || "General",
        standard_text: queueItem.original_text,
        risk_level: risk_level || "medium",
        is_required: false,
        tags: tags || [],
        version: 1,
        metadata: {
          embedding_model: "embed-english-v3.0",
          cohere_embedding: queueItem.metadata?.embedding || null,
          approved_from_queue: review_queue_id,
          similarity_score: queueItem.metadata?.similarity_score,
        },
        // CBA fields (if columns exist, otherwise ignored)
        plain_english_summary,
        factual_correctness_score: queueItem.metadata?.factual_correctness_score || 1.0,
        new_clause_flag: false, // No longer "new" once approved
        parent_clause_id: action === "add_variant" ? parent_clause_id : null,
        variation_letter: action === "add_variant" ? variation_letter : "a",
      })
      .select()
      .single()

    if (insertError) {
      console.error("Error inserting clause:", insertError)
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      )
    }

    // 5. Update review queue item as resolved
    const { error: updateError } = await supabaseServer
      .from("admin_review_queue")
      .update({
        status: "resolved",
        resolution_action: action,
        reviewed_at: new Date().toISOString(),
        // TODO: Get admin user ID from session
        // reviewed_by: session.user.id,
      })
      .eq("id", review_queue_id)

    if (updateError) {
      console.error("Error updating queue item:", updateError)
      // Don't fail the request - clause was already added
    }

    return NextResponse.json({
      success: true,
      data: {
        clause: newClause,
        action,
      },
    })
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
