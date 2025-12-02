import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

type ClauseComment = Database["public"]["Tables"]["clause_comments"]["Row"]
type ClauseRedline = Database["public"]["Tables"]["clause_redlines"]["Row"]
type ClauseCommentInsert = Database["public"]["Tables"]["clause_comments"]["Insert"]
type ClauseRedlineInsert = Database["public"]["Tables"]["clause_redlines"]["Insert"]

/**
 * GET /api/reconciliation/[dealId]/redlines
 * Returns all redlines and comments for a deal's documents
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const { dealId } = await params

    if (!dealId) {
      return NextResponse.json(
        { error: "Deal ID is required" },
        { status: 400 }
      )
    }

    // First, verify deal exists and get its tenant_id
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .select("id, tenant_id")
      .eq("id", dealId)
      .single()

    if (dealError || !deal) {
      return NextResponse.json(
        { error: "Deal not found", details: dealError?.message },
        { status: 404 }
      )
    }

    // Get document(s) for this deal
    const { data: documents, error: docError } = await supabaseServer
      .from("document_repository")
      .select("id")
      .eq("deal_id", dealId)

    if (docError) {
      return NextResponse.json(
        { error: "Failed to fetch documents", details: docError.message },
        { status: 500 }
      )
    }

    const documentIds = documents?.map((doc) => doc.id) || []

    if (documentIds.length === 0) {
      // No documents yet, return empty arrays
      return NextResponse.json({
        success: true,
        data: {
          redlines: [],
          comments: [],
        },
      })
    }

    // Get clause boundaries for these documents
    const { data: boundaries, error: boundariesError } = await supabaseServer
      .from("clause_boundaries")
      .select("id, document_id")
      .in("document_id", documentIds)

    if (boundariesError) {
      return NextResponse.json(
        { error: "Failed to fetch clause boundaries", details: boundariesError.message },
        { status: 500 }
      )
    }

    const clauseIds = boundaries?.map((b) => b.id) || []

    // Early return if no clauses (prevents .in() SQL error with empty array)
    if (clauseIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          redlines: [],
          comments: [],
        },
      })
    }

    // Fetch redlines for these clauses (scoped to tenant)
    const { data: redlines, error: redlinesError } = await supabaseServer
      .from("clause_redlines")
      .select(`
        *,
        user_profiles!clause_redlines_author_id_fkey (
          email,
          first_name,
          last_name
        )
      `)
      .in("clause_boundary_id", clauseIds)
      .eq("tenant_id", deal.tenant_id)
      .order("created_at", { ascending: false })

    if (redlinesError) {
      console.error("Error fetching redlines:", redlinesError)
      return NextResponse.json(
        { error: "Failed to fetch redlines", details: redlinesError.message },
        { status: 500 }
      )
    }

    // Fetch comments for these clauses (scoped to tenant)
    const { data: comments, error: commentsError } = await supabaseServer
      .from("clause_comments")
      .select(`
        *,
        user_profiles!clause_comments_author_id_fkey (
          email,
          first_name,
          last_name
        )
      `)
      .in("clause_boundary_id", clauseIds)
      .eq("tenant_id", deal.tenant_id)
      .order("created_at", { ascending: false })

    if (commentsError) {
      console.error("Error fetching comments:", commentsError)
      return NextResponse.json(
        { error: "Failed to fetch comments", details: commentsError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        redlines: redlines || [],
        comments: comments || [],
      },
    })
  } catch (error) {
    console.error("Unexpected error in GET /api/reconciliation/[dealId]/redlines:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * POST /api/reconciliation/[dealId]/redlines
 * Create a new redline and optionally a comment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const { dealId } = await params

    if (!dealId) {
      return NextResponse.json(
        { error: "Deal ID is required" },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      clause_boundary_id,
      change_type,
      proposed_text,
      status = "draft",
      comment_text,
      author_id,
    } = body

    // Validate base required field
    if (!clause_boundary_id) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: "clause_boundary_id is required",
        },
        { status: 400 }
      )
    }

    // Determine mode: redline, comment-only, or both
    const hasRedlinePayload = Boolean(change_type && proposed_text)
    const hasCommentPayload = Boolean(comment_text)

    if (!hasRedlinePayload && !hasCommentPayload) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: "Provide redline fields (change_type + proposed_text) and/or comment_text",
        },
        { status: 400 }
      )
    }

    // Derive tenant_id from deal (security: never trust client-provided tenant_id)
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .select("id, tenant_id")
      .eq("id", dealId)
      .single()

    if (dealError || !deal) {
      return NextResponse.json(
        { error: "Deal not found", details: dealError?.message },
        { status: 404 }
      )
    }

    // Validate change_type/status if redline is being created
    if (hasRedlinePayload) {
      if (!["add", "delete", "modify"].includes(change_type)) {
        return NextResponse.json(
          { error: "Invalid change_type", details: "Must be 'add', 'delete', or 'modify'" },
          { status: 400 }
        )
      }

      if (!["draft", "resolved"].includes(status)) {
        return NextResponse.json(
          { error: "Invalid status", details: "Must be 'draft' or 'resolved'" },
          { status: 400 }
        )
      }
    }

    // Verify clause_boundary exists and belongs to a document in this deal
    const { data: clause, error: clauseError } = await supabaseServer
      .from("clause_boundaries")
      .select("id, document_id, document_repository!inner(deal_id)")
      .eq("id", clause_boundary_id)
      .single()

    if (clauseError || !clause) {
      return NextResponse.json(
        { error: "Clause boundary not found", details: clauseError?.message },
        { status: 404 }
      )
    }

    // Verify the clause belongs to the specified deal
    const clauseDealId = (clause.document_repository as any)?.deal_id
    if (clauseDealId !== dealId) {
      return NextResponse.json(
        { error: "Clause boundary does not belong to the specified deal" },
        { status: 400 }
      )
    }

    // Resolve author for demo: prefer provided author_id, fall back to DEMO_AUTHOR_ID or seeded demo user
    const resolvedAuthorId =
      author_id ??
      process.env.DEMO_AUTHOR_ID ??
      "00000000-0000-0000-0000-000000000002"

    // Insert redline
    let redline: ClauseRedline | null = null
    if (hasRedlinePayload) {
      const redlineInsert: ClauseRedlineInsert = {
        clause_boundary_id,
        change_type: change_type as "add" | "delete" | "modify",
        proposed_text,
        status: status as "draft" | "resolved",
        author_id: resolvedAuthorId,
        tenant_id: deal.tenant_id,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
      }

      const { data: redlineData, error: redlineError } = await supabaseServer
        .from("clause_redlines")
        .insert(redlineInsert)
        .select()
        .single()

      if (redlineError) {
        console.error("Error inserting redline:", redlineError)
        return NextResponse.json(
          { error: "Failed to create redline", details: redlineError.message },
          { status: 500 }
        )
      }

      redline = redlineData
    }

    // Optionally insert comment if comment_text is provided
    let comment: ClauseComment | null = null
    if (comment_text) {
      const commentInsert: ClauseCommentInsert = {
        clause_boundary_id,
        comment_text,
        author_id: resolvedAuthorId,
        tenant_id: deal.tenant_id,
      }

      const { data: commentData, error: commentError } = await supabaseServer
        .from("clause_comments")
        .insert(commentInsert)
        .select()
        .single()

      if (commentError) {
        console.error("Error inserting comment:", commentError)
        // Don't fail the request if comment insertion fails
        // The redline was already created successfully
      } else {
        comment = commentData
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          redline,
          comment,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Unexpected error in POST /api/reconciliation/[dealId]/redlines:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
