import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, createServerClient } from "@/lib/supabase/server"

interface ReviewPayload {
  decision: "approved" | "rejected" | "flagged"
  risk_accepted?: boolean
  comments?: string
}

// E2E testing bypass - matches middleware pattern
const isE2ETesting = process.env.E2E_TESTING === 'true' || process.env.PLAYWRIGHT_TEST === 'true'

/**
 * PATCH /api/reconciliation/[dealId]/clauses/[clauseBoundaryId]
 * Saves or updates a clause review decision
 * Requires authentication and tenant access verification (bypassed in E2E mode)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string; clauseBoundaryId: string }> }
) {
  try {
    const { dealId, clauseBoundaryId } = await params
    const body: ReviewPayload = await request.json()

    if (!dealId || !clauseBoundaryId) {
      return NextResponse.json(
        { error: "Deal ID and clause boundary ID are required" },
        { status: 400 }
      )
    }

    if (!body.decision) {
      return NextResponse.json(
        { error: "Decision is required (approved, rejected, or flagged)" },
        { status: 400 }
      )
    }

    let userTenantId: string | null = null
    let reviewerId: string | null = null

    // In E2E testing mode, bypass authentication and get tenant from deal
    if (isE2ETesting) {
      // Get tenant from the deal itself
      const { data: deal, error: dealError } = await supabaseServer
        .from("deals")
        .select("tenant_id")
        .eq("id", dealId)
        .single()

      if (dealError || !deal) {
        return NextResponse.json(
          { error: "Deal not found" },
          { status: 404 }
        )
      }

      userTenantId = deal.tenant_id
      reviewerId = "e2e-test-user"
    } else {
      // Production mode: Authenticate user
      const supabase = await createServerClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        return NextResponse.json(
          { error: "Unauthorized - please sign in" },
          { status: 401 }
        )
      }

      // Get user's tenant from user_profiles
      const { data: userProfile, error: profileError } = await supabaseServer
        .from("user_profiles")
        .select("tenant_id")
        .eq("clerk_user_id", user.id)
        .single()

      if (profileError || !userProfile?.tenant_id) {
        return NextResponse.json(
          { error: "User profile not found or missing tenant" },
          { status: 403 }
        )
      }

      userTenantId = userProfile.tenant_id
      reviewerId = user.id

      // Get the deal and verify tenant access
      const { data: deal, error: dealError } = await supabaseServer
        .from("deals")
        .select("tenant_id")
        .eq("id", dealId)
        .single()

      if (dealError || !deal) {
        return NextResponse.json(
          { error: "Deal not found" },
          { status: 404 }
        )
      }

      if (deal.tenant_id !== userTenantId) {
        return NextResponse.json(
          { error: "Access denied - deal belongs to different tenant" },
          { status: 403 }
        )
      }
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
      document_id: boundary.document_id,
      clause_boundary_id: clauseBoundaryId,
      decision: body.decision,
      risk_accepted: body.risk_accepted ?? false,
      comments: body.comments ?? null,
      reviewer_id: reviewerId,
      tenant_id: userTenantId,
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
    console.error("Unexpected error in PATCH clause review:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/reconciliation/[dealId]/clauses/[clauseBoundaryId]
 * Returns the review status for a specific clause
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string; clauseBoundaryId: string }> }
) {
  try {
    const { clauseBoundaryId } = await params

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
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
