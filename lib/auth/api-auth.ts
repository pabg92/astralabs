import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

// E2E testing bypass - matches middleware pattern
const isE2ETesting =
  process.env.E2E_TESTING === "true" || process.env.PLAYWRIGHT_TEST === "true"

// Development mode - auto-provision users to default tenant
const isDevelopment = process.env.NODE_ENV === "development"

// User roles for authorization
export type UserRole = "admin" | "curator" | "user" | "viewer"

export interface AuthenticatedUser {
  userId: string
  tenantId: string
  role: UserRole
  email?: string
}

export interface AuthResult {
  success: true
  user: AuthenticatedUser
}

export interface AuthError {
  success: false
  response: NextResponse
}

export type AuthResponse = AuthResult | AuthError

/**
 * Authenticates the current request and returns user info with tenant
 * Handles E2E testing bypass automatically
 *
 * Usage:
 * ```ts
 * const authResult = await authenticateRequest()
 * if (!authResult.success) return authResult.response
 * const { userId, tenantId, role } = authResult.user
 * ```
 */
export async function authenticateRequest(): Promise<AuthResponse> {
  // E2E testing bypass - return mock user
  if (isE2ETesting) {
    // Get default tenant for E2E tests
    const { data: tenant } = await supabaseServer
      .from("tenants")
      .select("id")
      .limit(1)
      .single()

    return {
      success: true,
      user: {
        userId: "e2e-test-user",
        tenantId: tenant?.id || "00000000-0000-0000-0000-000000000001",
        role: "admin", // E2E tests get admin access
        email: "e2e@test.com",
      },
    }
  }

  // Production: Get Clerk user
  const { userId } = await auth()

  if (!userId) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Unauthorized - please sign in" },
        { status: 401 }
      ),
    }
  }

  // Look up user profile to get tenant and role
  const { data: userProfile, error: profileError } = await supabaseServer
    .from("user_profiles")
    .select("tenant_id, role, email")
    .eq("clerk_user_id", userId)
    .single()

  if (profileError || !userProfile?.tenant_id) {
    // In development, auto-provision user to default tenant
    if (isDevelopment) {
      console.log(`[DEV] Auto-provisioning user ${userId} to default tenant`)

      // Get or create default tenant
      const { data: defaultTenant } = await supabaseServer
        .from("tenants")
        .select("id")
        .limit(1)
        .single()

      if (defaultTenant) {
        // Create user profile with default tenant
        const { error: insertError } = await supabaseServer
          .from("user_profiles")
          .upsert({
            clerk_user_id: userId,
            tenant_id: defaultTenant.id,
            role: "admin", // Dev users get admin for testing
          }, {
            onConflict: "clerk_user_id"
          })

        if (!insertError) {
          return {
            success: true,
            user: {
              userId,
              tenantId: defaultTenant.id,
              role: "admin" as UserRole,
              email: undefined,
            },
          }
        }
        console.error("[DEV] Failed to create user profile:", insertError)
      }
    }

    console.error("User profile lookup failed:", profileError)
    return {
      success: false,
      response: NextResponse.json(
        { error: "User profile not found or missing tenant" },
        { status: 403 }
      ),
    }
  }

  return {
    success: true,
    user: {
      userId,
      tenantId: userProfile.tenant_id,
      role: (userProfile.role as UserRole) || "user",
      email: userProfile.email || undefined,
    },
  }
}

/**
 * Authenticates and requires admin or curator role
 * Use for admin-only endpoints
 */
export async function authenticateAdmin(): Promise<AuthResponse> {
  const authResult = await authenticateRequest()

  if (!authResult.success) {
    return authResult
  }

  const allowedRoles: UserRole[] = ["admin", "curator"]

  if (!allowedRoles.includes(authResult.user.role)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Forbidden - admin access required" },
        { status: 403 }
      ),
    }
  }

  return authResult
}

/**
 * Validates that the authenticated user has access to a specific deal
 * Returns the deal data if access is granted
 */
export async function validateDealAccess(
  user: AuthenticatedUser,
  dealId: string
): Promise<
  | { success: true; deal: { id: string; tenant_id: string } }
  | { success: false; response: NextResponse }
> {
  const { data: deal, error } = await supabaseServer
    .from("deals")
    .select("id, tenant_id")
    .eq("id", dealId)
    .single()

  if (error || !deal) {
    return {
      success: false,
      response: NextResponse.json({ error: "Deal not found" }, { status: 404 }),
    }
  }

  if (deal.tenant_id !== user.tenantId) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Access denied - deal belongs to different tenant" },
        { status: 403 }
      ),
    }
  }

  return { success: true, deal }
}

/**
 * Validates that the authenticated user has access to a specific document
 */
export async function validateDocumentAccess(
  user: AuthenticatedUser,
  documentId: string
): Promise<
  | { success: true; document: { id: string; tenant_id: string; deal_id: string | null } }
  | { success: false; response: NextResponse }
> {
  const { data: document, error } = await supabaseServer
    .from("document_repository")
    .select("id, tenant_id, deal_id")
    .eq("id", documentId)
    .single()

  if (error || !document) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      ),
    }
  }

  if (document.tenant_id !== user.tenantId) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Access denied - document belongs to different tenant" },
        { status: 403 }
      ),
    }
  }

  return { success: true, document }
}

/**
 * Helper to add tenant filter to Supabase queries
 * Ensures multi-tenant isolation
 */
export function withTenantFilter<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  tenantId: string
): T {
  return query.eq("tenant_id", tenantId)
}

/**
 * Standard error response for internal server errors
 * Logs the error but returns sanitized message to client
 */
export function internalError(error: unknown, context: string): NextResponse {
  console.error(`[${context}] Internal error:`, error)
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  )
}
