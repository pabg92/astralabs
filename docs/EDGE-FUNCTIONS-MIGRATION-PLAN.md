# Edge Functions to VPS Worker Migration Plan

## Executive Summary

Migrate Supabase Edge Functions (Deno) to the Node.js worker running on VPS, consolidating all document processing into a single deployable unit with measurable performance improvements.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CURRENT ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   VPS Worker                         Supabase Edge (Deno)                   │
│   ┌──────────┐                      ┌─────────────────────┐                 │
│   │ worker.ts│─── HTTP POST ───────▶│ extract-clauses     │ 3,840 lines    │
│   │          │─── HTTP POST ───────▶│ generate-embeddings │ 434 lines      │
│   │          │─── HTTP POST ───────▶│ match-and-reconcile │ 182 lines      │
│   │          │                      └─────────────────────┘                 │
│   │          │                              │                               │
│   │  P1 runs │◀─────────────────────────────┘                               │
│   │  locally │   (already migrated)                                         │
│   └──────────┘                                                              │
│                                                                              │
│   Overhead: 3 HTTP round-trips, cold starts, 150s timeout limit             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

                                    ▼ ▼ ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                           TARGET ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   VPS Worker (All Local)                                                    │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                                                                       │  │
│   │   ┌─────────────┐    ┌──────────────┐    ┌────────────────┐         │  │
│   │   │   Clause    │───▶│  Embedding   │───▶│    Library     │         │  │
│   │   │  Extractor  │    │  Generator   │    │    Matcher     │         │  │
│   │   └─────────────┘    └──────────────┘    └────────────────┘         │  │
│   │          │                  │                    │                   │  │
│   │          ▼                  ▼                    ▼                   │  │
│   │   ┌─────────────────────────────────────────────────────────────┐   │  │
│   │   │              P1 Reconciliation (existing)                    │   │  │
│   │   └─────────────────────────────────────────────────────────────┘   │  │
│   │                                                                       │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│   Gains: Zero cold starts, no timeout limit, direct function calls          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Current Performance Baseline

### Existing Metrics Infrastructure

The system has comprehensive monitoring via `edge_function_logs` table and monitoring queries:

```sql
-- edge_function_logs schema
- document_id: UUID
- stage: TEXT ('extract', 'embed', 'match')
- status: TEXT ('success', 'error', 'fallback')
- clause_count: INTEGER
- execution_time_ms: INTEGER
- raw_payload: JSONB (batch_stats, quality metrics)
```

### Baseline Metrics to Capture Before Migration

**Run these queries to establish baseline (save results):**

```sql
-- 1. Extract Clauses Baseline
SELECT
  COUNT(*) as total_extractions,
  AVG(execution_time_ms) as avg_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY execution_time_ms) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time_ms) as p99_ms,
  MIN(execution_time_ms) as min_ms,
  MAX(execution_time_ms) as max_ms
FROM edge_function_logs
WHERE stage = 'extract'
  AND status = 'success'
  AND created_at > NOW() - INTERVAL '30 days';

-- 2. Generate Embeddings Baseline
SELECT
  COUNT(*) as total_embeddings,
  AVG(execution_time_ms) as avg_ms,
  AVG((raw_payload->>'avg_time_per_clause_ms')::numeric) as avg_per_clause_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY execution_time_ms) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_ms
FROM edge_function_logs
WHERE stage = 'embed'
  AND status = 'success'
  AND created_at > NOW() - INTERVAL '30 days';

-- 3. Match & Reconcile Baseline
SELECT
  COUNT(*) as total_matches,
  AVG(execution_time_ms) as avg_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY execution_time_ms) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_ms
FROM edge_function_logs
WHERE stage = 'match'
  AND status = 'success'
  AND created_at > NOW() - INTERVAL '30 days';

-- 4. Total Pipeline Duration
SELECT
  d.id as document_id,
  MAX(l.created_at) - MIN(l.created_at) as pipeline_duration,
  SUM(l.execution_time_ms) as total_execution_ms
FROM document_repository d
JOIN edge_function_logs l ON l.document_id = d.id
WHERE d.processing_status = 'completed'
  AND d.created_at > NOW() - INTERVAL '30 days'
GROUP BY d.id;

-- 5. Error Rate Baseline
SELECT
  stage,
  COUNT(*) FILTER (WHERE status = 'success') as success_count,
  COUNT(*) FILTER (WHERE status = 'error') as error_count,
  ROUND(COUNT(*) FILTER (WHERE status = 'error')::numeric / COUNT(*)::numeric * 100, 2) as error_rate_pct
FROM edge_function_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY stage;
```

### Current Known Performance Characteristics

| Stage | Current Behavior | Overhead Source |
|-------|------------------|-----------------|
| Extract Clauses | 90s timeout limit | HTTP POST + cold start (150-500ms) |
| Generate Embeddings | 25 clauses/batch | HTTP POST + cold start (150-500ms) |
| Match & Reconcile | Simple DB operations | HTTP POST + cold start (150-500ms) |
| **Total Overhead** | **3 HTTP round-trips** | **~450-1500ms cold start overhead** |

### Current Thresholds (from codebase)

