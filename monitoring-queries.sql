-- ContractBuddy Monitoring & Observability Queries
-- Phase 10: Testing, Monitoring & Ops
-- Generated: 2025-11-16

-- =============================================================================
-- SECTION 1: EDGE FUNCTION PERFORMANCE MONITORING
-- =============================================================================

-- Query 1.1: Edge Function Performance Summary (Last 24 Hours)
-- Purpose: Track execution times, success rates, and throughput for all edge functions
SELECT
  stage,
  status,
  COUNT(*) as execution_count,
  ROUND(AVG(execution_time_ms), 2) as avg_execution_ms,
  MIN(execution_time_ms) as min_execution_ms,
  MAX(execution_time_ms) as max_execution_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_time_ms) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time_ms) as p99_ms,
  SUM(clause_count) FILTER (WHERE clause_count IS NOT NULL) as total_clauses_processed
FROM edge_function_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY stage, status
ORDER BY stage, status;

-- Query 1.2: Slowest Edge Function Executions (Last 24 Hours)
-- Purpose: Identify performance bottlenecks
SELECT
  id,
  document_id,
  stage,
  status,
  execution_time_ms,
  clause_count,
  error_message,
  created_at,
  raw_payload->'batch_stats' as batch_details
FROM edge_function_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
AND execution_time_ms > 10000  -- Over 10 seconds
ORDER BY execution_time_ms DESC
LIMIT 20;

-- Query 1.3: Edge Function Error Analysis
-- Purpose: Categorize and count errors by type
SELECT
  stage,
  error_message,
  COUNT(*) as occurrence_count,
  MAX(created_at) as last_occurrence,
  STRING_AGG(DISTINCT document_id::text, ', ') as affected_documents
FROM edge_function_logs
WHERE status = 'error'
AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY stage, error_message
ORDER BY occurrence_count DESC, last_occurrence DESC
LIMIT 50;

-- Query 1.4: Hourly Throughput Trend (Last 7 Days)
-- Purpose: Understand processing patterns and capacity planning
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  stage,
  COUNT(*) as executions,
  SUM(clause_count) FILTER (WHERE clause_count IS NOT NULL) as clauses_processed,
  AVG(execution_time_ms) as avg_duration_ms,
  COUNT(*) FILTER (WHERE status = 'error') as error_count
FROM edge_function_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at), stage
ORDER BY hour DESC, stage;

-- =============================================================================
-- SECTION 2: DOCUMENT PROCESSING PIPELINE MONITORING
-- =============================================================================

-- Query 2.1: Document Processing Status Overview
-- Purpose: Track documents through the processing pipeline
SELECT
  processing_status,
  COUNT(*) as document_count,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as created_last_24h,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as created_last_7d,
  ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600), 2) as avg_age_hours
FROM document_repository
GROUP BY processing_status
ORDER BY document_count DESC;

-- Query 2.2: Stuck Documents (Pending > 1 Hour)
-- Purpose: Identify documents that may need manual intervention
SELECT
  dr.id as document_id,
  dr.deal_id,
  dr.original_filename,
  dr.processing_status,
  dr.error_message,
  dr.created_at,
  ROUND(EXTRACT(EPOCH FROM (NOW() - dr.created_at)) / 60, 2) as age_minutes,
  COUNT(DISTINCT efl.id) as edge_function_calls,
  STRING_AGG(DISTINCT efl.stage || ':' || efl.status, ', ') as execution_history
FROM document_repository dr
LEFT JOIN edge_function_logs efl ON dr.id = efl.document_id
WHERE dr.processing_status IN ('pending', 'processing')
AND dr.created_at < NOW() - INTERVAL '1 hour'
GROUP BY dr.id
ORDER BY dr.created_at
LIMIT 100;

-- Query 2.3: Average Processing Time by Stage
-- Purpose: Measure end-to-end pipeline performance
WITH document_timings AS (
  SELECT
    document_id,
    MAX(created_at) FILTER (WHERE stage = 'extract') as extract_time,
    MAX(created_at) FILTER (WHERE stage = 'embed') as embed_time,
    MAX(created_at) FILTER (WHERE stage = 'match') as match_time,
    MAX(execution_time_ms) FILTER (WHERE stage = 'extract') as extract_duration,
    MAX(execution_time_ms) FILTER (WHERE stage = 'embed') as embed_duration,
    MAX(execution_time_ms) FILTER (WHERE stage = 'match') as match_duration
  FROM edge_function_logs
  WHERE created_at >= NOW() - INTERVAL '7 days'
  AND status = 'success'
  GROUP BY document_id
)
SELECT
  COUNT(*) as completed_documents,
  ROUND(AVG(extract_duration), 2) as avg_extract_ms,
  ROUND(AVG(embed_duration), 2) as avg_embed_ms,
  ROUND(AVG(match_duration), 2) as avg_match_ms,
  ROUND(AVG(extract_duration + COALESCE(embed_duration, 0) + COALESCE(match_duration, 0)), 2) as avg_total_ms,
  ROUND(AVG(EXTRACT(EPOCH FROM (match_time - extract_time)) * 1000), 2) as avg_end_to_end_ms
