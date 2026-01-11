import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  StorageError,
  isRetryableStorageError,
  fetchDocumentStorageMetadata,
  downloadFromBucket,
  downloadWithFallback,
  downloadDocument,
  downloadByPath,
  extractFilenameFromPath,
  StorageAdapter,
  createStorageAdapter,
} from './storage-adapter'

describe('storage-adapter', () => {
  describe('StorageError', () => {
    it('creates error with all properties', () => {
      const error = new StorageError('Test error', 'TEST_CODE', 'contracts', '/path/to/file')
      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_CODE')
      expect(error.bucket).toBe('contracts')
      expect(error.path).toBe('/path/to/file')
      expect(error.name).toBe('StorageError')
    })

    it('creates error with optional properties undefined', () => {
      const error = new StorageError('Test error', 'TEST_CODE')
      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_CODE')
      expect(error.bucket).toBeUndefined()
      expect(error.path).toBeUndefined()
    })
  })

  describe('isRetryableStorageError', () => {
    it('returns true for timeout errors', () => {
      expect(isRetryableStorageError(new Error('Connection timeout'))).toBe(true)
      expect(isRetryableStorageError(new Error('Request timeout'))).toBe(true)
    })

    it('returns true for network errors', () => {
      expect(isRetryableStorageError(new Error('Network error'))).toBe(true)
      expect(isRetryableStorageError(new Error('ECONNRESET'))).toBe(true)
      expect(isRetryableStorageError(new Error('ETIMEDOUT'))).toBe(true)
      expect(isRetryableStorageError(new Error('ECONNREFUSED'))).toBe(true)
    })

    it('returns true for 5xx errors', () => {
      expect(isRetryableStorageError(new Error('503 Service Unavailable'))).toBe(true)
      expect(isRetryableStorageError(new Error('500 Internal Server Error'))).toBe(true)
    })

    it('returns false for not found errors', () => {
      expect(isRetryableStorageError(new Error('Object not found'))).toBe(false)
      expect(isRetryableStorageError(new Error('404 Not Found'))).toBe(false)
    })

    it('returns false for permission errors', () => {
      expect(isRetryableStorageError(new Error('403 Forbidden'))).toBe(false)
      expect(isRetryableStorageError(new Error('401 Unauthorized'))).toBe(false)
    })

    it('returns false for generic errors', () => {
      expect(isRetryableStorageError(new Error('Some random error'))).toBe(false)
    })
  })

  describe('extractFilenameFromPath', () => {
    it('extracts filename from full path', () => {
      expect(extractFilenameFromPath('tenant-1/deal-1/contract.pdf')).toBe('contract.pdf')
    })

    it('removes timestamp prefix', () => {
      expect(extractFilenameFromPath('tenant-1/deal-1/1704067200000-contract.pdf')).toBe('contract.pdf')
    })

    it('handles path without slashes', () => {
      expect(extractFilenameFromPath('contract.pdf')).toBe('contract.pdf')
    })

    it('handles empty path', () => {
      expect(extractFilenameFromPath('')).toBe('document')
    })

    it('handles path with multiple slashes', () => {
      expect(extractFilenameFromPath('a/b/c/d/file.docx')).toBe('file.docx')
    })

    it('preserves filename without timestamp', () => {
      expect(extractFilenameFromPath('tenant/deal/myfile.txt')).toBe('myfile.txt')
    })
  })

  describe('fetchDocumentStorageMetadata', () => {
    it('returns metadata for valid document', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'doc-1',
            object_path: 'tenant-1/deal-1/contract.pdf',
            mime_type: 'application/pdf',
            original_filename: 'contract.pdf',
          },
          error: null,
        }),
      }

      const result = await fetchDocumentStorageMetadata(mockSupabase, 'doc-1')
      expect(result.id).toBe('doc-1')
      expect(result.object_path).toBe('tenant-1/deal-1/contract.pdf')
      expect(result.mime_type).toBe('application/pdf')
      expect(result.original_filename).toBe('contract.pdf')
    })

    it('throws StorageError for missing document', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      }

      await expect(fetchDocumentStorageMetadata(mockSupabase, 'missing'))
        .rejects.toThrow(StorageError)
      await expect(fetchDocumentStorageMetadata(mockSupabase, 'missing'))
        .rejects.toThrow('Document not found: missing')
    })

    it('throws StorageError for document without object_path', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'doc-1', object_path: null },
          error: null,
        }),
      }

      await expect(fetchDocumentStorageMetadata(mockSupabase, 'doc-1'))
        .rejects.toThrow('Document has no storage path')
    })

    it('throws StorageError when data is null without error', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }

      await expect(fetchDocumentStorageMetadata(mockSupabase, 'doc-1'))
        .rejects.toThrow(StorageError)
    })
  })

  describe('downloadFromBucket', () => {
    it('returns blob on successful download', async () => {
      const mockBlob = new Blob(['test content'])
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
          }),
        },
      }

      const result = await downloadFromBucket(mockSupabase, 'contracts', 'path/to/file')
      expect(result).toBe(mockBlob)
    })

    it('returns null for not found error with message', async () => {
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Object not found' },
            }),
          }),
        },
      }

      const result = await downloadFromBucket(mockSupabase, 'contracts', 'path/to/file')
      expect(result).toBeNull()
    })

    it('returns null for 404 status code', async () => {
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Error', statusCode: 404 },
            }),
          }),
        },
      }

      const result = await downloadFromBucket(mockSupabase, 'contracts', 'path/to/file')
      expect(result).toBeNull()
    })

    it('returns null for 404 status', async () => {
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Error', status: 404 },
            }),
          }),
        },
      }

      const result = await downloadFromBucket(mockSupabase, 'contracts', 'path/to/file')
      expect(result).toBeNull()
    })

    it('throws StorageError for other errors', async () => {
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Permission denied' },
            }),
          }),
        },
      }

      await expect(downloadFromBucket(mockSupabase, 'contracts', 'path/to/file'))
        .rejects.toThrow(StorageError)
      await expect(downloadFromBucket(mockSupabase, 'contracts', 'path/to/file'))
        .rejects.toThrow('Download failed from contracts')
    })
  })

  describe('downloadWithFallback', () => {
    it('returns from primary bucket if found', async () => {
      const mockBlob = new Blob(['primary content'])
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
          }),
        },
      }

      const result = await downloadWithFallback(mockSupabase, 'path/to/file')
      expect(result.blob).toBe(mockBlob)
      expect(result.bucket).toBe('contracts')
    })

    it('falls back to documents bucket if primary fails', async () => {
      const mockBlob = new Blob(['fallback content'])
      const mockSupabase = {
        storage: {
          from: vi.fn().mockImplementation((bucket) => ({
            download: vi.fn().mockResolvedValue(
              bucket === 'contracts'
                ? { data: null, error: { message: 'Object not found', statusCode: 404 } }
                : { data: mockBlob, error: null }
            ),
          })),
        },
      }

      const result = await downloadWithFallback(mockSupabase, 'path/to/file')
      expect(result.blob).toBe(mockBlob)
      expect(result.bucket).toBe('documents')
    })

    it('throws if file not found in any bucket', async () => {
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Object not found', statusCode: 404 },
            }),
          }),
        },
      }

      await expect(downloadWithFallback(mockSupabase, 'path/to/file'))
        .rejects.toThrow('File not found in any bucket')
    })

    it('uses custom config buckets', async () => {
      const mockBlob = new Blob(['custom content'])
      const fromMock = vi.fn().mockImplementation((bucket) => ({
        download: vi.fn().mockResolvedValue(
          bucket === 'custom-primary'
            ? { data: mockBlob, error: null }
            : { data: null, error: { message: 'Object not found' } }
        ),
      }))
      const mockSupabase = {
        storage: { from: fromMock },
      }

      const result = await downloadWithFallback(mockSupabase, 'path/to/file', {
        primaryBucket: 'custom-primary',
        fallbackBucket: 'custom-fallback',
      })
      expect(result.bucket).toBe('custom-primary')
      expect(fromMock).toHaveBeenCalledWith('custom-primary')
    })
  })

  describe('downloadDocument', () => {
    it('downloads document with full metadata', async () => {
      const mockBlob = new Blob(['test content'])
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'doc-1',
            object_path: 'tenant-1/deal-1/1704067200000-contract.pdf',
            mime_type: 'application/pdf',
            original_filename: 'contract.pdf',
          },
          error: null,
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
          }),
        },
      }

      const result = await downloadDocument(mockSupabase, 'doc-1')
      expect(result.mimeType).toBe('application/pdf')
      expect(result.filename).toBe('contract.pdf')
      expect(result.bucket).toBe('contracts')
      expect(result.buffer).toBeInstanceOf(ArrayBuffer)
      expect(result.storagePath).toBe('tenant-1/deal-1/1704067200000-contract.pdf')
    })

    it('uses default MIME type if not in metadata', async () => {
      const mockBlob = new Blob(['test content'])
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'doc-1',
            object_path: 'tenant-1/deal-1/file.bin',
            mime_type: null,
            original_filename: null,
          },
          error: null,
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
          }),
        },
      }

      const result = await downloadDocument(mockSupabase, 'doc-1')
      expect(result.mimeType).toBe('application/pdf')
      expect(result.filename).toBe('file.bin')
    })

    it('extracts filename from path when original_filename is null', async () => {
      const mockBlob = new Blob(['test content'])
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'doc-1',
            object_path: 'tenant-1/deal-1/1704067200000-mycontract.pdf',
            mime_type: 'application/pdf',
            original_filename: null,
          },
          error: null,
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
          }),
        },
      }

      const result = await downloadDocument(mockSupabase, 'doc-1')
      expect(result.filename).toBe('mycontract.pdf')
    })
  })

  describe('downloadByPath', () => {
    it('downloads by path without metadata lookup', async () => {
      const mockBlob = new Blob(['test content'])
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
          }),
        },
      }

      const result = await downloadByPath(mockSupabase, 'path/to/file.pdf', 'application/pdf')
      expect(result.mimeType).toBe('application/pdf')
      expect(result.filename).toBe('file.pdf')
      expect(result.bucket).toBe('contracts')
      expect(result.storagePath).toBe('path/to/file.pdf')
    })

    it('uses default MIME type when not provided', async () => {
      const mockBlob = new Blob(['test content'])
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
          }),
        },
      }

      const result = await downloadByPath(mockSupabase, 'path/to/file.bin')
      expect(result.mimeType).toBe('application/pdf')
    })

    it('uses custom default MIME type from config', async () => {
      const mockBlob = new Blob(['test content'])
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
          }),
        },
      }

      const result = await downloadByPath(mockSupabase, 'path/to/file.bin', undefined, {
        defaultMimeType: 'application/octet-stream',
      })
      expect(result.mimeType).toBe('application/octet-stream')
    })
  })

  describe('StorageAdapter class', () => {
    it('can be instantiated', () => {
      const mockSupabase = {}
      const adapter = new StorageAdapter(mockSupabase)
      expect(adapter).toBeInstanceOf(StorageAdapter)
    })

    it('can be instantiated with custom config', () => {
      const mockSupabase = {}
      const adapter = new StorageAdapter(mockSupabase, { maxRetries: 5 })
      expect(adapter).toBeInstanceOf(StorageAdapter)
    })

    it('downloadDocument delegates to function', async () => {
      const mockBlob = new Blob(['test'])
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'doc-1',
            object_path: 'path/to/file.pdf',
            mime_type: 'application/pdf',
            original_filename: 'file.pdf',
          },
          error: null,
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
          }),
        },
      }

      const adapter = new StorageAdapter(mockSupabase)
      const result = await adapter.downloadDocument('doc-1')
      expect(result.mimeType).toBe('application/pdf')
    })

    it('downloadByPath delegates to function', async () => {
      const mockBlob = new Blob(['test'])
      const mockSupabase = {
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
          }),
        },
      }

      const adapter = new StorageAdapter(mockSupabase)
      const result = await adapter.downloadByPath('path/to/file.pdf', 'application/pdf')
      expect(result.mimeType).toBe('application/pdf')
    })

    it('fetchMetadata delegates to function', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'doc-1',
            object_path: 'path/to/file.pdf',
            mime_type: 'application/pdf',
            original_filename: 'file.pdf',
          },
          error: null,
        }),
      }

      const adapter = new StorageAdapter(mockSupabase)
      const result = await adapter.fetchMetadata('doc-1')
      expect(result.id).toBe('doc-1')
    })
  })

  describe('createStorageAdapter', () => {
    it('creates adapter with default config', () => {
      const mockSupabase = {}
      const adapter = createStorageAdapter(mockSupabase)
      expect(adapter).toBeInstanceOf(StorageAdapter)
    })

    it('creates adapter with custom config', () => {
      const mockSupabase = {}
      const adapter = createStorageAdapter(mockSupabase, { maxRetries: 5 })
      expect(adapter).toBeInstanceOf(StorageAdapter)
    })
  })
})
