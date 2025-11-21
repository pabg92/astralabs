import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, createServerClient } from "@/lib/supabase/server"

/**
 * GET /api/reconciliation/[dealId]/pdf
 *
 * Generates a time-limited signed URL for accessing the original contract PDF from private storage.
 * Implements tenant validation to prevent unauthorized access.
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

    if (!dealId) {
      return NextResponse.json(
        { error: "Deal ID is required" },
        { status: 400 }
      )
    }

    // ⚠️ TEMPORARY TESTING BYPASS - Remove before production deployment
    // This bypass allows PDF testing without authentication in development
    if (process.env.ALLOW_PDF_TESTING === 'true') {
      console.warn('⚠️  PDF_TESTING mode enabled - bypassing authentication for deal:', dealId)

      // Fetch document directly without auth checks
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
        console.error("Document fetch error (bypass mode):", docError)
        return NextResponse.json(
          { error: "Document not found for this deal" },
          { status: 404 }
        )
      }

      if (!document.object_path) {
        console.error("No object_path for document (bypass mode):", document.id)
        return NextResponse.json(
          { error: "Document file path not available" },
          { status: 404 }
        )
      }

      // Generate signed URL (same as production path)
      const expiresIn = 3600 // 1 hour
      const { data: signedUrlData, error: urlError } = await supabaseServer
        .storage
        .from("contracts")
        .createSignedUrl(document.object_path, expiresIn)

      if (urlError || !signedUrlData) {
        console.error("Signed URL generation error (bypass mode):", urlError)
        return NextResponse.json(
          { error: "Failed to generate document access URL", details: urlError?.message },
          { status: 500 }
        )
      }

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

      return NextResponse.json({
        url: signedUrlData.signedUrl,
        expires_at: expiresAt,
        filename: document.original_filename || "contract.pdf",
        mime_type: document.mime_type || "application/pdf",
        deal_id: document.deal_id,
      })
    }
    // END TEMPORARY BYPASS

    // Step 1: Authenticate user via request cookies
    const authClient = await createServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      console.error("Authentication error:", authError)
      return NextResponse.json(
        { error: "Unauthorized - authentication required" },
        { status: 401 }
      )
    }

    // Step 2: Get user's tenant_id from user_profiles table
    const { data: profile, error: profileError } = await supabaseServer
      .from("user_profiles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single()

    if (profileError || !profile?.tenant_id) {
      console.error("User profile fetch error:", profileError, "user_id:", user.id)
      return NextResponse.json(
        { error: "Forbidden - user has no tenant association" },
        { status: 403 }
      )
    }

    const userTenantId = profile.tenant_id

    // Step 3: Fetch document metadata with deal tenant validation
    const { data: document, error: docError } = await supabaseServer
      .from("document_repository")
      .select(`
        id,
        object_path,
        original_filename,
        mime_type,
        deal_id,
        deals!inner (
          id,
          tenant_id
        )
      `)
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (docError || !document) {
      console.error("Document fetch error:", docError)
      return NextResponse.json(
        { error: "Document not found for this deal" },
        { status: 404 }
      )
    }

    // Step 4: Verify tenant ownership
    const dealTenantId = (document.deals as any).tenant_id

    if (dealTenantId !== userTenantId) {
      console.error("Tenant mismatch:", { userTenantId, dealTenantId, userId: user.id, dealId })
      return NextResponse.json(
        { error: "Forbidden - you do not have access to this deal" },
        { status: 403 }
      )
    }

    // Step 5: Verify object_path exists
    if (!document.object_path) {
      console.error("No object_path for document:", document.id)
      return NextResponse.json(
        { error: "Document file path not available" },
        { status: 404 }
      )
    }

    // Step 6: Generate signed URL (1 hour expiry as per plan-pdf.md)
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

    // Step 7: Calculate expiration timestamp
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Step 8: Return metadata (including deal_id for potential worker reuse)
    return NextResponse.json({
      url: signedUrlData.signedUrl,
      expires_at: expiresAt,
      filename: document.original_filename || "contract.pdf",
      mime_type: document.mime_type || "application/pdf",
      deal_id: document.deal_id,
    })

  } catch (error) {
    console.error("Unexpected error in GET /api/reconciliation/[dealId]/pdf:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
