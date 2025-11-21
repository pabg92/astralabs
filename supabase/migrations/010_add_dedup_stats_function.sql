-- Migration 010: Deduplication Statistics Function
-- Created: 2025-11-16
-- Purpose: RPC function for admin dashboard to get dedup cluster statistics

-- Create RPC function for dedup statistics
CREATE OR REPLACE FUNCTION get_dedup_stats()
RETURNS TABLE (
  total_clusters BIGINT,
  high_priority BIGINT,
  medium_priority BIGINT,
  low_priority BIGINT,
  pending_review BIGINT,
  auto_merged BIGINT,
  reviewed_separate BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_clusters,
    COUNT(*) FILTER (WHERE review_priority = 'high')::BIGINT as high_priority,
    COUNT(*) FILTER (WHERE review_priority = 'medium')::BIGINT as medium_priority,
    COUNT(*) FILTER (WHERE review_priority = 'low')::BIGINT as low_priority,
    COUNT(*) FILTER (WHERE merge_status = 'pending')::BIGINT as pending_review,
    COUNT(*) FILTER (WHERE merge_status = 'auto_merged')::BIGINT as auto_merged,
    COUNT(*) FILTER (WHERE merge_status = 'reviewed_separate')::BIGINT as reviewed_separate
  FROM v_dedup_review_queue;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION get_dedup_stats() IS 'Returns summary statistics for duplicate clause clusters by priority and status';
