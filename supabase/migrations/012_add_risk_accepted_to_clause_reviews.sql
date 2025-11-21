-- Migration 012: Add risk_accepted field to clause_reviews
-- Date: November 21, 2025
-- Purpose: Enable persisting reviewer risk acceptance decisions

-- Add risk_accepted column to clause_reviews
ALTER TABLE clause_reviews
ADD COLUMN IF NOT EXISTS risk_accepted BOOLEAN DEFAULT false;

-- Note: reviewer_id already exists in table, but ensure it's UUID type
-- ALTER TABLE clause_reviews
-- ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id);

-- Add approved_at timestamp for tracking when approval occurred
ALTER TABLE clause_reviews
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Add tenant_id for multi-tenant isolation
ALTER TABLE clause_reviews
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Add index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_clause_reviews_tenant
ON clause_reviews(tenant_id);

-- Add index for querying risk-accepted clauses
CREATE INDEX IF NOT EXISTS idx_clause_reviews_risk_accepted
ON clause_reviews(document_id, risk_accepted)
WHERE risk_accepted = true;

-- Add index for querying by decision
CREATE INDEX IF NOT EXISTS idx_clause_reviews_decision
ON clause_reviews(document_id, decision);

COMMENT ON COLUMN clause_reviews.risk_accepted IS 'User explicitly accepted the risk for this clause';
COMMENT ON COLUMN clause_reviews.approved_at IS 'Timestamp when the clause was approved/reviewed';

-- Add unique constraint for upsert operations (one review per clause per document)
ALTER TABLE clause_reviews
ADD CONSTRAINT clause_reviews_document_clause_unique
UNIQUE (document_id, clause_boundary_id);

COMMENT ON COLUMN clause_reviews.tenant_id IS 'Tenant isolation - must match deals tenant_id';

-- TODO: Add RLS policy when auth is fully integrated:
-- ALTER TABLE clause_reviews ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can only access their tenant reviews"
--   ON clause_reviews FOR ALL
--   USING (tenant_id = (SELECT tenant_id FROM user_profiles WHERE clerk_user_id = auth.uid()));
