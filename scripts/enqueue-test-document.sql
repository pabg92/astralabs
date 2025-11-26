-- Quick way to enqueue test document for processing
-- Copy ONLY this query and run it in Supabase SQL Editor

SELECT pgmq.send(
  'document_processing_queue',
  jsonb_build_object(
    'document_id', '05793c06-bf3e-4920-8ee2-40002beaec2d',
    'tenant_id', '00000000-0000-0000-0000-000000000001',
    'object_path', '00000000-0000-0000-0000-000000000001/d3358f40-cfd6-416f-883e-c3ac61401031/C36.pdf',
    'processing_type', 'full',
    'enqueued_at', now()
  )
);
