-- Migration: 017_schema_integrity_followup.sql
-- Purpose: Address CodeRabbit review issues #6, #7, #8 from PR #5 followup

-- ============ ISSUE #6: CHECK constraints for variation_letter columns ============

-- Add CHECK constraint on legal_clause_library.variation_letter
-- Valid values: lowercase letters a-z (for variations like LC-001-a, LC-001-b, etc.)
ALTER TABLE legal_clause_library
ADD CONSTRAINT chk_lcl_variation_letter
  CHECK (variation_letter IS NULL OR variation_letter ~ '^[a-z]$');

COMMENT ON CONSTRAINT chk_lcl_variation_letter ON legal_clause_library IS
  'Ensures variation_letter is a single lowercase letter (a-z) for clause variants.';

-- Add CHECK constraint on admin_review_queue.suggested_variation_letter
ALTER TABLE admin_review_queue
ADD CONSTRAINT chk_arq_suggested_variation_letter
  CHECK (suggested_variation_letter IS NULL OR suggested_variation_letter ~ '^[a-z]$');

COMMENT ON CONSTRAINT chk_arq_suggested_variation_letter ON admin_review_queue IS
  'Ensures suggested_variation_letter is a single lowercase letter (a-z).';


-- ============ ISSUE #7: FK constraint on suggested_parent_clause_id ============

-- First, clean up any orphaned suggested_parent_clause_ids
UPDATE admin_review_queue
SET suggested_parent_clause_id = NULL
WHERE suggested_parent_clause_id IS NOT NULL
  AND suggested_parent_clause_id NOT IN (SELECT clause_id FROM legal_clause_library);

-- Add FK constraint
ALTER TABLE admin_review_queue
ADD CONSTRAINT fk_arq_suggested_parent
  FOREIGN KEY (suggested_parent_clause_id)
  REFERENCES legal_clause_library(clause_id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT fk_arq_suggested_parent ON admin_review_queue IS
  'Ensures suggested_parent_clause_id references a valid clause in LCL. SET NULL on delete.';


-- ============ ISSUE #8: Improve clause_id regex parsing in accept_clause_to_lcl ============

-- Recreate accept_clause_to_lcl with improved regex parsing and validation
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
  v_base_clause_id TEXT;
BEGIN
  -- ============ AUTH VALIDATION ============
  -- Note: auth.uid() IS NULL for service role calls, which is intentional.
  -- Service role is allowed for automated workflows (e.g., batch processing).
  -- Authenticated users must be admin with matching user_id.
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = p_admin_user_id
        AND clerk_user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'Access denied: must be authenticated admin (user_id mismatch or insufficient role)';
    END IF;
  END IF;

  -- Get the review queue item
  SELECT * INTO v_queue_item
  FROM admin_review_queue
  WHERE id = p_review_queue_id
    AND status = 'pending';

  IF v_queue_item.id IS NULL THEN
    RAISE EXCEPTION 'Review queue item not found or already processed: %', p_review_queue_id;
  END IF;

  -- ============ IMPROVED CLAUSE_ID PARSING ============
  -- Validate clause_id format first
  IF NOT (p_clause_id ~ '^LC-[0-9]+-[a-z]$') THEN
    RAISE EXCEPTION 'Invalid clause_id format: %. Expected format: LC-NNN-x (e.g., LC-001-a)', p_clause_id;
  END IF;

  -- Extract variation letter (always the last character after validation)
  v_variation_letter := RIGHT(p_clause_id, 1);

  -- Determine if it's a variant (b-z) or base clause (a)
  IF v_variation_letter != 'a' THEN
    -- It's a variant - extract base clause ID
    v_base_clause_id := SUBSTRING(p_clause_id FROM '^(LC-[0-9]+)-[b-z]$');
    IF v_base_clause_id IS NULL THEN
      RAISE EXCEPTION 'Failed to extract base clause ID from variant: %', p_clause_id;
    END IF;
    v_parent_id := v_base_clause_id || '-a';

    -- Verify parent clause exists
    IF NOT EXISTS (SELECT 1 FROM legal_clause_library WHERE clause_id = v_parent_id) THEN
      RAISE EXCEPTION 'Parent clause % does not exist for variant %', v_parent_id, p_clause_id;
    END IF;
  ELSE
    -- It's a base clause
    v_parent_id := NULL;
  END IF;

  -- ============ PII REDACTION ============
  IF v_queue_item.document_id IS NOT NULL THEN
    SELECT redact_pii(v_queue_item.original_text, v_queue_item.document_id)
    INTO v_clause_text_redacted;

    IF v_clause_text_redacted != v_queue_item.original_text THEN
      v_redaction_applied := TRUE;
    END IF;
  ELSE
    v_clause_text_redacted := v_queue_item.original_text;
  END IF;

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
  'Accept a clause from review queue into Legal Clause Library. Validates clause_id format, admin auth, applies PII redaction, handles variants with parent validation.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION accept_clause_to_lcl TO authenticated;
