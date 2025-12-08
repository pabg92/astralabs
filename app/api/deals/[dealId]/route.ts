import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

type Deal = Database["public"]["Tables"]["deals"]["Row"]
type PreAgreedTerm = Database["public"]["Tables"]["pre_agreed_terms"]["Row"]
type Document = Database["public"]["Tables"]["document_repository"]["Row"]

interface DealWithRelations extends Deal {
  pre_agreed_terms: PreAgreedTerm[]
  latest_document?: Document | null
}

/**
 * GET /api/deals/[dealId]
 * Returns a single deal with its pre-agreed terms and latest document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const { dealId } = await params

    const { data: deal, error } = await supabaseServer
      .from("deals")
      .select(`
        *,
        pre_agreed_terms (*),
        document_repository (*)
      `)
      .eq("id", dealId)
      .single()

    if (error) {
      console.error("Error fetching deal:", error)
      return NextResponse.json(
        { success: false, error: "Deal not found", details: error.message },
        { status: 404 }
      )
    }

    // Transform to include only latest document
    const documents = (deal as any).document_repository || []
    const latestDocument =
      documents.length > 0
        ? documents.reduce((latest: Document, current: Document) => {
            return new Date(current.created_at || 0) > new Date(latest.created_at || 0)
              ? current
              : latest
          })
        : null

    const dealWithLatestDoc: DealWithRelations = {
      ...deal,
      pre_agreed_terms: deal.pre_agreed_terms || [],
      latest_document: latestDocument,
    }

    return NextResponse.json({
      success: true,
      data: dealWithLatestDoc,
    })
  } catch (error) {
    console.error("Unexpected error in GET /api/deals/[dealId]:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/deals/[dealId]
 * Updates a deal and its pre-agreed terms
 * Expects JSON body with deal fields and optional terms array
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const { dealId } = await params
    const body = await request.json()

    const {
      title,
      client_name,
      talent_name,
      value,
      currency,
      status,
      description,
      terms,
    } = body

    // Build update object with only provided fields
    const updateData: Record<string, any> = {}
    if (title !== undefined) updateData.title = title
    if (client_name !== undefined) updateData.client_name = client_name
    if (talent_name !== undefined) updateData.talent_name = talent_name
    if (value !== undefined) updateData.value = value ? parseFloat(value) : null
    if (currency !== undefined) updateData.currency = currency
    if (status !== undefined) updateData.status = status
    if (description !== undefined) updateData.description = description

    // Update deal
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .update(updateData)
      .eq("id", dealId)
      .select()
      .single()

    if (dealError) {
      console.error("Error updating deal:", dealError)
      return NextResponse.json(
        { success: false, error: "Failed to update deal", details: dealError.message },
        { status: 500 }
      )
    }

    // Update pre-agreed terms if provided
    if (terms && Array.isArray(terms)) {
      // Delete existing terms
      const { error: deleteError } = await supabaseServer
        .from("pre_agreed_terms")
        .delete()
        .eq("deal_id", dealId)

      if (deleteError) {
        console.error("Error deleting existing terms:", deleteError)
      }

      // Insert new terms
      if (terms.length > 0) {
        const termsToInsert = terms.map((term: any) => ({
          deal_id: dealId,
          tenant_id: deal.tenant_id,
          term_category: term.term_category,
          term_description: term.term_description,
          expected_value: term.expected_value || null,
          is_mandatory: term.is_mandatory !== undefined ? term.is_mandatory : true,
          related_clause_types: term.related_clause_types?.length > 0
            ? term.related_clause_types
            : null,
        }))

        const { error: termsError } = await supabaseServer
          .from("pre_agreed_terms")
          .insert(termsToInsert)

        if (termsError) {
          console.error("Error inserting terms:", termsError)
          return NextResponse.json(
            {
              success: true,
              warning: "Deal updated but failed to update terms",
              data: deal,
              error: termsError.message,
            },
            { status: 207 }
          )
        }
      }
    }

    // Fetch updated deal with relations
    const { data: updatedDeal, error: fetchError } = await supabaseServer
      .from("deals")
      .select(`
        *,
        pre_agreed_terms (*),
        document_repository (*)
      `)
      .eq("id", dealId)
      .single()

    if (fetchError) {
      return NextResponse.json({
        success: true,
        data: deal,
        message: "Deal updated successfully",
      })
    }

    return NextResponse.json({
      success: true,
      data: updatedDeal,
      message: "Deal updated successfully",
    })
  } catch (error) {
    console.error("Unexpected error in PATCH /api/deals/[dealId]:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/deals/[dealId]
 * Deletes a deal (soft delete by setting status to 'archived')
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const { dealId } = await params

    // Soft delete by setting status to archived
    const { data: deal, error } = await supabaseServer
      .from("deals")
      .update({ status: "archived" })
      .eq("id", dealId)
      .select()
      .single()

    if (error) {
      console.error("Error archiving deal:", error)
      return NextResponse.json(
        { success: false, error: "Failed to archive deal", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: deal,
      message: "Deal archived successfully",
    })
  } catch (error) {
    console.error("Unexpected error in DELETE /api/deals/[dealId]:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
