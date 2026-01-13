import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import {
  authenticateRequest,
  validateDealAccess,
  internalError,
} from "@/lib/auth/api-auth"

/**
 * POST /api/deals/[dealId]/upload
 * Attaches a document (invoice/contract) to an existing deal.
 * Requires authentication and tenant access
 * Expects FormData: file (required)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const { dealId } = await params

    // Authenticate user
    const authResult = await authenticateRequest()
    if (!authResult.success) return authResult.response

    const { userId, tenantId } = authResult.user

    // Validate deal access
    const dealAccess = await validateDealAccess(authResult.user, dealId)
    if (!dealAccess.success) return dealAccess.response

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "file is required" }, { status: 400 })
    }

    // Fetch deal to get current version
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .select("id, tenant_id, version")
      .eq("id", dealId)
      .single()

    if (dealError || !deal) {
      return NextResponse.json(
        { error: "Deal not found", details: dealError?.message },
        { status: 404 }
      )
    }

    const currentVersion = deal.version || 1
    const newVersion = currentVersion + 1

    // Upload to storage
    const path = `${tenantId}/${dealId}/${Date.now()}-${file.name}`
    const fileBuffer = await file.arrayBuffer()
    const { data: uploadData, error: uploadError } = await supabaseServer.storage
      .from("contracts")
      .upload(path, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError || !uploadData) {
      console.error("Upload error:", uploadError)
      return NextResponse.json(
        { error: "Failed to upload file", details: uploadError?.message },
        { status: 500 }
      )
    }

    // Create document record with version (trigger will enqueue for processing)
    const { data: document, error: docError } = await supabaseServer
      .from("document_repository")
      .insert({
        tenant_id: tenantId,
        deal_id: dealId,
        object_path: uploadData.path,
        original_filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        processing_status: "pending",
        created_by: userId,
        version: newVersion,
      })
      .select()
      .single()

    if (docError || !document) {
      console.error("Document insert error:", docError)
      return NextResponse.json(
        { error: "Failed to create document record", details: docError?.message },
        { status: 500 }
      )
    }

    // Update deal version
    const { error: versionError } = await supabaseServer
      .from("deals")
      .update({ version: newVersion })
      .eq("id", dealId)

    if (versionError) {
      console.error("Version update error:", versionError)
      // Don't fail the request, document is already created
    }

    // Clear old clause match results for fresh reconciliation
    const { error: clearError } = await supabaseServer
      .from("clause_match_results")
      .delete()
      .eq("deal_id", dealId)

    if (clearError) {
      console.error("Clear clause matches error:", clearError)
      // Don't fail the request, this is cleanup
    }

    return NextResponse.json({
      success: true,
      data: {
        document,
        newVersion,
      },
      message: `File uploaded for v${newVersion} and queued for processing`,
    })
  } catch (error) {
    return internalError(error, "POST /api/deals/[dealId]/upload")
  }
}
