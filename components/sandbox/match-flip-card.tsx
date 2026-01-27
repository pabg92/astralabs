"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Info,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
} from "lucide-react"
import type { MatchEntry, MatchExplanation, RiskLevel } from "@/lib/sandbox-v2/types"

// ============================================================================
// HELPERS
// ============================================================================

const getRiskBadge = (risk: RiskLevel) => {
  const styles: Record<RiskLevel, string> = {
    low: "bg-green-500 hover:bg-green-600",
    medium: "bg-yellow-500 hover:bg-yellow-600",
    high: "bg-orange-500 hover:bg-orange-600",
  }
  const icons: Record<RiskLevel, React.ReactNode> = {
    low: <ShieldCheck className="h-3 w-3 mr-1" />,
    medium: <Shield className="h-3 w-3 mr-1" />,
    high: <ShieldAlert className="h-3 w-3 mr-1" />,
  }
  return (
    <Badge className={`${styles[risk]} flex items-center`}>
      {icons[risk]}
      {risk}
    </Badge>
  )
}

// ============================================================================
// TYPES
// ============================================================================

interface MatchFlipCardProps {
  match: MatchEntry
  inputText: string
  explanationCache: Map<string, MatchExplanation>
  onExplanationLoaded: (variantCode: string, explanation: MatchExplanation) => void
}

// ============================================================================
// EXPLANATION CONTENT
// ============================================================================

function ExplanationContent({
  explanation,
  loading,
  error,
  onRetry,
}: {
  explanation: MatchExplanation | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <RefreshCw className="h-6 w-6 animate-spin mb-2" />
        <p className="text-sm">Analyzing match...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <AlertCircle className="h-6 w-6 text-red-500 mb-2" />
        <p className="text-sm text-red-600 mb-2">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    )
  }

  if (!explanation) {
    return null
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Threshold Context */}
      <div className="px-2 py-1.5 bg-muted rounded text-xs font-medium text-center">
        {explanation.thresholdContext}
      </div>

      {/* Summary */}
      <div>
        <p className="text-muted-foreground leading-relaxed">{explanation.summary}</p>
      </div>

      {/* Key Overlap */}
      {explanation.keyOverlap.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Shared Concepts:</p>
          <div className="flex flex-wrap gap-1">
            {explanation.keyOverlap.map((term, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {term}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Key Differences */}
      {explanation.keyDifferences.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Differences:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
            {explanation.keyDifferences.map((diff, i) => (
              <li key={i}>{diff}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Semantic Analysis */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Analysis:</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{explanation.semanticAnalysis}</p>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MatchFlipCard({
  match,
  inputText,
  explanationCache,
  onExplanationLoaded,
}: MatchFlipCardProps) {
  const [showExplanation, setShowExplanation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cachedExplanation = explanationCache.get(match.variant_code)

  const fetchExplanation = async () => {
    if (cachedExplanation) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/sandbox-v2/match/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputText,
          matchedText: match.canonical_text || "",
          similarity: match.similarity,
          variantCode: match.variant_code,
        }),
      })

      const data = await response.json()

      if (data.success) {
        onExplanationLoaded(match.variant_code, data.data)
      } else {
        setError(data.error || "Failed to generate explanation")
      }
    } catch (err) {
      setError("Network error - please try again")
    } finally {
      setLoading(false)
    }
  }

  const handleInfoClick = () => {
    if (!showExplanation) {
      fetchExplanation()
    }
    setShowExplanation(!showExplanation)
  }

  const handleRetry = () => {
    setError(null)
    fetchExplanation()
  }

  // Show explanation view
  if (showExplanation) {
    return (
      <div className="p-4 border rounded-lg bg-background">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Why {(match.similarity * 100).toFixed(1)}% Match?</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={handleInfoClick}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>

        <div className="max-h-[280px] overflow-y-auto">
          <ExplanationContent
            explanation={cachedExplanation || null}
            loading={loading}
            error={error}
            onRetry={handleRetry}
          />
        </div>
      </div>
    )
  }

  // Show match view (default)
  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Resolved Match</h3>
          <span className="text-xs text-muted-foreground">(highest risk wins)</span>
        </div>
        <div className="flex items-center gap-2">
          {getRiskBadge(match.risk_level)}
          <span className="font-mono font-bold">
            {(match.similarity * 100).toFixed(1)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleInfoClick}
            title="Why this match?"
          >
            <Info className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div>
          <span className="text-muted-foreground">Variant:</span>{" "}
          <span className="font-mono">{match.variant_code}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Concept:</span>{" "}
          <span className="font-mono">{match.lcl_concept_code || "-"}</span>
        </div>
      </div>

      {match.canonical_text && (
        <div className="text-sm bg-muted p-3 rounded max-h-32 overflow-y-auto">
          {match.canonical_text}
        </div>
      )}

      {match.plain_english && (
        <div className="mt-2 text-sm text-muted-foreground italic">
          {match.plain_english}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// OTHER MATCH EXPLANATION POPOVER
// ============================================================================

interface OtherMatchExplanationProps {
  match: MatchEntry
  inputText: string
  explanationCache: Map<string, MatchExplanation>
  onExplanationLoaded: (variantCode: string, explanation: MatchExplanation) => void
}

export function OtherMatchExplanationPopover({
  match,
  inputText,
  explanationCache,
  onExplanationLoaded,
}: OtherMatchExplanationProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const cachedExplanation = explanationCache.get(match.variant_code)

  const fetchExplanation = async () => {
    if (cachedExplanation) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/sandbox-v2/match/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputText,
          matchedText: match.canonical_text || "",
          similarity: match.similarity,
          variantCode: match.variant_code,
        }),
      })

      const data = await response.json()

      if (data.success) {
        onExplanationLoaded(match.variant_code, data.data)
      } else {
        setError(data.error || "Failed to generate explanation")
      }
    } catch (err) {
      setError("Network error - please try again")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen && !cachedExplanation) {
      fetchExplanation()
    }
  }

  const handleRetry = () => {
    setError(null)
    fetchExplanation()
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          title="Why this match?"
        >
          <Info className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">
              Why {(match.similarity * 100).toFixed(1)}%?
            </h4>
            <Badge variant="outline" className="text-xs">
              {match.variant_code}
            </Badge>
          </div>
          <ExplanationContent
            explanation={cachedExplanation || null}
            loading={loading}
            error={error}
            onRetry={handleRetry}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
