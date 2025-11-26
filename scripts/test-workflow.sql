-- Complete Workflow Test
-- Run these queries in Supabase SQL Editor

-- ============================================================================
-- STEP 1: Re-enqueue test document
-- ============================================================================
-- This will trigger processing with:
--   - Simplified Edge Function (no memory errors)
--   - P1 worker reconciliation (with auto-flagging)

SELECT manual_enqueue_document('05793c06-bf3e-4920-8ee2-40002beaec2d'::uuid);
-- Expected: Returns message ID (integer like 39, 40, etc.)


-- ============================================================================
-- STEP 2: Monitor document status
-- ============================================================================
-- Watch status change: pending → processing → completed
-- Run this query every 10 seconds until status = 'completed'

SELECT
  id,
  status,
  extraction_status,
  embedding_status,
  matching_status,
  updated_at
FROM document_repository
WHERE id = '05793c06-bf3e-4920-8ee2-40002beaec2d';
-- Expected progression:
--   1. status = 'pending'
--   2. extraction_status = 'completed'
--   3. embedding_status = 'completed'
--   4. matching_status = 'completed'
--   5. status = 'completed' (after P1 worker finishes)


-- ============================================================================
-- STEP 3: Check clause extraction
-- ============================================================================
SELECT
  COUNT(*) as total_clauses,
  COUNT(DISTINCT clause_type) as unique_types
FROM clause_boundaries
WHERE document_id = '05793c06-bf3e-4920-8ee2-40002beaec2d';
-- Expected: ~20 clauses, ~10-15 types


-- ============================================================================
-- STEP 4: Check LCL matching results
-- ============================================================================
SELECT
  COUNT(*) as total_matches,
  COUNT(*) FILTER (WHERE rag_status = 'green') as green,
  COUNT(*) FILTER (WHERE rag_status = 'amber') as amber,
  COUNT(*) FILTER (WHERE rag_status = 'red') as red,
  AVG(similarity_score) as avg_similarity
FROM clause_match_results
WHERE document_id = '05793c06-bf3e-4920-8ee2-40002beaec2d'
  AND clause_boundary_id IS NOT NULL;
-- Expected: Shows distribution of RAG statuses


-- ============================================================================
-- STEP 5: View auto-flagged clauses (THE KEY TEST!)
-- ============================================================================
SELECT
  id,
  priority,
  issue_description,
  (metadata->>'similarity_score')::numeric as similarity,
  metadata->>'clause_type' as clause_type,
  LEFT(original_text, 80) as clause_preview,
  flagged_at
FROM admin_review_queue
WHERE document_id = '05793c06-bf3e-4920-8ee2-40002beaec2d'
  AND status = 'pending'
ORDER BY
  CASE priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  flagged_at;
-- Expected: Clauses with similarity < 85% are flagged
-- Priority distribution:
--   - critical: similarity < 50%
--   - high: 50-60%
--   - medium: 60-70%
--   - low: 70-85%


-- ============================================================================
-- STEP 6: Get queue item details for testing Accept
-- ============================================================================
-- Pick one flagged item to test acceptance
SELECT
  id as review_queue_id,
  priority,
  (metadata->>'similarity_score')::numeric as similarity,
  metadata->>'clause_type' as clause_type,
  metadata->>'matched_clause_id' as closest_match,
  original_text,
  metadata
FROM admin_review_queue
WHERE document_id = '05793c06-bf3e-4920-8ee2-40002beaec2d'
  AND status = 'pending'
ORDER BY priority, flagged_at
LIMIT 1;
-- Copy the 'review_queue_id' for use in admin UI


-- ============================================================================
-- STEP 7: Check P1 reconciliation results
-- ============================================================================
SELECT
  cb.clause_type,
  cmr.similarity_score,
  cmr.rag_risk as library_risk,
  cmr.rag_parsing as preagreed_risk,
  cmr.rag_status as final_status,
  jsonb_array_length(cmr.gpt_analysis->'pre_agreed_comparisons') as comparisons_made,
  cmr.discrepancy_count
FROM clause_match_results cmr
JOIN clause_boundaries cb ON cb.id = cmr.clause_boundary_id
WHERE cmr.document_id = '05793c06-bf3e-4920-8ee2-40002beaec2d'
ORDER BY
  CASE cmr.rag_status
    WHEN 'red' THEN 1
    WHEN 'amber' THEN 2
    WHEN 'green' THEN 3
  END;
-- Expected: Shows P1 comparison results
-- Each clause should have:
--   - rag_risk (from LCL matching)
--   - rag_parsing (from P1 pre-agreed terms)
--   - rag_status (final three-way comparison)


-- ============================================================================
-- STEP 8: Check for missing mandatory terms
-- ============================================================================
SELECT
  cmr.gpt_analysis->'missing_required_term'->>'term_category' as missing_term,
  cmr.gpt_analysis->'missing_required_term'->>'term_description' as description,
  cmr.rag_status,
  d.description as discrepancy
FROM clause_match_results cmr
LEFT JOIN discrepancies d ON d.match_result_id = cmr.id
WHERE cmr.document_id = '05793c06-bf3e-4920-8ee2-40002beaec2d'
  AND cmr.clause_boundary_id IS NULL
  AND cmr.gpt_analysis ? 'missing_required_term';
-- Expected: Shows any mandatory pre-agreed terms missing from contract


-- ============================================================================
-- SUCCESS CRITERIA
-- ============================================================================
-- ✅ Document status = 'completed'
-- ✅ ~20 clauses extracted
-- ✅ All clauses have embeddings
-- ✅ All clauses matched against LCL (rag_risk set)
-- ✅ All clauses reconciled against pre-agreed terms (rag_parsing set)
-- ✅ Low-confidence clauses (<85%) appear in admin_review_queue
-- ✅ Clauses prioritized correctly (critical/high/medium/low)

-- Next: Test admin UI at /admin/review-queue
