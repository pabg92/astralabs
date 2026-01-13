import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import { authenticateAdmin, internalError } from "@/lib/auth/api-auth"

/**
 * GET /api/admin/dedup
 * Lists duplicate clause clusters pending review
 * Requires admin or curator role
 *
 * Query params:
 * - limit: number of clusters to return (default: 50)
 * - priority: filter by review_priority (high/medium/low)
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate and require admin role
    const authResult = await authenticateAdmin()
    if (!authResult.success) return authResult.response

    // Parse query params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "50")
    const priority = searchParams.get("priority")

    // Query dedup review queue
    let query = supabaseServer
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
    const { data: stats } = await supabaseServer.rpc("get_dedup_stats").single()

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
    return internalError(error, "GET /api/admin/dedup")
  }
}

/**
 * POST /api/admin/dedup
 * Mark a duplicate cluster as reviewed and optionally merge
 * Requires admin or curator role
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
    // Authenticate and require admin role
    const authResult = await authenticateAdmin()
    if (!authResult.success) return authResult.response

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

    const { error: updateError } = await supabaseServer
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
      const { data: cluster } = await supabaseServer
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
          const { error: deactivateError } = await supabaseServer
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
    return internalError(error, "POST /api/admin/dedup")
  }
}
