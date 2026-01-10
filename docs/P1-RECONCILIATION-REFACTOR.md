# P1 Reconciliation Refactoring Plan

## Overview

Refactor `worker/p1-reconciliation.ts` (1,386 lines) from a monolithic file into focused, testable services while maintaining backward compatibility.

---

## Why Refactor?

### Current Issues

| Issue | Location | Impact |
|-------|----------|--------|
| Monolithic file (1,386 lines) | `worker/p1-reconciliation.ts` | Hard to test, debug, extend |
| Hardcoded batch size | Line 13 | Could exceed token limits |
| Duplicate keyword maps | Lines 374-381 + Tests | Maintenance burden |
| 4-step fallback matching | Lines 525-590 | Fragile, hard to debug |
| Silent batch failures | Lines 867-910 | Data loss risk |
| Duplicate identity categories | Lines 150-197 | Maintenance burden |
| Complex RAG calculation | Lines 1190-1212 | Business logic unclear |
| Missing abstraction for strategies | Lines 767-910 | Non-extensible |
| Weak error handling | Lines 1064-1067 | Data integrity risk |
| Identity match O(n) per term | Lines 632-653 | Performance issue |
| 4 GPT response formats accepted | Lines 879-891 | API contract unclear |
| Partial idempotency | Lines 932-945 | Duplicate data risk |

---

## Target File Structure

```
worker/
├── p1-reconciliation.ts         # Main orchestrator (~200 lines)
├── p1-reconciliation.test.ts    # Existing tests (preserved)
│
├── config/
│   └── p1-config.ts             # All hardcoded values, env vars
│
├── types/
│   └── p1-types.ts              # All interfaces and type definitions
│
├── services/
│   ├── identity-matcher.ts      # Identity term short-circuit logic
│   ├── clause-selector.ts       # Strategy pattern for clause selection
│   ├── semantic-matcher.ts      # Semantic comparison orchestration
│   ├── rag-calculator.ts        # RAG status calculation
│   └── pat-normalizer.ts        # PAT normalization via GPT
│
├── adapters/
│   ├── gpt-adapter.ts           # GPT API calls, retry, response parsing
│   └── database-adapter.ts      # Supabase operations, batch updates
│
└── utils/
    └── text.ts                  # Existing text utilities
```

---

## Implementation Phases

### Phase 1: Extract Types and Config (Low Risk)
**Files to create**: `types/p1-types.ts`, `config/p1-config.ts`

1. Extract all interfaces from current file to `types/p1-types.ts`
2. Move hardcoded values to `config/p1-config.ts`:
   - `P1_MODEL`, `BATCH_SIZE`, `MAX_RETRIES`, `BACKOFF_MULTIPLIER`
   - `BASE_TIMEOUT_MS`, `PER_COMPARISON_MS`, `MAX_TIMEOUT_MS`
   - `CLAUSE_SELECTION_THRESHOLD`, `MATCH_REASON_WEIGHTS`
3. Add environment variable overrides for all config values
4. Integrate with existing `lib/constants/thresholds.ts`

### Phase 2: Extract Identity Matcher (Medium Risk)
**File to create**: `services/identity-matcher.ts`

1. Move identity matching functions:
   - `IDENTITY_TERM_CATEGORIES` → Use `lib/constants/pat-categories.ts` as single source
   - `isIdentityTermCategory()`, `normalizeForIdentityMatch()`
   - `checkIdentityMatch()`, `determineIdentityRag()`, `generateIdentityExplanation()`
2. Remove duplicate lowercase category entries (normalize on comparison)
3. Re-export from main file for backward compatibility

### Phase 3: Extract GPT Adapter (Medium Risk)
**File to create**: `adapters/gpt-adapter.ts`

1. Create `GPTAdapter` class with methods:
   - `normalizePATs()` - PAT normalization call
   - `compareBatch()` - Batch comparison call
2. Move `callWithBackoff()`, `calculateTimeout()`
3. **Define strict response schema** (single format, not 4):
   ```typescript
   { results: [{ idx, matches, severity, explanation, differences, confidence }] }
   ```
4. Implement schema validation (fail fast on invalid response)
5. Proper error handling: throw on empty/invalid response, don't silently skip

### Phase 4: Extract Database Adapter (Medium Risk)
**File to create**: `adapters/database-adapter.ts`

1. Create `DatabaseAdapter` class with methods:
   - `fetchDocument()`, `fetchPreAgreedTerms()`, `fetchClauses()`, `fetchMatchResults()`
   - `createIdentityMatchResult()`, `createMissingTermResult()`
   - `batchUpdateMatchResults()` - Use RPC with proper retry
   - `createDiscrepancy()`, `flagForReview()`
2. Implement transaction pattern for batch operations
3. Add proper error tracking (which operations failed)

### Phase 5: Extract Clause Selector with Strategy Pattern (High Complexity)
**File to create**: `services/clause-selector.ts`

1. Define strategy interface:
   ```typescript
   interface ClauseSelectionStrategy {
     readonly name: MatchReason;
     select(term, clausesByType, matchResultsByClauseId): ClauseCandidate[];
   }
   ```
2. Implement strategies:
   - `TypeMatchStrategy` - Primary clause type matching
   - `FallbackTypeStrategy` - Fallback clause types
   - `KeywordStrategy` - Keyword-based matching
   - `EmbeddingStrategy` - Embedding similarity (threshold-based)
