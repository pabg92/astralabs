-- Migration: Create Sandbox Schema for LCL Matching Tests
-- Date: 2026-01-22
-- Description: Creates an isolated sandbox environment to test and refine LCL matching
--              via embeddings with a small dataset. Focus on understanding how clause
--              matching works before DOCX integration.
--
-- Tables:
--   sandbox.legal_clause_library  - Test LCL clauses with embeddings
--   sandbox.clause_match_results  - Match outputs from test queries
--   sandbox.admin_review_queue    - Escalation queue for review scenarios
--   sandbox.test_cases            - Synthetic test cases with expected outcomes

-- ============================================================================
-- Create sandbox schema
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS sandbox;

-- ============================================================================
-- Sandbox LCL Table (mirrors production structure)
-- ============================================================================
CREATE TABLE sandbox.legal_clause_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_id VARCHAR(50) UNIQUE NOT NULL,
  clause_type TEXT NOT NULL,
  category TEXT,
  standard_text TEXT NOT NULL,
  risk_level TEXT DEFAULT 'medium',
  embedding vector(1024),
  parent_clause_id VARCHAR(50),
  variation_letter CHAR(1) DEFAULT 'a',
  tags TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX idx_sandbox_lcl_clause_type ON sandbox.legal_clause_library(clause_type);
CREATE INDEX idx_sandbox_lcl_category ON sandbox.legal_clause_library(category);

-- Vector index for fast similarity search (ivfflat with 20 lists for small dataset)
CREATE INDEX idx_sandbox_lcl_embedding
  ON sandbox.legal_clause_library
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 20);

-- ============================================================================
-- Sandbox Match Results Table
-- ============================================================================
CREATE TABLE sandbox.clause_match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_text TEXT NOT NULL,
  input_embedding vector(1024),
  matched_clause_id VARCHAR(50),
  matched_clause_text TEXT,
  similarity_score FLOAT,
  match_category TEXT, -- auto_merge / review_required / similar / partial / unique
  classification TEXT, -- GREEN / AMBER / RED
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sandbox_match_results_category ON sandbox.clause_match_results(match_category);
CREATE INDEX idx_sandbox_match_results_classification ON sandbox.clause_match_results(classification);

-- ============================================================================
-- Sandbox Review Queue Table
-- ============================================================================
CREATE TABLE sandbox.admin_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_text TEXT NOT NULL,
  input_embedding vector(1024),
  matched_clause_id VARCHAR(50),
  similarity_score FLOAT,
  review_type TEXT NOT NULL, -- new_clause / potential_variant
  status TEXT DEFAULT 'pending', -- pending / approved_new / approved_variant / rejected
  resolution_notes TEXT,
  created_clause_id VARCHAR(50), -- If approved, the new clause ID created
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sandbox_review_queue_status ON sandbox.admin_review_queue(status);
CREATE INDEX idx_sandbox_review_queue_type ON sandbox.admin_review_queue(review_type);

-- ============================================================================
-- Sandbox Test Cases Table
-- ============================================================================
CREATE TABLE sandbox.test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id VARCHAR(50) UNIQUE NOT NULL,
  input_text TEXT NOT NULL,
  expected_match_clause_id VARCHAR(50), -- NULL if expected to be novel
  expected_similarity_min FLOAT,
  expected_similarity_max FLOAT,
  expected_match_category TEXT, -- auto_merge / review_required / similar / partial / unique
  scenario TEXT NOT NULL, -- exact_match / near_match / variant / novel_clause
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sandbox_test_cases_scenario ON sandbox.test_cases(scenario);

-- ============================================================================
-- Test Results Table (for tracking test runs)
-- ============================================================================
CREATE TABLE sandbox.test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ DEFAULT now(),
  total_tests INT NOT NULL,
  passed INT NOT NULL,
  failed INT NOT NULL,
  results JSONB NOT NULL, -- Detailed results for each test case
  notes TEXT
);