FROM document_timings
WHERE extract_time IS NOT NULL;

-- Query 2.4: Documents with Missing Stages
-- Purpose: Identify incomplete processing
SELECT
  dr.id as document_id,
  dr.deal_id,
  dr.original_filename,
  dr.processing_status,
  dr.created_at,
  BOOL_OR(efl.stage = 'extract') as has_extract,
  BOOL_OR(efl.stage = 'embed') as has_embed,
  BOOL_OR(efl.stage = 'match') as has_match,
  COUNT(DISTINCT cb.id) as clause_count,
  COUNT(DISTINCT cmr.id) as match_result_count
FROM document_repository dr
LEFT JOIN edge_function_logs efl ON dr.id = efl.document_id AND efl.status = 'success'
LEFT JOIN clause_boundaries cb ON dr.id = cb.document_id
LEFT JOIN clause_match_results cmr ON dr.id = cmr.document_id
WHERE dr.created_at >= NOW() - INTERVAL '7 days'
GROUP BY dr.id
HAVING
  (BOOL_OR(efl.stage = 'extract') = FALSE OR
   BOOL_OR(efl.stage = 'embed') = FALSE OR
   BOOL_OR(efl.stage = 'match') = FALSE)
  AND dr.processing_status != 'failed'
ORDER BY dr.created_at DESC
LIMIT 50;

-- =============================================================================
-- SECTION 3: RECONCILIATION QUALITY METRICS
-- =============================================================================

-- Query 3.1: RAG Status Distribution (Last 30 Days)
-- Purpose: Track reconciliation outcomes and quality trends
SELECT
  DATE_TRUNC('day', cmr.created_at) as day,
  COUNT(*) as total_matches,
  COUNT(*) FILTER (WHERE cmr.rag_status = 'green') as green_count,
  COUNT(*) FILTER (WHERE cmr.rag_status = 'amber') as amber_count,
  COUNT(*) FILTER (WHERE cmr.rag_status = 'red') as red_count,
  COUNT(*) FILTER (WHERE cmr.rag_status = 'blue') as blue_count,
  ROUND(AVG(cmr.similarity_score), 4) as avg_similarity,
  COUNT(*) FILTER (WHERE cmr.similarity_score >= 0.85) as high_confidence_count,
  COUNT(*) FILTER (WHERE cmr.similarity_score < 0.75) as low_confidence_count
FROM clause_match_results cmr
WHERE cmr.created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', cmr.created_at)
ORDER BY day DESC;

-- Query 3.2: Clause Types Performance
-- Purpose: Identify which clause types match well vs poorly
SELECT
  cb.clause_type,
  COUNT(*) as occurrence_count,
  ROUND(AVG(cmr.similarity_score), 4) as avg_similarity,
  ROUND(AVG(cb.confidence), 4) as avg_extraction_confidence,
  COUNT(*) FILTER (WHERE cmr.rag_status = 'green') as green_count,
  COUNT(*) FILTER (WHERE cmr.rag_status = 'amber') as amber_count,
  COUNT(*) FILTER (WHERE cmr.rag_status = 'red') as red_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cmr.rag_status = 'green') / COUNT(*), 2) as green_percentage
FROM clause_boundaries cb
LEFT JOIN clause_match_results cmr ON cb.id = cmr.clause_boundary_id
WHERE cb.created_at >= NOW() - INTERVAL '30 days'
GROUP BY cb.clause_type
HAVING COUNT(*) >= 5  -- At least 5 occurrences
ORDER BY occurrence_count DESC, avg_similarity DESC;

-- Query 3.3: Pre-Agreed Terms Compliance Rate
-- Purpose: Measure how well contracts meet pre-agreed expectations
WITH term_matches AS (
  SELECT
    dr.deal_id,
    pat.term_category,
    pat.is_mandatory,
    BOOL_OR(
      cmr.gpt_analysis->'pre_agreed_comparisons' IS NOT NULL AND
      cmr.gpt_analysis->'pre_agreed_comparisons' @> jsonb_build_array(
        jsonb_build_object('term_id', pat.id)
      )
    ) as has_matching_clause
  FROM document_repository dr
  JOIN pre_agreed_terms pat ON dr.deal_id = pat.deal_id
  LEFT JOIN clause_match_results cmr ON dr.id = cmr.document_id
  WHERE dr.created_at >= NOW() - INTERVAL '30 days'
  AND dr.processing_status = 'completed'
  GROUP BY dr.deal_id, pat.id, pat.term_category, pat.is_mandatory
)
SELECT
  term_category,
  is_mandatory,
  COUNT(*) as total_expectations,
  COUNT(*) FILTER (WHERE has_matching_clause) as matched_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_matching_clause) / COUNT(*), 2) as match_percentage