| Metric | Current Value | Source |
|--------|---------------|--------|
| Extraction timeout | 90,000 ms | extract-clauses/index.ts:41 |
| Slow processing alert | 30,000 ms | monitoring-queries.sql |
| Stuck document alert | 2 hours | monitoring-queries.sql |
| Embedding batch size | 25 clauses | generate-embeddings/index.ts |
| Similarity threshold | 0.60 | generate-embeddings/index.ts:214 |
| Chunk size | 12,000 chars | extract-clauses/index.ts |
| Chunk overlap | 800 chars | extract-clauses/index.ts |

---

## Expected Outcomes & Success Metrics

### Performance Improvements

| Metric | Current (Edge) | Target (Local) | Expected Gain |
|--------|----------------|----------------|---------------|
| Cold start overhead | 150-500ms × 3 calls | 0ms | **-450 to -1500ms** |
| HTTP round-trip | ~50-100ms × 3 calls | 0ms | **-150 to -300ms** |
| Timeout limit | 90s (Edge Function) | Unlimited | **No artificial ceiling** |
| Memory limit | 150MB (Edge) | VPS limit (~2GB+) | **10x+ capacity** |
| Retry overhead | HTTP retry + cold start | Direct retry | **-500ms per retry** |

### Quantified Success Criteria

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUCCESS METRICS                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ✓ P50 pipeline latency: Reduce by ≥500ms (HTTP + cold start elimination)  │
│                                                                              │
│  ✓ P95 pipeline latency: Reduce by ≥1000ms (worst-case cold starts gone)   │
│                                                                              │
│  ✓ Error rate: Equal or better (≤ current baseline)                        │
│                                                                              │
│  ✓ Throughput: Process ≥ same documents/hour                               │
│                                                                              │
│  ✓ Memory usage: Stay within VPS limits (monitor via process.memoryUsage)  │
│                                                                              │
│  ✓ Data integrity: Zero discrepancies between paths (A/B comparison)       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Comparison Testing Protocol

Before declaring success, run A/B comparison:

```bash
# Process same document through both paths
USE_LOCAL_PROCESSING=false node worker/test-document.js --doc-id=<id> > edge-result.json
USE_LOCAL_PROCESSING=true node worker/test-document.js --doc-id=<id> > local-result.json

# Compare outputs
diff <(jq -S . edge-result.json) <(jq -S . local-result.json)

# Compare database state
# - clause_boundaries (count, content hashes)
# - clause_match_results (rag_risk, rag_status, matched_template_id)
```

---

## Target File Structure

```
worker/
├── worker.ts                         # Modified: local service calls
├── p1-reconciliation.ts              # Unchanged
│
├── services/
│   ├── document-processor.ts         # NEW: Main orchestrator
│   ├── clause-extractor.ts           # NEW: Extraction logic
│   ├── embedding-generator.ts        # NEW: Embedding service
│   ├── library-matcher.ts            # NEW: LCL matching
│   │
│   ├── identity-matcher.ts           # Existing
│   ├── clause-selector.ts            # Existing
│   ├── semantic-matcher.ts           # Existing
│   ├── rag-calculator.ts             # Existing
│   └── result-processor.ts           # Existing
│
├── adapters/
│   ├── openai-adapter.ts             # NEW: Unified OpenAI (extraction + embeddings)
│   ├── storage-adapter.ts            # NEW: Supabase Storage download
│   ├── text-extractor-adapter.ts     # NEW: PDF/DOCX text extraction
│   │
│   ├── gpt-adapter.ts                # Existing (merge into openai-adapter)
│   └── database-adapter.ts           # Existing
│
├── utils/
│   ├── line-mapper.ts                # NEW: Line number ↔ char index
│   ├── clause-validator.ts           # NEW: Boundary snapping
│   ├── retry.ts                      # NEW: Shared retry logic
│   └── text.ts                       # Existing
│
├── config/
│   ├── extraction-config.ts          # NEW: Extraction settings
│   └── p1-config.ts                  # Existing
│
└── types/
    ├── extraction-types.ts           # NEW: Extraction types
    ├── embedding-types.ts            # NEW: Embedding types
    └── p1-types.ts                   # Existing
```

---

## Implementation Phases

### Phase 1: Infrastructure & Shared Utilities
**Risk: Low | Dependencies: None**

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 1: Foundation Layer                                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────┐ │
│  │  package.json   │   │    retry.ts     │   │ extraction-  │ │
│  │  + unpdf        │   │  withRetry<T>() │   │ config.ts    │ │
│  │  + mammoth      │   │  isTransient()  │   │              │ │
│  └─────────────────┘   └─────────────────┘   └──────────────┘ │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Deliverables

1. **Add npm dependencies** (`worker/package.json`):
   ```json
   {
     "dependencies": {
       "unpdf": "^0.12.0",
       "mammoth": "^1.6.0"
     }
   }
   ```

2. **Create retry utility** (`worker/utils/retry.ts`):
   ```typescript
   export interface RetryConfig {
     maxRetries: number
     initialDelayMs: number
     maxDelayMs: number
     backoffMultiplier: number
   }

   export async function withRetry<T>(
     fn: () => Promise<T>,
     config: RetryConfig,
     isTransient?: (error: Error) => boolean
   ): Promise<T>

   export function isTransientError(error: Error): boolean
   // Pattern: 5xx, 429, ECONNRESET, ETIMEDOUT, ECONNREFUSED, EPIPE
   ```

