/**
 * Seed Script for Sandbox V2 - Three-Tier Clause Architecture
 *
 * Creates:
 * - 7 LCL Concepts (Payment, Exclusivity, IP, Deliverables, Termination, Confidentiality, Compliance)
 * - ~15 LCSTX Variants with varying risk levels
 * - ~10 Test Cases covering different scenarios
 *
 * Usage:
 *   pnpm tsx scripts/seed-sandbox-v2.ts
 *
 * Requires:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 *   - OPENAI_API_KEY for embedding generation
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

// ============================================================================
// CONFIGURATION
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiKey = process.env.OPENAI_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'sandbox_v2' },
})

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!openaiKey) {
    console.warn('OPENAI_API_KEY not set, skipping embedding generation')
    return null
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: text.substring(0, 2000),
        dimensions: 1024,
        encoding_format: 'float',
      }),
    })

    if (!response.ok) {
      console.warn(`Embedding API error: ${response.status}`)
      return null
    }

    const data = await response.json()
    return data.data[0].embedding
  } catch (error) {
    console.warn('Embedding generation failed:', error)
    return null
  }
}

// ============================================================================
// SEED DATA
// ============================================================================

const LCL_CONCEPTS = [
  {
    concept_code: 'PAY',
    category: 'Payment',
    display_name: 'Payment Terms',
    description: 'Clauses relating to payment timing, methods, and conditions',
  },
  {
    concept_code: 'EXC',
    category: 'Exclusivity',
    display_name: 'Exclusivity Clauses',
    description: 'Restrictions on working with competitors or in certain categories',
  },
  {
    concept_code: 'IP',
    category: 'Intellectual Property',
    display_name: 'IP Rights',
    description: 'Content ownership, licensing, and usage rights',
  },
  {
    concept_code: 'DEL',
    category: 'Deliverables',
    display_name: 'Deliverable Requirements',
    description: 'Content creation requirements, formats, and specifications',
  },
  {
    concept_code: 'TRM',
    category: 'Termination',
    display_name: 'Termination Clauses',
    description: 'Contract termination conditions and consequences',
  },
  {
    concept_code: 'CNF',
    category: 'Confidentiality',
    display_name: 'Confidentiality & NDA',
    description: 'Non-disclosure and confidentiality obligations',
  },
  {
    concept_code: 'FTC',
    category: 'Compliance',
    display_name: 'FTC/Regulatory Compliance',
    description: 'Disclosure requirements and regulatory compliance',
  },
]

interface LCSTXVariant {
  variant_code: string
  concept_code: string
  risk_level: 'low' | 'medium' | 'high'
  canonical_text: string
  plain_english: string
  suggested_rewrite?: string
}

const LCSTX_VARIANTS: LCSTXVariant[] = [
  // Payment Terms
  {
    variant_code: 'PAY-001',
    concept_code: 'PAY',
    risk_level: 'low',
    canonical_text:
      'Payment shall be made within thirty (30) days of receipt of invoice and approval of deliverables.',
    plain_english: 'You get paid within 30 days after submitting your work and invoice.',
  },
  {
    variant_code: 'PAY-002',
    concept_code: 'PAY',
    risk_level: 'medium',
    canonical_text:
      'Payment shall be made within sixty (60) days of receipt of invoice, subject to brand approval and compliance verification.',
    plain_english: 'Payment in 60 days after invoice, but brand must approve first.',
    suggested_rewrite:
      'Payment shall be made within thirty (30) days of receipt of invoice.',
  },
  {
    variant_code: 'PAY-003',
    concept_code: 'PAY',
    risk_level: 'high',
    canonical_text:
      'Payment shall be made within ninety (90) days at the sole discretion of the Company, and may be withheld pending review.',
    plain_english: '90-day payment at company discretion - they can delay further.',
    suggested_rewrite:
      'Payment shall be made within thirty (30) days of deliverable approval.',
  },

  // Exclusivity
  {
    variant_code: 'EXC-001',
    concept_code: 'EXC',
    risk_level: 'low',
    canonical_text:
      'Creator agrees to exclusivity within the beauty skincare category for the campaign period only.',
    plain_english: 'No competing beauty skincare work during the campaign only.',
  },
  {
    variant_code: 'EXC-002',
    concept_code: 'EXC',
    risk_level: 'medium',
    canonical_text:
      'Creator agrees to exclusivity within the beauty category for six (6) months following campaign completion.',
    plain_english: 'No competing beauty work for 6 months after the campaign ends.',
    suggested_rewrite:
      'Creator agrees to exclusivity within the specific product subcategory for the campaign period only.',
  },
  {
    variant_code: 'EXC-003',
    concept_code: 'EXC',
    risk_level: 'high',
    canonical_text:
      'Creator agrees to broad exclusivity across all lifestyle and wellness categories for twelve (12) months post-campaign, including social mentions of competitors.',
    plain_english:
      'Cannot work with ANY lifestyle/wellness brand for a full year, even mentions.',
    suggested_rewrite:
      'Creator agrees to exclusivity within the direct competitor subcategory for the campaign period plus 30 days.',
  },

  // Intellectual Property
  {
    variant_code: 'IP-001',
    concept_code: 'IP',
    risk_level: 'low',
    canonical_text:
      'Company is granted a non-exclusive license to use the Content for two (2) years on social media platforms.',
    plain_english: 'Brand can use your content for 2 years, but you keep ownership.',
  },
  {
    variant_code: 'IP-002',
    concept_code: 'IP',
    risk_level: 'medium',
    canonical_text:
      'Company is granted exclusive rights to the Content for three (3) years across all digital platforms, including the right to modify.',
    plain_english: 'Brand has exclusive use for 3 years and can edit your content.',
    suggested_rewrite:
      'Company is granted a non-exclusive license for two (2) years, modifications require creator approval.',
  },
  {
    variant_code: 'IP-003',
    concept_code: 'IP',
    risk_level: 'high',
    canonical_text:
      'Creator assigns all intellectual property rights in the Content to Company in perpetuity, including derivative works and worldwide usage.',
    plain_english: 'You permanently give up all rights to your content forever.',
    suggested_rewrite:
      'Company is granted a non-exclusive license for two (2) years with option to renew.',
  },

  // Deliverables
  {
    variant_code: 'DEL-001',
    concept_code: 'DEL',
    risk_level: 'low',
    canonical_text:
      'Creator shall deliver one (1) Instagram Reel, 60-90 seconds, within the agreed timeline with two rounds of revisions.',
    plain_english: 'Make one Instagram Reel with up to 2 revision rounds.',
  },
  {
    variant_code: 'DEL-002',
    concept_code: 'DEL',
    risk_level: 'medium',
    canonical_text:
      'Creator shall deliver content as specified, with unlimited revisions until brand approval is obtained.',
    plain_english: 'Deliver content with unlimited revisions - no cap.',
    suggested_rewrite:
      'Creator shall deliver content as specified, with up to three (3) rounds of revisions.',
  },

  // Termination
  {
    variant_code: 'TRM-001',
    concept_code: 'TRM',
    risk_level: 'low',
    canonical_text:
      'Either party may terminate this Agreement with thirty (30) days written notice. Creator shall be paid for work completed.',
    plain_english: 'Either side can end with 30 days notice, and you get paid for work done.',
  },
  {
    variant_code: 'TRM-002',
    concept_code: 'TRM',
    risk_level: 'high',
    canonical_text:
      'Company may terminate this Agreement immediately without cause. In such event, Company shall have no obligation to pay for incomplete deliverables.',
    plain_english: 'Brand can cancel anytime without paying for unfinished work.',
    suggested_rewrite:
      'Either party may terminate with 14 days notice. Creator shall be paid pro-rata for completed work.',
  },

  // Confidentiality
  {
    variant_code: 'CNF-001',
    concept_code: 'CNF',
    risk_level: 'low',
    canonical_text:
      'Creator agrees to maintain confidentiality of campaign details until public launch.',
    plain_english: 'Keep campaign secret until it goes public.',
  },
  {
    variant_code: 'CNF-002',
    concept_code: 'CNF',
    risk_level: 'high',
    canonical_text:
      'Creator agrees to perpetual confidentiality regarding all business information, including compensation, with liquidated damages of $50,000 per breach.',
    plain_english:
      'Forever NDA on everything including your pay, with $50k penalty per violation.',
    suggested_rewrite:
      'Creator agrees to maintain confidentiality for one (1) year regarding non-public business information.',
  },

  // Compliance
  {
    variant_code: 'FTC-001',
    concept_code: 'FTC',
    risk_level: 'low',
    canonical_text:
      'Creator shall comply with FTC guidelines and include appropriate sponsored content disclosures (#ad, #sponsored).',
    plain_english: 'Follow FTC rules and clearly label sponsored content.',
  },
]

interface TestCaseData {
  test_id: string
  input_text: string
  expected_lcstx_variant_code: string | null
  expected_risk_level: 'low' | 'medium' | 'high' | null
  expected_rag_library: 'GREEN' | 'AMBER' | 'RED' | null
  pat_term_category: string | null
  pat_expected_value: string | null
  pat_is_mandatory: boolean | null
  expected_rag_final: 'GREEN' | 'AMBER' | 'RED' | null
  scenario: 'exact_pattern' | 'risk_resolution' | 'pat_override' | 'novel_escalation' | 'multi_match'
  description: string
}

const TEST_CASES: TestCaseData[] = [
  // Exact Pattern Matching
  {
    test_id: 'TC-EXACT-001',
    input_text: 'Payment shall be made within thirty (30) days of receipt of invoice and approval of deliverables.',
    expected_lcstx_variant_code: 'PAY-001',
    expected_risk_level: 'low',
    expected_rag_library: 'GREEN',
    pat_term_category: null,
    pat_expected_value: null,
    pat_is_mandatory: null,
    expected_rag_final: 'GREEN',
    scenario: 'exact_pattern',
    description: 'Exact match to PAY-001 canonical text',
  },
  {
    test_id: 'TC-EXACT-002',
    input_text: 'Creator assigns all intellectual property rights in the Content to Company in perpetuity.',
    expected_lcstx_variant_code: 'IP-003',
    expected_risk_level: 'high',
    expected_rag_library: 'GREEN',
    pat_term_category: null,
    pat_expected_value: null,
    pat_is_mandatory: null,
    expected_rag_final: 'GREEN',
    scenario: 'exact_pattern',
    description: 'Match to high-risk IP perpetual assignment',
  },

  // Risk Resolution (Highest Risk Wins)
  {
    test_id: 'TC-RISK-001',
    input_text: 'Payment will be processed within 60 days following invoice receipt and brand sign-off.',
    expected_lcstx_variant_code: 'PAY-002',
    expected_risk_level: 'medium',
    expected_rag_library: 'GREEN',
    pat_term_category: null,
    pat_expected_value: null,
    pat_is_mandatory: null,
    expected_rag_final: 'GREEN',
    scenario: 'risk_resolution',
    description: 'Similar to multiple PAY variants, should resolve to medium risk PAY-002',
  },
  {
    test_id: 'TC-RISK-002',
    input_text: 'Creator grants perpetual exclusive rights to all content worldwide.',
    expected_lcstx_variant_code: 'IP-003',
    expected_risk_level: 'high',
    expected_rag_library: 'GREEN',
    pat_term_category: null,
    pat_expected_value: null,
    pat_is_mandatory: null,
    expected_rag_final: 'GREEN',
    scenario: 'risk_resolution',
    description: 'IP clause should match high-risk IP-003 over lower risk variants',
  },

  // PAT Override
  {
    test_id: 'TC-PAT-001',
    input_text: 'Payment shall be made within sixty (60) days of invoice submission.',
    expected_lcstx_variant_code: 'PAY-002',
    expected_risk_level: 'medium',
    expected_rag_library: 'GREEN',
    pat_term_category: 'Payment Terms',
    pat_expected_value: '30 days',
    pat_is_mandatory: true,
    expected_rag_final: 'RED',
    scenario: 'pat_override',
    description: 'Contract says 60 days but PAT requires 30 days - should override to RED',
  },
  {
    test_id: 'TC-PAT-002',
    input_text: 'Creator agrees to exclusivity in beauty category for 6 months.',
    expected_lcstx_variant_code: 'EXC-002',
    expected_risk_level: 'medium',
    expected_rag_library: 'GREEN',
    pat_term_category: 'Exclusivity',
    pat_expected_value: 'Campaign period only',
    pat_is_mandatory: true,
    expected_rag_final: 'RED',
    scenario: 'pat_override',
    description: 'Exclusivity exceeds PAT terms - should flag as RED',
  },

  // Novel Escalation
  {
    test_id: 'TC-NOVEL-001',
    input_text: 'Creator shall participate in quarterly brand ambassador meetings and provide feedback on product development initiatives.',
    expected_lcstx_variant_code: null,
    expected_risk_level: null,
    expected_rag_library: 'RED',
    pat_term_category: null,
    pat_expected_value: null,
    pat_is_mandatory: null,
    expected_rag_final: 'RED',
    scenario: 'novel_escalation',
    description: 'Novel clause type not in library - should escalate for review',
  },

  // Multi-Match Resolution
  {
    test_id: 'TC-MULTI-001',
    input_text: 'Company may use the content exclusively for five years across all platforms with modification rights.',
    expected_lcstx_variant_code: 'IP-002',
    expected_risk_level: 'medium',
    expected_rag_library: 'AMBER',
    pat_term_category: null,
    pat_expected_value: null,
    pat_is_mandatory: null,
    expected_rag_final: 'AMBER',
    scenario: 'multi_match',
    description: 'Multiple IP variants match, should resolve based on risk',
  },
  {
    test_id: 'TC-MULTI-002',
    input_text: 'Either party may terminate with written notice. Payment for completed work is guaranteed.',
    expected_lcstx_variant_code: 'TRM-001',
    expected_risk_level: 'low',
    expected_rag_library: 'GREEN',
    pat_term_category: null,
    pat_expected_value: null,
    pat_is_mandatory: null,
    expected_rag_final: 'GREEN',
    scenario: 'multi_match',
    description: 'Termination clause matching low-risk variant',
  },
]

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function clearExistingData() {
  console.log('Clearing existing sandbox_v2 data...')

  // Clear in order of dependencies
  await supabase.from('test_cases').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('pattern_review_queue').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('match_results').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('lcstx').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('lcl').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  console.log('Existing data cleared.')
}

async function seedLCLConcepts(): Promise<Map<string, string>> {
  console.log('\nSeeding LCL concepts...')
  const conceptIdMap = new Map<string, string>()

  for (const concept of LCL_CONCEPTS) {
    const { data, error } = await supabase
      .from('lcl')
      .insert({
        concept_code: concept.concept_code,
        category: concept.category,
        display_name: concept.display_name,
        description: concept.description,
        is_active: true,
      })
      .select('id, concept_code')
      .single()

    if (error) {
      console.error(`Error inserting ${concept.concept_code}:`, error.message)
    } else {
      conceptIdMap.set(concept.concept_code, data.id)
      console.log(`  Created LCL: ${concept.concept_code} (${data.id})`)
    }
  }

  console.log(`Seeded ${conceptIdMap.size} LCL concepts.`)
  return conceptIdMap
}

async function seedLCSTXVariants(conceptIdMap: Map<string, string>) {
  console.log('\nSeeding LCSTX variants...')
  let count = 0

  for (const variant of LCSTX_VARIANTS) {
    const lclId = conceptIdMap.get(variant.concept_code)
    if (!lclId) {
      console.warn(`  Skipping ${variant.variant_code}: LCL ${variant.concept_code} not found`)
      continue
    }

    // Generate embedding
    console.log(`  Generating embedding for ${variant.variant_code}...`)
    const embedding = await generateEmbedding(variant.canonical_text)

    const insertData: Record<string, unknown> = {
      lcl_id: lclId,
      variant_code: variant.variant_code,
      risk_level: variant.risk_level,
      canonical_text: variant.canonical_text,
      plain_english: variant.plain_english,
      suggested_rewrite: variant.suggested_rewrite || null,
      patterns: [],
      is_active: true,
      version: 1,
    }

    if (embedding) {
      insertData.embedding = `[${embedding.join(',')}]`
    }

    const { error } = await supabase.from('lcstx').insert(insertData)

    if (error) {
      console.error(`  Error inserting ${variant.variant_code}:`, error.message)
    } else {
      count++
      console.log(`  Created LCSTX: ${variant.variant_code} (${variant.risk_level})${embedding ? ' with embedding' : ''}`)
    }

    // Rate limiting for OpenAI API
    if (embedding) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  console.log(`Seeded ${count} LCSTX variants.`)
}

async function seedTestCases() {
  console.log('\nSeeding test cases...')
  let count = 0

  for (const testCase of TEST_CASES) {
    const { error } = await supabase.from('test_cases').insert({
      test_id: testCase.test_id,
      input_text: testCase.input_text,
      expected_lcstx_variant_code: testCase.expected_lcstx_variant_code,
      expected_risk_level: testCase.expected_risk_level,
      expected_rag_library: testCase.expected_rag_library,
      pat_term_category: testCase.pat_term_category,
      pat_expected_value: testCase.pat_expected_value,
      pat_is_mandatory: testCase.pat_is_mandatory,
      expected_rag_final: testCase.expected_rag_final,
      scenario: testCase.scenario,
      description: testCase.description,
      is_active: true,
    })

    if (error) {
      console.error(`  Error inserting ${testCase.test_id}:`, error.message)
    } else {
      count++
      console.log(`  Created test case: ${testCase.test_id} (${testCase.scenario})`)
    }
  }

  console.log(`Seeded ${count} test cases.`)
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('Sandbox V2 Seed Script')
  console.log('='.repeat(60))
  console.log()

  try {
    await clearExistingData()
    const conceptIdMap = await seedLCLConcepts()
    await seedLCSTXVariants(conceptIdMap)
    await seedTestCases()

    console.log()
    console.log('='.repeat(60))
    console.log('Seeding complete!')
    console.log('='.repeat(60))
    console.log()
    console.log('Next steps:')
    console.log('1. Run migrations: npx supabase db push')
    console.log('2. Start dev server: pnpm dev')
    console.log('3. Visit: http://localhost:3000/sandbox-v2')
    console.log()
  } catch (error) {
    console.error('Seeding failed:', error)
    process.exit(1)
  }
}

main()
