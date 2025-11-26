-- Migration: 016_code_review_fixes.sql
-- Purpose: Address code review findings - dedup constraints, schema integrity, security, PII

-- ============ PHASE 1: DEDUPLICATION CONSTRAINTS ============

-- Clean up duplicates in admin_review_queue before adding constraint
-- Keep the most recent entry for each (document_id, clause_boundary_id, review_type) combination
DELETE FROM admin_review_queue a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (document_id, clause_boundary_id, review_type) id
  FROM admin_review_queue
  ORDER BY document_id, clause_boundary_id, review_type, created_at DESC
);

-- Add unique constraint for admin_review_queue deduplication
ALTER TABLE admin_review_queue
ADD CONSTRAINT uq_arq_doc_clause_type
UNIQUE NULLS NOT DISTINCT (document_id, clause_boundary_id, review_type);

COMMENT ON CONSTRAINT uq_arq_doc_clause_type ON admin_review_queue IS
  'Prevents duplicate review queue entries for same document/clause/type. Added for P1 idempotency.';

-- Clean up duplicates in discrepancies before adding constraint
DELETE FROM discrepancies d
WHERE d.id NOT IN (
  SELECT DISTINCT ON (match_result_id, discrepancy_type) id
  FROM discrepancies
  ORDER BY match_result_id, discrepancy_type, created_at DESC
);

-- Add unique constraint for discrepancies deduplication
ALTER TABLE discrepancies
ADD CONSTRAINT uq_disc_match_result_type
UNIQUE (match_result_id, discrepancy_type);

COMMENT ON CONSTRAINT uq_disc_match_result_type ON discrepancies IS
  'Prevents duplicate discrepancies for same match result/type. Added for P1 idempotency.';


-- ============ PHASE 2: SCHEMA INTEGRITY ============

-- Fix mega_clause_rate DECIMAL precision (was 5,4 which maxes at 9.9999)
-- Change to DECIMAL(5,2) to support 0.00 to 999.99 (percentages stored as decimals 0-1)
ALTER TABLE extraction_comparisons
ALTER COLUMN mega_clause_rate TYPE DECIMAL(5,2);

COMMENT ON COLUMN extraction_comparisons.mega_clause_rate IS
  'Percentage of clauses exceeding MAX_CLAUSE_LENGTH. Stored as decimal (0-1 range, e.g., 0.15 = 15%)';

-- Add CHECK constraints for extraction_comparisons enumerations
ALTER TABLE extraction_comparisons
ADD CONSTRAINT chk_extraction_mode
  CHECK (extraction_mode IN ('single_pass', 'chunked', 'chunked_fallback'));

ALTER TABLE extraction_comparisons
ADD CONSTRAINT chk_model
  CHECK (model IN ('gpt-4o', 'gpt-5.1', 'gpt-5.1-codex-mini'));

ALTER TABLE extraction_comparisons
ADD CONSTRAINT chk_quality_action
  CHECK (quality_action IS NULL OR quality_action IN ('persist', 'flag_for_review', 'reject'));

-- Add FK for parent_clause_id (after cleaning orphans if any exist)
-- First, set orphaned parent_clause_ids to NULL
UPDATE legal_clause_library
SET parent_clause_id = NULL
WHERE parent_clause_id IS NOT NULL
  AND parent_clause_id NOT IN (SELECT clause_id FROM legal_clause_library);