3. **Create extraction config** (`worker/config/extraction-config.ts`):
   ```typescript
   export const ExtractionConfig = {
     model: process.env.EXTRACTION_MODEL || 'gpt-4o',
     timeoutMs: parseInt(process.env.EXTRACTION_TIMEOUT_MS || '90000'),
     chunkSize: parseInt(process.env.EXTRACTION_CHUNK_SIZE || '12000'),
     chunkOverlap: parseInt(process.env.EXTRACTION_CHUNK_OVERLAP || '800'),
     maxClauseLength: 400,
     minClauseLength: 50,
   } as const

   export const EmbeddingConfig = {
     model: process.env.EMBEDDING_MODEL || 'text-embedding-3-large',
     dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1024'),
     batchSize: 25,
     similarityThreshold: 0.60,
   } as const
   ```

#### Verification Checklist
- [ ] `npm install` succeeds without errors
- [ ] `unpdf` loads and exports `extractText`
- [ ] `mammoth` loads and exports `extractRawText`
- [ ] Config values load from environment variables
- [ ] Config values fall back to defaults when env vars missing
- [ ] `retry.test.ts` passes: tests retry count, backoff timing, transient detection

#### Exit Criteria
- All dependencies install
- All unit tests pass
- No TypeScript compilation errors

---

### Phase 2: Text Extraction Adapter
**Risk: Medium | Dependencies: Phase 1**

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 2: Text Extraction                                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              text-extractor-adapter.ts                   │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │   application/pdf ──▶ unpdf.extractText() ──┐           │   │
│  │                                              │           │   │
│  │   application/vnd.openxmlformats... ──▶     │           │   │
│  │   mammoth.extractRawText() ─────────────────┼──▶ text   │   │
│  │                                              │           │   │
│  │   text/plain ──▶ buffer.toString('utf-8') ──┘           │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Deliverables

**File: `worker/adapters/text-extractor-adapter.ts`**

```typescript
export interface TextExtractionResult {
  text: string
  mimeType: string
  characterCount: number
  extractionMethod: 'unpdf' | 'mammoth' | 'plaintext'
}

export class TextExtractorAdapter {
  async extractFromBuffer(
    buffer: ArrayBuffer,
    mimeType: string
  ): Promise<TextExtractionResult>

  async extractFromBlob(blob: Blob): Promise<TextExtractionResult>

  private async extractPdf(buffer: ArrayBuffer): Promise<string>
  private async extractDocx(buffer: ArrayBuffer): Promise<string>
  private extractPlainText(buffer: ArrayBuffer): string
}
```

#### Implementation Notes (from extract-clauses lines 3313-3346)
- PDF: `unpdf.extractText(new Uint8Array(buffer))` - may return `{text: string}` or `string`
- DOCX: `mammoth.extractRawText({ arrayBuffer: buffer })` - returns `{value: string}`
- Handle type coercion for unpdf result

#### Verification Checklist
- [ ] Extracts text from sample PDF (use contract from test fixtures)
- [ ] Extracts text from sample DOCX
- [ ] Handles empty PDF gracefully (returns empty string)
- [ ] Handles corrupt PDF gracefully (throws descriptive error)
- [ ] Handles corrupt DOCX gracefully (throws descriptive error)
- [ ] Returns correct mime type in result
- [ ] Character count matches actual text length

#### Exit Criteria
- All test fixtures extract correctly
- Output text matches Edge Function extraction for same files
- No memory leaks on large files (test with 10MB+ PDF)

---

### Phase 3: Storage Adapter
**Risk: Low | Dependencies: Phase 1**

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 3: Storage Access                                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                storage-adapter.ts                        │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  object_path ──▶ supabase.storage.from('contracts')     │   │
│  │                         │                                │   │
│  │                   error? ▼                               │   │
│  │                  supabase.storage.from('documents')      │   │
│  │                         │                                │   │
│  │                         ▼                                │   │
│  │                  { data: Blob, mimeType, bucket }        │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Deliverables

**File: `worker/adapters/storage-adapter.ts`**

```typescript
export interface StorageDownloadResult {
  data: Blob
  mimeType: string
  bucket: 'contracts' | 'documents'
  size: number
}

export class StorageAdapter {
  constructor(private supabase: SupabaseClient) {}

  async downloadDocument(objectPath: string): Promise<StorageDownloadResult>

  private getMimeTypeFromPath(path: string): string
  private async downloadFromBucket(bucket: string, path: string): Promise<Blob | null>
}
```

#### Implementation Notes (from extract-clauses lines 3260-3288)
- Try 'contracts' bucket first
- Fall back to 'documents' bucket if not found
- Derive mime type from file extension

#### Verification Checklist
- [ ] Downloads from 'contracts' bucket successfully
- [ ] Falls back to 'documents' bucket when file not in contracts
- [ ] Returns correct mime type based on file extension
- [ ] Throws descriptive error when file not found in either bucket
- [ ] Returns correct file size

