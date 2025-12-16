import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

type ClauseRedline = Database["public"]["Tables"]["clause_redlines"]["Row"]
type ClauseRedlineUpdate = Database["public"]["Tables"]["clause_redlines"]["Update"]

/**
 * PATCH /api/reconciliation/[dealId]/redlines/[redlineId]
 * Update a redline (typically to mark it as resolved)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string; redlineId: string }> }
) {
  try {
    const { dealId, redlineId } = await params

    if (!dealId || !redlineId) {
      return NextResponse.json(
        { error: "Deal ID and Redline ID are required" },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { status, proposed_text, change_type } = body

    // Build update object with only provided fields
    const updateData: ClauseRedlineUpdate = {}

    if (status !== undefined) {
      if (!["draft", "resolved"].includes(status)) {
        return NextResponse.json(
          { error: "Invalid status", details: "Must be 'draft' or 'resolved'" },
          { status: 400 }
        )
      }
      updateData.status = status
      updateData.resolved_at = status === "resolved" ? new Date().toISOString() : null
    }

    if (proposed_text !== undefined) {
      updateData.proposed_text = proposed_text
    }

    if (change_type !== undefined) {
      if (!["add", "delete", "modify"].includes(change_type)) {
        return NextResponse.json(
          { error: "Invalid change_type", details: "Must be 'add', 'delete', or 'modify'" },
          { status: 400 }
        )
      }
      updateData.change_type = change_type
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      )
    }

    // Verify deal exists and get tenant_id
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

    // Verify redline exists and belongs to this deal's tenant
    const { data: existingRedline, error: redlineError } = await supabaseServer
      .from("clause_redlines")
      .select(`
        *,
        clause_boundaries!inner (
          document_id,
          document_repository!inner (
            deal_id
          )
        )
      `)
      .eq("id", redlineId)
      .eq("tenant_id", deal.tenant_id)
      .single()

    if (redlineError || !existingRedline) {
      return NextResponse.json(
        { error: "Redline not found", details: redlineError?.message },
        { status: 404 }
      )
    }

    // Verify the redline belongs to a document in this deal
    const redlineDealId = (existingRedline.clause_boundaries as any)?.document_repository?.deal_id
    if (redlineDealId !== dealId) {
      return NextResponse.json(
        { error: "Redline does not belong to the specified deal" },
        { status: 400 }
      )
    }

    // Update the redline
    const { data: updatedRedline, error: updateError } = await supabaseServer
      .from("clause_redlines")
      .update(updateData)
      .eq("id", redlineId)
      .select()
      .single()

    if (updateError) {
      console.error("Error updating redline:", updateError)
      return NextResponse.json(
        { error: "Failed to update redline", details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: updatedRedline,
    })
  } catch (error) {
    console.error("Unexpected error in PATCH /api/reconciliation/[dealId]/redlines/[redlineId]:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/reconciliation/[dealId]/redlines/[redlineId]
 * Delete a redline
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string; redlineId: string }> }
) {
  try {
    const { dealId, redlineId } = await params

    if (!dealId || !redlineId) {
      return NextResponse.json(
        { error: "Deal ID and Redline ID are required" },
        { status: 400 }
      )
    }

    // Verify deal exists and get tenant_id
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

    // Delete the redline (only if it belongs to this tenant)
    const { error: deleteError } = await supabaseServer
      .from("clause_redlines")
      .delete()
      .eq("id", redlineId)
      .eq("tenant_id", deal.tenant_id)

    if (deleteError) {
      console.error("Error deleting redline:", deleteError)
      return NextResponse.json(
        { error: "Failed to delete redline", details: deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Redline deleted",
    })
  } catch (error) {
    console.error("Unexpected error in DELETE /api/reconciliation/[dealId]/redlines/[redlineId]:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
