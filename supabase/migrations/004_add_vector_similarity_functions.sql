-- Migration: Add vector similarity search functions
-- Date: 2025-11-03
-- Description: SQL functions for semantic clause matching using pgvector
--              Implements the two-tier similarity thresholds:
--              - ≥0.92: Auto-merge (treat as duplicate)
--              - 0.85-0.92: Flag for human review
--              - <0.85: Treat as unique

-- Function: find_similar_clauses
-- Purpose: Search LCL for semantically similar clauses using cosine similarity
CREATE OR REPLACE FUNCTION find_similar_clauses(
  query_embedding vector,
  similarity_threshold FLOAT DEFAULT 0.85,
  max_results INT DEFAULT 10,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  clause_id TEXT,
  standard_text TEXT,
  clause_type TEXT,
  category TEXT,
  risk_level TEXT,
  similarity FLOAT,
  match_category TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lcl.id,
    lcl.clause_id,
    lcl.standard_text,
    lcl.clause_type,
    lcl.category::TEXT,
    lcl.risk_level::TEXT,
    (1 - (lcl.embedding <=> query_embedding))::FLOAT AS similarity,
    CASE
      WHEN (1 - (lcl.embedding <=> query_embedding)) >= 0.92 THEN 'auto_merge'
      WHEN (1 - (lcl.embedding <=> query_embedding)) >= 0.85 THEN 'review_required'
      ELSE 'unique'
    END AS match_category
  FROM legal_clause_library lcl
  WHERE
    lcl.active = true
    AND (p_tenant_id IS NULL OR lcl.created_by IN (
      SELECT id FROM user_profiles WHERE tenant_id = p_tenant_id
    ))  -- Optional tenant filtering (global clauses visible to all)
    AND (1 - (lcl.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY lcl.embedding <=> query_embedding
  LIMIT max_results;
END;
$$;

COMMENT ON FUNCTION find_similar_clauses IS
'Finds semantically similar clauses in LCL using cosine similarity.

Parameters:
- query_embedding: Vector embedding of clause to match (from Cohere/OpenAI)
- similarity_threshold: Minimum similarity score (default 0.85)
- max_results: Maximum number of results to return (default 10)
- p_tenant_id: Optional tenant filter (NULL = search global LCL)

Returns:
- match_category:
  - auto_merge (≥0.92): High confidence duplicate - auto-merge
  - review_required (0.85-0.92): Potential duplicate - human review needed
  - unique (<0.85): Not returned if below threshold

Usage:
SELECT * FROM find_similar_clauses(
  $1::vector,  -- embedding from Cohere
  0.85,        -- threshold
  10           -- max results
);';

-- Function: find_duplicate_clusters
-- Purpose: Identify potential duplicate clusters for batch deduplication
CREATE OR REPLACE FUNCTION find_duplicate_clusters(
  min_similarity FLOAT DEFAULT 0.85,
  batch_size INT DEFAULT 50
)
RETURNS TABLE (
  primary_clause_id UUID,
  primary_clause_text TEXT,
  duplicate_ids UUID[],
  similarity_scores NUMERIC[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH clause_pairs AS (
    SELECT
      lcl1.id AS id1,
      lcl2.id AS id2,
      lcl1.standard_text AS text1,
      (1 - (lcl1.embedding <=> lcl2.embedding))::NUMERIC AS similarity
    FROM legal_clause_library lcl1
    CROSS JOIN legal_clause_library lcl2
    WHERE
      lcl1.id < lcl2.id  -- Avoid duplicate pairs (A-B = B-A)
      AND lcl1.active = true
      AND lcl2.active = true
      AND (1 - (lcl1.embedding <=> lcl2.embedding)) >= min_similarity
      -- Exclude already clustered clauses
      AND NOT EXISTS (
        SELECT 1 FROM clause_deduplication_clusters cdc
        WHERE lcl1.id = ANY(cdc.duplicate_clause_ids)
           OR lcl2.id = ANY(cdc.duplicate_clause_ids)
      )
  ),
  grouped_duplicates AS (
    SELECT
      id1 AS primary_id,
      ARRAY_AGG(id2 ORDER BY similarity DESC) AS dup_ids,
      ARRAY_AGG(similarity ORDER BY similarity DESC) AS sim_scores,
      text1
    FROM clause_pairs
    GROUP BY id1, text1
    HAVING COUNT(*) > 0
    ORDER BY COUNT(*) DESC
    LIMIT batch_size
  )
  SELECT
    primary_id,
    text1,
    dup_ids,
    sim_scores
  FROM grouped_duplicates;
END;
$$;

COMMENT ON FUNCTION find_duplicate_clusters IS
'Identifies potential duplicate clause clusters for batch deduplication.
Runs weekly via pg_cron to find new duplicate patterns.

Parameters:
- min_similarity: Minimum similarity to consider as duplicate (default 0.85)
- batch_size: Maximum number of clusters to return (default 50)

Returns clusters ordered by number of duplicates (most duplicates first).
Excludes clauses already in existing deduplication clusters.';

-- Function: match_clause_to_standardization
-- Purpose: Find best LCSTX match for a given clause
CREATE OR REPLACE FUNCTION match_clause_to_standardization(
  p_clause_text TEXT,
  p_clause_embedding vector,
  p_clause_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  standardization_id TEXT,
  standardized_clause TEXT,
  clause_ids TEXT[],
  similarity FLOAT,
  variation_tolerance TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH lcl_matches AS (
    SELECT
      lcl.id,
      lcl.clause_id,
      (1 - (lcl.embedding <=> p_clause_embedding))::FLOAT AS similarity
    FROM legal_clause_library lcl
    WHERE
      lcl.active = true
      AND (p_clause_type IS NULL OR lcl.clause_type = p_clause_type)
    ORDER BY lcl.embedding <=> p_clause_embedding
    LIMIT 5
  )
  SELECT DISTINCT
    lcstx.standardization_id,
    lcstx.standardized_clause,
    lcstx.clause_ids,
    MAX(lm.similarity) AS best_similarity,
    lcstx.variation_tolerance
  FROM lcl_matches lm
  JOIN legal_clause_standardization lcstx
    ON lm.clause_id = ANY(lcstx.clause_ids)
  GROUP BY
    lcstx.standardization_id,
    lcstx.standardized_clause,
    lcstx.clause_ids,
    lcstx.variation_tolerance
  ORDER BY best_similarity DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION match_clause_to_standardization IS
'Finds best LCSTX (standardization) match for a given clause.
Used during reconciliation to determine canonical clause definition.

Parameters:
- p_clause_text: Clause text to match (currently unused, reserved for future text matching)
- p_clause_embedding: Vector embedding of clause
- p_clause_type: Optional clause type filter (e.g., "Payment Terms")

Returns:
- Best matching LCSTX with highest similarity to any of its linked LCL variants
- variation_tolerance: Acceptable variation description from LCSTX

Usage in reconciliation:
1. Extract clause from contract
2. Generate embedding (Cohere/OpenAI)
3. Call match_clause_to_standardization()
4. Use returned LCSTX as canonical reference
5. Apply variation_tolerance rules for pass/fail determination';

-- Function: batch_generate_embeddings
-- Purpose: Helper for bulk embedding generation (for seeding/migration)
CREATE OR REPLACE FUNCTION batch_generate_embeddings()
RETURNS TABLE (
  clause_id TEXT,
  needs_embedding BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lcl.clause_id,
    (lcl.embedding IS NULL) AS needs_embedding
  FROM legal_clause_library lcl
  WHERE lcl.embedding IS NULL
    AND lcl.active = true
  ORDER BY lcl.created_at DESC
  LIMIT 100;
END;
$$;

COMMENT ON FUNCTION batch_generate_embeddings IS
'Returns list of clauses needing embeddings (for batch processing).
Use this to identify clauses that need Cohere/OpenAI embedding generation.

Typical workflow:
1. Call batch_generate_embeddings() to get list
2. For each clause_id: Generate embedding via API
3. UPDATE legal_clause_library SET embedding = $1 WHERE clause_id = $2';

-- Create index for faster similarity searches
CREATE INDEX IF NOT EXISTS idx_lcl_embedding_cosine
  ON legal_clause_library
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

COMMENT ON INDEX idx_lcl_embedding_cosine IS
'IVFFlat index for fast cosine similarity searches on clause embeddings.
- lists = 100: Suitable for 1,000-10,000 clauses (adjust for scale)
- vector_cosine_ops: Optimizes cosine distance calculations

For larger datasets (>10k clauses), consider increasing lists or switching to HNSW index.';

-- Create statistics view for monitoring
CREATE OR REPLACE VIEW v_embedding_statistics AS
SELECT
  COUNT(*) AS total_clauses,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded_clauses,
  COUNT(*) FILTER (WHERE embedding IS NULL) AS missing_embeddings,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE embedding IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS embedding_coverage_pct
FROM legal_clause_library
WHERE active = true;

COMMENT ON VIEW v_embedding_statistics IS
'Monitoring view for embedding coverage in LCL.
Use this to track migration progress when bulk-generating embeddings.';
