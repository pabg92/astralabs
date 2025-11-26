-- Migration: 015_add_extraction_comparison.sql
-- Purpose: Add extraction_comparisons table for A/B testing and metrics logging
-- This enables comparison between GPT-4o and GPT-5.1 extraction quality

CREATE TABLE IF NOT EXISTS extraction_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES document_repository(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  model TEXT NOT NULL,
  extraction_mode TEXT NOT NULL DEFAULT 'chunked', -- 'single_pass', 'chunked', 'chunked_fallback'

  -- Core metrics (nullable - may not always be computed)
  clause_count INTEGER DEFAULT 0,
  avg_clause_length INTEGER DEFAULT 0,
  mega_clause_count INTEGER DEFAULT 0,
  mega_clause_rate DECIMAL(5,4) DEFAULT 0,
  under_min_count INTEGER DEFAULT 0,

  -- Performance
  processing_time_ms INTEGER DEFAULT 0,
  tokens_in_estimate INTEGER DEFAULT 0,
  tokens_out_estimate INTEGER DEFAULT 0,
  input_chars INTEGER DEFAULT 0,

  -- Quality (nullable - computed post-extraction)
  quality_passed BOOLEAN DEFAULT NULL,
  quality_warnings TEXT[] DEFAULT '{}',
  quality_action TEXT DEFAULT NULL,

  -- Full metrics for analysis
  raw_metrics JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_extraction_comparisons_document ON extraction_comparisons(document_id);
CREATE INDEX IF NOT EXISTS idx_extraction_comparisons_model ON extraction_comparisons(model);
CREATE INDEX IF NOT EXISTS idx_extraction_comparisons_tenant ON extraction_comparisons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_extraction_comparisons_created ON extraction_comparisons(created_at DESC);

-- Composite index for A/B analysis (no partial - NOW() isn't immutable)
CREATE INDEX IF NOT EXISTS idx_extraction_comparisons_ab_analysis
  ON extraction_comparisons(created_at DESC, model);

-- Add comment for documentation
COMMENT ON TABLE extraction_comparisons IS 'Stores extraction metrics for A/B testing between different models (GPT-4o vs GPT-5.1)';
COMMENT ON COLUMN extraction_comparisons.model IS 'Model used for extraction: gpt-4o, gpt-5.1, gpt-5.1-codex-mini';
COMMENT ON COLUMN extraction_comparisons.extraction_mode IS 'Extraction mode: single_pass, chunked, chunked_fallback';
COMMENT ON COLUMN extraction_comparisons.mega_clause_rate IS 'Percentage of clauses exceeding MAX_CLAUSE_LENGTH (400 chars)';
COMMENT ON COLUMN extraction_comparisons.quality_action IS 'Quality gate action: persist, flag_for_review, reject';
