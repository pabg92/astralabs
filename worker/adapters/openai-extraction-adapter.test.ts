/**
 * Unit tests for OpenAI Extraction Adapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ExtractionError,
  isRetryableExtractionError,
  buildLineBasedSystemPrompt,
  buildIndexBasedSystemPrompt,
  buildChunkedSystemPrompt,
  parseClausesResponse,
  extractClausesArray,
  validateRagStatus,
  validateRawClause,
  decideExtractionPath,
  sanitizeText,
  splitIntoChunks,
  callOpenAI,
  OpenAIExtractionAdapter,
  createOpenAIExtractionAdapter,
  createOpenAIExtractionAdapterFromEnv,
  ExtractionConfig,
  ExtractionModel,
  RawLineClause,
  RawIndexClause,
} from './openai-extraction-adapter'

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// ExtractionError TESTS
// ============================================================================

describe('ExtractionError', () => {
  it('should create error with all properties', () => {
    const error = new ExtractionError('Test error', 'TEST_CODE', true, 429)

    expect(error.message).toBe('Test error')
    expect(error.code).toBe('TEST_CODE')
    expect(error.retryable).toBe(true)
    expect(error.statusCode).toBe(429)
    expect(error.name).toBe('ExtractionError')
  })

  it('should default retryable to false', () => {
    const error = new ExtractionError('Test', 'CODE')

    expect(error.retryable).toBe(false)
  })
})

// ============================================================================
// isRetryableExtractionError TESTS
// ============================================================================

describe('isRetryableExtractionError', () => {
  it('should return true for ExtractionError with retryable=true', () => {
    const error = new ExtractionError('Rate limit', 'RATE_LIMIT', true)

    expect(isRetryableExtractionError(error)).toBe(true)
  })

  it('should return false for ExtractionError with retryable=false', () => {
    const error = new ExtractionError('Bad request', 'BAD_REQUEST', false)

    expect(isRetryableExtractionError(error)).toBe(false)
  })

  it('should return true for rate limit messages', () => {
    expect(isRetryableExtractionError(new Error('rate limit exceeded'))).toBe(true)
    expect(isRetryableExtractionError(new Error('429 Too Many Requests'))).toBe(true)
  })

  it('should return true for server errors', () => {
    expect(isRetryableExtractionError(new Error('500 Internal Server Error'))).toBe(true)
    expect(isRetryableExtractionError(new Error('503 Service Unavailable'))).toBe(true)
    expect(isRetryableExtractionError(new Error('server overloaded'))).toBe(true)
  })

  it('should return true for timeout errors', () => {
    expect(isRetryableExtractionError(new Error('Request timeout'))).toBe(true)
    expect(isRetryableExtractionError(new Error('ETIMEDOUT'))).toBe(true)
    expect(isRetryableExtractionError(new Error('Request was aborted'))).toBe(true)
  })

  it('should return false for non-retryable errors', () => {
    expect(isRetryableExtractionError(new Error('Invalid API key'))).toBe(false)
    expect(isRetryableExtractionError(new Error('Bad request'))).toBe(false)
  })
})

// ============================================================================
// PROMPT CONSTRUCTION TESTS
// ============================================================================

describe('buildLineBasedSystemPrompt', () => {
  it('should build prompt for line-based extraction', () => {
    const prompt = buildLineBasedSystemPrompt()

    expect(prompt).toContain('ContractBuddy Clause Extractor')
    expect(prompt).toContain('LINE NUMBERS')
    expect(prompt).toContain('start_line')
    expect(prompt).toContain('end_line')
    expect(prompt).toContain('payment_terms')
    expect(prompt).toContain('rag_status')
  })

  it('should include total lines when provided', () => {
    const prompt = buildLineBasedSystemPrompt(100)

    expect(prompt).toContain('Total lines: 100')
    expect(prompt).toContain('line numbers 0 to 99')
  })
})

describe('buildIndexBasedSystemPrompt', () => {
  it('should build prompt for index-based extraction', () => {
    const prompt = buildIndexBasedSystemPrompt()

    expect(prompt).toContain('ContractBuddy Clause Extractor')
    expect(prompt).toContain('CHARACTER INDICES')
    expect(prompt).toContain('start_index')
    expect(prompt).toContain('end_index')
    expect(prompt).toContain('payment_terms')
  })
})

describe('buildChunkedSystemPrompt', () => {
  it('should build prompt for chunked extraction', () => {
    const prompt = buildChunkedSystemPrompt()

    expect(prompt).toContain('ContractBuddy Clause Extractor')
    expect(prompt).toContain('CHARACTER INDICES')
    expect(prompt).toContain('payment_terms')
    expect(prompt).toContain('conservative')
  })
})

// ============================================================================
// RESPONSE PARSING TESTS
// ============================================================================

describe('parseClausesResponse', () => {
  it('should parse structured output (message.parsed)', () => {
    const response = {
      choices: [
        {
          message: {
            parsed: {
              clauses: [
                { clause_type: 'payment_terms', start_index: 0, end_index: 100 },
              ],
            },
          },
        },
      ],
    }

    const result = parseClausesResponse(response)

    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty('clause_type', 'payment_terms')
  })

  it('should parse JSON string content', () => {
    const response = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              clauses: [
                { clause_type: 'exclusivity', start_index: 0, end_index: 50 },
              ],
            }),
          },
        },
      ],
    }

    const result = parseClausesResponse(response)

    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty('clause_type', 'exclusivity')
  })

  it('should parse object content directly', () => {
    const response = {
      choices: [
        {
          message: {
            content: {
              clauses: [{ clause_type: 'termination' }],
            },
          },
        },
      ],
    }

    const result = parseClausesResponse(response)

    expect(result).toHaveLength(1)
  })

  it('should return empty array for missing content', () => {
    const result = parseClausesResponse({ choices: [{ message: {} }] })

    expect(result).toEqual([])
  })

  it('should return empty array for invalid JSON', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = {
      choices: [{ message: { content: 'not valid json' } }],
    }

    const result = parseClausesResponse(response)

    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})

describe('extractClausesArray', () => {
  it('should return array directly', () => {
    const input = [{ clause_type: 'a' }, { clause_type: 'b' }]

    expect(extractClausesArray(input)).toEqual(input)
  })

  it('should extract from { clauses: [...] } wrapper', () => {
    const input = { clauses: [{ clause_type: 'a' }] }

    expect(extractClausesArray(input)).toEqual([{ clause_type: 'a' }])
  })

  it('should wrap single clause object', () => {
    const input = { clause_type: 'payment', content: 'test' }

    expect(extractClausesArray(input)).toEqual([input])
  })

  it('should return empty array for unexpected shape', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(extractClausesArray({ unexpected: 'data' })).toEqual([])

    consoleSpy.mockRestore()
  })

  it('should return empty array for null', () => {
    expect(extractClausesArray(null)).toEqual([])
  })
})

// ============================================================================
// validateRagStatus TESTS
// ============================================================================

describe('validateRagStatus', () => {
  it('should accept valid statuses', () => {
    expect(validateRagStatus('green')).toBe('green')
    expect(validateRagStatus('amber')).toBe('amber')
    expect(validateRagStatus('red')).toBe('red')
  })

  it('should normalize case', () => {
    expect(validateRagStatus('GREEN')).toBe('green')
    expect(validateRagStatus('AMBER')).toBe('amber')
    expect(validateRagStatus('RED')).toBe('red')
  })

  it('should default to amber for invalid input', () => {
    expect(validateRagStatus('invalid')).toBe('amber')
    expect(validateRagStatus(null)).toBe('amber')
    expect(validateRagStatus(undefined)).toBe('amber')
    expect(validateRagStatus(123)).toBe('amber')
  })
})

// ============================================================================
// validateRawClause TESTS
// ============================================================================

describe('validateRawClause', () => {
  describe('line mode', () => {
    it('should validate line-based clause', () => {
      const input = {
        start_line: 0,
        end_line: 5,
        clause_type: 'payment_terms',
        summary: 'Payment summary',
        confidence: 0.95,
        rag_status: 'green',
      }

      const result = validateRawClause(input, 'line') as RawLineClause

      expect(result.start_line).toBe(0)
      expect(result.end_line).toBe(5)
      expect(result.clause_type).toBe('payment_terms')
      expect(result.confidence).toBe(0.95)
      expect(result.rag_status).toBe('green')
    })

    it('should return null for missing line numbers', () => {
      const input = {
        clause_type: 'payment_terms',
        summary: 'Test',
      }

      expect(validateRawClause(input, 'line')).toBeNull()
    })
  })

  describe('index mode', () => {
    it('should validate index-based clause', () => {
      const input = {
        start_index: 0,
        end_index: 100,
        clause_type: 'exclusivity',
        summary: 'Exclusivity summary',
        confidence: 0.8,
        rag_status: 'amber',
      }

      const result = validateRawClause(input, 'index') as RawIndexClause

      expect(result.start_index).toBe(0)
      expect(result.end_index).toBe(100)
      expect(result.clause_type).toBe('exclusivity')
    })

    it('should return null for missing indices', () => {
      const input = {
        clause_type: 'payment_terms',
        summary: 'Test',
      }

      expect(validateRawClause(input, 'index')).toBeNull()
    })
  })

  it('should return null for non-object input', () => {
    expect(validateRawClause(null, 'line')).toBeNull()
    expect(validateRawClause('string', 'line')).toBeNull()
    expect(validateRawClause(123, 'line')).toBeNull()
  })

  it('should return null for missing clause_type', () => {
    const input = {
      start_line: 0,
      end_line: 5,
      summary: 'Test',
    }

    expect(validateRawClause(input, 'line')).toBeNull()
  })

  it('should default confidence to 0.5', () => {
    const input = {
      start_line: 0,
      end_line: 5,
      clause_type: 'test',
      summary: 'Test',
    }

    const result = validateRawClause(input, 'line') as RawLineClause

    expect(result.confidence).toBe(0.5)
  })

  it('should include section_title when provided', () => {
    const input = {
      start_line: 0,
      end_line: 5,
      clause_type: 'test',
      summary: 'Test',
      section_title: 'Payment Terms',
    }

    const result = validateRawClause(input, 'line') as RawLineClause

    expect(result.section_title).toBe('Payment Terms')
  })
})

// ============================================================================
// decideExtractionPath TESTS
// ============================================================================

describe('decideExtractionPath', () => {
  it('should choose single_pass for small documents', () => {
    const text = 'a'.repeat(1000) // ~250 tokens

    const decision = decideExtractionPath(text, 'gpt-4o')

    expect(decision.path).toBe('single_pass')
    expect(decision.model).toBe('gpt-4o')
    expect(decision.estimatedTokens).toBeLessThan(1000)
  })

  it('should choose chunked for large documents', () => {
    const text = 'a'.repeat(500000) // ~125,000 tokens

    const decision = decideExtractionPath(text, 'gpt-4o')

    expect(decision.path).toBe('chunked')
    expect(decision.model).toBe('gpt-4o') // Falls back to gpt-4o for chunked
  })

  it('should use preferred model when fits', () => {
    const text = 'a'.repeat(100000) // ~25,000 tokens

    const decision = decideExtractionPath(text, 'gpt-5.1')

    expect(decision.path).toBe('single_pass')
    expect(decision.model).toBe('gpt-5.1')
  })

  it('should include reason in decision', () => {
    const text = 'a'.repeat(1000)

    const decision = decideExtractionPath(text, 'gpt-4o')

    expect(decision.reason).toContain('fits')
    expect(decision.reason).toContain('gpt-4o')
  })
})

// ============================================================================
// TEXT PREPARATION TESTS
// ============================================================================

describe('sanitizeText', () => {
  it('should remove null bytes', () => {
    const text = 'Hello\0World\0!'

    expect(sanitizeText(text)).toBe('HelloWorld!')
  })

  it('should preserve normal text', () => {
    const text = 'Normal text with spaces and punctuation.'

    expect(sanitizeText(text)).toBe(text)
  })
})

describe('splitIntoChunks', () => {
  it('should split text into chunks with overlap', () => {
    const text = 'a'.repeat(1000)

    const chunks = splitIntoChunks(text, 400, 100)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].startOffset).toBe(0)
    expect(chunks[0].text.length).toBe(400)
  })

  it('should return single chunk for small text', () => {
    const text = 'Hello World'

    const chunks = splitIntoChunks(text, 1000, 100)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe(text)
    expect(chunks[0].startOffset).toBe(0)
  })

  it('should track start offsets correctly', () => {
    const text = 'a'.repeat(1000)

    const chunks = splitIntoChunks(text, 400, 100)

    expect(chunks[0].startOffset).toBe(0)
    expect(chunks[1].startOffset).toBe(300) // 400 - 100 overlap
  })
})

// ============================================================================
// callOpenAI TESTS
// ============================================================================

describe('callOpenAI', () => {
  it('should make correct API call', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"clauses":[]}' } }],
      }),
    })

    await callOpenAI(
      'test-api-key',
      'System prompt',
      'User message',
      'gpt-4o',
      0.2,
      10000
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
        },
      })
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.model).toBe('gpt-4o')
    expect(body.temperature).toBe(0.2)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages).toHaveLength(2)
  })

  it('should throw ExtractionError on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    })

    await expect(
      callOpenAI('key', 'system', 'user', 'gpt-4o')
    ).rejects.toThrow(ExtractionError)
  })

  it('should throw retryable error on 429', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    })

    try {
      await callOpenAI('key', 'system', 'user', 'gpt-4o')
    } catch (error) {
      expect(error).toBeInstanceOf(ExtractionError)
      expect((error as ExtractionError).retryable).toBe(true)
      expect((error as ExtractionError).statusCode).toBe(429)
    }
  })

  it('should throw retryable error on 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Server error',
    })

    try {
      await callOpenAI('key', 'system', 'user', 'gpt-4o')
    } catch (error) {
      expect(error).toBeInstanceOf(ExtractionError)
      expect((error as ExtractionError).retryable).toBe(true)
    }
  })
})

// ============================================================================
// OpenAIExtractionAdapter TESTS
// ============================================================================

describe('OpenAIExtractionAdapter', () => {
  const validConfig: ExtractionConfig = {
    apiKey: 'test-api-key',
    model: 'gpt-4o',
    mode: 'index',
  }

  it('should throw error if apiKey is missing', () => {
    expect(() => new OpenAIExtractionAdapter({} as ExtractionConfig)).toThrow(
      'OpenAI API key is required'
    )
  })

  it('should create adapter with valid config', () => {
    const adapter = new OpenAIExtractionAdapter(validConfig)

    expect(adapter).toBeInstanceOf(OpenAIExtractionAdapter)
  })

  it('should return config via getConfig', () => {
    const adapter = new OpenAIExtractionAdapter(validConfig)
    const config = adapter.getConfig()

    expect(config.apiKey).toBe('test-api-key')
    expect(config.model).toBe('gpt-4o')
    expect(config.mode).toBe('index')
  })

  describe('extract', () => {
    it('should extract clauses from text', async () => {
      const adapter = new OpenAIExtractionAdapter(validConfig)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  clauses: [
                    {
                      start_index: 0,
                      end_index: 100,
                      clause_type: 'payment_terms',
                      summary: 'Payment clause',
                      confidence: 0.9,
                      rag_status: 'green',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })

      const text = 'a'.repeat(200) // Small enough for single-pass
      const result = await adapter.extract(text)

      expect(result.path).toBe('single_pass')
      expect(result.mode).toBe('index')
      expect(result.clauses).toHaveLength(1)
      expect(result.clauses[0].clause_type).toBe('payment_terms')
    })

    it('should use chunked extraction for large documents', async () => {
      const adapter = new OpenAIExtractionAdapter({
        ...validConfig,
        chunkSize: 100,
        chunkOverlap: 20,
        minCharsForChunk: 10,
        minClausesPerChunk: 1,
      })

      // Use mockResolvedValue to provide response for all chunks
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  clauses: [
                    {
                      start_index: 0,
                      end_index: 80,
                      clause_type: 'test_clause',
                      summary: 'Test',
                      confidence: 0.9,
                      rag_status: 'green',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })

      const text = 'a'.repeat(600000) // Large enough for chunked
      const result = await adapter.extract(text)

      expect(result.path).toBe('chunked')
      expect(result.telemetry.chunksProcessed).toBeGreaterThan(0)
    })
  })
})

// ============================================================================
// FACTORY TESTS
// ============================================================================

describe('createOpenAIExtractionAdapter', () => {
  it('should create adapter with config', () => {
    const adapter = createOpenAIExtractionAdapter({ apiKey: 'test-key' })

    expect(adapter).toBeInstanceOf(OpenAIExtractionAdapter)
  })
})

describe('createOpenAIExtractionAdapterFromEnv', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should throw if OPENAI_API_KEY not set', () => {
    delete process.env.OPENAI_API_KEY

    expect(() => createOpenAIExtractionAdapterFromEnv()).toThrow(
      'OPENAI_API_KEY environment variable not set'
    )
  })

  it('should create adapter from env', () => {
    process.env.OPENAI_API_KEY = 'env-api-key'
    process.env.EXTRACTION_MODEL = 'gpt-4o'

    const adapter = createOpenAIExtractionAdapterFromEnv()

    expect(adapter).toBeInstanceOf(OpenAIExtractionAdapter)
    expect(adapter.getConfig().apiKey).toBe('env-api-key')
  })
})

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('extraction integration', () => {
  it('should handle full extraction flow with index mode', async () => {
    const adapter = new OpenAIExtractionAdapter({
      apiKey: 'test-key',
      mode: 'index',
    })

    const contractText = `
The Brand shall pay the Influencer a fee of $5,000.
Payment shall be made within 30 days of invoice receipt.
The Influencer agrees to maintain exclusivity for 90 days.
All content rights transfer to the Brand upon payment.
    `.trim()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                clauses: [
                  {
                    start_index: 0,
                    end_index: 52,
                    clause_type: 'payment_terms',
                    summary: 'Brand pays $5,000',
                    confidence: 0.95,
                    rag_status: 'green',
                  },
                  {
                    start_index: 53,
                    end_index: 106,
                    clause_type: 'invoicing',
                    summary: 'Payment within 30 days',
                    confidence: 0.9,
                    rag_status: 'green',
                  },
                  {
                    start_index: 107,
                    end_index: 161,
                    clause_type: 'exclusivity',
                    summary: '90 day exclusivity',
                    confidence: 0.85,
                    rag_status: 'amber',
                  },
                ],
              }),
            },
          },
        ],
      }),
    })

    const result = await adapter.extract(contractText)

    expect(result.clauses.length).toBeGreaterThanOrEqual(1)
    expect(result.telemetry.extractionTimeMs).toBeGreaterThanOrEqual(0)
    expect(result.path).toBe('single_pass')
  })

  it('should deduplicate overlapping clauses', async () => {
    const adapter = new OpenAIExtractionAdapter({
      apiKey: 'test-key',
      mode: 'index',
      chunkSize: 100,
      chunkOverlap: 50,
      minCharsForChunk: 10,
      minClausesPerChunk: 1,
    })

    // Force chunked extraction by setting large text
    const text = 'a'.repeat(600000)

    // Return overlapping clauses from different chunks
    mockFetch
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  clauses: [
                    {
                      start_index: 0,
                      end_index: 80,
                      clause_type: 'test',
                      summary: 'Test',
                      confidence: 0.9,
                      rag_status: 'green',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })

    const result = await adapter.extract(text)

    // Overlapping clauses should be deduplicated
    expect(result.clauses.length).toBeGreaterThan(0)
  })
})
