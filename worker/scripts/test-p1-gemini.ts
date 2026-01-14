/**
 * Test script for P1 reconciliation with Gemini
 * Run with: npx tsx scripts/test-p1-gemini.ts
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load env
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../../.env.local') })

import { performP1Reconciliation } from '../p1-reconciliation.js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testP1() {
  // Find a document to test
  const { data: docs } = await supabase
    .from('document_repository')
    .select('id, deal_id, processing_status, p1_completed_at')
    .eq('processing_status', 'completed')
    .is('p1_completed_at', null)
    .not('deal_id', 'is', null)
    .limit(1)

  if (!docs || docs.length === 0) {
    console.log('No documents available to test P1')
    return
  }

  const doc = docs[0]

  // Check if deal has PATs
  const { data: pats } = await supabase
    .from('pre_agreed_terms')
    .select('id')
    .eq('deal_id', doc.deal_id)
    .limit(1)

  if (!pats || pats.length === 0) {
    console.log('Document deal has no PATs, cannot test P1')
    return
  }

  const openaiKey = process.env.OPENAI_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY

  console.log('=== P1 Reconciliation Test ===')
  console.log('P1_MODEL:', process.env.P1_MODEL || 'gpt-4o (default)')
  console.log('P1_NORMALIZATION_MODEL:', process.env.P1_NORMALIZATION_MODEL || 'gpt-4o-mini (default)')
  console.log('Document:', doc.id)
  console.log('Deal:', doc.deal_id)
  console.log('OpenAI key:', openaiKey ? 'set' : 'not set')
  console.log('Gemini key:', geminiKey ? 'set' : 'not set')
  console.log('')

  const startTime = Date.now()

  try {
    const result = await performP1Reconciliation(doc.id, supabase, openaiKey, geminiKey)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('\n=== Result ===')
    console.log(JSON.stringify(result, null, 2))
    console.log(`\nTotal time: ${elapsed}s`)
  } catch (err: unknown) {
    const error = err as Error
    console.error('\n=== Error ===')
    console.error('Message:', error.message)
    console.error('Stack:', error.stack)
  }
}

testP1()
