import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { generateEmbedding, embeddingToVectorString, createEmbeddingConfig } from '@/lib/sandbox/embedding-service'

/**
 * GET /api/sandbox/escalation
 * Get review queue items
 * Query params: status (pending|approved_new|approved_variant|rejected)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabaseServer
      .schema('sandbox')
      .from('admin_review_queue')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch review queue: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: count || 0,
      pagination: { limit, offset, total: count || 0 },
    })
  } catch (error) {
    console.error('[GET /api/sandbox/escalation] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/sandbox/escalation
 * Resolve a review queue item
 * Body: { id: string, status: string, resolution_notes?: string, create_clause?: { clause_id, clause_type, category?, risk_level? } }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, status, resolution_notes, create_clause } = body

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: id, status' },
        { status: 400 }
      )
    }

    const validStatuses = ['approved_new', 'approved_variant', 'rejected']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // Get the review item first
    const { data: reviewItem, error: fetchError } = await supabaseServer
      .schema('sandbox')
      .from('admin_review_queue')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !reviewItem) {
      return NextResponse.json({ success: false, error: 'Review item not found' }, { status: 404 })
    }

    let created_clause_id: string | null = null

    // If approving as new clause and create_clause is provided, create the clause
    if (status === 'approved_new' && create_clause) {
      const { clause_id, clause_type, category, risk_level } = create_clause

      if (!clause_id || !clause_type) {
        return NextResponse.json(
          { success: false, error: 'create_clause requires clause_id and clause_type' },
          { status: 400 }
        )
      }

      // Generate embedding for the review item's text
      let embeddingString: string | null = null
      try {
        const config = createEmbeddingConfig()
        const { embedding } = await generateEmbedding(reviewItem.input_text, config)
        embeddingString = embeddingToVectorString(embedding)
      } catch (embError) {
        console.warn('[PATCH /api/sandbox/escalation] Failed to generate embedding:', embError)
      }

      // Create the new clause
      const { data: newClause, error: clauseError } = await supabaseServer
        .schema('sandbox')
        .from('legal_clause_library')
        .insert({
          clause_id,
          clause_type,
          category: category || null,
          risk_level: risk_level || 'medium',
          standard_text: reviewItem.input_text,
          embedding: embeddingString,
        })
        .select()
        .single()

      if (clauseError) {
        return NextResponse.json(
          { success: false, error: `Failed to create clause: ${clauseError.message}` },
          { status: 500 }
        )
      }

      created_clause_id = newClause.clause_id
    }

    // If approving as variant, link to matched clause
    if (status === 'approved_variant' && reviewItem.matched_clause_id) {
      // Could create a variant clause with parent_clause_id set
      // For now, just mark as approved
    }

    // Update the review item
    const { data: updatedItem, error: updateError } = await supabaseServer
      .schema('sandbox')
      .from('admin_review_queue')
      .update({
        status,
        resolution_notes: resolution_notes || null,
        created_clause_id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { success: false, error: `Failed to update review item: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: updatedItem,
      created_clause_id,
      message: `Review item ${status.replace('_', ' ')}`,
    })
  } catch (error) {
    console.error('[PATCH /api/sandbox/escalation] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/sandbox/escalation
 * Clear resolved items from the queue
 * Query params: status (optional - only delete items with this status)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabaseServer.schema('sandbox').from('admin_review_queue').delete()

    if (status) {
      query = query.eq('status', status)
    } else {
      // By default, only delete resolved items (not pending)
      query = query.neq('status', 'pending')
    }

    const { error, count } = await query.select('id')

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to clear queue: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Cleared ${count || 0} items from review queue`,
      deleted_count: count || 0,
    })
  } catch (error) {
    console.error('[DELETE /api/sandbox/escalation] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