ALTER TABLE legal_clause_library
ADD CONSTRAINT fk_lcl_parent_clause
  FOREIGN KEY (parent_clause_id)
  REFERENCES legal_clause_library(clause_id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_lcl_parent_clause ON legal_clause_library IS
  'Ensures parent_clause_id references a valid clause. Variants point to base clauses (e.g., LC-001-b -> LC-001-a).';


-- ============ PHASE 3: SECURITY FIXES ============

-- Fix manual_enqueue_document to validate tenant ownership
CREATE OR REPLACE FUNCTION manual_enqueue_document(p_document_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document RECORD;
  v_caller_tenant UUID;
  v_msg_id BIGINT;
BEGIN
  -- Get document details
  SELECT id, tenant_id, processing_status
  INTO v_document
  FROM document_repository
  WHERE id = p_document_id;

  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'Document not found: %', p_document_id;
  END IF;

  -- Get caller's tenant from auth context
  -- Note: auth.uid() returns NULL for service role calls, which is intentional
  -- Service role can enqueue any document; authenticated users are restricted
  IF auth.uid() IS NOT NULL THEN
    SELECT tenant_id INTO v_caller_tenant
    FROM user_profiles
    WHERE clerk_user_id = auth.uid();

    IF v_caller_tenant IS NULL THEN
      RAISE EXCEPTION 'User profile not found for authenticated user';
    END IF;

    IF v_caller_tenant != v_document.tenant_id THEN
      RAISE EXCEPTION 'Access denied: document belongs to different tenant';
    END IF;
  END IF;

  -- Enqueue the document
  SELECT pgmq.send(
    'document_processing_queue',
    jsonb_build_object(
      'document_id', p_document_id,
      'tenant_id', v_document.tenant_id,
      'enqueued_at', NOW(),
      'manual', true
    )
  ) INTO v_msg_id;

  -- Update document status
  UPDATE document_repository
  SET processing_status = 'queued',
      updated_at = NOW()
  WHERE id = p_document_id;

  RETURN v_msg_id;
END;
$$;

COMMENT ON FUNCTION manual_enqueue_document IS
  'Manually enqueue a document for processing. Validates tenant ownership for authenticated users. Service role can enqueue any document.';


-- Fix accept_clause_to_lcl to validate admin auth
CREATE OR REPLACE FUNCTION accept_clause_to_lcl(
  p_review_queue_id UUID,
  p_clause_id VARCHAR(50),
  p_admin_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_queue_item RECORD;
  v_new_clause_id UUID;
  v_parent_id VARCHAR(50);
  v_variation_letter CHAR(1);
  v_clause_text_redacted TEXT;
  v_redaction_applied BOOLEAN := FALSE;
BEGIN
  -- ============ AUTH VALIDATION ============
  -- Verify caller is authenticated (service role allowed for automated workflows)
  IF auth.uid() IS NOT NULL THEN
    -- For authenticated users, verify they are the claimed admin with admin role
    IF NOT EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = p_admin_user_id
        AND clerk_user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'Access denied: must be authenticated admin (user_id mismatch or insufficient role)';
    END IF;
  END IF;
  -- Note: Service role (auth.uid() IS NULL) is allowed - used by automated workflows

  -- Get the review queue item
  SELECT * INTO v_queue_item
  FROM admin_review_queue
  WHERE id = p_review_queue_id
    AND status = 'pending';

  IF v_queue_item.id IS NULL THEN
    RAISE EXCEPTION 'Review queue item not found or already processed: %', p_review_queue_id;
  END IF;

  -- Parse clause_id to determine if it's a variant (e.g., "LC-001-b")
  IF p_clause_id ~ '-[b-z]$' THEN
    -- It's a variant
    v_parent_id := SUBSTRING(p_clause_id FROM '^(LC-[0-9]+-)[b-z]$') || 'a';
    IF v_parent_id IS NULL THEN
      RAISE EXCEPTION 'Invalid variant clause_id format: %', p_clause_id;
    END IF;
    v_variation_letter := RIGHT(p_clause_id, 1);
  ELSE
    -- It's a base clause
    v_parent_id := NULL;
    v_variation_letter := 'a';
  END IF;

  -- ============ PII REDACTION ============
  -- Attempt to redact PII if document has PII entities
  IF v_queue_item.document_id IS NOT NULL THEN
    SELECT redact_pii(v_queue_item.original_text, v_queue_item.document_id)
    INTO v_clause_text_redacted;

    -- Check if redaction was actually applied
    IF v_clause_text_redacted != v_queue_item.original_text THEN
      v_redaction_applied := TRUE;
    END IF;
  ELSE
    v_clause_text_redacted := v_queue_item.original_text;
  END IF;

  -- Log when redaction is NOT applied (for compliance tracking)
  IF NOT v_redaction_applied THEN
    RAISE NOTICE 'PII redaction not applied for clause %: no PII entities found or document_id is null', p_clause_id;
  END IF;

  -- Insert into legal_clause_library
  INSERT INTO legal_clause_library (
    clause_id,
    clause_type,
    standard_text,
    clause_text_redacted,
    parent_clause_id,
    variation_letter,
    source,
    submitted_by,
    is_approved,
    created_at
  ) VALUES (
    p_clause_id,
    v_queue_item.metadata->>'clause_type',
    v_queue_item.original_text,
    v_clause_text_redacted,
    v_parent_id,
    v_variation_letter,
    'user_submission',
    NULLIF(v_queue_item.metadata->>'submitted_by', '')::UUID,
    TRUE,
    NOW()
  )
  RETURNING id INTO v_new_clause_id;

  -- Update review queue item
  UPDATE admin_review_queue
  SET status = 'accepted',
      resolution = 'Added to LCL as ' || p_clause_id,
      resolved_by = p_admin_user_id,
      resolved_at = NOW()
  WHERE id = p_review_queue_id;

  RETURN v_new_clause_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION accept_clause_to_lcl IS
  'Accept a clause from review queue into Legal Clause Library. Validates admin auth, applies PII redaction, handles variants.';


-- ============ PHASE 4: PL/pgSQL LOGIC FIXES ============

-- Fix check_clause_duplicates to use GET DIAGNOSTICS instead of FOUND
-- FOUND is NOT set by RETURN QUERY in PL/pgSQL
CREATE OR REPLACE FUNCTION check_clause_duplicates(
  p_clause_type TEXT,
  p_standard_text TEXT
)
RETURNS TABLE (
  match_type TEXT,
  matched_clause_id VARCHAR(50),
  similarity_score NUMERIC,
  cluster_id UUID
) AS $$
DECLARE
  v_row_count INTEGER;
BEGIN
  -- PRIORITY 1: Exact match in LCL (similarity >= 0.92)
  RETURN QUERY
  SELECT
    'exact'::TEXT AS match_type,
    lcl.clause_id AS matched_clause_id,
    (1 - (lcl.standard_text <-> p_standard_text))::NUMERIC AS similarity_score,
    NULL::UUID AS cluster_id
  FROM legal_clause_library lcl
  WHERE lcl.clause_type = p_clause_type
    AND (1 - (lcl.standard_text <-> p_standard_text)) >= 0.92
  ORDER BY similarity_score DESC
  LIMIT 1;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count > 0 THEN
    RETURN;  -- Exit after first match
  END IF;

  -- PRIORITY 2: Variant match in LCL (similarity 0.85-0.92)
  RETURN QUERY
  SELECT
    'variant'::TEXT AS match_type,
    lcl.clause_id AS matched_clause_id,
    (1 - (lcl.standard_text <-> p_standard_text))::NUMERIC AS similarity_score,
    NULL::UUID AS cluster_id
  FROM legal_clause_library lcl
  WHERE lcl.clause_type = p_clause_type
    AND (1 - (lcl.standard_text <-> p_standard_text)) BETWEEN 0.85 AND 0.92
  ORDER BY similarity_score DESC
  LIMIT 1;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count > 0 THEN
    RETURN;  -- Exit after first match
  END IF;

  -- PRIORITY 3: Pending cluster in admin_review_queue (similar pending items)
  RETURN QUERY
  SELECT
    'pending_cluster'::TEXT AS match_type,
    NULL::VARCHAR(50) AS matched_clause_id,
    (1 - (arq.original_text <-> p_standard_text))::NUMERIC AS similarity_score,
    arq.id AS cluster_id
  FROM admin_review_queue arq
  WHERE arq.review_type = 'new_clause'
    AND arq.status = 'pending'
    AND (arq.metadata->>'clause_type') = p_clause_type
    AND (1 - (arq.original_text <-> p_standard_text)) >= 0.85
  ORDER BY similarity_score DESC
  LIMIT 1;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count > 0 THEN
    RETURN;  -- Exit after first match
  END IF;

  -- PRIORITY 4: No match - unique clause
  RETURN QUERY SELECT 'unique'::TEXT, NULL::VARCHAR(50), 0::NUMERIC, NULL::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_clause_duplicates IS
  'Check for duplicate/similar clauses in LCL and pending review queue. Returns first match by priority: exact > variant > pending_cluster > unique.';


-- ============ PHASE 5: PII REDACTION FUNCTION ============

-- Create or update redact_pii function
CREATE OR REPLACE FUNCTION redact_pii(p_text TEXT, p_document_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_redacted TEXT := p_text;
  v_entity RECORD;
  v_entity_count INTEGER := 0;
BEGIN
  -- Handle null inputs
  IF p_text IS NULL OR p_document_id IS NULL THEN
    RAISE NOTICE 'redact_pii: null input (text_null: %, doc_null: %)', p_text IS NULL, p_document_id IS NULL;
    RETURN p_text;
  END IF;

  -- Replace known PII entities with redaction tokens
  FOR v_entity IN
    SELECT entity_type, entity_value, redaction_token
    FROM pii_entities
    WHERE document_id = p_document_id
      AND entity_value IS NOT NULL
      AND LENGTH(entity_value) > 0
    ORDER BY LENGTH(entity_value) DESC  -- Replace longer matches first
  LOOP
    IF POSITION(v_entity.entity_value IN v_redacted) > 0 THEN
      v_redacted := REPLACE(v_redacted, v_entity.entity_value, COALESCE(v_entity.redaction_token, '[REDACTED]'));
      v_entity_count := v_entity_count + 1;
    END IF;
  END LOOP;

  -- Log redaction activity
  IF v_entity_count > 0 THEN
    RAISE NOTICE 'redact_pii: replaced % entities for document %', v_entity_count, p_document_id;
  ELSE
    RAISE NOTICE 'redact_pii: no PII entities found for document %', p_document_id;
  END IF;

  RETURN v_redacted;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION redact_pii IS
  'Replace PII entities in text with redaction tokens. Logs when redaction is/is not applied. Returns original text if no entities found.';


-- ============ GRANTS ============
GRANT EXECUTE ON FUNCTION manual_enqueue_document TO authenticated;
GRANT EXECUTE ON FUNCTION accept_clause_to_lcl TO authenticated;
GRANT EXECUTE ON FUNCTION check_clause_duplicates TO authenticated;
GRANT EXECUTE ON FUNCTION redact_pii TO authenticated;

-- Note: Broad GRANT ALL on all tables remains from initial schema (000_initial_schema.sql)
-- Full least-privilege implementation requires RLS on all tables first
-- This is documented and tracked for future work
