-- Migration: Add queue helper functions for worker
-- These RPC functions wrap pgmq operations for use from the worker

-- Delete a message from the queue after successful processing
CREATE OR REPLACE FUNCTION delete_queue_message(
  p_queue_name TEXT,
  p_msg_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(p_queue_name, p_msg_id);
END;
$$;

-- Archive a message to the DLQ after failed processing
CREATE OR REPLACE FUNCTION archive_queue_message(
  p_queue_name TEXT,
  p_msg_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.archive(p_queue_name, p_msg_id);
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION delete_queue_message(TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_queue_message(TEXT, BIGINT) TO service_role;

GRANT EXECUTE ON FUNCTION archive_queue_message(TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION archive_queue_message(TEXT, BIGINT) TO service_role;

COMMENT ON FUNCTION delete_queue_message IS 'Delete a message from pgmq queue after successful processing';
COMMENT ON FUNCTION archive_queue_message IS 'Archive a message to DLQ after failed processing';
