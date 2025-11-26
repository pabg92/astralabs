-- Test Admin Review Queue Implementation
-- Run this in Supabase SQL Editor after deploying migration 100

-- ============================================================================
-- STEP 1: Deploy Migration 100 First!
-- ============================================================================
-- Copy and run supabase/migrations/100_add_cba_clause_architecture.sql


-- ============================================================================
-- STEP 2: Re-enqueue Test Document (Optional)
-- ============================================================================
-- This document was processed but moved to DLQ due to old Edge Function
-- Re-enqueue to test with new simplified Edge Function

SELECT manual_enqueue_document('05793c06-bf3e-4920-8ee2-40002beaec2d'::uuid);
-- Expected: Returns message ID (integer)


-- ============================================================================
-- STEP 3: Monitor Processing
-- ============================================================================
-- Check document status
SELECT
  id,
  status,
  extraction_status,
  embedding_status,
  matching_status,
  created_at,
  updated_at
FROM document_repository
WHERE id = '05793c06-bf3e-4920-8ee2-40002beaec2d';
-- Expected: status changes from 'pending' → 'completed'


-- ============================================================================
-- STEP 4: Verify Clause Extraction
-- ============================================================================
SELECT
  id,
  clause_type,
  confidence,
  LEFT(content, 100) as content_preview
FROM clause_boundaries
WHERE document_id = '05793c06-bf3e-4920-8ee2-40002beaec2d'
ORDER BY page_number, bbox_top;
-- Expected: ~20 clauses


-- ============================================================================
-- STEP 5: Check LCL Matching Results
-- ============================================================================
SELECT
  id,
  clause_boundary_id,
  matched_template_id,
  similarity_score,
  rag_risk,
  rag_parsing,
  rag_status,
  discrepancy_count
FROM clause_match_results
WHERE document_id = '05793c06-bf3e-4920-8ee2-40002beaec2d'
ORDER BY similarity_score ASC;
-- Expected: Each clause has:
--   - rag_risk (from LCL matching)
--   - rag_parsing (from P1 pre-agreed terms)
--   - rag_status (final P3 three-way)


-- ============================================================================
-- STEP 6: View Auto-Flagged Clauses
-- ============================================================================
SELECT
  id,
  review_type,
  priority,
  status,
  issue_description,
  metadata->>'similarity_score' as similarity,
  metadata->>'clause_type' as clause_type,
  metadata->>'reason' as reason,
  LEFT(original_text, 100) as clause_preview,
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
--   - < 50% = critical
--   - 50-60% = high
--   - 60-70% = medium
--   - 70-85% = low


-- ============================================================================
-- STEP 7: Test Accept as New Clause (Manual - Use Admin UI)
-- ============================================================================
-- Navigate to: /admin/review-queue
-- Click "Add as New Clause" on a flagged item
-- Fill form:
--   - Clause ID: LC-042-a
--   - Category: payment
--   - Risk Level: medium
--   - Plain English Summary: Payment terms for deliverables
--   - Tags: payment, deliverable, invoice
-- Click "Accept to LCL"

-- Verify in database:
SELECT
  clause_id,
  category,
  clause_type,
  risk_level,
  parent_clause_id,
  variation_letter,
  factual_correctness_score,
  plain_english_summary,
  tags,
  approved_at,
  metadata->>'approved_from_queue' as queue_id,
  LEFT(standard_text, 100) as text_preview
FROM legal_clause_library
WHERE clause_id = 'LC-042-a';
-- Expected:
--   - parent_clause_id = NULL
--   - variation_letter = 'a'
--   - approved_at is set
--   - metadata contains queue ID


-- ============================================================================
-- STEP 8: Test Accept as Variant (Manual - Use Admin UI)
-- ============================================================================
-- Navigate to: /admin/review-queue
-- Click "Add as Variant" on a different flagged item
-- Fill form:
--   - Parent Clause ID: LC-042-a (the one we just created)
--   - Variation Letter: b
--   - Category: payment
--   - Risk Level: medium
--   - Plain English Summary: Alternative payment structure
--   - Tags: payment, deliverable, milestone
-- Click "Accept to LCL"

-- Verify in database:
SELECT
  clause_id,
  parent_clause_id,
  variation_letter,
  plain_english_summary,
  LEFT(standard_text, 100) as text_preview
FROM legal_clause_library
WHERE clause_id = 'LC-042-b';
-- Expected:
--   - clause_id = 'LC-042-b'
--   - parent_clause_id = 'LC-042-a'
--   - variation_letter = 'b'

-- View all variations of LC-042:
SELECT
  clause_id,
  variation_letter,
  parent_clause_id,
  plain_english_summary
FROM legal_clause_library
WHERE clause_id LIKE 'LC-042-%'
ORDER BY variation_letter;
-- Expected: Shows LC-042-a (base) and LC-042-b (variant)


-- ============================================================================
-- STEP 9: Test Reject (Manual - Use Admin UI)
-- ============================================================================
-- Navigate to: /admin/review-queue
-- Click "Reject" on a flagged item
-- Enter reason: "Clause too specific to this contract, not library-worthy"
-- Click "Confirm Reject"

-- Verify in database:
SELECT
  id,
  status,
  resolution_action,
  metadata->>'rejection_reason' as reason,
  reviewed_at