#### Exit Criteria
- Downloads match files uploaded to storage
- Fallback logic works correctly
- Error messages are actionable

---

### Phase 4: Line Mapper & Clause Validator Utilities
**Risk: Medium | Dependencies: Phase 1**

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 4: Extraction Utilities                                   │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────┐    ┌───────────────────────────┐   │
│  │     line-mapper.ts    │    │   clause-validator.ts     │   │
│  ├───────────────────────┤    ├───────────────────────────┤   │
│  │                       │    │                           │   │
│  │ Original text         │    │ Raw clause boundaries     │   │
│  │       │               │    │         │                 │   │
│  │       ▼               │    │         ▼                 │   │
│  │ Add line numbers      │    │ snapToWordBoundary()      │   │
│  │ "1: First line..."    │    │         │                 │   │
│  │       │               │    │         ▼                 │   │
│  │       ▼               │    │ snapToSentenceBoundary()  │   │
│  │ Build lineMap         │    │         │                 │   │
│  │ { 1: {start, end} }   │    │         ▼                 │   │
│  │       │               │    │ validateClauseIndices()   │   │
│  │       ▼               │    │ - bounds checking         │   │
│  │ convertLinesToIndices │    │ - overlap detection       │   │
│  │                       │    │ - deduplication           │   │
│  └───────────────────────┘    └───────────────────────────┘   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Deliverables

**File: `worker/utils/line-mapper.ts`**

```typescript
export interface LineMapping {
  lineNumber: number
  startChar: number
  endChar: number
  content: string
}

export interface LineNumberedDocument {
  numberedText: string      // "1: First line\n2: Second line..."
  lineMap: Map<number, LineMapping>
  originalText: string
  totalLines: number
}

export interface RawLineBasedClause {
  startLine: number
  endLine: number
  clause_type: string
  summary: string
  rag_status: string
}

export interface RawIndexedClause {
  startIndex: number
  endIndex: number
  clause_type: string
  summary: string
  rag_status: string
  content: string
}

export function prepareLineNumberedDocument(text: string): LineNumberedDocument
export function convertLinesToIndices(
  lineClauses: RawLineBasedClause[],
  lineDoc: LineNumberedDocument
): RawIndexedClause[]
```

**File: `worker/utils/clause-validator.ts`**

```typescript
export interface ValidatedClause extends RawIndexedClause {
  originalStart: number
  originalEnd: number
  snappingApplied: boolean
}

export function snapToWordBoundary(
  text: string,
  start: number,
  end: number
): { start: number; end: number; modified: boolean }

export function snapToSentenceBoundary(
  text: string,
  start: number,
  end: number
): { start: number; end: number; modified: boolean }

export function validateClauseIndices(
  clauses: RawIndexedClause[],
  textLength: number
): ValidatedClause[]

export function trimLeadingHeaders(content: string): string
export function trimTrailingContent(content: string): string
export function deduplicateClauses(clauses: ValidatedClause[]): ValidatedClause[]
```

#### Implementation Notes (from extract-clauses lines 192-982)
- Handle LF (`\n`) and CRLF (`\r\n`) line endings
- Word boundary: don't split mid-word
- Sentence boundary: prefer ending at `.`, `!`, `?`
- Deduplication: remove clauses with >80% content overlap

#### Verification Checklist
- [ ] Line mapper handles LF line endings
- [ ] Line mapper handles CRLF line endings
- [ ] Line mapper handles mixed line endings
- [ ] Line-to-index conversion is accurate (spot check 10 samples)
- [ ] Word boundary snapping preserves word integrity
- [ ] Sentence boundary snapping finds nearest sentence end
- [ ] Validation catches out-of-bounds indices
- [ ] Validation detects overlapping clauses
- [ ] Deduplication removes near-duplicates

#### Exit Criteria
- Unit tests cover all edge cases
- Output matches Edge Function for same input text
- No off-by-one errors in index conversion

---

### Phase 5: OpenAI Adapter (Unified)
**Risk: Medium | Dependencies: Phase 1, Phase 4**

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 5: Unified OpenAI Adapter                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   openai-adapter.ts                      │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌─────────────────────┐  ┌─────────────────────┐       │   │
│  │  │  Chat Completions   │  │     Embeddings      │       │   │
│  │  ├─────────────────────┤  ├─────────────────────┤       │   │
│  │  │ extractClauses()    │  │ generateEmbeddings()│       │   │
│  │  │ extractChunked()    │  │                     │       │   │
│  │  │ compareBatch()      │  │                     │       │   │
│  │  │ normalizePATs()     │  │                     │       │   │
│  │  └─────────────────────┘  └─────────────────────┘       │   │
│  │                                                          │   │
│  │  Shared Infrastructure:                                  │   │
│  │  - withRetry() for transient errors                     │   │
│  │  - AbortController for timeouts                         │   │
│  │  - Rate limit handling (429 → backoff)                  │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Deliverables

**File: `worker/adapters/openai-adapter.ts`**

