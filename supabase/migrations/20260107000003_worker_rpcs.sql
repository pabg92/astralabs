-- Migration: Worker RPCs
-- Issues: #1 (visibility timeout heartbeat), #4 (batch inserts for atomicity)
-- Date: 2026-01-07
--
-- Creates RPC functions for the worker to:
-- 1. Extend message visibility timeout (heartbeat pattern)
-- 2. Batch insert discrepancies
-- 3. Batch insert admin review queue items

-- ============================================================================
-- Issue #1: Visibility Timeout Extension RPC (Heartbeat Pattern)
-- ============================================================================
-- pgmq.set_vt extends the visibility timeout for a message, preventing redelivery
-- while the worker is still processing. Call this after each major processing step.
--
-- Note: pgmq.set_vt(queue_name text, msg_id bigint, vt_offset int) sets VT to
-- now() + vt_offset seconds.

CREATE OR REPLACE FUNCTION extend_message_visibility(
  p_msg_id bigint,
  p_extension_seconds int DEFAULT 120
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Extend visibility timeout using pgmq's set_vt function
  -- This resets the VT to now() + p_extension_seconds
  PERFORM pgmq.set_vt('document_processing_queue', p_msg_id, p_extension_seconds);
END;
$$;

GRANT EXECUTE ON FUNCTION extend_message_visibility(bigint, int) TO service_role;

COMMENT ON FUNCTION extend_message_visibility IS
'Extends visibility timeout for a queue message using pgmq.set_vt.
Call periodically during long-running processing to prevent message redelivery.
Default extension is 120 seconds. Worker should call after each major step.';

-- ============================================================================
-- Issue #4: Batch Insert Discrepancies RPC
-- ============================================================================
-- Complements the existing batch_update_clause_match_results from PR #48.
-- Uses ON CONFLICT DO NOTHING for idempotent inserts on retry.

CREATE OR REPLACE FUNCTION batch_insert_discrepancies(items jsonb)
RETURNS TABLE(inserted_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  insert_count int := 0;
BEGIN
  -- Insert discrepancies in batch
  -- Each item should have: match_result_id, document_id, discrepancy_type, severity,
  --                        description, affected_text (optional), suggested_action (optional)
  INSERT INTO discrepancies (
    match_result_id,
    document_id,
    discrepancy_type,
    severity,
    description,
    affected_text,
    suggested_action
  )
  SELECT
    (item->>'match_result_id')::uuid,
    (item->>'document_id')::uuid,
    item->>'discrepancy_type',
    item->>'severity',
    item->>'description',
    item->>'affected_text',
    item->>'suggested_action'
  FROM jsonb_array_elements(items) AS item
  ON CONFLICT DO NOTHING;  -- Idempotent: ignore duplicates on retry

  GET DIAGNOSTICS insert_count = ROW_COUNT;
  RETURN QUERY SELECT insert_count;
END;
$$;

GRANT EXECUTE ON FUNCTION batch_insert_discrepancies(jsonb) TO service_role;

COMMENT ON FUNCTION batch_insert_discrepancies IS
'Batch inserts discrepancies for P1 reconciliation.
Uses ON CONFLICT DO NOTHING for idempotent retries.
Reduces N DB round-trips to 1.';

-- ============================================================================
-- Issue #4: Batch Insert Admin Review Queue RPC
-- ============================================================================
-- For flagging low-confidence matches and other review items in bulk.

CREATE OR REPLACE FUNCTION batch_insert_review_queue(items jsonb)
RETURNS TABLE(inserted_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  insert_count int := 0;
BEGIN
  -- Insert review queue items in batch
  -- Each item should have: document_id, clause_boundary_id, review_type, status (optional),
  --                        priority (optional), issue_description, original_text, metadata (optional)
  INSERT INTO admin_review_queue (
    document_id,
    clause_boundary_id,
    review_type,
    status,
    priority,
    issue_description,
    original_text,
    metadata
  )
  SELECT
    (item->>'document_id')::uuid,
    (item->>'clause_boundary_id')::uuid,
    item->>'review_type',
    COALESCE(item->>'status', 'pending'),
    COALESCE(item->>'priority', 'medium'),
    item->>'issue_description',
    item->>'original_text',
    COALESCE((item->'metadata')::jsonb, '{}'::jsonb)
  FROM jsonb_array_elements(items) AS item
  ON CONFLICT DO NOTHING;  -- Idempotent: ignore duplicates on retry

  GET DIAGNOSTICS insert_count = ROW_COUNT;
  RETURN QUERY SELECT insert_count;
END;
$$;

GRANT EXECUTE ON FUNCTION batch_insert_review_queue(jsonb) TO service_role;

COMMENT ON FUNCTION batch_insert_review_queue IS
'Batch inserts admin review queue items for P1 reconciliation.
Uses ON CONFLICT DO NOTHING for idempotent retries.
Reduces N DB round-trips to 1.';

-- ============================================================================
-- Rollback (if needed):
-- ============================================================================
-- DROP FUNCTION IF EXISTS extend_message_visibility(bigint, int);
-- DROP FUNCTION IF EXISTS batch_insert_discrepancies(jsonb);
-- DROP FUNCTION IF EXISTS batch_insert_review_queue(jsonb);
