import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  EmbeddingError,
  isRetryableEmbeddingError,
  prepareTextForEmbedding,
  prepareTextsForEmbedding,
  callEmbeddingsApi,
  generateEmbeddingsBatch,
  generateEmbeddings,
  generateSingleEmbedding,
  EmbeddingAdapter,
  createEmbeddingAdapter,
  createEmbeddingAdapterFromEnv,
} from './embedding-adapter'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('embedding-adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('EmbeddingError', () => {
    it('creates error with all properties', () => {
      const error = new EmbeddingError('Test error', 'TEST_CODE', 500, true)
      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_CODE')
      expect(error.statusCode).toBe(500)
      expect(error.retryable).toBe(true)
      expect(error.name).toBe('EmbeddingError')
    })

    it('defaults retryable to false', () => {
      const error = new EmbeddingError('Test', 'CODE')
      expect(error.retryable).toBe(false)
    })
  })

  describe('isRetryableEmbeddingError', () => {
    it('returns true for 429 rate limit errors', () => {
      expect(isRetryableEmbeddingError(new Error('429 Too Many Requests'))).toBe(true)
      expect(isRetryableEmbeddingError(new Error('rate limit exceeded'))).toBe(true)
    })

    it('returns true for 5xx server errors', () => {
      expect(isRetryableEmbeddingError(new Error('500 Internal Server Error'))).toBe(true)
      expect(isRetryableEmbeddingError(new Error('503 Service Unavailable'))).toBe(true)
    })

    it('returns true for timeout errors', () => {
      expect(isRetryableEmbeddingError(new Error('Request timeout'))).toBe(true)
      expect(isRetryableEmbeddingError(new Error('ETIMEDOUT'))).toBe(true)
    })

    it('returns true for EmbeddingError with retryable flag', () => {
      const error = new EmbeddingError('Test', 'CODE', 500, true)
      expect(isRetryableEmbeddingError(error)).toBe(true)
    })

    it('returns false for non-retryable errors', () => {
      expect(isRetryableEmbeddingError(new Error('Invalid API key'))).toBe(false)
      expect(isRetryableEmbeddingError(new Error('400 Bad Request'))).toBe(false)
    })

    it('returns false for EmbeddingError with retryable=false', () => {
      const error = new EmbeddingError('Test', 'CODE', 400, false)
      expect(isRetryableEmbeddingError(error)).toBe(false)
    })
  })

  describe('prepareTextForEmbedding', () => {
    it('returns text unchanged if under max chars', () => {
      expect(prepareTextForEmbedding('hello', 2000)).toBe('hello')
    })

    it('truncates text to max chars', () => {
      const longText = 'a'.repeat(3000)
      expect(prepareTextForEmbedding(longText, 2000)).toHaveLength(2000)
    })

    it('handles empty string', () => {
      expect(prepareTextForEmbedding('', 2000)).toBe('')
    })

    it('uses default max chars', () => {
      const longText = 'a'.repeat(3000)
      expect(prepareTextForEmbedding(longText)).toHaveLength(2000)
    })
  })

  describe('prepareTextsForEmbedding', () => {
    it('prepares multiple texts', () => {
      const texts = ['short', 'a'.repeat(3000)]
      const result = prepareTextsForEmbedding(texts, 100)
      expect(result[0]).toBe('short')
      expect(result[1]).toHaveLength(100)
    })
  })

  describe('callEmbeddingsApi', () => {
    const config = { apiKey: 'test-key' }

    it('calls OpenAI API with correct parameters', async () => {
      const mockResponse = {
        object: 'list',
        data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
        model: 'text-embedding-3-large',
        usage: { prompt_tokens: 10, total_tokens: 10 },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await callEmbeddingsApi(['hello'], config)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key',
          },
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it('throws EmbeddingError for missing API key', async () => {
      await expect(callEmbeddingsApi(['hello'], { apiKey: '' }))
        .rejects.toThrow('OpenAI API key is required')
    })

    it('throws EmbeddingError for empty input', async () => {
      await expect(callEmbeddingsApi([], config))
        .rejects.toThrow('No texts provided for embedding')
    })

    it('throws retryable EmbeddingError for 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      })

      try {
        await callEmbeddingsApi(['hello'], config)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingError)
        expect((error as EmbeddingError).retryable).toBe(true)
        expect((error as EmbeddingError).statusCode).toBe(429)
      }
    })

    it('throws retryable EmbeddingError for 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      })

      try {
        await callEmbeddingsApi(['hello'], config)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingError)
        expect((error as EmbeddingError).retryable).toBe(true)
      }
    })

    it('throws non-retryable EmbeddingError for 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      })

      try {
        await callEmbeddingsApi(['hello'], config)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingError)
        expect((error as EmbeddingError).retryable).toBe(false)
      }
    })

    it('uses custom base URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ index: 0, embedding: [0.1] }],
          usage: { total_tokens: 5 },
          model: 'test',
        }),
      })

      await callEmbeddingsApi(['hello'], { ...config, baseUrl: 'https://custom.api.com' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.com/embeddings',
        expect.anything()
      )
    })
  })

  describe('generateEmbeddingsBatch', () => {
    const config = { apiKey: 'test-key' }

    it('returns embeddings in correct order', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { index: 1, embedding: [0.2, 0.3] },
            { index: 0, embedding: [0.1, 0.2] },
          ],
          model: 'text-embedding-3-large',
          usage: { total_tokens: 20 },
        }),
      })

      const result = await generateEmbeddingsBatch(['first', 'second'], config)

      expect(result.embeddings[0].embedding).toEqual([0.1, 0.2])
      expect(result.embeddings[1].embedding).toEqual([0.2, 0.3])
      expect(result.embeddings[0].text).toBe('first')
      expect(result.embeddings[1].text).toBe('second')
    })

    it('truncates long texts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ index: 0, embedding: [0.1] }],
          model: 'test',
          usage: { total_tokens: 5 },
        }),
      })

      const longText = 'a'.repeat(5000)
      await generateEmbeddingsBatch([longText], { ...config, maxChars: 100 })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.input[0]).toHaveLength(100)
    })
  })

  describe('generateEmbeddings', () => {
    const config = { apiKey: 'test-key', batchSize: 2 }

    it('batches texts correctly', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [
              { index: 0, embedding: [0.1] },
              { index: 1, embedding: [0.2] },
            ],
            model: 'test',
            usage: { total_tokens: 10 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [{ index: 0, embedding: [0.3] }],
            model: 'test',
            usage: { total_tokens: 5 },
          }),
        })

      const result = await generateEmbeddings(['a', 'b', 'c'], config)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result.embeddings).toHaveLength(3)
      expect(result.embeddings[0]).toEqual([0.1])
      expect(result.embeddings[1]).toEqual([0.2])
      expect(result.embeddings[2]).toEqual([0.3])
      expect(result.totalTokens).toBe(15)
      expect(result.batchStats).toHaveLength(2)
    })

    it('calls progress callback', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ index: 0, embedding: [0.1] }],
          model: 'test',
          usage: { total_tokens: 5 },
        }),
      })

      const onProgress = vi.fn()
      await generateEmbeddings(['a', 'b'], { ...config, batchSize: 1 }, onProgress)

      expect(onProgress).toHaveBeenCalledTimes(2)
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
        batchNumber: 1,
        totalBatches: 2,
      }))
    })

    it('returns empty result for empty input', async () => {
      const result = await generateEmbeddings([], config)

      expect(result.embeddings).toEqual([])
      expect(result.totalTokens).toBe(0)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('generateSingleEmbedding', () => {
    it('returns single embedding', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
          model: 'text-embedding-3-large',
          usage: { total_tokens: 10 },
        }),
      })

      const result = await generateSingleEmbedding('hello', { apiKey: 'test-key' })

      expect(result.embedding).toEqual([0.1, 0.2, 0.3])
      expect(result.tokens).toBe(10)
      expect(result.model).toBe('text-embedding-3-large')
    })
  })

  describe('EmbeddingAdapter class', () => {
    const config = { apiKey: 'test-key' }

    it('can be instantiated', () => {
      const adapter = new EmbeddingAdapter(config)
      expect(adapter).toBeInstanceOf(EmbeddingAdapter)
    })

    it('getModel returns configured model', () => {
      const adapter = new EmbeddingAdapter({ ...config, model: 'custom-model' })
      expect(adapter.getModel()).toBe('custom-model')
    })

    it('getDimensions returns configured dimensions', () => {
      const adapter = new EmbeddingAdapter({ ...config, dimensions: 512 })
      expect(adapter.getDimensions()).toBe(512)
    })

    it('generateEmbeddings delegates to function', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ index: 0, embedding: [0.1] }],
          model: 'test',
          usage: { total_tokens: 5 },
        }),
      })

      const adapter = new EmbeddingAdapter(config)
      const result = await adapter.generateEmbeddings(['hello'])

      expect(result.embeddings).toHaveLength(1)
    })

    it('generateSingleEmbedding delegates to function', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ index: 0, embedding: [0.1] }],
          model: 'test',
          usage: { total_tokens: 5 },
        }),
      })

      const adapter = new EmbeddingAdapter(config)
      const result = await adapter.generateSingleEmbedding('hello')

      expect(result.embedding).toEqual([0.1])
    })

    it('generateBatch delegates to function', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ index: 0, embedding: [0.1] }],
          model: 'test',
          usage: { total_tokens: 5 },
        }),
      })

      const adapter = new EmbeddingAdapter(config)
      const result = await adapter.generateBatch(['hello'])

      expect(result.embeddings).toHaveLength(1)
      expect(result.totalTokens).toBe(5)
    })
  })

  describe('createEmbeddingAdapter', () => {
    it('creates adapter with config', () => {
      const adapter = createEmbeddingAdapter({ apiKey: 'test-key' })
      expect(adapter).toBeInstanceOf(EmbeddingAdapter)
    })
  })

  describe('createEmbeddingAdapterFromEnv', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('creates adapter from environment', () => {
      process.env.OPENAI_API_KEY = 'env-api-key'
      const adapter = createEmbeddingAdapterFromEnv()
      expect(adapter).toBeInstanceOf(EmbeddingAdapter)
    })

    it('throws if OPENAI_API_KEY not set', () => {
      delete process.env.OPENAI_API_KEY
      expect(() => createEmbeddingAdapterFromEnv()).toThrow('OPENAI_API_KEY environment variable is required')
    })
  })
})
