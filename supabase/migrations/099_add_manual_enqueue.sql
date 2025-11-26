-- Add manual enqueue function for testing/recovery
CREATE OR REPLACE FUNCTION manual_enqueue_document(p_document_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc RECORD;
  v_msg_id BIGINT;
BEGIN
  -- Get document details
  SELECT id, tenant_id, object_path, processing_status
  INTO v_doc
  FROM document_repository
  WHERE id = p_document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found: %', p_document_id;
  END IF;

  -- Enqueue to PGMQ
  SELECT pgmq.send(
    'document_processing_queue',
    jsonb_build_object(
      'document_id', v_doc.id,
      'tenant_id', v_doc.tenant_id,
      'object_path', v_doc.object_path,
      'processing_type', 'full',
      'enqueued_at', now()
    )
  ) INTO v_msg_id;

  RETURN v_msg_id;
END;
$$;

COMMENT ON FUNCTION manual_enqueue_document IS
'Manually enqueue a document for processing (for testing/recovery)';
