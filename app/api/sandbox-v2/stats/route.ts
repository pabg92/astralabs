/**
 * Sandbox Stats API Route
 *
 * GET - Get dashboard statistics
 */

import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import type { SandboxStats } from '@/lib/sandbox-v2/types'

export async function GET() {
  try {
    // Call the stats RPC function
    const { data, error } = await supabaseServer
      .schema('sandbox_v2')
      .rpc('get_sandbox_stats')

    if (error) {
      console.error('Error fetching sandbox stats:', error)

      // If the function doesn't exist, calculate stats manually
      if (error.code === 'PGRST202' || error.message.includes('function')) {
        return await getStatsManually()
      }

      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // RPC returns an array with single row
    const stats = Array.isArray(data) ? data[0] : data

    return NextResponse.json({
      success: true,
      data: stats as SandboxStats,
    })
  } catch (error) {
    console.error('Stats GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function getStatsManually(): Promise<NextResponse> {
  try {
    // Execute all queries in parallel
    const [
      lclResult,
      lcstxResult,
      matchesResult,
      reviewsResult,
      highRiskResult,
      mediumRiskResult,
      lowRiskResult,
      greenResult,
      amberResult,
      redResult,
      escalatedResult,
    ] = await Promise.all([
      supabaseServer.schema('sandbox_v2').from('lcl').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabaseServer.schema('sandbox_v2').from('lcstx').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabaseServer.schema('sandbox_v2').from('match_results').select('id', { count: 'exact', head: true }),
      supabaseServer.schema('sandbox_v2').from('pattern_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseServer.schema('sandbox_v2').from('lcstx').select('id', { count: 'exact', head: true }).eq('risk_level', 'high').eq('is_active', true),
      supabaseServer.schema('sandbox_v2').from('lcstx').select('id', { count: 'exact', head: true }).eq('risk_level', 'medium').eq('is_active', true),
      supabaseServer.schema('sandbox_v2').from('lcstx').select('id', { count: 'exact', head: true }).eq('risk_level', 'low').eq('is_active', true),
      supabaseServer.schema('sandbox_v2').from('match_results').select('id', { count: 'exact', head: true }).eq('rag_final', 'GREEN'),
      supabaseServer.schema('sandbox_v2').from('match_results').select('id', { count: 'exact', head: true }).eq('rag_final', 'AMBER'),
      supabaseServer.schema('sandbox_v2').from('match_results').select('id', { count: 'exact', head: true }).eq('rag_final', 'RED'),
      supabaseServer.schema('sandbox_v2').from('match_results').select('id', { count: 'exact', head: true }).eq('escalation_needed', true),
    ])

    const totalMatches = matchesResult.count || 0
    const escalatedMatches = escalatedResult.count || 0

    const stats: SandboxStats = {
      total_concepts: lclResult.count || 0,
      total_variants: lcstxResult.count || 0,
      total_matches: totalMatches,
      pending_reviews: reviewsResult.count || 0,
      high_risk_variants: highRiskResult.count || 0,
      medium_risk_variants: mediumRiskResult.count || 0,
      low_risk_variants: lowRiskResult.count || 0,
      green_matches: greenResult.count || 0,
      amber_matches: amberResult.count || 0,
      red_matches: redResult.count || 0,
      escalation_rate: totalMatches > 0 ? escalatedMatches / totalMatches : 0,
    }

    return NextResponse.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error('Manual stats error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to calculate stats' },
      { status: 500 }
    )
  }
}
