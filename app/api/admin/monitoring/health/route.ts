import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

/**
 * System Health Summary (Query 6.1)
 * Purpose: Single query for dashboard overview showing real-time system health
 *
 * Returns:
 * - pending_documents: Count of documents waiting to be processed
 * - processing_documents: Count of documents currently processing
 * - critical_reviews: Count of critical priority items in admin review queue
 * - errors_last_hour: Count of edge function errors in the last hour
 * - avg_execution_ms: Average execution time of edge functions in the last hour
 * - documents_processed_24h: Count of successfully processed documents in last 24h
 *
 * Caching: 60 second TTL in memory
 */

// In-memory cache
let cachedData: any = null
let cacheTimestamp: number = 0
const CACHE_TTL_MS = 60 * 1000 // 60 seconds

export async function GET() {
  try {
    const now = Date.now()

    // Check cache validity
    if (cachedData && (now - cacheTimestamp) < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        data: cachedData,
        cached: true,
        timestamp: new Date(cacheTimestamp).toISOString(),
        age_seconds: Math.floor((now - cacheTimestamp) / 1000)
      })
    }

    // Execute Query 6.1: System Health Summary
    // Break down into multiple queries to avoid needing execute_sql RPC function

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
      pendingDocs,
      processingDocs,
      criticalReviews,
      errorsLastHour,
      avgExecution,
      docsProcessed24h
    ] = await Promise.all([
      // Pending documents count
      supabaseServer
        .from('document_repository')
        .select('id', { count: 'exact', head: true })
        .eq('processing_status', 'pending'),

      // Processing documents count
      supabaseServer
        .from('document_repository')
        .select('id', { count: 'exact', head: true })
        .eq('processing_status', 'processing'),

      // Critical reviews count
      supabaseServer
        .from('admin_review_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('priority', 'critical'),

      // Errors in last hour
      supabaseServer
        .from('edge_function_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'error')
        .gte('created_at', oneHourAgo),

      // Average execution time (last hour) - need to fetch data for calculation
      supabaseServer
        .from('edge_function_logs')
        .select('execution_time_ms')
        .gte('created_at', oneHourAgo),

      // Documents processed in last 24h (distinct document_id with success status)
      supabaseServer
        .from('edge_function_logs')
        .select('document_id')
        .eq('status', 'success')
        .gte('created_at', twentyFourHoursAgo)
    ])

    // Calculate average execution time
    let avgExecutionMs = null
    if (avgExecution.data && avgExecution.data.length > 0) {
      const sum = avgExecution.data.reduce((acc, log) => acc + (log.execution_time_ms || 0), 0)
      avgExecutionMs = Math.round((sum / avgExecution.data.length) * 100) / 100
    }

    // Count distinct document IDs for 24h processing
    const uniqueDocIds = new Set(docsProcessed24h.data?.map(log => log.document_id) || [])

    const healthData = {
      pending_documents: pendingDocs.count || 0,
      processing_documents: processingDocs.count || 0,
      critical_reviews: criticalReviews.count || 0,
      errors_last_hour: errorsLastHour.count || 0,
      avg_execution_ms: avgExecutionMs,
      documents_processed_24h: uniqueDocIds.size
    }

    cachedData = healthData
    cacheTimestamp = now

    return NextResponse.json({
      success: true,
      data: healthData,
      cached: false,
      timestamp: new Date(cacheTimestamp).toISOString(),
      age_seconds: 0
    })

  } catch (error) {
    console.error("Unexpected error in GET /api/admin/monitoring/health:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: String(error)
      },
      { status: 500 }
    )
  }
}
