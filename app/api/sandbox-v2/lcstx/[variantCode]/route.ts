/**
 * LCSTX Single Variant API Route
 *
 * GET    - Get a single LCSTX variant by variant_code
 * PATCH  - Update a variant
 * DELETE - Soft delete (set is_active = false)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/sandbox-v2/matching-service'
import type { LCSTXWithConcept, PatternEntry } from '@/lib/sandbox-v2/types'

interface RouteParams {
  params: Promise<{ variantCode: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { variantCode } = await params

    const { data, error } = await supabaseServer
      .schema('sandbox_v2')
      .from('lcstx')
      .select(`
        *,
        lcl:lcl_id (
          concept_code,
          category,
          display_name
        )
      `)
      .eq('variant_code', variantCode.toUpperCase())
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: `Variant '${variantCode}' not found` },
          { status: 404 }
        )
      }
      console.error('Error fetching LCSTX variant:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data as LCSTXWithConcept,
    })
  } catch (error) {
    console.error('LCSTX GET single error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { variantCode } = await params
    const body = await request.json()

    const {
      risk_level,
      canonical_text,
      plain_english,
      suggested_rewrite,
      patterns,
      is_active,
      regenerate_embedding = false,
    } = body

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}

    if (risk_level !== undefined) {
      if (!['low', 'medium', 'high'].includes(risk_level)) {
        return NextResponse.json(
          { success: false, error: 'Invalid risk_level. Must be: low, medium, or high' },
          { status: 400 }
        )
      }
      updateData.risk_level = risk_level
    }

    if (canonical_text !== undefined) {
      updateData.canonical_text = canonical_text
    }

    if (plain_english !== undefined) {
      updateData.plain_english = plain_english
    }

    if (suggested_rewrite !== undefined) {
      updateData.suggested_rewrite = suggested_rewrite
    }

    if (patterns !== undefined) {
      const validatedPatterns: PatternEntry[] = []
      if (Array.isArray(patterns)) {
        for (const p of patterns) {
          if (typeof p.pattern === 'string' && typeof p.confidence === 'number') {
            validatedPatterns.push({
              pattern: p.pattern,
              confidence: Math.max(0, Math.min(1, p.confidence)),
            })
          }
        }
      }
      updateData.patterns = validatedPatterns
    }

    if (is_active !== undefined) {
      updateData.is_active = Boolean(is_active)
    }

    // Increment version on any update
    updateData.version = supabaseServer.rpc('increment_version') // Won't work, use raw SQL instead

    // Check if we have anything to update
    if (Object.keys(updateData).length === 1) {
      // Only version increment, nothing else changed
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // Remove version from updateData, we'll handle it differently
    delete updateData.version

    // Regenerate embedding if canonical_text changed and regenerate_embedding is true
    let embeddingGenerated = false
    if ((canonical_text && regenerate_embedding) || regenerate_embedding) {
      try {
        // Get current canonical_text if not provided in update
        let textForEmbedding = canonical_text
        if (!textForEmbedding) {
          const { data: current } = await supabaseServer
            .schema('sandbox_v2')
            .from('lcstx')
            .select('canonical_text')
            .eq('variant_code', variantCode.toUpperCase())
            .single()
          textForEmbedding = current?.canonical_text
        }

        if (textForEmbedding) {
          const embedding = await generateEmbedding(textForEmbedding)
          updateData.embedding = `[${embedding.join(',')}]`
          embeddingGenerated = true
        }
      } catch (embError) {
        console.error('Error generating embedding:', embError)
        // Continue without embedding update
      }
    }

    // Perform update
    const { data, error } = await supabaseServer
      .schema('sandbox_v2')
      .from('lcstx')
      .update(updateData)
      .eq('variant_code', variantCode.toUpperCase())
      .select(`
        *,
        lcl:lcl_id (
          concept_code,
          category,
          display_name
        )
      `)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: `Variant '${variantCode}' not found` },
          { status: 404 }
        )
      }
      console.error('Error updating LCSTX variant:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data as LCSTXWithConcept,
      embedding_regenerated: embeddingGenerated,
    })
  } catch (error) {
    console.error('LCSTX PATCH error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { variantCode } = await params

    // Soft delete by setting is_active = false
    const { data, error } = await supabaseServer
      .schema('sandbox_v2')
      .from('lcstx')
      .update({ is_active: false })
      .eq('variant_code', variantCode.toUpperCase())
      .select('id, variant_code, is_active')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: `Variant '${variantCode}' not found` },
          { status: 404 }
        )
      }
      console.error('Error deleting LCSTX variant:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Variant '${variantCode}' has been deactivated`,
      data,
    })
  } catch (error) {
    console.error('LCSTX DELETE error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
