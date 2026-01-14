#!/usr/bin/env node
/**
 * Document Processing Worker
 * Polls pgmq queue and processes documents using local adapters
 *
 * Usage: npm start (from /worker directory)
 *
 * This worker:
 * 1. Polls document_processing_queue using dequeue_document_processing()
 * 2. Downloads document and extracts text using local adapters
 * 3. Extracts clauses using Gemini 3 Flash (1M token context, no chunking)
 * 4. Invokes generate-embeddings Edge Function after extraction
 * 5. Invokes match-and-reconcile Edge Function to complete the pipeline
 * 6. Runs P1 reconciliation (batched GPT comparison against pre-agreed terms)
 * 7. Updates document status to 'completed' when done
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { performP1Reconciliation } from './p1-reconciliation.js'
import type { Database } from '../types/database.js'
import type { TypedSupabaseClient, QueueMessage } from './types/supabase.js'
import { getErrorMessage, isTransientError as checkTransient } from './types/errors.js'

// Local adapters for document processing
import { createStorageAdapter, type StorageAdapter } from './adapters/storage-adapter.js'
import { createTextExtractorAdapter, type TextExtractorAdapter } from './adapters/text-extractor-adapter.js'
import { createGeminiExtractionAdapter, type GeminiExtractionAdapter } from './adapters/gemini-extraction-adapter.js'
import { createGeminiVisionAdapter, type GeminiVisionAdapter } from './adapters/gemini-vision-adapter.js'
import {
  saveExtractedClauses,
  updateDocumentExtractedText,
  type ExtractedClauseInput,
} from './adapters/database-adapter.js'

// Resolve paths for ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from parent directory's .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

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

function isTransientError(error: unknown): boolean {
  return checkTransient(error)
}

function calculateBackoffDelay(attempt: number): number {
  const delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt)
  return Math.min(delay, RETRY_CONFIG.maxDelayMs)
}

class DocumentProcessingWorker {
  private supabase: TypedSupabaseClient
  private isRunning = false
  private pollInterval = 3000 // 3 seconds
  private edgeFunctionBaseUrl: string

  // Local adapters for document processing
  private storageAdapter: StorageAdapter
  private textExtractor: TextExtractorAdapter
  private geminiExtractor: GeminiExtractionAdapter | null = null
  private geminiVisionAdapter: GeminiVisionAdapter | null = null

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY')
    }

    this.supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)
    this.edgeFunctionBaseUrl = `${supabaseUrl}/functions/v1`

    // Initialize local adapters
    this.storageAdapter = createStorageAdapter(this.supabase)
    this.textExtractor = createTextExtractorAdapter()

    // Initialize Gemini extractors if API key is available
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
    if (geminiApiKey) {
      this.geminiExtractor = createGeminiExtractionAdapter({
        apiKey: geminiApiKey,
        model: 'gemini-2.0-flash',
      })
      this.geminiVisionAdapter = createGeminiVisionAdapter({
        apiKey: geminiApiKey,
        model: 'gemini-3-flash-preview', // 64K output token limit
      })
      console.log('🤖 Gemini extraction: ENABLED (local adapter)')
      console.log('👁️  Gemini Vision: ENABLED (fallback for scanned PDFs)')
    } else {
      console.log('⚠️  Gemini extraction: DISABLED (no API key, using Edge Function)')
    }

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
      // No messages to process (only log occasionally to avoid spam)
      if (Math.random() < 0.1) console.log('⏳ Polling... (no messages)')
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
      } catch (error: unknown) {
        const wasTransient = isTransientError(error)
        const errorType = wasTransient ? 'transient (retries exhausted)' : 'non-retryable'
        console.error(`❌ Failed to process document ${docId} (msg ${msg.msg_id}) - ${errorType}:`, getErrorMessage(error))

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
      let clausesExtracted = 0

      if (this.geminiExtractor) {
        // Use local Gemini extraction (preferred)
        clausesExtracted = await this.extractClausesWithGemini(
          document_id,
          tenant_id,
          object_path
        )
      } else {
        // Fallback to Edge Function
        const extractResult = await this.invokeEdgeFunction('extract-clauses', {
          document_id,
          tenant_id,
          object_path
        })

        if (!extractResult.success) {
          throw new Error(`Clause extraction failed: ${extractResult.error}`)
        }
        clausesExtracted = extractResult.clauses_extracted || 0
      }

      console.log(`   ✅ Extracted ${clausesExtracted} clauses`)

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

      // Step 4: P1 Reconciliation (batched AI comparison - supports GPT and Gemini)
      // Issue #2: Track P1 status separately from document processing status
      const openaiApiKey = process.env.OPENAI_API_KEY
      const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
      let p1Status: 'completed' | 'failed' | 'skipped' = 'skipped'
      let p1Error: string | null = null

      if (openaiApiKey || geminiApiKey) {
        try {
          const p1Result = await performP1Reconciliation(
            document_id,
            this.supabase,
            openaiApiKey,
            geminiApiKey
          )
          if (p1Result.skipped) {
            console.log(`   ℹ️ P1: ${p1Result.reason}`)
            p1Status = 'skipped'
          } else {
            console.log(`   ✅ P1: ${p1Result.p1_comparisons_made} comparisons in ${((p1Result.execution_time_ms || 0) / 1000).toFixed(1)}s`)
            p1Status = 'completed'
          }
        } catch (err: unknown) {
          console.error(`   ⚠️ P1 comparison failed (non-fatal):`, err)
          p1Status = 'failed'
          p1Error = getErrorMessage(err)
          // Don't throw - P1 is enhancement, not required for document processing
        }
      } else {
        console.log(`   ℹ️ Skipping P1: No AI API key set (OPENAI_API_KEY or GEMINI_API_KEY)`)
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

  private async invokeEdgeFunction(functionName: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
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

      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(getErrorMessage(error))

        // Check if this is a retryable error (network errors, etc.)
        if (isTransientError(error) && attempt < RETRY_CONFIG.maxRetries) {
          const delay = calculateBackoffDelay(attempt)
          console.log(`   ⚠️ ${functionName} failed with transient error (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delay}ms...`)
          console.log(`      Error: ${getErrorMessage(error).substring(0, 100)}...`)
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

  /**
   * Extract clauses using local Gemini adapter
   *
   * Pipeline:
   * 1. Download document from Supabase Storage
   * 2. Extract raw text (PDF/DOCX/TXT)
   * 3. If text extraction fails or returns too little text, fall back to Gemini Vision
   * 4. Call Gemini for clause extraction (text-based or vision)
   * 5. Save extracted clauses to clause_boundaries
   * 6. Save extracted text to document_repository (if available)
   *
   * @returns Number of clauses extracted
   */
  private async extractClausesWithGemini(
    documentId: string,
    tenantId: string,
    objectPath: string
  ): Promise<number> {
    if (!this.geminiExtractor) {
      throw new Error('Gemini extractor not initialized')
    }

    // Step 1: Download document from storage
    console.log(`      📥 Downloading document...`)
    const downloadResult = await this.storageAdapter.downloadByPath(objectPath)

    if (!downloadResult.buffer) {
      throw new Error(`Failed to download document: empty buffer`)
    }

    // Keep a copy of the original buffer for Vision fallback
    // (text extraction may consume/detach the ArrayBuffer)
    const originalBuffer = downloadResult.buffer.slice(0)

    // Step 2: Try to extract raw text from document
    console.log(`      📝 Extracting text (${downloadResult.mimeType})...`)
    let textResult: { text: string; extractionMethod: string } | null = null
    let useVisionFallback = false

    try {
      const result = await this.textExtractor.extractFromBuffer(
        downloadResult.buffer,
        downloadResult.mimeType
      )

      if (result.text && result.text.length >= 100) {
        textResult = { text: result.text, extractionMethod: result.extractionMethod }
        console.log(`      📊 Text extracted: ${result.text.length} chars, ${result.extractionMethod}`)
      } else {
        console.log(`      ⚠️ Text extraction returned only ${result.text?.length || 0} chars`)
        useVisionFallback = true
      }
    } catch (textError) {
      console.log(`      ⚠️ Text extraction failed: ${(textError as Error).message}`)
      useVisionFallback = true
    }

    // Step 3: Fall back to Gemini Vision for scanned PDFs
    if (useVisionFallback) {
      if (!this.geminiVisionAdapter) {
        throw new Error('Text extraction failed and Gemini Vision not available')
      }

      if (downloadResult.mimeType !== 'application/pdf') {
        throw new Error(`Text extraction failed for non-PDF document (${downloadResult.mimeType})`)
      }

      console.log(`      👁️ Using Gemini Vision for scanned PDF...`)
      const visionResult = await this.geminiVisionAdapter.extractFromPdf(originalBuffer)

      console.log(`      📈 Vision extracted ${visionResult.clauses.length} clauses in ${visionResult.telemetry.extractionTimeMs}ms`)

      // Save vision-extracted clauses
      if (visionResult.clauses.length > 0) {
        const clauseInputs: ExtractedClauseInput[] = visionResult.clauses.map(clause => ({
          content: clause.content,
          clause_type: clause.clause_type,
          confidence: clause.confidence,
          start_index: clause.start_index,
          end_index: clause.end_index,
          rag_status: clause.rag_status,
          section_title: clause.section_title,
          summary: clause.summary,
        }))

        const saveResult = await saveExtractedClauses(
          this.supabase,
          documentId,
          tenantId,
          clauseInputs
        )

        console.log(`      💾 Saved ${saveResult.inserted} clauses to database (via Vision)`)
      }

      // For vision extraction, we don't have extracted text to save
      // but we can reconstruct it from clauses for display purposes
      const reconstructedText = visionResult.clauses.map(c => c.content).join('\n\n')
      await updateDocumentExtractedText(this.supabase, documentId, reconstructedText)

      return visionResult.clauses.length
    }

    // Step 4: Extract clauses using text-based Gemini (normal path)
    console.log(`      🤖 Calling Gemini for clause extraction...`)
    const extractionResult = await this.geminiExtractor.extract(textResult!.text)

    const invalidCount = extractionResult.validation.clauses_returned - extractionResult.validation.clauses_valid
    console.log(`      📈 Gemini extracted ${extractionResult.clauses.length} clauses in ${extractionResult.telemetry.extractionTimeMs}ms`)
    console.log(`      📈 Validation: ${extractionResult.validation.clauses_valid} valid, ${invalidCount} invalid`)

    // Step 5: Save extracted clauses to database
    if (extractionResult.clauses.length > 0) {
      const clauseInputs: ExtractedClauseInput[] = extractionResult.clauses.map(clause => ({
        content: clause.content,
        clause_type: clause.clause_type,
        confidence: clause.confidence,
        start_index: clause.start_index,
        end_index: clause.end_index,
        rag_status: clause.rag_status,
        section_title: clause.section_title,
        summary: clause.summary,
      }))

      const saveResult = await saveExtractedClauses(
        this.supabase,
        documentId,
        tenantId,
        clauseInputs
      )

      console.log(`      💾 Saved ${saveResult.inserted} clauses to database`)
    }

    // Step 6: Save extracted text to document_repository
    await updateDocumentExtractedText(this.supabase, documentId, textResult!.text)

    return extractionResult.clauses.length
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
