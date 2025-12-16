/**
 * Diff Utilities for Redline Visualization
 * Uses jsdiff library to compute word-level differences between texts
 */

import { diffWords, type Change } from 'diff'

export interface DiffStats {
  additions: number
  deletions: number
  unchanged: number
}

export interface DiffResult {
  changes: Change[]
  stats: DiffStats
}

/**
 * Compute word-level diff between original and proposed text
 */
export function computeWordDiff(original: string, proposed: string): DiffResult {
  const changes = diffWords(original, proposed)

  const stats: DiffStats = {
    additions: 0,
    deletions: 0,
    unchanged: 0,
  }

  for (const change of changes) {
    // Count words in each change
    const wordCount = change.value.trim().split(/\s+/).filter(w => w.length > 0).length

    if (change.added) {
      stats.additions += wordCount
    } else if (change.removed) {
      stats.deletions += wordCount
    } else {
      stats.unchanged += wordCount
    }
  }

  return { changes, stats }
}

/**
 * Format diff stats as a readable string
 * e.g., "3 deletions, 6 additions"
 */
export function formatDiffStats(stats: DiffStats): string {
  const parts: string[] = []

  if (stats.deletions > 0) {
    parts.push(`${stats.deletions} deletion${stats.deletions !== 1 ? 's' : ''}`)
  }
  if (stats.additions > 0) {
    parts.push(`${stats.additions} addition${stats.additions !== 1 ? 's' : ''}`)
  }

  return parts.length > 0 ? parts.join(', ') : 'No changes'
}

/**
 * Check if there are any actual changes between texts
 */
export function hasChanges(original: string, proposed: string): boolean {
  const { stats } = computeWordDiff(original, proposed)
  return stats.additions > 0 || stats.deletions > 0
}

/**
 * Format diff for text export (e.g., returning to sender)
 * Uses inline markers: [-deleted text-] [+added text+]
 */
export function formatDiffForExport(original: string, proposed: string): string {
  const { changes, stats } = computeWordDiff(original, proposed)

  let output = ''
  for (const change of changes) {
    if (change.removed) {
      // Wrap deleted text with strikethrough markers
      output += `[-${change.value.trim()}-] `
    } else if (change.added) {
      // Wrap added text with addition markers
      output += `[+${change.value.trim()}+] `
    } else {
      // Keep unchanged text as-is
      output += change.value
    }
  }

  // Clean up any double spaces from marker insertion
  output = output.replace(/\s+/g, ' ').trim()

  return `${output}\n\n(${formatDiffStats(stats)})`
}
