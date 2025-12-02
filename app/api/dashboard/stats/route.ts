import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

/**
 * Response types for dashboard stats
 */
interface RecentDeal {
  id: string
  title: string
  client_name: string
  talent_name: string
  status: "draft" | "in_review" | "signed" | "cancelled"
  progress: number
  is_urgent: boolean
  updated_at: string | null
}

interface DashboardStats {
  contracts_reconciled: number
  contracts_reconciled_change: number
  contracts_signed: number
  contracts_signed_change: number
  clauses_reviewed: number
  clauses_reviewed_change: number
  hours_saved: number
  hours_saved_change: number
  avg_risk_reduction: number
  avg_risk_reduction_change: number
  recent_deals: RecentDeal[]
}

/**
 * GET /api/dashboard/stats
 * Returns dashboard KPIs and recent deals with progress
 * Uses service role client (server-side only)
 */
export async function GET() {
  try {
    // Run all queries in parallel for performance
    const [
      reconciledResult,
      signedResult,
      reviewedResult,
      ragStatusResult,
      recentDealsResult,
    ] = await Promise.all([
      // Contracts reconciled: deals with at least one completed document
      supabaseServer
        .from("deals")
        .select("id, document_repository!inner(processing_status)")
        .eq("document_repository.processing_status", "completed"),

      // Contracts signed: deals with status = 'signed'
      supabaseServer
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("status", "signed"),

      // Clauses reviewed: total count of clause_reviews
      supabaseServer
        .from("clause_reviews")
        .select("id", { count: "exact", head: true }),

      // RAG status distribution for risk reduction calculation
      supabaseServer
        .from("clause_match_results")
        .select("rag_status"),

      // Recent deals with document and clause data for progress calculation
      supabaseServer
        .from("deals")
        .select(`
          id,
          title,
          client_name,
          talent_name,
          status,
          updated_at,
          document_repository (
            id,
            processing_status,
            clause_boundaries (id)
          )
        `)
        .order("updated_at", { ascending: false })
        .limit(5),
    ])

    // Process contracts reconciled (distinct deals with completed docs)
    const reconciledDeals = new Set<string>()
    if (reconciledResult.data) {
      reconciledResult.data.forEach((deal: { id: string }) => {
        reconciledDeals.add(deal.id)
      })
    }
    const contractsReconciled = reconciledDeals.size

    // Process contracts signed
    const contractsSigned = signedResult.count ?? 0

    // Process clauses reviewed
    const clausesReviewed = reviewedResult.count ?? 0

    // Calculate hours saved (0.5 hours per clause reviewed)
    const hoursSaved = Math.round(clausesReviewed * 0.5)

    // Calculate average risk reduction (% green out of total)
    let avgRiskReduction = 0
    if (ragStatusResult.data && ragStatusResult.data.length > 0) {
      const total = ragStatusResult.data.length
      const greenCount = ragStatusResult.data.filter(
        (r: { rag_status: string }) => r.rag_status === "green"
      ).length
      avgRiskReduction = Math.round((greenCount / total) * 100)
    }

    // Get clause reviews for progress calculation
    const { data: allReviews } = await supabaseServer
      .from("clause_reviews")
      .select("clause_boundary_id")

    const reviewedClauseIds = new Set(
      allReviews?.map((r: { clause_boundary_id: string }) => r.clause_boundary_id) ?? []
    )

    // Process recent deals with progress
    const recentDeals: RecentDeal[] = []
    if (recentDealsResult.data) {
      for (const deal of recentDealsResult.data as any[]) {
        // Count total clauses and reviewed clauses for this deal
        let totalClauses = 0
        let reviewedClauses = 0

        const documents = deal.document_repository || []
        for (const doc of documents) {
          const boundaries = doc.clause_boundaries || []
          totalClauses += boundaries.length
          for (const boundary of boundaries) {
            if (reviewedClauseIds.has(boundary.id)) {
              reviewedClauses++
            }
          }
        }

        // Calculate progress (guard against division by zero)
        const progress = totalClauses > 0
          ? Math.round((reviewedClauses / totalClauses) * 100)
          : 0

        // Determine urgency based on status and progress
        const isUrgent = deal.status === "in_review" && progress < 50

        recentDeals.push({
          id: deal.id,
          title: deal.title,
          client_name: deal.client_name,
          talent_name: deal.talent_name,
          status: deal.status || "draft",
          progress,
          is_urgent: isUrgent,
          updated_at: deal.updated_at,
        })
      }
    }

    // For "this month" changes, we'd need historical data or time-filtered queries
    // For MVP, we'll show the current values as the "change" values
    // In production, you'd query with date filters for the current month
    const stats: DashboardStats = {
      contracts_reconciled: contractsReconciled,
      contracts_reconciled_change: contractsReconciled, // This month's count
      contracts_signed: contractsSigned,
      contracts_signed_change: contractsSigned,
      clauses_reviewed: clausesReviewed,
      clauses_reviewed_change: clausesReviewed,
      hours_saved: hoursSaved,
      hours_saved_change: hoursSaved,
      avg_risk_reduction: avgRiskReduction,
      avg_risk_reduction_change: avgRiskReduction,
      recent_deals: recentDeals,
    }

    return NextResponse.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error("Error fetching dashboard stats:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch dashboard stats",
        details: String(error),
        data: {
          contracts_reconciled: 0,
          contracts_reconciled_change: 0,
          contracts_signed: 0,
          contracts_signed_change: 0,
          clauses_reviewed: 0,
          clauses_reviewed_change: 0,
          hours_saved: 0,
          hours_saved_change: 0,
          avg_risk_reduction: 0,
          avg_risk_reduction_change: 0,
          recent_deals: [],
        } as DashboardStats,
      },
      { status: 500 }
    )
  }
}
