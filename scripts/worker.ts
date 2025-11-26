#!/usr/bin/env node
/**
 * Document Processing Worker
 * Polls pgmq queue and invokes Edge Functions to process documents
 *
 * Usage: npm run worker
 *
 * This worker:
 * 1. Polls document_processing_queue using dequeue_document_processing()
 * 2. Invokes extract-clauses Edge Function for each document
 * 3. Invokes generate-embeddings Edge Function after extraction
 * 4. Invokes match-and-reconcile Edge Function to complete the pipeline
 * 5. Updates document status to 'completed' when done
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { performP1Reconciliation } from './p1-reconciliation.js'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

interface QueueMessage {
  msg_id: bigint
  message: {
    document_id: string
    tenant_id: string
    object_path: string
    processing_type: string
    enqueued_at: string
  }
  enqueued_at: string
  vt: string
}

class DocumentProcessingWorker {
  private supabase: any
  private isRunning = false
  private pollInterval = 3000 // 3 seconds
  private edgeFunctionBaseUrl: string

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY')
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey)
    this.edgeFunctionBaseUrl = `${supabaseUrl}/functions/v1`

    console.log('🚀 Document Processing Worker initialized')
    console.log(`📦 Queue: document_processing_queue`)
    console.log(`⏱️  Poll interval: ${this.pollInterval}ms`)
  }

  async start() {
    this.isRunning = true
    console.log('✅ Worker started')

    while (this.isRunning) {
      try {
        await this.processQueue()
      } catch (error) {
        console.error('❌ Error in processing loop:', error)
      }

      // Wait before next poll
      await this.sleep(this.pollInterval)
    }
  }

  stop() {
    this.isRunning = false
    console.log('🛑 Worker stopped')
  }

  private async processQueue() {
    // Dequeue messages from pgmq
    const { data: messages, error } = await this.supabase.rpc(
      'dequeue_document_processing',
      { batch_size: 5 }
    )

    if (error) {
      console.error('Error dequeuing messages:', error)
      return
    }

    if (!messages || messages.length === 0) {
      // No messages to process
      return
    }

    console.log(`📨 Processing ${messages.length} messages`)

    for (const msg of messages as QueueMessage[]) {
      const docId = msg.message.document_id

      try {
        await this.processDocument(msg)

        // Delete message from queue after successful processing
        const { error: deleteError } = await this.supabase.rpc('delete_queue_message', {
          p_queue_name: 'document_processing_queue',
          p_msg_id: msg.msg_id
        })

        if (deleteError) {
          console.error(`⚠️ Failed to delete msg ${msg.msg_id} for document ${docId}:`, deleteError)
          // Don't throw - document was processed successfully, just log the queue issue
        } else {
          console.log(`✅ Message ${msg.msg_id} processed and deleted (document: ${docId})`)
        }
      } catch (error) {
        console.error(`❌ Failed to process document ${docId} (msg ${msg.msg_id}):`, error)

        // Archive failed message to DLQ
        const { error: archiveError } = await this.supabase.rpc('archive_queue_message', {
          p_queue_name: 'document_processing_queue',
          p_msg_id: msg.msg_id
        })

        if (archiveError) {
          console.error(`🔴 CRITICAL: Failed to archive msg ${msg.msg_id} for document ${docId}:`, archiveError)
          console.error(`🔴 Message will be lost after visibility timeout. Manual intervention required.`)
          throw new Error(`Queue archive failed for msg ${msg.msg_id}, document ${docId}`)
        } else {
          console.log(`📦 Message ${msg.msg_id} archived to DLQ (document: ${docId})`)
        }
      }
    }
  }

  private async processDocument(msg: QueueMessage) {
    const { document_id, tenant_id, object_path } = msg.message

    console.log(`📄 Processing document ${document_id}`)
    console.log(`   Tenant: ${tenant_id}`)
    console.log(`   Path: ${object_path}`)

    try {
      // Step 1: Extract clauses
      console.log('   1️⃣ Extracting clauses...')
      const extractResult = await this.invokeEdgeFunction('extract-clauses', {
        document_id,
        tenant_id,
        object_path
      })

      if (!extractResult.success) {
        throw new Error(`Clause extraction failed: ${extractResult.error}`)
      }

      console.log(`   ✅ Extracted ${extractResult.clauses_extracted || 0} clauses`)

      // Step 2: Generate embeddings
      console.log('   2️⃣ Generating embeddings...')
      const embeddingResult = await this.invokeEdgeFunction('generate-embeddings', {
        document_id
      })

      if (!embeddingResult.success) {
        throw new Error(`Embedding generation failed: ${embeddingResult.error}`)
      }

      console.log(`   ✅ Generated ${embeddingResult.embeddings_generated || 0} embeddings`)

      // Step 3: Match and reconcile
      console.log('   3️⃣ Matching and reconciling...')
      const matchResult = await this.invokeEdgeFunction('match-and-reconcile', {
        document_id,
        tenant_id
      })

      if (!matchResult.success) {
        throw new Error(`Match and reconcile failed: ${matchResult.error}`)
      }

      console.log(`   ✅ Matched ${matchResult.clauses_reconciled || 0} clauses against LCL`)

      // Step 4: P1 Reconciliation (server-side with unlimited memory)
      const openaiApiKey = process.env.OPENAI_API_KEY
      if (openaiApiKey) {
        try {
          const p1Result = await performP1Reconciliation(
            document_id,
            this.supabase,
            openaiApiKey
          )
          console.log(`   ✅ P1: ${p1Result.p1_comparisons_made} comparisons made`)
        } catch (p1Error) {
          console.error(`   ⚠️ P1 comparison failed (non-fatal):`, p1Error)
          // Don't throw - P1 is enhancement, not required
        }
      } else {
        console.log(`   ℹ️ Skipping P1: OPENAI_API_KEY not set`)
      }

      // Step 5: Update document status to completed
      const { error: updateError } = await this.supabase
        .from('document_repository')
        .update({
          processing_status: 'completed'
        })
        .eq('id', document_id)

      if (updateError) {
        throw new Error(`Failed to update document status: ${updateError.message}`)
      }

      console.log(`✅ Document ${document_id} processing completed`)

    } catch (error) {
      // Update document status to failed
      await this.supabase
        .from('document_repository')
        .update({
          processing_status: 'failed',
          error_message: String(error)
        })
        .eq('id', document_id)

      throw error
    }
  }

  private async invokeEdgeFunction(functionName: string, payload: any) {
    const url = `${this.edgeFunctionBaseUrl}/${functionName}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Edge function ${functionName} failed: ${error}`)
    }

    return await response.json()
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📋 Shutting down worker...')
  worker.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n📋 Shutting down worker...')
  worker.stop()
  process.exit(0)
})

// Start the worker
const worker = new DocumentProcessingWorker()
worker.start().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})