```typescript
export interface ExtractionOptions {
  model?: 'gpt-4o' | 'gpt-5.1'
  timeoutMs?: number
  useLineBasedExtraction?: boolean
}

export interface ExtractedClause {
  content: string
  clause_type: string
  summary: string
  confidence: number
  rag_status: 'green' | 'amber' | 'red'
  section_title: string | null
  start_index: number
  end_index: number
}

export interface EmbeddingOptions {
  model?: string
  dimensions?: number
}

export class OpenAIAdapter {
  constructor(private apiKey: string, private config: RetryConfig) {}

  // NEW: Clause extraction
  async extractClauses(
    lineNumberedText: string,
    options?: ExtractionOptions
  ): Promise<ExtractedClause[]>

  async extractClausesChunked(
    chunks: { text: string; chunkIndex: number }[],
    options?: ExtractionOptions
  ): Promise<ExtractedClause[]>

  // NEW: Embeddings
  async generateEmbeddings(
    texts: string[],
    options?: EmbeddingOptions
  ): Promise<number[][]>

  // EXISTING (from gpt-adapter.ts - merge in)
  async compareBatch(comparisons: BatchComparison[]): Promise<Map<number, BatchResult>>
  async normalizePATs(terms: PreAgreedTerm[]): Promise<PreAgreedTerm[]>

  // Private
  private buildExtractionPrompt(lineNumberedText: string): string
  private parseExtractionResponse(response: string): ExtractedClause[]
}
```

#### Key Prompts to Port (from extract-clauses)
- `buildSinglePassSystemPrompt()` (lines 1063-1242)
- `buildChunkedSystemPrompt()` (lines 1244-1300)
- Line-based extraction JSON schema with `startLine`, `endLine`

#### Verification Checklist
- [ ] Single-pass extraction works for small documents
- [ ] Chunked extraction works for large documents
- [ ] Response parsing handles valid JSON
- [ ] Response parsing handles malformed JSON gracefully
- [ ] Timeout triggers correctly via AbortController
- [ ] Rate limit (429) triggers retry with backoff
- [ ] Embedding dimensions match config (default 1024)
- [ ] Embedding batching respects batch size limit

#### Exit Criteria
- Extraction output matches Edge Function for same input
- Embeddings are identical to Edge Function embeddings
- Error handling doesn't crash worker

---

### Phase 6: Clause Extractor Service
**Risk: High | Dependencies: Phases 2, 3, 4, 5**

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 6: Clause Extractor Service                               │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  document_id, object_path                                      │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                           │
│  │ StorageAdapter  │ Download file from Supabase Storage       │
│  └────────┬────────┘                                           │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ TextExtractor   │ PDF/DOCX → raw text                       │
│  └────────┬────────┘                                           │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ LineMapper      │ Add line numbers for GPT                  │
│  └────────┬────────┘                                           │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ Decide Path     │ Single-pass (fits context) vs Chunked    │
│  └────────┬────────┘                                           │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ OpenAIAdapter   │ GPT extraction (line-based)               │
│  └────────┬────────┘                                           │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ LineMapper      │ Convert lines → character indices         │
│  └────────┬────────┘                                           │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ ClauseValidator │ Snap boundaries, dedupe, quality gate     │
│  └────────┬────────┘                                           │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ DatabaseAdapter │ INSERT INTO clause_boundaries             │
│  └─────────────────┘                                           │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Deliverables

**File: `worker/services/clause-extractor.ts`**

```typescript
export interface ExtractionResult {
  success: boolean
  clauses_extracted: number
  extracted_text: string
  extraction_mode: 'single_pass' | 'chunked'
  model: string
  execution_time_ms: number
  quality_passed: boolean
  quality_warnings: string[]
  telemetry: ExtractionTelemetry
}

export interface ExtractionTelemetry {
  document_id: string
  input_chars: number
  clause_count: number
  avg_clause_length: number
  mega_clause_count: number
  mega_clause_rate: number
  extraction_time_ms: number
}

export class ClauseExtractor {
  constructor(
    private storage: StorageAdapter,
    private textExtractor: TextExtractorAdapter,
    private openai: OpenAIAdapter,
    private database: DatabaseAdapter,
    private config: typeof ExtractionConfig
  ) {}

  async extract(
    documentId: string,
    objectPath: string
  ): Promise<ExtractionResult>

  private decideExtractionPath(textLength: number, model: string): 'single_pass' | 'chunked'
  private createChunks(text: string): { text: string; chunkIndex: number }[]
  private validateQuality(clauses: ExtractedClause[]): { passed: boolean; warnings: string[] }
}
```

#### Key Logic to Port (from extract-clauses)
- `decideExtractionPath()` - Token estimation: `text.length / 4`, check against 70% of model context
- `createChunks()` - 12,000 char chunks with 800 char overlap
- Quality gates:
  - Min clauses: 50 (warn if fewer)
  - Max avg length: 450 chars
  - Mega clause rate: <15%

#### Verification Checklist
- [ ] Extracts clauses from sample PDF contract
- [ ] Extracts clauses from sample DOCX contract
- [ ] Single-pass mode triggers for small documents
- [ ] Chunked mode triggers for large documents
- [ ] Quality gate flags low-quality extractions
- [ ] Clauses persist to `clause_boundaries` table
- [ ] `extracted_text` stores full document text
- [ ] Telemetry logged to `edge_function_logs`

