"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RedlineDiffViewer } from "./redline-diff-viewer"
import {
  X,
  Check,
  Loader2,
  GitCompare,
  User,
  Bot,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import type { Database } from "@/types/database"

type ClauseRedline = Database["public"]["Tables"]["clause_redlines"]["Row"]

interface SuggestedRedlinesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clauseType: string
  originalText: string
  redlines: ClauseRedline[]
  onAcceptChanges: (redlineId: string) => Promise<void>
  isAccepting?: boolean
}

/**
 * Modal for viewing and accepting suggested redlines.
 * Matches the mockup design with:
 * - Blue header with clause type
 * - Inline diff visualization
 * - Legend and stats footer
 * - Accept Changes button that resolves redline + approves clause
 */
export function SuggestedRedlinesModal({
  open,
  onOpenChange,
  clauseType,
  originalText,
  redlines,
  onAcceptChanges,
  isAccepting = false,
}: SuggestedRedlinesModalProps) {
  const [selectedRedlineId, setSelectedRedlineId] = useState<string | null>(
    redlines.length === 1 ? redlines[0].id : null
  )
  const [expandedRedlineId, setExpandedRedlineId] = useState<string | null>(
    redlines.length === 1 ? redlines[0].id : null
  )

  // Single redline view - show diff directly
  if (redlines.length === 1) {
    const redline = redlines[0]
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden" showCloseButton={false}>
          {/* Blue Header */}
          <DialogHeader className="bg-blue-600 text-white px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitCompare className="w-5 h-5" />
                <DialogTitle className="text-lg font-semibold text-white">
                  Suggested Redlines
                </DialogTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-blue-500"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-blue-100 text-sm mt-1">{clauseType}</p>
          </DialogHeader>

          {/* Diff Content */}
          <ScrollArea className="max-h-[60vh]">
            <div className="p-6">
              <RedlineDiffViewer
                originalText={originalText}
                proposedText={redline.proposed_text}
                showStats={true}
              />
            </div>
          </ScrollArea>

          {/* Footer */}
          <DialogFooter className="bg-slate-50 px-6 py-4 border-t">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {redline.author_id ? (
                  <>
                    <User className="w-3.5 h-3.5" />
                    <span>Manual suggestion</span>
                  </>
                ) : (
                  <>
                    <Bot className="w-3.5 h-3.5" />
                    <span>AI-generated</span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isAccepting}
                >
                  Close
                </Button>
                <Button
                  onClick={() => onAcceptChanges(redline.id)}
                  disabled={isAccepting}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {isAccepting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Accepting...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Accept Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Multiple redlines view - show list with expandable items
  const selectedRedline = redlines.find((r) => r.id === selectedRedlineId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden" showCloseButton={false}>
        {/* Blue Header */}
        <DialogHeader className="bg-blue-600 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCompare className="w-5 h-5" />
              <DialogTitle className="text-lg font-semibold text-white">
                Suggested Redlines
              </DialogTitle>
              <Badge
                variant="secondary"
                className="bg-blue-500 text-white border-0"
              >
                {redlines.length}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-blue-500"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-blue-100 text-sm mt-1">{clauseType}</p>
        </DialogHeader>

        {/* Redlines List */}
        <ScrollArea className="max-h-[60vh]">
          <div className="p-4 space-y-3">
            {redlines.map((redline) => {
              const isExpanded = expandedRedlineId === redline.id
              const isSelected = selectedRedlineId === redline.id

              return (
                <div
                  key={redline.id}
                  className={`border rounded-lg overflow-hidden transition-colors ${
                    isSelected
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {/* Redline Header */}
                  <button
                    className="w-full px-4 py-3 flex items-center justify-between text-left"
                    onClick={() => {
                      setExpandedRedlineId(isExpanded ? null : redline.id)
                      setSelectedRedlineId(redline.id)
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={
                          redline.change_type === "add"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : redline.change_type === "delete"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }
                      >
                        {redline.change_type}
                      </Badge>
                      <span className="text-sm text-slate-600">
                        {redline.author_id ? "Manual" : "AI-generated"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(redline.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {/* Expanded Diff View */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100">
                      <div className="pt-4">
                        <RedlineDiffViewer
                          originalText={originalText}
                          proposedText={redline.proposed_text}
                          showStats={true}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <DialogFooter className="bg-slate-50 px-6 py-4 border-t">
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-slate-500">
              {selectedRedline
                ? "Click 'Accept Changes' to apply the selected redline"
                : "Select a redline to view and accept"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isAccepting}
              >
                Close
              </Button>
              <Button
                onClick={() =>
                  selectedRedlineId && onAcceptChanges(selectedRedlineId)
                }
                disabled={isAccepting || !selectedRedlineId}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isAccepting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Accept Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
