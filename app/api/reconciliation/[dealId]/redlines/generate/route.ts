import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import {
  authenticateRequest,
  validateDealAccess,
  internalError,
} from "@/lib/auth/api-auth"
import type { Database } from "@/types/database"

type ClauseRedlineInsert = Database["public"]["Tables"]["clause_redlines"]["Insert"]

// Configuration
const AI_MODEL = "gpt-4o-mini" // Fast, cheap model for redline generation
const MAX_RETRIES = 2
const TIMEOUT_MS = 15000 // 15 seconds - gpt-4o-mini is fast

/**
 * POST /api/reconciliation/[dealId]/redlines/generate
 * Generate an AI-suggested redline for a clause based on pre-agreed terms
 * Requires authentication and tenant access
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

    // Validate deal access
    const dealAccess = await validateDealAccess(authResult.user, dealId)
    if (!dealAccess.success) return dealAccess.response

    const { tenantId } = authResult.user

    const body = await request.json()
    const {
      clause_boundary_id,
      clause_text,
      term_description,
      expected_value,
      term_category,
    } = body

    // Validate required fields
    if (!clause_boundary_id || !clause_text) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: "clause_boundary_id and clause_text are required",
        },
        { status: 400 }
      )
    }

    // Verify clause_boundary exists and belongs to this deal
    const { data: clause, error: clauseError } = await supabaseServer
      .from("clause_boundaries")
      .select("id, document_id, document_repository!inner(deal_id)")
      .eq("id", clause_boundary_id)
      .single()

    if (clauseError || !clause) {
      return NextResponse.json(
        { error: "Clause boundary not found", details: clauseError?.message },
        { status: 404 }
      )
    }

    const clauseDealId = (clause.document_repository as { deal_id?: string } | null)?.deal_id
    if (clauseDealId !== dealId) {
      return NextResponse.json(
        { error: "Clause boundary does not belong to the specified deal" },
        { status: 400 }
      )
    }

    // Get OpenAI API key from environment
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      console.error("OPENAI_API_KEY not configured")
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 }
      )
    }

    // Build prompt for redline generation (different prompts based on whether PAT context exists)
    const hasPATContext = !!(term_description || expected_value)

    const systemPrompt = hasPATContext
      ? `You are a contract editor specializing in influencer and talent agreements. Your task is to revise contract clauses to align with pre-agreed terms while maintaining legal validity.

Guidelines:
- Make minimal changes necessary to align with the pre-agreed term
- Preserve the original legal structure and language style
- Be precise with numbers, dates, and specific terms
- Output ONLY the revised clause text, nothing else`
      : `You are a contract editor specializing in influencer and talent agreements. Your task is to review contract clauses and suggest improvements for clarity, fairness, and industry best practices.

Guidelines:
- Identify potentially problematic or one-sided terms
- Suggest balanced language that protects both parties
- Improve clarity and remove ambiguity where possible
- Preserve the original intent and legal structure
- Output ONLY the revised clause text, nothing else`

    const userPrompt = buildUserPrompt(clause_text, term_description, expected_value, term_category, hasPATContext)

    // Call OpenAI API with retry logic
    let proposedText: string | null = null
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.3, // Lower temperature for more consistent output
            max_tokens: 1000,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorBody = await response.text()
          throw new Error(`OpenAI API error ${response.status}: ${errorBody}`)
        }

        const data = await response.json()
        console.log("OpenAI response:", JSON.stringify(data, null, 2))

        // Handle different response formats
        proposedText = data.choices?.[0]?.message?.content?.trim()
          || data.output?.[0]?.content?.[0]?.text?.trim() // Alternative format
          || null

        if (proposedText) {
          break // Success
        } else {
          console.warn("No content in AI response:", data)
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        console.warn(`AI generation attempt ${attempt + 1} failed:`, lastError.message)

        // Don't retry on abort (timeout)
        if (lastError.name === "AbortError") {
          break
        }

        // Wait before retry (exponential backoff)
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
        }
      }
    }

    if (!proposedText) {
      console.error("AI generation failed after retries:", lastError)
      return NextResponse.json(
        {
          error: "Failed to generate suggestion",
          details: lastError?.message || "AI service unavailable",
        },
        { status: 503 }
      )
    }

    // Insert the generated redline as a draft
    const redlineInsert: ClauseRedlineInsert = {
      clause_boundary_id,
      change_type: "modify",
      proposed_text: proposedText,
      status: "draft",
      author_id: null, // System-generated (no human author)
      tenant_id: tenantId,
    }

    const { data: redline, error: insertError } = await supabaseServer
      .from("clause_redlines")
      .insert(redlineInsert)
      .select()
      .single()

    if (insertError) {
      console.error("Error inserting generated redline:", insertError)
      return NextResponse.json(
        { error: "Failed to save suggestion", details: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: redline,
      },
      { status: 201 }
    )
  } catch (error) {
    return internalError(error, "POST /api/reconciliation/[dealId]/redlines/generate")
  }
}

/**
 * Build the user prompt for redline generation
 */
function buildUserPrompt(
  clauseText: string,
  termDescription?: string,
  expectedValue?: string,
  termCategory?: string,
  hasPATContext?: boolean
): string {
  let prompt = `Current Contract Clause:\n${clauseText}\n\n`

  if (termCategory) {
    prompt += `Clause Category: ${termCategory}\n\n`
  }

  if (hasPATContext) {
    // With PAT context - align with pre-agreed terms
    if (termDescription) {
      prompt += `Pre-Agreed Term:\n${termDescription}\n\n`
    }

    if (expectedValue) {
      prompt += `Expected Value: ${expectedValue}\n\n`
    }

    prompt += `Revise the clause to align with the pre-agreed term. Output only the revised clause text.`
  } else {
    // Without PAT context - general improvement suggestions
    prompt += `Review this clause and suggest improvements for:
- Clarity and readability
- Fairness to both parties
- Industry standard practices for influencer/talent agreements
- Removing ambiguous or problematic language

Output only the revised clause text.`
  }

  return prompt
}
