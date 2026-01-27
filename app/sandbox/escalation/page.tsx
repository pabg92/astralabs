"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Plus,
  GitBranch,
  RefreshCw,
  Trash2,
  AlertTriangle,
} from "lucide-react"

interface ReviewQueueItem {
  id: string
  input_text: string
  matched_clause_id: string | null
  similarity_score: number | null
  review_type: "new_clause" | "potential_variant"
  status: "pending" | "approved_new" | "approved_variant" | "rejected"
  resolution_notes: string | null
  created_clause_id: string | null
  reviewed_at: string | null
  created_at: string
}

export default function SandboxEscalationPage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("pending")

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null)
  const [actionType, setActionType] = useState<"approve_new" | "approve_variant" | "reject">(
    "approve_new"
  )

  // Form state
  const [formClauseId, setFormClauseId] = useState("")
  const [formClauseType, setFormClauseType] = useState("")
  const [formCategory, setFormCategory] = useState("")
  const [formRiskLevel, setFormRiskLevel] = useState("medium")
  const [formNotes, setFormNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const fetchItems = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)

      const response = await fetch(`/api/sandbox/escalation?${params}`)
      const data = await response.json()
      if (data.success) {
        setItems(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch review queue:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [statusFilter])

  const openActionDialog = (
    item: ReviewQueueItem,
    action: "approve_new" | "approve_variant" | "reject"
  ) => {
    setSelectedItem(item)
    setActionType(action)
    setFormClauseId("")
    setFormClauseType("")
    setFormCategory("")
    setFormRiskLevel("medium")
    setFormNotes("")

    if (action === "approve_variant" && item.matched_clause_id) {
      // Suggest next variant letter
      const baseId = item.matched_clause_id.replace(/-[a-z]$/, "")
      setFormClauseId(`${baseId}-b`)
    }

    setDialogOpen(true)
  }

  const handleResolve = async () => {
    if (!selectedItem) return

    // Validation
    if (actionType === "approve_new" && (!formClauseId || !formClauseType)) {
      alert("Please enter clause ID and type")
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        id: selectedItem.id,
        status:
          actionType === "reject"
            ? "rejected"
            : actionType === "approve_new"
            ? "approved_new"
            : "approved_variant",
        resolution_notes: formNotes || null,
      }

      if (actionType === "approve_new") {
        body.create_clause = {
          clause_id: formClauseId,
          clause_type: formClauseType,
          category: formCategory || null,
          risk_level: formRiskLevel,
        }
      }

      const response = await fetch("/api/sandbox/escalation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (data.success) {
        setDialogOpen(false)
        fetchItems()
      } else {
        alert(data.error || "Failed to resolve item")
      }
    } catch (error) {
      console.error("Resolve failed:", error)
      alert("Failed to resolve item")
    } finally {
      setSaving(false)
    }
  }

  const handleClearResolved = async () => {
    if (!confirm("Clear all resolved items from the queue?")) return

    try {
      const response = await fetch("/api/sandbox/escalation", {
        method: "DELETE",
      })

      const data = await response.json()
      if (data.success) {
        alert(`Cleared ${data.deleted_count} items`)
        fetchItems()
      }
    } catch (error) {
      console.error("Clear failed:", error)
    }
  }

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { color: string; icon: React.ReactNode }> = {
      pending: { color: "bg-yellow-500", icon: <AlertTriangle className="h-3 w-3" /> },
      approved_new: { color: "bg-green-500", icon: <Plus className="h-3 w-3" /> },
      approved_variant: { color: "bg-blue-500", icon: <GitBranch className="h-3 w-3" /> },
      rejected: { color: "bg-red-500", icon: <XCircle className="h-3 w-3" /> },
    }
    const config = configs[status] || { color: "bg-gray-500", icon: null }
    return (
      <Badge className={`${config.color} gap-1`}>
        {config.icon}
        {status.replace("_", " ")}
      </Badge>
    )
  }

  const pendingCount = items.filter((i) => i.status === "pending").length

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <Link
          href="/sandbox"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sandbox
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Review Queue</h1>
            <p className="text-muted-foreground mt-1">
              Review escalated clauses and approve for LCL
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved_new">Approved (New)</SelectItem>
                <SelectItem value="approved_variant">Approved (Variant)</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchItems} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" onClick={handleClearResolved}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear Resolved
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-2xl font-bold text-yellow-500">{pendingCount}</div>
          <div className="text-sm text-muted-foreground">Pending Review</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {items.filter((i) => i.review_type === "new_clause").length}
          </div>
          <div className="text-sm text-muted-foreground">New Clause Candidates</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {items.filter((i) => i.review_type === "potential_variant").length}
          </div>
          <div className="text-sm text-muted-foreground">Potential Variants</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-500">
            {items.filter((i) => i.status.startsWith("approved")).length}
          </div>
          <div className="text-sm text-muted-foreground">Approved</div>
        </Card>
      </div>

      {/* Queue Items */}
      <div className="space-y-4">
        {items.map((item) => (
          <Card key={item.id} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {getStatusBadge(item.status)}
                <Badge variant="outline">
                  {item.review_type === "new_clause" ? "New Clause" : "Potential Variant"}
                </Badge>
                {item.similarity_score !== null && (
                  <Badge variant="secondary">
                    Similarity: {(item.similarity_score * 100).toFixed(1)}%
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {new Date(item.created_at).toLocaleString()}
              </div>
            </div>

            <div className="mb-4">
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm">{item.input_text}</div>
              </div>
            </div>

            {item.matched_clause_id && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium">Closest Match:</span> {item.matched_clause_id}
                  {item.similarity_score !== null && (
                    <> ({(item.similarity_score * 100).toFixed(1)}% similar)</>
                  )}
                </div>
              </div>
            )}

            {item.status === "pending" ? (
              <div className="flex gap-3">
                <Button
                  onClick={() => openActionDialog(item, "approve_new")}
                  size="sm"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add as New
                </Button>
                {item.matched_clause_id && (
                  <Button
                    onClick={() => openActionDialog(item, "approve_variant")}
                    variant="outline"
                    size="sm"
                  >
                    <GitBranch className="mr-2 h-4 w-4" />
                    Add as Variant
                  </Button>
                )}
                <Button
                  onClick={() => openActionDialog(item, "reject")}
                  variant="destructive"
                  size="sm"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4" />
                Resolved
                {item.reviewed_at && ` on ${new Date(item.reviewed_at).toLocaleString()}`}
                {item.created_clause_id && (
                  <>
                    {" "}
                    - Created:{" "}
                    <span className="font-mono">{item.created_clause_id}</span>
                  </>
                )}
                {item.resolution_notes && (
                  <>
                    {" "}
                    - Note: {item.resolution_notes}
                  </>
                )}
              </div>
            )}
          </Card>
        ))}

        {items.length === 0 && (
          <Card className="p-12 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2">
              {statusFilter === "pending" ? "All Clear!" : "No Items Found"}
            </h3>
            <p className="text-muted-foreground">
              {statusFilter === "pending"
                ? "No items pending review"
                : "No items match the selected filter"}
            </p>
          </Card>
        )}
      </div>

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve_new" && "Add as New Clause"}
              {actionType === "approve_variant" && "Add as Variant"}
              {actionType === "reject" && "Reject Clause"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve_new" &&
                "Create a new entry in the sandbox LCL with this clause text"}
              {actionType === "approve_variant" &&
                "Add as a variation of an existing clause"}
              {actionType === "reject" && "Reject this clause submission"}
            </DialogDescription>
          </DialogHeader>

          {actionType === "reject" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reject-notes">Rejection Notes</Label>
                <Textarea
                  id="reject-notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Reason for rejection..."
                  rows={3}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleResolve} disabled={saving}>
                  Confirm Reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clause-id">Clause ID *</Label>
                  <Input
                    id="clause-id"
                    value={formClauseId}
                    onChange={(e) => setFormClauseId(e.target.value)}
                    placeholder="LC-XXX-001-a"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clause-type">Clause Type *</Label>
                  <Input
                    id="clause-type"
                    value={formClauseType}
                    onChange={(e) => setFormClauseType(e.target.value)}
                    placeholder="payment_terms"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="Payment"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="risk-level">Risk Level</Label>
                  <Select value={formRiskLevel} onValueChange={setFormRiskLevel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={2}
                />
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm font-semibold mb-2">Clause Text</div>
                <div className="text-sm">{selectedItem?.input_text}</div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleResolve} disabled={saving}>
                  {saving ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Approve & Add to LCL"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
