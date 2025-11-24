"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, Save } from "lucide-react"
import type { Database } from "@/types/database"

type RedlineChangeType = Database["public"]["Enums"]["redline_change_type"]
type RedlineStatus = Database["public"]["Enums"]["redline_status"]
type ClauseRedline = Database["public"]["Tables"]["clause_redlines"]["Row"]
type ClauseComment = Database["public"]["Tables"]["clause_comments"]["Row"]

interface RedlineEditorProps {
  clauseBoundaryId: string
  dealId: string
  tenantId: string
  existingRedline?: ClauseRedline | null
  onSave?: (redline: ClauseRedline | null, comment?: ClauseComment | null) => void
  onError?: (error: string) => void
}

export function RedlineEditor({
  clauseBoundaryId,
  dealId,
  tenantId,
  existingRedline,
  onSave,
  onError,
}: RedlineEditorProps) {
  const [proposedText, setProposedText] = useState(existingRedline?.proposed_text || "")
  const [changeType, setChangeType] = useState<RedlineChangeType>(existingRedline?.change_type || "modify")
  const [status, setStatus] = useState<RedlineStatus>(existingRedline?.status || "draft")
  const [commentText, setCommentText] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Keep the editor in sync when switching between clauses
  useEffect(() => {
    setProposedText(existingRedline?.proposed_text || "")
    setChangeType(existingRedline?.change_type || "modify")
    setStatus(existingRedline?.status || "draft")
    setCommentText("")
    setError(null)
    setSuccessMessage(null)
  }, [existingRedline?.id])

  const handleSave = async () => {
    // Reset messages
    setError(null)
    setSuccessMessage(null)

    // Validate
    if (!proposedText.trim()) {
      const errorMsg = "Proposed text is required"
      setError(errorMsg)
      onError?.(errorMsg)
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(
        `/api/reconciliation/${dealId}/redlines`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clause_boundary_id: clauseBoundaryId,
            change_type: changeType,
            proposed_text: proposedText,
            status: status,
            comment_text: commentText.trim() || undefined,
            // Note: author_id will be derived server-side from session in future
            author_id: null,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to save redline")
      }

      if (data.success && (data.data.redline || data.data.comment)) {
        setSuccessMessage("Redline saved successfully")
        setCommentText("") // Clear comment after save
        onSave?.(data.data.redline || null, data.data.comment || null)
      } else {
        throw new Error("Unexpected response format")
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to save redline"
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="change-type">Change Type</Label>
        <Select
          value={changeType}
          onValueChange={(value) => setChangeType(value as RedlineChangeType)}
          disabled={isSaving}
        >
          <SelectTrigger id="change-type">
            <SelectValue placeholder="Select change type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="add">Add</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
            <SelectItem value="modify">Modify</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="proposed-text">Proposed Text</Label>
        <Textarea
          id="proposed-text"
          value={proposedText}
          onChange={(e) => setProposedText(e.target.value)}
          placeholder="Enter the proposed text for this clause..."
          className="min-h-[120px]"
          disabled={isSaving}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as RedlineStatus)}
          disabled={isSaving}
        >
          <SelectTrigger id="status">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="comment-text">
          Comment (Optional)
        </Label>
        <Textarea
          id="comment-text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Add a note or explanation for this redline..."
          className="min-h-[80px]"
          disabled={isSaving}
        />
        <p className="text-xs text-muted-foreground">
          Add a comment to explain the reason for this change
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-emerald-500 text-emerald-700">
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleSave}
        disabled={isSaving || !proposedText.trim()}
        className="w-full"
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Save Redline
          </>
        )}
      </Button>
    </div>
  )
}
