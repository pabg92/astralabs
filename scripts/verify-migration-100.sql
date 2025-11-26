-- Verify Migration 100 Deployment
-- Run in Supabase SQL Editor to confirm schema changes

-- ============================================================================
-- 1. Check new columns in legal_clause_library
-- ============================================================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'legal_clause_library'
  AND column_name IN (
    'factual_correctness_score',
    'new_clause_flag',
    'plain_english_summary',
    'clause_text_redacted',
    'parent_clause_id',
    'variation_letter',
    'needs_review',
    'submitted_by',
    'approved_by',
    'approved_at'
  )
ORDER BY column_name;
-- Expected: 10 rows showing all new CBA fields


-- ============================================================================
-- 2. Check legal_clause_standardisation table exists
-- ============================================================================
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_name = 'legal_clause_standardisation';
-- Expected: 1 row (table exists)


-- ============================================================================
-- 3. Check new columns in admin_review_queue
-- ============================================================================
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'admin_review_queue'
  AND column_name IN (
    'factual_correctness_score',
    'suggested_parent_clause_id',
    'suggested_variation_letter',
    'cluster_id',
    'submitted_by',
    'resolution_action',
    'resulting_clause_id'
  )
ORDER BY column_name;
-- Expected: 7 rows


-- ============================================================================
-- 4. Check functions exist
-- ============================================================================
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name IN (
  'check_clause_duplicates',
  'accept_clause_to_lcl'
)
ORDER BY routine_name;
-- Expected: 2 rows


-- ============================================================================
-- 5. Check indexes
-- ============================================================================
SELECT
  indexname,
  tablename
FROM pg_indexes
WHERE indexname IN (
  'idx_lcl_parent_clause',
  'idx_lcl_new_clause_flag',
  'idx_lcstx_lcl_clause',
  'idx_lcstx_tenant'
)
ORDER BY indexname;
-- Expected: 4 rows

-- ============================================================================
-- ALL CHECKS PASSED! ✅
-- Migration 100 deployed successfully
-- ============================================================================
