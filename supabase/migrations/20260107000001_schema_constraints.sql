-- Migration: Schema Constraints
-- Issues: #13 (unique constraint), #11 (review_type check), #14 (matched_template FK), #15 (deal_id FK)
-- Date: 2026-01-07
--
-- PRE-MIGRATION VALIDATION (run manually before applying):
--
-- Check for duplicates in clause_match_results:
-- SELECT clause_boundary_id, COUNT(*), array_agg(id) as duplicate_ids
-- FROM clause_match_results
-- WHERE clause_boundary_id IS NOT NULL
-- GROUP BY clause_boundary_id
-- HAVING COUNT(*) > 1;
--
-- Check review_type values:
-- SELECT DISTINCT review_type FROM admin_review_queue;
--
-- Check matched_template_id values exist in legal_clause_library:
-- SELECT DISTINCT cmr.matched_template_id
-- FROM clause_match_results cmr
-- LEFT JOIN legal_clause_library lcl ON cmr.matched_template_id = lcl.clause_id
-- WHERE cmr.matched_template_id IS NOT NULL AND lcl.clause_id IS NULL;

-- ============================================================================
-- Issue #13: Clean up duplicates before adding unique constraint
-- Keep records with P1 results, or newest if neither/both have P1 results
-- ============================================================================
DELETE FROM clause_match_results a
USING clause_match_results b
WHERE a.clause_boundary_id = b.clause_boundary_id
  AND a.clause_boundary_id IS NOT NULL
  AND a.id != b.id
  AND (
    -- Keep the one with P1 results
    (a.gpt_analysis->>'pre_agreed_comparisons' IS NULL AND b.gpt_analysis->>'pre_agreed_comparisons' IS NOT NULL)
    OR (
      -- If both or neither have P1, keep the newer one
      (a.gpt_analysis->>'pre_agreed_comparisons' IS NULL) = (b.gpt_analysis->>'pre_agreed_comparisons' IS NULL)
      AND a.updated_at < b.updated_at
    )
  );

-- ============================================================================
-- Issue #13: Add unique constraint on clause_boundary_id
-- This enables the upsert behavior in generate-embeddings
-- ============================================================================
ALTER TABLE clause_match_results
ADD CONSTRAINT clause_match_results_clause_boundary_unique
UNIQUE (clause_boundary_id);

COMMENT ON CONSTRAINT clause_match_results_clause_boundary_unique ON clause_match_results IS
'Ensures one match result per clause boundary. Enables upsert in generate-embeddings.';

-- ============================================================================
-- Issue #11: Add CHECK constraint for review_type values
-- ============================================================================
ALTER TABLE admin_review_queue
ADD CONSTRAINT admin_review_queue_review_type_check
CHECK (review_type IN ('low_confidence', 'new_clause', 'flagged_risk', 'deduplication', 'manual'));

COMMENT ON CONSTRAINT admin_review_queue_review_type_check ON admin_review_queue IS
'Restricts review_type to known values for consistency.';

-- ============================================================================
-- Issue #14: Add FK constraint on matched_template_id
-- References legal_clause_library.clause_id (VARCHAR), SET NULL on delete
-- ============================================================================
-- First, clean up any orphaned references (shouldn't exist but safety first)
UPDATE clause_match_results cmr
SET matched_template_id = NULL
WHERE cmr.matched_template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM legal_clause_library lcl
    WHERE lcl.clause_id = cmr.matched_template_id
  );

ALTER TABLE clause_match_results
ADD CONSTRAINT fk_matched_template
FOREIGN KEY (matched_template_id) REFERENCES legal_clause_library(clause_id)
ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_matched_template ON clause_match_results IS
'Links match results to library clauses. SET NULL preserves match history if library clause deleted.';

-- ============================================================================
-- Issue #15: Add FK constraint on document_repository.deal_id
-- SET NULL on delete (preserve documents for audit trail)
-- ============================================================================
-- Note: document_repository.deal_id may already have an implicit FK from creation
-- This makes it explicit with ON DELETE SET NULL behavior
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_document_deal'
      AND table_name = 'document_repository'
  ) THEN
    ALTER TABLE document_repository
    ADD CONSTRAINT fk_document_deal
    FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON CONSTRAINT fk_document_deal ON document_repository IS
'Links documents to deals. SET NULL preserves documents when deal deleted for audit trail.';

-- ============================================================================
-- Rollback (if needed):
-- ============================================================================
-- ALTER TABLE clause_match_results DROP CONSTRAINT IF EXISTS clause_match_results_clause_boundary_unique;
-- ALTER TABLE admin_review_queue DROP CONSTRAINT IF EXISTS admin_review_queue_review_type_check;
-- ALTER TABLE clause_match_results DROP CONSTRAINT IF EXISTS fk_matched_template;
-- ALTER TABLE document_repository DROP CONSTRAINT IF EXISTS fk_document_deal;
