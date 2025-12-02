#!/usr/bin/env node
/**
 * Reset a failed document and re-enqueue for processing
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const documentId = '05793c06-bf3e-4920-8ee2-40002beaec2d'

async function resetDocument() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Get document info
  const { data: doc, error: docError } = await supabase
    .from('document_repository')
    .select('*')
    .eq('id', documentId)
    .single()

  if (docError || !doc) {
    throw new Error(`Document not found: ${docError?.message}`)
  }

  console.log('Document:', {
    id: doc.id,
    filename: doc.original_filename,
    current_status: doc.processing_status,
    deal_id: doc.deal_id,
    tenant_id: doc.tenant_id
  })

  // Reset status
  const { error: updateError } = await supabase
    .from('document_repository')
    .update({
      processing_status: 'pending',
      error_message: null
    })
    .eq('id', documentId)

  if (updateError) {
    throw new Error(`Failed to update status: ${updateError.message}`)
  }

  console.log('✅ Document status reset to pending')
  console.log('✅ Database trigger will auto-enqueue for processing')
  console.log('Worker will pick it up within 3 seconds...')
}

resetDocument().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
