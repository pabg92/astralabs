"use client"

import { useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ArrowLeft,
  Search,
  Loader2,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
} from "lucide-react"
import type { MatchingResult, RAGStatus, RiskLevel } from "@/lib/sandbox-v2/types"

export default function MatchTesterPage() {
  const [inputText, setInputText] = useState("")
  const [includePAT, setIncludePAT] = useState(false)
  const [patCategory, setPatCategory] = useState("")
  const [patValue, setPatValue] = useState("")
  const [patMandatory, setPatMandatory] = useState(true)
  const [recordResult, setRecordResult] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MatchingResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleMatch = async () => {
    if (!inputText.trim()) {
      setError("Please enter clause text")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const body: Record<string, unknown> = {
        text: inputText.trim(),
        record_result: recordResult,
      }

      if (includePAT && patCategory && patValue) {
        body.pat_context = {
          term_category: patCategory,
          expected_value: patValue,
          is_mandatory: patMandatory,
        }
      }

      const response = await fetch("/api/sandbox-v2/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (data.success) {
        setResult(data.data)
      } else {
        setError(data.error || "Matching failed")
      }
    } catch (err) {
      setError("Failed to perform matching")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getRAGIcon = (status: RAGStatus) => {
    switch (status) {
      case "GREEN":
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case "AMBER":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case "RED":
        return <AlertCircle className="h-5 w-5 text-red-500" />
    }
  }

  const getRAGBadge = (status: RAGStatus) => {
    const colors = {
      GREEN: "bg-green-500",
      AMBER: "bg-yellow-500",
      RED: "bg-red-500",
    }
    return <Badge className={colors[status]}>{status}</Badge>
  }

  const getRiskBadge = (risk: RiskLevel) => {
    const colors = {
      low: "bg-green-500",
      medium: "bg-yellow-500",
      high: "bg-red-500",
    }
    return <Badge className={colors[risk]}>{risk}</Badge>
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
        <div>
          <h1 className="text-2xl font-bold">Match Tester</h1>
          <p className="text-muted-foreground">
            Test clause matching with risk resolution and PAT comparison
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Input Clause</h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clause-text">Clause Text</Label>
                <Textarea
                  id="clause-text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Enter or paste clause text to match..."
                  rows={6}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="record"
                  checked={recordResult}
                  onCheckedChange={(v) => setRecordResult(v as boolean)}
                />
                <Label htmlFor="record" className="text-sm">
                  Record match result (stores in database)
                </Label>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Checkbox
                id="include-pat"
                checked={includePAT}
                onCheckedChange={(v) => setIncludePAT(v as boolean)}
              />
              <Label htmlFor="include-pat" className="font-semibold">
                Include PAT Context
              </Label>
            </div>

            {includePAT && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="pat-category">PAT Term Category</Label>
                  <Input
                    id="pat-category"
                    value={patCategory}
                    onChange={(e) => setPatCategory(e.target.value)}
                    placeholder="Payment Terms, Exclusivity..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pat-value">Expected Value</Label>
                  <Input
                    id="pat-value"
                    value={patValue}
                    onChange={(e) => setPatValue(e.target.value)}
                    placeholder="30 days, 6 months..."
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="pat-mandatory"
                    checked={patMandatory}
                    onCheckedChange={(v) => setPatMandatory(v as boolean)}
                  />
                  <Label htmlFor="pat-mandatory" className="text-sm">
                    Mandatory term
                  </Label>
                </div>
              </div>
            )}
          </Card>

          <Button
            onClick={handleMatch}
            disabled={loading || !inputText.trim()}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Search className="mr-2 h-5 w-5" />
            )}
            Match Clause
          </Button>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="space-y-6">
          {result ? (
            <>
              {/* RAG Status Summary */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4">RAG Status</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span>Library Match</span>
                    <div className="flex items-center gap-2">
                      {getRAGIcon(result.rag_library)}
                      {getRAGBadge(result.rag_library)}
                    </div>
                  </div>

                  {result.rag_pat && (
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <span>PAT Comparison</span>
                      <div className="flex items-center gap-2">
                        {getRAGIcon(result.rag_pat)}
                        {getRAGBadge(result.rag_pat)}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-4 text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-900 text-white rounded-lg">
                    <span className="font-semibold">Final Status</span>
                    <div className="flex items-center gap-2">
                      {getRAGIcon(result.rag_final)}
                      {getRAGBadge(result.rag_final)}
                    </div>
                  </div>

                  {result.pat_override_applied && (
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                      PAT override was applied - PAT comparison changed the final status
                    </div>
                  )}

                  {result.escalation_needed && (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
                      <span className="font-semibold">Escalation Required:</span>{" "}
                      {result.escalation_type?.replace("_", " ")}
                    </div>
                  )}
                </div>
              </Card>

              {/* Resolved Match */}
              {result.resolved_match && (
                <Card className="p-6">
                  <h3 className="font-semibold mb-4">Resolved Match (Highest Risk Wins)</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <code className="bg-muted px-2 py-1 rounded">
                        {result.resolved_match.variant_code}
                      </code>
                      {getRiskBadge(result.resolved_match.risk_level)}
                      <Badge variant="outline">
                        {(result.resolved_match.similarity * 100).toFixed(1)}% similar
                      </Badge>
                    </div>
                    {result.resolved_match.canonical_text && (
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {result.resolved_match.canonical_text}
                      </p>
                    )}
                    {result.resolved_match.plain_english && (
                      <p className="text-sm bg-blue-50 p-2 rounded">
                        {result.resolved_match.plain_english}
                      </p>
                    )}
                  </div>
                </Card>
              )}

              {/* All Matches */}
              {result.all_matches.length > 0 && (
                <Card className="p-6">
                  <h3 className="font-semibold mb-4">
                    All Matches ({result.all_matches.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {result.all_matches.map((match, i) => (
                      <div
                        key={match.lcstx_id}
                        className={`p-3 rounded-lg ${i === 0 ? "bg-blue-50 border border-blue-200" : "bg-muted"}`}
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">#{match.match_rank}</Badge>
                          <code className="text-sm">{match.variant_code}</code>
                          {getRiskBadge(match.risk_level)}
                          <span className="text-sm text-muted-foreground ml-auto">
                            {(match.similarity * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Result IDs */}
              {(result.match_result_id || result.review_entry_id) && (
                <div className="text-sm text-muted-foreground space-y-1">
                  {result.match_result_id && (
                    <p>Match Result ID: {result.match_result_id}</p>
                  )}
                  {result.review_entry_id && (
                    <p>Review Entry ID: {result.review_entry_id}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <Card className="p-12 text-center">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                Enter clause text and click Match to see results
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
