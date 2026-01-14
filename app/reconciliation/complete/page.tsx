"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import confetti from "canvas-confetti"
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
  Loader2,
  Sparkles,
  ExternalLink,
  Copy,
  Link,
  Share2,
  Wrench,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type ClauseStatus = "match" | "review" | "issue" | "info" | "improve"

interface Clause {
  id: string
  text: string
  status: ClauseStatus
  summary: string
  confidence: number
  clauseType: string
  reviewDecision?: "approved" | "rejected" | null
  ragParsing?: string | null
  ragRisk?: string | null
  gptSummary?: string | null
  revisedByUser?: boolean
  isAutoApproved?: boolean // GREEN clauses without explicit review
}

interface PreAgreedTerm {
  id: string
  termCategory: string
  termDescription: string
  relatedClauseTypes: string[]
}

interface MatchingClause {
  term: PreAgreedTerm
  clause: Clause | null
  isReconciled: boolean
}

// Fun loading messages for gamification
const funLoadingMessages = [
  "Summoning the legal gremlins...",
  "Teaching AI to read lawyer...",
  "Counting semicolons in the fine print...",
  "Asking the contract nicely to cooperate...",
  "Translating legalese to human...",
  "Checking for hidden unicorn clauses...",
  "Making sure no one signed in invisible ink...",
  "Waking up the clause fairies...",
  "Convincing the paperwork to behave...",
  "Giving the fine print a magnifying glass...",
  "Brewing a fresh pot of legal tea...",
  "Politely asking the contract to reveal its secrets...",
]

function ResolutionPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dealId = searchParams.get("dealId")
  const { toast } = useToast()

  const [clauses, setClauses] = useState<Clause[]>([])
  const [preAgreedTerms, setPreAgreedTerms] = useState<PreAgreedTerm[]>([])
  const [contractFileName, setContractFileName] = useState<string>("")
  const [dealName, setDealName] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [isGeneratingShareLink, setIsGeneratingShareLink] = useState(false)
  const [showParsingWarning, setShowParsingWarning] = useState(false)

  // Fun loading message rotation
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingMessageIndex(prev => (prev + 1) % funLoadingMessages.length)
      }, 2500)
      return () => clearInterval(interval)
    }
  }, [isLoading])

  // Green confetti bursts during loading
  useEffect(() => {
    if (isLoading) {
      // Initial burst
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#16a34a', '#15803d', '#86efac', '#4ade80'],
      })

      // Periodic bursts
      const confettiInterval = setInterval(() => {
        confetti({
          particleCount: 30,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#22c55e', '#16a34a', '#15803d', '#86efac', '#4ade80'],
          gravity: 0.8,
          scalar: 0.8,
        })
      }, 4000)

      return () => clearInterval(confettiInterval)
    }
  }, [isLoading])

  useEffect(() => {
    async function fetchReconciliationData() {
      if (!dealId) {
        setError("No deal ID provided")
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch(`/api/reconciliation/${dealId}`)
        if (!response.ok) {
          throw new Error("Failed to fetch reconciliation data")
        }

        const result = await response.json()
        if (!result.success || !result.data) {
          throw new Error("Invalid response format")
        }

        const data = result.data

        // Set deal info
        setDealName(data.deal_name || data.talent_name || "Contract")
        setContractFileName(data.document?.original_filename || "Contract Document")

        // Map pre-agreed terms using correct database field names
        if (data.pre_agreed_terms) {
          setPreAgreedTerms(data.pre_agreed_terms.map((term: {
            id: string
            term_category: string
            term_description: string
            related_clause_types: string[] | null
          }) => ({
            id: term.id,
            termCategory: term.term_category || "General",
            termDescription: term.term_description || "",
            relatedClauseTypes: term.related_clause_types || [],
          })))
        }

        // Map clause boundaries with their reviews
        if (data.document?.clause_boundaries) {
          const mappedClauses: Clause[] = data.document.clause_boundaries.map((boundary: {
            id: string
            content: string
            clause_type: string
            match_result?: {
              similarity_score?: number
              rag_status?: string
              gpt_summary?: string
              rag_parsing?: string
              rag_risk?: string
            } | null
            review?: { decision?: string; risk_accepted?: boolean } | null
          }) => {
            // GREEN clauses are auto-approved: check all RAG status fields
            const ragStatus = boundary.match_result?.rag_status
            const ragParsing = boundary.match_result?.rag_parsing
            const ragRisk = boundary.match_result?.rag_risk
            const isGreen = ragStatus === "green" || ragParsing === "green" || ragRisk === "green"

            // Determine status from RAG status
            let status: ClauseStatus = "review"
            if (isGreen) status = "match"
            else if (ragStatus === "amber") status = "review"
            else if (ragStatus === "red") status = "issue"
            else if (ragStatus === "blue") status = "info"

            const reviewDecision = boundary.review?.decision as "approved" | "rejected" | null
            const hasUserRevision = boundary.review?.risk_accepted || reviewDecision === "rejected"

            return {
              id: boundary.id,
              text: boundary.content || "",
              status,
              summary: boundary.match_result?.gpt_summary || boundary.clause_type || "No summary",
              confidence: Math.round((boundary.match_result?.similarity_score || 0) * 100),
              clauseType: boundary.clause_type || "General",
              reviewDecision,
              ragParsing: ragParsing || null,
              ragRisk: ragRisk || null,
              gptSummary: boundary.match_result?.gpt_summary || null,
              revisedByUser: hasUserRevision,
              isAutoApproved: isGreen && !reviewDecision, // Track auto-approved GREEN clauses
            }
          })

          setClauses(mappedClauses)
        }

        setIsLoading(false)
      } catch (err) {
        console.error("Error fetching reconciliation data:", err)
        setError(err instanceof Error ? err.message : "Failed to load data")
        setIsLoading(false)
      }
    }

    fetchReconciliationData()
  }, [dealId])

  // Calculate statistics based on review decisions
  // GREEN clauses are auto-approved and count toward completion
  const acceptedClauses = clauses.filter((c) =>
    c.reviewDecision === "approved" || c.isAutoApproved
  )
  const rejectedClauses = clauses.filter((c) => c.reviewDecision === "rejected")
  const pendingClauses = clauses.filter((c) =>
    !c.reviewDecision && !c.isAutoApproved
  )

  const totalClauses = clauses.length
  const acceptedCount = acceptedClauses.length
  const rejectedCount = rejectedClauses.length
  const pendingCount = pendingClauses.length
  const reviewedCount = acceptedCount + rejectedCount
  const completionRate = totalClauses > 0 ? Math.round((reviewedCount / totalClauses) * 100) : 0

  // Determine overall status
  const getOverallStatus = () => {
    if (totalClauses === 0) return "incomplete"
    if (acceptedCount === totalClauses) return "success"
    if (rejectedCount === totalClauses) return "rejected"
    if (pendingCount === 0) return "mixed"
    return "incomplete"
  }

  const overallStatus = getOverallStatus()

  // Check for parsing flags (clauses with parsing issues)
  const clausesWithParsingFlags = clauses.filter(
    (c) => c.ragParsing === "amber" || c.ragParsing === "red"
  )
  const hasParsingFlags = clausesWithParsingFlags.length > 0

  // Clauses revised by user (rejected or risk accepted)
  const revisedClauses = clauses.filter((c) => c.revisedByUser)

  // Build pre-agreed terms with matching clause data for side-by-side view
  const termClauseMatches: MatchingClause[] = preAgreedTerms.map((term) => {
    const matchingClause = clauses.find((clause) => {
      const clauseTypeNormalized = clause.clauseType.toLowerCase()
      const matchesRelatedType = term.relatedClauseTypes.some(
        (relatedType) => relatedType.toLowerCase() === clauseTypeNormalized
      )
      return matchesRelatedType
    })

    const isReconciled = matchingClause?.reviewDecision === "approved"

    return {
      term,
      clause: matchingClause || null,
      isReconciled,
    }
  })

  // Calculate pre-agreed terms reconciliation using related_clause_types
  const reconciledTerms = preAgreedTerms.filter((term) => {
    // Find any approved clause that matches one of the term's related clause types
    const hasMatchingApprovedClause = clauses.some((clause) => {
      const clauseTypeNormalized = clause.clauseType.toLowerCase()
      // Check if any related clause type matches this clause's type
      const matchesRelatedType = term.relatedClauseTypes.some(
        (relatedType) => relatedType.toLowerCase() === clauseTypeNormalized
      )
      return matchesRelatedType && clause.reviewDecision === "approved"
    })
    return hasMatchingApprovedClause
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

  const handleDownloadReport = () => {
    setIsDownloading(true)

    const revisedTag = '<span style="background:#dbeafe; color:#1d4ed8; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:8px; font-weight:500;">REVISED BY USER</span>'

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Contract Buddy Report - ${dealName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
            h2 { color: #475569; margin-top: 30px; }
            .header-info { margin: 20px 0; color: #64748b; }
            .stats { display: flex; gap: 20px; margin: 30px 0; flex-wrap: wrap; }
            .stat-box { padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; min-width: 120px; text-align: center; }
            .stat-box strong { display: block; font-size: 24px; margin-bottom: 5px; }
            .clause { padding: 12px; margin: 8px 0; border-radius: 6px; border-left: 4px solid; page-break-inside: avoid; }
            .accepted { background: #dcfce7; border-color: #22c55e; }
            .rejected { background: #fee2e2; border-color: #ef4444; }
            .pending { background: #fef3c7; border-color: #f59e0b; }
            .clause-type { font-weight: bold; margin-bottom: 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; }
            .clause-text { color: #1e293b; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
            .no-clauses { color: #94a3b8; font-style: italic; padding: 20px; text-align: center; }
            .pat-section { margin-top: 40px; }
            .pat-item { padding: 16px; margin: 10px 0; border-radius: 8px; border: 1px solid #e2e8f0; }
            .pat-reconciled { background: #dcfce7; border-color: #22c55e; }
            .pat-pending { background: #fef3c7; border-color: #f59e0b; }
            .pat-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .pat-category { font-weight: bold; font-size: 14px; }
            .pat-status { font-size: 12px; padding: 2px 8px; border-radius: 4px; }
            .status-reconciled { background: #22c55e; color: white; }
            .status-pending { background: #f59e0b; color: white; }
            .pat-description { font-size: 13px; color: #475569; margin-bottom: 8px; }
            .pat-clause { font-size: 12px; color: #64748b; background: #f8fafc; padding: 8px; border-radius: 4px; margin-top: 8px; }
            @media print { body { padding: 20px; } .clause { page-break-inside: avoid; } }
          </style>
        </head>
        <body>
          <h1>Contract Buddy Reconciliation Report</h1>
          <p style="color: #64748b; font-style: italic; margin-top: -5px; margin-bottom: 20px;">Smart Contract Reviews. For People With Better Things To Do.</p>
          <div class="header-info">
            <p><strong>Deal:</strong> ${dealName}</p>
            <p><strong>Document:</strong> ${contractFileName}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p><strong>Completion:</strong> ${completionRate}%</p>
            ${revisedClauses.length > 0 ? `<p><strong>User Revisions:</strong> ${revisedClauses.length} clause(s)</p>` : ''}
          </div>

          <div class="stats">
            <div class="stat-box"><strong>${totalClauses}</strong>Total Clauses</div>
            <div class="stat-box" style="background:#dcfce7"><strong>${acceptedCount}</strong>Accepted</div>
            <div class="stat-box" style="background:#fee2e2"><strong>${rejectedCount}</strong>Rejected</div>
            <div class="stat-box" style="background:#fef3c7"><strong>${pendingCount}</strong>Pending</div>
          </div>

          ${preAgreedTerms.length > 0 ? `
          <div class="pat-section">
            <h2>Pre-Agreed Terms Reconciliation (${reconciledTerms.length}/${preAgreedTerms.length})</h2>
            ${termClauseMatches.map(match => `
              <div class="pat-item ${match.isReconciled ? 'pat-reconciled' : 'pat-pending'}">
                <div class="pat-header">
                  <span class="pat-category">${match.term.termCategory}</span>
                  <span class="pat-status ${match.isReconciled ? 'status-reconciled' : 'status-pending'}">
                    ${match.isReconciled ? 'Reconciled' : 'Pending'}
                  </span>
                </div>
                <div class="pat-description"><strong>Expected:</strong> ${match.term.termDescription}</div>
                ${match.clause ? `
                  <div class="pat-clause">
                    <strong>Contract Clause:</strong> ${match.clause.summary || match.clause.text.substring(0, 200)}...
                  </div>
                ` : '<div class="pat-clause"><em>No matching clause found</em></div>'}
              </div>
            `).join('')}
          </div>
          ` : ''}

          <h2>Accepted Clauses (${acceptedCount})</h2>
          ${acceptedClauses.length === 0
            ? '<p class="no-clauses">No clauses accepted</p>'
            : acceptedClauses.map(c => `<div class="clause accepted"><div class="clause-type">${c.clauseType}${c.revisedByUser ? revisedTag : ''}</div><div class="clause-text">${c.text || c.summary}</div></div>`).join('')}

          <h2>Rejected Clauses (${rejectedCount})</h2>
          ${rejectedClauses.length === 0
            ? '<p class="no-clauses">No clauses rejected</p>'
            : rejectedClauses.map(c => `<div class="clause rejected"><div class="clause-type">${c.clauseType}${revisedTag}</div><div class="clause-text">${c.text || c.summary}</div></div>`).join('')}

          <h2>Pending Review (${pendingCount})</h2>
          ${pendingClauses.length === 0
            ? '<p class="no-clauses">All clauses reviewed</p>'
            : pendingClauses.map(c => `<div class="clause pending"><div class="clause-type">${c.clauseType}</div><div class="clause-text">${c.text || c.summary}</div></div>`).join('')}
        </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
      printWindow.print()
    }

    setIsDownloading(false)
  }

  const handleFinalise = async () => {
    // Check for parsing flags first
    if (hasParsingFlags) {
      setShowParsingWarning(true)
      return
    }

    await doFinalise()
  }

  const doFinalise = async () => {
    setIsDownloading(true)
    setShowParsingWarning(false)

    try {
      // Update deal status to signed/finalised
      await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'signed' })
      })

      // Download the report
      handleDownloadReport()

      // Show success and redirect
      toast({
        title: "Contract finalized",
        description: "The reconciliation has been completed and exported.",
      })
      router.push('/deals')
    } catch (error) {
      console.error('Error finalising:', error)
      toast({
        title: "Failed to finalize",
        description: "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleGenerateShareLink = async () => {
    if (!dealId) return

    setIsGeneratingShareLink(true)

    try {
      const response = await fetch(`/api/reconciliation/${dealId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expires_in_hours: 168, // 7 days
          allowed_actions: ['view', 'comment'],
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate share link')
      }

      const result = await response.json()
      // Use the new friendly URL format: /review/deal-name-abc12345
      const shareUrl = `${window.location.origin}/review/${result.data.slug}`
      setShareLink(shareUrl)

      // Copy to clipboard
      await navigator.clipboard.writeText(shareUrl)
      toast({
        title: "Share link generated",
        description: "Link copied to clipboard. Valid for 7 days.",
      })
    } catch (error) {
      console.error('Error generating share link:', error)
      toast({
        title: "Failed to generate link",
        description: "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingShareLink(false)
    }
  }

  const handleCopyShareLink = async () => {
    if (!shareLink) return

    try {
      await navigator.clipboard.writeText(shareLink)
      toast({
        title: "Link copied",
        description: "Share link copied to clipboard.",
      })
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually.",
        variant: "destructive",
      })
    }
  }

  const handleFixClause = (clauseId: string) => {
    // Navigate to the main reconciliation page with the clause focused
    router.push(`/reconciliation?dealId=${dealId}&focusClause=${clauseId}`)
  }

  const handleGoBack = () => {
    router.push(`/reconciliation?dealId=${dealId}`)
  }

  // Loading state with fun messages and confetti
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 p-8 max-w-md">
          {/* Animated icon */}
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center animate-pulse">
              <FileText className="w-10 h-10 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full animate-bounce flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
          </div>

          {/* Fun rotating message */}
          <div className="text-center">
            <p className="text-lg font-medium text-slate-700 transition-all duration-300">
              {funLoadingMessages[loadingMessageIndex]}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Hang tight, good things are loading...
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full bg-emerald-500 animate-bounce"
                style={{
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>

          {/* Tagline */}
          <p className="text-xs text-slate-400 italic mt-4">
            Smart Contract Reviews. For People With Better Things To Do.
          </p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-900 font-medium mb-2">Failed to load data</p>
          <p className="text-slate-600 mb-4">{error}</p>
          <Button onClick={() => router.push("/deals")} variant="outline">
            Back to Deals
          </Button>
        </div>
      </div>
    )
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
                  const status = clause.status
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

        {/* Pre-Agreed Terms Reconciliation - Side-by-Side Diff */}
        {preAgreedTerms.length > 0 && (
          <TooltipProvider>
            <Card className="p-6 shadow-sm rounded-2xl border-slate-200 mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
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
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    Reconciled
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    Pending
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-slate-300" />
                    No Match
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <Progress value={(reconciledTerms.length / preAgreedTerms.length) * 100} className="h-3" />
              </div>

              {/* Side-by-side header */}
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide px-2">
                  Pre-Agreed Term (Expected)
                </div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide px-2">
                  Contract Clause (Actual)
                </div>
              </div>

              {/* Side-by-side comparison */}
              <div className="space-y-4">
                {termClauseMatches.map((match) => (
                  <div
                    key={match.term.id}
                    className={`grid grid-cols-2 gap-4 p-4 rounded-xl border-2 transition-all ${
                      match.isReconciled
                        ? "bg-emerald-50 border-emerald-200"
                        : match.clause
                          ? "bg-amber-50 border-amber-200"
                          : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    {/* Left side: Pre-Agreed Term */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            match.isReconciled
                              ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {match.term.termCategory}
                        </Badge>
                        <div className="flex items-center gap-1">
                          {match.isReconciled ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span className="text-xs font-medium text-emerald-600">Reconciled</span>
                            </>
                          ) : match.clause ? (
                            <>
                              <AlertTriangle className="w-4 h-4 text-amber-600" />
                              <span className="text-xs font-medium text-amber-600">Pending</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-4 h-4 text-slate-400" />
                              <span className="text-xs font-medium text-slate-500">No Match</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-200 min-h-[80px]">
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {match.term.termDescription}
                        </p>
                      </div>
                      {match.term.relatedClauseTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs text-slate-500">Related:</span>
                          {match.term.relatedClauseTypes.map((type) => (
                            <Badge key={type} variant="secondary" className="text-xs px-1.5 py-0">
                              {type}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right side: Contract Clause */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        {match.clause ? (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            {match.clause.clauseType}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500">
                            Not Found
                          </Badge>
                        )}
                        {match.clause && !match.isReconciled && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs bg-white hover:bg-blue-50"
                                onClick={() => handleFixClause(match.clause!.id)}
                              >
                                <Wrench className="w-3 h-3 mr-1" />
                                Fix
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Jump to clause in reconciliation view</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div
                        className={`rounded-lg p-3 border min-h-[80px] ${
                          match.clause
                            ? match.isReconciled
                              ? "bg-emerald-50 border-emerald-200"
                              : "bg-white border-amber-200"
                            : "bg-slate-100 border-slate-200"
                        }`}
                      >
                        {match.clause ? (
                          <p className="text-sm text-slate-700 leading-relaxed line-clamp-4">
                            {match.clause.summary || match.clause.text}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-400 italic">
                            No matching clause found in the contract.
                          </p>
                        )}
                      </div>
                      {match.clause && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>Confidence: {match.clause.confidence}%</span>
                          {match.clause.revisedByUser && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-blue-100 text-blue-700">
                              Revised
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TooltipProvider>
        )}

        {/* Parsing Flags Warning */}
        {hasParsingFlags && (
          <Card className="p-4 shadow-sm rounded-2xl border-amber-200 bg-amber-50 mb-8">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-amber-900">Parsing Issues Detected</h4>
                <p className="text-sm text-amber-700 mt-1">
                  {clausesWithParsingFlags.length} clause{clausesWithParsingFlags.length > 1 ? "s have" : " has"} parsing flags that may indicate extraction issues. Consider reviewing before finalizing.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {clausesWithParsingFlags.slice(0, 3).map((clause) => (
                    <Button
                      key={clause.id}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs bg-white"
                      onClick={() => handleFixClause(clause.id)}
                    >
                      <Wrench className="w-3 h-3 mr-1" />
                      {clause.clauseType}
                    </Button>
                  ))}
                  {clausesWithParsingFlags.length > 3 && (
                    <span className="text-xs text-amber-600 self-center">
                      +{clausesWithParsingFlags.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Share Link Section */}
        <Card className="p-6 shadow-sm rounded-2xl border-slate-200 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Share2 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Share with Team</h3>
                <p className="text-xs text-slate-500">
                  Generate a guest link for review and comments
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {shareLink ? (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg max-w-xs">
                    <Link className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span className="text-xs text-slate-600 truncate">{shareLink}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyShareLink}
                    className="rounded-lg"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleGenerateShareLink}
                  disabled={isGeneratingShareLink}
                  className="rounded-lg"
                >
                  {isGeneratingShareLink ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Share2 className="w-4 h-4 mr-2" />
                  )}
                  Generate Link
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Ready to Finalise?</h3>
              <p className="text-sm text-slate-500">
                {pendingCount > 0
                  ? `You have ${pendingCount} clause${pendingCount > 1 ? "s" : ""} pending review. You can finalise now or go back to review.`
                  : "All clauses have been reviewed. You can now finalise the reconciliation."}
              </p>
              {hasParsingFlags && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {clausesWithParsingFlags.length} parsing flag{clausesWithParsingFlags.length > 1 ? "s" : ""} detected
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleGoBack} className="rounded-lg bg-transparent">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Revise Decisions
              </Button>

              <Button
                variant="outline"
                onClick={handleDownloadReport}
                disabled={isDownloading}
                className="rounded-lg bg-transparent"
              >
                {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Download Report
              </Button>

              <Button
                onClick={handleFinalise}
                className="bg-emerald-500 hover:bg-emerald-600 rounded-lg px-6"
                disabled={isDownloading || pendingCount === totalClauses}
              >
                {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Finalise & Export
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Parsing Warning Dialog */}
      <AlertDialog open={showParsingWarning} onOpenChange={setShowParsingWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Parsing Issues Detected
            </AlertDialogTitle>
            <AlertDialogDescription>
              <p className="mb-3">
                There are {clausesWithParsingFlags.length} clause{clausesWithParsingFlags.length > 1 ? "s" : ""} with parsing flags that may indicate extraction issues:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 mb-3">
                {clausesWithParsingFlags.slice(0, 5).map((clause) => (
                  <li key={clause.id} className="text-slate-700">
                    {clause.clauseType}
                    {clause.ragParsing === "red" && (
                      <Badge variant="destructive" className="ml-2 text-xs">Critical</Badge>
                    )}
                    {clause.ragParsing === "amber" && (
                      <Badge variant="outline" className="ml-2 text-xs bg-amber-100 text-amber-700">Warning</Badge>
                    )}
                  </li>
                ))}
                {clausesWithParsingFlags.length > 5 && (
                  <li className="text-slate-500">...and {clausesWithParsingFlags.length - 5} more</li>
                )}
              </ul>
              <p className="text-sm">
                Do you want to continue finalizing anyway, or go back to review these clauses?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Review Clauses</AlertDialogCancel>
            <AlertDialogAction
              onClick={doFinalise}
              className="bg-amber-500 hover:bg-amber-600"
            >
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function ResolutionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-slate-600">Loading reconciliation summary...</p>
          </div>
        </div>
      }
    >
      <ResolutionPageContent />
    </Suspense>
  )
}
