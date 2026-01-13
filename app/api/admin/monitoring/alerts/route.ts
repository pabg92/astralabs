import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import { authenticateAdmin, internalError } from "@/lib/auth/api-auth"

/**
 * Alert Triggers (Query 6.2)
 * Purpose: Identify conditions requiring immediate attention
 * Requires admin or curator role
 *
 * Alert Types:
 * - stuck_documents: Documents pending/processing for >2 hours (severity: critical)
 * - high_error_rate: >10 edge function errors in last hour (severity: warning)
 * - critical_reviews_backlog: >5 critical reviews pending >24h (severity: high)
 * - slow_processing: >5 executions taking >30s in last hour (severity: warning)
 *
 * Caching: 60 second TTL in memory
 */

// In-memory cache
let cachedData: any = null
let cacheTimestamp: number = 0
const CACHE_TTL_MS = 60 * 1000 // 60 seconds

export async function GET() {
  try {
    // Authenticate and require admin role
    const authResult = await authenticateAdmin()
    if (!authResult.success) return authResult.response

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

    // Execute Query 6.2: Alert Triggers
    // Break down into multiple queries to avoid needing execute_sql RPC function

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
      stuckDocs,
      recentErrors,
      criticalReviews,
      slowProcessing
    ] = await Promise.all([
      // Stuck documents (>2 hours)
      supabaseServer
        .from('document_repository')
        .select('id', { count: 'exact', head: true })
        .in('processing_status', ['pending', 'processing'])
        .lt('created_at', twoHoursAgo),

      // High error rate (>10 errors in last hour)
      supabaseServer
        .from('edge_function_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'error')
        .gte('created_at', oneHourAgo),

      // Critical reviews backlog (>5 critical items >24h old)
      supabaseServer
        .from('admin_review_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('priority', 'critical')
        .lt('created_at', twentyFourHoursAgo),

      // Slow processing (>5 executions >30s in last hour)
      supabaseServer
        .from('edge_function_logs')
        .select('id', { count: 'exact', head: true })
        .gt('execution_time_ms', 30000)
        .gte('created_at', oneHourAgo)
    ])

    // Build alerts array based on thresholds
    const alertsData = []

    if ((stuckDocs.count || 0) > 0) {
      alertsData.push({
        alert_type: 'stuck_documents',
        count: stuckDocs.count,
        severity: 'critical'
      })
    }

    if ((recentErrors.count || 0) > 10) {
      alertsData.push({
        alert_type: 'high_error_rate',
        count: recentErrors.count,
        severity: 'warning'
      })
    }

    if ((criticalReviews.count || 0) > 5) {
      alertsData.push({
        alert_type: 'critical_reviews_backlog',
        count: criticalReviews.count,
        severity: 'high'
      })
    }

    if ((slowProcessing.count || 0) > 5) {
      alertsData.push({
        alert_type: 'slow_processing',
        count: slowProcessing.count,
        severity: 'warning'
      })
    }

    cachedData = alertsData
    cacheTimestamp = now

    return NextResponse.json({
      success: true,
      data: alertsData,
      has_alerts: alertsData.length > 0,
      cached: false,
      timestamp: new Date(cacheTimestamp).toISOString(),
      age_seconds: 0
    })

  } catch (error) {
    return internalError(error, "GET /api/admin/monitoring/alerts")
  }
}
