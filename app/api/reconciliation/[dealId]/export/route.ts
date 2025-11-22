import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

type RAGStatus = Database["public"]["Enums"]["rag_status"]

/**
 * GET /api/reconciliation/[dealId]/export
 * Exports reconciliation data as a text-based report with color markup
 * Returns a downloadable text file with [GREEN]/[AMBER]/[RED] tags
 *
 * This is a placeholder implementation until PDF export with highlighting is implemented
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { dealId: string } }
) {
  try {
    const { dealId } = params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get("format") || "text" // text, json, or markdown
    const documentId = searchParams.get("document_id") // optional: specific document to export

    if (!dealId) {
      return NextResponse.json(
        { error: "Deal ID is required" },
        { status: 400 }
      )
    }

    // Fetch deal details
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
      return NextResponse.json(
        { error: "Deal not found" },
        { status: 404 }
      )
    }

    // Fetch document - either specific document_id or latest for the deal
    let document
    if (documentId) {
      const { data, error } = await supabaseServer
        .from("document_repository")
        .select("*")
        .eq("id", documentId)
        .eq("deal_id", dealId) // Ensure document belongs to this deal
        .single()

      if (error || !data) {
        return NextResponse.json(
          { error: `Document ${documentId} not found for this deal` },
          { status: 404 }
        )
      }
      document = data
    } else {
      const { data: documents } = await supabaseServer
        .from("document_repository")
        .select("*")
        .eq("deal_id", dealId)
        .eq("processing_status", "completed") // Only export completed documents
        .order("created_at", { ascending: false })
        .limit(1)

      if (!documents || documents.length === 0) {
        return NextResponse.json(
          { error: "No completed documents found for this deal" },
          { status: 404 }
        )
      }
      document = documents[0]
    }

    // Fetch clauses with match results
    const { data: clauses } = await supabaseServer
      .from("clause_boundaries")
      .select("*")
      .eq("document_id", document.id)
      .order("start_page", { ascending: true })

    const { data: matchResults } = await supabaseServer
      .from("clause_match_results")
      .select(
        `
        *,
        matched_template:legal_clause_library!clause_match_results_matched_template_id_fkey (
          clause_id,
          clause_type,
          standard_text
        )
      `
      )
      .eq("document_id", document.id)

    // Fetch redlines and comments for this document
    const clauseIds = clauses?.map((c) => c.id) || []
    let redlines: any[] = []
    let comments: any[] = []

    if (clauseIds.length > 0 && deal.tenant_id) {
      const { data: redlinesData, error: redlinesError } = await supabaseServer
        .from("clause_redlines")
        .select(`
          *,
          user_profiles!clause_redlines_author_id_fkey (
            email,
            full_name
          )
        `)
        .in("clause_boundary_id", clauseIds)
        .eq("tenant_id", deal.tenant_id)
        .order("created_at", { ascending: false })

      if (redlinesError) {
        console.error("Error fetching redlines for export:", redlinesError)
        return NextResponse.json(
          { error: "Failed to fetch redlines", details: redlinesError.message },
          { status: 500 }
        )
      }

      redlines = redlinesData || []

      const { data: commentsData, error: commentsError } = await supabaseServer
        .from("clause_comments")
        .select(`
          *,
          user_profiles!clause_comments_author_id_fkey (
            email,
            full_name
          )
        `)
        .in("clause_boundary_id", clauseIds)
        .eq("tenant_id", deal.tenant_id)
        .order("created_at", { ascending: false })

      if (commentsError) {
        console.error("Error fetching comments for export:", commentsError)
        return NextResponse.json(
          { error: "Failed to fetch comments", details: commentsError.message },
          { status: 500 }
        )
      }

      comments = commentsData || []
    }

    // Create match results map
    const matchMap = new Map()
    matchResults?.forEach((match: any) => {
      if (match.clause_boundary_id) {
        matchMap.set(match.clause_boundary_id, match)
      }
    })

    // Calculate statistics
    const stats = {
      total: matchResults?.length || 0,
      green: matchResults?.filter((m) => m.rag_status === "green").length || 0,
      amber: matchResults?.filter((m) => m.rag_status === "amber").length || 0,
      red: matchResults?.filter((m) => m.rag_status === "red").length || 0,
      blue: matchResults?.filter((m) => m.rag_status === "blue").length || 0,
    }

    // Generate export based on format
    if (format === "json") {
      return NextResponse.json({
        deal: {
          id: deal.id,
          title: deal.title,
          client_name: deal.client_name,
          talent_name: deal.talent_name,
          value: deal.value,
          currency: deal.currency,
          status: deal.status,
        },
        document: {
          id: document.id,
          filename: document.original_filename,
          processing_status: document.processing_status,
        },
        pre_agreed_terms: deal.pre_agreed_terms,
        rag_distribution: stats, // Renamed from 'statistics' for consistency with Phase 9 spec
        clauses:
          clauses?.map((clause) => {
            const match = matchMap.get(clause.id)
            return {
              id: clause.id,
              clause_type: clause.clause_type,
              content: clause.content,
              page_range: `${clause.start_page}-${clause.end_page}`,
              confidence: clause.confidence,
              rag_status: match?.rag_status || "unknown",
              rag_parsing: match?.rag_parsing || null,
              rag_risk: match?.rag_risk || null,
              similarity_score: match?.similarity_score || null,
              matched_template: match?.matched_template || null,
            }
          }) || [],
        redlines: redlines.map((r) => ({
          id: r.id,
          clause_boundary_id: r.clause_boundary_id,
          change_type: r.change_type,
          proposed_text: r.proposed_text,
          status: r.status,
          author: r.user_profiles?.full_name || r.user_profiles?.email || "Unknown",
          created_at: r.created_at,
          resolved_at: r.resolved_at,
        })),
        comments: comments.map((c) => ({
          id: c.id,
          clause_boundary_id: c.clause_boundary_id,
          comment_text: c.comment_text,
          author: c.user_profiles?.full_name || c.user_profiles?.email || "Unknown",
          created_at: c.created_at,
        })),
      })
    }

    // Generate text-based report with color markup
    let report = ""

    // Header
    report += "=" .repeat(80) + "\n"
    report += "CONTRACT RECONCILIATION REPORT\n"
    report += "=" .repeat(80) + "\n\n"

    report += `Deal: ${deal.title}\n`
    report += `Client: ${deal.client_name} | Talent: ${deal.talent_name}\n`
    report += `Value: ${deal.currency} ${deal.value}\n`
    report += `Document: ${document.original_filename}\n`
    report += `Export Date: ${new Date().toISOString()}\n\n`

    // Statistics
    report += "-" .repeat(80) + "\n"
    report += "RECONCILIATION STATISTICS\n"
    report += "-" .repeat(80) + "\n"
    report += `Total Clauses: ${stats.total}\n`
    report += `[GREEN] Approved: ${stats.green} (${((stats.green / stats.total) * 100).toFixed(1)}%)\n`
    report += `[AMBER] Review Required: ${stats.amber} (${((stats.amber / stats.total) * 100).toFixed(1)}%)\n`
    report += `[RED] Issues Found: ${stats.red} (${((stats.red / stats.total) * 100).toFixed(1)}%)\n`
    report += `[BLUE] New/Unmatched: ${stats.blue} (${((stats.blue / stats.total) * 100).toFixed(1)}%)\n\n`

    // Pre-agreed terms
    if (deal.pre_agreed_terms && deal.pre_agreed_terms.length > 0) {
      report += "-" .repeat(80) + "\n"
      report += "PRE-AGREED TERMS\n"
      report += "-" .repeat(80) + "\n"
      deal.pre_agreed_terms.forEach((term: any, index: number) => {
        report += `${index + 1}. ${term.term_category}${term.is_mandatory ? " (MANDATORY)" : ""}\n`
        report += `   ${term.term_description}\n`
        if (term.expected_value) {
          report += `   Expected: ${term.expected_value}\n`
        }
        report += "\n"
      })
    }

    // Clauses
    report += "-" .repeat(80) + "\n"
    report += "CLAUSE-BY-CLAUSE ANALYSIS\n"
    report += "-" .repeat(80) + "\n\n"

    clauses?.forEach((clause, index) => {
      const match = matchMap.get(clause.id)
      const ragStatus: RAGStatus = match?.rag_status || "blue"
      const statusColor = ragStatus.toUpperCase()

      report += `[${statusColor}] Clause ${index + 1}: ${clause.clause_type || "Unknown Type"}\n`
      report += `Pages: ${clause.start_page}-${clause.end_page} | Confidence: ${(clause.confidence || 0) * 100}%\n`

      if (match) {
        report += `RAG Parsing: ${match.rag_parsing || "N/A"} | RAG Risk: ${match.rag_risk || "N/A"}\n`
        if (match.similarity_score) {
          report += `Similarity to Template: ${(match.similarity_score * 100).toFixed(1)}%\n`
        }
      }

      report += `\nContent:\n${clause.content || "(No content)"}\n`

      if (match?.matched_template) {
        report += `\nMatched Template: ${match.matched_template.clause_id} - ${match.matched_template.clause_type}\n`
        report += `Standard Text: ${match.matched_template.standard_text}\n`
      }

      report += `[/${statusColor}]\n`
      report += "\n" + "-" .repeat(80) + "\n\n"
    })

    // Redlines & Comments Section
    if (redlines.length > 0 || comments.length > 0) {
      report += "=" .repeat(80) + "\n"
      report += "REDLINES & COMMENTS\n"
      report += "=" .repeat(80) + "\n\n"

      if (redlines.length > 0) {
        report += "-" .repeat(80) + "\n"
        report += "REDLINES (Suggested Changes)\n"
        report += "-" .repeat(80) + "\n\n"

        redlines.forEach((redline, index) => {
          const author = redline.user_profiles?.full_name || redline.user_profiles?.email || "Unknown"
          report += `Redline ${index + 1} [${redline.status.toUpperCase()}]\n`
          report += `Clause ID: ${redline.clause_boundary_id}\n`
          report += `Type: ${redline.change_type.toUpperCase()}\n`
          report += `Author: ${author}\n`
          report += `Created: ${new Date(redline.created_at).toLocaleString()}\n`
          if (redline.resolved_at) {
            report += `Resolved: ${new Date(redline.resolved_at).toLocaleString()}\n`
          }
          report += `\nProposed Text:\n${redline.proposed_text}\n`
          report += "\n" + "-" .repeat(80) + "\n\n"
        })
      }

      if (comments.length > 0) {
        report += "-" .repeat(80) + "\n"
        report += "COMMENTS\n"
        report += "-" .repeat(80) + "\n\n"

        comments.forEach((comment, index) => {
          const author = comment.user_profiles?.full_name || comment.user_profiles?.email || "Unknown"
          report += `Comment ${index + 1}\n`
          report += `Clause ID: ${comment.clause_boundary_id}\n`
          report += `Author: ${author}\n`
          report += `Created: ${new Date(comment.created_at).toLocaleString()}\n`
          report += `\nComment:\n${comment.comment_text}\n`
          report += "\n" + "-" .repeat(80) + "\n\n"
        })
      }
    }

    // Footer
    report += "=" .repeat(80) + "\n"
    report += "END OF REPORT\n"
    report += "=" .repeat(80) + "\n"

    // Return as downloadable text file
    const filename = `reconciliation_${deal.title.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.txt`

    return new NextResponse(report, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    console.error("Unexpected error in GET /api/reconciliation/[dealId]/export:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
