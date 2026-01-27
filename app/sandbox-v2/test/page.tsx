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
  ArrowLeft,
  Loader2,
  Play,
  TestTube,
  CheckCircle,
  XCircle,
} from "lucide-react"
import type { TestCase, TestSuiteResult, TestRunResult, TestScenario } from "@/lib/sandbox-v2/types"

export default function TestRunnerPage() {
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [filterScenario, setFilterScenario] = useState<string>("all")
  const [results, setResults] = useState<TestSuiteResult | null>(null)

  useEffect(() => {
    fetchTestCases()
  }, [filterScenario])

  const fetchTestCases = async () => {
    setLoading(true)
    try {
      let url = "/api/sandbox-v2/test?"
      if (filterScenario !== "all") {
        url += `scenario=${filterScenario}&`
      }

      const response = await fetch(url)
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

  const runTests = async (testIds?: string[]) => {
    setRunning(true)
    setResults(null)
    try {
      const response = await fetch("/api/sandbox-v2/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          test_ids: testIds,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setResults(data.data)
      } else {
        alert(data.error || "Test run failed")
      }
    } catch (error) {
      console.error("Failed to run tests:", error)
      alert("Failed to run tests")
    } finally {
      setRunning(false)
    }
  }

  const getScenarioBadge = (scenario: TestScenario) => {
    const colors: Record<TestScenario, string> = {
      exact_pattern: "bg-blue-500",
      risk_resolution: "bg-purple-500",
      pat_override: "bg-orange-500",
      novel_escalation: "bg-yellow-500",
      multi_match: "bg-cyan-500",
    }
    return (
      <Badge className={colors[scenario]}>
        {scenario.replace("_", " ")}
      </Badge>
    )
  }

  const getResultForTest = (testId: string): TestRunResult | undefined => {
    return results?.results.find((r) => r.test_id === testId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/sandbox-v2">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Test Runner</h1>
          <p className="text-muted-foreground">
            Run automated tests for the matching pipeline
          </p>
        </div>
        <Button onClick={() => runTests()} disabled={running || testCases.length === 0}>
          {running ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Run All Tests
        </Button>
      </div>

      {/* Results Summary */}
      {results && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-2xl font-bold">{results.total}</div>
            <div className="text-sm text-muted-foreground">Total Tests</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-500">{results.passed}</div>
            <div className="text-sm text-muted-foreground">Passed</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-red-500">{results.failed}</div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">
              {(results.duration_ms / 1000).toFixed(1)}s
            </div>
            <div className="text-sm text-muted-foreground">Duration</div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="w-48">
          <Select value={filterScenario} onValueChange={setFilterScenario}>
            <SelectTrigger>
              <SelectValue placeholder="Filter scenario" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scenarios</SelectItem>
              <SelectItem value="exact_pattern">Exact Pattern</SelectItem>
              <SelectItem value="risk_resolution">Risk Resolution</SelectItem>
              <SelectItem value="pat_override">PAT Override</SelectItem>
              <SelectItem value="novel_escalation">Novel Escalation</SelectItem>
              <SelectItem value="multi_match">Multi Match</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Test Cases Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Test ID</TableHead>
              <TableHead className="w-32">Scenario</TableHead>
              <TableHead>Input (excerpt)</TableHead>
              <TableHead className="w-24">Expected</TableHead>
              <TableHead className="w-24">Result</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {testCases.map((testCase) => {
              const result = getResultForTest(testCase.test_id)

              return (
                <TableRow key={testCase.id}>
                  <TableCell>
                    <code className="text-sm">{testCase.test_id}</code>
                  </TableCell>
                  <TableCell>{getScenarioBadge(testCase.scenario)}</TableCell>
                  <TableCell>
                    <p className="text-sm truncate max-w-xs">
                      {testCase.input_text}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {testCase.expected_lcstx_variant_code && (
                        <code className="text-xs block">
                          {testCase.expected_lcstx_variant_code}
                        </code>
                      )}
                      {testCase.expected_rag_final && (
                        <Badge
                          variant="outline"
                          className={
                            testCase.expected_rag_final === "GREEN"
                              ? "text-green-600"
                              : testCase.expected_rag_final === "AMBER"
                                ? "text-yellow-600"
                                : "text-red-600"
                          }
                        >
                          {testCase.expected_rag_final}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {result ? (
                      result.passed ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span className="text-sm">Pass</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-red-600">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm">Fail</span>
                        </div>
                      )
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runTests([testCase.test_id])}
                      disabled={running}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {testCases.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <TestTube className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No test cases found</p>
                  <p className="text-sm text-muted-foreground">
                    Run the seed script to create test cases
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Failed Test Details */}
      {results && results.failed > 0 && (
        <Card className="p-6 mt-6">
          <h3 className="font-semibold mb-4 text-red-600">Failed Tests</h3>
          <div className="space-y-4">
            {results.results
              .filter((r) => !r.passed)
              .map((result) => (
                <div
                  key={result.test_id}
                  className="p-4 bg-red-50 border border-red-200 rounded-lg"
                >
                  <div className="font-medium mb-2">{result.test_id}</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="font-medium text-muted-foreground">Expected</div>
                      <div>Variant: {result.expected.variant_code || "-"}</div>
                      <div>Risk: {result.expected.risk_level || "-"}</div>
                      <div>RAG Library: {result.expected.rag_library || "-"}</div>
                      <div>RAG Final: {result.expected.rag_final || "-"}</div>
                    </div>
                    <div>
                      <div className="font-medium text-muted-foreground">Actual</div>
                      <div>Variant: {result.actual.variant_code || "-"}</div>
                      <div>Risk: {result.actual.risk_level || "-"}</div>
                      <div>RAG Library: {result.actual.rag_library}</div>
                      <div>RAG Final: {result.actual.rag_final}</div>
                    </div>
                  </div>
                  {result.error && (
                    <div className="mt-2 text-red-600 text-sm">
                      Error: {result.error}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  )
}
