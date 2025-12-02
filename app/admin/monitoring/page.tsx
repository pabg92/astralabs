import { supabaseServer } from "@/lib/supabase/server"
import { MonitoringClient } from "./MonitoringClient"

/**
 * Admin Monitoring Dashboard
 * Server Component that fetches monitoring data server-side (service key hidden from browser)
 * Wrapped by MonitoringClient for 30-second auto-refresh
 */

async function fetchHealthData() {
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
    supabaseServer
      .from('document_repository')
      .select('id', { count: 'exact', head: true })
      .eq('processing_status', 'pending'),

    supabaseServer
      .from('document_repository')
      .select('id', { count: 'exact', head: true })
      .eq('processing_status', 'processing'),

    supabaseServer
      .from('admin_review_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('priority', 'critical'),

    supabaseServer
      .from('edge_function_logs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'error')
      .gte('created_at', oneHourAgo),

    supabaseServer
      .from('edge_function_logs')
      .select('execution_time_ms')
      .gte('created_at', oneHourAgo),

    supabaseServer
      .from('edge_function_logs')
      .select('document_id')
      .eq('status', 'success')
      .gte('created_at', twentyFourHoursAgo)
  ])

  let avgExecutionMs = null
  if (avgExecution.data && avgExecution.data.length > 0) {
    const sum = avgExecution.data.reduce((acc, log) => acc + (log.execution_time_ms || 0), 0)
    avgExecutionMs = Math.round((sum / avgExecution.data.length) * 100) / 100
  }

  const uniqueDocIds = new Set(docsProcessed24h.data?.map(log => log.document_id) || [])

  return {
    pending_documents: pendingDocs.count || 0,
    processing_documents: processingDocs.count || 0,
    critical_reviews: criticalReviews.count || 0,
    errors_last_hour: errorsLastHour.count || 0,
    avg_execution_ms: avgExecutionMs,
    documents_processed_24h: uniqueDocIds.size
  }
}

async function fetchAlertsData() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    stuckDocs,
    recentErrors,
    criticalReviews,
    slowProcessing
  ] = await Promise.all([
    supabaseServer
      .from('document_repository')
      .select('id', { count: 'exact', head: true })
      .in('processing_status', ['pending', 'processing'])
      .lt('created_at', twoHoursAgo),

    supabaseServer
      .from('edge_function_logs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'error')
      .gte('created_at', oneHourAgo),

    supabaseServer
      .from('admin_review_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('priority', 'critical')
      .lt('created_at', twentyFourHoursAgo),

    supabaseServer
      .from('edge_function_logs')
      .select('id', { count: 'exact', head: true })
      .gt('execution_time_ms', 30000)
      .gte('created_at', oneHourAgo)
  ])

  const alerts: { alert_type: string; count: number; severity: 'critical' | 'warning' | 'high' }[] = []

  if ((stuckDocs.count || 0) > 0) {
    alerts.push({
      alert_type: 'stuck_documents',
      count: Number(stuckDocs.count || 0),
      severity: 'critical'
    })
  }

  if ((recentErrors.count || 0) > 10) {
    alerts.push({
      alert_type: 'high_error_rate',
      count: Number(recentErrors.count || 0),
      severity: 'warning'
    })
  }

  if ((criticalReviews.count || 0) > 5) {
    alerts.push({
      alert_type: 'critical_reviews_backlog',
      count: Number(criticalReviews.count || 0),
      severity: 'high'
    })
  }

  if ((slowProcessing.count || 0) > 5) {
    alerts.push({
      alert_type: 'slow_processing',
      count: Number(slowProcessing.count || 0),
      severity: 'warning'
    })
  }

  return alerts
}

async function fetchStuckDocuments() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data: stuckDocuments } = await supabaseServer
    .from('document_repository')
    .select('id, deal_id, original_filename, processing_status, error_message, created_at')
    .in('processing_status', ['pending', 'processing'])
    .lt('created_at', oneHourAgo)
    .order('created_at', { ascending: true })
    .limit(100)

  if (!stuckDocuments || stuckDocuments.length === 0) {
    return []
  }

  const documentIds = stuckDocuments.map(doc => doc.id)
  const { data: edgeLogs } = await supabaseServer
    .from('edge_function_logs')
    .select('id, document_id, stage, status')
    .in('document_id', documentIds)

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

  return stuckDocuments.map(doc => {
    const createdDate = doc.created_at ? new Date(doc.created_at) : new Date(0)
    const ageMinutes = (Date.now() - createdDate.getTime()) / (60 * 1000)
    const logs = logsByDocument.get(doc.id)

    return {
      document_id: doc.id,
      deal_id: doc.deal_id,
      original_filename: doc.original_filename,
      processing_status: doc.processing_status,
      error_message: doc.error_message,
      created_at: doc.created_at ?? new Date().toISOString(),
      age_minutes: Math.round(ageMinutes * 100) / 100,
      edge_function_calls: logs ? logs.ids.size : 0,
      execution_history: logs ? Array.from(logs.history).join(', ') : null
    }
  })
}

export default async function MonitoringPage() {
  // Fetch all monitoring data server-side
  const [healthData, alerts, stuckDocuments] = await Promise.all([
    fetchHealthData(),
    fetchAlertsData(),
    fetchStuckDocuments()
  ])

  const initialData = {
    health: healthData,
    alerts,
    stuckDocuments,
    timestamp: new Date().toISOString()
  }

  return (
    <MonitoringClient initialData={initialData} />
  )
}
