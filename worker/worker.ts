#!/usr/bin/env node
/**
 * Document Processing Worker
 * Polls pgmq queue and invokes Edge Functions to process documents
 *
 * Usage: npm start (from /worker directory)
 *
 * This worker:
 * 1. Polls document_processing_queue using dequeue_document_processing()
 * 2. Invokes extract-clauses Edge Function for each document
 * 3. Invokes generate-embeddings Edge Function after extraction
 * 4. Invokes match-and-reconcile Edge Function to complete the pipeline
 * 5. Runs P1 reconciliation (batched GPT comparison against pre-agreed terms)
 * 6. Updates document status to 'completed' when done
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { performP1Reconciliation } from './p1-reconciliation.js'

// Resolve paths for ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from parent directory's .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

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

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 2000,  // 2 seconds
  maxDelayMs: 30000,     // 30 seconds max
  backoffMultiplier: 2,  // Exponential backoff
}

// Transient error patterns that should trigger retry
const TRANSIENT_ERROR_PATTERNS = [
  /5\d{2}/,              // 5xx server errors (500, 502, 503, 504, 520, etc.)
  /429/,                 // Rate limiting
  /ECONNRESET/i,         // Connection reset
  /ETIMEDOUT/i,          // Timeout
  /ECONNREFUSED/i,       // Connection refused
  /EPIPE/i,              // Broken pipe
  /socket hang up/i,     // Socket hang up
  /network/i,            // Network errors
  /timeout/i,            // Timeout errors
  /temporarily unavailable/i,
  /service unavailable/i,
]

function isTransientError(error: any): boolean {
  const errorString = String(error?.message || error || '')
  return TRANSIENT_ERROR_PATTERNS.some(pattern => pattern.test(errorString))
}

function calculateBackoffDelay(attempt: number): number {
  const delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt)
  return Math.min(delay, RETRY_CONFIG.maxDelayMs)
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
    console.log(`🔄 Retry: ${RETRY_CONFIG.maxRetries} retries, ${RETRY_CONFIG.initialDelayMs}ms initial delay, ${RETRY_CONFIG.backoffMultiplier}x backoff`)
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
        } else {
          console.log(`✅ Message ${msg.msg_id} processed and deleted (document: ${docId})`)
        }
      } catch (error: any) {
        const wasTransient = isTransientError(error)
        const errorType = wasTransient ? 'transient (retries exhausted)' : 'non-retryable'
        console.error(`❌ Failed to process document ${docId} (msg ${msg.msg_id}) - ${errorType}:`, error?.message || error)

        // Archive failed message to DLQ
        const { error: archiveError } = await this.supabase.rpc('archive_queue_message', {
          p_queue_name: 'document_processing_queue',
          p_msg_id: msg.msg_id
        })

        if (archiveError) {
          console.error(`🔴 CRITICAL: Failed to archive msg ${msg.msg_id} for document ${docId}:`, archiveError)
          throw new Error(`Queue archive failed for msg ${msg.msg_id}, document ${docId}`)
        } else {
          console.log(`📦 Message ${msg.msg_id} archived to DLQ after ${wasTransient ? 'exhausting retries' : 'non-retryable error'} (document: ${docId})`)
        }
      }
    }
  }

  private async processDocument(msg: QueueMessage) {
    const { document_id, tenant_id, object_path } = msg.message
    const startTime = Date.now()

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

      // Heartbeat: Extend visibility timeout after step 1
      await this.extendVisibilityTimeout(msg.msg_id)

      // Step 2: Generate embeddings
      console.log('   2️⃣ Generating embeddings...')
      const embeddingResult = await this.invokeEdgeFunction('generate-embeddings', {
        document_id
      })

      if (!embeddingResult.success) {
        throw new Error(`Embedding generation failed: ${embeddingResult.error}`)
      }

      console.log(`   ✅ Generated ${embeddingResult.embeddings_generated || 0} embeddings`)

      // Heartbeat: Extend visibility timeout after step 2
      await this.extendVisibilityTimeout(msg.msg_id)

      // Step 3: Match and reconcile (LCL)
      console.log('   3️⃣ Matching against Legal Clause Library...')
      const matchResult = await this.invokeEdgeFunction('match-and-reconcile', {
        document_id,
        tenant_id
      })

      if (!matchResult.success) {
        throw new Error(`Match and reconcile failed: ${matchResult.error}`)
      }

      console.log(`   ✅ Matched ${matchResult.clauses_reconciled || 0} clauses against LCL`)

      // Heartbeat: Extend visibility timeout after step 3
      await this.extendVisibilityTimeout(msg.msg_id)

      // Step 4: P1 Reconciliation (batched GPT comparison)
      // Issue #2: Track P1 status separately from document processing status
      const openaiApiKey = process.env.OPENAI_API_KEY
      let p1Status: 'completed' | 'failed' | 'skipped' = 'skipped'
      let p1Error: string | null = null

      if (openaiApiKey) {
        try {
          const p1Result = await performP1Reconciliation(
            document_id,
            this.supabase,
            openaiApiKey
          )
          if (p1Result.skipped) {
            console.log(`   ℹ️ P1: ${p1Result.reason}`)
            p1Status = 'skipped'
          } else {
            console.log(`   ✅ P1: ${p1Result.p1_comparisons_made} comparisons in ${((p1Result.execution_time_ms || 0) / 1000).toFixed(1)}s`)
            p1Status = 'completed'
          }
        } catch (err: any) {
          console.error(`   ⚠️ P1 comparison failed (non-fatal):`, err)
          p1Status = 'failed'
          p1Error = err?.message || String(err)
          // Don't throw - P1 is enhancement, not required for document processing
        }
      } else {
        console.log(`   ℹ️ Skipping P1: OPENAI_API_KEY not set`)
        p1Status = 'skipped'
      }

      // Step 5: Update document status to completed (including P1 status)
      const { error: updateError } = await this.supabase
        .from('document_repository')
        .update({
          processing_status: 'completed',
          p1_status: p1Status,
          p1_completed_at: p1Status === 'completed' ? new Date().toISOString() : null,
          p1_error: p1Error
        })
        .eq('id', document_id)

      if (updateError) {
        throw new Error(`Failed to update document status: ${updateError.message}`)
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`✅ Document ${document_id} completed in ${totalTime}s`)

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
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
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
          const errorText = await response.text()
          const error = new Error(`Edge function ${functionName} failed (${response.status}): ${errorText}`)

          // Check if this is a retryable error
          if (isTransientError(error) && attempt < RETRY_CONFIG.maxRetries) {
            const delay = calculateBackoffDelay(attempt)
            console.log(`   ⚠️ ${functionName} failed with transient error (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delay}ms...`)
            await this.sleep(delay)
            lastError = error
            continue
          }

          throw error
        }

        // Success - if we had retries, log it
        if (attempt > 0) {
          console.log(`   ✅ ${functionName} succeeded after ${attempt + 1} attempts`)
        }

        return await response.json()

      } catch (error: any) {
        lastError = error

        // Check if this is a retryable error (network errors, etc.)
        if (isTransientError(error) && attempt < RETRY_CONFIG.maxRetries) {
          const delay = calculateBackoffDelay(attempt)
          console.log(`   ⚠️ ${functionName} failed with transient error (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delay}ms...`)
          console.log(`      Error: ${error.message?.substring(0, 100)}...`)
          await this.sleep(delay)
          continue
        }

        // Non-retryable error or max retries exhausted
        throw error
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error(`${functionName} failed after ${RETRY_CONFIG.maxRetries + 1} attempts`)
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Extend message visibility timeout (heartbeat pattern)
   * Call after each major processing step to prevent message redelivery
   * Issue #1: Race condition on redelivery
   */
  private async extendVisibilityTimeout(msgId: bigint, extensionSec: number = 120) {
    const { error } = await this.supabase.rpc('extend_message_visibility', {
      p_msg_id: msgId,
      p_extension_seconds: extensionSec
    })
    if (error) {
      // Log but don't fail - worker can continue, just risk redelivery
      console.warn(`   ⚠️ Failed to extend VT for msg ${msgId}:`, error.message)
    }
  }
}

// Handle graceful shutdown
let worker: DocumentProcessingWorker

process.on('SIGINT', () => {
  console.log('\n📋 Shutting down worker...')
  worker?.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n📋 Shutting down worker...')
  worker?.stop()
  process.exit(0)
})

// Start the worker
worker = new DocumentProcessingWorker()
worker.start().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
