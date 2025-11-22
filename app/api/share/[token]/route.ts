import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

type Deal = Database["public"]["Tables"]["deals"]["Row"]
type Document = Database["public"]["Tables"]["document_repository"]["Row"]
type ShareToken = Database["public"]["Tables"]["share_tokens"]["Row"]
type ClauseComment = Database["public"]["Tables"]["clause_comments"]["Row"]
type ClauseRedline = Database["public"]["Tables"]["clause_redlines"]["Row"]
type PreAgreedTerm = Database["public"]["Tables"]["pre_agreed_terms"]["Row"]
type ClauseBoundary = Database["public"]["Tables"]["clause_boundaries"]["Row"]

/**
 * GET /api/share/[token]
 * Fetch read-only deal data via share token
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      )
    }

    // Lookup share token
    const { data: shareToken, error: tokenError } = await supabaseServer
      .from("share_tokens")
      .select("*")
      .eq("id", token)
      .single()

    if (tokenError || !shareToken) {
      return NextResponse.json(
        { error: "Invalid token", details: tokenError?.message },
        { status: 404 }
      )
    }

    // Verify token is not revoked
    if (shareToken.revoked_at !== null) {
      return NextResponse.json(
        { error: "Token has been revoked" },
        { status: 403 }
      )
    }

    // Verify token is not expired
    const now = new Date()
    const expiresAt = new Date(shareToken.expires_at)
    if (expiresAt <= now) {
      return NextResponse.json(
        { error: "Token has expired" },
        { status: 403 }
      )
    }

    // Fetch deal data
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .select("*")
      .eq("id", shareToken.deal_id)
      .single()

    if (dealError || !deal) {
      return NextResponse.json(
        { error: "Deal not found", details: dealError?.message },
        { status: 404 }
      )
    }

    // Fetch pre-agreed terms for the deal (scoped by tenant)
    const { data: preAgreedTerms, error: termsError } = await supabaseServer
      .from("pre_agreed_terms")
      .select("*")
      .eq("deal_id", shareToken.deal_id)
      .eq("tenant_id", shareToken.tenant_id)

    if (termsError) {
      console.error("Error fetching pre-agreed terms:", termsError)
      // Continue without terms rather than failing
    }

    // Fetch document(s)
    let documentQuery = supabaseServer
      .from("document_repository")
      .select("*")
      .eq("deal_id", shareToken.deal_id)

    // If specific document_id is specified in token, filter to that document
    if (shareToken.document_id) {
      documentQuery = documentQuery.eq("id", shareToken.document_id)
    }

    const { data: documents, error: docError } = await documentQuery

    if (docError) {
      console.error("Error fetching documents:", docError)
      return NextResponse.json(
        { error: "Failed to fetch documents", details: docError.message },
        { status: 500 }
      )
    }

    const document = documents && documents.length > 0 ? documents[0] : null

    // Fetch clause boundaries for the document(s)
    let clauseBoundaries: ClauseBoundary[] = []
    if (documents && documents.length > 0) {
      const documentIds = documents.map((doc) => doc.id)

      const { data: boundaries, error: boundariesError } = await supabaseServer
        .from("clause_boundaries")
        .select("*")
        .in("document_id", documentIds)
        .eq("tenant_id", shareToken.tenant_id)
        .order("start_page", { ascending: true })

      if (boundariesError) {
        console.error("Error fetching clause boundaries:", boundariesError)
        // Continue without boundaries rather than failing
      } else {
        clauseBoundaries = boundaries || []
      }
    }

    // Fetch redlines for the deal's documents
    const clauseIds = clauseBoundaries.map((b) => b.id)
    let redlines: ClauseRedline[] = []
    let comments: ClauseComment[] = []

    if (clauseIds.length > 0) {
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
        .eq("tenant_id", shareToken.tenant_id)
        .order("created_at", { ascending: false })

      if (redlinesError) {
        console.error("Error fetching redlines:", redlinesError)
        // Continue without redlines rather than failing
      } else {
        redlines = redlinesData || []
      }

      // Fetch comments for the deal's documents
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
        .eq("tenant_id", shareToken.tenant_id)
        .order("created_at", { ascending: false })

      if (commentsError) {
        console.error("Error fetching comments:", commentsError)
        // Continue without comments rather than failing
      } else {
        comments = commentsData || []
      }
    }

    // Build response payload
    const responseData = {
      deal,
      document: document ? {
        ...document,
        // TODO: In a future iteration, add a signed URL for PDF access
        // This would require implementing a separate endpoint for generating
        // time-limited signed URLs for the object_path in storage
        signed_url: null,
      } : null,
      pre_agreed_terms: preAgreedTerms || [],
      clause_boundaries: clauseBoundaries,
      redlines,
      comments,
      branding: shareToken.branding,
      expires_at: shareToken.expires_at,
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error("Unexpected error in GET /api/share/[token]:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
