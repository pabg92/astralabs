-- Fix existing admin_review_queue items missing original_text
-- This populates original_text from the clause_boundaries table

UPDATE admin_review_queue arq
SET original_text = cb.content
FROM clause_boundaries cb
WHERE arq.metadata->>'clause_boundary_id' = cb.id::text
  AND arq.original_text IS NULL
  AND cb.content IS NOT NULL;

-- Verify update
SELECT
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE original_text IS NOT NULL) as with_text,
  COUNT(*) FILTER (WHERE original_text IS NULL) as without_text
FROM admin_review_queue
WHERE status = 'pending';
