"use client"

import { useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft,
  Search,
  AlertTriangle,
  Clock,
  Zap,
} from "lucide-react"

interface SimilarClause {
  clause_id: string
  clause_type: string
  category: string | null
  standard_text: string
  similarity: number
  match_category: string
  classification: string
}

interface MatchResult {
  input_text: string
  matches: SimilarClause[]
  top_match: SimilarClause | null
  escalation_needed: boolean
  escalation_type: string | null
  tokens_used: number
  timing: {
    embedding_ms: number
    search_ms: number
    total_ms: number
  }
  result_id: string | null
  review_queue_id: string | null
}

export default function SandboxMatchingPage() {
  const [inputText, setInputText] = useState("")
  const [threshold, setThreshold] = useState([0.6])
  const [recordResult, setRecordResult] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleMatch = async () => {
    if (!inputText.trim()) {
      setError("Please enter clause text to match")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch("/api/sandbox/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          threshold: threshold[0],
          max_results: 5,
          record_result: recordResult,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setResult(data.data)
      } else {
        setError(data.error || "Match failed")
      }
    } catch (err) {
      setError("Failed to connect to API")
    } finally {
      setLoading(false)
    }
  }

  const getClassificationBadge = (classification: string) => {
    const colors: Record<string, string> = {
      GREEN: "bg-green-500",
      AMBER: "bg-yellow-500",
      RED: "bg-red-500",
    }
    return <Badge className={colors[classification] || "bg-gray-500"}>{classification}</Badge>
  }

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      auto_merge: "bg-green-600",
      review_required: "bg-orange-500",
      similar: "bg-blue-500",
      partial: "bg-yellow-500",
      unique: "bg-red-500",
    }
    return (
      <Badge variant="outline" className={`border-2 ${colors[category] ? "" : ""}`}>
        {category.replace("_", " ")}
      </Badge>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <Link
          href="/sandbox"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sandbox
        </Link>
        <h1 className="text-3xl font-bold">Match Tester</h1>
        <p className="text-muted-foreground mt-1">
          Test clause similarity matching against the sandbox LCL
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Input Clause</h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clause-text">Clause Text</Label>
              <Textarea
                id="clause-text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Enter a clause to find similar matches..."
                rows={8}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Similarity Threshold</Label>
                <span className="text-sm font-mono">{threshold[0].toFixed(2)}</span>
              </div>
              <Slider
                value={threshold}
                onValueChange={setThreshold}
                min={0}
                max={1}
                step={0.05}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Broad (0.0)</span>
                <span>Strict (1.0)</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="record-result"
                checked={recordResult}
                onCheckedChange={(checked) => setRecordResult(checked === true)}
              />
              <Label htmlFor="record-result" className="text-sm">
                Record result to database
              </Label>
            </div>

            <Button onClick={handleMatch} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Clock className="mr-2 h-4 w-4 animate-spin" />
                  Matching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Find Matches
                </>
              )}
            </Button>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>
        </Card>

        {/* Results Panel */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Results</h2>

          {!result ? (
            <div className="text-center py-12 text-muted-foreground">
              Enter clause text and click "Find Matches" to see results
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{result.matches.length}</div>
                  <div className="text-xs text-muted-foreground">Matches Found</div>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{result.tokens_used}</div>
                  <div className="text-xs text-muted-foreground">Tokens Used</div>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-2xl font-bold flex items-center justify-center gap-1">
                    <Zap className="h-4 w-4" />
                    {result.timing.total_ms}ms
                  </div>
                  <div className="text-xs text-muted-foreground">Total Time</div>
                </div>
              </div>

              {/* Escalation Alert */}
              {result.escalation_needed && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-orange-800">Escalation Required</div>
                    <div className="text-sm text-orange-700">
                      {result.escalation_type === "new_clause"
                        ? "No strong match found - this appears to be a novel clause"
                        : "High similarity but not exact - potential variant for review"}
                    </div>
                    {result.review_queue_id && (
                      <div className="text-xs text-orange-600 mt-1">
                        Added to review queue: {result.review_queue_id.slice(0, 8)}...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Top Match */}
              {result.top_match && (
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Top Match</h3>
                    <div className="flex items-center gap-2">
                      {getClassificationBadge(result.top_match.classification)}
                      {getCategoryBadge(result.top_match.match_category)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                    <div>
                      <span className="text-muted-foreground">ID:</span>{" "}
                      <span className="font-mono">{result.top_match.clause_id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Similarity:</span>{" "}
                      <span className="font-bold">
                        {(result.top_match.similarity * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Type:</span>{" "}
                      {result.top_match.clause_type}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Category:</span>{" "}
                      {result.top_match.category || "-"}
                    </div>
                  </div>
                  <div className="text-sm bg-muted p-3 rounded">
                    {result.top_match.standard_text}
                  </div>
                </div>
              )}

              {/* All Matches Table */}
              {result.matches.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">All Matches</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Clause ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Similarity</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.matches.map((match, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-sm">
                            {match.clause_id}
                          </TableCell>
                          <TableCell>{match.clause_type}</TableCell>
                          <TableCell>
                            <span className="font-bold">
                              {(match.similarity * 100).toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            {getClassificationBadge(match.classification)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {result.matches.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No matches found above threshold ({threshold[0].toFixed(2)})
                </div>
              )}

              {/* Timing Details */}
              <div className="text-xs text-muted-foreground">
                Timing: Embedding {result.timing.embedding_ms}ms | Search{" "}
                {result.timing.search_ms}ms
                {result.result_id && ` | Result ID: ${result.result_id.slice(0, 8)}...`}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Quick Test Examples */}
      <Card className="p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Quick Test Examples</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              label: "Payment Terms (Exact)",
              text: "Payment shall be made within thirty (30) days of receipt of a valid invoice by the Brand.",
            },
            {
              label: "Payment Terms (Similar)",
              text: "Payment will be made within 30 days of invoice receipt.",
            },
            {
              label: "Exclusivity (Paraphrased)",
              text: "Talent agrees not to endorse or promote any competing brands during the contract period.",
            },
            {
              label: "Novel Clause",
              text: "Talent shall be entitled to a 10% royalty on all merchandise sales featuring their likeness.",
            },
            {
              label: "FTC Disclosure",
              text: "Talent must include #ad disclosure in all sponsored posts as required by FTC regulations.",
            },
            {
              label: "Termination",
              text: "Either party can end this Agreement by giving 30 days prior written notice.",
            },
          ].map((example, idx) => (
            <Button
              key={idx}
              variant="outline"
              className="h-auto p-3 justify-start text-left"
              onClick={() => setInputText(example.text)}
            >
              <div>
                <div className="font-medium text-sm">{example.label}</div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {example.text}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </Card>
    </div>
  )
}
