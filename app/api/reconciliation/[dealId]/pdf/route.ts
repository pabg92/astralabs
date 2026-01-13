import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import {
  authenticateRequest,
  validateDealAccess,
  internalError,
} from "@/lib/auth/api-auth"

/**
 * GET /api/reconciliation/[dealId]/pdf
 *
 * Generates a time-limited signed URL for accessing the original contract PDF from private storage.
 * Requires authentication and tenant access.
 *
 * Response format (per plan-pdf.md §1):
 * {
 *   url: string,           // Signed URL (1 hour expiry)
 *   expires_at: string,    // ISO timestamp when URL expires
 *   filename: string,      // Original filename
 *   mime_type: string,     // MIME type (e.g., "application/pdf")
 *   deal_id: string        // Deal ID for worker reuse
 * }
 *
 * Error Codes:
 * - 401: Unauthorized (not authenticated)
 * - 403: Forbidden (tenant ownership mismatch)
 * - 404: Document not found
 * - 500: Storage access failure
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

    // Fetch document metadata
    const { data: document, error: docError } = await supabaseServer
      .from("document_repository")
      .select(`
        id,
        object_path,
        original_filename,
        mime_type,
        deal_id
      `)
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { error: "Document not found for this deal" },
        { status: 404 }
      )
    }

    // Verify object_path exists
    if (!document.object_path) {
      return NextResponse.json(
        { error: "Document file path not available" },
        { status: 404 }
      )
    }

    // Generate signed URL (1 hour expiry as per plan-pdf.md)
    const expiresIn = 3600 // 1 hour in seconds

    const { data: signedUrlData, error: urlError } = await supabaseServer
      .storage
      .from("contracts")
      .createSignedUrl(document.object_path, expiresIn)

    if (urlError || !signedUrlData) {
      console.error("Signed URL generation error:", urlError)
      return NextResponse.json(
        { error: "Failed to generate document access URL", details: urlError?.message },
        { status: 500 }
      )
    }

    // Calculate expiration timestamp
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Return metadata (including deal_id for potential worker reuse)
    return NextResponse.json({
      url: signedUrlData.signedUrl,
      expires_at: expiresAt,
      filename: document.original_filename || "contract.pdf",
      mime_type: document.mime_type || "application/pdf",
      deal_id: document.deal_id,
    })

  } catch (error) {
    return internalError(error, "GET /api/reconciliation/[dealId]/pdf")
  }
}
