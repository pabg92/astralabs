"use client"

import { useState, useEffect, Suspense } from "react"
import { useParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Clock,
  TrendingUp,
  FileText,
  Loader2,
  Shield,
  Calendar,
  Building,
  User,
} from "lucide-react"

interface Clause {
  id: string
  text: string
  clauseType: string
  ragStatus?: string
  summary?: string
  reviewDecision?: "approved" | "rejected" | null
}

interface PreAgreedTerm {
  id: string
  termCategory: string
  termDescription: string
  relatedClauseTypes: string[]
}

interface ShareData {
  deal: {
    deal_name: string
    talent_name: string
    brand_name: string
    status: string
  }
  document: {
    original_filename: string
  } | null
  pre_agreed_terms: Array<{
    id: string
    term_category: string
    term_description: string
    related_clause_types: string[] | null
  }>
  clause_boundaries: Array<{
    id: string
    content: string
    clause_type: string
  }>
  branding: {
    deal_name?: string
    slug?: string
  }
  expires_at: string
}

function GuestReviewContent() {
  const params = useParams()
  const slug = params.slug as string

  const [data, setData] = useState<ShareData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchShareData() {
      if (!slug) {
        setError("Invalid link")
        setIsLoading(false)
        return
      }

      // Extract token from slug (last 8 characters after final hyphen)
      const parts = slug.split("-")
      const token = parts[parts.length - 1]

      if (!token || token.length !== 8) {
        setError("Invalid share link format")
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch(`/api/share/${token}`)

        if (!response.ok) {
          const errorData = await response.json()
          if (response.status === 403) {
            setError(errorData.error || "This link has expired or been revoked")
          } else if (response.status === 404) {
            setError("Share link not found")
          } else {
            setError(errorData.error || "Failed to load review")
          }
          setIsLoading(false)
          return
        }

        const result = await response.json()
        if (!result.success || !result.data) {
          setError("Invalid response format")
          setIsLoading(false)
          return
        }

        setData(result.data)
        setIsLoading(false)
      } catch (err) {
        console.error("Error fetching share data:", err)
        setError("Failed to load review. Please try again.")
        setIsLoading(false)
      }
    }

    fetchShareData()
  }, [slug])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
          <p className="text-slate-600">Loading contract review...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Unable to Access Review</h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <p className="text-sm text-slate-500">
            If you believe this is an error, please contact the person who shared this link.
          </p>
        </Card>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const { deal, document, pre_agreed_terms, clause_boundaries, expires_at, branding } = data

  // Map clauses
  const clauses: Clause[] = clause_boundaries.map((boundary) => ({
    id: boundary.id,
    text: boundary.content || "",
    clauseType: boundary.clause_type || "General",
    summary: boundary.clause_type,
  }))

  // Map pre-agreed terms
  const preAgreedTerms: PreAgreedTerm[] = pre_agreed_terms.map((term) => ({
    id: term.id,
    termCategory: term.term_category || "General",
    termDescription: term.term_description || "",
    relatedClauseTypes: term.related_clause_types || [],
  }))

  // Calculate stats (simplified for guest view)
  const totalClauses = clauses.length
  const totalTerms = preAgreedTerms.length

  // Calculate expiry info
  const expiryDate = new Date(expires_at)
  const now = new Date()
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Guest Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-medium">Guest View</span>
            <span className="text-blue-200 text-sm">|</span>
            <span className="text-sm text-blue-100">Read-only access</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-blue-100">
            <Calendar className="w-4 h-4" />
            <span>Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-slate-400" />
                <span className="text-sm text-slate-500">Contract Review</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                {branding?.deal_name || deal.deal_name || deal.talent_name || "Contract"}
              </h1>
              <div className="flex items-center gap-4 text-sm text-slate-600">
                {deal.talent_name && (
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {deal.talent_name}
                  </span>
                )}
                {deal.brand_name && (
                  <span className="flex items-center gap-1">
                    <Building className="w-4 h-4" />
                    {deal.brand_name}
                  </span>
                )}
              </div>
            </div>
            {document && (
              <Badge variant="outline" className="text-xs">
                <FileText className="w-3 h-3 mr-1" />
                {document.original_filename}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalClauses}</p>
                <p className="text-sm text-slate-500">Total Clauses</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalTerms}</p>
                <p className="text-sm text-slate-500">Pre-Agreed Terms</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {deal.status === "signed" ? "Complete" : "In Review"}
                </p>
                <p className="text-sm text-slate-500">Status</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Pre-Agreed Terms */}
        {preAgreedTerms.length > 0 && (
          <Card className="p-6 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Pre-Agreed Terms</h2>
                <p className="text-sm text-slate-500">{totalTerms} terms to reconcile</p>
              </div>
            </div>

            <div className="space-y-3">
              {preAgreedTerms.map((term) => {
                // Check if any clause matches this term
                const hasMatchingClause = clauses.some((clause) => {
                  const clauseTypeNormalized = clause.clauseType.toLowerCase()
                  return term.relatedClauseTypes.some(
                    (relatedType) => relatedType.toLowerCase() === clauseTypeNormalized
                  )
                })

                return (
                  <div
                    key={term.id}
                    className={`p-4 rounded-xl border-2 ${
                      hasMatchingClause
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          hasMatchingClause
                            ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {term.termCategory}
                      </Badge>
                      {hasMatchingClause ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-medium text-emerald-600">Matched</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span className="text-xs font-medium text-amber-600">Pending</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-slate-700">{term.termDescription}</p>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Contract Clauses */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Contract Clauses</h2>
              <p className="text-sm text-slate-500">{totalClauses} clauses extracted</p>
            </div>
          </div>

          <div className="space-y-3">
            {clauses.map((clause, index) => (
              <div
                key={clause.id}
                className="p-4 rounded-lg border border-slate-200 bg-white"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">
                    {clause.clauseType}
                  </Badge>
                  <span className="text-xs text-slate-400">#{index + 1}</span>
                </div>
                <p className="text-sm text-slate-700 line-clamp-3">
                  {clause.text || "No content available"}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-slate-500">
          <p>Shared via ContractBuddy</p>
          <p className="text-xs mt-1">Smart Contract Reviews. For People With Better Things To Do.</p>
        </div>
      </div>
    </div>
  )
}

export default function GuestReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
        </div>
      }
    >
      <GuestReviewContent />
    </Suspense>
  )
}
