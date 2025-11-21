-- Migration 005: Add RAG Parsing & Risk Separation
-- Separates parsing quality from risk assessment for better clause tracking
-- Created: 2025-11-08

-- Add parsing vs risk RAG status to clause_match_results
ALTER TABLE clause_match_results
  ADD COLUMN rag_parsing rag_status DEFAULT 'amber',
  ADD COLUMN rag_risk rag_status DEFAULT 'amber';

COMMENT ON COLUMN clause_match_results.rag_parsing IS
  'Parsing quality indicator: green (high confidence), amber (medium), red (low confidence)';

COMMENT ON COLUMN clause_match_results.rag_risk IS
  'Risk assessment indicator: green (low risk), amber (review needed), red (high risk)';

-- Add parsing quality metrics to clause_boundaries
ALTER TABLE clause_boundaries
  ADD COLUMN parsing_quality NUMERIC(4,3) CHECK (parsing_quality >= 0 AND parsing_quality <= 1),
  ADD COLUMN parsing_issues JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN clause_boundaries.parsing_quality IS
  'Parsing confidence score from 0.000 to 1.000. Values < 0.7 trigger review.';

COMMENT ON COLUMN clause_boundaries.parsing_issues IS
  'Array of parsing issues detected during extraction.
   Format: [{ "type": "low_confidence", "score": 0.62, "description": "..." }]';

-- Add index for querying low-quality parsing
CREATE INDEX idx_clause_boundaries_parsing_quality
  ON clause_boundaries(parsing_quality)
  WHERE parsing_quality < 0.7;

-- Add index for multi-RAG queries
CREATE INDEX idx_clause_match_results_rag_parsing
  ON clause_match_results(rag_parsing);

CREATE INDEX idx_clause_match_results_rag_risk
  ON clause_match_results(rag_risk);
