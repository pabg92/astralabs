import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import { authenticateRequest, internalError } from "@/lib/auth/api-auth"
import type { Database } from "@/types/database"

type Deal = Database["public"]["Tables"]["deals"]["Row"]
type PreAgreedTerm = Database["public"]["Tables"]["pre_agreed_terms"]["Row"]
type Document = Database["public"]["Tables"]["document_repository"]["Row"]

interface DealWithRelations extends Deal {
  pre_agreed_terms: PreAgreedTerm[]
  latest_document?: Document | null
}

/**
 * GET /api/deals
 * Returns all deals for the authenticated user's tenant
 * Requires authentication
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user and get tenant
    const authResult = await authenticateRequest()
    if (!authResult.success) return authResult.response

    const { tenantId } = authResult.user

    // Build query for deals - always filtered by user's tenant
    const { data: deals, error } = await supabaseServer
      .from("deals")
      .select(
        `
        *,
        pre_agreed_terms (*),
        document_repository (*)
      `
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching deals:", error)
      return NextResponse.json(
        { success: false, error: "Failed to fetch deals", details: error.message, data: [], count: 0 },
        { status: 500 }
      )
    }

    // Transform the response to include only the latest document per deal
    const dealsWithLatestDoc: DealWithRelations[] = deals.map((deal: any) => {
      const documents = deal.document_repository || []
      const latestDocument =
        documents.length > 0
          ? documents.reduce((latest: Document, current: Document) => {
              return new Date(current.created_at || 0) >
                new Date(latest.created_at || 0)
                ? current
                : latest
            })
          : null

      return {
        ...deal,
        pre_agreed_terms: deal.pre_agreed_terms || [],
        latest_document: latestDocument,
        document_repository: undefined, // Remove the array from response
      }
    })

    return NextResponse.json({
      success: true,
      data: dealsWithLatestDoc,
      count: dealsWithLatestDoc.length,
    })
  } catch (error) {
    return internalError(error, "GET /api/deals")
  }
}

/**
 * POST /api/deals
 * Creates a new deal with pre-agreed terms and optional contract upload
 * Requires authentication - tenant_id and created_by derived from authenticated user
 * Expects FormData with:
 * - title, client_name, talent_name, value, currency, status
 * - terms (JSON array of pre-agreed terms)
 * - file (optional contract file)
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user and get tenant
    const authResult = await authenticateRequest()
    if (!authResult.success) return authResult.response

    const { tenantId, profileId } = authResult.user

    const formData = await request.formData()

    // Extract deal data
    const title = formData.get("title") as string
    const clientName = formData.get("client_name") as string
    const talentName = formData.get("talent_name") as string
    const value = formData.get("value") as string
    const currency = formData.get("currency") as string
    const status = formData.get("status") as string
    const description = formData.get("description") as string | null
    const termsJson = formData.get("terms") as string
    const file = formData.get("file") as File | null

    // Validate required fields (tenant_id and created_by now come from auth)
    if (!title || !clientName || !talentName) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          required: ["title", "client_name", "talent_name"],
        },
        { status: 400 }
      )
    }

    // Use authenticated user's profile ID (UUID) as creator for FK reference
    const createdBy = profileId

    // Parse pre-agreed terms
    let terms: Array<{
      term_category: string
      term_description: string
      expected_value?: string
      is_mandatory?: boolean
      related_clause_types?: string[]
    }> = []

    if (termsJson) {
      try {
        terms = JSON.parse(termsJson)
      } catch (e) {
        return NextResponse.json(
          { error: "Invalid JSON format for terms" },
          { status: 400 }
        )
      }
    }

    // Start transaction: create deal
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .insert({
        title,
        client_name: clientName,
        talent_name: talentName,
        value: value ? parseFloat(value) : null,
        currency: currency || "USD",
        status: (status as any) || "draft",
        description,
        tenant_id: tenantId,
        created_by: createdBy,
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

    // Insert pre-agreed terms
    if (terms.length > 0) {
      const termsToInsert = terms.map((term) => ({
        deal_id: deal.id,
        tenant_id: tenantId,
        term_category: term.term_category,
        term_description: term.term_description,
        expected_value: term.expected_value || null,
        is_mandatory: term.is_mandatory !== undefined ? term.is_mandatory : true,
        related_clause_types: term.related_clause_types && term.related_clause_types.length > 0
          ? term.related_clause_types
          : null,
      }))

      const { error: termsError } = await supabaseServer
        .from("pre_agreed_terms")
        .insert(termsToInsert)

      if (termsError) {
        console.error("Error inserting pre-agreed terms:", termsError)
        // Note: Deal is already created, but terms failed
        return NextResponse.json(
          {
            warning: "Deal created but failed to insert terms",
            deal,
            error: termsError.message,
          },
          { status: 207 } // Multi-Status
        )
      }
    }

    // Handle file upload if provided
    let documentId: string | null = null
    if (file && file.size > 0) {
      try {
        // Construct storage path: contracts/{tenant_id}/{deal_id}/{filename}
        const fileExtension = file.name.split(".").pop()
        const storagePath = `${tenantId}/${deal.id}/${file.name}`

        // Upload to Supabase Storage
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
            {
              warning: "Deal created but file upload failed",
              deal,
              error: uploadError.message,
            },
            { status: 207 }
          )
        }

        // Create document_repository entry
        const { data: document, error: docError } = await supabaseServer
          .from("document_repository")
          .insert({
            tenant_id: tenantId,
            deal_id: deal.id,
            object_path: uploadData.path,
            original_filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            processing_status: "pending",
            created_by: createdBy,
          })
          .select()
          .single()

        if (docError) {
          console.error("Error creating document record:", docError)
          return NextResponse.json(
            {
              warning: "Deal and file uploaded but failed to create document record",
              deal,
              error: docError.message,
            },
            { status: 207 }
          )
        }

        documentId = document.id

        // Note: The database trigger 'trigger_enqueue_document' will automatically
        // enqueue this document for processing via pgmq
      } catch (fileError) {
        console.error("Unexpected error during file upload:", fileError)
        return NextResponse.json(
          {
            warning: "Deal created but file processing failed",
            deal,
            error: String(fileError),
          },
          { status: 207 }
        )
      }
    }

    // Fetch the complete deal with relations
    const { data: completeDeal, error: fetchError } = await supabaseServer
      .from("deals")
      .select(
        `
        *,
        pre_agreed_terms (*),
        document_repository (*)
      `
      )
      .eq("id", deal.id)
      .single()

    if (fetchError) {
      // Deal was created successfully, just return basic info
      return NextResponse.json({
        success: true,
        data: {
          ...deal,
          document_id: documentId,
        },
        message: "Deal created successfully",
      })
    }

    return NextResponse.json({
      success: true,
      data: completeDeal,
      message: documentId
        ? "Deal created with contract upload"
        : "Deal created successfully",
    })
  } catch (error) {
    return internalError(error, "POST /api/deals")
  }
}
