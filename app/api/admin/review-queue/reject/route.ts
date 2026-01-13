import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import { authenticateAdmin, internalError } from "@/lib/auth/api-auth"

/**
 * POST /api/admin/review-queue/reject
 * Rejects a flagged clause from the review queue
 * Requires admin or curator role
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate and require admin role
    const authResult = await authenticateAdmin()
    if (!authResult.success) return authResult.response

    const { userId } = authResult.user

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
        reviewed_by: userId,
        metadata: {
          ...((queueItem.metadata as Record<string, unknown> | null) || {}),
          rejection_reason: reason,
        },
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
    return internalError(error, "POST /api/admin/review-queue/reject")
  }
}
