import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import { authenticateAdmin, internalError } from "@/lib/auth/api-auth"

/**
 * GET /api/admin/review-queue
 * Fetches all items in the admin review queue
 * Requires admin or curator role
 */
export async function GET() {
  try {
    // Authenticate and require admin role
    const authResult = await authenticateAdmin()
    if (!authResult.success) return authResult.response

    const { data, error } = await supabaseServer
      .from("admin_review_queue")
      .select(`
        id,
        document_id,
        clause_boundary_id,
        review_type,
        confidence_score,
        status,
        priority,
        issue_description,
        original_text,
        metadata,
        flagged_at,
        reviewed_at,
        resolution_action
      `)
      .order("priority", { ascending: true }) // critical first
      .order("flagged_at", { ascending: true }) // oldest first

    if (error) {
      console.error("Error fetching review queue:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (error) {
    return internalError(error, "GET /api/admin/review-queue")
  }
}