FROM term_matches
GROUP BY term_category, is_mandatory
ORDER BY is_mandatory DESC, match_percentage ASC;

-- =============================================================================
-- SECTION 4: ERROR & FAILURE TRACKING
-- =============================================================================

-- Query 4.1: Recent Errors with Context (Last 24 Hours)
-- Purpose: Rapid error diagnosis with full context
SELECT
  efl.id,
  efl.document_id,
  dr.original_filename,
  d.title as deal_title,
  efl.stage,
  efl.error_message,
  efl.execution_time_ms,
  efl.created_at,
  efl.raw_payload
FROM edge_function_logs efl
LEFT JOIN document_repository dr ON efl.document_id = dr.id
LEFT JOIN deals d ON dr.deal_id = d.id
WHERE efl.status = 'error'
AND efl.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY efl.created_at DESC
LIMIT 50;

-- Query 4.2: Failure Rate by Hour (Last 7 Days)
-- Purpose: Identify time-based patterns in failures
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  stage,
  COUNT(*) as total_executions,
  COUNT(*) FILTER (WHERE status = 'error') as error_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'error') / COUNT(*), 2) as error_percentage
FROM edge_function_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at), stage
HAVING COUNT(*) > 0
ORDER BY hour DESC, stage;

-- Query 4.3: Admin Review Queue Backlog
-- Purpose: Track items requiring human review
SELECT
  review_type,
  priority,
  status,
  COUNT(*) as queue_count,
  MAX(created_at) as most_recent,
  MIN(created_at) as oldest,
  ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600), 2) as avg_age_hours
FROM admin_review_queue
WHERE status IN ('pending', 'in_review')
GROUP BY review_type, priority, status
ORDER BY
  CASE priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  queue_count DESC;

-- =============================================================================
-- SECTION 5: CAPACITY & RESOURCE PLANNING
-- =============================================================================

-- Query 5.1: Daily Processing Volume (Last 30 Days)
-- Purpose: Understand growth trends and capacity needs
SELECT
  DATE_TRUNC('day', created_at) as day,
  COUNT(DISTINCT dr.id) as documents_processed,
  COUNT(DISTINCT dr.deal_id) as deals_processed,
  SUM(dr.size_bytes) as total_bytes_processed,
  ROUND(SUM(dr.size_bytes) / 1024.0 / 1024.0, 2) as total_mb_processed,
  COUNT(DISTINCT dr.id) FILTER (WHERE dr.processing_status = 'completed') as completed_count,
  COUNT(DISTINCT dr.id) FILTER (WHERE dr.processing_status = 'failed') as failed_count
FROM document_repository dr
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

-- Query 5.2: Cohere API Usage (Embedding Generation)
-- Purpose: Track API consumption and costs
SELECT
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as batch_calls,
  SUM((raw_payload->>'clauses_found')::int) FILTER (WHERE raw_payload->>'clauses_found' IS NOT NULL) as total_clauses,
  SUM((raw_payload->>'embeddings_generated')::int) FILTER (WHERE raw_payload->>'embeddings_generated' IS NOT NULL) as embeddings_generated,
  ROUND(AVG((raw_payload->>'avg_time_per_clause_ms')::numeric), 2) as avg_ms_per_clause,
  SUM(execution_time_ms) as total_execution_ms
FROM edge_function_logs
WHERE stage = 'embed'
AND status = 'success'
AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

-- Query 5.3: OpenAI API Usage (P1 Comparisons)
-- Purpose: Track GPT-4 comparison costs
SELECT
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as reconciliation_calls,
  SUM((raw_payload->>'p1_comparisons_made')::int) FILTER (WHERE raw_payload->>'p1_comparisons_made' IS NOT NULL) as gpt_comparisons,
  SUM((raw_payload->>'clauses_reconciled')::int) FILTER (WHERE raw_payload->>'clauses_reconciled' IS NOT NULL) as clauses_reconciled,
  ROUND(AVG(execution_time_ms), 2) as avg_execution_ms
FROM edge_function_logs
WHERE stage = 'match'
AND status = 'success'
AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

-- Query 5.4: Storage Growth Analysis
-- Purpose: Monitor database and storage growth
SELECT
  'document_repository' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('document_repository'::regclass)) as total_size,
  pg_size_pretty(pg_indexes_size('document_repository'::regclass)) as index_size