#### Exit Criteria
- Clause count within ±5% of Edge Function for same document
- Clause content hash matches for >95% of clauses
- No database constraint violations

---

### Phase 7: Embedding Generator Service
**Risk: Medium | Dependencies: Phase 5**

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 7: Embedding Generator Service                            │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  document_id                                                   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ SELECT * FROM clause_boundaries                          │   │
│  │ WHERE document_id = $1 AND embedding IS NULL            │   │
│  └────────┬────────────────────────────────────────────────┘   │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Batch by 25 clauses                                      │   │
│  │     │                                                    │   │
│  │     ▼                                                    │   │
│  │ OpenAI text-embedding-3-large (1024 dims)               │   │
│  │     │                                                    │   │
│  │     ▼                                                    │   │
│  │ UPDATE clause_boundaries SET embedding = $vector        │   │
│  └────────┬────────────────────────────────────────────────┘   │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ For each clause:                                         │   │
│  │   RPC: find_similar_clauses_v2(embedding, 0.60, 10)     │   │
│  │     │                                                    │   │
│  │     ▼                                                    │   │
│  │   Determine rag_risk:                                    │   │
│  │     similarity >= 0.75 → 'green'                        │   │
│  │     similarity >= 0.60 → 'amber'                        │   │
│  │     similarity < 0.60  → 'red'                          │   │
│  │     │                                                    │   │
│  │     ▼                                                    │   │
│  │   INSERT INTO clause_match_results                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Deliverables

**File: `worker/services/embedding-generator.ts`**

```typescript
export interface EmbeddingResult {
  success: boolean
  embeddings_generated: number
  matches_created: number
  batches_processed: number
  total_time_ms: number
  avg_time_per_clause_ms: number
  batch_stats: { batch: number; clauses: number; time_ms: number }[]
  failed_clauses: { clause_id: string; error: string }[]
}

export class EmbeddingGenerator {
  constructor(
    private openai: OpenAIAdapter,
    private database: DatabaseAdapter,
    private config: typeof EmbeddingConfig
  ) {}

  async generateForDocument(documentId: string): Promise<EmbeddingResult>

  private determinRagRisk(similarity: number): 'green' | 'amber' | 'red'
}
```

#### RAG Risk Logic (from generate-embeddings lines 214-230)
```typescript
private determineRagRisk(similarity: number): 'green' | 'amber' | 'red' {
  if (similarity >= 0.75) return 'green'
  if (similarity >= 0.60) return 'amber'
  return 'red'
}
```

#### Verification Checklist
- [ ] Generates 1024-dimensional embeddings
- [ ] Batches correctly (25 clauses per batch)
- [ ] Stores embeddings in `clause_boundaries.embedding`
- [ ] Calls `find_similar_clauses_v2` RPC successfully
- [ ] Creates `clause_match_results` with correct `rag_risk`
- [ ] Handles partial failures (some clauses fail, others succeed)
- [ ] Batch stats logged correctly

#### Exit Criteria
- Embeddings identical to Edge Function (cosine similarity = 1.0)
- `rag_risk` values match Edge Function for same clauses
- Performance within ±10% of Edge Function baseline

---

### Phase 8: Library Matcher Service
**Risk: Low | Dependencies: Phase 7**

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 8: Library Matcher Service                                │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  document_id                                                   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ SELECT * FROM clause_match_results                       │   │
│  │ WHERE document_id = $1                                   │   │
│  └────────┬────────────────────────────────────────────────┘   │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ UPDATE clause_match_results SET                          │   │
│  │   rag_status = rag_risk,  -- Initialize from library    │   │
│  │   rag_parsing = 'amber',  -- Pending P1 reconciliation  │   │
│  │   updated_at = NOW()                                     │   │
│  │ WHERE document_id = $1                                   │   │
│  └────────┬────────────────────────────────────────────────┘   │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ UPDATE document_repository SET                           │   │
│  │   processing_status = 'completed'                        │   │
│  │ WHERE id = $1                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Deliverables

**File: `worker/services/library-matcher.ts`**

```typescript
export interface MatchResult {
  success: boolean
  clauses_reconciled: number
  execution_time_ms: number
}

export class LibraryMatcher {
  constructor(private database: DatabaseAdapter) {}

  async initializeMatches(documentId: string): Promise<MatchResult>
}
```

#### Verification Checklist
- [ ] Updates `rag_status` to match `rag_risk`
- [ ] Sets `rag_parsing` to 'amber' for all clauses
- [ ] Updates `document_repository.processing_status` to 'completed'
- [ ] Returns correct clause count

#### Exit Criteria
- Database state matches Edge Function output
- No null `rag_status` values after completion

---

### Phase 9: Document Processor Orchestrator
**Risk: Medium | Dependencies: Phases 6, 7, 8**

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 9: Document Processor (Orchestrator)                      │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  processDocument(documentId, tenantId, objectPath)             │
│                        │                                        │
│        ┌───────────────┼───────────────┐                       │
│        ▼               ▼               ▼                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                   │
│  │ Extract  │──▶│ Embed    │──▶│ Match    │                   │
│  │ Clauses  │   │ Generate │   │ Library  │                   │
│  └──────────┘   └──────────┘   └──────────┘                   │
│        │               │               │                       │
│        └───────────────┼───────────────┘                       │
│                        ▼                                        │
│                 ┌──────────┐                                   │
│                 │    P1    │                                   │
│                 │ Reconcile│                                   │
│                 └──────────┘                                   │
│                        │                                        │
│                        ▼                                        │
│              ProcessingResult                                  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Deliverables

