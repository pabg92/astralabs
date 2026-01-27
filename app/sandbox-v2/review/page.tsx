"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Loader2,
  ClipboardCheck,
  CheckCircle,
  XCircle,
  GitMerge,
} from "lucide-react"
import type { PatternReviewEntry, ReviewStatus, ReviewType } from "@/lib/sandbox-v2/types"

export default function ReviewQueuePage() {
  const [reviews, setReviews] = useState<(PatternReviewEntry & { lcstx: unknown })[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("pending")
  const [filterType, setFilterType] = useState<string>("all")
  const [selectedReview, setSelectedReview] = useState<PatternReviewEntry | null>(null)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [actionType, setActionType] = useState<ReviewStatus>("approved")
  const [resolutionNotes, setResolutionNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchReviews()
  }, [filterStatus, filterType])

  const fetchReviews = async () => {
    setLoading(true)
    try {
      let url = "/api/sandbox-v2/review?"
      if (filterStatus !== "all") {
        url += `status=${filterStatus}&`
      }
      if (filterType !== "all") {
        url += `review_type=${filterType}&`
      }

      const response = await fetch(url)
      const data = await response.json()
      if (data.success) {
        setReviews(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch reviews:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async () => {
    if (!selectedReview) return

    setSubmitting(true)
    try {
      const response = await fetch("/api/sandbox-v2/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedReview.id,
          status: actionType,
          resolution_notes: resolutionNotes || null,
          resolved_by: "admin", // In production, use actual user
        }),
      })

      const data = await response.json()
      if (data.success) {
        setActionDialogOpen(false)
        setSelectedReview(null)
        setResolutionNotes("")
        fetchReviews()
      } else {
        alert(data.error || "Failed to update review")
      }
    } catch (error) {
      console.error("Failed to update review:", error)
      alert("Failed to update review")
    } finally {
      setSubmitting(false)
    }
  }

  const openActionDialog = (review: PatternReviewEntry, action: ReviewStatus) => {
    setSelectedReview(review)
    setActionType(action)
    setActionDialogOpen(true)
  }

  const getReviewTypeBadge = (type: ReviewType) => {
    const labels: Record<ReviewType, { label: string; color: string }> = {
      new_pattern: { label: "New Pattern", color: "bg-blue-500" },
      variant_candidate: { label: "Variant Candidate", color: "bg-purple-500" },
      low_confidence: { label: "Low Confidence", color: "bg-yellow-500" },
      pat_conflict: { label: "PAT Conflict", color: "bg-red-500" },
    }
    const { label, color } = labels[type] || { label: type, color: "bg-gray-500" }
    return <Badge className={color}>{label}</Badge>
  }

  const getStatusBadge = (status: ReviewStatus) => {
    const variants: Record<ReviewStatus, "default" | "secondary" | "outline" | "destructive"> = {
      pending: "secondary",
      approved: "default",
      rejected: "destructive",
      merged: "outline",
    }
    return <Badge variant={variants[status]}>{status}</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/sandbox-v2">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Review Queue</h1>
          <p className="text-muted-foreground">
            HITL - Approve or reject escalated patterns
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="w-40">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="merged">Merged</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="new_pattern">New Pattern</SelectItem>
              <SelectItem value="variant_candidate">Variant Candidate</SelectItem>
              <SelectItem value="low_confidence">Low Confidence</SelectItem>
              <SelectItem value="pat_conflict">PAT Conflict</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Review Items */}
      <div className="space-y-4">
        {reviews.map((review) => (
          <Card key={review.id} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {getReviewTypeBadge(review.review_type)}
                {getStatusBadge(review.status)}
                {review.similarity_score !== null && (
                  <Badge variant="outline">
                    {(review.similarity_score * 100).toFixed(1)}% similar
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {new Date(review.created_at).toLocaleDateString()}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Input Text
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-mono whitespace-pre-wrap">
                  {review.input_text}
                </p>
              </div>
            </div>

            {review.similar_patterns && review.similar_patterns.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <div className="text-sm font-medium mb-2">Similar Patterns</div>
                <div className="space-y-1">
                  {review.similar_patterns.map((sp, i) => (
                    <div key={i} className="text-sm">
                      <code className="bg-blue-100 px-1 rounded">
                        {sp.variant_code}
                      </code>{" "}
                      - {(sp.similarity * 100).toFixed(1)}%
                    </div>
                  ))}
                </div>
              </div>
            )}

            {review.resolution_notes && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium mb-1">Resolution Notes</div>
                <p className="text-sm text-muted-foreground">
                  {review.resolution_notes}
                </p>
              </div>
            )}

            {review.status === "pending" && (
              <div className="flex gap-3">
                <Button
                  onClick={() => openActionDialog(review, "approved")}
                  size="sm"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  onClick={() => openActionDialog(review, "merged")}
                  variant="outline"
                  size="sm"
                >
                  <GitMerge className="mr-2 h-4 w-4" />
                  Merge as Variant
                </Button>
                <Button
                  onClick={() => openActionDialog(review, "rejected")}
                  variant="destructive"
                  size="sm"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </div>
            )}
          </Card>
        ))}

        {reviews.length === 0 && (
          <Card className="p-12 text-center">
            <ClipboardCheck className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2">All Clear!</h3>
            <p className="text-muted-foreground">
              No items matching the current filters
            </p>
          </Card>
        )}
      </div>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approved" && "Approve Pattern"}
              {actionType === "rejected" && "Reject Pattern"}
              {actionType === "merged" && "Merge as Variant"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approved" &&
                "This will mark the pattern as approved for inclusion in the library."}
              {actionType === "rejected" &&
                "This will reject the pattern. It will not be added to the library."}
              {actionType === "merged" &&
                "This will merge the pattern as a variant of an existing clause."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Resolution Notes</label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Optional notes about this decision..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAction}
                disabled={submitting}
                variant={actionType === "rejected" ? "destructive" : "default"}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm {actionType}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
