-- Migration 000: Initial Schema
-- Creates all base tables for ContractBuddy

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pgmq" CASCADE;

-- ============================================================================
-- Tenants
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- User Profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  tenant_id UUID REFERENCES tenants(id),
  email TEXT,
  full_name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- Document Repository
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_repository (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  deal_id UUID,
  object_path TEXT NOT NULL,
  file_name TEXT,
  file_size BIGINT,
  mime_type TEXT,
  status TEXT DEFAULT 'pending',
  extraction_status TEXT,
  embedding_status TEXT,
  matching_status TEXT,
  processing_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- Clause Boundaries
-- ============================================================================
CREATE TABLE IF NOT EXISTS clause_boundaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES document_repository(id) ON DELETE CASCADE,
  clause_type TEXT,
  content TEXT NOT NULL,
  page_number INT,
  bbox_top FLOAT,
  bbox_left FLOAT,
  bbox_width FLOAT,
  bbox_height FLOAT,
  confidence FLOAT,
  section_title TEXT,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clause_boundaries_document ON clause_boundaries(document_id);
CREATE INDEX IF NOT EXISTS idx_clause_boundaries_embedding ON clause_boundaries USING ivfflat (embedding vector_cosine_ops);

-- ============================================================================
-- Legal Clause Library
-- ============================================================================
CREATE TABLE IF NOT EXISTS legal_clause_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_id VARCHAR(50) UNIQUE NOT NULL,
  category TEXT,
  clause_type TEXT,
  standard_text TEXT NOT NULL,
  risk_level TEXT,
  is_required BOOLEAN DEFAULT false,
  tags TEXT[],
  version INT DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lcl_clause_type ON legal_clause_library(clause_type);
CREATE INDEX IF NOT EXISTS idx_lcl_category ON legal_clause_library(category);

-- ============================================================================
-- Clause Match Results
-- ============================================================================
CREATE TABLE IF NOT EXISTS clause_match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES document_repository(id) ON DELETE CASCADE,
  clause_boundary_id UUID REFERENCES clause_boundaries(id) ON DELETE CASCADE,
  matched_template_id VARCHAR(50),
  similarity_score FLOAT,
  rag_risk TEXT,
  rag_parsing TEXT,
  rag_status TEXT,
  discrepancy_count INT DEFAULT 0,
  gpt_analysis JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_results_document ON clause_match_results(document_id);
CREATE INDEX IF NOT EXISTS idx_match_results_clause ON clause_match_results(clause_boundary_id);

-- ============================================================================
-- Discrepancies
-- ============================================================================
CREATE TABLE IF NOT EXISTS discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_result_id UUID REFERENCES clause_match_results(id) ON DELETE CASCADE,
  document_id UUID REFERENCES document_repository(id) ON DELETE CASCADE,
  discrepancy_type TEXT,
  severity TEXT,
  description TEXT,
  affected_text TEXT,
  suggested_action TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discrepancies_document ON discrepancies(document_id);

-- ============================================================================
-- Pre-Agreed Terms
-- ============================================================================
CREATE TABLE IF NOT EXISTS pre_agreed_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  tenant_id UUID REFERENCES tenants(id),
  term_category TEXT NOT NULL,
  term_description TEXT NOT NULL,
  expected_value TEXT,
  is_mandatory BOOLEAN DEFAULT false,
  related_clause_types TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pre_agreed_terms_deal ON pre_agreed_terms(deal_id);

-- ============================================================================
-- Admin Review Queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES document_repository(id) ON DELETE CASCADE,
  clause_boundary_id UUID REFERENCES clause_boundaries(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  confidence_score FLOAT,
  issue_description TEXT,
  original_text TEXT,
  metadata JSONB DEFAULT '{}',
  flagged_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  resolution_action TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status ON admin_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_review_queue_priority ON admin_review_queue(priority);
CREATE INDEX IF NOT EXISTS idx_review_queue_document ON admin_review_queue(document_id);

-- ============================================================================
-- Redlines
-- ============================================================================
CREATE TABLE IF NOT EXISTS redlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES document_repository(id) ON DELETE CASCADE,
  clause_boundary_id UUID REFERENCES clause_boundaries(id) ON DELETE CASCADE,
  redline_type TEXT NOT NULL,
  original_text TEXT,
  suggested_text TEXT,
  reason TEXT,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redlines_document ON redlines(document_id);

-- ============================================================================
-- Comments
-- ============================================================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES document_repository(id) ON DELETE CASCADE,
  clause_boundary_id UUID REFERENCES clause_boundaries(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_document ON comments(document_id);
CREATE INDEX IF NOT EXISTS idx_comments_clause ON comments(clause_boundary_id);

-- ============================================================================
-- Share Tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES document_repository(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);

-- ============================================================================
-- Initialize PGMQ Queue
-- ============================================================================
SELECT pgmq.create('document_processing_queue');

-- ============================================================================
-- Grant Permissions
-- ============================================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMENT ON TABLE legal_clause_library IS 'Master library of standard legal clauses';
COMMENT ON TABLE admin_review_queue IS 'Queue for admin to review and approve new clauses';
COMMENT ON TABLE clause_match_results IS 'Results of matching contract clauses against library';