FROM admin_review_queue
WHERE status = 'rejected'
ORDER BY reviewed_at DESC
LIMIT 5;
-- Expected:
--   - status = 'rejected'
--   - resolution_action = 'reject'
--   - reason stored in metadata


-- ============================================================================
-- STEP 10: View Admin Review Queue Stats
-- ============================================================================
SELECT
  status,
  priority,
  COUNT(*) as count
FROM admin_review_queue
GROUP BY status, priority
ORDER BY
  CASE status
    WHEN 'pending' THEN 1
    WHEN 'resolved' THEN 2
    WHEN 'rejected' THEN 3
  END,
  CASE priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END;
-- Expected: Shows distribution of queue items by status and priority


-- ============================================================================
-- STEP 11: Test Deduplication Function
-- ============================================================================
-- Simulate checking if a clause is duplicate/variant/unique
SELECT * FROM check_clause_duplicates(
  'This agreement may be terminated by either party with 30 days written notice.',
  'Termination',
  (SELECT (metadata->'cohere_embedding')::vector
   FROM legal_clause_library
   WHERE clause_id = 'LC-001-a'
   LIMIT 1)
);
-- Expected: Returns match_type:
--   - 'exact' if cosine >= 0.92
--   - 'variant' if 0.85-0.92
--   - 'unique' if < 0.85


-- ============================================================================
-- STEP 12: View LCL Growth Over Time
-- ============================================================================
SELECT
  DATE(approved_at) as approval_date,
  COUNT(*) as clauses_added,
  SUM(CASE WHEN parent_clause_id IS NULL THEN 1 ELSE 0 END) as base_clauses,
  SUM(CASE WHEN parent_clause_id IS NOT NULL THEN 1 ELSE 0 END) as variants,
  AVG(factual_correctness_score) as avg_correctness
FROM legal_clause_library
WHERE approved_at IS NOT NULL
GROUP BY DATE(approved_at)
ORDER BY approval_date DESC;
-- Expected: Shows daily LCL growth metrics


-- ============================================================================
-- STEP 13: Find Orphaned Variants (Data Quality Check)
-- ============================================================================
-- Variants should always have a valid parent
SELECT
  v.clause_id as variant_id,
  v.parent_clause_id,
  v.variation_letter,
  p.clause_id as parent_exists
FROM legal_clause_library v
LEFT JOIN legal_clause_library p ON v.parent_clause_id = p.clause_id
WHERE v.parent_clause_id IS NOT NULL
  AND p.clause_id IS NULL;
-- Expected: Empty result (no orphaned variants)


-- ============================================================================
-- STEP 14: Check P1 Reconciliation Results
-- ============================================================================
SELECT
  cmr.id,
  cb.clause_type,
  cmr.rag_risk as library_risk,
  cmr.rag_parsing as preagreed_risk,
  cmr.rag_status as final_status,
  cmr.gpt_analysis->'pre_agreed_comparisons' as comparisons,
  cmr.discrepancy_count
FROM clause_match_results cmr
JOIN clause_boundaries cb ON cb.id = cmr.clause_boundary_id
WHERE cmr.document_id = '05793c06-bf3e-4920-8ee2-40002beaec2d'
  AND cmr.gpt_analysis ? 'pre_agreed_comparisons'
ORDER BY
  CASE cmr.rag_status
    WHEN 'red' THEN 1
    WHEN 'amber' THEN 2
    WHEN 'green' THEN 3
  END;
-- Expected: Shows P1 comparison results for each clause


-- ============================================================================
-- STEP 15: View Missing Mandatory Terms
-- ============================================================================
-- These create "virtual" match results with no clause_boundary_id
SELECT
  cmr.id,
  cmr.gpt_analysis->'missing_required_term'->>'term_category' as missing_category,
  cmr.gpt_analysis->'missing_required_term'->>'term_description' as description,
  cmr.rag_status,
  d.description as discrepancy
FROM clause_match_results cmr
LEFT JOIN discrepancies d ON d.match_result_id = cmr.id
WHERE cmr.document_id = '05793c06-bf3e-4920-8ee2-40002beaec2d'
  AND cmr.clause_boundary_id IS NULL
  AND cmr.gpt_analysis ? 'missing_required_term';
-- Expected: Shows mandatory pre-agreed terms that are missing from contract


-- ============================================================================
-- CLEANUP (Optional)
-- ============================================================================
-- To reset and re-test:

-- Clear admin review queue for this document
-- DELETE FROM admin_review_queue
-- WHERE document_id = '05793c06-bf3e-4920-8ee2-40002beaec2d';

-- Remove test clauses from LCL
-- DELETE FROM legal_clause_library
-- WHERE clause_id IN ('LC-042-a', 'LC-042-b');

-- Reset document status to trigger re-processing
-- UPDATE document_repository
-- SET status = 'pending',
--     extraction_status = NULL,
--     embedding_status = NULL,
--     matching_status = NULL
-- WHERE id = '05793c06-bf3e-4920-8ee2-40002beaec2d';

-- Re-enqueue
-- SELECT manual_enqueue_document('05793c06-bf3e-4920-8ee2-40002beaec2d'::uuid);
