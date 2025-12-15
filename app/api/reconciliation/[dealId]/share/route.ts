import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

type ShareTokenInsert = Database["public"]["Tables"]["share_tokens"]["Insert"]

/**
 * Generate a short alphanumeric token (8 chars)
 */
function generateShortToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

/**
 * Generate a URL-friendly slug from deal name
 */
function generateSlug(dealName: string): string {
  return dealName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')          // Spaces to hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .substring(0, 50)              // Limit length
    .replace(/^-|-$/g, '')         // Trim hyphens from ends
}

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

    // Verify deal exists and get tenant_id + deal_name
    const { data: deal, error: dealError } = await supabaseServer
      .from("deals")
      .select("id, tenant_id, deal_name, talent_name")
      .eq("id", dealId)
      .single()

    if (dealError || !deal) {
      return NextResponse.json(
        { error: "Deal not found", details: dealError?.message },
        { status: 404 }
      )
    }

    // Generate short token and slug
    const shortToken = generateShortToken()
    const dealDisplayName = deal.deal_name || deal.talent_name || 'contract'
    const slug = generateSlug(dealDisplayName)

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

    // Insert share token with custom short ID
    const tokenInsert: ShareTokenInsert = {
      id: shortToken, // Use short token as ID
      deal_id: dealId,
      document_id: document_id || null,
      tenant_id: deal.tenant_id,
      expires_at: expiresAt.toISOString(),
      allowed_actions: allowed_actions,
      branding: {
        ...branding,
        slug: slug, // Store slug for reference
        deal_name: dealDisplayName,
      },
    }

    const { data: token, error: tokenError } = await supabaseServer
      .from("share_tokens")
      .insert(tokenInsert)
      .select()
      .single()

    if (tokenError) {
      // If collision on short token, retry once with new token
      if (tokenError.code === '23505') {
        const retryToken = generateShortToken()
        const retryInsert = { ...tokenInsert, id: retryToken }
        const { data: retryData, error: retryError } = await supabaseServer
          .from("share_tokens")
          .insert(retryInsert)
          .select()
          .single()

        if (retryError) {
          console.error("Error creating share token (retry):", retryError)
          return NextResponse.json(
            { error: "Failed to create share token", details: retryError.message },
            { status: 500 }
          )
        }

        const urlSlug = `${slug}-${retryToken}`
        return NextResponse.json({
          success: true,
          data: {
            token: retryData.id,
            slug: urlSlug,
            expires_at: retryData.expires_at,
          },
        }, { status: 201 })
      }

      console.error("Error creating share token:", tokenError)
      return NextResponse.json(
        { error: "Failed to create share token", details: tokenError.message },
        { status: 500 }
      )
    }

    // Combine slug and token for URL: /review/deal-name-abc12345
    const urlSlug = `${slug}-${shortToken}`

    return NextResponse.json({
      success: true,
      data: {
        token: token.id,
        slug: urlSlug,
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
