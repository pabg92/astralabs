#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const documentId = '05793c06-bf3e-4920-8ee2-40002beaec2d'

async function manualEnqueue() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Get document
  const { data: doc } = await supabase
    .from('document_repository')
    .select('*')
    .eq('id', documentId)
    .single()

  if (!doc) throw new Error('Document not found')

  console.log('Document:', doc.original_filename, 'Status:', doc.processing_status)

  // Manually insert into queue
  const message = {
    document_id: doc.id,
    tenant_id: doc.tenant_id,
    object_path: doc.object_path,
    processing_type: 'full',
    enqueued_at: new Date().toISOString()
  }

  const { error } = await supabase.rpc('pgmq_send', {
    queue_name: 'document_processing_queue',
    message: JSON.stringify(message)
  })

  if (error) {
    console.error('Error enqueueing:', error)
  } else {
    console.log('✅ Manually enqueued to PGMQ')
  }
}

manualEnqueue().catch(console.error)
