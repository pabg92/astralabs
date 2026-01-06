-- Migration: P1 Status Tracking
-- Issues: #2 (silent P1 failure), #3 (idempotency check)
-- Date: 2026-01-07
--
-- Adds dedicated columns to document_repository for tracking P1 reconciliation status.
-- This replaces the previous approach of checking gpt_analysis JSONB presence,
-- which failed when P1 was partially completed.

-- ============================================================================
-- Add P1 status tracking columns to document_repository
-- ============================================================================
ALTER TABLE document_repository
ADD COLUMN IF NOT EXISTS p1_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS p1_completed_at timestamptz,
ADD COLUMN IF NOT EXISTS p1_error text;

-- ============================================================================
-- Index for efficient P1 status queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_document_repository_p1_status
ON document_repository(p1_status)
WHERE p1_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_repository_p1_completed
ON document_repository(p1_completed_at)
WHERE p1_completed_at IS NOT NULL;

-- ============================================================================
-- Add CHECK constraint for p1_status values
-- ============================================================================
ALTER TABLE document_repository
ADD CONSTRAINT document_repository_p1_status_check
CHECK (p1_status IS NULL OR p1_status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON COLUMN document_repository.p1_status IS
'P1 reconciliation status: pending (not started), processing (in progress), completed (success), failed (error), skipped (no PATs or deal)';

COMMENT ON COLUMN document_repository.p1_completed_at IS
'Timestamp when P1 reconciliation completed successfully. Used for idempotency check.';

COMMENT ON COLUMN document_repository.p1_error IS
'Error message if P1 failed. Cleared on successful retry.';

-- ============================================================================
-- Backfill existing documents that have P1 results
-- Mark as completed if they have pre_agreed_comparisons in any clause_match_result
-- ============================================================================
UPDATE document_repository dr
SET
  p1_status = 'completed',
  p1_completed_at = (
    SELECT MAX(cmr.updated_at)
    FROM clause_match_results cmr
    WHERE cmr.document_id = dr.id
      AND cmr.gpt_analysis->>'pre_agreed_comparisons' IS NOT NULL
  )
WHERE dr.processing_status = 'completed'
  AND dr.p1_status = 'pending'
  AND EXISTS (
    SELECT 1 FROM clause_match_results cmr
    WHERE cmr.document_id = dr.id
      AND cmr.gpt_analysis->>'pre_agreed_comparisons' IS NOT NULL
  );

-- Mark documents without deal_id as skipped
UPDATE document_repository
SET p1_status = 'skipped'
WHERE processing_status = 'completed'
  AND p1_status = 'pending'
  AND deal_id IS NULL;

-- ============================================================================
-- Rollback (if needed):
-- ============================================================================
-- ALTER TABLE document_repository DROP CONSTRAINT IF EXISTS document_repository_p1_status_check;
-- DROP INDEX IF EXISTS idx_document_repository_p1_completed;
-- DROP INDEX IF EXISTS idx_document_repository_p1_status;
-- ALTER TABLE document_repository DROP COLUMN IF EXISTS p1_error;
-- ALTER TABLE document_repository DROP COLUMN IF EXISTS p1_completed_at;
-- ALTER TABLE document_repository DROP COLUMN IF EXISTS p1_status;
