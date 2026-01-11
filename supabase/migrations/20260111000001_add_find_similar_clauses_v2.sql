-- Migration: Add find_similar_clauses_v2 RPC function
-- Date: 2026-01-11
-- Description: Version 2 of similarity search that accepts text-formatted embedding
--              instead of native vector type for easier JavaScript integration
--
-- Why v2?
-- The original find_similar_clauses() requires passing a vector type, which is
-- difficult from JavaScript (Supabase JS client doesn't handle vector casting).
-- This v2 accepts the embedding as a text string '[0.1,0.2,...]' and casts internally.

-- ============================================================================
-- Function: find_similar_clauses_v2
-- Purpose: Same as find_similar_clauses but accepts text-formatted embedding
-- ============================================================================

CREATE OR REPLACE FUNCTION find_similar_clauses_v2(
  p_query_embedding TEXT,
  p_similarity_threshold FLOAT DEFAULT 0.60,
  p_max_results INT DEFAULT 10,
  p_tenant_id UUID DEFAULT NULL,
  p_clause_type TEXT DEFAULT NULL
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
SECURITY DEFINER
AS $$
DECLARE
  query_vector vector;
BEGIN
  -- Cast text embedding to vector type
  query_vector := p_query_embedding::vector;

  RETURN QUERY
  SELECT
    lcl.id,
    lcl.clause_id,
    lcl.standard_text,
    lcl.clause_type,
    lcl.category::TEXT,
    lcl.risk_level::TEXT,
    (1 - (lcl.embedding <=> query_vector))::FLOAT AS similarity,
    CASE
      WHEN (1 - (lcl.embedding <=> query_vector)) >= 0.92 THEN 'auto_merge'
      WHEN (1 - (lcl.embedding <=> query_vector)) >= 0.85 THEN 'review_required'
      ELSE 'unique'
    END AS match_category
  FROM legal_clause_library lcl
  WHERE
    lcl.active = true
    AND (p_tenant_id IS NULL OR lcl.created_by IN (
      SELECT up.id FROM user_profiles up WHERE up.tenant_id = p_tenant_id
    ))
    AND (p_clause_type IS NULL OR lcl.clause_type = p_clause_type)
    AND (1 - (lcl.embedding <=> query_vector)) >= p_similarity_threshold
  ORDER BY lcl.embedding <=> query_vector
  LIMIT p_max_results;
END;
$$;

-- Grant access to service role (used by worker)
GRANT EXECUTE ON FUNCTION find_similar_clauses_v2(TEXT, FLOAT, INT, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION find_similar_clauses_v2 IS
'Version 2 of similarity search that accepts text-formatted embedding.

This function is easier to call from JavaScript as it accepts the embedding
as a text string (e.g., "[0.1, 0.2, 0.3, ...]") instead of requiring vector casting.

Parameters:
- p_query_embedding: Text-formatted embedding array (e.g., "[0.1,0.2,...]")
- p_similarity_threshold: Minimum similarity score (default 0.60)
- p_max_results: Maximum results to return (default 10)
- p_tenant_id: Optional tenant filter (NULL = search all)
- p_clause_type: Optional clause type filter (NULL = search all types)

Returns:
- id: UUID of the LCL entry
- clause_id: Clause identifier (e.g., LCL-001a)
- standard_text: The standard clause text
- clause_type: Type of clause
- category: Clause category
- risk_level: Risk level classification
- similarity: Cosine similarity score (0-1)
- match_category: auto_merge (>=0.92), review_required (0.85-0.92), unique (<0.85)

Usage from JavaScript:
  const embeddingString = `[${embeddingArray.join(",")}]`;
  const { data } = await supabase.rpc("find_similar_clauses_v2", {
    p_query_embedding: embeddingString,
    p_similarity_threshold: 0.60,
    p_max_results: 10
  });';

-- ============================================================================
-- Rollback (if needed):
-- ============================================================================
-- DROP FUNCTION IF EXISTS find_similar_clauses_v2(TEXT, FLOAT, INT, UUID, TEXT);
