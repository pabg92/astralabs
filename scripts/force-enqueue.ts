#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function forceEnqueue() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const documentId = '05793c06-bf3e-4920-8ee2-40002beaec2d'

  // Get document
  const { data: doc } = await supabase
    .from('document_repository')
    .select('*')
    .eq('id', documentId)
    .single()

  if (!doc) throw new Error('Document not found')

  // Call the enqueue function directly
  const { error } = await supabase.rpc('pgmq_send', {
    queue_name: 'document_processing_queue',
    msg: {
      document_id: doc.id,
      tenant_id: doc.tenant_id,
      object_path: doc.object_path,
      processing_type: 'full',
      enqueued_at: new Date().toISOString()
    }
  })

  if (error) {
    console.error('❌ Enqueue failed:', error)
  } else {
    console.log('✅ Enqueued! Worker will pick it up in ~3s')
  }
}

forceEnqueue().catch(console.error)
