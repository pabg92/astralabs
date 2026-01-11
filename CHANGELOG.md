# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Edge Functions Migration Phase 2** - Text Extraction Adapter
  - Created `worker/adapters/text-extractor-adapter.ts`:
    - PDF text extraction via unpdf (handles both string and object return formats)
    - DOCX text extraction via mammoth
    - Plain text extraction via TextDecoder
    - MIME type detection helpers (isPdfMimeType, isDocxMimeType, isPlainTextMimeType)
    - Text sanitization (removes null bytes, preserves whitespace)
    - `extractFromBuffer()` and `extractFromBlob()` main functions
    - `TextExtractorAdapter` class for dependency injection
    - Factory function and default instance export
  - Added 35 text-extractor-adapter tests (`worker/adapters/text-extractor-adapter.test.ts`)
  - Total: 260 tests passing (up from 225)

- **Edge Functions Migration Phase 1** - Infrastructure & Shared Utilities
  - Added `unpdf@0.12.0` and `mammoth@1.6.0` to worker dependencies
    - PDF text extraction via unpdf
    - DOCX text extraction via mammoth
  - Created `worker/utils/retry.ts` - Shared retry utilities:
    - `withRetry<T>()` - Generic retry with exponential backoff
    - `callWithBackoff<T>()` - Rate limit (429) handling
    - `isTransientError()` - Transient error detection
    - `isRetryableStatus()` - HTTP status code checking
    - `calculateBackoffDelay()` - Exponential backoff calculation
    - `TRANSIENT_ERROR_PATTERNS` - Configurable error patterns
    - `RetryConfig` interface for dependency injection
  - Created `worker/config/extraction-config.ts` - Extraction/embedding configuration:
    - `ExtractionConfig` - Chunk size, overlap, timeout, model settings
    - `EmbeddingConfig` - Model, dimensions, batch size
    - `SimilarityConfig` - Thresholds for match quality
    - `QualityConfig` - Extraction quality gates
    - `estimateTokens()` - Token estimation utility
    - `MODEL_CONTEXT_LIMITS` - GPT model context sizes
    - All values configurable via environment variables
  - Added 34 retry utility tests (`worker/utils/retry.test.ts`)
  - Added 37 extraction config tests (`worker/config/extraction-config.test.ts`)
  - Total: 225 tests passing (up from 154)

- P1 environment variable configuration for runtime tunability
  - `P1_MODEL` - GPT model for comparisons (default: gpt-4o)
  - `P1_NORMALIZATION_MODEL` - Model for PAT normalization (default: gpt-4o-mini)
  - `P1_BATCH_SIZE` - Comparisons per batch (default: 50)
  - `P1_MAX_RETRIES` - Retry attempts on rate limit (default: 3)
  - `P1_BASE_TIMEOUT_MS` - Base timeout (default: 30000)
  - `P1_PER_COMPARISON_MS` - Additional timeout per comparison (default: 2000)
  - `P1_MAX_TIMEOUT_MS` - Maximum timeout cap (default: 120000)

### Changed
- **P1 Reconciliation Phase 8 Refactor** - Final cleanup and orchestrator slim-down
  - Created `worker/services/result-processor.ts` with:
    - `processIdentityResults()` - Persist identity term matches and create discrepancies
    - `groupClauseUpdates()` - Group best matches by clause/matchResult
    - `prepareBatchUpdates()` - Prepare batch update payloads with RAG calculation
    - `processSideEffects()` - Handle review queue and discrepancy creation
    - `processMissingTerms()` - Detect and flag missing mandatory terms
    - `getMatchedTermIdsFromResults()` - Extract matched term IDs from results
    - `ResultProcessor` class for dependency injection
  - Rewrote `worker/p1-reconciliation.ts` as clean 227-line orchestrator:
    - 10 clearly labeled steps with single responsibility
    - Pure orchestration: fetch → normalize → compare → persist → return
    - 84% reduction from original 1,386 lines
  - All 113 existing tests continue to pass

- **P1 Reconciliation Phase 7 Refactor** - Extract RAG calculator service
  - Created `worker/services/rag-calculator.ts` with:
    - `calculateTermRAG()` - Single GPT result → RAG status
    - `calculateClauseRAG()` - Aggregate multiple PAT comparisons → RAG
    - `calculateFinalRAG()` - Combine P1 parsing + library risk → final RAG
    - `calculateReviewPriority()` - Similarity score → review priority
    - `needsReview()` - Check if clause needs human review
    - `severityToRAG()` - Convert deviation severity to RAG
    - `RAGCalculator` class with `calculateAll()` pipeline method
    - Clear decision table documentation
  - Replaced nested conditionals with explicit decision logic
  - Main file `worker/p1-reconciliation.ts` reduced by additional ~25 lines
  - All 113 existing tests continue to pass

- **P1 Reconciliation Phase 6 Refactor** - Extract semantic matcher service
  - Created `worker/services/semantic-matcher.ts` with:
    - `buildBatchComparisons()` - Builds GPT comparison list with identity short-circuit
    - `selectBestMatchPerTerm()` - Selects best match per PAT term
    - `isBetterMatch()` - Compares matches by RAG score, weight, confidence
    - `calculateRagScore()` - Converts BatchResult to numeric score
    - `SemanticMatcher` class for dependency injection
    - Typed interfaces: `BatchComparisonResult`, `BestMatchResult`
  - Main file `worker/p1-reconciliation.ts` reduced by additional ~100 lines
  - All 113 existing tests continue to pass

