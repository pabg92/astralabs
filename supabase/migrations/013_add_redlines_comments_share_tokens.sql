-- Migration: Add redlines, comments, and share tokens for clause collaboration
-- Per-clause comments table
CREATE TABLE clause_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_boundary_id UUID NOT NULL REFERENCES clause_boundaries(id) ON DELETE CASCADE,
  author_id UUID REFERENCES user_profiles(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-clause redlines/suggestions
CREATE TYPE redline_change_type AS ENUM ('add','delete','modify');
CREATE TYPE redline_status AS ENUM ('draft','resolved');

CREATE TABLE clause_redlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_boundary_id UUID NOT NULL REFERENCES clause_boundaries(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_id UUID REFERENCES user_profiles(id),
  change_type redline_change_type NOT NULL,
  proposed_text TEXT NOT NULL,
  status redline_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Shareable read-only tokens (for branded share page)
CREATE TABLE share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  document_id UUID REFERENCES document_repository(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  allowed_actions JSONB DEFAULT '["view"]'::jsonb,
  branding JSONB DEFAULT '{}'::jsonb, -- e.g., { "logo_url": "...", "brand_color": "#123456", "footer_text": "..." }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_clause_comments_clause ON clause_comments(clause_boundary_id);
CREATE INDEX idx_clause_redlines_clause ON clause_redlines(clause_boundary_id);
CREATE INDEX idx_share_tokens_deal_expires ON share_tokens(deal_id, expires_at) WHERE revoked_at IS NULL;
