import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * GET /api/admin/dedup
 * Lists duplicate clause clusters pending review
 *
 * Query params:
 * - limit: number of clusters to return (default: 50)
 * - priority: filter by review_priority (high/medium/low)
 *
 * Requires: Service role key for admin access
 */
export async function GET(request: NextRequest) {
  try {
    // Verify service role authorization
    const authHeader = request.headers.get("authorization")
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!authHeader || !authHeader.includes(serviceKey || "")) {
      return NextResponse.json(
        { error: "Unauthorized - Service role required" },
        { status: 401 }
      )
    }

    // Initialize Supabase with service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey!
    )

    // Parse query params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "50")
    const priority = searchParams.get("priority")

    // Query dedup review queue
    let query = supabase
      .from("v_dedup_review_queue")
      .select("*")
      .order("avg_similarity", { ascending: false })
      .limit(limit)

    if (priority) {
      query = query.eq("review_priority", priority)
    }

    const { data: clusters, error } = await query

    if (error) {
      console.error("Error fetching dedup queue:", error)
      return NextResponse.json(
        { error: "Failed to fetch dedup queue", details: error.message },
        { status: 500 }
      )
    }

    // Get summary statistics
    const { data: stats } = await supabase.rpc("get_dedup_stats").single()

    return NextResponse.json({
      success: true,
      clusters: clusters || [],
      total: clusters?.length || 0,
      stats: stats || {
        total_clusters: 0,
        high_priority: 0,
        medium_priority: 0,
        low_priority: 0,
      },
    })
  } catch (error) {
    console.error("Unexpected error in GET /api/admin/dedup:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/dedup
 * Mark a duplicate cluster as reviewed and optionally merge
 *
 * Body:
 * {
 *   "cluster_id": "uuid",
 *   "action": "merge" | "keep_separate" | "reject",
 *   "primary_clause_id": "uuid" (required for merge)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify service role authorization
    const authHeader = request.headers.get("authorization")
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!authHeader || !authHeader.includes(serviceKey || "")) {
      return NextResponse.json(
        { error: "Unauthorized - Service role required" },
        { status: 401 }
      )
    }

    // Initialize Supabase with service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey!
    )

    const body = await request.json()
    const { cluster_id, action, primary_clause_id } = body

    if (!cluster_id || !action) {
      return NextResponse.json(
        { error: "cluster_id and action are required" },
        { status: 400 }
      )
    }

    if (action === "merge" && !primary_clause_id) {
      return NextResponse.json(
        { error: "primary_clause_id is required for merge action" },
        { status: 400 }
      )
    }

    // Update cluster merge_status
    const newStatus =
      action === "merge"
        ? "merged"
        : action === "keep_separate"
          ? "reviewed_separate"
          : "rejected"

    const { error: updateError } = await supabase
      .from("clause_deduplication_clusters")
      .update({
        merge_status: newStatus,
        reviewed_at: new Date().toISOString(),
      })
      .eq("cluster_id", cluster_id)

    if (updateError) {
      console.error("Error updating cluster:", updateError)
      return NextResponse.json(
        { error: "Failed to update cluster", details: updateError.message },
        { status: 500 }
      )
    }

    // If merging, deactivate duplicate clauses
    if (action === "merge") {
      const { data: cluster } = await supabase
        .from("clause_deduplication_clusters")
        .select("duplicate_clause_ids")
        .eq("cluster_id", cluster_id)
        .single()

      if (cluster && cluster.duplicate_clause_ids) {
        // Deactivate all clauses except the primary
        const clausesToDeactivate = cluster.duplicate_clause_ids.filter(
          (id: string) => id !== primary_clause_id
        )

        if (clausesToDeactivate.length > 0) {
          const { error: deactivateError } = await supabase
            .from("legal_clause_library")
            .update({ active: false })
            .in("id", clausesToDeactivate)

          if (deactivateError) {
            console.error("Error deactivating duplicates:", deactivateError)
            // Continue despite error
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cluster ${action}d successfully`,
      cluster_id,
      action,
    })
  } catch (error) {
    console.error("Unexpected error in POST /api/admin/dedup:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
