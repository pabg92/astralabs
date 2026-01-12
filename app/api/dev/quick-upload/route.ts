import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

// Fixed dev testing IDs (match existing seed data)
const DEV_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const DEV_USER_ID = '00000000-0000-0000-0000-000000000002'

/**
 * POST /api/dev/quick-upload
 *
 * Quick upload endpoint for dev testing - creates deal + PATs + uploads document
 * in one step without requiring auth or manual form filling.
 *
 * Protected: Requires ENABLE_DEV_ROUTES=true environment variable
 */
export async function POST(request: NextRequest) {
  // Block unless explicitly enabled
  if (process.env.ENABLE_DEV_ROUTES !== 'true') {
    return NextResponse.json(
      { error: 'Dev routes not enabled. Set ENABLE_DEV_ROUTES=true to enable.' },
      { status: 403 }
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const title = (formData.get("title") as string) || `Test Deal - ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`
    const talentName = (formData.get("talent_name") as string) || "Test Talent"
    const clientName = (formData.get("client_name") as string) || "Test Brand"
    const addSampleTerms = formData.get("add_sample_terms") !== "false" // Default true

    // Validate file
    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PDF and DOCX are supported." },
        { status: 400 }
      )
    }

    // 1. Create deal
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .insert({
        title,
        client_name: clientName,
        talent_name: talentName,
        value: 10000,
        currency: "USD",
        status: "draft",
        tenant_id: DEV_TENANT_ID,
        created_by: DEV_USER_ID,
      })
      .select()
      .single()

    if (dealError || !deal) {
      console.error("Error creating deal:", dealError)
      return NextResponse.json(
        { error: "Failed to create deal", details: dealError?.message },
        { status: 500 }
      )
    }

    // 2. Create sample pre-agreed terms if requested
    if (addSampleTerms) {
      const sampleTerms = [
        {
          deal_id: deal.id,
          tenant_id: DEV_TENANT_ID,
          term_category: 'Brand Name',
          term_description: clientName,
          is_mandatory: true,
        },
        {
          deal_id: deal.id,
          tenant_id: DEV_TENANT_ID,
          term_category: 'Talent Name',
          term_description: talentName,
          is_mandatory: true,
        },
        {
          deal_id: deal.id,
          tenant_id: DEV_TENANT_ID,
          term_category: 'Payment Terms',
          term_description: 'Net 30 days',
          is_mandatory: true,
        },
      ]

      const { error: termsError } = await supabaseServer
        .from("pre_agreed_terms")
        .insert(sampleTerms)

      if (termsError) {
        console.error("Error inserting pre-agreed terms:", termsError)
        // Continue anyway, terms are optional for testing
      }
    }

    // 3. Upload file to storage
    const storagePath = `${DEV_TENANT_ID}/${deal.id}/${Date.now()}-${file.name}`
    const fileBuffer = await file.arrayBuffer()

    const { data: uploadData, error: uploadError } = await supabaseServer
      .storage
      .from("contracts")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error("Error uploading file:", uploadError)
      return NextResponse.json(
        { error: "Failed to upload file", details: uploadError.message, deal_id: deal.id },
        { status: 500 }
      )
    }

    // 4. Create document record (triggers auto-enqueue via pgmq)
    const { data: document, error: docError } = await supabaseServer
      .from("document_repository")
      .insert({
        tenant_id: DEV_TENANT_ID,
        deal_id: deal.id,
        object_path: uploadData.path,
        original_filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        processing_status: "pending",
        created_by: DEV_USER_ID,
        version: 1,
      })
      .select()
      .single()

    if (docError || !document) {
      console.error("Error creating document record:", docError)
      return NextResponse.json(
        { error: "Failed to create document record", details: docError?.message, deal_id: deal.id },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      deal_id: deal.id,
      document_id: document.id,
      redirect_url: `/reconciliation?dealId=${deal.id}`,
      message: "Deal created and document queued for processing",
    })

  } catch (error) {
    console.error("Unexpected error in POST /api/dev/quick-upload:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