UNION ALL
SELECT
  'clause_boundaries',
  COUNT(*),
  pg_size_pretty(pg_total_relation_size('clause_boundaries'::regclass)),
  pg_size_pretty(pg_indexes_size('clause_boundaries'::regclass))
FROM clause_boundaries
UNION ALL
SELECT
  'clause_match_results',
  COUNT(*),
  pg_size_pretty(pg_total_relation_size('clause_match_results'::regclass)),
  pg_size_pretty(pg_indexes_size('clause_match_results'::regclass))
FROM clause_match_results
UNION ALL
SELECT
  'edge_function_logs',
  COUNT(*),
  pg_size_pretty(pg_total_relation_size('edge_function_logs'::regclass)),
  pg_size_pretty(pg_indexes_size('edge_function_logs'::regclass))
FROM edge_function_logs;

-- =============================================================================
-- SECTION 6: HEALTH CHECK QUERIES (For Dashboards)
-- =============================================================================

-- Query 6.1: System Health Summary (Real-time)
-- Purpose: Single query for dashboard overview
SELECT
  (SELECT COUNT(*) FROM document_repository WHERE processing_status = 'pending') as pending_documents,
  (SELECT COUNT(*) FROM document_repository WHERE processing_status = 'processing') as processing_documents,
  (SELECT COUNT(*) FROM admin_review_queue WHERE status = 'pending' AND priority = 'critical') as critical_reviews,
  (SELECT COUNT(*) FROM edge_function_logs WHERE status = 'error' AND created_at >= NOW() - INTERVAL '1 hour') as errors_last_hour,
  (SELECT ROUND(AVG(execution_time_ms), 2) FROM edge_function_logs WHERE created_at >= NOW() - INTERVAL '1 hour') as avg_execution_ms,
  (SELECT COUNT(DISTINCT document_id) FROM edge_function_logs WHERE created_at >= NOW() - INTERVAL '24 hours' AND status = 'success') as documents_processed_24h;

-- Query 6.2: Alert Triggers (For Monitoring Systems)
-- Purpose: Identify conditions requiring immediate attention
SELECT
  'stuck_documents' as alert_type,
  COUNT(*) as count,
  'critical' as severity
FROM document_repository
WHERE processing_status IN ('pending', 'processing')
AND created_at < NOW() - INTERVAL '2 hours'
HAVING COUNT(*) > 0

UNION ALL

SELECT
  'high_error_rate' as alert_type,
  COUNT(*) as count,
  'warning' as severity
FROM edge_function_logs
WHERE status = 'error'
AND created_at >= NOW() - INTERVAL '1 hour'
HAVING COUNT(*) > 10

UNION ALL

SELECT
  'critical_reviews_backlog' as alert_type,
  COUNT(*) as count,
  'high' as severity
FROM admin_review_queue
WHERE status = 'pending'
AND priority = 'critical'
AND created_at < NOW() - INTERVAL '24 hours'
HAVING COUNT(*) > 5

UNION ALL

SELECT
  'slow_processing' as alert_type,
  COUNT(*) as count,
  'warning' as severity
FROM edge_function_logs
WHERE execution_time_ms > 30000  -- Over 30 seconds
AND created_at >= NOW() - INTERVAL '1 hour'
HAVING COUNT(*) > 5;

-- =============================================================================
-- USAGE NOTES
-- =============================================================================

/*
RECOMMENDED MONITORING CADENCE:

1. Real-time (Every 1-5 minutes):
   - Query 6.1: System Health Summary
   - Query 6.2: Alert Triggers

2. Hourly:
   - Query 2.2: Stuck Documents
   - Query 4.1: Recent Errors

3. Daily:
   - Query 1.1: Edge Function Performance Summary
   - Query 2.3: Average Processing Time
   - Query 3.1: RAG Status Distribution
   - Query 4.3: Admin Review Queue Backlog

4. Weekly:
   - Query 3.2: Clause Types Performance
   - Query 5.1: Daily Processing Volume
   - Query 5.4: Storage Growth Analysis

OPTIMIZATION TIPS:

1. Create indexes on frequently queried columns:
   CREATE INDEX IF NOT EXISTS idx_efl_created_at ON edge_function_logs(created_at DESC);
   CREATE INDEX IF NOT EXISTS idx_efl_document_stage ON edge_function_logs(document_id, stage, status);
   CREATE INDEX IF NOT EXISTS idx_dr_status_created ON document_repository(processing_status, created_at);

2. Set up automated log retention:
   DELETE FROM edge_function_logs WHERE created_at < NOW() - INTERVAL '90 days';

3. Use materialized views for expensive aggregations:
   CREATE MATERIALIZED VIEW daily_metrics AS
   SELECT DATE_TRUNC('day', created_at) as day, stage, status, ...
   FROM edge_function_logs
   GROUP BY day, stage, status;
*/
