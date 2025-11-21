-- Migration 007: Auto-Flag Low Confidence Clauses
-- Automatically flags clauses with low similarity/confidence for admin review
-- Created: 2025-11-08

-- Create function to auto-flag low confidence clauses
CREATE OR REPLACE FUNCTION auto_flag_low_confidence()
RETURNS TRIGGER AS $$
DECLARE
  v_priority TEXT;
  v_issue_desc TEXT;
BEGIN
  -- Determine priority based on severity
  IF NEW.similarity_score < 0.5 OR NEW.confidence < 0.5 THEN
    v_priority := 'critical';
    v_issue_desc := 'Critical: Similarity/confidence below 50%';
  ELSIF NEW.similarity_score < 0.6 OR NEW.confidence < 0.6 THEN
    v_priority := 'high';
    v_issue_desc := 'High: Similarity/confidence below 60%';
  ELSIF NEW.similarity_score < 0.7 OR NEW.confidence < 0.7 THEN
    v_priority := 'medium';
    v_issue_desc := 'Medium: Similarity/confidence below 70%';
  ELSE
    -- Above threshold, no flag needed
    RETURN NEW;
  END IF;

  -- Insert into admin review queue
  INSERT INTO admin_review_queue (
    document_id,
    clause_boundary_id,
    review_type,
    confidence_score,
    status,
    priority,
    issue_description,
    original_text,
    metadata,
    flagged_at
  ) VALUES (
    NEW.document_id,
    NEW.clause_boundary_id,
    'low_confidence',
    COALESCE(NEW.similarity_score, NEW.confidence),
    'pending',
    v_priority,
    v_issue_desc,
    (SELECT content FROM clause_boundaries WHERE id = NEW.clause_boundary_id),
    jsonb_build_object(
      'similarity_score', NEW.similarity_score,
      'confidence', NEW.confidence,
      'rag_status', NEW.rag_status,
      'auto_flagged', true
    ),
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_flag_low_confidence() IS
  'Automatically flags clause_match_results with similarity/confidence < 0.7 for admin review.
   Thresholds: <0.5 = critical, <0.6 = high, <0.7 = medium priority.';

-- Create trigger on clause_match_results
CREATE TRIGGER trg_auto_flag_low_confidence
  AFTER INSERT OR UPDATE OF similarity_score ON clause_match_results
  FOR EACH ROW
  EXECUTE FUNCTION auto_flag_low_confidence();

-- Also flag low parsing quality from clause_boundaries
CREATE OR REPLACE FUNCTION auto_flag_low_parsing_quality()
RETURNS TRIGGER AS $$
BEGIN
  -- Flag if parsing quality < 0.7
  IF NEW.parsing_quality IS NOT NULL AND NEW.parsing_quality < 0.7 THEN
    INSERT INTO admin_review_queue (
      document_id,
      clause_boundary_id,
      review_type,
      confidence_score,
      status,
      priority,
      issue_description,
      original_text,
      metadata,
      flagged_at
    ) VALUES (
      NEW.document_id,
      NEW.id,
      'low_confidence',
      NEW.parsing_quality,
      'pending',
      CASE
        WHEN NEW.parsing_quality < 0.5 THEN 'critical'
        WHEN NEW.parsing_quality < 0.6 THEN 'high'
        ELSE 'medium'
      END,
      'Low parsing quality detected during extraction',
      NEW.content,
      jsonb_build_object(
        'parsing_quality', NEW.parsing_quality,
        'parsing_issues', NEW.parsing_issues,
        'clause_type', NEW.clause_type,
        'auto_flagged', true
      ),
      NOW()
    )
    -- Avoid duplicates if already flagged
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_flag_low_parsing_quality
  AFTER INSERT OR UPDATE OF parsing_quality ON clause_boundaries
  FOR EACH ROW
  EXECUTE FUNCTION auto_flag_low_parsing_quality();

-- Add index for admin review queue queries (skip if exists)
CREATE INDEX IF NOT EXISTS idx_admin_review_queue_status_priority
  ON admin_review_queue(status, priority)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_admin_review_queue_review_type
  ON admin_review_queue(review_type);

CREATE INDEX IF NOT EXISTS idx_admin_review_queue_flagged_at
  ON admin_review_queue(flagged_at DESC);
