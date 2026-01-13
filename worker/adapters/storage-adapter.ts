/**
 * Storage Download Adapter
 * Downloads files from Supabase Storage with retry logic and bucket fallback
 * Ported from supabase/functions/extract-clauses/index.ts
 */

import { withRetry, isTransientError } from '../utils/retry.js'
import type { TypedSupabaseClient } from '../types/supabase.js'
import { getErrorMessage } from '../types/errors.js'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of a storage download operation
 */
export interface StorageDownloadResult {
  /** File content as ArrayBuffer */
  buffer: ArrayBuffer
  /** MIME type of the file */
  mimeType: string
  /** Original filename */
  filename: string
  /** Storage path where file was found */
  storagePath: string
  /** Bucket where file was found */
  bucket: 'contracts' | 'documents'
}

/**
 * Document metadata from database
 */
export interface DocumentStorageMetadata {
  id: string
  object_path: string
  mime_type: string | null
  original_filename: string | null
}

/**
 * Configuration for storage operations
 */
export interface StorageConfig {
  /** Primary bucket to try first (default: 'contracts') */
  primaryBucket?: string
  /** Fallback bucket if primary fails (default: 'documents') */
  fallbackBucket?: string
  /** Maximum retry attempts for transient errors (default: 3) */
  maxRetries?: number
  /** Default MIME type if not found in metadata (default: 'application/pdf') */
  defaultMimeType?: string
}

const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  primaryBucket: 'contracts',
  fallbackBucket: 'documents',
  maxRetries: 3,
  defaultMimeType: 'application/pdf',
}

// ============================================================================
// STORAGE ERROR HELPERS
// ============================================================================

/**
 * Storage-specific error class
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly bucket?: string,
    public readonly path?: string
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

/**
 * Checks if a storage error is retryable (transient)
 */
export function isRetryableStorageError(error: unknown): boolean {
  // Check for transient network errors
  if (isTransientError(error)) return true

  // Check for specific storage error codes that are retryable
  const errorMessage = getErrorMessage(error)

  // Supabase storage may return these for transient issues
  if (/timeout/i.test(errorMessage)) return true
  if (/network/i.test(errorMessage)) return true
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED/i.test(errorMessage)) return true

  return false
}

// ============================================================================
// METADATA FUNCTIONS
// ============================================================================

/**
 * Fetches document storage metadata from the database
 */
export async function fetchDocumentStorageMetadata(
  supabase: TypedSupabaseClient,
  documentId: string
): Promise<DocumentStorageMetadata> {
  const { data, error } = await supabase
    .from('document_repository')
    .select('id, object_path, mime_type, original_filename')
    .eq('id', documentId)
    .single()

  if (error || !data) {
    throw new StorageError(
      `Document not found: ${documentId}`,
      'NOT_FOUND',
      undefined,
      undefined
    )
  }

  if (!data.object_path) {
    throw new StorageError(
      `Document has no storage path: ${documentId}`,
      'NO_STORAGE_PATH',
      undefined,
      undefined
    )
  }

  return data as DocumentStorageMetadata
}

// ============================================================================
// DOWNLOAD FUNCTIONS
// ============================================================================

/**
 * Downloads a file from a specific storage bucket
 * Returns null if file not found in bucket (for fallback logic)
 * Throws for other errors
 */
export async function downloadFromBucket(
  supabase: TypedSupabaseClient,
  bucket: string,
  path: string
): Promise<Blob | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path)

  if (error) {
    // Check if it's a "not found" error - return null to try fallback
    const errorMessage = String(error.message || '')
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Object not found') ||
      error.statusCode === '404' ||
      error.statusCode === 404 ||
      (error as { status?: number }).status === 404
    ) {
      return null
    }

    // For other errors, throw
    throw new StorageError(
      `Download failed from ${bucket}: ${errorMessage}`,
      'DOWNLOAD_ERROR',
      bucket,
      path
    )
  }

  return data
}

/**
 * Downloads a file with bucket fallback logic
 * Tries primary bucket first, then fallback bucket
 */
export async function downloadWithFallback(
  supabase: TypedSupabaseClient,
  path: string,
  config: StorageConfig = DEFAULT_STORAGE_CONFIG
): Promise<{ blob: Blob; bucket: 'contracts' | 'documents' }> {
  const primaryBucket = config.primaryBucket || 'contracts'
  const fallbackBucket = config.fallbackBucket || 'documents'

  // Try primary bucket first
  const primaryResult = await downloadFromBucket(supabase, primaryBucket, path)
  if (primaryResult) {
    return { blob: primaryResult, bucket: primaryBucket as 'contracts' | 'documents' }
  }

  // Try fallback bucket
  const fallbackResult = await downloadFromBucket(supabase, fallbackBucket, path)
  if (fallbackResult) {
    return { blob: fallbackResult, bucket: fallbackBucket as 'contracts' | 'documents' }
  }

  // Neither bucket had the file
  throw new StorageError(
    `File not found in any bucket: ${path}`,
    'NOT_FOUND',
    undefined,
    path
  )
}

