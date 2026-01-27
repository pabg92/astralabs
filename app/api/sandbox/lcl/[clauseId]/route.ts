import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { generateEmbedding, embeddingToVectorString, createEmbeddingConfig } from '@/lib/sandbox/embedding-service'

interface RouteParams {
  params: Promise<{ clauseId: string }>
}

/**
 * GET /api/sandbox/lcl/[clauseId]
 * Get a single clause by clause_id
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { clauseId } = await params

    const { data, error } = await supabaseServer
      .schema('sandbox')
      .from('legal_clause_library')
      .select('*')
      .eq('clause_id', clauseId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ success: false, error: 'Clause not found' }, { status: 404 })
      }
      return NextResponse.json(
        { success: false, error: `Failed to fetch clause: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[GET /api/sandbox/lcl/[clauseId]] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/sandbox/lcl/[clauseId]
 * Update an existing clause
 * Body: { clause_type?, standard_text?, category?, risk_level?, tags?, metadata? }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { clauseId } = await params
    const body = await request.json()
    const { clause_type, standard_text, category, risk_level, tags, metadata } = body

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (clause_type !== undefined) updates.clause_type = clause_type
    if (category !== undefined) updates.category = category
    if (risk_level !== undefined) updates.risk_level = risk_level
    if (tags !== undefined) updates.tags = tags
    if (metadata !== undefined) updates.metadata = metadata

    // If text changed, regenerate embedding
    if (standard_text !== undefined) {
      updates.standard_text = standard_text

      try {
        const config = createEmbeddingConfig()
        const { embedding } = await generateEmbedding(standard_text, config)
        updates.embedding = embeddingToVectorString(embedding)
      } catch (embError) {
        console.warn('[PATCH /api/sandbox/lcl/[clauseId]] Failed to regenerate embedding:', embError)
      }
    }

    const { data, error } = await supabaseServer
      .schema('sandbox')
      .from('legal_clause_library')
      .update(updates)
      .eq('clause_id', clauseId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ success: false, error: 'Clause not found' }, { status: 404 })
      }
      return NextResponse.json(
        { success: false, error: `Failed to update clause: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      message: standard_text !== undefined ? 'Clause updated with new embedding' : 'Clause updated',
    })
  } catch (error) {
    console.error('[PATCH /api/sandbox/lcl/[clauseId]] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/sandbox/lcl/[clauseId]
 * Delete a clause from the sandbox LCL
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { clauseId } = await params

    const { error } = await supabaseServer
      .schema('sandbox')
      .from('legal_clause_library')
      .delete()
      .eq('clause_id', clauseId)

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to delete clause: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: 'Clause deleted' })
  } catch (error) {
    console.error('[DELETE /api/sandbox/lcl/[clauseId]] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
