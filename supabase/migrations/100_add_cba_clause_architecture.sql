-- Migration 100: CBA Clause Architecture (MVP Pack v1.0)
-- Adds support for clause variations, factual correctness, and LCSTX standardisation

-- ============================================================================
-- PART 1: Extend legal_clause_library for variations
-- ============================================================================

-- Add CBA-required fields to LCL
ALTER TABLE legal_clause_library
  ADD COLUMN IF NOT EXISTS factual_correctness_score DECIMAL(3,2) DEFAULT 1.0 CHECK (factual_correctness_score >= 0 AND factual_correctness_score <= 1),
  ADD COLUMN IF NOT EXISTS new_clause_flag BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS plain_english_summary TEXT,
  ADD COLUMN IF NOT EXISTS clause_text_redacted TEXT, -- For PII-safe storage
  ADD COLUMN IF NOT EXISTS parent_clause_id VARCHAR(50), -- Links variations: LC-001-b points to LC-001-a
  ADD COLUMN IF NOT EXISTS variation_letter CHAR(1), -- 'a', 'b', 'c' for variations
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

COMMENT ON COLUMN legal_clause_library.factual_correctness_score IS
  'GPT-CHECK-001 verifier score (0-1). <0.7 triggers UI red flag.';

COMMENT ON COLUMN legal_clause_library.new_clause_flag IS
  'True for AI-drafted clauses pending HITL approval';

COMMENT ON COLUMN legal_clause_library.parent_clause_id IS
  'For variations: LC-001-b parent is LC-001-a. NULL for base clauses.';

COMMENT ON COLUMN legal_clause_library.variation_letter IS
  'Letter suffix for variations: a=base, b/c/d=variants';

-- Create index for variation lookups
CREATE INDEX IF NOT EXISTS idx_lcl_parent_clause
  ON legal_clause_library(parent_clause_id) WHERE parent_clause_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lcl_new_clause_flag
  ON legal_clause_library(new_clause_flag) WHERE new_clause_flag = true;

-- ============================================================================
-- PART 2: Create LCSTX (Legal Clause Standardisation Table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_clause_standardisation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standardisation_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., "STX-001"
  lcl_clause_id VARCHAR(50) REFERENCES legal_clause_library(clause_id),

  -- Standardised forms
  standardised_clause TEXT NOT NULL,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  variation_tolerance DECIMAL(3,2) DEFAULT 0.1, -- How much variation allowed (0-1)

  -- Metadata
  plain_english_summary TEXT,
  clause_synonyms TEXT[], -- Alternative phrasings
  ai_notes JSONB, -- GPT reasoning, context

  -- Governance
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES user_profiles(id),
  tenant_id UUID REFERENCES tenants(id),

  CONSTRAINT unique_lcl_standardisation UNIQUE(lcl_clause_id, standardisation_id)
);

COMMENT ON TABLE legal_clause_standardisation IS
  'LCSTX - Standardised "safe" forms of clauses with variation tolerance rules';

CREATE INDEX idx_lcstx_lcl_clause ON legal_clause_standardisation(lcl_clause_id);
CREATE INDEX idx_lcstx_tenant ON legal_clause_standardisation(tenant_id);

-- ============================================================================
-- PART 3: Extend admin_review_queue for CBA workflow
-- ============================================================================

-- Add CBA-specific review fields
ALTER TABLE admin_review_queue
  ADD COLUMN IF NOT EXISTS factual_correctness_score DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS suggested_parent_clause_id VARCHAR(50), -- For variations
  ADD COLUMN IF NOT EXISTS suggested_variation_letter CHAR(1),
  ADD COLUMN IF NOT EXISTS cluster_id UUID, -- For deduplication clusters
  ADD COLUMN IF NOT EXISTS submitted_by UUID[] DEFAULT '{}', -- Track all submitters
  ADD COLUMN IF NOT EXISTS resolution_action TEXT CHECK (resolution_action IN ('add_new', 'add_variant', 'merge_existing', 'reject')),
  ADD COLUMN IF NOT EXISTS resulting_clause_id VARCHAR(50); -- Points to created/updated LCL entry

COMMENT ON COLUMN admin_review_queue.suggested_parent_clause_id IS
  'AI suggestion for which clause this is a variant of (e.g., LC-001-a)';

COMMENT ON COLUMN admin_review_queue.cluster_id IS
  'Groups similar simultaneous submissions (cosine 0.85-0.92)';

-- ============================================================================
-- PART 4: Deduplication & Clustering Functions
-- ============================================================================

