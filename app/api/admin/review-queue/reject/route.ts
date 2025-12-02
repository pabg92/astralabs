import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

/**
 * POST /api/admin/review-queue/reject
 * Rejects a flagged clause from the review queue
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { review_queue_id, reason } = body

    if (!review_queue_id || !reason) {
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

    // 2. Update review queue item as rejected
    const { error: updateError } = await supabaseServer
      .from("admin_review_queue")
      .update({
        status: "rejected",
        resolution_action: "reject",
        reviewed_at: new Date().toISOString(),
        metadata: {
          ...((queueItem.metadata as Record<string, unknown> | null) || {}),
          rejection_reason: reason,
        },
        // TODO: Get admin user ID from session
        // reviewed_by: session.user.id,
      })
      .eq("id", review_queue_id)

    if (updateError) {
      console.error("Error updating queue item:", updateError)
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        review_queue_id,
        action: "rejected",
        reason,
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
