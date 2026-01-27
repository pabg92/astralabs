import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { generateEmbedding, embeddingToVectorString, createEmbeddingConfig } from '@/lib/sandbox/embedding-service'

/**
 * GET /api/sandbox/lcl
 * List all clauses in the sandbox LCL
 */
export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from('legal_clause_library')
      .select('*')
      .order('clause_id')

    // Note: We query from public schema and will add sandbox prefix later
    // For now, use raw SQL for sandbox schema
    const { data: sandboxData, error: sandboxError } = await supabaseServer.rpc('get_sandbox_lcl', {})

    // Fallback: direct query to sandbox schema
    if (sandboxError) {
      // Use raw SQL query
      const { data: rawData, error: rawError } = await supabaseServer
        .schema('sandbox')
        .from('legal_clause_library')
        .select('*')
        .order('clause_id')

      if (rawError) {
        return NextResponse.json(
          { success: false, error: `Failed to fetch clauses: ${rawError.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        data: rawData || [],
        count: rawData?.length || 0,
      })
    }

    return NextResponse.json({
      success: true,
      data: sandboxData || [],
      count: sandboxData?.length || 0,
    })
  } catch (error) {
    console.error('[GET /api/sandbox/lcl] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/sandbox/lcl
 * Create a new clause in the sandbox LCL
 * Body: { clause_id, clause_type, standard_text, category?, risk_level?, tags?, metadata? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clause_id, clause_type, standard_text, category, risk_level, parent_clause_id, variation_letter, tags, metadata } = body

    // Validate required fields
    if (!clause_id || !clause_type || !standard_text) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: clause_id, clause_type, standard_text' },
        { status: 400 }
      )
    }

    // Generate embedding for the clause text
    let embeddingString: string | null = null
    try {
      const config = createEmbeddingConfig()
      const { embedding } = await generateEmbedding(standard_text, config)
      embeddingString = embeddingToVectorString(embedding)
    } catch (embError) {
      console.warn('[POST /api/sandbox/lcl] Failed to generate embedding:', embError)
      // Continue without embedding - can be generated later
    }

    // Insert into sandbox schema
    const { data, error } = await supabaseServer
      .schema('sandbox')
      .from('legal_clause_library')
      .insert({
        clause_id,
        clause_type,
        standard_text,
        category: category || null,
        risk_level: risk_level || 'medium',
        parent_clause_id: parent_clause_id || null,
        variation_letter: variation_letter || 'a',
        tags: tags || null,
        metadata: metadata || {},
        embedding: embeddingString,
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/sandbox/lcl] Insert error:', error)
      return NextResponse.json(
        { success: false, error: `Failed to create clause: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      message: embeddingString ? 'Clause created with embedding' : 'Clause created (embedding pending)',
    })
  } catch (error) {
    console.error('[POST /api/sandbox/lcl] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
