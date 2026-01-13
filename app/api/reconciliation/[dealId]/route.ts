import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import {
  authenticateRequest,
  validateDealAccess,
  internalError,
} from "@/lib/auth/api-auth"
import type { Database } from "@/types/database"

type Deal = Database["public"]["Tables"]["deals"]["Row"]
type Document = Database["public"]["Tables"]["document_repository"]["Row"]
type ClauseBoundary = Database["public"]["Tables"]["clause_boundaries"]["Row"]
type ClauseMatchResult = Database["public"]["Tables"]["clause_match_results"]["Row"]
type PreAgreedTerm = Database["public"]["Tables"]["pre_agreed_terms"]["Row"]
type LibraryClause = Database["public"]["Tables"]["legal_clause_library"]["Row"]

interface ClauseReview {
  id: string
  decision: string
  risk_accepted: boolean
  comments: string | null
  approved_at: string | null
}

interface ClauseBoundaryWithMatch extends ClauseBoundary {
  match_result?: ClauseMatchResult | null
  library_clause?: LibraryClause | null
  review?: ClauseReview | null
}

interface DocumentWithClauses extends Document {
  clause_boundaries: ClauseBoundaryWithMatch[]
  has_pdf?: boolean
}

interface ReconciliationData extends Deal {
  pre_agreed_terms: PreAgreedTerm[]
  document?: DocumentWithClauses | null
  library_templates: LibraryClause[]
  reconciliation_stats: {
    total_clauses: number
    green_count: number
    amber_count: number
    red_count: number
    blue_count: number
    completion_percentage: number
  }
}

