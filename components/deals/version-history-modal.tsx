"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  FileText,
  Clock,
  User,
  ArrowRight,
  Shield,
  Loader2
} from "lucide-react"

interface VersionHistoryModalProps {
  dealId: string
  dealTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DocumentVersion {
  id: string
  version: number
  original_filename: string
  created_at: string
  created_by: string | null
  processing_status: string | null
  size_bytes: number
  mime_type: string
}

interface ClauseChange {
  id: string
  version: number
  change_type: string
  reason_code: string | null
  reason_description: string | null
  old_values: Record<string, unknown>
  new_values: Record<string, unknown>
  created_at: string
  changed_by: string | null
}

function formatDistanceToNow(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function VersionHistoryModal({
  dealId,
  dealTitle,
  open,
  onOpenChange
}: VersionHistoryModalProps) {
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState<DocumentVersion[]>([])
  const [clauseChanges, setClauseChanges] = useState<ClauseChange[]>([])
  const [dealVersion, setDealVersion] = useState(1)

  useEffect(() => {
    if (open && dealId) {
      fetchHistory()
    }
  }, [open, dealId])

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/deals/${dealId}/history`)
      const result = await response.json()
      if (result.success) {
        setDocuments(result.data.documents || [])
        setClauseChanges(result.data.clauseChanges || [])
        setDealVersion(result.data.deal_version || 1)
      }
    } catch (error) {
      console.error("Failed to fetch history:", error)
    } finally {
      setLoading(false)
    }
  }

  const getChangeTypeStyles = (type: string) => {
    switch (type) {
      case "status_change":
        return "bg-blue-100 text-blue-700 border-blue-200"
      case "risk_override":
        return "bg-amber-100 text-amber-700 border-amber-200"
      case "manual_review":
        return "bg-purple-100 text-purple-700 border-purple-200"
      case "ai_update":
        return "bg-green-100 text-green-700 border-green-200"
      case "parsing_correction":
        return "bg-gray-100 text-gray-700 border-gray-200"
      default:
        return "bg-gray-100 text-gray-700 border-gray-200"
    }
  }

  const getStatusStyles = (status: string | null) => {
    switch (status) {
      case "completed":
      case "clauses_extracted":
        return "bg-green-100 text-green-700"
      case "failed":
      case "needs_review":
        return "bg-red-100 text-red-700"
      case "processing":
        return "bg-blue-100 text-blue-700"
      default:
        return "bg-amber-100 text-amber-700"
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Version History
          </DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{dealTitle}</p>
        </DialogHeader>

        <Tabs defaultValue="documents" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="documents">
              Documents ({documents.length})
            </TabsTrigger>
            <TabsTrigger value="changes">
              Clause Changes ({clauseChanges.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents">
            <ScrollArea className="h-[400px] pr-4">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>No documents uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc, index) => (
                    <div key={doc.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="font-mono">
                            v{doc.version}
                          </Badge>
                          <div>
                            <p className="font-medium text-sm">{doc.original_filename}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              <User className="h-3 w-3" />
                              <span>{doc.created_by ? doc.created_by.slice(0, 8) + "..." : "System"}</span>
                              <span>-</span>
                              <span>{formatDistanceToNow(new Date(doc.created_at))}</span>
                            </div>
                          </div>
                        </div>
                        <Badge className={getStatusStyles(doc.processing_status)}>
                          {doc.processing_status || "pending"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span>{formatFileSize(doc.size_bytes)}</span>
                        <span>{doc.mime_type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="changes">
            <ScrollArea className="h-[400px] pr-4">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : clauseChanges.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Shield className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>No clause changes recorded</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {clauseChanges.map((change) => (
                    <div key={change.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <Badge className={getChangeTypeStyles(change.change_type)}>
                          {change.change_type.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(change.created_at))}
                        </span>
                      </div>
                      <div className="mt-2 text-sm">
                        {change.changed_by && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <User className="h-3 w-3" />
                            <span>{change.changed_by.slice(0, 8)}...</span>
                          </div>
                        )}
                        {change.reason_description && (
                          <p className="mt-1 text-gray-700">{change.reason_description}</p>
                        )}
                        {/* Show value changes if present */}
                        {change.old_values?.rag_status !== undefined && change.new_values?.rag_status !== undefined && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <Badge variant="outline">{String(change.old_values.rag_status)}</Badge>
                            <ArrowRight className="h-3 w-3" />
                            <Badge variant="outline">{String(change.new_values.rag_status)}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
