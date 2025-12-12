# 12 December 2025 - LCL Matching Pipeline Fix

## Problem
After switching from Cohere to OpenAI embeddings, the LCL (Legal Clause Library) matching was returning 0 matches. The `generate-embeddings` edge function was creating embeddings but failing to create `clause_match_results` entries.

## Root Causes Identified

### 1. RPC Function Overload Ambiguity
The database had multiple overloaded versions of `find_similar_clauses` with different signatures. The Supabase JS client couldn't resolve which function to call and failed silently.

**Fix:** Created `find_similar_clauses_v2` with explicit `p_` prefixed parameter names:
```sql
CREATE OR REPLACE FUNCTION find_similar_clauses_v2(
  p_query_embedding text,
  p_similarity_threshold float DEFAULT 0.60,
  p_max_results int DEFAULT 10,
  p_tenant_id uuid DEFAULT NULL,
  p_clause_type text DEFAULT NULL
)
```

### 2. Clause Type Naming Mismatch
The extracted clauses use different type names than the LCL:
- Extracted: `content_requirement`, `invoicing_obligation`, `term_definition`
- LCL: `deliverables`, `payment_terms`, `compliance`, `confidentiality`

The function was filtering by `clause_type`, causing most matches to fail.

**Fix:** Removed clause_type filtering - semantic similarity handles matching regardless of type naming:
```typescript
// generate-embeddings/index.ts
const { data: matches, error: matchError } = await supabase.rpc(
  'find_similar_clauses_v2',
  {
    p_query_embedding: embeddingString,
    p_similarity_threshold: 0.60,
    p_max_results: 10,
    p_tenant_id: null,      // Not filtering
    p_clause_type: null     // Not filtering - semantic similarity handles this
  }
)
```

### 3. Trigger Blocking Inserts
The `auto_flag_low_confidence` trigger on `clause_match_results` was trying to insert into `admin_review_queue` but failing on duplicate key errors. This rolled back the entire `clause_match_results` insert transaction.

**Fix:** Updated trigger to use `ON CONFLICT DO NOTHING`:
```sql
INSERT INTO admin_review_queue (...)
VALUES (...)
ON CONFLICT (document_id, COALESCE(clause_boundary_id, '00000000-0000-0000-0000-000000000000'::uuid), review_type)
DO NOTHING;
```

## Files Modified

1. **`supabase/functions/generate-embeddings/index.ts`**
   - Changed RPC call from `find_similar_clauses` to `find_similar_clauses_v2`
   - Removed clause_type and tenant_id filtering

2. **Database Migrations Applied:**
   - `create_find_similar_clauses_v2` - New RPC function
   - `fix_find_similar_clauses_v2` - Removed tenant_id filter (LCL doesn't have tenant_id)
   - `fix_auto_flag_trigger_on_conflict_v2` - Fixed ON CONFLICT syntax

## Results

Test document: `f5f6e692-b9c4-4aab-8c33-59177df31c2c`

| Metric | Before | After |
|--------|--------|-------|
| Clauses processed | 26 | 26 |
| Match results created | 0-3 | 26 |
| Clauses with LCL match (>= 0.60) | 0 | 11 |
| Green status (>= 0.75) | 0 | 2 |

### Top Matches
| Clause Type | Similarity | Matched LCL |
|-------------|------------|-------------|
| content_requirement | 0.808 | LC-005-a |
| payment_terms | 0.787 | LC-002-a |
| invoicing_obligation | 0.705 | LC-002-a |
| content_restriction | 0.667 | LC-230-a |
| term_definition | 0.667 | LC-803-a |
| confidentiality | 0.661 | LC-007-a |

## Deployment

```bash
# Deploy the updated edge function
supabase functions deploy generate-embeddings --no-verify-jwt
```

## Testing

To re-run embedding generation for a document:
```bash
curl -X POST "https://qntawekxlcnlmppjsijc.supabase.co/functions/v1/generate-embeddings" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"document_id": "<document-uuid>"}'
```

To clear and regenerate:
```sql
DELETE FROM clause_match_results WHERE document_id = '<document-uuid>';
UPDATE clause_boundaries SET embedding = NULL WHERE document_id = '<document-uuid>';
```