- **P1 Reconciliation Phase 5 Refactor** - Extract clause selector with Strategy pattern
  - Created `worker/services/clause-selector.ts` with:
    - `ClauseSelectionStrategy` interface for pluggable strategies
    - `TypeMatchStrategy` - Primary clause type matching
    - `FallbackTypeStrategy` - Fallback clause type matching
    - `KeywordStrategy` - Keyword-based matching for unmapped categories
    - `EmbeddingStrategy` - Embedding similarity fallback
    - `ClauseSelector` class orchestrating strategy chain
    - `buildClauseIndex()` for O(1) clause lookup by type (performance optimization)
    - `ClauseIndex` interface for pre-indexed clause data
  - Main file `worker/p1-reconciliation.ts` reduced by additional ~70 lines
  - Performance improvement: O(1) clause type lookup vs O(n) linear scan
  - All 113 existing tests continue to pass

- **P1 Reconciliation Phase 4 Refactor** - Extract database adapter
  - Created `worker/adapters/database-adapter.ts` with:
    - `fetchDocument()`, `fetchPreAgreedTerms()`, `fetchClauses()`, `fetchMatchResults()`
    - `createIdentityMatchResult()`, `createMissingTermResult()`
    - `batchUpdateMatchResults()` with RPC and sequential fallback
    - `createDiscrepancy()`, `insertReviewQueueItem()`
    - `DatabaseAdapter` class for dependency injection
    - Typed interfaces: `DocumentMetadata`, `BatchUpdateItem`, `DiscrepancyInput`, `ReviewQueueInput`
  - Main file `worker/p1-reconciliation.ts` reduced by additional ~100 lines
  - All 113 existing tests continue to pass

- **P1 Reconciliation Phase 3 Refactor** - Extract GPT adapter
  - Created `worker/adapters/gpt-adapter.ts` with:
    - `sleep()`, `calculateTimeout()`, `callWithBackoff()` utility functions
    - `normalizePatTerms()` for PAT normalization via GPT
    - `executeBatchComparison()` for batch clause-term comparison
    - `GPTAdapter` class for dependency injection
    - Response validation with `parseGPTResponse()` and `validateBatchResult()`
  - Main file `worker/p1-reconciliation.ts` reduced by additional ~150 lines
  - All 113 existing tests continue to pass

- **P1 Reconciliation Phase 2 Refactor** - Extract identity matcher service
  - Created `worker/services/identity-matcher.ts` with:
    - Standalone functions: `isIdentityTermCategory()`, `normalizeForIdentityMatch()`,
      `checkIdentityMatch()`, `determineIdentityRag()`, `generateIdentityExplanation()`
    - `IdentityMatcher` class with `processTerm()`, `processIdentityTerms()`, `filterSemanticTerms()`
  - Main file `worker/p1-reconciliation.ts` reduced by additional ~130 lines
  - Re-exports maintained for backward compatibility
  - All 113 existing tests continue to pass

- **P1 Reconciliation Phase 1 Refactor** - Extract types and config
  - Created `worker/types/p1-types.ts` with all interface definitions
  - Created `worker/config/p1-config.ts` with centralized configuration
  - Main file `worker/p1-reconciliation.ts` reduced by ~215 lines
  - All 113 existing tests continue to pass

### Fixed
- Fixed default `P1_MODEL` from non-existent "gpt-5.1" to valid "gpt-4o"
- Removed duplicate identity category entries (now normalized on comparison)

## [0.1.0] - 2026-01-10

### Added
- Initial P1 reconciliation system with two-tier term comparison
  - Tier 1: Identity terms (string matching) - Brand Name, Talent Name, Agency, etc.
  - Tier 2: Semantic terms (GPT comparison) - Payment Terms, Exclusivity, etc.
- Batched GPT comparisons (50 per batch) reducing processing time from ~5min to ~15sec
- Identity term short-circuit bypassing GPT for faster, more accurate results
- RAG status calculation combining library risk with PAT comparison
- Idempotency check via `p1_completed_at` column
- PAT normalization with timestamp-based caching
- Admin review queue for low-confidence matches (<0.85 similarity)
- Discrepancy creation for RED status terms

### Infrastructure
- pgmq queue for document processing
- Edge Functions: extract-clauses, generate-embeddings, match-and-reconcile
- Worker polling system with retry logic
- Batch RPC for efficient database updates

---

## Guiding Principles

### Types of Changes
- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes

### Commit to Changelog Mapping
When making commits, add corresponding entries here:
- `feat:` commits → **Added** or **Changed**
- `fix:` commits → **Fixed**
- `refactor:` commits → **Changed** (if behavior changes) or just code cleanup
- `security:` commits → **Security**
- `chore:` commits → Usually not logged unless significant

### For AI Agents
**IMPORTANT:** After completing any significant change (feature, fix, refactor):
1. Add an entry under `[Unreleased]` in the appropriate category
2. Include file paths affected for traceability
3. Reference issue numbers if applicable (e.g., "Fixes #123")
4. Keep descriptions concise but informative
