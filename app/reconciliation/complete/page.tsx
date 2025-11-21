"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  Download,
  ArrowLeft,
  FileCheck,
  XCircle,
  Clock,
  Lightbulb,
  TrendingUp,
  FileText,
  Send,
} from "lucide-react"

type ClauseStatus = "match" | "review" | "issue" | "info" | "improve"

interface Clause {
  id: number
  text: string
  status: ClauseStatus
  summary: string
  confidence: number
  clauseType: string
}

interface PreAgreedTerm {
  id: string
  clauseType: string
  expectedTerm: string
  notes: string
}

export default function ResolutionPage() {
  const router = useRouter()
  const [clauseStatuses, setClauseStatuses] = useState<Record<number, ClauseStatus>>({})
  const [preAgreedTerms, setPreAgreedTerms] = useState<PreAgreedTerm[]>([])
  const [contractFileName, setContractFileName] = useState<string>("")

  // Mock clauses data (in real app, this would come from context/props)
  const mockClauses: Clause[] = [
    {
      id: 1,
      text: "Scope of Work clause...",
      status: "review",
      summary: "Standard scope",
      confidence: 96,
      clauseType: "Scope of Work",
    },
    {
      id: 2,
      text: "Payment Terms clause...",
      status: "review",
      summary: "Payment schedule",
      confidence: 93,
      clauseType: "Payment Terms",
    },
    {
      id: 3,
      text: "Deliverables clause...",
      status: "review",
      summary: "Acceptance terms",
      confidence: 81,
      clauseType: "Deliverables",
    },
    {
      id: 4,
      text: "IP Rights clause...",
      status: "review",
      summary: "Work for hire",
      confidence: 95,
      clauseType: "Intellectual Property",
    },
    {
      id: 5,
      text: "Confidentiality clause...",
      status: "review",
      summary: "5-year obligation",
      confidence: 97,
      clauseType: "Confidentiality",
    },
    {
      id: 6,
      text: "Warranties clause...",
      status: "review",
      summary: "90-day warranty",
      confidence: 79,
      clauseType: "Warranties",
    },
    {
      id: 7,
      text: "Liability clause...",
      status: "issue",
      summary: "50% cap",
      confidence: 68,
      clauseType: "Liability Cap",
    },
    {
      id: 8,
      text: "Indemnification clause...",
      status: "issue",
      summary: "Mutual indemnity",
      confidence: 95,
      clauseType: "Indemnification",
    },
    {
      id: 9,
      text: "Termination clause...",
      status: "issue",
      summary: "30-day notice",
      confidence: 92,
      clauseType: "Termination",
    },
    {
      id: 10,
      text: "Dispute Resolution clause...",
      status: "improve",
      summary: "Arbitration",
      confidence: 83,
      clauseType: "Dispute Resolution",
    },
    {
      id: 11,
      text: "General Provisions clause...",
      status: "info",
      summary: "Boilerplate",
      confidence: 99,
      clauseType: "General Provisions",
    },
  ]

  useEffect(() => {
    // Load data from localStorage
    const savedStatuses = localStorage.getItem("clauseStatuses")
    const savedTerms = localStorage.getItem("preAgreedTerms")
    const savedFileName = localStorage.getItem("contractFileName")

    if (savedStatuses) {
      setClauseStatuses(JSON.parse(savedStatuses))
    }
    if (savedTerms) {
      setPreAgreedTerms(JSON.parse(savedTerms))
    }
    if (savedFileName) {
      setContractFileName(savedFileName)
    }

    const dealId = new URLSearchParams(window.location.search).get("dealId") || "1"
    if (savedStatuses) {
      localStorage.setItem(`reconciliation_${dealId}_statuses`, savedStatuses)
    }
  }, [])

  const getClauseStatus = (clause: Clause): ClauseStatus => {
    return clauseStatuses[clause.id] ?? clause.status
  }

  // Calculate statistics
  const acceptedClauses = mockClauses.filter((c) => getClauseStatus(c) === "match")
  const rejectedClauses = mockClauses.filter((c) => getClauseStatus(c) === "issue")
  const pendingClauses = mockClauses.filter((c) => {
    const status = getClauseStatus(c)
    return status === "review" || status === "improve" || status === "info"
  })

  const totalClauses = mockClauses.length
  const acceptedCount = acceptedClauses.length
  const rejectedCount = rejectedClauses.length
  const pendingCount = pendingClauses.length
  const completionRate = Math.round((acceptedCount / totalClauses) * 100)

  // Determine overall status
  const getOverallStatus = () => {
    if (acceptedCount === totalClauses) return "success"
    if (rejectedCount === totalClauses) return "rejected"
    if (pendingCount === 0) return "mixed"
    return "incomplete"
  }

  const overallStatus = getOverallStatus()

  // Calculate pre-agreed terms reconciliation
  const reconciledTerms = preAgreedTerms.filter((term) => {
    const matchingClause = mockClauses.find((c) => c.clauseType.toLowerCase() === term.clauseType.toLowerCase())
    return matchingClause && getClauseStatus(matchingClause) === "match"
  })

  const getStatusIcon = (status: ClauseStatus) => {
    switch (status) {
      case "match":
        return <CheckCircle2 className="w-4 h-4" />
      case "review":
        return <AlertTriangle className="w-4 h-4" />
      case "issue":
        return <AlertCircle className="w-4 h-4" />
      case "info":
        return <Info className="w-4 h-4" />
      case "improve":
        return <Lightbulb className="w-4 h-4" />
    }
  }

  const handleFinalize = () => {
    // In real app, this would trigger export/finalization logic
    alert("Contract reconciliation finalized! Export functionality would be triggered here.")
  }

  const handleGoBack = () => {
    router.push("/reconciliation")
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Contract Reconciliation Complete</h1>
              <p className="text-sm text-slate-500">Review your decisions and finalize the reconciliation process</p>
            </div>
            <Button variant="outline" onClick={handleGoBack} className="rounded-lg bg-transparent">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Review
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Overall Status Card */}
        <Card
          className={`p-8 shadow-lg rounded-2xl border-2 mb-8 ${
            overallStatus === "success"
              ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
              : overallStatus === "rejected"
                ? "border-red-200 bg-gradient-to-br from-red-50 to-white"
                : overallStatus === "mixed"
                  ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
                  : "border-blue-200 bg-gradient-to-br from-blue-50 to-white"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                {overallStatus === "success" ? (
                  <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-white" />
                  </div>
                ) : overallStatus === "rejected" ? (
                  <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-white" />
                  </div>
                ) : overallStatus === "mixed" ? (
                  <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-white" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-white" />
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-1">
                    {overallStatus === "success"
                      ? "All Clauses Approved"
                      : overallStatus === "rejected"
                        ? "All Clauses Rejected"
                        : overallStatus === "mixed"
                          ? "Mixed Decisions"
                          : "Review Incomplete"}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {overallStatus === "success"
                      ? "Contract is ready for finalization"
                      : overallStatus === "rejected"
                        ? "Contract requires renegotiation"
                        : overallStatus === "mixed"
                          ? "Some clauses approved, others need attention"
                          : "Some clauses still pending review"}
                  </p>
                </div>
              </div>

              {contractFileName && (
                <div className="mb-4">
                  <Badge variant="outline" className="text-xs">
                    <FileText className="w-3 h-3 mr-1" />
                    {contractFileName}
                  </Badge>
                </div>
              )}

              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-600">Total Clauses</span>
                    <FileCheck className="w-4 h-4 text-slate-400" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{totalClauses}</p>
                </div>

                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-emerald-700">Accepted</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-bold text-emerald-700">{acceptedCount}</p>
                </div>

                <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-red-700">Rejected</span>
                    <XCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <p className="text-2xl font-bold text-red-700">{rejectedCount}</p>
                </div>

                <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-amber-700">Pending</span>
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <p className="text-2xl font-bold text-amber-700">{pendingCount}</p>
                </div>
              </div>
            </div>

            {/* Circular Progress */}
            <div className="flex flex-col items-center">
              <div className="relative w-32 h-32">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-slate-200"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 56}`}
                    strokeDashoffset={`${2 * Math.PI * 56 * (1 - completionRate / 100)}`}
                    className={
                      completionRate === 100
                        ? "text-emerald-500"
                        : completionRate >= 50
                          ? "text-amber-500"
                          : "text-red-500"
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-900">{completionRate}%</p>
                    <p className="text-xs text-slate-500">Complete</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Accepted Clauses */}
          <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Accepted Clauses</h3>
                <p className="text-xs text-slate-500">
                  {acceptedCount} of {totalClauses}
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {acceptedClauses.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No clauses accepted yet</p>
              ) : (
                acceptedClauses.map((clause) => (
                  <div key={clause.id} className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <div className="flex items-start gap-2 mb-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-emerald-900">{clause.clauseType}</p>
                        <p className="text-xs text-emerald-700 line-clamp-2 mt-1">{clause.summary}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Rejected Clauses */}
          <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Rejected Clauses</h3>
                <p className="text-xs text-slate-500">
                  {rejectedCount} of {totalClauses}
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {rejectedClauses.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No clauses rejected</p>
              ) : (
                rejectedClauses.map((clause) => (
                  <div key={clause.id} className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex items-start gap-2 mb-1">
                      <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-red-900">{clause.clauseType}</p>
                        <p className="text-xs text-red-700 line-clamp-2 mt-1">{clause.summary}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Pending Clauses */}
          <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Pending Review</h3>
                <p className="text-xs text-slate-500">
                  {pendingCount} of {totalClauses}
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {pendingClauses.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">All clauses reviewed</p>
              ) : (
                pendingClauses.map((clause) => {
                  const status = getClauseStatus(clause)
                  return (
                    <div
                      key={clause.id}
                      className={`p-3 rounded-lg border ${
                        status === "review"
                          ? "bg-amber-50 border-amber-200"
                          : status === "improve"
                            ? "bg-purple-50 border-purple-200"
                            : "bg-blue-50 border-blue-200"
                      }`}
                    >
                      <div className="flex items-start gap-2 mb-1">
                        {getStatusIcon(status)}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-xs font-medium ${
                              status === "review"
                                ? "text-amber-900"
                                : status === "improve"
                                  ? "text-purple-900"
                                  : "text-blue-900"
                            }`}
                          >
                            {clause.clauseType}
                          </p>
                          <p
                            className={`text-xs line-clamp-2 mt-1 ${
                              status === "review"
                                ? "text-amber-700"
                                : status === "improve"
                                  ? "text-purple-700"
                                  : "text-blue-700"
                            }`}
                          >
                            {clause.summary}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Card>
        </div>

        {/* Pre-Agreed Terms Reconciliation */}
        {preAgreedTerms.length > 0 && (
          <Card className="p-6 shadow-sm rounded-2xl border-slate-200 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Pre-Agreed Terms Reconciliation</h3>
                <p className="text-sm text-slate-500">
                  {reconciledTerms.length} of {preAgreedTerms.length} terms successfully reconciled
                </p>
              </div>
            </div>

            <div className="mb-4">
              <Progress value={(reconciledTerms.length / preAgreedTerms.length) * 100} className="h-3" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {preAgreedTerms.map((term) => {
                const matchingClause = mockClauses.find(
                  (c) => c.clauseType.toLowerCase() === term.clauseType.toLowerCase(),
                )
                const isReconciled = matchingClause && getClauseStatus(matchingClause) === "match"

                return (
                  <div
                    key={term.id}
                    className={`p-4 rounded-xl border-2 ${
                      isReconciled ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          isReconciled
                            ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {term.clauseType}
                      </Badge>
                      {isReconciled ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-medium text-emerald-600">Reconciled</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span className="text-xs font-medium text-amber-600">Pending</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">{term.expectedTerm}</p>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Action Buttons */}
        <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Ready to Finalize?</h3>
              <p className="text-sm text-slate-500">
                {pendingCount > 0
                  ? `You have ${pendingCount} clause${pendingCount > 1 ? "s" : ""} pending review. You can finalize now or go back to review.`
                  : "All clauses have been reviewed. You can now finalize the reconciliation."}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleGoBack} className="rounded-lg bg-transparent">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Revise Decisions
              </Button>

              <Button variant="outline" className="rounded-lg bg-transparent">
                <Download className="w-4 h-4 mr-2" />
                Download Report
              </Button>

              <Button
                onClick={handleFinalize}
                className="bg-emerald-500 hover:bg-emerald-600 rounded-lg px-6"
                disabled={pendingCount === totalClauses}
              >
                <Send className="w-4 h-4 mr-2" />
                Finalize & Export
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
