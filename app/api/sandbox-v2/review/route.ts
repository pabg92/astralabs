/**
 * Pattern Review Queue API Route
 *
 * GET   - List pending reviews (with filtering)
 * POST  - Create a manual review entry
 * PATCH - Update review status (approve/reject/merge)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import type { PatternReviewEntry, ReviewStatus, ReviewType } from '@/lib/sandbox-v2/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as ReviewStatus | null
    const reviewType = searchParams.get('review_type') as ReviewType | null
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    let query = supabaseServer
      .schema('sandbox_v2')
      .from('pattern_review_queue')
      .select(`
        *,
        lcstx:proposed_lcstx_id (
          variant_code,
          risk_level,
          canonical_text,
          lcl:lcl_id (
            concept_code,
            category
          )
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (reviewType) {
      query = query.eq('review_type', reviewType)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching review queue:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data as (PatternReviewEntry & { lcstx: unknown })[],
      count: count || 0,
      pagination: {
        limit,
        offset,
        total: count || 0,
      },
    })
  } catch (error) {
    console.error('Review GET error:', error)
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
      input_text,
      proposed_lcstx_id,
      similarity_score,
      review_type,
      similar_patterns,
    } = body

    // Validate required fields
    if (!input_text || !review_type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: input_text, review_type' },
        { status: 400 }
      )
    }

    const validReviewTypes = ['new_pattern', 'variant_candidate', 'low_confidence', 'pat_conflict']
    if (!validReviewTypes.includes(review_type)) {
      return NextResponse.json(
        { success: false, error: `Invalid review_type. Must be: ${validReviewTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseServer
      .schema('sandbox_v2')
      .from('pattern_review_queue')
      .insert({
        input_text,
        proposed_lcstx_id: proposed_lcstx_id || null,
        similarity_score: similarity_score || null,
        review_type,
        similar_patterns: similar_patterns || [],
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating review entry:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data as PatternReviewEntry,
    }, { status: 201 })
  } catch (error) {
    console.error('Review POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()

    const { id, status, resolution_notes, resolved_by } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: id' },
        { status: 400 }
      )
    }

    if (!status) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: status' },
        { status: 400 }
      )
    }

    const validStatuses = ['pending', 'approved', 'rejected', 'merged']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {
      status,
      resolution_notes: resolution_notes || null,
      resolved_by: resolved_by || null,
    }

    // Set resolved_at if moving to a terminal status
    if (['approved', 'rejected', 'merged'].includes(status)) {
      updateData.resolved_at = new Date().toISOString()
    }

    const { data, error } = await supabaseServer
      .schema('sandbox_v2')
      .from('pattern_review_queue')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: `Review entry '${id}' not found` },
          { status: 404 }
        )
      }
      console.error('Error updating review entry:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data as PatternReviewEntry,
    })
  } catch (error) {
    console.error('Review PATCH error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