3. **Unify mappings**: Merge `TERM_TO_CLAUSE_MAP` and `keywordMap` into single `CLAUSE_TYPE_MAPPINGS`
4. **Performance optimization**: Pre-index clauses by type for O(1) lookup

### Phase 6: Extract Semantic Matcher and PAT Normalizer
**Files to create**: `services/semantic-matcher.ts`, `services/pat-normalizer.ts`

1. `pat-normalizer.ts`:
   - Move `normalizePatTerms()` function
   - Use `GPTAdapter` for API calls
   - Preserve caching logic
2. `semantic-matcher.ts`:
   - Move `buildBatchComparisons()`, `selectBestMatchPerTerm()`, `isBetterMatch()`
   - Use `ClauseSelector` for clause selection
   - Use `IdentityMatcher` to filter identity terms

### Phase 7: Extract RAG Calculator (Low Risk)
**File to create**: `services/rag-calculator.ts`

1. Create `RAGCalculator` class with clear methods:
   - `calculateTermRAG(result)` - Single comparison → RAG
   - `calculateClauseRAG(patComparisons)` - Multiple comparisons → aggregate RAG
   - `calculateFinalRAG(ragParsing, ragRisk)` - Combine P1 + library RAG
2. Replace nested conditionals with explicit decision logic:
   ```typescript
   // Decision table:
   // mandatory RED → RED
   // non-mandatory RED → AMBER
   // AMBER → AMBER
   // (ragParsing RED || ragRisk RED) → RED
   // (ragParsing GREEN && ragRisk GREEN) → GREEN
   // otherwise → AMBER
   ```

### Phase 8: Slim Down Main Orchestrator
**File to modify**: `p1-reconciliation.ts`

1. `performP1Reconciliation()` becomes pure orchestration (~200 lines):
   - Fetch data via `DatabaseAdapter`
   - Normalize PATs via `PATNormalizer`
   - Process identity terms via `IdentityMatcher`
   - Build comparisons via `SemanticMatcher`
   - Execute GPT comparison via `GPTAdapter`
   - Calculate RAG via `RAGCalculator`
   - Persist results via `DatabaseAdapter`
2. Re-export public functions for backward compatibility

---

## Key Interface Definitions

### `types/p1-types.ts`
```typescript
export type RAGStatus = 'green' | 'amber' | 'red';
export type MatchReason = 'type_match' | 'fallback_match' | 'semantic_fallback' | 'embedding_similarity';
export type IdentityMatchType = 'exact' | 'normalized' | 'partial' | 'absent';

export interface BatchResult {
  idx: number;
  matches: boolean;
  severity: 'none' | 'minor' | 'major';
  explanation: string;
  differences: string[];
  confidence: number;
}

export interface IdentityMatchResult {
  matches: boolean;
  matchType: IdentityMatchType;
  confidence: number;
  foundValue?: string;
}
```

### `config/p1-config.ts`
```typescript
export const P1Config = {
  model: process.env.P1_MODEL || 'gpt-4o',
  batchSize: parseInt(process.env.P1_BATCH_SIZE || '50', 10),
  baseTimeoutMs: parseInt(process.env.P1_BASE_TIMEOUT_MS || '30000', 10),
  perComparisonMs: parseInt(process.env.P1_PER_COMPARISON_MS || '2000', 10),
  maxTimeoutMs: parseInt(process.env.P1_MAX_TIMEOUT_MS || '120000', 10),
  maxRetries: parseInt(process.env.P1_MAX_RETRIES || '3', 10),
  clauseSelectionThreshold: 0.60,
  matchReasonWeights: {
    type_match: 1.0,
    fallback_match: 0.8,
    embedding_similarity: 0.7,
    semantic_fallback: 0.5,
  },
} as const;
```

---

## Critical Files

| File | Role | Action |
|------|------|--------|
| `worker/p1-reconciliation.ts` | Monolith to refactor | Decompose |
| `worker/p1-reconciliation.test.ts` | Existing tests (1,512 lines) | Preserve, extend |
| `worker/worker.ts` | Calls `performP1Reconciliation()` | No changes needed |
| `lib/constants/pat-categories.ts` | Identity categories | Use as single source of truth |
| `lib/constants/thresholds.ts` | Threshold constants | Integrate with P1Config |

---

## Verification Checklist

### Per-Phase
- [ ] All existing tests pass
- [ ] No runtime errors
- [ ] Re-exports work correctly

### Final
- [ ] Main file under 250 lines
- [ ] Full E2E test passes (upload → reconciliation)
- [ ] Performance equal or better
- [ ] All 1,512 test lines pass
- [ ] No silent failures (GPT/DB errors properly thrown)
- [ ] Config loads from environment variables

---

## Testing Strategy

1. **Preserve existing tests** via re-exports
2. **Add unit tests per service**:
   - `identity-matcher.test.ts` - Match types, RAG determination
   - `clause-selector.test.ts` - Each strategy, fallback chain
   - `rag-calculator.test.ts` - Decision table coverage
   - `gpt-adapter.test.ts` - Response parsing, error handling
3. **Add integration test** for full pipeline with mocked adapters

---

## Benefits Summary

| Benefit | Impact |
|---------|--------|
| **Testability** | Individual services testable in isolation |
| **Maintainability** | Changes localized to specific service |
| **Extensibility** | New matching strategies via Strategy pattern |
| **Configuration** | Tune thresholds without code changes |
| **Reliability** | Proper error handling, no silent failures |
| **Performance** | O(1) clause lookup, single-pass selection |
| **Type Safety** | Strict GPT response schema |
