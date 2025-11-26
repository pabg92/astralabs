"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
 Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Plus,
  GitBranch,
} from "lucide-react"

interface ReviewQueueItem {
  id: string
  review_type: string
  priority: string
  status: string
  issue_description: string
  original_text: string
  confidence_score: number | null
  clause_boundary_id: string | null
  document_id: string | null
  flagged_at: string
  resolved_at: string | null
  metadata: {
    similarity_score?: number
    clause_type?: string
    matched_clause_id?: string
    reason?: string
  }
}

export default function AdminReviewQueuePage() {
  const [queueItems, setQueueItems] = useState<ReviewQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [actionType, setActionType] = useState<"new" | "variant" | "reject">("new")

  // Form state for accepting clause
  const [newClauseId, setNewClauseId] = useState("")
  const [parentClauseId, setParentClauseId] = useState("")
  const [variationLetter, setVariationLetter] = useState("b")
  const [category, setCategory] = useState("")
  const [riskLevel, setRiskLevel] = useState<"low" | "medium" | "high" | "critical">("medium")
  const [plainEnglishSummary, setPlainEnglishSummary] = useState("")
  const [tags, setTags] = useState("")

  useEffect(() => {
    fetchQueueItems()
  }, [])

  const fetchQueueItems = async () => {
    try {
      const response = await fetch("/api/admin/review-queue")
      const data = await response.json()
      if (data.success) {
        setQueueItems(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch queue:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptAsNew = async () => {
    if (!selectedItem || !newClauseId) return

    try {
      const response = await fetch("/api/admin/review-queue/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_queue_id: selectedItem.id,
          clause_id: newClauseId,
          category,
          risk_level: riskLevel,
          plain_english_summary: plainEnglishSummary,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          action: "add_new",
        }),
      })

      const data = await response.json()
      if (data.success) {
        setActionDialogOpen(false)
        fetchQueueItems()
        resetForm()
      } else {
        alert(data.error || "Failed to accept clause")
      }
    } catch (error) {
      console.error("Failed to accept clause:", error)
      alert("Failed to accept clause")
    }
  }

  const handleAcceptAsVariant = async () => {
    if (!selectedItem || !parentClauseId || !variationLetter) return

    const variantClauseId = `${parentClauseId.replace(/-[a-z]$/, "")}-${variationLetter}`

    try {
      const response = await fetch("/api/admin/review-queue/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_queue_id: selectedItem.id,
          clause_id: variantClauseId,
          parent_clause_id: parentClauseId,
          variation_letter: variationLetter,
          category,
          risk_level: riskLevel,
          plain_english_summary: plainEnglishSummary,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          action: "add_variant",
        }),
      })

      const data = await response.json()
      if (data.success) {
        setActionDialogOpen(false)
        fetchQueueItems()
        resetForm()
      } else {
        alert(data.error || "Failed to accept variant")
      }
    } catch (error) {
      console.error("Failed to accept variant:", error)
      alert("Failed to accept variant")
    }
  }

  const handleReject = async () => {
    if (!selectedItem) return

    const reason = prompt("Reason for rejection:")
    if (!reason) return

    try {
      const response = await fetch("/api/admin/review-queue/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_queue_id: selectedItem.id,
          reason,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setActionDialogOpen(false)
        fetchQueueItems()
      } else {
        alert(data.error || "Failed to reject")
      }
    } catch (error) {
      console.error("Failed to reject:", error)
      alert("Failed to reject")
    }
  }

  const resetForm = () => {
    setNewClauseId("")
    setParentClauseId("")
    setVariationLetter("b")
    setCategory("")
    setRiskLevel("medium")
    setPlainEnglishSummary("")
    setTags("")
    setSelectedItem(null)
  }

  const openActionDialog = (item: ReviewQueueItem, type: "new" | "variant" | "reject") => {
    setSelectedItem(item)
    setActionType(type)

    // Pre-fill suggested data
    if (item.metadata.clause_type) {
      setCategory(item.metadata.clause_type)
    }

    // Auto-suggest clause ID
    if (type === "new") {
      // Generate next available ID (simplified - should query DB)
      setNewClauseId("LC-XXX-a")
    } else if (type === "variant" && item.metadata.matched_clause_id) {
      setParentClauseId(item.metadata.matched_clause_id)
    }

    setActionDialogOpen(true)
  }

  const getPriorityBadge = (priority: string) => {
    const colors = {
      critical: "bg-red-500",
      high: "bg-orange-500",
      medium: "bg-yellow-500",
      low: "bg-blue-500",
    }
    return <Badge className={colors[priority as keyof typeof colors] || "bg-gray-500"}>{priority}</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Clock className="animate-spin h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Admin Review Queue</h1>
        <p className="text-muted-foreground mt-2">
          Review and approve new clauses for the Legal Clause Library
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-2xl font-bold">{queueItems.filter((i) => i.status === "pending").length}</div>
          <div className="text-sm text-muted-foreground">Pending Review</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-red-500">
            {queueItems.filter((i) => i.priority === "critical").length}
          </div>
          <div className="text-sm text-muted-foreground">Critical Priority</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {queueItems.filter((i) => i.review_type === "new_clause" || i.review_type === "low_confidence").length}
          </div>
          <div className="text-sm text-muted-foreground">New Clause Candidates</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {queueItems.filter((i) => {
              if (i.status === "pending" || !i.resolved_at) return false
              const resolvedDate = new Date(i.resolved_at).toDateString()
              const today = new Date().toDateString()
              return resolvedDate === today
            }).length}
          </div>
          <div className="text-sm text-muted-foreground">Resolved Today</div>
        </Card>
      </div>

      {/* Queue Items */}
      <div className="space-y-4">
        {queueItems
          .filter((item) => item.status === "pending")
          .filter((item) => {
            // Show all clauses during transition period
            // Note: Extraction system has been improved to create micro-clauses
            // Existing mega-clauses will be visible until re-extraction
            const textLength = item.original_text?.length || 0
            return textLength > 0 // Allow any length (removed <1000 filter)
          })
          .sort((a, b) => {
            const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
            return priorityOrder[a.priority as keyof typeof priorityOrder] -
              priorityOrder[b.priority as keyof typeof priorityOrder]
          })
          .map((item) => (
            <Card key={item.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getPriorityBadge(item.priority)}
                  <Badge variant="outline">{item.review_type.replace("_", " ")}</Badge>
                  {item.metadata.similarity_score !== undefined && (
                    <Badge variant="secondary">
                      Similarity: {(item.metadata.similarity_score * 100).toFixed(1)}%
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {new Date(item.flagged_at).toLocaleDateString()}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm font-semibold text-muted-foreground mb-2">
                  {item.issue_description}
                </div>
                {item.metadata.clause_type && (
                  <div className="text-sm mb-2">
                    <span className="font-medium">Type:</span> {item.metadata.clause_type}
                  </div>
                )}
                <div className="bg-muted p-4 rounded-lg">
                  <div className="text-sm font-mono">{item.original_text}</div>
                </div>
              </div>

              {item.metadata.matched_clause_id && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm">
                    <span className="font-medium">Closest Match:</span> {item.metadata.matched_clause_id}
                    {item.metadata.similarity_score !== undefined && (
                      <> ({(item.metadata.similarity_score * 100).toFixed(1)}% similar)</>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={() => openActionDialog(item, "new")} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add as New Clause
                </Button>
                {item.metadata.matched_clause_id && (
                  <Button
                    onClick={() => openActionDialog(item, "variant")}
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
            </Card>
          ))}

        {queueItems.filter((i) => i.status === "pending").length === 0 && (
          <Card className="p-12 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2">All Clear!</h3>
            <p className="text-muted-foreground">No items pending review</p>
          </Card>
        )}
      </div>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {actionType === "new" && "Add as New Clause"}
              {actionType === "variant" && "Add as Clause Variant"}
              {actionType === "reject" && "Reject Clause"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "new" && "Create a new entry in the Legal Clause Library"}
              {actionType === "variant" && "Add as a variation of an existing clause (e.g., 1.b, 1.c)"}
              {actionType === "reject" && "Reject this clause submission"}
            </DialogDescription>
          </DialogHeader>

          {actionType === "reject" ? (
            <div className="space-y-4">
              <p>Are you sure you want to reject this clause?</p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleReject}>
                  Confirm Reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {actionType === "new" ? (
                <div className="space-y-2">
                  <Label htmlFor="clause-id">Clause ID (e.g., LC-042-a)</Label>
                  <Input
                    id="clause-id"
                    value={newClauseId}
                    onChange={(e) => setNewClauseId(e.target.value)}
                    placeholder="LC-042-a"
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: LC-[number]-a (letter 'a' for base clause)
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="parent-clause">Parent Clause ID</Label>
                    <Input
                      id="parent-clause"
                      value={parentClauseId}
                      onChange={(e) => setParentClauseId(e.target.value)}
                      placeholder="LC-001-a"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="variation-letter">Variation Letter</Label>
                    <Select value={variationLetter} onValueChange={setVariationLetter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="b">b</SelectItem>
                        <SelectItem value="c">c</SelectItem>
                        <SelectItem value="d">d</SelectItem>
                        <SelectItem value="e">e</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Will create: {parentClauseId.replace(/-[a-z]$/, "")}-{variationLetter}
                    </p>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="termination, payment, confidentiality..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="risk-level">Risk Level</Label>
                <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as any)}>
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

              <div className="space-y-2">
                <Label htmlFor="summary">Plain English Summary</Label>
                <Textarea
                  id="summary"
                  value={plainEnglishSummary}
                  onChange={(e) => setPlainEnglishSummary(e.target.value)}
                  placeholder="Brief summary of what this clause means..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="termination, breach, notice"
                />
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm font-semibold mb-2">Clause Text</div>
                <div className="text-sm">{selectedItem?.original_text}</div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={actionType === "new" ? handleAcceptAsNew : handleAcceptAsVariant}
                >
                  Accept to LCL
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