**File: `worker/services/document-processor.ts`**

```typescript
export interface ProcessingResult {
  success: boolean
  extraction: ExtractionResult
  embedding: EmbeddingResult
  matching: MatchResult
  p1: P1ReconciliationResult | null
  total_time_ms: number
  stages: {
    extraction_ms: number
    embedding_ms: number
    matching_ms: number
    p1_ms: number
  }
}

export class DocumentProcessor {
  constructor(
    private clauseExtractor: ClauseExtractor,
    private embeddingGenerator: EmbeddingGenerator,
    private libraryMatcher: LibraryMatcher,
    private supabase: SupabaseClient,
    private openaiApiKey: string
  ) {}

  async processDocument(
    documentId: string,
    tenantId: string,
    objectPath: string
  ): Promise<ProcessingResult>
}
```

#### Verification Checklist
- [ ] Full pipeline executes in correct sequence
- [ ] Stage timing captured correctly
- [ ] Total time equals sum of stages (±100ms tolerance)
- [ ] P1 runs after library matching completes
- [ ] Error in one stage doesn't corrupt database state
- [ ] Partial results persisted on failure

#### Exit Criteria
- End-to-end processing succeeds for sample documents
- Results match Edge Function pipeline exactly
- Error handling tested for each stage failure

---

### Phase 10: Worker Integration
**Risk: Medium | Dependencies: Phase 9**

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 10: Worker Integration with Feature Flag                  │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  USE_LOCAL_PROCESSING = process.env.USE_LOCAL_PROCESSING       │
│                        │                                        │
│            ┌───────────┴───────────┐                           │
│            ▼                       ▼                           │
│     ┌───────────┐           ┌───────────┐                     │
│     │   true    │           │   false   │                     │
│     └─────┬─────┘           └─────┬─────┘                     │
│           ▼                       ▼                           │
│  DocumentProcessor       invokeEdgeFunction()                 │
│  .processDocument()       (legacy path)                       │
│           │                       │                           │
│           ▼                       ▼                           │
│  Log: "Local processing"  Log: "Edge processing"              │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Deliverables

**Modify: `worker/worker.ts`**

```typescript
const USE_LOCAL_PROCESSING = process.env.USE_LOCAL_PROCESSING === 'true'

// In DocumentProcessingWorker class
private documentProcessor: DocumentProcessor

// In processDocument() method
if (USE_LOCAL_PROCESSING) {
  console.log(`   🏠 Using local processing for ${document_id}`)
  const result = await this.documentProcessor.processDocument(
    document_id, tenant_id, object_path
  )
  // Log metrics for comparison
  console.log(`   ⏱️ Local: extraction=${result.stages.extraction_ms}ms, embedding=${result.stages.embedding_ms}ms`)
} else {
  console.log(`   ☁️ Using Edge Function processing for ${document_id}`)
  // Existing Edge Function invocation
  await this.invokeEdgeFunction('extract-clauses', {...})
  await this.invokeEdgeFunction('generate-embeddings', {...})
  await this.invokeEdgeFunction('match-and-reconcile', {...})
}
```

#### Verification Checklist
- [ ] Feature flag `USE_LOCAL_PROCESSING=false` uses Edge Functions
- [ ] Feature flag `USE_LOCAL_PROCESSING=true` uses local processing
- [ ] Both paths produce identical database state
- [ ] Metrics logged for both paths
- [ ] Heartbeat/visibility timeout still works with local path

#### Exit Criteria
- A/B comparison shows identical results
- Performance metrics captured for both paths
- Rollback works instantly by changing env var

---

## Configuration Reference

### Environment Variables

```bash
# Feature Flags
USE_LOCAL_PROCESSING=true          # Toggle local vs Edge Function processing

# Extraction Configuration
EXTRACTION_MODEL=gpt-4o            # GPT model for clause extraction
EXTRACTION_TIMEOUT_MS=90000        # Extraction timeout (ms)
EXTRACTION_CHUNK_SIZE=12000        # Characters per chunk
EXTRACTION_CHUNK_OVERLAP=800       # Overlap between chunks
MAX_CLAUSE_LENGTH=400              # Maximum clause length
MIN_CLAUSE_LENGTH=50               # Minimum clause length

# Embedding Configuration
EMBEDDING_MODEL=text-embedding-3-large  # OpenAI embedding model
EMBEDDING_DIMENSIONS=1024              # Vector dimensions
EMBEDDING_BATCH_SIZE=25                # Clauses per embedding batch

# Library Matching
LIBRARY_MATCH_THRESHOLD=0.60       # Minimum similarity threshold
LIBRARY_MAX_RESULTS=10             # Max matches per clause

# Existing P1 Configuration
P1_MODEL=gpt-4o
P1_BATCH_SIZE=50
P1_MAX_RETRIES=3
```

