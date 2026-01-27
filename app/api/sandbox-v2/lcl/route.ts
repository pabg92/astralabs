/**
 * LCL (Legal Clause Library - Concepts) API Route
 *
 * GET  - List all LCL concepts
 * POST - Create a new LCL concept
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import type { LCL } from '@/lib/sandbox-v2/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active_only') !== 'false'

    let query = supabaseServer
      .schema('sandbox_v2')
      .from('lcl')
      .select('*')
      .order('concept_code', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching LCL concepts:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data as LCL[],
      count: data?.length || 0,
    })
  } catch (error) {
    console.error('LCL GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { concept_code, category, display_name, description } = body

    if (!concept_code || !category || !display_name) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: concept_code, category, display_name' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseServer
      .schema('sandbox_v2')
      .from('lcl')
      .insert({
        concept_code: concept_code.toUpperCase(),
        category,
        display_name,
        description: description || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: `Concept code '${concept_code}' already exists` },
          { status: 409 }
        )
      }
      console.error('Error creating LCL concept:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data as LCL,
    }, { status: 201 })
  } catch (error) {
    console.error('LCL POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
