"use client"

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle, Clock, TrendingUp, XCircle, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface HealthData {
  pending_documents: number
  processing_documents: number
  critical_reviews: number
  errors_last_hour: number
  avg_execution_ms: number | null
  documents_processed_24h: number
}

interface Alert {
  alert_type: string
  count: number
  severity: 'critical' | 'warning' | 'high'
}

interface StuckDocument {
  document_id: string
  deal_id: string | null
  original_filename: string
  processing_status: string | null
  error_message: string | null
  created_at: string
  age_minutes: number
  edge_function_calls: number
  execution_history: string | null
}

interface MonitoringData {
  health: HealthData
  alerts: Alert[]
  stuckDocuments: StuckDocument[]
  timestamp: string
}

interface MonitoringClientProps {
  initialData: MonitoringData
}

export function MonitoringClient({ initialData }: MonitoringClientProps) {
  const [data, setData] = useState<MonitoringData>(initialData)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(new Date(initialData.timestamp))

  useEffect(() => {
    const interval = setInterval(async () => {
      setIsRefreshing(true)
      try {
        // Fetch fresh data from API routes (with caching)
        const [healthRes, alertsRes, stuckRes] = await Promise.all([
          fetch('/api/admin/monitoring/health'),
          fetch('/api/admin/monitoring/alerts'),
          fetch('/api/admin/monitoring/stuck')
        ])

        const [healthJson, alertsJson, stuckJson] = await Promise.all([
          healthRes.json(),
          alertsRes.json(),
          stuckRes.json()
        ])

        if (healthJson.success && alertsJson.success && stuckJson.success) {
          setData({
            health: healthJson.data,
            alerts: alertsJson.data,
            stuckDocuments: stuckJson.data,
            timestamp: healthJson.timestamp
          })
          setLastUpdate(new Date())
        }
      } catch (error) {
        console.error('Error refreshing monitoring data:', error)
      } finally {
        setIsRefreshing(false)
      }
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Last updated: {lastUpdate.toLocaleTimeString()}
            {isRefreshing && <span className="ml-2 text-blue-600">Refreshing...</span>}
          </p>
        </div>
      </div>

      {/* Alert Banner */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`rounded-lg border-l-4 p-4 ${
                alert.severity === 'critical'
                  ? 'bg-red-50 border-red-500'
                  : alert.severity === 'high'
                    ? 'bg-orange-50 border-orange-500'
                    : 'bg-yellow-50 border-yellow-500'
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  className={`w-5 h-5 mt-0.5 ${
                    alert.severity === 'critical'
                      ? 'text-red-600'
                      : alert.severity === 'high'
                        ? 'text-orange-600'
                        : 'text-yellow-600'
                  }`}
                />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">
                    {alert.alert_type === 'stuck_documents' && 'Stuck Documents Detected'}
                    {alert.alert_type === 'high_error_rate' && 'High Error Rate'}
                    {alert.alert_type === 'critical_reviews_backlog' && 'Critical Reviews Backlog'}
                    {alert.alert_type === 'slow_processing' && 'Slow Processing Detected'}
                  </h3>
                  <p className="text-sm mt-1 text-gray-700">
                    {alert.alert_type === 'stuck_documents' &&
                      `${alert.count} document(s) have been stuck in processing for over 2 hours`}
                    {alert.alert_type === 'high_error_rate' &&
                      `${alert.count} errors detected in the last hour (threshold: 10)`}
                    {alert.alert_type === 'critical_reviews_backlog' &&
                      `${alert.count} critical reviews pending for over 24 hours`}
                    {alert.alert_type === 'slow_processing' &&
                      `${alert.count} edge function executions took over 30 seconds in the last hour`}
                  </p>
                </div>
                <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                  {alert.severity.toUpperCase()}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Health Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Documents</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.health.pending_documents}</div>
            <p className="text-xs text-muted-foreground">Waiting to be processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.health.processing_documents}</div>
            <p className="text-xs text-muted-foreground">Currently being processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors (1h)</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{data.health.errors_last_hour}</div>
            <p className="text-xs text-muted-foreground">Errors in the last hour</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Execution Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.health.avg_execution_ms ? `${data.health.avg_execution_ms.toFixed(0)}ms` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">Average edge function time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Reviews</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{data.health.critical_reviews}</div>
            <p className="text-xs text-muted-foreground">Pending critical reviews</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processed (24h)</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data.health.documents_processed_24h}</div>
            <p className="text-xs text-muted-foreground">Successfully processed</p>
          </CardContent>
        </Card>
      </div>

      {/* Stuck Documents Table */}
      {data.stuckDocuments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Stuck Documents (Pending &gt; 1 Hour)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Filename</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">Age (min)</th>
                    <th className="text-left p-2 font-medium">Edge Calls</th>
                    <th className="text-left p-2 font-medium">Execution History</th>
                    <th className="text-left p-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stuckDocuments.map((doc) => (
                    <tr key={doc.document_id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <div className="font-mono text-xs">{doc.original_filename}</div>
                        <div className="text-xs text-gray-500">{doc.document_id.substring(0, 8)}...</div>
                      </td>
                      <td className="p-2">
                        <Badge variant={doc.processing_status === 'pending' ? 'secondary' : 'outline'}>
                          {doc.processing_status}
                        </Badge>
                      </td>
                      <td className="p-2 font-mono">{doc.age_minutes}</td>
                      <td className="p-2 text-center">{doc.edge_function_calls}</td>
                      <td className="p-2">
                        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                          {doc.execution_history || 'None'}
                        </code>
                      </td>
                      <td className="p-2 text-xs text-red-600 max-w-xs truncate">
                        {doc.error_message || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
            <p className="font-medium">No Stuck Documents</p>
            <p className="text-sm">All documents are processing normally</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
