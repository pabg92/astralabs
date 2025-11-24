"use client"

import { Card } from "@/components/ui/card"
import { MessageSquare } from "lucide-react"
import type { Database } from "@/types/database"

type ClauseComment = Database["public"]["Tables"]["clause_comments"]["Row"] & {
  user_profiles?: {
    email: string | null
    first_name: string | null
    last_name: string | null
  } | null
}

interface CommentThreadProps {
  comments?: ClauseComment[]
}

export function CommentThread({
  comments = [],
}: CommentThreadProps) {

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  const getAuthorName = (comment: ClauseComment) => {
    const profile = comment.user_profiles
    if (!profile) return "Unknown User"
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim()
    return name || profile.email || "Unknown User"
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-sm">
          Comments ({comments.length})
        </h3>
      </div>

      {/* Display existing comments */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <Card className="p-4 bg-muted/30">
            <p className="text-sm text-muted-foreground text-center">
              No comments yet. Add a comment when creating a redline.
            </p>
          </Card>
        ) : (
          comments.map((comment) => (
            <Card key={comment.id} className="p-3">
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-medium">
                  {getAuthorName(comment)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(comment.created_at)}
                </span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {comment.comment_text}
              </p>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
