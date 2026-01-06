#!/usr/bin/env tsx
/**
 * Run P1 reconciliation for all documents that have associated PATs.
 * Uses performP1Reconciliation from p1-reconciliation.ts.
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'
import { performP1Reconciliation } from './p1-reconciliation.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or OPENAI_API_KEY in env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  console.log('🚀 Running P1 Reconciliation for all documents with PATs')

  // Get distinct deal_ids that have PATs
  const { data: dealsWithPats, error: dealsError } = await supabase
    .from('pre_agreed_terms')
    .select('deal_id')
    .not('deal_id', 'is', null)

  if (dealsError) {
    console.error('Failed to fetch PAT deals:', dealsError.message)
    return
  }

  const dealIds = Array.from(
    new Set(
      (dealsWithPats || [])
        .map((d: any) => d.deal_id)
        .filter((id: string | null) => !!id)
    )
  )
  if (dealIds.length === 0) {
    console.log('No deals with PATs found')
    return
  }

  // Fetch documents for those deals
  const { data: docs, error } = await supabase
    .from('document_repository')
    .select('id, deal_id')
    .in('deal_id', dealIds)

  if (error) {
    console.error('Failed to fetch documents for PAT deals:', error.message)
    return
  }

  if (!docs?.length) {
    console.log('No documents found for deals with PATs')
    return
  }

  console.log(`Found ${docs.length} documents with PATs`)

  for (const row of docs) {
    const documentId = row.id
    console.log(`\n▶️  Processing document ${documentId}`)
    try {
      const result = await performP1Reconciliation(documentId, supabase, OPENAI_API_KEY!)
      console.log(`   Result:`, result)
    } catch (err) {
      console.error(`   ❌ Error processing ${documentId}:`, err)
    }
  }

  console.log('\n✅ P1 run complete')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
