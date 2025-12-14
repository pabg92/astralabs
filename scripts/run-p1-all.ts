/**
 * Run P1 Reconciliation for all documents with deal_id
 * Uses the updated worker/p1-reconciliation.ts
 */

import { createClient } from '@supabase/supabase-js'
import { performP1Reconciliation } from '../worker/p1-reconciliation'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const openaiApiKey = process.env.OPENAI_API_KEY!

if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  console.log('🔍 Finding documents with deal_id for P1 reprocessing...')

  // Get all documents with deal_id
  const { data: documents, error } = await supabase
    .from('document_repository')
    .select('id, original_filename, deal_id')
    .not('deal_id', 'is', null)
    .order('original_filename')

  if (error) {
    console.error('Error fetching documents:', error)
    process.exit(1)
  }

  console.log(`📄 Found ${documents?.length || 0} documents with deal_id\n`)

  let totalComparisons = 0
  let totalUpdated = 0
  let totalDiscrepancies = 0

  for (const doc of documents || []) {
    console.log(`\n📋 Processing: ${doc.original_filename} (${doc.id})`)

    try {
      const result = await performP1Reconciliation(doc.id, supabase, openaiApiKey)

      if (result.skipped) {
        console.log(`   ⏭️ Skipped: ${result.reason}`)
      } else {
        console.log(`   ✅ Comparisons: ${result.p1_comparisons_made}, Updated: ${result.clauses_updated}, Discrepancies: ${result.discrepancies_created}`)
        totalComparisons += result.p1_comparisons_made || 0
        totalUpdated += result.clauses_updated || 0
        totalDiscrepancies += result.discrepancies_created || 0
      }
    } catch (err: any) {
      console.error(`   ❌ Error: ${err.message}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 P1 Reconciliation Summary')
  console.log('='.repeat(60))
  console.log(`Documents processed: ${documents?.length || 0}`)
  console.log(`Total comparisons: ${totalComparisons}`)
  console.log(`Clauses updated: ${totalUpdated}`)
  console.log(`Discrepancies created: ${totalDiscrepancies}`)
}

main().catch(console.error)
