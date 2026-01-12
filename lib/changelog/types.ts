/**
 * TypeScript types for changelog data structures
 * Based on Keep a Changelog format (https://keepachangelog.com)
 */

export interface ChangelogItem {
  /** Bold title extracted from **title** pattern */
  title: string
  /** Description after the title */
  description: string
  /** Sub-bullet details (indented items) */
  details: string[]
}

export interface CategorySection {
  /** Category name: Added, Changed, Fixed, Removed, Security, Infrastructure */
  name: string
  /** Items in this category */
  items: ChangelogItem[]
}

export interface ChangelogEntry {
  /** Version string: "Unreleased" or semver like "0.1.0" */
  version: string
  /** Release date in YYYY-MM-DD format, null for Unreleased */
  date: string | null
  /** Category sections with their items */
  categories: CategorySection[]
}

/** Color mapping for category badges */
export const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Added: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  Changed: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  Fixed: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
  Removed: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  Security: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  Infrastructure: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
}