-- Function to check for duplicates/variants before queueing
CREATE OR REPLACE FUNCTION check_clause_duplicates(
  p_clause_text TEXT,
  p_clause_type TEXT,
  p_embedding vector(1024)
)
RETURNS TABLE (
  match_type TEXT, -- 'exact', 'variant', 'unique'
  matched_clause_id VARCHAR(50),
  similarity DECIMAL(3,2),
  cluster_id UUID
) AS $$
BEGIN
  -- Check live LCL first (cosine >= 0.92 = exact duplicate)
  RETURN QUERY
  SELECT
    'exact'::TEXT AS match_type,
    lcl.clause_id,
    (1 - (lcl.metadata->'cohere_embedding')::vector <=> p_embedding)::DECIMAL(3,2) AS similarity,
    NULL::UUID AS cluster_id
  FROM legal_clause_library lcl
  WHERE lcl.clause_type = p_clause_type
    AND (1 - (lcl.metadata->'cohere_embedding')::vector <=> p_embedding) >= 0.92
  LIMIT 1;

  -- If no exact match, check for variants (0.85-0.92)
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      'variant'::TEXT AS match_type,
      lcl.clause_id,
      (1 - (lcl.metadata->'cohere_embedding')::vector <=> p_embedding)::DECIMAL(3,2) AS similarity,
      NULL::UUID AS cluster_id
    FROM legal_clause_library lcl
    WHERE lcl.clause_type = p_clause_type
      AND (1 - (lcl.metadata->'cohere_embedding')::vector <=> p_embedding) BETWEEN 0.85 AND 0.92
    ORDER BY similarity DESC
    LIMIT 1;
  END IF;

  -- Check pending review queue for clustering
  RETURN QUERY
  SELECT
    'pending_cluster'::TEXT AS match_type,
    NULL::VARCHAR(50) AS matched_clause_id,
    (1 - (arq.metadata->'embedding')::vector <=> p_embedding)::DECIMAL(3,2) AS similarity,
    arq.cluster_id
  FROM admin_review_queue arq
  WHERE arq.review_type = 'new_clause'
    AND arq.status = 'pending'
    AND arq.metadata->>'clause_type' = p_clause_type
    AND (1 - (arq.metadata->'embedding')::vector <=> p_embedding) >= 0.85
  LIMIT 1;

  -- If nothing found, it's unique
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      'unique'::TEXT AS match_type,
      NULL::VARCHAR(50),
      0::DECIMAL(3,2),
      NULL::UUID;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 5: Clause Acceptance Workflow Functions
-- ============================================================================

-- Function to accept flagged clause as new LCL entry
CREATE OR REPLACE FUNCTION accept_clause_to_lcl(
  p_review_queue_id UUID,
  p_clause_id VARCHAR(50), -- e.g., "LC-042-a" or "LC-001-b" for variant
  p_admin_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_queue_item RECORD;
  v_new_lcl_id UUID;
  v_parent_id VARCHAR(50);
  v_variation_letter CHAR(1);
BEGIN
  -- Get review queue item
  SELECT * INTO v_queue_item
  FROM admin_review_queue
  WHERE id = p_review_queue_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review queue item not found or already processed';
  END IF;

  -- Parse clause_id to determine if it's a variant (e.g., "LC-001-b")
  IF p_clause_id ~ '-[b-z]$' THEN
    -- It's a variant
    v_parent_id := SUBSTRING(p_clause_id FROM '^(LC-[0-9]+-)[b-z]$') || 'a';
    v_variation_letter := RIGHT(p_clause_id, 1);
  ELSE
    -- It's a base clause
    v_parent_id := NULL;
    v_variation_letter := 'a';
  END IF;

  -- Insert into legal_clause_library
  INSERT INTO legal_clause_library (
    clause_id,
    category,
    clause_type,
    standard_text,
    clause_text_redacted,
    plain_english_summary,
    risk_level,
    is_required,
    tags,
    version,
    factual_correctness_score,
    new_clause_flag,
    parent_clause_id,
    variation_letter,
    submitted_by,
    approved_by,
    approved_at,
    metadata
  ) VALUES (
    p_clause_id,
    (v_queue_item.metadata->>'category')::TEXT,
    v_queue_item.metadata->>'clause_type',
    v_queue_item.original_text,
    v_queue_item.original_text, -- TODO: Apply PII redaction
    v_queue_item.metadata->>'plain_english_summary',
    (v_queue_item.metadata->>'risk_level')::TEXT,
    false, -- Not required by default
    string_to_array(v_queue_item.metadata->>'tags', ','),
    1,
    v_queue_item.factual_correctness_score,
    false, -- No longer "new" once approved
    v_parent_id,
    v_variation_letter,
    v_queue_item.metadata->>'submitted_by',
    p_admin_user_id,
    now(),
    jsonb_build_object(
      'embedding_model', 'embed-english-v3.0',
      'cohere_embedding', v_queue_item.metadata->'embedding',
      'approved_from_queue', p_review_queue_id
    )
  )
  RETURNING id INTO v_new_lcl_id;

  -- Update review queue item
  UPDATE admin_review_queue
  SET
    status = 'resolved',
    resolution_action = CASE
      WHEN v_parent_id IS NULL THEN 'add_new'
      ELSE 'add_variant'
    END,
    resulting_clause_id = p_clause_id,
    reviewed_by = p_admin_user_id,
    reviewed_at = now()
  WHERE id = p_review_queue_id;

  RETURN v_new_lcl_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION accept_clause_to_lcl IS
  'Accepts a flagged clause from admin review queue into LCL as new entry or variant';

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON legal_clause_standardisation TO authenticated;
GRANT SELECT, UPDATE ON admin_review_queue TO authenticated;
GRANT EXECUTE ON FUNCTION check_clause_duplicates TO authenticated;
GRANT EXECUTE ON FUNCTION accept_clause_to_lcl TO authenticated;
