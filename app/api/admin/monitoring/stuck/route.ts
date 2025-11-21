import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

/**
 * Stuck Documents (Query 2.2)
 * Purpose: Identify documents pending/processing for >1 hour that may need manual intervention
 *
 * Returns:
 * - document_id: ID of stuck document
 * - deal_id: Associated deal ID
 * - original_filename: Name of uploaded file
 * - processing_status: Current status (pending or processing)
 * - error_message: Any error messages
 * - created_at: When document was uploaded
 * - age_minutes: How long document has been stuck
 * - edge_function_calls: Count of edge function attempts
 * - execution_history: Summary of edge function execution stages and statuses
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

    // Execute Query 2.2: Stuck Documents (Pending > 1 Hour)
    // Break down into queries to avoid needing execute_sql RPC function

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    // Get stuck documents
    const { data: stuckDocuments, error: stuckError } = await supabaseServer
      .from('document_repository')
      .select('id, deal_id, original_filename, processing_status, error_message, created_at')
      .in('processing_status', ['pending', 'processing'])
      .lt('created_at', oneHourAgo)
      .order('created_at', { ascending: true })
      .limit(100)

    if (stuckError) {
      console.error("Error fetching stuck documents:", stuckError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch stuck documents data",
          details: stuckError.message
        },
        { status: 500 }
      )
    }

    if (!stuckDocuments || stuckDocuments.length === 0) {
      // No stuck documents - return empty array
      cachedData = []
      cacheTimestamp = now

      return NextResponse.json({
        success: true,
        data: [],
        count: 0,
        cached: false,
        timestamp: new Date(cacheTimestamp).toISOString(),
        age_seconds: 0
      })
    }

    // Get edge function logs for these documents
    const documentIds = stuckDocuments.map(doc => doc.id)
    const { data: edgeLogs, error: logsError } = await supabaseServer
      .from('edge_function_logs')
      .select('id, document_id, stage, status')
      .in('document_id', documentIds)

    if (logsError) {
      console.error("Error fetching edge function logs:", logsError)
      // Continue without edge function data rather than failing
    }

    // Aggregate edge function data per document
    const logsByDocument = new Map()
    edgeLogs?.forEach(log => {
      if (!logsByDocument.has(log.document_id)) {
        logsByDocument.set(log.document_id, {
          ids: new Set(),
          history: new Set()
        })
      }
      const docLogs = logsByDocument.get(log.document_id)
      docLogs.ids.add(log.id)
      docLogs.history.add(`${log.stage}:${log.status}`)
    })

    // Combine document data with edge function aggregates
    const stuckData = stuckDocuments.map(doc => {
      const ageMinutes = (Date.now() - new Date(doc.created_at).getTime()) / (60 * 1000)
      const logs = logsByDocument.get(doc.id)

      return {
        document_id: doc.id,
        deal_id: doc.deal_id,
        original_filename: doc.original_filename,
        processing_status: doc.processing_status,
        error_message: doc.error_message,
        created_at: doc.created_at,
        age_minutes: Math.round(ageMinutes * 100) / 100,
        edge_function_calls: logs ? logs.ids.size : 0,
        execution_history: logs ? Array.from(logs.history).join(', ') : null
      }
    })

    cachedData = stuckData
    cacheTimestamp = now

    return NextResponse.json({
      success: true,
      data: stuckData,
      count: stuckData.length,
      cached: false,
      timestamp: new Date(cacheTimestamp).toISOString(),
      age_seconds: 0
    })

  } catch (error) {
    console.error("Unexpected error in GET /api/admin/monitoring/stuck:", error)
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
