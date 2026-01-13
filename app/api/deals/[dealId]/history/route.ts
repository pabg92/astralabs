import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import {
  authenticateRequest,
  validateDealAccess,
  internalError,
} from "@/lib/auth/api-auth"

/**
 * GET /api/deals/[dealId]/history
 * Returns version history for a deal including documents and clause changes
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

    // Fetch deal details
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .select("id, version, title")
      .eq("id", dealId)
      .single()

    if (dealError || !deal) {
      return NextResponse.json(
        { success: false, error: "Deal not found", data: null },
        { status: 404 }
      )
    }

    // Fetch all documents for this deal with uploader info
    const { data: documents, error: docError } = await supabaseServer
      .from("document_repository")
      .select(`
        id,
        version,
        original_filename,
        created_at,
        created_by,
        processing_status,
        size_bytes,
        mime_type
      `)
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })

    if (docError) {
      console.error("Error fetching document versions:", docError)
      return NextResponse.json(
        { success: false, error: "Failed to fetch versions", details: docError.message },
        { status: 500 }
      )
    }

    // Get document IDs to fetch clause changes
    const documentIds = documents?.map(d => d.id) || []

    // Fetch clause update history for documents in this deal
    let clauseChanges: any[] = []
    if (documentIds.length > 0) {
      const { data: changes, error: changeError } = await supabaseServer
        .from("clause_update_history")
        .select(`
          id,
          version,
          change_type,
          reason_code,
          reason_description,
          old_values,
          new_values,
          created_at,
          changed_by
        `)
        .order("created_at", { ascending: false })
        .limit(50)

      if (!changeError && changes) {
        // Filter to only include changes related to our documents
        // by joining through clause_match_results
        const { data: matchResults } = await supabaseServer
          .from("clause_match_results")
          .select("id, document_id")
          .in("document_id", documentIds)

        const matchResultIds = matchResults?.map(m => m.id) || []

        if (matchResultIds.length > 0) {
          const { data: filteredChanges } = await supabaseServer
            .from("clause_update_history")
            .select(`
              id,
              version,
              change_type,
              reason_code,
              reason_description,
              old_values,
              new_values,
              created_at,
              changed_by
            `)
            .in("clause_match_result_id", matchResultIds)
            .order("created_at", { ascending: false })
            .limit(50)

          clauseChanges = filteredChanges || []
        }
      }
    }

    // Map documents to version history items
    const versions = (documents || []).map((doc, index) => ({
      id: doc.id,
      version: doc.version ?? (documents!.length - index),
      original_filename: doc.original_filename,
      created_at: doc.created_at || "",
      created_by: doc.created_by,
      processing_status: doc.processing_status,
      size_bytes: doc.size_bytes,
      mime_type: doc.mime_type,
    }))

    return NextResponse.json({
      success: true,
      data: {
        deal_id: dealId,
        deal_title: deal.title,
        deal_version: deal.version || 1,
        documents: versions,
        clauseChanges: clauseChanges,
        total_documents: versions.length,
        total_changes: clauseChanges.length,
      },
    })
  } catch (error) {
    return internalError(error, "GET /api/deals/[dealId]/history")
  }
}
