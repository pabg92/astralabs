-- Migration 009: Edge Function Execution Logs
-- Created: 2025-11-16
-- Purpose: Persistent logging for edge function executions (extract, embed, match stages)

-- Create edge_function_logs table
CREATE TABLE IF NOT EXISTS edge_function_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES document_repository(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('extract', 'embed', 'match')),
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'fallback')),
  clause_count INTEGER,
  raw_payload JSONB,
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_document_id ON edge_function_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_created_at ON edge_function_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_stage_status ON edge_function_logs(stage, status);

-- Add comments
COMMENT ON TABLE edge_function_logs IS 'Permanent log of edge function executions for debugging and auditing';
COMMENT ON COLUMN edge_function_logs.stage IS 'Pipeline stage: extract (clause extraction), embed (embeddings generation), match (reconciliation)';
COMMENT ON COLUMN edge_function_logs.status IS 'Execution outcome: success (normal), error (failed), fallback (used default/fallback behavior)';
COMMENT ON COLUMN edge_function_logs.raw_payload IS 'Full payload for debugging: OpenAI response, error details, etc.';
