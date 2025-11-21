-- Migration 006: Add Version Control & Audit Trail
-- Enables tracking of clause updates with reason codes and change history
-- Created: 2025-11-08

-- Add version tracking to clause_match_results
ALTER TABLE clause_match_results
  ADD COLUMN version INTEGER DEFAULT 1,
  ADD COLUMN updated_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN update_reason TEXT,
  ADD COLUMN previous_rag_status rag_status;

COMMENT ON COLUMN clause_match_results.version IS
  'Version number for this clause match result. Increments on each update.';

COMMENT ON COLUMN clause_match_results.update_reason IS
  'Reason code for status change: user_override, pre_agreed_mismatch, library_updated, risk_accepted, parsing_corrected, ai_reanalysis';

COMMENT ON COLUMN clause_match_results.previous_rag_status IS
  'Previous RAG status before last update. Used for change tracking.';

-- Create audit trail table for clause updates
CREATE TABLE clause_update_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_match_result_id UUID REFERENCES clause_match_results(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  changed_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'status_change',
    'risk_override',
    'manual_review',
    'ai_update',
    'parsing_correction'
  )),
  reason_code TEXT,
  reason_description TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE clause_update_history IS
  'Audit trail for all clause match result changes. Tracks who changed what and why.';

COMMENT ON COLUMN clause_update_history.reason_code IS
  'Standardized reason codes: user_override, pre_agreed_mismatch, library_updated, risk_accepted, parsing_corrected, ai_reanalysis';

-- Create trigger to auto-increment version on update
CREATE OR REPLACE FUNCTION increment_clause_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only increment if RAG status actually changed
  IF (OLD.rag_status IS DISTINCT FROM NEW.rag_status)
     OR (OLD.rag_parsing IS DISTINCT FROM NEW.rag_parsing)
     OR (OLD.rag_risk IS DISTINCT FROM NEW.rag_risk) THEN

    NEW.version := OLD.version + 1;
    NEW.previous_rag_status := OLD.rag_status;
    NEW.updated_at := NOW();

    -- Log to audit trail
    INSERT INTO clause_update_history (
      clause_match_result_id,
      version,
      changed_by,
      change_type,
      reason_code,
      reason_description,
      old_values,
      new_values
    ) VALUES (
      NEW.id,
      NEW.version,
      NEW.updated_by,
      COALESCE(NEW.update_reason, 'manual_review'),
      NEW.update_reason,
      'RAG status updated',
      jsonb_build_object(
        'rag_status', OLD.rag_status,
        'rag_parsing', OLD.rag_parsing,
        'rag_risk', OLD.rag_risk
      ),
      jsonb_build_object(
        'rag_status', NEW.rag_status,
        'rag_parsing', NEW.rag_parsing,
        'rag_risk', NEW.rag_risk
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_clause_version
  BEFORE UPDATE ON clause_match_results
  FOR EACH ROW
  EXECUTE FUNCTION increment_clause_version();

-- Create indexes for audit queries
CREATE INDEX idx_clause_update_history_clause_id
  ON clause_update_history(clause_match_result_id);

CREATE INDEX idx_clause_update_history_changed_by
  ON clause_update_history(changed_by);

CREATE INDEX idx_clause_update_history_created_at
  ON clause_update_history(created_at DESC);
