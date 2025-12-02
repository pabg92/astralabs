#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const documentId = '05793c06-bf3e-4920-8ee2-40002beaec2d'

async function triggerEnqueue() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Get document details
  const { data: doc, error: docError } = await supabase
    .from('document_repository')
    .select('*')
    .eq('id', documentId)
    .single()

  if (docError || !doc) {
    console.error('Document not found:', docError)
    return
  }

  console.log(`Document: ${doc.original_filename}`)
  console.log(`Status: ${doc.processing_status}`)
  console.log(`Tenant: ${doc.tenant_id}`)
  console.log(`Path: ${doc.object_path}`)

  // Call pgmq.send directly
  const query = `
    SELECT pgmq.send(
      'document_processing_queue',
      jsonb_build_object(
        'document_id', $1::uuid,
        'tenant_id', $2::uuid,
        'object_path', $3::text,
        'processing_type', 'full',
        'enqueued_at', now()
      )
    ) AS msg_id
  `

  const { data, error } = await supabase.rpc('exec_sql', {
    query_text: query,
    params: [doc.id, doc.tenant_id, doc.object_path]
  })

  if (error) {
    console.error('Enqueue failed:', error)
  } else {
    console.log('✅ Enqueued to PGMQ, worker should pick it up in ~3s')
  }
}

triggerEnqueue().catch(console.error)
