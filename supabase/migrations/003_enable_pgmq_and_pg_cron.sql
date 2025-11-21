-- Migration: Enable pgmq and pg_cron extensions
-- Date: 2025-11-03
-- Description: Enables required extensions for async document processing and scheduled jobs
--              - pgmq: PostgreSQL message queue for async document processing
--              - pg_cron: Scheduled jobs for weekly deduplication and retraining

-- Enable pgmq (PostgreSQL Message Queue)
CREATE EXTENSION IF NOT EXISTS pgmq CASCADE;

COMMENT ON EXTENSION pgmq IS
'PostgreSQL-based message queue for async document processing.
Used for:
- Document upload → clause extraction pipeline
- Contract reconciliation processing
- Batch clause embedding generation';

-- Enable pg_cron (Scheduled Jobs)
-- Note: pg_cron requires superuser privileges and may need manual enablement via Supabase dashboard
-- If this fails, enable via: Dashboard → Database → Extensions → pg_cron

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron CASCADE;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension requires superuser privileges. Enable via Supabase Dashboard: Database → Extensions → pg_cron';
END $$;

COMMENT ON EXTENSION pg_cron IS
'Scheduled cron jobs for batch processing.
Used for:
- Weekly deduplication review batches (Sunday 2 AM)
- Weekly parsing lessons retraining (Sunday 3 AM)
- Daily clause embedding updates (if needed)';

-- Create document processing queue (using pgmq)
SELECT pgmq.create_queue('document_processing_queue');

COMMENT ON SCHEMA pgmq IS
'Queue: document_processing_queue
Messages format: { document_id, tenant_id, object_path, processing_type }

Processing types:
- clause_extraction: Extract clauses from uploaded contract
- reconciliation: Match clauses against LCL
- embedding_generation: Generate vector embeddings for new clauses';

-- Create trigger to auto-enqueue document uploads
CREATE OR REPLACE FUNCTION enqueue_document_processing()
RETURNS TRIGGER AS $$
BEGIN
  -- Only enqueue if processing_status is 'pending'
  IF NEW.processing_status = 'pending' THEN
    PERFORM pgmq.send(
      'document_processing_queue',
      jsonb_build_object(
        'document_id', NEW.id,
        'tenant_id', NEW.tenant_id,
        'object_path', NEW.object_path,
        'processing_type', 'clause_extraction',
        'enqueued_at', now()
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enqueue_document
  AFTER INSERT ON document_repository
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_document_processing();

COMMENT ON FUNCTION enqueue_document_processing IS
'Auto-enqueues document uploads for async processing.
Triggered on INSERT into document_repository when processing_status = "pending".';

-- Helper function to read from queue (for Edge Functions)
CREATE OR REPLACE FUNCTION dequeue_document_processing(
  batch_size INTEGER DEFAULT 10
)
RETURNS TABLE (
  msg_id BIGINT,
  message JSONB,
  enqueued_at TIMESTAMPTZ,
  vt TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.msg_id,
    m.message,
    m.enqueued_at,
    m.vt
  FROM pgmq.read(
    'document_processing_queue',
    120,  -- 120 second visibility timeout
    batch_size
  ) m;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION dequeue_document_processing IS
'Dequeues documents for processing.
Returns batch of messages with 120-second visibility timeout.
Edge Function should call pgmq.delete(msg_id) after successful processing or pgmq.archive(msg_id) on failure.';

-- Dead letter queue for failed processing
SELECT pgmq.create_queue('document_processing_dlq');

COMMENT ON SCHEMA pgmq IS
'Dead Letter Queue: document_processing_dlq
Failed document processing messages are archived here for manual review.';

-- Schedule weekly deduplication batch (Sunday 2 AM UTC)
DO $$
BEGIN
  PERFORM cron.schedule(
    'weekly-deduplication-batch',
    '0 2 * * 0',  -- Sunday 2 AM
    $$
      SELECT auto_merge_duplicates();
      INSERT INTO admin_review_queue (review_type, priority, status, metadata)
      SELECT
        'deduplication',
        'medium',
        'pending',
        jsonb_build_object('cluster_id', cluster_id, 'batch_date', CURRENT_DATE)
      FROM clause_deduplication_clusters
      WHERE merge_status = 'pending'
        AND (SELECT MIN(score) FROM UNNEST(similarity_scores) AS score) < 0.92;
    $$
  );

  RAISE NOTICE 'Scheduled weekly deduplication batch: Sundays at 2 AM UTC';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule pg_cron job (requires extension). Enable pg_cron via Supabase Dashboard.';
END $$;

-- Schedule weekly parsing lessons retraining (Sunday 3 AM UTC)
DO $$
BEGIN
  PERFORM cron.schedule(
    'weekly-parsing-lessons-batch',
    '0 3 * * 0',  -- Sunday 3 AM
    $$
      -- Aggregate parsing lessons by clause type
      UPDATE legal_clause_standardization lcstx
      SET
        variation_tolerance = subquery.new_tolerance,
        updated_at = now()
      FROM (
        SELECT
          clause_type,
          STRING_AGG(DISTINCT lesson_notes, ' | ') AS new_tolerance
        FROM parsing_lessons
        WHERE applied_to_model = false
          AND created_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY clause_type
      ) AS subquery
      WHERE lcstx.clause_type = subquery.clause_type;

      -- Mark lessons as applied
      UPDATE parsing_lessons
      SET applied_to_model = true, applied_at = now()
      WHERE applied_to_model = false
        AND created_at >= CURRENT_DATE - INTERVAL '7 days';
    $$
  );

  RAISE NOTICE 'Scheduled weekly parsing lessons batch: Sundays at 3 AM UTC';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule pg_cron job (requires extension). Enable pg_cron via Supabase Dashboard.';
END $$;

-- View pg_cron jobs
CREATE OR REPLACE VIEW v_scheduled_jobs AS
SELECT
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job;

COMMENT ON VIEW v_scheduled_jobs IS
'Shows all active pg_cron scheduled jobs.
Check this view to verify weekly batches are scheduled correctly.';