/**
 * Downloads a file with retry logic for transient errors
 */
export async function downloadWithRetry(
  supabase: TypedSupabaseClient,
  path: string,
  config: StorageConfig = DEFAULT_STORAGE_CONFIG
): Promise<{ blob: Blob; bucket: 'contracts' | 'documents' }> {
  const maxRetries = config.maxRetries ?? 3

  return withRetry(
    () => downloadWithFallback(supabase, path, config),
    {
      maxRetries,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    },
    isRetryableStorageError,
    `storage-download:${path}`
  )
}

// ============================================================================
// MAIN DOWNLOAD FUNCTION
// ============================================================================

/**
 * Downloads a document by ID with full metadata resolution
 *
 * @param supabase - Supabase client instance
 * @param documentId - Document ID to download
 * @param config - Optional storage configuration
 * @returns StorageDownloadResult with buffer, mimeType, and metadata
 */
export async function downloadDocument(
  supabase: TypedSupabaseClient,
  documentId: string,
  config: StorageConfig = DEFAULT_STORAGE_CONFIG
): Promise<StorageDownloadResult> {
  // Step 1: Fetch document metadata
  const metadata = await fetchDocumentStorageMetadata(supabase, documentId)

  // Step 2: Download file with retry and fallback
  const { blob, bucket } = await downloadWithRetry(supabase, metadata.object_path, config)

  // Step 3: Convert Blob to ArrayBuffer
  const buffer = await blob.arrayBuffer()

  // Step 4: Resolve MIME type
  const mimeType = metadata.mime_type || config.defaultMimeType || 'application/pdf'

  // Step 5: Resolve filename
  const filename = metadata.original_filename || extractFilenameFromPath(metadata.object_path)

  return {
    buffer,
    mimeType,
    filename,
    storagePath: metadata.object_path,
    bucket,
  }
}

/**
 * Downloads a file directly by path (without metadata lookup)
 *
 * @param supabase - Supabase client instance
 * @param path - Storage path to download
 * @param mimeType - Known MIME type (or uses default)
 * @param config - Optional storage configuration
 * @returns StorageDownloadResult with buffer and metadata
 */
export async function downloadByPath(
  supabase: TypedSupabaseClient,
  path: string,
  mimeType?: string,
  config: StorageConfig = DEFAULT_STORAGE_CONFIG
): Promise<StorageDownloadResult> {
  // Download with retry and fallback
  const { blob, bucket } = await downloadWithRetry(supabase, path, config)

  // Convert to ArrayBuffer
  const buffer = await blob.arrayBuffer()

  return {
    buffer,
    mimeType: mimeType || config.defaultMimeType || 'application/pdf',
    filename: extractFilenameFromPath(path),
    storagePath: path,
    bucket,
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extracts filename from a storage path
 * Path format: {tenant_id}/{deal_id}/{timestamp}-{filename}
 */
export function extractFilenameFromPath(path: string): string {
  const parts = path.split('/')
  const lastPart = parts[parts.length - 1] || 'document'

  // Remove timestamp prefix if present (format: 1234567890-filename.pdf)
  const timestampMatch = lastPart.match(/^\d+-(.+)$/)
  if (timestampMatch) {
    return timestampMatch[1]
  }

  return lastPart
}

// ============================================================================
// ADAPTER CLASS
// ============================================================================

/**
 * Storage Adapter class for dependency injection
 */
export class StorageAdapter {
  private supabase: TypedSupabaseClient
  private config: StorageConfig

  constructor(supabase: TypedSupabaseClient, config: StorageConfig = DEFAULT_STORAGE_CONFIG) {
    this.supabase = supabase
    this.config = config
  }

  /**
   * Downloads a document by ID
   */
  async downloadDocument(documentId: string): Promise<StorageDownloadResult> {
    return downloadDocument(this.supabase, documentId, this.config)
  }

  /**
   * Downloads a file by path
   */
  async downloadByPath(path: string, mimeType?: string): Promise<StorageDownloadResult> {
    return downloadByPath(this.supabase, path, mimeType, this.config)
  }

  /**
   * Fetches document storage metadata
   */
  async fetchMetadata(documentId: string): Promise<DocumentStorageMetadata> {
    return fetchDocumentStorageMetadata(this.supabase, documentId)
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates a new StorageAdapter instance
 */
export function createStorageAdapter(
  supabase: TypedSupabaseClient,
  config?: StorageConfig
): StorageAdapter {
  return new StorageAdapter(supabase, config)
}
