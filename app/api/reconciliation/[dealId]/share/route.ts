import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

type ShareTokenInsert = Database["public"]["Tables"]["share_tokens"]["Insert"]

/**
 * POST /api/reconciliation/[dealId]/share
 * Generate a shareable read-only token for a deal
 */
export async function POST(
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

    const body = await request.json()
    const {
      document_id = null,
      expires_in_hours = 168, // Default 7 days
      allowed_actions = ["view"],
      branding = {},
    } = body

    // Verify deal exists and get tenant_id
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .select("id, tenant_id")
      .eq("id", dealId)
      .single()

    if (dealError || !deal) {
      return NextResponse.json(
        { error: "Deal not found", details: dealError?.message },
        { status: 404 }
      )
    }

    // If document_id is provided, verify it belongs to this deal
    if (document_id) {
      const { data: document, error: docError } = await supabaseServer
        .from("document_repository")
        .select("id, deal_id")
        .eq("id", document_id)
        .single()

      if (docError || !document) {
        return NextResponse.json(
          { error: "Document not found", details: docError?.message },
          { status: 404 }
        )
      }

      if (document.deal_id !== dealId) {
        return NextResponse.json(
          { error: "Document does not belong to the specified deal" },
          { status: 400 }
        )
      }
    }

    // Validate expires_in_hours (min 1 hour for flexibility, max 30 days, default 7 days)
    // Allows short-lived tokens for demos/testing while capping at 30 days for security
    const validatedExpiresInHours = Math.min(Math.max(expires_in_hours, 1), 720)

    // Calculate expiration timestamp
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + validatedExpiresInHours)

    // Insert share token
    const tokenInsert: ShareTokenInsert = {
      deal_id: dealId,
      document_id: document_id || null,
      tenant_id: deal.tenant_id,
      expires_at: expiresAt.toISOString(),
      allowed_actions: allowed_actions,
      branding: branding,
    }

    const { data: token, error: tokenError } = await supabaseServer
      .from("share_tokens")
      .insert(tokenInsert)
      .select()
      .single()

    if (tokenError) {
      console.error("Error creating share token:", tokenError)
      return NextResponse.json(
        { error: "Failed to create share token", details: tokenError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        token: token.id,
        expires_at: token.expires_at,
      },
    }, { status: 201 })
  } catch (error) {
    console.error("Unexpected error in POST /api/reconciliation/[dealId]/share:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
