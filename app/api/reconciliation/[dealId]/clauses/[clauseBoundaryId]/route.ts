import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import {
  authenticateRequest,
  validateDealAccess,
  internalError,
} from "@/lib/auth/api-auth"

interface ReviewPayload {
  decision: "approved" | "rejected" | "flagged"
  risk_accepted?: boolean
  comments?: string
}

/**
 * PATCH /api/reconciliation/[dealId]/clauses/[clauseBoundaryId]
 * Saves or updates a clause review decision
 * Requires authentication and tenant access
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string; clauseBoundaryId: string }> }
) {
  try {
    const { dealId, clauseBoundaryId } = await params

    // Authenticate user
    const authResult = await authenticateRequest()
    if (!authResult.success) return authResult.response

    // Validate deal access
    const dealAccess = await validateDealAccess(authResult.user, dealId)
    if (!dealAccess.success) return dealAccess.response

    const { userId, tenantId } = authResult.user

    const body: ReviewPayload = await request.json()

    if (!clauseBoundaryId) {
      return NextResponse.json(
        { error: "Clause boundary ID is required" },
        { status: 400 }
      )
    }

    if (!body.decision) {
      return NextResponse.json(
        { error: "Decision is required (approved, rejected, or flagged)" },
        { status: 400 }
      )
    }

    // Get document_id from clause_boundaries
    const { data: boundary, error: boundaryError } = await supabaseServer
      .from("clause_boundaries")
      .select("document_id")
      .eq("id", clauseBoundaryId)
      .single()

    if (boundaryError || !boundary) {
      return NextResponse.json(
        { error: "Clause boundary not found" },
        { status: 404 }
      )
    }

    // Upsert the review with proper user and tenant tracking
    const reviewData = {
      document_id: boundary.document_id || "",
      clause_boundary_id: clauseBoundaryId,
      decision: body.decision,
      risk_accepted: body.risk_accepted ?? false,
      comments: body.comments ?? null,
      reviewer_id: userId,
      tenant_id: tenantId,
      approved_at: body.decision === "approved" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    const { data: review, error: reviewError } = await supabaseServer
      .from("clause_reviews")
      .upsert(reviewData, {
        onConflict: "document_id,clause_boundary_id",
      })
      .select()
      .single()

    if (reviewError) {
      console.error("Error saving clause review:", reviewError)
      return NextResponse.json(
        { error: "Failed to save review", details: reviewError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: review,
    })
  } catch (error) {
    return internalError(error, "PATCH /api/reconciliation/[dealId]/clauses/[clauseBoundaryId]")
  }
}

/**
 * GET /api/reconciliation/[dealId]/clauses/[clauseBoundaryId]
 * Returns the review status for a specific clause
 * Requires authentication and tenant access
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string; clauseBoundaryId: string }> }
) {
  try {
    const { dealId, clauseBoundaryId } = await params

    // Authenticate user
    const authResult = await authenticateRequest()
    if (!authResult.success) return authResult.response

    // Validate deal access
    const dealAccess = await validateDealAccess(authResult.user, dealId)
    if (!dealAccess.success) return dealAccess.response

    const { data: review, error } = await supabaseServer
      .from("clause_reviews")
      .select("*")
      .eq("clause_boundary_id", clauseBoundaryId)
      .single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      return NextResponse.json(
        { error: "Failed to fetch review", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: review || null,
    })
  } catch (error) {
    return internalError(error, "GET /api/reconciliation/[dealId]/clauses/[clauseBoundaryId]")
  }
}
