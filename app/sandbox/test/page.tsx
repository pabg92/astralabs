"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ArrowLeft,
  Play,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react"

interface TestCase {
  test_id: string
  input_text: string
  expected_match_clause_id: string | null
  expected_similarity_min: number | null
  expected_similarity_max: number | null
  expected_match_category: string | null
  scenario: string
  description: string | null
  is_active: boolean
}

interface TestResult {
  test_id: string
  scenario: string
  passed: boolean
  input_text: string
  expected: {
    match_clause_id: string | null
    similarity_min: number | null
    similarity_max: number | null
    match_category: string | null
  }
  actual: {
    match_clause_id: string | null
    similarity: number | null
    match_category: string | null
  }
  failure_reasons: string[]
}

interface TestRunResult {
  run_id: string | null
  total: number
  passed: number
  failed: number
  pass_rate: string
  results: TestResult[]
}

export default function SandboxTestPage() {
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [scenarioFilter, setScenarioFilter] = useState("all")

  // Test run state
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<TestRunResult | null>(null)
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set())

  const fetchTestCases = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (scenarioFilter !== "all") params.set("scenario", scenarioFilter)

      const response = await fetch(`/api/sandbox/test?${params}`)
      const data = await response.json()
      if (data.success) {
        setTestCases(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch test cases:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTestCases()
  }, [scenarioFilter])

  const runTests = async () => {
    setRunning(true)
    setRunResult(null)

    try {
      const response = await fetch("/api/sandbox/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      const data = await response.json()
      if (data.success) {
        setRunResult(data.data)
        // Auto-expand failed tests
        const failedIds = data.data.results
          .filter((r: TestResult) => !r.passed)
          .map((r: TestResult) => r.test_id)
        setExpandedTests(new Set(failedIds))
      }
    } catch (error) {
      console.error("Test run failed:", error)
    } finally {
      setRunning(false)
    }
  }

  const toggleExpanded = (testId: string) => {
    const newExpanded = new Set(expandedTests)
    if (newExpanded.has(testId)) {
      newExpanded.delete(testId)
    } else {
      newExpanded.add(testId)
    }
    setExpandedTests(newExpanded)
  }

  const getScenarioBadge = (scenario: string) => {
    const colors: Record<string, string> = {
      exact_match: "bg-green-500",
      near_match: "bg-blue-500",
      variant: "bg-purple-500",
      novel_clause: "bg-orange-500",
    }
    return <Badge className={colors[scenario] || "bg-gray-500"}>{scenario.replace("_", " ")}</Badge>
  }

  const uniqueScenarios = Array.from(new Set(testCases.map((tc) => tc.scenario))).sort()

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Test Runner</h1>
            <p className="text-muted-foreground mt-1">
              Run automated tests to verify LCL matching accuracy
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={scenarioFilter} onValueChange={setScenarioFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter scenario" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scenarios</SelectItem>
                {uniqueScenarios.map((scenario) => (
                  <SelectItem key={scenario} value={scenario}>
                    {scenario.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runTests} disabled={running}>
              {running ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run All Tests
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Test Run Results Summary */}
      {runResult && (
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Test Run Results</h2>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-3xl font-bold">{runResult.total}</div>
              <div className="text-sm text-muted-foreground">Total Tests</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-3xl font-bold text-green-600">{runResult.passed}</div>
              <div className="text-sm text-muted-foreground">Passed</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-3xl font-bold text-red-600">{runResult.failed}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-600">{runResult.pass_rate}</div>
              <div className="text-sm text-muted-foreground">Pass Rate</div>
            </div>
          </div>

          {runResult.failed > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-red-800">
                  {runResult.failed} test{runResult.failed > 1 ? "s" : ""} failed
                </div>
                <div className="text-sm text-red-700">
                  Review the failed tests below to identify matching issues
                </div>
              </div>
            </div>
          )}

          {runResult.failed === 0 && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div className="font-medium text-green-800">All tests passed!</div>
            </div>
          )}
        </Card>
      )}

      {/* Test Results Detail */}
      {runResult && (
        <Card className="mb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead className="w-[100px]">Test ID</TableHead>
                <TableHead className="w-[120px]">Scenario</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[100px]">Expected</TableHead>
                <TableHead className="w-[100px]">Actual</TableHead>
                <TableHead className="w-[80px]">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runResult.results.map((result) => (
                <Collapsible key={result.test_id} asChild>
                  <>
                    <TableRow
                      className={!result.passed ? "bg-red-50" : ""}
                      data-state={expandedTests.has(result.test_id) ? "open" : "closed"}
                    >
                      <TableCell>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleExpanded(result.test_id)}
                          >
                            {expandedTests.has(result.test_id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{result.test_id}</TableCell>
                      <TableCell>{getScenarioBadge(result.scenario)}</TableCell>
                      <TableCell className="text-sm">
                        {testCases.find((tc) => tc.test_id === result.test_id)?.description ||
                          "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {result.expected.match_clause_id || "(none)"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {result.actual.match_clause_id || "(none)"}
                        {result.actual.similarity !== null && (
                          <div className="text-muted-foreground">
                            {(result.actual.similarity * 100).toFixed(1)}%
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {result.passed ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                      </TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                      <TableRow className={!result.passed ? "bg-red-50" : "bg-muted/50"}>
                        <TableCell colSpan={7} className="p-4">
                          <div className="space-y-3">
                            <div>
                              <div className="text-sm font-medium mb-1">Input Text</div>
                              <div className="text-sm bg-white p-3 rounded border">
                                {result.input_text}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-sm font-medium mb-1">Expected</div>
                                <div className="text-xs bg-white p-3 rounded border space-y-1">
                                  <div>
                                    Match: {result.expected.match_clause_id || "(novel)"}
                                  </div>
                                  {result.expected.similarity_min !== null && (
                                    <div>
                                      Similarity min: {result.expected.similarity_min}
                                    </div>
                                  )}
                                  {result.expected.similarity_max !== null && (
                                    <div>
                                      Similarity max: {result.expected.similarity_max}
                                    </div>
                                  )}
                                  {result.expected.match_category && (
                                    <div>Category: {result.expected.match_category}</div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm font-medium mb-1">Actual</div>
                                <div className="text-xs bg-white p-3 rounded border space-y-1">
                                  <div>
                                    Match: {result.actual.match_clause_id || "(no match)"}
                                  </div>
                                  <div>
                                    Similarity:{" "}
                                    {result.actual.similarity !== null
                                      ? (result.actual.similarity * 100).toFixed(2) + "%"
                                      : "N/A"}
                                  </div>
                                  <div>Category: {result.actual.match_category || "N/A"}</div>
                                </div>
                              </div>
                            </div>

                            {result.failure_reasons.length > 0 && (
                              <div>
                                <div className="text-sm font-medium text-red-700 mb-1">
                                  Failure Reasons
                                </div>
                                <ul className="text-sm text-red-600 list-disc list-inside bg-red-100 p-3 rounded">
                                  {result.failure_reasons.map((reason, idx) => (
                                    <li key={idx}>{reason}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Test Cases List */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          Test Cases ({testCases.length})
        </h2>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading test cases...</div>
        ) : testCases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No test cases found. Run the seed script to add test cases.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Test ID</TableHead>
                <TableHead className="w-[120px]">Scenario</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[120px]">Expected Match</TableHead>
                <TableHead className="w-[80px]">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {testCases.map((tc) => (
                <TableRow key={tc.test_id}>
                  <TableCell className="font-mono text-sm">{tc.test_id}</TableCell>
                  <TableCell>{getScenarioBadge(tc.scenario)}</TableCell>
                  <TableCell className="text-sm">{tc.description || tc.input_text.slice(0, 60) + "..."}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {tc.expected_match_clause_id || "(novel)"}
                  </TableCell>
                  <TableCell>
                    {tc.is_active ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
