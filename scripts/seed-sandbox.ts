#!/usr/bin/env node
/**
 * Seed the Contract Buddy LCL Sandbox with synthetic test data
 *
 * Creates:
 * - ~40 synthetic LCL clauses with embeddings
 * - Test cases with expected outcomes
 *
 * Usage:
 *   npx ts-node scripts/seed-sandbox.ts
 *   # or with pnpm:
 *   pnpm tsx scripts/seed-sandbox.ts
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// ============================================================================
// SYNTHETIC LCL CLAUSES
// ============================================================================

interface LCLClause {
  clause_id: string
  clause_type: string
  category: string
  standard_text: string
  risk_level: 'low' | 'medium' | 'high'
  parent_clause_id?: string
  variation_letter?: string
}

const SYNTHETIC_CLAUSES: LCLClause[] = [
  // PAYMENT TERMS (7 clauses)
  {
    clause_id: 'LC-PAY-001-a',
    clause_type: 'payment_terms',
    category: 'Payment',
    standard_text:
      'Payment shall be made within thirty (30) days of receipt of a valid invoice by the Brand.',
    risk_level: 'low',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-PAY-001-b',
    clause_type: 'payment_terms',
    category: 'Payment',
    standard_text:
      'All payments will be processed within 30 calendar days following invoice submission and approval.',
    risk_level: 'low',
    parent_clause_id: 'LC-PAY-001-a',
    variation_letter: 'b',
  },
  {
    clause_id: 'LC-PAY-002-a',
    clause_type: 'payment_terms',
    category: 'Payment',
    standard_text:
      'Payment shall be made within fifteen (15) business days of content delivery and approval.',
    risk_level: 'low',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-PAY-003-a',
    clause_type: 'payment_terms',
    category: 'Payment',
    standard_text:
      'Total compensation shall be paid in two installments: 50% upon signing and 50% upon content delivery.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-PAY-004-a',
    clause_type: 'late_payment',
    category: 'Payment',
    standard_text:
      'Late payments shall incur interest at a rate of 1.5% per month on the outstanding balance.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-PAY-005-a',
    clause_type: 'payment_method',
    category: 'Payment',
    standard_text:
      'All payments shall be made via wire transfer to the bank account specified by the Talent.',
    risk_level: 'low',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-PAY-005-b',
    clause_type: 'payment_method',
    category: 'Payment',
    standard_text:
      'Payments will be processed through direct bank deposit or PayPal, as specified by the Creator.',
    risk_level: 'low',
    parent_clause_id: 'LC-PAY-005-a',
    variation_letter: 'b',
  },

  // EXCLUSIVITY (5 clauses)
  {
    clause_id: 'LC-EXC-001-a',
    clause_type: 'exclusivity',
    category: 'Exclusivity',
    standard_text:
      'During the Term, Talent shall not promote, endorse, or appear in advertising for any competing products or services in the same category.',
    risk_level: 'high',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-EXC-001-b',
    clause_type: 'exclusivity',
    category: 'Exclusivity',
    standard_text:
      'Talent agrees to exclusive promotion rights for the Brand and shall refrain from any competing endorsements during the contract period.',
    risk_level: 'high',
    parent_clause_id: 'LC-EXC-001-a',
    variation_letter: 'b',
  },
  {
    clause_id: 'LC-EXC-002-a',
    clause_type: 'exclusivity',
    category: 'Exclusivity',
    standard_text:
      'Exclusivity applies only to direct competitors as mutually agreed upon and listed in Schedule A.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-EXC-003-a',
    clause_type: 'non_compete',
    category: 'Exclusivity',
    standard_text:
      'For a period of six (6) months following the Term, Talent shall not endorse competing products without prior written consent.',
    risk_level: 'high',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-EXC-004-a',
    clause_type: 'category_exclusivity',
    category: 'Exclusivity',
    standard_text:
      'Exclusivity is limited to the skincare and beauty category and does not extend to other product categories.',
    risk_level: 'medium',
    variation_letter: 'a',
  },

  // INTELLECTUAL PROPERTY (5 clauses)
  {
    clause_id: 'LC-IP-001-a',
    clause_type: 'ip_ownership',
    category: 'Intellectual Property',
    standard_text:
      'All content created under this Agreement shall be the exclusive property of the Brand in perpetuity.',
    risk_level: 'high',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-IP-001-b',
    clause_type: 'ip_ownership',
    category: 'Intellectual Property',
    standard_text:
      'Brand shall own all rights, title, and interest in the Content, including all intellectual property rights therein.',
    risk_level: 'high',
    parent_clause_id: 'LC-IP-001-a',
    variation_letter: 'b',
  },
  {
    clause_id: 'LC-IP-002-a',
    clause_type: 'ip_license',
    category: 'Intellectual Property',
    standard_text:
      'Talent grants Brand a non-exclusive, worldwide license to use the Content for marketing purposes for a period of two (2) years.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-IP-003-a',
    clause_type: 'usage_rights',
    category: 'Intellectual Property',
    standard_text:
      'Content may be used across all digital platforms including social media, website, email marketing, and paid advertising.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-IP-004-a',
    clause_type: 'moral_rights',
    category: 'Intellectual Property',
    standard_text:
      'Talent waives any moral rights in the Content to the fullest extent permitted by applicable law.',
    risk_level: 'high',
    variation_letter: 'a',
  },

  // DELIVERABLES (7 clauses)
  {
    clause_id: 'LC-DEL-001-a',
    clause_type: 'deliverables',
    category: 'Deliverables',
    standard_text:
      'Talent shall produce and deliver three (3) Instagram posts and two (2) Instagram Stories as specified in the Content Brief.',
    risk_level: 'low',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-DEL-001-b',
    clause_type: 'deliverables',
    category: 'Deliverables',
    standard_text:
      'Creator agrees to produce 3 feed posts and 2 Story sequences for Instagram, following the approved creative brief.',
    risk_level: 'low',
    parent_clause_id: 'LC-DEL-001-a',
    variation_letter: 'b',
  },
  {
    clause_id: 'LC-DEL-002-a',
    clause_type: 'deliverables',
    category: 'Deliverables',
    standard_text:
      'Deliverables shall include one (1) YouTube video with a minimum duration of 60 seconds featuring the Product.',
    risk_level: 'low',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-DEL-003-a',
    clause_type: 'content_approval',
    category: 'Deliverables',
    standard_text:
      'All Content must be submitted for Brand approval at least five (5) business days prior to the scheduled posting date.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-DEL-004-a',
    clause_type: 'revisions',
    category: 'Deliverables',
    standard_text:
      'Brand shall be entitled to two (2) rounds of revisions at no additional cost. Further revisions may be charged at $500 per round.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-DEL-005-a',
    clause_type: 'posting_schedule',
    category: 'Deliverables',
    standard_text:
      'Content shall be posted according to the schedule provided in Exhibit B, with a tolerance of plus or minus 24 hours.',
    risk_level: 'low',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-DEL-006-a',
    clause_type: 'content_retention',
    category: 'Deliverables',
    standard_text:
      'Talent agrees to keep posted Content live on their social media platforms for a minimum period of ninety (90) days.',
    risk_level: 'medium',
    variation_letter: 'a',
  },

  // TERMINATION (4 clauses)
  {
    clause_id: 'LC-TRM-001-a',
    clause_type: 'termination',
    category: 'Termination',
    standard_text:
      'Either party may terminate this Agreement with thirty (30) days written notice for any reason.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-TRM-002-a',
    clause_type: 'termination_for_cause',
    category: 'Termination',
    standard_text:
      'This Agreement may be terminated immediately upon material breach by either party that remains uncured for fifteen (15) days after written notice.',
    risk_level: 'high',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-TRM-003-a',
    clause_type: 'termination_effects',
    category: 'Termination',
    standard_text:
      'Upon termination, all unpaid amounts for completed work shall become immediately due and payable.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-TRM-004-a',
    clause_type: 'morality_clause',
    category: 'Termination',
    standard_text:
      'Brand may terminate this Agreement immediately if Talent engages in conduct that brings the Brand into public disrepute or scandal.',
    risk_level: 'high',
    variation_letter: 'a',
  },

  // CONFIDENTIALITY (4 clauses)
  {
    clause_id: 'LC-CNF-001-a',
    clause_type: 'confidentiality',
    category: 'Confidentiality',
    standard_text:
      'Both parties agree to maintain the confidentiality of all non-public information disclosed during the term of this Agreement.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-CNF-001-b',
    clause_type: 'confidentiality',
    category: 'Confidentiality',
    standard_text:
      'Confidential information shall be protected and not disclosed to third parties without prior written consent.',
    risk_level: 'medium',
    parent_clause_id: 'LC-CNF-001-a',
    variation_letter: 'b',
  },
  {
    clause_id: 'LC-CNF-002-a',
    clause_type: 'nda',
    category: 'Confidentiality',
    standard_text:
      'Talent shall not disclose the financial terms of this Agreement to any third party without Brand\'s prior written consent.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-CNF-003-a',
    clause_type: 'confidentiality_duration',
    category: 'Confidentiality',
    standard_text:
      'Confidentiality obligations shall survive termination of this Agreement for a period of three (3) years.',
    risk_level: 'low',
    variation_letter: 'a',
  },

  // FTC COMPLIANCE (3 clauses)
  {
    clause_id: 'LC-FTC-001-a',
    clause_type: 'ftc_disclosure',
    category: 'Compliance',
    standard_text:
      'Talent shall include appropriate FTC disclosure (e.g., #ad, #sponsored) in all Content as required by applicable law and FTC guidelines.',
    risk_level: 'high',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-FTC-002-a',
    clause_type: 'compliance',
    category: 'Compliance',
    standard_text:
      'All Content must comply with applicable advertising laws, regulations, and platform community guidelines.',
    risk_level: 'high',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-FTC-003-a',
    clause_type: 'claims',
    category: 'Compliance',
    standard_text:
      'Talent shall not make any false or misleading claims about the Product. All claims must be truthful and substantiated.',
    risk_level: 'high',
    variation_letter: 'a',
  },

  // TERM/DURATION (4 clauses)
  {
    clause_id: 'LC-DUR-001-a',
    clause_type: 'term',
    category: 'Term',
    standard_text:
      'This Agreement shall commence on the Effective Date and continue for a period of six (6) months unless earlier terminated.',
    risk_level: 'low',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-DUR-001-b',
    clause_type: 'term',
    category: 'Term',
    standard_text:
      'The term of this Agreement is 6 months from signing, with automatic renewal for successive one-month periods unless notice is given.',
    risk_level: 'medium',
    parent_clause_id: 'LC-DUR-001-a',
    variation_letter: 'b',
  },
  {
    clause_id: 'LC-DUR-002-a',
    clause_type: 'campaign_period',
    category: 'Term',
    standard_text:
      'The Campaign Period shall run from January 1, 2026 through March 31, 2026.',
    risk_level: 'low',
    variation_letter: 'a',
  },
  {
    clause_id: 'LC-DUR-003-a',
    clause_type: 'renewal',
    category: 'Term',
    standard_text:
      'This Agreement shall automatically renew for successive one-year terms unless either party provides 60 days written notice of non-renewal.',
    risk_level: 'medium',
    variation_letter: 'a',
  },
]

// ============================================================================
// TEST CASES
// ============================================================================

interface TestCase {
  test_id: string
  input_text: string
  expected_match_clause_id: string | null
  expected_similarity_min: number | null
  expected_similarity_max: number | null
  expected_match_category: string | null
  scenario: 'exact_match' | 'near_match' | 'variant' | 'novel_clause'
  description: string
}

const TEST_CASES: TestCase[] = [
  // EXACT MATCH TESTS
  {
    test_id: 'TC-001',
    input_text:
      'Payment shall be made within thirty (30) days of receipt of a valid invoice by the Brand.',
    expected_match_clause_id: 'LC-PAY-001-a',
    expected_similarity_min: 0.95,
    expected_similarity_max: null,
    expected_match_category: 'auto_merge',
    scenario: 'exact_match',
    description: 'Exact payment terms match',
  },
  {
    test_id: 'TC-002',
    input_text:
      'During the Term, Talent shall not promote, endorse, or appear in advertising for any competing products or services in the same category.',
    expected_match_clause_id: 'LC-EXC-001-a',
    expected_similarity_min: 0.95,
    expected_similarity_max: null,
    expected_match_category: 'auto_merge',
    scenario: 'exact_match',
    description: 'Exact exclusivity clause match',
  },

  // NEAR MATCH TESTS
  {
    test_id: 'TC-003',
    input_text: 'Payment will be made within 30 days of invoice receipt.',
    expected_match_clause_id: 'LC-PAY-001-a',
    expected_similarity_min: 0.85,
    expected_similarity_max: 0.95,
    expected_match_category: 'review_required',
    scenario: 'near_match',
    description: 'Similar payment terms with different wording',
  },
  {
    test_id: 'TC-004',
    input_text:
      'Talent agrees not to endorse or promote any competing brands during the contract period.',
    expected_match_clause_id: 'LC-EXC-001-a',
    expected_similarity_min: 0.75,
    expected_similarity_max: 0.92,
    expected_match_category: null, // Could be similar or review_required
    scenario: 'near_match',
    description: 'Similar exclusivity clause with paraphrased wording',
  },
  {
    test_id: 'TC-005',
    input_text:
      'All content created shall become the exclusive intellectual property of the Brand.',
    expected_match_clause_id: 'LC-IP-001-a',
    expected_similarity_min: 0.75,
    expected_similarity_max: 0.92,
    expected_match_category: null,
    scenario: 'near_match',
    description: 'Similar IP ownership clause',
  },

  // VARIANT TESTS
  {
    test_id: 'TC-006',
    input_text:
      'Payments are due net 30 days from the date of an approved invoice submission by the Influencer.',
    expected_match_clause_id: 'LC-PAY-001-a',
    expected_similarity_min: 0.75,
    expected_similarity_max: 0.88,
    expected_match_category: null,
    scenario: 'variant',
    description: 'Payment terms variant - different phrasing, same meaning',
  },
  {
    test_id: 'TC-007',
    input_text:
      'Creator shall deliver 3 Instagram feed posts and 2 Instagram Story sets according to the creative brief.',
    expected_match_clause_id: 'LC-DEL-001-a',
    expected_similarity_min: 0.75,
    expected_similarity_max: 0.92,
    expected_match_category: null,
    scenario: 'variant',
    description: 'Deliverables variant - similar structure',
  },
  {
    test_id: 'TC-008',
    input_text:
      'Confidential information shared between the parties must be kept secret and not disclosed.',
    expected_match_clause_id: 'LC-CNF-001-a',
    expected_similarity_min: 0.70,
    expected_similarity_max: 0.88,
    expected_match_category: null,
    scenario: 'variant',
    description: 'Confidentiality variant - simplified wording',
  },

  // NOVEL CLAUSE TESTS
  {
    test_id: 'TC-009',
    input_text:
      'Talent shall be entitled to a 10% royalty on all merchandise sales featuring their likeness.',
    expected_match_clause_id: null,
    expected_similarity_min: null,
    expected_similarity_max: 0.60,
    expected_match_category: 'unique',
    scenario: 'novel_clause',
    description: 'Novel royalty clause - not in library',
  },
  {
    test_id: 'TC-010',
    input_text:
      'In the event of a global pandemic, either party may suspend performance without penalty for up to 90 days.',
    expected_match_clause_id: null,
    expected_similarity_min: null,
    expected_similarity_max: 0.60,
    expected_match_category: 'unique',
    scenario: 'novel_clause',
    description: 'Novel force majeure clause - pandemic specific',
  },
  {
    test_id: 'TC-011',
    input_text:
      'Brand agrees to provide Talent with one (1) round-trip business class flight for any in-person filming.',
    expected_match_clause_id: null,
    expected_similarity_min: null,
    expected_similarity_max: 0.60,
    expected_match_category: 'unique',
    scenario: 'novel_clause',
    description: 'Novel travel provision - not in library',
  },
  {
    test_id: 'TC-012',
    input_text:
      'Talent retains the right to repurpose Content for their portfolio after the usage license expires.',
    expected_match_clause_id: null,
    expected_similarity_min: null,
    expected_similarity_max: 0.65,
    expected_match_category: null,
    scenario: 'novel_clause',
    description: 'Novel content repurposing clause',
  },

  // CATEGORY CROSSOVER TESTS
  {
    test_id: 'TC-013',
    input_text:
      'Talent must include #ad disclosure in all sponsored posts as required by FTC regulations.',
    expected_match_clause_id: 'LC-FTC-001-a',
    expected_similarity_min: 0.75,
    expected_similarity_max: null,
    expected_match_category: null,
    scenario: 'near_match',
    description: 'FTC disclosure requirement - similar to base',
  },
  {
    test_id: 'TC-014',
    input_text: 'This Agreement will be in effect for a period of 6 months from the signing date.',
    expected_match_clause_id: 'LC-DUR-001-a',
    expected_similarity_min: 0.75,
    expected_similarity_max: null,
    expected_match_category: null,
    scenario: 'near_match',
    description: 'Term clause - similar duration',
  },
  {
    test_id: 'TC-015',
    input_text:
      'Either party can end this Agreement by giving 30 days prior written notice to the other.',
    expected_match_clause_id: 'LC-TRM-001-a',
    expected_similarity_min: 0.75,
    expected_similarity_max: null,
    expected_match_category: null,
    scenario: 'near_match',
    description: 'Termination clause - similar terms',
  },
]

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: text.substring(0, 2000),
      dimensions: 1024,
      encoding_format: 'float',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

function embeddingToVectorString(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function seedSandbox() {
  console.log('🌱 Seeding Contract Buddy LCL Sandbox...\n')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY')
  }

  if (!openaiApiKey) {
    throw new Error('Missing OPENAI_API_KEY')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Clear existing sandbox data
  console.log('🧹 Clearing existing sandbox data...')
  await supabase.schema('sandbox').from('test_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.schema('sandbox').from('test_cases').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.schema('sandbox').from('clause_match_results').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.schema('sandbox').from('admin_review_queue').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.schema('sandbox').from('legal_clause_library').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // Insert LCL clauses with embeddings
  console.log(`\n📚 Inserting ${SYNTHETIC_CLAUSES.length} LCL clauses with embeddings...\n`)

  let insertedClauses = 0
  let failedClauses = 0

  for (let i = 0; i < SYNTHETIC_CLAUSES.length; i++) {
    const clause = SYNTHETIC_CLAUSES[i]
    process.stdout.write(`  [${i + 1}/${SYNTHETIC_CLAUSES.length}] ${clause.clause_id}... `)

    try {
      // Generate embedding
      const embedding = await generateEmbedding(clause.standard_text, openaiApiKey)
      const embeddingString = embeddingToVectorString(embedding)

      // Insert clause
      const { error } = await supabase.schema('sandbox').from('legal_clause_library').insert({
        clause_id: clause.clause_id,
        clause_type: clause.clause_type,
        category: clause.category,
        standard_text: clause.standard_text,
        risk_level: clause.risk_level,
        parent_clause_id: clause.parent_clause_id || null,
        variation_letter: clause.variation_letter || 'a',
        embedding: embeddingString,
      })

      if (error) {
        console.log(`❌ ${error.message}`)
        failedClauses++
      } else {
        console.log('✅')
        insertedClauses++
      }

      // Rate limiting - pause briefly between API calls
      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : String(err)}`)
      failedClauses++
    }
  }

  console.log(`\n📊 LCL Summary: ${insertedClauses} inserted, ${failedClauses} failed\n`)

  // Insert test cases
  console.log(`📋 Inserting ${TEST_CASES.length} test cases...\n`)

  let insertedTests = 0
  let failedTests = 0

  for (const testCase of TEST_CASES) {
    process.stdout.write(`  ${testCase.test_id}... `)

    const { error } = await supabase.schema('sandbox').from('test_cases').insert({
      test_id: testCase.test_id,
      input_text: testCase.input_text,
      expected_match_clause_id: testCase.expected_match_clause_id,
      expected_similarity_min: testCase.expected_similarity_min,
      expected_similarity_max: testCase.expected_similarity_max,
      expected_match_category: testCase.expected_match_category,
      scenario: testCase.scenario,
      description: testCase.description,
      is_active: true,
    })

    if (error) {
      console.log(`❌ ${error.message}`)
      failedTests++
    } else {
      console.log('✅')
      insertedTests++
    }
  }

  console.log(`\n📊 Test Cases Summary: ${insertedTests} inserted, ${failedTests} failed\n`)

  // Final summary
  console.log('═'.repeat(50))
  console.log('🌱 SANDBOX SEEDING COMPLETE')
  console.log('═'.repeat(50))
  console.log(`  LCL Clauses:  ${insertedClauses}/${SYNTHETIC_CLAUSES.length}`)
  console.log(`  Test Cases:   ${insertedTests}/${TEST_CASES.length}`)
  console.log('')
  console.log('Next steps:')
  console.log('  1. Run the dev server: pnpm dev')
  console.log('  2. Visit /sandbox to explore the sandbox')
  console.log('  3. Run tests via POST /api/sandbox/test')
  console.log('')
}

// Run
seedSandbox().catch((error) => {
  console.error('❌ Seeding failed:', error)
  process.exit(1)
})