/**
 * GET /api/reconciliation/[dealId]
 * Returns complete reconciliation data for a deal including:
 * - Deal details and pre-agreed terms
 * - Document with all clause boundaries
 * - Match results for each clause
 * - Linked library templates
 * - Reconciliation statistics
 * Requires authentication and tenant access
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const { dealId } = await params

    // Authenticate user
    const authResult = await authenticateRequest()
    if (!authResult.success) return authResult.response

    // Validate deal access
    const dealAccess = await validateDealAccess(authResult.user, dealId)
    if (!dealAccess.success) return dealAccess.response

    // Fetch deal with pre-agreed terms
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .select(
        `
        *,
        pre_agreed_terms (*)
      `
      )
      .eq("id", dealId)
      .single()

    if (dealError || !deal) {
      console.error("Error fetching deal:", dealError)
      return NextResponse.json(
        { error: "Deal not found", details: dealError?.message },
        { status: 404 }
      )
    }

    // Fetch documents for this deal (prioritize completed, then latest)
    // Phase 10: Try completed documents first, fallback to latest if none completed
    let { data: documents, error: docError } = await supabaseServer
      .from("document_repository")
      .select("*")
      .eq("deal_id", dealId)
      .eq("processing_status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)

    // If no completed documents, get the latest document regardless of status
    if (!docError && (!documents || documents.length === 0)) {
      const result = await supabaseServer
        .from("document_repository")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(1)
      documents = result.data
      docError = result.error
    }

    if (docError) {
      console.error("Error fetching documents:", docError)
      return NextResponse.json(
        { error: "Failed to fetch documents", details: docError.message },
        { status: 500 }
      )
    }

    let documentWithClauses: DocumentWithClauses | null = null
    let stats = {
      total_clauses: 0,
      green_count: 0,
      amber_count: 0,
      red_count: 0,
      blue_count: 0,
      completion_percentage: 0,
    }

    if (documents && documents.length > 0) {
      const document = documents[0]

      // Fetch clause boundaries for this document
      const { data: boundaries, error: boundariesError } = await supabaseServer
        .from("clause_boundaries")
        .select("*")
        .eq("document_id", document.id)
        .order("start_page", { ascending: true })

      if (boundariesError) {
        console.error("Error fetching clause boundaries:", boundariesError)
        return NextResponse.json(
          {
            error: "Failed to fetch clause boundaries",
            details: boundariesError.message,
          },
          { status: 500 }
        )
      }

      // Fetch match results for these clauses
      const { data: matchResults, error: matchError } = await supabaseServer
        .from("clause_match_results")
        .select("*")
        .eq("document_id", document.id)

      if (matchError) {
        console.error("Error fetching match results:", matchError)
        // Continue without match results rather than failing
      }

      // Fetch existing clause reviews for this document
      const { data: clauseReviews, error: reviewsError } = await supabaseServer
        .from("clause_reviews")
        .select("*")
        .eq("document_id", document.id)

      if (reviewsError) {
        console.error("Error fetching clause reviews:", reviewsError)
        // Continue without reviews rather than failing
      }

      // Create a map of reviews by clause_boundary_id
      type ClauseReviewRow = Database["public"]["Tables"]["clause_reviews"]["Row"]
      const reviewsMap = new Map<string, ClauseReviewRow>()
      if (clauseReviews) {
        clauseReviews.forEach((review) => {
          reviewsMap.set(review.clause_boundary_id, review)
        })
      }

      // Create a map of match results by clause_boundary_id
      const matchResultsMap = new Map<string, ClauseMatchResult>()
      if (matchResults) {
        matchResults.forEach((match) => {
          if (match.clause_boundary_id) {
            matchResultsMap.set(match.clause_boundary_id, match)
          }
        })
      }

      // Fetch library clauses for matched templates
      const templateIds = matchResults
        ?.map((m) => m.matched_template_id)
        .filter((id): id is string => id !== null) || []

      let libraryClausesMap = new Map<string, LibraryClause>()
      if (templateIds.length > 0) {
        const { data: libraryClauses, error: libraryError } =
          await supabaseServer
            .from("legal_clause_library")
            .select("*")
            .in("id", templateIds)

        if (!libraryError && libraryClauses) {
          libraryClauses.forEach((clause) => {
            libraryClausesMap.set(clause.id, clause)
          })
        }
      }

      // Combine boundaries with their match results and library clauses
      const clausesWithMatches: ClauseBoundaryWithMatch[] =
        boundaries?.map((boundary) => {
          const matchResult = matchResultsMap.get(boundary.id)
          const libraryClause = matchResult?.matched_template_id
            ? libraryClausesMap.get(matchResult.matched_template_id)
            : null

          // Count RAG statuses for stats
          if (matchResult) {
            stats.total_clauses++
            switch (matchResult.rag_status) {
              case "green":
                stats.green_count++
                break
              case "amber":
                stats.amber_count++
                break
              case "red":
                stats.red_count++
                break
              case "blue":
                stats.blue_count++
                break
            }
          }

          // Get review if exists
          const review = reviewsMap.get(boundary.id)

          return {
            ...boundary,
            match_result: matchResult || null,
            library_clause: libraryClause || null,
            review: review ? {
              id: review.id,
              decision: review.decision,
              risk_accepted: review.risk_accepted ?? false,
              comments: review.comments,
              approved_at: review.approved_at,
            } : null,
          }
        }) || []

      // Calculate completion percentage (clauses with match results / total clauses)
      if (stats.total_clauses > 0) {
        stats.completion_percentage = 100 // All clauses have been processed
      }

      // Fallback reconstruction for legacy docs without extracted_text
      // Sort deterministically: start_char > start_page > created_at > id
      const reconstructedText = !document.extracted_text
        ? [...clausesWithMatches]
            .sort((a, b) => {
              // Primary: start_char (if available)
              if (a.start_char != null && b.start_char != null) {
                return a.start_char - b.start_char
              }
              if (a.start_char != null) return -1
              if (b.start_char != null) return 1
              // Secondary: start_page
              const pageA = a.start_page ?? 0
              const pageB = b.start_page ?? 0
              if (pageA !== pageB) return pageA - pageB
              // Tertiary: created_at
              const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
              const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
              if (dateA !== dateB) return dateA - dateB
              // Final: id for absolute determinism
              return (a.id ?? '').localeCompare(b.id ?? '')
            })
            .map(c => `${c.section_title ? `\n${c.section_title}\n` : ''}${c.content || ''}`)
            .join('\n\n')
        : null

      documentWithClauses = {
        ...document,
        clause_boundaries: clausesWithMatches,
        // Full document text for highlighting - use stored or reconstructed
        extracted_text: document.extracted_text ?? reconstructedText,
        // Phase 9: Include PDF metadata for viewer (plan-pdf.md §2)
        object_path: document.object_path,
        mime_type: document.mime_type,
        original_filename: document.original_filename,
        has_pdf:
          Boolean(document.object_path) ||
          document.mime_type?.startsWith("application/pdf") ||
          false,
      }
    }

    // Fetch top library templates for context (most commonly used or highest rated)
    const { data: libraryTemplates, error: libraryError } =
      await supabaseServer
        .from("legal_clause_library")
        .select("*")
        .eq("active", true)
        .order("factual_correctness_score", { ascending: false })
        .limit(20)

    if (libraryError) {
      console.error("Error fetching library templates:", libraryError)
      // Continue without library templates rather than failing
    }

    const reconciliationData: ReconciliationData = {
      ...deal,
      pre_agreed_terms: deal.pre_agreed_terms || [],
      document: documentWithClauses,
      library_templates: libraryTemplates || [],
      reconciliation_stats: stats,
    }

    return NextResponse.json({
      success: true,
      data: reconciliationData,
    })
  } catch (error) {
    return internalError(error, "GET /api/reconciliation/[dealId]")
  }
}