---

## Testing Strategy

### Baseline Capture (Before Migration)

```bash
# Run baseline capture script
npm run capture-baseline

# Saves to baseline/
#   - edge_function_logs_30d.json
#   - sample_documents_results.json
#   - performance_percentiles.json
```

### Unit Tests (Per Phase)

| Phase | Test File | Key Test Cases |
|-------|-----------|----------------|
| 1 | `retry.test.ts` | Retry count, backoff timing, transient error detection |
| 2 | `text-extractor-adapter.test.ts` | PDF extraction, DOCX extraction, corrupt file handling |
| 3 | `storage-adapter.test.ts` | Bucket fallback, mime type detection |
| 4 | `line-mapper.test.ts` | Line endings, index accuracy |
| 4 | `clause-validator.test.ts` | Boundary snapping, deduplication |
| 5 | `openai-adapter.test.ts` | Extraction, embeddings, rate limits |
| 6 | `clause-extractor.test.ts` | Full extraction flow, quality gates |
| 7 | `embedding-generator.test.ts` | Batch processing, RAG risk |
| 8 | `library-matcher.test.ts` | Status initialization |
| 9 | `document-processor.test.ts` | Full pipeline, error handling |

### Integration Tests

```bash
# A/B comparison test
npm run test:ab-comparison -- --doc-id=<id>

# Output:
# ✓ Clause count: Edge=127, Local=127 (match)
# ✓ Content hash: 126/127 match (99.2%)
# ✓ RAG distribution: GREEN=45, AMBER=72, RED=10 (identical)
# ✓ P1 comparisons: 23 (identical)
# ✓ Discrepancies: 3 (identical)
```

### Performance Comparison

```bash
# Run performance benchmark
npm run benchmark:compare -- --iterations=10

# Output:
# ┌────────────────┬────────────┬────────────┬──────────┐
# │ Metric         │ Edge (ms)  │ Local (ms) │ Δ        │
# ├────────────────┼────────────┼────────────┼──────────┤
# │ P50 Total      │ 12,450     │ 11,800     │ -650ms   │
# │ P95 Total      │ 18,200     │ 16,500     │ -1,700ms │
# │ P99 Total      │ 25,100     │ 22,300     │ -2,800ms │
# │ Extraction     │ 8,200      │ 8,100      │ -100ms   │
# │ Embedding      │ 3,500      │ 3,200      │ -300ms   │
# │ Matching       │ 750        │ 500        │ -250ms   │
# └────────────────┴────────────┴────────────┴──────────┘
```

---

## Rollback Plan

### Immediate Rollback (< 1 minute)

```bash
# Disable local processing
USE_LOCAL_PROCESSING=false pm2 restart worker
```

### Rollback Decision Tree

```
Document processing failing?
       │
       ▼
┌──────────────┐
│ Check logs   │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────┐
│ Error in local processing code?  │
└──────┬───────────────────────────┘
       │
   Yes │                    No
       ▼                    ▼
┌──────────────┐    ┌──────────────┐
│ Rollback to  │    │ Investigate  │
│ Edge Function│    │ other causes │
└──────────────┘    └──────────────┘
```

### Rollback Verification

After rollback, verify:
1. Documents process successfully via Edge Functions
2. Error rate returns to baseline
3. No data corruption from partial local processing

---

## Success Criteria Summary

### Must Have (Blocking)

- [ ] **Data integrity**: Zero discrepancies between Edge and Local paths for same input
- [ ] **Reliability**: Error rate ≤ baseline
- [ ] **Rollback**: Feature flag switch works in < 1 minute

### Should Have (Target)

- [ ] **P50 latency**: Reduce by ≥ 500ms
- [ ] **P95 latency**: Reduce by ≥ 1000ms
- [ ] **Throughput**: Maintain or improve documents/hour

### Nice to Have

- [ ] **Memory optimization**: Peak memory < 1GB for typical documents
- [ ] **Code coverage**: > 80% for new services

---

## Critical Files Reference

| Source (Edge Function) | Target (Worker) | Lines |
|------------------------|-----------------|-------|
| `supabase/functions/extract-clauses/index.ts` | `worker/services/clause-extractor.ts` | ~3,840 → ~800 |
| `supabase/functions/generate-embeddings/index.ts` | `worker/services/embedding-generator.ts` | ~434 → ~200 |
| `supabase/functions/match-and-reconcile/index.ts` | `worker/services/library-matcher.ts` | ~182 → ~100 |

---

## Monitoring During Migration

### Key Metrics to Watch

```sql
-- Real-time processing comparison
SELECT
  CASE WHEN raw_payload->>'processing_path' = 'local' THEN 'Local' ELSE 'Edge' END as path,
  COUNT(*) as count,
  AVG(execution_time_ms) as avg_ms,
  COUNT(*) FILTER (WHERE status = 'error') as errors
FROM edge_function_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY 1;
```

### Alert Thresholds

| Alert | Threshold | Action |
|-------|-----------|--------|
| Error rate spike | > 10% (vs baseline) | Investigate or rollback |
| P95 latency spike | > 50% increase | Investigate |
| Memory usage | > 80% of VPS limit | Optimize or scale |
