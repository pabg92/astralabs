/**
 * Test Cases API Route
 *
 * GET  - List all test cases or run the test suite
 * POST - Create a new test case or run tests
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { matchClause } from '@/lib/sandbox-v2/matching-service'
import type {
  TestCase,
  TestRunResult,
  TestSuiteResult,
  MatchRequest,
} from '@/lib/sandbox-v2/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active_only') !== 'false'
    const scenario = searchParams.get('scenario')

    let query = supabaseServer
      .schema('sandbox_v2')
      .from('test_cases')
      .select('*')
      .order('test_id', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (scenario) {
      query = query.eq('scenario', scenario)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching test cases:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data as TestCase[],
      count: data?.length || 0,
    })
  } catch (error) {
    console.error('Test GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Check if this is a run request or create request
    if (body.action === 'run') {
      return await runTestSuite(body.test_ids)
    }

    // Create new test case
    const {
      test_id,
      input_text,
      expected_lcstx_variant_code,
      expected_risk_level,
      expected_rag_library,
      pat_term_category,
      pat_expected_value,
      pat_is_mandatory,
      expected_rag_final,
      scenario,
      description,
    } = body

    // Validate required fields
    if (!test_id || !input_text || !scenario) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: test_id, input_text, scenario' },
        { status: 400 }
      )
    }

    const validScenarios = ['exact_pattern', 'risk_resolution', 'pat_override', 'novel_escalation', 'multi_match']
    if (!validScenarios.includes(scenario)) {
      return NextResponse.json(
        { success: false, error: `Invalid scenario. Must be: ${validScenarios.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseServer
      .schema('sandbox_v2')
      .from('test_cases')
      .insert({
        test_id,
        input_text,
        expected_lcstx_variant_code: expected_lcstx_variant_code || null,
        expected_risk_level: expected_risk_level || null,
        expected_rag_library: expected_rag_library || null,
        pat_term_category: pat_term_category || null,
        pat_expected_value: pat_expected_value || null,
        pat_is_mandatory: pat_is_mandatory ?? null,
        expected_rag_final: expected_rag_final || null,
        scenario,
        description: description || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: `Test ID '${test_id}' already exists` },
          { status: 409 }
        )
      }
      console.error('Error creating test case:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data as TestCase,
    }, { status: 201 })
  } catch (error) {
    console.error('Test POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function runTestSuite(testIds?: string[]): Promise<NextResponse> {
  const startTime = Date.now()

  try {
    // Fetch test cases
    let query = supabaseServer
      .schema('sandbox_v2')
      .from('test_cases')
      .select('*')
      .eq('is_active', true)
      .order('test_id', { ascending: true })

    if (testIds && testIds.length > 0) {
      query = query.in('test_id', testIds)
    }

    const { data: testCases, error } = await query

    if (error) {
      console.error('Error fetching test cases:', error)
      return NextResponse.json(
        { success: false, error: error.message },
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
          duration_ms: Date.now() - startTime,
        } as TestSuiteResult,
      })
    }

    // Run each test
    const results: TestRunResult[] = []

    for (const testCase of testCases as TestCase[]) {
      const result = await runSingleTest(testCase)
      results.push(result)
    }

    const passed = results.filter((r) => r.passed).length
    const failed = results.filter((r) => !r.passed).length

    const suiteResult: TestSuiteResult = {
      total: results.length,
      passed,
      failed,
      results,
      duration_ms: Date.now() - startTime,
    }

    return NextResponse.json({
      success: true,
      data: suiteResult,
    })
  } catch (error) {
    console.error('Test suite error:', error)
    return NextResponse.json(
      { success: false, error: 'Test suite execution failed' },
      { status: 500 }
    )
  }
}

async function runSingleTest(testCase: TestCase): Promise<TestRunResult> {
  try {
    // Build match request
    const matchRequest: MatchRequest = {
      text: testCase.input_text,
      record_result: false, // Don't record test runs
    }

    // Add PAT context if present in test case
    if (testCase.pat_term_category && testCase.pat_expected_value) {
      matchRequest.pat_context = {
        term_category: testCase.pat_term_category,
        expected_value: testCase.pat_expected_value,
        is_mandatory: testCase.pat_is_mandatory ?? true,
      }
    }

    // Execute matching
    const result = await matchClause(matchRequest)

    // Compare results
    const actualVariantCode = result.resolved_match?.variant_code || null
    const actualRiskLevel = result.resolved_match?.risk_level || null

    const passed =
      (testCase.expected_lcstx_variant_code === null || actualVariantCode === testCase.expected_lcstx_variant_code) &&
      (testCase.expected_risk_level === null || actualRiskLevel === testCase.expected_risk_level) &&
      (testCase.expected_rag_library === null || result.rag_library === testCase.expected_rag_library) &&
      (testCase.expected_rag_final === null || result.rag_final === testCase.expected_rag_final)

    return {
      test_id: testCase.test_id,
      passed,
      expected: {
        variant_code: testCase.expected_lcstx_variant_code,
        risk_level: testCase.expected_risk_level,
        rag_library: testCase.expected_rag_library,
        rag_final: testCase.expected_rag_final,
      },
      actual: {
        variant_code: actualVariantCode,
        risk_level: actualRiskLevel,
        rag_library: result.rag_library,
        rag_final: result.rag_final,
      },
    }
  } catch (error) {
    return {
      test_id: testCase.test_id,
      passed: false,
      expected: {
        variant_code: testCase.expected_lcstx_variant_code,
        risk_level: testCase.expected_risk_level,
        rag_library: testCase.expected_rag_library,
        rag_final: testCase.expected_rag_final,
      },
      actual: {
        variant_code: null,
        risk_level: null,
        rag_library: 'RED',
        rag_final: 'RED',
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
