/**
 * LCSTX (Legal Clause Standardization - Meanings + Patterns) API Route
 *
 * GET  - List all LCSTX variants (with optional filtering)
 * POST - Create a new LCSTX variant
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/sandbox-v2/matching-service'
import type { LCSTX, LCSTXWithConcept, RiskLevel, PatternEntry } from '@/lib/sandbox-v2/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active_only') !== 'false'
    const lclId = searchParams.get('lcl_id')
    const conceptCode = searchParams.get('concept_code')
    const riskLevel = searchParams.get('risk_level') as RiskLevel | null

    let query = supabaseServer
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
      .order('variant_code', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (lclId) {
      query = query.eq('lcl_id', lclId)
    }

    if (riskLevel) {
      query = query.eq('risk_level', riskLevel)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching LCSTX variants:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Filter by concept_code if provided (requires post-filtering since it's in joined table)
    let filteredData = data
    if (conceptCode) {
      filteredData = data?.filter(
        (item) => (item.lcl as { concept_code: string })?.concept_code === conceptCode
      )
    }

    return NextResponse.json({
      success: true,
      data: filteredData as LCSTXWithConcept[],
      count: filteredData?.length || 0,
    })
  } catch (error) {
    console.error('LCSTX GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      lcl_id,
      variant_code,
      risk_level,
      canonical_text,
      plain_english,
      suggested_rewrite,
      patterns,
      generate_embedding = true,
    } = body

    // Validate required fields
    if (!lcl_id || !variant_code || !risk_level || !canonical_text) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: lcl_id, variant_code, risk_level, canonical_text',
        },
        { status: 400 }
      )
    }

    // Validate risk_level
    if (!['low', 'medium', 'high'].includes(risk_level)) {
      return NextResponse.json(
        { success: false, error: 'Invalid risk_level. Must be: low, medium, or high' },
        { status: 400 }
      )
    }

    // Validate patterns format
    const validatedPatterns: PatternEntry[] = []
    if (patterns && Array.isArray(patterns)) {
      for (const p of patterns) {
        if (typeof p.pattern === 'string' && typeof p.confidence === 'number') {
          validatedPatterns.push({
            pattern: p.pattern,
            confidence: Math.max(0, Math.min(1, p.confidence)),
          })
        }
      }
    }

    // Generate embedding if requested
    let embedding: number[] | null = null
    if (generate_embedding) {
      try {
        embedding = await generateEmbedding(canonical_text)
      } catch (embError) {
        console.error('Error generating embedding:', embError)
        // Continue without embedding - it can be generated later
      }
    }

    // Insert the variant
    const insertData: Record<string, unknown> = {
      lcl_id,
      variant_code: variant_code.toUpperCase(),
      risk_level,
      canonical_text,
      plain_english: plain_english || null,
      suggested_rewrite: suggested_rewrite || null,
      patterns: validatedPatterns,
      is_active: true,
      version: 1,
    }

    // Add embedding if generated
    if (embedding) {
      insertData.embedding = `[${embedding.join(',')}]`
    }

    const { data, error } = await supabaseServer
      .schema('sandbox_v2')
      .from('lcstx')
      .insert(insertData)
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
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: `Variant code '${variant_code}' already exists` },
          { status: 409 }
        )
      }
      if (error.code === '23503') {
        return NextResponse.json(
          { success: false, error: `LCL concept with id '${lcl_id}' does not exist` },
          { status: 400 }
        )
      }
      console.error('Error creating LCSTX variant:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data as LCSTXWithConcept,
      embedding_generated: !!embedding,
    }, { status: 201 })
  } catch (error) {
    console.error('LCSTX POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
