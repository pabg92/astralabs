-- Batch update RPC for clause_match_results
-- Issue #12: Convert sequential DB updates to batch operations for performance
--
-- Security Note: Worker uses service_role key which bypasses RLS.
-- This function assumes it's called from a trusted backend context.

CREATE OR REPLACE FUNCTION batch_update_clause_match_results(updates jsonb)
RETURNS TABLE(updated_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  update_count int := 0;
BEGIN
  -- Update clause_match_results in batch
  -- Each update element should have: id, rag_parsing, rag_status, gpt_analysis, discrepancy_count
  UPDATE clause_match_results cmr
  SET
    rag_parsing = COALESCE((u->>'rag_parsing')::text, cmr.rag_parsing),
    rag_status = COALESCE((u->>'rag_status')::text, cmr.rag_status),
    gpt_analysis = COALESCE((u->'gpt_analysis')::jsonb, cmr.gpt_analysis),
    discrepancy_count = COALESCE((u->>'discrepancy_count')::int, cmr.discrepancy_count),
    updated_at = now()
  FROM jsonb_array_elements(updates) AS u
  WHERE cmr.id = (u->>'id')::uuid;

  GET DIAGNOSTICS update_count = ROW_COUNT;

  RETURN QUERY SELECT update_count;
END;
$$;

-- Grant execute to service role (worker runs with service_role key)
GRANT EXECUTE ON FUNCTION batch_update_clause_match_results(jsonb) TO service_role;

COMMENT ON FUNCTION batch_update_clause_match_results IS 'Batch update clause_match_results for P1 reconciliation. Reduces N DB round-trips to 1.';
