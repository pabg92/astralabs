/**
 * Parser for Keep a Changelog format
 * https://keepachangelog.com/en/1.1.0/
 */

import type { ChangelogEntry, CategorySection, ChangelogItem } from './types'

/**
 * Parse a Keep a Changelog formatted markdown string
 */
export function parseChangelog(content: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []

  // Split by version headers (## [version])
  // Match: ## [version] or ## [version] - date
  const versionBlocks = content.split(/(?=^## \[)/m).filter(block => block.trim())

  for (const block of versionBlocks) {
    // Skip header content before first version
    if (!block.startsWith('## [')) continue

    const entry = parseVersionBlock(block)
    if (entry) {
      entries.push(entry)
    }
  }

  return entries
}

/**
 * Parse a single version block
 */
function parseVersionBlock(block: string): ChangelogEntry | null {
  const lines = block.split('\n')
  const headerLine = lines[0]

  // Extract version and optional date
  // Pattern: ## [version] or ## [version] - YYYY-MM-DD
  const headerMatch = headerLine.match(/^## \[([^\]]+)\](?:\s*-\s*(.+))?/)
  if (!headerMatch) return null

  const version = headerMatch[1]
  const date = headerMatch[2]?.trim() || null

  // Parse categories
  const categories = parseCategories(lines.slice(1).join('\n'))

  return { version, date, categories }
}

/**
 * Parse category sections from a version block
 */
function parseCategories(content: string): CategorySection[] {
  const categories: CategorySection[] = []

  // Split by category headers (### Category)
  const categoryBlocks = content.split(/(?=^### )/m).filter(block => block.trim())

  for (const block of categoryBlocks) {
    if (!block.startsWith('### ')) continue

    const lines = block.split('\n')
    const categoryName = lines[0].replace('### ', '').trim()

    const items = parseItems(lines.slice(1))

    if (items.length > 0) {
      categories.push({ name: categoryName, items })
    }
  }

  return categories
}

/**
 * Parse changelog items from a category block
 */
function parseItems(lines: string[]): ChangelogItem[] {
  const items: ChangelogItem[] = []
  let currentItem: ChangelogItem | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Main item: starts with "- " at root level (not indented much)
    if (line.match(/^- /)) {
      // Save previous item
      if (currentItem) {
        items.push(currentItem)
      }

      // Parse new item
      const { title, description } = parseItemLine(trimmed.slice(2))
      currentItem = { title, description, details: [] }
    }
    // Sub-item: indented with "  - " or more spaces
    else if (line.match(/^\s+- /) && currentItem) {
      currentItem.details.push(trimmed.slice(2))
    }
  }

  // Don't forget the last item
  if (currentItem) {
    items.push(currentItem)
  }

  return items
}

/**
 * Parse a single item line to extract bold title and description
 */
function parseItemLine(line: string): { title: string; description: string } {
  // Pattern: **Bold Title** - Description
  // Or: **Bold Title** Description (without dash)
  const boldMatch = line.match(/^\*\*([^*]+)\*\*\s*[-–]?\s*(.*)/)

  if (boldMatch) {
    return {
      title: boldMatch[1].trim(),
      description: boldMatch[2].trim(),
    }
  }

  // No bold title, use first few words as title
  const words = line.split(' ')
  if (words.length > 5) {
    return {
      title: words.slice(0, 4).join(' ') + '...',
      description: line,
    }
  }

  return {
    title: line,
    description: '',
  }
}

/**
 * Format a date string for display
 * Input: "2026-01-10"
 * Output: "January 10, 2026"
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''

  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}
