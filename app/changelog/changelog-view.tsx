"use client"

import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { ArrowLeft, Calendar, Tag, FileCode, Sparkles } from 'lucide-react'
import type { ChangelogEntry, CategorySection, ChangelogItem } from '@/lib/changelog/types'
import { CATEGORY_COLORS } from '@/lib/changelog/types'
import { formatDate } from '@/lib/changelog/parser'

interface ChangelogViewProps {
  entries: ChangelogEntry[]
}

export function ChangelogView({ entries }: ChangelogViewProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to App
          </Link>
          <Link
            href="/sign-in"
            className="text-sm font-medium text-slate-900 hover:text-slate-700 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Page Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-8 w-8 text-amber-500" />
            <h1 className="text-4xl font-bold text-slate-900">Changelog</h1>
          </div>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            All notable changes to ContractBuddy. We follow{' '}
            <a
              href="https://keepachangelog.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Keep a Changelog
            </a>{' '}
            and{' '}
            <a
              href="https://semver.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Semantic Versioning
            </a>
            .
          </p>
        </div>

        {/* Version Entries */}
        <div className="space-y-8">
          {entries.map((entry, index) => (
            <VersionCard key={entry.version} entry={entry} isFirst={index === 0} />
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t text-center text-sm text-slate-500">
          <p>
            ContractBuddy - AI-powered contract reconciliation for influencer marketing agencies
          </p>
        </footer>
      </main>
    </div>
  )
}

function VersionCard({ entry, isFirst }: { entry: ChangelogEntry; isFirst: boolean }) {
  const isUnreleased = entry.version === 'Unreleased'

  return (
    <Card className={`overflow-hidden ${isFirst ? 'border-2 border-blue-200 shadow-lg' : ''}`}>
      <CardHeader className="bg-slate-50 border-b">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Badge
              variant={isUnreleased ? 'default' : 'secondary'}
              className={`text-sm px-3 py-1 ${
                isUnreleased
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              {isUnreleased ? 'Unreleased' : `v${entry.version}`}
            </Badge>
            {isFirst && isUnreleased && (
              <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                Latest Changes
              </Badge>
            )}
          </div>
          {entry.date && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <Calendar className="h-4 w-4" />
              {formatDate(entry.date)}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-6">
          {entry.categories.map((category) => (
            <CategoryBlock key={category.name} category={category} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function CategoryBlock({ category }: { category: CategorySection }) {
  const colors = CATEGORY_COLORS[category.name] || CATEGORY_COLORS.Infrastructure

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Tag className="h-4 w-4 text-slate-400" />
        <Badge
          variant="outline"
          className={`${colors.bg} ${colors.text} ${colors.border} border font-medium`}
        >
          {category.name}
        </Badge>
        <span className="text-xs text-slate-400">
          {category.items.length} {category.items.length === 1 ? 'change' : 'changes'}
        </span>
      </div>
      <ul className="space-y-3 ml-6">
        {category.items.map((item, index) => (
          <ChangelogItemRow key={index} item={item} />
        ))}
      </ul>
    </div>
  )
}

function ChangelogItemRow({ item }: { item: ChangelogItem }) {
  return (
    <li className="relative">
      <div className="absolute -left-4 top-2 w-1.5 h-1.5 rounded-full bg-slate-300" />
      <div>
        <span className="font-semibold text-slate-900">{item.title}</span>
        {item.description && (
          <span className="text-slate-600"> - {item.description}</span>
        )}
      </div>
      {item.details.length > 0 && (
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
          {item.details.map((detail, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-slate-400 mt-0.5">•</span>
              <span>
                {formatDetail(detail)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * Format detail text, highlighting file paths in monospace
 */
function formatDetail(detail: string): React.ReactNode {
  // Match patterns like: File: `path/to/file.ts` or just `path/to/file`
  const parts = detail.split(/(`[^`]+`)/g)

  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      const code = part.slice(1, -1)
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-mono"
        >
          {code}
        </code>
      )
    }
    return part
  })
}
