"use client"

import { useMemo } from "react"
import { computeWordDiff, formatDiffStats, type DiffStats } from "@/lib/diff-utils"
import { FileText } from "lucide-react"

interface RedlineDiffViewerProps {
  originalText: string
  proposedText: string
  showStats?: boolean
  className?: string
}

/**
 * Renders an inline diff view between original and proposed text.
 * - Deleted text: red strikethrough with light red background
 * - Added text: green underlined with light green background
 * - Unchanged text: default color
 */
export function RedlineDiffViewer({
  originalText,
  proposedText,
  showStats = true,
  className = "",
}: RedlineDiffViewerProps) {
  const diffResult = useMemo(
    () => computeWordDiff(originalText, proposedText),
    [originalText, proposedText]
  )

  const { changes, stats } = diffResult

  return (
    <div className={className}>
      {/* Diff Content */}
      <div className="text-sm leading-relaxed whitespace-pre-wrap">
        {changes.map((change, index) => {
          if (change.removed) {
            return (
              <span
                key={index}
                className="text-red-600 line-through bg-red-100 rounded px-0.5"
              >
                {change.value}
              </span>
            )
          }
          if (change.added) {
            return (
              <span
                key={index}
                className="text-emerald-600 underline bg-emerald-100 rounded px-0.5"
              >
                {change.value}
              </span>
            )
          }
          return <span key={index}>{change.value}</span>
        })}
      </div>

      {/* Stats Footer */}
      {showStats && (stats.deletions > 0 || stats.additions > 0) && (
        <div className="mt-4 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-4 text-xs text-slate-600">
            {/* Legend */}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-100 border border-red-300" />
                <span>Removed</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
                <span>Added</span>
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-1 ml-auto">
              <FileText className="w-3.5 h-3.5" />
              <span>{formatDiffStats(stats)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Compact stats-only view for summary displays
 */
export function DiffStatsDisplay({ stats }: { stats: DiffStats }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      {stats.deletions > 0 && (
        <span className="text-red-600">-{stats.deletions}</span>
      )}
      {stats.additions > 0 && (
        <span className="text-emerald-600">+{stats.additions}</span>
      )}
      {stats.deletions === 0 && stats.additions === 0 && (
        <span>No changes</span>
      )}
    </div>
  )
}
