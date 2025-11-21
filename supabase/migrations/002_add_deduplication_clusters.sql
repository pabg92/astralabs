-- Migration: Add deduplication clustering system
-- Date: 2025-11-03
-- Description: Tracks duplicate clause clusters for merging based on vector similarity
--              - similarity ≥0.92: Auto-merge
--              - 0.85 ≤ similarity <0.92: Flag for human review

-- Create deduplication clusters table
CREATE TABLE IF NOT EXISTS clause_deduplication_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id TEXT UNIQUE NOT NULL,                   -- DUP-001, DUP-002, etc.
  primary_clause_id UUID REFERENCES legal_clause_library(id) ON DELETE CASCADE,
  duplicate_clause_ids UUID[] NOT NULL,              -- Array of duplicate LCL IDs
  similarity_scores NUMERIC[] NOT NULL,               -- Cosine similarities (0.85-1.0)
  merge_status TEXT DEFAULT 'pending' CHECK (merge_status IN ('pending', 'merged', 'dismissed')),
  merge_strategy TEXT CHECK (merge_strategy IN ('auto', 'manual', 'review')),
  merged_at TIMESTAMPTZ,
  merged_by UUID REFERENCES user_profiles(id),
  dismissal_reason TEXT,
  tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE clause_deduplication_clusters IS
'Tracks duplicate clause clusters for merging based on vector similarity.
Workflow:
1. During clause extraction, new clauses are checked against existing LCL via vector similarity
2. If similarity ≥0.92: Auto-merge (no human review needed)
3. If 0.85 ≤ similarity <0.92: Create cluster entry for human review
4. If similarity <0.85: Treat as unique (proceed with New Clause Discovery)

merge_status:
- pending: Awaiting review or auto-merge
- merged: Duplicates merged into primary clause
- dismissed: Reviewed and determined to be distinct (not duplicates)';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dedup_merge_status
  ON clause_deduplication_clusters(merge_status, created_at DESC)
  WHERE merge_status = 'pending';

COMMENT ON INDEX idx_dedup_merge_status IS
'Optimizes admin review queue for pending deduplication clusters.';

CREATE INDEX IF NOT EXISTS idx_dedup_tenant
  ON clause_deduplication_clusters(tenant_id, merge_status);

COMMENT ON INDEX idx_dedup_tenant IS
'Multi-tenant isolation for deduplication clusters.';

CREATE INDEX IF NOT EXISTS idx_dedup_primary_clause
  ON clause_deduplication_clusters(primary_clause_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dedup_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dedup_updated_at
  BEFORE UPDATE ON clause_deduplication_clusters
  FOR EACH ROW
  EXECUTE FUNCTION update_dedup_updated_at();

-- Function to generate cluster IDs (DUP-001, DUP-002, etc.)
CREATE OR REPLACE FUNCTION generate_cluster_id()
RETURNS TEXT AS $$
DECLARE
  next_id INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(cluster_id FROM 5) AS INTEGER)), 0) + 1
  INTO next_id
  FROM clause_deduplication_clusters;

  RETURN 'DUP-' || LPAD(next_id::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_cluster_id IS
'Generates sequential cluster IDs (DUP-001, DUP-002, etc.).';

-- View for admin deduplication review queue
CREATE OR REPLACE VIEW v_dedup_review_queue AS
SELECT
  cdc.id,
  cdc.cluster_id,
  lcl_primary.clause_id AS primary_clause_id,
  lcl_primary.clause_type AS primary_clause_type,
  lcl_primary.standard_text AS primary_text,
  cdc.duplicate_clause_ids,
  cdc.similarity_scores,
  -- Calculate average similarity
  (SELECT AVG(score) FROM UNNEST(cdc.similarity_scores) AS score) AS avg_similarity,
  -- Calculate min similarity (weakest link)
  (SELECT MIN(score) FROM UNNEST(cdc.similarity_scores) AS score) AS min_similarity,
  cdc.merge_status,
  cdc.created_at,
  -- Determine review priority based on similarity spread
  CASE
    WHEN (SELECT MAX(score) - MIN(score) FROM UNNEST(cdc.similarity_scores) AS score) > 0.05 THEN 'high'
    WHEN (SELECT AVG(score) FROM UNNEST(cdc.similarity_scores) AS score) < 0.88 THEN 'medium'
    ELSE 'low'
  END AS review_priority
FROM clause_deduplication_clusters cdc
JOIN legal_clause_library lcl_primary ON cdc.primary_clause_id = lcl_primary.id
WHERE cdc.merge_status = 'pending'
ORDER BY
  CASE
    WHEN (SELECT MAX(score) - MIN(score) FROM UNNEST(cdc.similarity_scores) AS score) > 0.05 THEN 1
    WHEN (SELECT AVG(score) FROM UNNEST(cdc.similarity_scores) AS score) < 0.88 THEN 2
    ELSE 3
  END,
  cdc.created_at ASC;

COMMENT ON VIEW v_dedup_review_queue IS
'Admin dashboard view for deduplication review queue.
Shows pending clusters with priority scoring based on similarity patterns.
High priority: Large similarity spread (may not be true duplicates)
Medium priority: Low average similarity (borderline cases)
Low priority: High, consistent similarity (likely true duplicates)';

-- Function to auto-merge high-confidence duplicates (≥0.92)
CREATE OR REPLACE FUNCTION auto_merge_duplicates()
RETURNS TABLE (
  cluster_id TEXT,
  primary_clause_id UUID,
  merged_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH high_confidence_clusters AS (
    SELECT
      cdc.id,
      cdc.cluster_id,
      cdc.primary_clause_id,
      cdc.duplicate_clause_ids,
      (SELECT MIN(score) FROM UNNEST(cdc.similarity_scores) AS score) AS min_similarity
    FROM clause_deduplication_clusters cdc
    WHERE
      cdc.merge_status = 'pending'
      AND (SELECT MIN(score) FROM UNNEST(cdc.similarity_scores) AS score) >= 0.92
  ),
  merged_clusters AS (
    UPDATE clause_deduplication_clusters
    SET
      merge_status = 'merged',
      merge_strategy = 'auto',
      merged_at = now()
    WHERE id IN (SELECT id FROM high_confidence_clusters)
    RETURNING id, cluster_id, primary_clause_id, duplicate_clause_ids
  ),
  deactivated_duplicates AS (
    UPDATE legal_clause_library
    SET active = false
    WHERE id = ANY(
      SELECT UNNEST(duplicate_clause_ids) FROM merged_clusters
    )
  )
  SELECT
    mc.cluster_id,
    mc.primary_clause_id,
    ARRAY_LENGTH(mc.duplicate_clause_ids, 1) AS merged_count
  FROM merged_clusters mc;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_merge_duplicates IS
'Auto-merges duplicate clusters with minimum similarity ≥0.92.
Deactivates duplicate clauses and updates cluster status to "merged".
Returns list of merged clusters for logging/audit trail.';
