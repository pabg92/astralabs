import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * GET /api/sandbox/stats
 * Get sandbox statistics for the dashboard
 */
export async function GET() {
  try {
    // Get clause counts
    const { count: totalClauses } = await supabaseServer
      .schema('sandbox')
      .from('legal_clause_library')
      .select('*', { count: 'exact', head: true })

    const { count: withEmbeddings } = await supabaseServer
      .schema('sandbox')
      .from('legal_clause_library')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null)

    // Get clause type distribution
    const { data: clauseTypes } = await supabaseServer
      .schema('sandbox')
      .from('legal_clause_library')
      .select('clause_type')

    const typeDistribution: Record<string, number> = {}
    if (clauseTypes) {
      for (const item of clauseTypes) {
        const type = item.clause_type || 'unknown'
        typeDistribution[type] = (typeDistribution[type] || 0) + 1
      }
    }

    // Get category distribution
    const { data: categories } = await supabaseServer
      .schema('sandbox')
      .from('legal_clause_library')
      .select('category')

    const categoryDistribution: Record<string, number> = {}
    if (categories) {
      for (const item of categories) {
        const cat = item.category || 'uncategorized'
        categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1
      }
    }

    // Get pending reviews count
    const { count: pendingReviews } = await supabaseServer
      .schema('sandbox')
      .from('admin_review_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    // Get match results count
    const { count: matchResults } = await supabaseServer
      .schema('sandbox')
      .from('clause_match_results')
      .select('*', { count: 'exact', head: true })

    // Get test case counts
    const { count: totalTests } = await supabaseServer
      .schema('sandbox')
      .from('test_cases')
      .select('*', { count: 'exact', head: true })

    const { count: activeTests } = await supabaseServer
      .schema('sandbox')
      .from('test_cases')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    // Get latest test run
    const { data: latestRun } = await supabaseServer
      .schema('sandbox')
      .from('test_runs')
      .select('*')
      .order('run_at', { ascending: false })
      .limit(1)
      .single()

    // Get match category distribution from results
    const { data: matchCategoryData } = await supabaseServer
      .schema('sandbox')
      .from('clause_match_results')
      .select('match_category')

    const matchCategoryDistribution: Record<string, number> = {}
    if (matchCategoryData) {
      for (const item of matchCategoryData) {
        const cat = item.match_category || 'unknown'
        matchCategoryDistribution[cat] = (matchCategoryDistribution[cat] || 0) + 1
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        lcl: {
          total_clauses: totalClauses || 0,
          with_embeddings: withEmbeddings || 0,
          missing_embeddings: (totalClauses || 0) - (withEmbeddings || 0),
          type_distribution: Object.entries(typeDistribution).map(([type, count]) => ({ type, count })),
          category_distribution: Object.entries(categoryDistribution).map(([category, count]) => ({
            category,
            count,
          })),
        },
        review_queue: {
          pending: pendingReviews || 0,
        },
        matching: {
          total_results: matchResults || 0,
          category_distribution: Object.entries(matchCategoryDistribution).map(([category, count]) => ({
            category,
            count,
          })),
        },
        testing: {
          total_cases: totalTests || 0,
          active_cases: activeTests || 0,
          latest_run: latestRun
            ? {
                run_at: latestRun.run_at,
                total: latestRun.total_tests,
                passed: latestRun.passed,
                failed: latestRun.failed,
                pass_rate:
                  latestRun.total_tests > 0
                    ? ((latestRun.passed / latestRun.total_tests) * 100).toFixed(1) + '%'
                    : '0%',
              }
            : null,
        },
      },
    })
  } catch (error) {
    console.error('[GET /api/sandbox/stats] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
