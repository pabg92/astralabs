import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { generateEmbedding, embeddingToVectorString, createEmbeddingConfig } from '@/lib/sandbox/embedding-service'
import { SANDBOX_THRESHOLDS } from '@/lib/sandbox/matching-service'

interface TestCase {
  id: string
  test_id: string
  input_text: string
  expected_match_clause_id: string | null
  expected_similarity_min: number | null
  expected_similarity_max: number | null
  expected_match_category: string | null
  scenario: string
  description: string | null
  is_active: boolean
}

interface TestResult {
  test_id: string
  scenario: string
  passed: boolean
  input_text: string
  expected: {
    match_clause_id: string | null
    similarity_min: number | null
    similarity_max: number | null
    match_category: string | null
  }
  actual: {
    match_clause_id: string | null
    similarity: number | null
    match_category: string | null
  }
  failure_reasons: string[]
}

/**
 * GET /api/sandbox/test
 * List all test cases
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const scenario = searchParams.get('scenario')
    const active_only = searchParams.get('active_only') !== 'false'

    let query = supabaseServer
      .schema('sandbox')
      .from('test_cases')
      .select('*')
      .order('test_id')

    if (active_only) {
      query = query.eq('is_active', true)
    }

    if (scenario) {
      query = query.eq('scenario', scenario)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch test cases: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0,
    })
  } catch (error) {
    console.error('[GET /api/sandbox/test] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/sandbox/test
 * Run test suite
 * Body: { test_ids?: string[] } - optional filter to run specific tests
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { test_ids } = body

    // Fetch test cases
    let query = supabaseServer
      .schema('sandbox')
      .from('test_cases')
      .select('*')
      .eq('is_active', true)
      .order('test_id')

    if (test_ids && Array.isArray(test_ids) && test_ids.length > 0) {
      query = query.in('test_id', test_ids)
    }

    const { data: testCases, error: fetchError } = await query

    if (fetchError) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch test cases: ${fetchError.message}` },
        { status: 500 }
      )
    }

    if (!testCases || testCases.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          total: 0,
          passed: 0,
          failed: 0,
          results: [],
        },
        message: 'No test cases found',
      })
    }

    const config = createEmbeddingConfig()
    const results: TestResult[] = []
    let passed = 0
    let failed = 0

    // Run each test case
    for (const testCase of testCases as TestCase[]) {
      try {
        // Generate embedding
        const { embedding } = await generateEmbedding(testCase.input_text, config)
        const embeddingString = embeddingToVectorString(embedding)

        // Find similar clauses
        const { data: matches, error: matchError } = await supabaseServer
          .schema('sandbox')
          .rpc('find_similar_clauses', {
            p_query_embedding: embeddingString,
            p_similarity_threshold: 0.0, // Get all matches for testing
            p_max_results: 5,
          })

        if (matchError) {
          results.push({
            test_id: testCase.test_id,
            scenario: testCase.scenario,
            passed: false,
            input_text: testCase.input_text,
            expected: {
              match_clause_id: testCase.expected_match_clause_id,
              similarity_min: testCase.expected_similarity_min,
              similarity_max: testCase.expected_similarity_max,
              match_category: testCase.expected_match_category,
            },
            actual: {
              match_clause_id: null,
              similarity: null,
              match_category: null,
            },
            failure_reasons: [`Match error: ${matchError.message}`],
          })
          failed++
          continue
        }

        const topMatch = matches && matches.length > 0 ? matches[0] : null
        const failureReasons: string[] = []

        // Check expected match clause
        if (testCase.expected_match_clause_id !== null) {
          if (!topMatch || topMatch.clause_id !== testCase.expected_match_clause_id) {
            failureReasons.push(
              `Expected match: ${testCase.expected_match_clause_id}, got: ${topMatch?.clause_id || 'none'}`
            )
          }
        } else if (testCase.scenario === 'novel_clause' && topMatch && topMatch.similarity >= SANDBOX_THRESHOLDS.PARTIAL) {
          failureReasons.push(
            `Expected no match (novel clause), but got ${topMatch.clause_id} with similarity ${topMatch.similarity.toFixed(3)}`
          )
        }

        // Check similarity bounds
        const actualSimilarity = topMatch?.similarity || 0

        if (testCase.expected_similarity_min !== null && actualSimilarity < testCase.expected_similarity_min) {
          failureReasons.push(
            `Similarity ${actualSimilarity.toFixed(3)} below minimum ${testCase.expected_similarity_min}`
          )
        }

        if (testCase.expected_similarity_max !== null && actualSimilarity > testCase.expected_similarity_max) {
          failureReasons.push(
            `Similarity ${actualSimilarity.toFixed(3)} above maximum ${testCase.expected_similarity_max}`
          )
        }

        // Check match category
        if (testCase.expected_match_category !== null && topMatch) {
          if (topMatch.match_category !== testCase.expected_match_category) {
            failureReasons.push(
              `Expected category: ${testCase.expected_match_category}, got: ${topMatch.match_category}`
            )
          }
        }

        const testPassed = failureReasons.length === 0

        results.push({
          test_id: testCase.test_id,
          scenario: testCase.scenario,
          passed: testPassed,
          input_text: testCase.input_text,
          expected: {
            match_clause_id: testCase.expected_match_clause_id,
            similarity_min: testCase.expected_similarity_min,
            similarity_max: testCase.expected_similarity_max,
            match_category: testCase.expected_match_category,
          },
          actual: {
            match_clause_id: topMatch?.clause_id || null,
            similarity: actualSimilarity,
            match_category: topMatch?.match_category || null,
          },
          failure_reasons: failureReasons,
        })

        if (testPassed) {
          passed++
        } else {
          failed++
        }
      } catch (testError) {
        results.push({
          test_id: testCase.test_id,
          scenario: testCase.scenario,
          passed: false,
          input_text: testCase.input_text,
          expected: {
            match_clause_id: testCase.expected_match_clause_id,
            similarity_min: testCase.expected_similarity_min,
            similarity_max: testCase.expected_similarity_max,
            match_category: testCase.expected_match_category,
          },
          actual: {
            match_clause_id: null,
            similarity: null,
            match_category: null,
          },
          failure_reasons: [`Test error: ${testError instanceof Error ? testError.message : String(testError)}`],
        })
        failed++
      }
    }

    // Record test run
    const { data: testRun, error: runError } = await supabaseServer
      .schema('sandbox')
      .from('test_runs')
      .insert({
        total_tests: results.length,
        passed,
        failed,
        results: results as unknown as Record<string, unknown>,
      })
      .select('id')
      .single()

    return NextResponse.json({
      success: true,
      data: {
        run_id: testRun?.id,
        total: results.length,
        passed,
        failed,
        pass_rate: results.length > 0 ? ((passed / results.length) * 100).toFixed(1) + '%' : '0%',
        results,
      },
    })
  } catch (error) {
    console.error('[POST /api/sandbox/test] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/sandbox/test
 * Add or update a test case
 * Body: { test_id, input_text, scenario, expected_match_clause_id?, ... }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      test_id,
      input_text,
      scenario,
      expected_match_clause_id,
      expected_similarity_min,
      expected_similarity_max,
      expected_match_category,
      description,
      is_active = true,
    } = body

    if (!test_id || !input_text || !scenario) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: test_id, input_text, scenario' },
        { status: 400 }
      )
    }

    const validScenarios = ['exact_match', 'near_match', 'variant', 'novel_clause']
    if (!validScenarios.includes(scenario)) {
      return NextResponse.json(
        { success: false, error: `Invalid scenario. Must be one of: ${validScenarios.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseServer
      .schema('sandbox')
      .from('test_cases')
      .upsert({
        test_id,
        input_text,
        scenario,
        expected_match_clause_id: expected_match_clause_id || null,
        expected_similarity_min: expected_similarity_min || null,
        expected_similarity_max: expected_similarity_max || null,
        expected_match_category: expected_match_category || null,
        description: description || null,
        is_active,
      }, { onConflict: 'test_id' })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to save test case: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Test case saved',
    })
  } catch (error) {
    console.error('[PUT /api/sandbox/test] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
