import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

/**
 * POST /api/deals/[dealId]/upload
 * Attaches a document (invoice/contract) to an existing deal.
 * Expects FormData: file (required), created_by (optional)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const { dealId } = await params
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const createdBy = (formData.get("created_by") as string) || null
    const demoAuthor = process.env.DEMO_AUTHOR_ID || "00000000-0000-0000-0000-000000000002"

    if (!dealId) {
      return NextResponse.json({ error: "dealId is required" }, { status: 400 })
    }

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "file is required" }, { status: 400 })
    }

    // Fetch deal to derive tenant and default author
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .select("id, tenant_id, created_by")
      .eq("id", dealId)
      .single()

    if (dealError || !deal) {
      return NextResponse.json(
        { error: "Deal not found", details: dealError?.message },
        { status: 404 }
      )
    }

    const tenantId = deal.tenant_id
    const authorId = createdBy || (deal as any).created_by || demoAuthor

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

    // Create document record (trigger will enqueue for processing)
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
        created_by: authorId,
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

    return NextResponse.json({
      success: true,
      data: {
        document,
      },
      message: "File uploaded and queued for processing",
    })
  } catch (error) {
    console.error("Unexpected error in POST /api/deals/[dealId]/upload:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