-- ============================================================================
-- Function: Find similar clauses in sandbox
-- ============================================================================
CREATE OR REPLACE FUNCTION sandbox.find_similar_clauses(
  p_query_embedding TEXT,
  p_similarity_threshold FLOAT DEFAULT 0.60,
  p_max_results INT DEFAULT 5
)
RETURNS TABLE (
  clause_id VARCHAR(50),
  clause_type TEXT,
  category TEXT,
  standard_text TEXT,
  similarity FLOAT,
  match_category TEXT,
  classification TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query_vector vector;
BEGIN
  -- Cast text embedding to vector type
  query_vector := p_query_embedding::vector;

  RETURN QUERY
  SELECT
    lcl.clause_id,
    lcl.clause_type,
    lcl.category,
    lcl.standard_text,
    (1 - (lcl.embedding <=> query_vector))::FLOAT AS similarity,
    CASE
      WHEN (1 - (lcl.embedding <=> query_vector)) >= 0.92 THEN 'auto_merge'
      WHEN (1 - (lcl.embedding <=> query_vector)) >= 0.85 THEN 'review_required'
      WHEN (1 - (lcl.embedding <=> query_vector)) >= 0.75 THEN 'similar'
      WHEN (1 - (lcl.embedding <=> query_vector)) >= 0.60 THEN 'partial'
      ELSE 'unique'
    END AS match_category,
    CASE
      WHEN (1 - (lcl.embedding <=> query_vector)) >= 0.75 THEN 'GREEN'
      WHEN (1 - (lcl.embedding <=> query_vector)) >= 0.60 THEN 'AMBER'
      ELSE 'RED'
    END AS classification
  FROM sandbox.legal_clause_library lcl
  WHERE
    lcl.embedding IS NOT NULL
    AND (1 - (lcl.embedding <=> query_vector)) >= p_similarity_threshold
  ORDER BY lcl.embedding <=> query_vector
  LIMIT p_max_results;
END;
$$;

-- ============================================================================
-- Function: Record match result
-- ============================================================================
CREATE OR REPLACE FUNCTION sandbox.record_match_result(
  p_input_text TEXT,
  p_input_embedding TEXT,
  p_matched_clause_id VARCHAR(50),
  p_matched_clause_text TEXT,
  p_similarity_score FLOAT,
  p_match_category TEXT,
  p_classification TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result_id UUID;
BEGIN
  INSERT INTO sandbox.clause_match_results (
    input_text,
    input_embedding,
    matched_clause_id,
    matched_clause_text,
    similarity_score,
    match_category,
    classification
  )
  VALUES (
    p_input_text,
    p_input_embedding::vector,
    p_matched_clause_id,
    p_matched_clause_text,
    p_similarity_score,
    p_match_category,
    p_classification
  )
  RETURNING id INTO result_id;

  RETURN result_id;
END;
$$;

-- ============================================================================
-- Function: Add to review queue
-- ============================================================================
CREATE OR REPLACE FUNCTION sandbox.add_to_review_queue(
  p_input_text TEXT,
  p_input_embedding TEXT,
  p_matched_clause_id VARCHAR(50),
  p_similarity_score FLOAT,
  p_review_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  queue_id UUID;
BEGIN
  INSERT INTO sandbox.admin_review_queue (
    input_text,
    input_embedding,
    matched_clause_id,
    similarity_score,
    review_type,
    status
  )
  VALUES (
    p_input_text,
    p_input_embedding::vector,
    p_matched_clause_id,
    p_similarity_score,
    p_review_type,
    'pending'
  )
  RETURNING id INTO queue_id;

  RETURN queue_id;
END;
$$;

-- ============================================================================
-- Grant Permissions to service_role
-- ============================================================================
GRANT USAGE ON SCHEMA sandbox TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA sandbox TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA sandbox TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sandbox TO service_role;

-- Also grant to authenticated users for API access
GRANT USAGE ON SCHEMA sandbox TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA sandbox TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA sandbox TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sandbox TO authenticated;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON SCHEMA sandbox IS 'Isolated sandbox for testing LCL matching via embeddings';
COMMENT ON TABLE sandbox.legal_clause_library IS 'Test LCL clauses with embeddings for sandbox matching';
COMMENT ON TABLE sandbox.clause_match_results IS 'Results of test clause matching queries';
COMMENT ON TABLE sandbox.admin_review_queue IS 'Queue for reviewing potential new or variant clauses';
COMMENT ON TABLE sandbox.test_cases IS 'Synthetic test cases with expected outcomes';
COMMENT ON TABLE sandbox.test_runs IS 'History of test suite runs with pass/fail tracking';
COMMENT ON FUNCTION sandbox.find_similar_clauses IS 'Find similar clauses using vector similarity search';

-- ============================================================================
-- Rollback (if needed):
-- ============================================================================
-- DROP SCHEMA sandbox CASCADE;
