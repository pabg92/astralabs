/**
 * Integration tests for similarity-adapter
 *
 * These tests connect to the real Supabase database and verify:
 * 1. find_similar_clauses_v2 RPC works with real embeddings
 * 2. Similarity scores match expected values
 * 3. RAG risk calculation is accurate
 * 4. Storage operations work correctly
 *
 * Prerequisites:
 * - Local Supabase running (supabase start)
 * - find_similar_clauses_v2 migration applied
 * - legal_clause_library has data with embeddings
 *
 * Run with: npm test -- --grep "integration"
 * Skip with: npm test -- --grep-invert "integration"
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

import {
  findSimilarClauses,
  findSimilarClausesWithRetry,
  calculateRagRisk,
  formatEmbeddingForPostgres,
  SimilarityAdapter,
  createSimilarityAdapter,
} from './similarity-adapter'

// Load environment from parent directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })

// Check if we should run integration tests
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const canRunIntegrationTests = !!(SUPABASE_URL && SUPABASE_KEY)

// Skip all integration tests if no database connection
const describeIntegration = canRunIntegrationTests ? describe : describe.skip

describeIntegration('similarity-adapter integration tests', () => {
  let supabase: ReturnType<typeof createClient>
  let testEmbedding: number[] | null = null
  let hasClausesWithEmbeddings = false

  beforeAll(async () => {
    // Create Supabase client
    supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!)

    // Check if we have clauses with embeddings to test against
    const { data: clauses, error } = await supabase
      .from('legal_clause_library')
      .select('id, clause_id, embedding')
      .eq('active', true)
      .not('embedding', 'is', null)
      .limit(1)

    if (error) {
      console.warn('Could not fetch test clauses:', error.message)
      return
    }

    if (clauses && clauses.length > 0) {
      hasClausesWithEmbeddings = true
      // Use the first clause's embedding as our test query
      // This should give us at least one match (itself)
      testEmbedding = clauses[0].embedding
      console.log(`Found test clause: ${clauses[0].clause_id}`)
    } else {
      console.warn('No clauses with embeddings found - some tests will be skipped')
    }
  })

  afterAll(async () => {
    // Cleanup if needed
  })

  describe('find_similar_clauses_v2 RPC', () => {
    it('should verify RPC function exists', async () => {
      // Call with empty embedding to verify function exists
      const dummyEmbedding = Array(1024).fill(0)
      const embeddingString = formatEmbeddingForPostgres(dummyEmbedding)

      const { error } = await supabase.rpc('find_similar_clauses_v2', {
        p_query_embedding: embeddingString,
        p_similarity_threshold: 0.99, // High threshold = no matches expected
        p_max_results: 1,
        p_tenant_id: null,
        p_clause_type: null,
      })

      // If function doesn't exist, we get an error
      // If it exists but returns no matches, that's fine
      if (error) {
        console.log('RPC error:', error)
        // Check if it's a "function not found" error vs other error
        expect(error.message).not.toContain('function find_similar_clauses_v2')
      }
    })

    it('should find similar clauses when querying with known embedding', async function () {
      if (!hasClausesWithEmbeddings || !testEmbedding) {
        console.log('Skipping: No clauses with embeddings')
        return
      }

      const result = await findSimilarClauses(supabase, testEmbedding, {
        thresholdMin: 0.60,
        maxResults: 5,
      })

      // Should find at least itself as a match
      expect(result.hasMatches).toBe(true)
      expect(result.matches.length).toBeGreaterThan(0)
      expect(result.topMatch).not.toBeNull()

      // Top match should have high similarity (likely 1.0 for itself)
      expect(result.topMatch!.similarity).toBeGreaterThanOrEqual(0.60)

      console.log(`Found ${result.matches.length} matches`)
      console.log(`Top match: ${result.topMatch!.clause_id} (similarity: ${result.topMatch!.similarity.toFixed(4)})`)
    })

    it('should return sorted results by similarity', async function () {
      if (!hasClausesWithEmbeddings || !testEmbedding) {
        console.log('Skipping: No clauses with embeddings')
        return
      }

      const result = await findSimilarClauses(supabase, testEmbedding, {
        thresholdMin: 0.50, // Lower threshold to get more results
        maxResults: 10,
      })

      if (result.matches.length > 1) {
        // Verify results are sorted by similarity (descending)
        for (let i = 1; i < result.matches.length; i++) {
          expect(result.matches[i - 1].similarity).toBeGreaterThanOrEqual(
            result.matches[i].similarity
          )
        }
      }
    })

    it('should respect similarity threshold', async function () {
      if (!hasClausesWithEmbeddings || !testEmbedding) {
        console.log('Skipping: No clauses with embeddings')
        return
      }

      // Query with very high threshold
      const highThresholdResult = await findSimilarClauses(supabase, testEmbedding, {
        thresholdMin: 0.99,
        maxResults: 10,
      })

      // Query with low threshold
      const lowThresholdResult = await findSimilarClauses(supabase, testEmbedding, {
        thresholdMin: 0.50,
        maxResults: 10,
      })

      // Lower threshold should return equal or more results
      expect(lowThresholdResult.matches.length).toBeGreaterThanOrEqual(
        highThresholdResult.matches.length
      )

      // All results should be above their respective thresholds
      highThresholdResult.matches.forEach((m) => {
        expect(m.similarity).toBeGreaterThanOrEqual(0.99)
      })

      lowThresholdResult.matches.forEach((m) => {
        expect(m.similarity).toBeGreaterThanOrEqual(0.50)
      })
    })

    it('should respect max_results limit', async function () {
      if (!hasClausesWithEmbeddings || !testEmbedding) {
        console.log('Skipping: No clauses with embeddings')
        return
      }

      const result = await findSimilarClauses(supabase, testEmbedding, {
        thresholdMin: 0.30, // Very low to get all possible matches
        maxResults: 3,
      })

      expect(result.matches.length).toBeLessThanOrEqual(3)
    })

    it('should include match_category in results', async function () {
      if (!hasClausesWithEmbeddings || !testEmbedding) {
        console.log('Skipping: No clauses with embeddings')
        return
      }

      const result = await findSimilarClauses(supabase, testEmbedding, {
        thresholdMin: 0.60,
        maxResults: 5,
      })

      if (result.hasMatches) {
        result.matches.forEach((match) => {
          expect(['auto_merge', 'review_required', 'unique']).toContain(
            match.match_category
          )

          // Verify match_category aligns with similarity score
          if (match.similarity >= 0.92) {
            expect(match.match_category).toBe('auto_merge')
          } else if (match.similarity >= 0.85) {
            expect(match.match_category).toBe('review_required')
          } else {
            expect(match.match_category).toBe('unique')
          }
        })
      }
    })
  })

  describe('RAG risk calculation consistency', () => {
    it('should calculate RAG risk consistently with Edge Function', async function () {
      if (!hasClausesWithEmbeddings || !testEmbedding) {
        console.log('Skipping: No clauses with embeddings')
        return
      }

      const result = await findSimilarClauses(supabase, testEmbedding, {
        thresholdMin: 0.60,
        maxResults: 5,
      })

      if (result.hasMatches && result.topMatch) {
        const similarity = result.topMatch.similarity
        const expectedRagRisk = calculateRagRisk(similarity)

        expect(result.ragRisk).toBe(expectedRagRisk)

        // Verify threshold boundaries
        if (similarity >= 0.75) {
          expect(result.ragRisk).toBe('green')
        } else if (similarity >= 0.60) {
          expect(result.ragRisk).toBe('amber')
        } else {
          expect(result.ragRisk).toBe('red')
        }

        console.log(`Similarity: ${similarity.toFixed(4)}, RAG Risk: ${result.ragRisk}`)
      }
    })
  })

  describe('SimilarityAdapter with real database', () => {
    it('should work with adapter class', async function () {
      if (!hasClausesWithEmbeddings || !testEmbedding) {
        console.log('Skipping: No clauses with embeddings')
        return
      }

      const adapter = createSimilarityAdapter(supabase, {
        thresholdMin: 0.60,
        thresholdGreen: 0.75,
        maxResults: 5,
      })

      const result = await adapter.findSimilar(testEmbedding)

      expect(result.hasMatches).toBe(true)
      expect(result.topMatch).not.toBeNull()

      // Prepare match result for storage format
      const matchResult = adapter.prepareMatchResult(
        'test-boundary-id',
        result,
        'test-document-id'
      )

      expect(matchResult.clause_boundary_id).toBe('test-boundary-id')
      expect(matchResult.document_id).toBe('test-document-id')
      expect(matchResult.rag_risk).toBe(result.ragRisk)

      console.log('Adapter match result:', {
        matched_template_id: matchResult.matched_template_id,
        similarity_score: matchResult.similarity_score,
        rag_risk: matchResult.rag_risk,
      })
    })

    it('should handle retry on transient errors', async function () {
      if (!hasClausesWithEmbeddings || !testEmbedding) {
        console.log('Skipping: No clauses with embeddings')
        return
      }

      // This test verifies the retry wrapper works with real calls
      const result = await findSimilarClausesWithRetry(supabase, testEmbedding, {
        thresholdMin: 0.60,
        maxResults: 5,
        maxRetries: 2,
      })

      expect(result.hasMatches).toBe(true)
    })
  })

  describe('Edge cases with real data', () => {
    it('should handle zero vector gracefully', async () => {
      const zeroEmbedding = Array(1024).fill(0)

      const result = await findSimilarClauses(supabase, zeroEmbedding, {
        thresholdMin: 0.60,
        maxResults: 5,
      })

      // Zero vector should not match anything well (cosine similarity undefined/NaN)
      // The RPC might return empty or error - both are acceptable
      console.log(`Zero vector matches: ${result.matches.length}`)
    })

    it('should handle very small embedding values', async () => {
      const smallEmbedding = Array(1024).fill(0.0001)

      const result = await findSimilarClauses(supabase, smallEmbedding, {
        thresholdMin: 0.01, // Very low threshold
        maxResults: 5,
      })

      // Should not throw error
      expect(result).toBeDefined()
      console.log(`Small embedding matches: ${result.matches.length}`)
    })

    it('should handle clause_type filter', async function () {
      if (!hasClausesWithEmbeddings || !testEmbedding) {
        console.log('Skipping: No clauses with embeddings')
        return
      }

      // First, get a result without filter
      const unfilteredResult = await findSimilarClauses(supabase, testEmbedding, {
        thresholdMin: 0.30,
        maxResults: 10,
      })

      if (unfilteredResult.hasMatches && unfilteredResult.topMatch) {
        const clauseType = unfilteredResult.topMatch.clause_type

        // Then filter by that clause type
        const filteredResult = await findSimilarClauses(supabase, testEmbedding, {
          thresholdMin: 0.30,
          maxResults: 10,
          clauseType,
        })

        // All filtered results should have the specified clause type
        filteredResult.matches.forEach((m) => {
          expect(m.clause_type).toBe(clauseType)
        })

        console.log(`Filtered to ${clauseType}: ${filteredResult.matches.length} matches`)
      }
    })
  })
})

// Summary test that runs regardless of database connection
describe('similarity-adapter integration test summary', () => {
  it('reports integration test capability', () => {
    if (canRunIntegrationTests) {
      console.log('Integration tests enabled - connected to Supabase')
    } else {
      console.log('Integration tests skipped - no Supabase connection')
      console.log('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable')
    }
    expect(true).toBe(true) // Always pass
  })
})
